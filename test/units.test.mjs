import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, parseCSVObjects, toCSV } from '../src/csv.js';
import { cleanName, createResolver, slugify } from '../src/names.js';
import { parseRawBpa, authorCredit } from '../src/bpa.js';
import { aggregateCsrankings } from '../src/csrankings-snapshot.js';
import { pageRank } from '../src/pagerank.js';
import { createSuggester } from '../src/suggest.js';

test('CSV round-trips quotes, commas and newlines', () => {
    const rows = [['a', 'b,c', 'say "hi"', 'two\nlines', ' padded ']];
    assert.deepEqual(parseCSV(toCSV(rows)), rows);
    assert.deepEqual(parseCSV('﻿x,y\r\n1,2\r\n'), [['x', 'y'], ['1', '2']]);
    assert.deepEqual(parseCSVObjects('x,y\n1,2\n\n'), [{ x: '1', y: '2' }]);
});

test('cleanName decodes entities and normalizes whitespace', () => {
    assert.equal(cleanName('  Universit&eacute;   de Montr&#233;al \n'), 'Université de Montréal');
    assert.equal(cleanName('Texas A&amp;M'), 'Texas A&M');
});

test('resolver: aliases, canonical names win, unmatched names are kept and counted', () => {
    const r = createResolver([
        { alias: 'MIT', canonical: 'Massachusetts Institute of Technology' },
        { alias: 'ETH Zürich', canonical: 'ETH Zurich' },
        { alias: 'Swiss Federal Institute of Technology', canonical: 'ETH Zürich' },
    ]);
    assert.equal(r.resolve('MIT'), 'Massachusetts Institute of Technology');
    // ETH Zürich is a canonical name, so it is not renamed even though it is also an alias
    assert.equal(r.resolve('ETH Zürich'), 'ETH Zürich');
    assert.equal(r.resolve('Nowhere University', 'test'), 'Nowhere University');
    assert.equal(r.resolve('Nowhere University', 'test'), 'Nowhere University');
    assert.equal(r.unmatched.get('test').get('Nowhere University'), 2);
});

test('slugify matches the old static page file names', () => {
    assert.equal(slugify('Montana State University - Bozeman'), 'montana-state-university--bozeman');
    assert.equal(slugify('University of California, Davis'), 'university-of-california,-davis');
});

test('rawBpa parser: ordering, repeated titles and entity decoding', () => {
    const text = [
        'zconf, Z Conf',
        ' 2019, , Old Paper',
        '  Ann, MIT',
        'aconf, A Conf',
        ' 2020, http://x, Caf&eacute; Paper',
        '  Bob, Stanford University',
        '  Cy, University of California, Berkeley',
        ' 2021, , Newer',
        '  Dee, CMU',
    ].join('\n');
    const papers = parseRawBpa(text);
    assert.deepEqual(papers.map(p => `${p.conf} ${p.year} ${p.title}`), ['aconf 2021 Newer', 'aconf 2020 Café Paper', 'zconf 2019 Old Paper']);
    assert.deepEqual(papers[1].authors[1], { name: 'Cy', affiliation: 'University of California, Berkeley' });
});

test('author credit systems', () => {
    assert.equal(authorCredit(0, 2, 3), 1);
    assert.equal(authorCredit(1, 2, 4), 0.25);
    assert.equal(authorCredit(2, 4, 4), 0.25);
    const credits = [1, 2, 3].map(pos => authorCredit(3, pos, 3));
    assert.ok(Math.abs(credits.reduce((a, b) => a + b) - 1) < 1e-12);
    assert.ok(credits[0] > credits[1] && credits[1] > credits[2]);
});

test('csrankings snapshot sums per school, conference and year', () => {
    const upstream = '"name","dept","area","count","adjustedcount","year"\n'
        + 'A,Uni X,icml,1.0,0.5,2020\nB,Uni X,icml,1.0,0.25,2020\nC,Uni X,icml,1.0,1,1999\nD,Uni Y,cvpr,1.0,1,2021\n';
    assert.equal(aggregateCsrankings(upstream, 2000), 'school,conf,year,adjcount\nUni X,icml,2020,0.75\nUni Y,cvpr,2021,1\n');
});

test('PageRank sums to 1 and favors the school everyone links to', () => {
    const scores = pageRank([['A', 'Hub'], ['B', 'Hub'], ['C', 'Hub'], ['Hub', 'A']]);
    const total = [...scores.values()].reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
    assert.equal([...scores].sort((a, b) => b[1] - a[1])[0][0], 'Hub');
});

test('suggestions expand abbreviations', () => {
    const suggest = createSuggester(['California Institute of Technology', 'University of California, Berkeley']);
    assert.equal(suggest('California Inst. of Technology')[0].name, 'California Institute of Technology');
});
