// Ranking logic, ported from frontend/final_ranking_generator.js.
// All functions are pure: they take the model from model.js and a selection.
//
// selection = {
//   sources:   subset of ['csrankings', 'usnews', 'bpa', 'pagerank'],
//   areas:     subset of ['ai', 'thr', 'sys', 'int'],
//   subfields: subfield codes checked in the UI,
//   country:   'both' | 'usa' | 'canada',
// }

import { pageRank } from './pagerank.js';

export const ALL_SOURCES = ['csrankings', 'usnews', 'bpa', 'pagerank'];
const ALL_AREAS = ['ai', 'sys', 'thr', 'int'];

// Schools that can appear in the rankings: U.S. News (USA) plus Maclean's (Canada).
export function universe(model, country = 'both') {
    const us = Object.keys(model.usnews).filter(u => !(u in model.macleans));
    const ca = Object.keys(model.macleans);
    if (country === 'usa') return new Set(us);
    if (country === 'canada') return new Set(ca);
    return new Set([...Object.keys(model.usnews), ...ca]);
}

export function isCanadian(model, school) {
    return school in model.macleans;
}

// Subfields scored for a selection: every subfield of each selected area, plus any
// individually selected subfields.
export function selectedSubfields(model, areas, subfields) {
    const out = [];
    for (const area of areas) out.push(...model.taxonomy.areaSubfields[area]);
    for (const s of subfields) if (!out.includes(s)) out.push(s);
    return out;
}

// Geometric mean of (adjusted count + 1) over the selected subfields, as on csrankings.org.
function csrankingsScores(model, subfields) {
    const scores = {};
    if (subfields.length === 0) return scores;
    for (const [school, bySubfield] of Object.entries(model.csrankings)) {
        let product = 1;
        for (const s of subfields) if (s in bySubfield) product *= bySubfield[s] + 1;
        scores[school] = Math.round(product ** (1 / subfields.length) * 10) / 10;
    }
    return scores;
}

function bestPaperScores(model, areas, subfields) {
    const scores = {};
    for (const [school, , area, subfield, credit] of model.bestPaper) {
        if (areas.includes(area) || subfields.includes(subfield)) scores[school] = (scores[school] ?? 0) + credit;
    }
    return scores;
}

// U.S. News is only defined for: all four areas (overall score, Canadian schools get
// Maclean's later), or any mix of AI/Systems/Theory (sum of per-area ranks).
// Returns {scores, lowerIsBetter} or null when undefined for this selection.
function usnewsScores(model, areas, subfields) {
    const sa = model.taxonomy.subfieldArea;
    if (subfields.some(s => !areas.includes(sa[s]))) return null;
    if (areas.length === 4) {
        const scores = { ...model.usnews };
        for (const school of Object.keys(model.macleans)) scores[school] = 0;
        return { scores, lowerIsBetter: false };
    }
    if (areas.includes('int')) return null;
    const ranks = ['ai', 'sys', 'thr'].filter(a => areas.includes(a)).map(a => model.usnewsAreas[a]);
    if (ranks.length === 0) return null;
    const missing = model.config.usnews.missingAreaRank;
    const scores = { ...ranks[0] };
    for (const rank of ranks.slice(1)) {
        for (const school of Object.keys(scores)) scores[school] += rank[school] ?? missing;
    }
    return { scores, lowerIsBetter: true };
}

function pageRankScores(model, areas, subfields, useDoctorate = true, useBachelors = true) {
    const { draftyLabels, subfieldArea } = model.taxonomy;
    const rows = model.placementRows.filter(p => {
        const code = draftyLabels[p.subfieldLabel];
        return subfields.includes(code) || areas.includes(subfieldArea[code]);
    });
    const edges = [];
    for (const p of rows) {
        if (useDoctorate) edges.push([p.university, p.doctorate]);
        if (useBachelors) edges.push([p.university, p.bachelors]);
    }
    return pageRank(edges, model.config.pagerank);
}

// Groups schools with equal scores: [[score, [schools]], ...] best first.
function groupByScore(scores, schools, lowerIsBetter) {
    const groups = new Map();
    for (const [school, score] of Object.entries(scores)) {
        if (!schools.has(school)) continue;
        const value = Number(score);
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value).push(school);
    }
    const list = [...groups];
    list.sort(lowerIsBetter ? (a, b) => a[0] - b[0] : (a, b) => b[0] - a[0]);
    return list;
}

// PageRank never groups ties: each school is its own entry, in graph order.
function listByPageRank(scores, schools) {
    const list = [];
    for (const [school, score] of scores) if (schools.has(school)) list.push([score, [school]]);
    list.sort((a, b) => b[0] - a[0]);
    return list;
}

// Per-source ranked lists for a selection (scores grouped, best first).
export function sourceRankings(model, { sources, areas, subfields }, schools) {
    const subs = selectedSubfields(model, areas, subfields);
    const lists = {};
    if (sources.includes('csrankings')) {
        lists.csrankings = groupByScore(csrankingsScores(model, subs), schools, false);
    }
    if (sources.includes('bpa')) {
        const scores = bestPaperScores(model, areas, subs);
        if (Object.keys(scores).length > 0) lists.bpa = groupByScore(scores, schools, false);
    }
    if (sources.includes('usnews')) {
        const us = usnewsScores(model, areas, subfields);
        if (us) lists.usnews = groupByScore(us.scores, schools, us.lowerIsBetter);
    }
    if (sources.includes('pagerank')) {
        lists.pagerank = listByPageRank(pageRankScores(model, areas, subfields), schools);
    }
    for (const key of Object.keys(lists)) if (lists[key].length === 0) delete lists[key];
    return lists;
}

// Borda-style meta ranking: each school's total is the sum of its rank in every
// selected source; a school missing from a source gets that source's last place + 1.
// Returns {[source]: {school: rank}, sum: [[school, total|null], ...] sorted, count}.
export function computeRankings(model, selection) {
    const country = selection.country ?? 'both';
    const schools = universe(model, country);
    const lists = sourceRankings(model, selection, schools);
    const result = {};
    const totals = new Map();
    const lastPlace = {};
    for (const [source, list] of Object.entries(lists)) {
        result[source] = {};
        let rank = 1;
        for (const [, group] of list) {
            for (const school of group) {
                result[source][school] = rank;
                totals.set(school, (totals.get(school) ?? 0) + rank);
            }
            rank += group.length;
        }
        lastPlace[source] = rank;
    }
    for (const school of schools) {
        // Schools with no data in any selected source have no total.
        if (!totals.has(school)) {
            totals.set(school, null);
            continue;
        }
        for (const source of Object.keys(lists)) {
            if (!(school in result[source])) totals.set(school, totals.get(school) + lastPlace[source]);
        }
    }
    // Canadian schools have no U.S. News score; with all areas selected they take their
    // Maclean's rank in the U.S. News column instead.
    if (result.usnews && selection.areas.length === 4 && country !== 'usa') {
        for (const [school, rank] of Object.entries(model.macleans)) {
            if (!(school in result.usnews) || totals.get(school) === null) continue;
            totals.set(school, totals.get(school) + rank - result.usnews[school]);
            result.usnews[school] = rank;
        }
    }
    const sum = [...totals];
    sum.sort((a, b) => (a[1] === null) - (b[1] === null) || a[1] - b[1]);
    result.sum = sum;
    result.count = model.deptSize;
    return result;
}

// Display rank for a sorted total list: ties share a rank, the next rank skips ahead.
export function tieRanks(sum) {
    const out = [];
    let rank = 0;
    let prev;
    sum.forEach(([school, total], i) => {
        if (i === 0 || total !== prev) rank = i + 1;
        prev = total;
        out.push([school, rank, total]);
    });
    return out;
}

// Rank of every school within each area (all four sources), for the detail panel.
export function areaRanks(model, country = 'both') {
    const out = {};
    for (const area of ALL_AREAS) {
        const { sum } = computeRankings(model, { sources: ALL_SOURCES, areas: [area], subfields: [], country });
        for (const [school, rank, total] of tieRanks(sum)) (out[school] ??= {})[area] = total === null ? null : rank;
    }
    return out;
}

// Placement rank page: PageRank over bachelors + doctorate, and each one alone.
export function placementRankings(model, areas = ALL_AREAS, subfields = []) {
    const schools = universe(model, 'both');
    const order = scores => listByPageRank(scores, schools).map(([score, [school]]) => [school, score]);
    const combined = order(pageRankScores(model, areas, subfields));
    const doct = order(pageRankScores(model, areas, subfields, true, false));
    const bach = order(pageRankScores(model, areas, subfields, false, true));
    const rankOf = list => Object.fromEntries(list.map(([school], i) => [school, i + 1]));
    return {
        rank: rankOf(combined),
        score: Object.fromEntries(combined.map(([school, score]) => [school, roundTo(1000 * score, 2)])),
        'doct score': rankOf(doct),
        'bach score': rankOf(bach),
        count: model.deptSize,
        sum: combined.map(([school], i) => [school, i + 1]),
    };
}

// Best paper credit per subfield for one school, top 5.
export function bestPaperBySubfield(model, school, areas, subfields) {
    const totals = {};
    for (const [affiliation, , area, subfield, credit] of model.bestPaper) {
        if (affiliation === school && (areas.includes(area) || subfields.includes(subfield))) {
            totals[subfield] = (totals[subfield] ?? 0) + credit;
        }
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

export function bestPaperTitles(model, school, limit = 4) {
    return Object.values(model.bestPaperTitles[school] ?? {}).flat().slice(0, limit);
}

export function roundTo(num, decimals) {
    return (Math.round(num * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
}
