// Logic parity: the new rank.js, fed the legacy site's data (fixtures/legacy-model.json),
// must reproduce the legacy outputs in golden/. Both were captured from the Python +
// vanilla JS site (frontend/final_ranking_generator.js) just before the rewrite, by
// running its genFinalRankings / genFinalPageRank in node for each case.
//
// Intended differences from the legacy code, which these tests check explicitly:
//  - 'usa' / 'canada' views rank only that country's schools, so ranks have no gaps
//    (legacy counted hidden schools when numbering, and left them in the totals).
//  - Schools with no data in any selected source have a null total, sorted last
//    (legacy produced NaN, which sorts unpredictably). Totals are compared as maps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { computeRankings, placementRankings, areaRanks } from '../src/rank.js';
import { buildTaxonomy } from '../src/model.js';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const legacy = JSON.parse(read('./fixtures/legacy-model.json'));
const model = {
    ...legacy,
    config: JSON.parse(read('../data/config.json')),
    taxonomy: buildTaxonomy(JSON.parse(read('../data/taxonomy.json'))),
};
const golden = Object.fromEntries(readdirSync(new URL('./golden/', import.meta.url))
    .map(f => [f.replace('.json', ''), JSON.parse(read(`./golden/${f}`))]));

const totals = sum => Object.fromEntries(sum.map(([school, total]) => [school, total ?? null]));
const sources = out => Object.keys(out).filter(k => k !== 'sum' && k !== 'count').sort();

for (const [name, { case: c, output }] of Object.entries(golden)) {
    if (c.kind !== 'final' || c.country !== 'both') continue;
    test(`rankings match legacy: ${name}`, () => {
        const actual = computeRankings(model, { sources: c.srcs, areas: c.areas, subfields: c.subfields, country: c.country });
        assert.deepEqual(sources(actual), sources(output));
        for (const source of sources(output)) assert.deepEqual(actual[source], output[source], source);
        assert.deepEqual(totals(actual.sum), totals(output.sum));
    });
}

for (const [name, { case: c, output }] of Object.entries(golden)) {
    if (c.kind !== 'final' || c.country === 'both') continue;
    test(`country view keeps legacy order without gaps: ${name}`, () => {
        const actual = computeRankings(model, { sources: c.srcs, areas: c.areas, subfields: c.subfields, country: c.country });
        const canadian = school => school in model.macleans;
        const keep = c.country === 'canada' ? canadian : s => !canadian(s);
        for (const [school] of actual.sum) assert.ok(keep(school), `${school} should not be in the ${c.country} view`);
        for (const source of sources(actual)) {
            const ranks = actual[source];
            // same relative order as legacy
            const legacyOrder = Object.keys(output[source]).filter(keep).sort((a, b) => output[source][a] - output[source][b]);
            const newOrder = Object.keys(ranks).sort((a, b) => ranks[a] - ranks[b]);
            if (!(source === 'usnews' && c.country === 'canada')) {
                for (let i = 1; i < newOrder.length; i++) {
                    const [a, b] = [newOrder[i - 1], newOrder[i]];
                    assert.ok(output[source][a] <= output[source][b], `${source}: ${a} before ${b}`);
                }
                assert.deepEqual(new Set(newOrder), new Set(legacyOrder), source);
            }
            // ranks start at 1 with no gaps beyond ties
            const sorted = Object.values(ranks).sort((a, b) => a - b);
            assert.equal(sorted[0], 1, source);
            sorted.forEach((r, i) => assert.ok(r <= i + 1, `${source} rank ${r} at position ${i + 1}`));
        }
    });
}

for (const [name, { case: c, output }] of Object.entries(golden)) {
    if (c.kind !== 'pagerank') continue;
    test(`placement rank matches legacy: ${name}`, () => {
        const actual = placementRankings(model, c.areas, c.subfields);
        for (const key of ['rank', 'score', 'doct score', 'bach score', 'sum']) assert.deepEqual(actual[key], output[key], key);
    });
}

test('rank by area matches legacy', () => {
    // Legacy gave schools with no data in an area (NaN total) arbitrary ranks; they are null now.
    const expected = golden['area-rank-footer'].output;
    const actual = areaRanks(model, 'both');
    let compared = 0;
    for (const [school, ranks] of Object.entries(expected)) {
        for (const [area, rank] of Object.entries(ranks)) {
            if (actual[school][area] === null) continue;
            assert.equal(actual[school][area], rank, `${school} ${area}`);
            compared++;
        }
    }
    assert.ok(compared > 800, `compared ${compared} area ranks`);
});
