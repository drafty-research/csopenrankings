// Integrity checks for the committed files in data/. These run on every data update
// (see .github/workflows/test.yml), so a bad prof_data.csv, rawBpa.txt, csrankings.csv
// or aliases.csv fails before it reaches the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DATA_FILES, PROF_COLUMNS, buildModel } from '../src/model.js';
import { universe, computeRankings, ALL_SOURCES } from '../src/rank.js';
import { parseCSV, parseCSVObjects } from '../src/csv.js';
import { cleanName } from '../src/names.js';

const read = file => readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8');
const sources = Object.fromEntries(Object.entries(DATA_FILES)
    .map(([key, file]) => [key, file.endsWith('.json') ? JSON.parse(read(file)) : read(file)]));
const model = buildModel(sources);
const ranked = universe(model, 'both');

test('data files load without structural issues', () => {
    assert.deepEqual(model.issues, []);
});

test('prof_data.csv has the expected columns', () => {
    const [header] = parseCSV(sources.prof);
    for (const column of PROF_COLUMNS) assert.ok(header.includes(column), `missing column ${column}`);
});

test('every U.S. News and Maclean\'s school resolves to a canonical name', () => {
    for (const source of ['usnews', 'macleans']) {
        const unmatched = [...(model.resolver.unmatched.get(source)?.keys() ?? [])];
        assert.deepEqual(unmatched, [], `${source} names missing from aliases.csv`);
    }
    assert.equal(ranked.size, Object.keys(model.usnews).length + Object.keys(model.macleans).length,
        'a school is in both U.S. News and Maclean\'s, or two names resolved to the same school');
});

test('U.S. News area rankings only name U.S. News schools', () => {
    for (const [area, ranks] of Object.entries(model.usnewsAreas)) {
        for (const school of Object.keys(ranks)) assert.ok(school in model.usnews, `${area}: ${school}`);
    }
});

test('aliases.csv rows are complete and unique', () => {
    const rows = parseCSVObjects(sources.aliases);
    const seen = new Map();
    for (const r of rows) {
        assert.ok(cleanName(r.alias) && cleanName(r.canonical), `empty field in row ${JSON.stringify(r)}`);
        const key = cleanName(r.alias);
        assert.ok(!seen.has(key) || seen.get(key) === cleanName(r.canonical),
            `"${r.alias}" maps to both "${seen.get(key)}" and "${r.canonical}"`);
        seen.set(key, cleanName(r.canonical));
    }
});

test('aliases.csv has no chains (a canonical name that is itself an alias of another name)', () => {
    // Lookups are single-step, so a chain would silently stop at the middle name.
    const { map } = model.resolver;
    const chains = [...map]
        .filter(([alias, canon]) => alias !== canon && map.has(canon) && map.get(canon) !== canon)
        .map(([alias, canon]) => `${alias} -> ${canon} -> ${map.get(canon)}`);
    assert.deepEqual(chains, []);
});

test('aliases for the old temp_uni_name_fix patches are present', () => {
    const { resolve } = model.resolver;
    assert.equal(resolve('University of California at Santa Cruz'), 'University of California, Santa Cruz');
    assert.equal(resolve('UNC - Charlotte'), 'University of North Carolina at Charlotte');
    assert.equal(resolve('Rutgers, The State University of New Jersey--Newark'), 'Rutgers University-Newark');
});

test('most ranked schools have csrankings.org data', () => {
    // A sudden drop usually means csrankings.org renamed schools (e.g. "Inst." for "Institute").
    const covered = [...ranked].filter(s => s in model.csrankings).length;
    assert.ok(covered / ranked.size > 0.85, `only ${covered} of ${ranked.size} ranked schools have csrankings.org data`);
    for (const school of ['California Institute of Technology', 'Massachusetts Institute of Technology', 'University of Toronto']) {
        assert.ok(school in model.csrankings, `${school} has no csrankings.org data`);
    }
});

test('the default ranking has every source and a sensible top 10', () => {
    const r = computeRankings(model, { sources: ALL_SOURCES, areas: ['ai', 'sys', 'thr', 'int'], subfields: [], country: 'both' });
    for (const source of ALL_SOURCES) assert.ok(r[source], `${source} missing from the default ranking`);
    const top10 = r.sum.slice(0, 10).map(([school]) => school);
    for (const school of ['Carnegie Mellon University', 'Massachusetts Institute of Technology', 'Stanford University']) {
        assert.ok(top10.includes(school), `${school} not in the top 10: ${top10.join(', ')}`);
    }
});

test('config.json settings are usable', () => {
    const { csrankings, pagerank, bestPaper, maintenance } = model.config;
    assert.ok(Number.isInteger(csrankings.minYear));
    assert.ok(csrankings.minYear >= maintenance.csrankingsSnapshotFloorYear,
        'csrankings.minYear is earlier than the years kept in csrankings.csv');
    assert.ok(pagerank.damping > 0 && pagerank.damping < 1);
    assert.ok([0, 1, 2, 3].includes(bestPaper.creditSystem));
});
