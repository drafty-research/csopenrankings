// Fuzzy name suggestions for the maintenance page. The site itself never uses these;
// accepted suggestions become rows in data/aliases.csv.

const EXPANSIONS = [
    [/\buniv\b\.?/g, 'university'],
    [/\binst\b\.?/g, 'institute'],
    [/\btech\b\.?/g, 'technology'],
    [/\bnat'?l\b\.?/g, 'national'],
    [/\bst\b\.?/g, 'saint'],
    [/&/g, ' and '],
];
const DROP = new Set(['the', 'of', 'at', 'and', 'in', 'usa', 'us']);

export function matchKey(name) {
    let s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const [re, rep] of EXPANSIONS) s = s.replace(re, rep);
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
}

const tokens = key => new Set(key.split(' ').filter(t => t && !DROP.has(t)));

function bigrams(key) {
    const s = key.replace(/ /g, '');
    const out = new Map();
    for (let i = 0; i < s.length - 1; i++) {
        const g = s.slice(i, i + 2);
        out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
}

function dice(a, b) {
    let overlap = 0;
    let total = 0;
    for (const [g, n] of a) {
        overlap += Math.min(n, b.get(g) ?? 0);
        total += n;
    }
    for (const n of b.values()) total += n;
    return total ? (2 * overlap) / total : 0;
}

// Returns suggest(name, limit) -> [{name, score}] ranked by similarity (0..1).
export function createSuggester(candidates) {
    const index = [...candidates].map(name => {
        const key = matchKey(name);
        return { name, key, tokens: tokens(key), bigrams: bigrams(key) };
    });
    return function suggest(name, limit = 3) {
        const key = matchKey(name);
        const t = tokens(key);
        const b = bigrams(key);
        const scored = [];
        for (const c of index) {
            if (c.key === key) {
                scored.push({ name: c.name, score: 1 });
                continue;
            }
            let shared = 0;
            for (const tok of t) if (c.tokens.has(tok)) shared++;
            if (shared === 0) continue;
            const tokenScore = (2 * shared) / (t.size + c.tokens.size);
            scored.push({ name: c.name, score: 0.6 * tokenScore + 0.4 * dice(b, c.bigrams) });
        }
        scored.sort((x, y) => y.score - x.score);
        return scored.slice(0, limit);
    };
}
