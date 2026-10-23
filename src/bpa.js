// Parser and scoring for jeffhuang.com's rawBpa.txt (data/rawBpa.txt).
//
// Format:
//   conf, Conference Name             <- conference line (no indent)
//    2021, url, Paper Title           <- paper line (1-space indent)
//     Author Name, Affiliation        <- author line (2-space indent)

import { decodeEntities } from './names.js';

// Returns [{conf, year, title, authors: [{name, affiliation}]}] ordered as the
// original pipeline processed them: conferences sorted, years descending, papers in
// file order. A repeated conference or title replaces the earlier entry, as before.
export function parseRawBpa(text) {
    const data = new Map();
    let conf = null;
    let year = null;
    let title = null;
    for (const raw of text.split(/\r?\n/)) {
        if (raw.trim() === '') continue;
        if (raw.startsWith('  ')) {
            data.get(conf).get(year).get(title).push(raw.trim());
        } else if (raw.startsWith(' ')) {
            const line = raw.trim();
            const first = line.indexOf(', ');
            const second = line.indexOf(', ', first + 2);
            year = line.slice(0, first);
            title = line.slice(second + 2);
            const years = data.get(conf);
            if (!years.has(year)) years.set(year, new Map());
            years.get(year).set(title, []);
        } else {
            conf = raw.trim().split(', ')[0];
            data.set(conf, new Map());
        }
    }

    const papers = [];
    for (const c of [...data.keys()].sort()) {
        const years = data.get(c);
        for (const y of [...years.keys()].sort().reverse()) {
            for (const [t, authorLines] of years.get(y)) {
                const authors = authorLines.map(line => {
                    const i = line.indexOf(', ');
                    return i === -1
                        ? { name: line, affiliation: '' }
                        : { name: line.slice(0, i), affiliation: line.slice(i + 2) };
                });
                papers.push({ conf: c, year: y, title: decodeEntities(t), authors });
            }
        }
    }
    return papers;
}

// Credit for the author at 1-based position `pos` of `n` authors.
export function authorCredit(creditSystem, pos, n) {
    switch (creditSystem) {
        case 0: return 1;
        case 1: return 1 / n;
        case 2: return 1 / pos;
        default: {
            let harmonic = 0;
            for (let i = 0; i < n; i++) harmonic += 1 / (i + 1);
            return 1 / pos / harmonic;
        }
    }
}
