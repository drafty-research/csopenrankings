// Builds the in-memory data model from the files in data/.
// buildModel() is pure (text in, objects out) so it runs in the browser and in node tests.

import { parseCSVObjects } from './csv.js';
import { createResolver } from './names.js';
import { parseRawBpa, authorCredit } from './bpa.js';

export const DATA_FILES = {
    config: 'config.json',
    taxonomy: 'taxonomy.json',
    aliases: 'aliases.csv',
    prof: 'prof_data.csv',
    rawBpa: 'rawBpa.txt',
    csrankings: 'csrankings.csv',
    usnews: 'usnews.csv',
    usnews_ai: 'usnews_ai.csv',
    usnews_sys: 'usnews_sys.csv',
    usnews_thr: 'usnews_thr.csv',
    macleans: 'macleans.csv',
};

export const PROF_COLUMNS = ['FullName', 'University', 'JoinYear', 'SubField', 'Bachelors', 'Doctorate'];

export async function fetchSources(baseUrl = './data/') {
    const entries = await Promise.all(Object.entries(DATA_FILES).map(async ([key, file]) => {
        const res = await fetch(baseUrl + file);
        if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`);
        return [key, file.endsWith('.json') ? await res.json() : await res.text()];
    }));
    return Object.fromEntries(entries);
}

export async function loadModel(baseUrl) {
    return buildModel(await fetchSources(baseUrl));
}

export function buildTaxonomy(tax) {
    const subfieldArea = { ...tax.extraSubfieldAreas };
    const subfieldLabel = { ...tax.extraSubfieldLabels };
    const areaSubfields = {};
    for (const area of tax.areas) {
        areaSubfields[area.code] = area.rankingOrder;
        for (const s of area.subfields) {
            subfieldArea[s.code] = area.code;
            subfieldLabel[s.code] = s.label;
        }
    }
    return {
        areas: tax.areas,
        areaCodes: tax.areas.map(a => a.code),
        areaLabel: Object.fromEntries(tax.areas.map(a => [a.code, a.label])),
        areaSubfields,
        subfieldArea,
        subfieldLabel,
        draftyLabels: tax.draftyLabels,
        csrankingsConfs: tax.csrankingsConfs,
        bestPaperConfs: tax.bestPaperConfs,
    };
}

export function buildModel(src) {
    const config = src.config;
    const taxonomy = buildTaxonomy(src.taxonomy);
    const resolver = createResolver(parseCSVObjects(src.aliases));
    const { resolve } = resolver;
    const issues = [];

    // --- U.S. News (overall score, and per-area rank) and Maclean's -------------------
    const usnews = {};
    for (const row of parseCSVObjects(src.usnews)) {
        usnews[resolve(row.University, 'usnews')] = parseFloat(row.Value);
    }
    const usnewsAreas = {};
    for (const area of ['ai', 'sys', 'thr']) {
        usnewsAreas[area] = {};
        for (const row of parseCSVObjects(src[`usnews_${area}`])) {
            usnewsAreas[area][resolve(row.University, 'usnews')] = parseInt(row.Ranking, 10);
        }
    }
    const macleans = {};
    for (const row of parseCSVObjects(src.macleans)) {
        macleans[resolve(row.school, 'macleans')] = parseInt(row['program reputation'], 10);
    }

    // --- Professors (prof_data.csv from Drafty) ----------------------------------------
    const profRows = parseCSVObjects(src.prof);
    const header = Object.keys(profRows[0] ?? {});
    const missing = PROF_COLUMNS.filter(c => !header.includes(c));
    if (missing.length) issues.push(`prof_data.csv is missing columns: ${missing.join(', ')}`);
    const profs = profRows.map(r => ({
        name: r.FullName.trim(),
        university: r.University.trim() && resolve(r.University, 'prof_data University'),
        joinYear: r.JoinYear.trim(),
        subfieldLabel: r.SubField.trim(),
        subfield: taxonomy.draftyLabels[r.SubField.trim()] ?? null,
        bachelors: r.Bachelors.trim() && resolve(r.Bachelors, 'prof_data Bachelors'),
        doctorate: r.Doctorate.trim() && resolve(r.Doctorate, 'prof_data Doctorate'),
    }));
    // Department size and the professor/alumni lists only count complete rows.
    const complete = profs.filter(p => p.name && p.university && p.joinYear && p.subfieldLabel && p.bachelors && p.doctorate);
    const deptSize = {};
    for (const p of complete) deptSize[p.university] = (deptSize[p.university] ?? 0) + 1;
    const profsBySchool = {};
    const alumniBySchool = {};
    for (const p of complete) {
        if (!p.subfield) continue;
        (profsBySchool[p.university] ??= {})[p.name] = p;
        (alumniBySchool[p.doctorate] ??= {})[p.name] = p;
    }
    // PageRank edges need current, bachelors and doctorate institutions plus a subfield.
    const placementRows = profs.filter(p => p.university && p.bachelors && p.doctorate && p.subfieldLabel);
    const unknownSubfields = [...new Set(profs.map(p => p.subfieldLabel).filter(l => l && !(l in taxonomy.draftyLabels)))];
    if (unknownSubfields.length) issues.push(`prof_data.csv has SubField values not in taxonomy.json: ${unknownSubfields.join(', ')}`);

    // --- csrankings.org snapshot ----------------------------------------------------------
    const exclude = new Set(config.csrankings.excludeConfs);
    const unknownConfs = new Set();
    const csrankings = {};
    for (const row of parseCSVObjects(src.csrankings)) {
        if (parseInt(row.year, 10) < config.csrankings.minYear || exclude.has(row.conf)) continue;
        const subfield = taxonomy.csrankingsConfs[row.conf];
        if (!subfield) {
            unknownConfs.add(row.conf);
            continue;
        }
        const school = resolve(row.school, 'csrankings');
        const scores = (csrankings[school] ??= {});
        scores[subfield] = (scores[subfield] ?? 0) + parseFloat(row.adjcount);
    }
    if (unknownConfs.size) issues.push(`csrankings.csv has conferences not in taxonomy.json: ${[...unknownConfs].join(', ')}`);

    // --- Best paper awards ----------------------------------------------------------------
    const noAffiliation = new Set(config.bestPaper.noAffiliation);
    const bestPaper = [];          // [affiliation, author, area, subfield, credit]
    const bestPaperTitles = {};    // affiliation -> subfield -> [titles]
    const papers = parseRawBpa(src.rawBpa);
    const skippedConfs = new Set();
    for (const paper of papers) {
        const subfield = taxonomy.bestPaperConfs[paper.conf];
        const area = taxonomy.subfieldArea[subfield];
        if (!area) {
            skippedConfs.add(paper.conf);
            continue;
        }
        paper.authors.forEach((author, i) => {
            const affiliation = noAffiliation.has(author.affiliation.trim())
                ? 'No Affiliation'
                : resolve(author.affiliation, 'rawBpa');
            const credit = authorCredit(config.bestPaper.creditSystem, i + 1, paper.authors.length);
            bestPaper.push([affiliation, author.name, area, subfield, credit]);
            const titles = ((bestPaperTitles[affiliation] ??= {})[subfield] ??= []);
            if (!titles.includes(paper.title)) titles.push(paper.title);
        });
    }
    if (skippedConfs.size) issues.push(`rawBpa.txt conferences without a ranked subfield (skipped): ${[...skippedConfs].join(', ')}`);

    return {
        config,
        taxonomy,
        resolver,
        issues,
        usnews,
        usnewsAreas,
        macleans,
        profs,
        deptSize,
        profsBySchool,
        alumniBySchool,
        placementRows,
        csrankings,
        bestPaper,
        bestPaperTitles,
        papers,
    };
}
