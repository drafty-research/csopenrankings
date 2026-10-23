// University name normalization against data/aliases.csv.
// Lookup is exact after cleanName(); there is no fuzzy matching at runtime.

// HTML named entities that occur in names and titles (accented letters, punctuation).
const ENTITIES = Object.fromEntries((
    'AElig:198,Aacute:193,Acirc:194,Agrave:192,Aring:197,Atilde:195,Auml:196,Ccedil:199,ETH:208,Eacute:201,' +
    'Ecirc:202,Egrave:200,Euml:203,Iacute:205,Icirc:206,Igrave:204,Iuml:207,Ntilde:209,OElig:338,Oacute:211,' +
    'Ocirc:212,Ograve:210,Oslash:216,Otilde:213,Ouml:214,Scaron:352,THORN:222,Uacute:218,Ucirc:219,Ugrave:217,' +
    'Uuml:220,Yacute:221,Yuml:376,aacute:225,acirc:226,aelig:230,agrave:224,aring:229,atilde:227,auml:228,' +
    'ccedil:231,eacute:233,ecirc:234,egrave:232,eth:240,euml:235,iacute:237,icirc:238,igrave:236,iuml:239,' +
    'ntilde:241,oacute:243,ocirc:244,oelig:339,ograve:242,oslash:248,otilde:245,ouml:246,scaron:353,szlig:223,' +
    'thorn:254,uacute:250,ucirc:251,ugrave:249,uuml:252,yacute:253,yuml:255,' +
    'amp:38,lt:60,gt:62,quot:34,apos:39,nbsp:160,ndash:8211,mdash:8212,lsquo:8216,rsquo:8217,ldquo:8220,' +
    'rdquo:8221,hellip:8230,middot:183,times:215'
).split(',').map(pair => pair.split(':')).map(([name, code]) => [name, String.fromCodePoint(Number(code))]));

export function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z0-9]+);/gi, (m, code) => {
        if (code[0] === '#') {
            const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) ? String.fromCodePoint(n) : m;
        }
        return ENTITIES[code] ?? m;
    });
}

export function cleanName(name) {
    return decodeEntities(String(name ?? '')).normalize('NFC').replace(/\s+/g, ' ').trim();
}

// Builds a resolver from alias rows ({alias, canonical, source}).
// resolve(name) returns the canonical name, or the cleaned input when unmatched.
// A name that appears in the canonical column is never renamed, even if it is also
// listed as an alias, so canonical names stay stable across sources.
// Unmatched names are counted per source label so the maintenance page can list them.
export function createResolver(aliasRows) {
    const map = new Map();
    for (const row of aliasRows) {
        const alias = cleanName(row.alias);
        const canonical = cleanName(row.canonical);
        if (alias && canonical && !map.has(alias)) map.set(alias, canonical);
    }
    const canonicals = new Set(map.values());
    const unmatched = new Map();

    function resolve(name, source = 'unknown') {
        const key = cleanName(name);
        if (!key) return '';
        if (canonicals.has(key)) return key;
        const hit = map.get(key);
        if (hit !== undefined) return hit;
        if (!unmatched.has(source)) unmatched.set(source, new Map());
        const bySource = unmatched.get(source);
        bySource.set(key, (bySource.get(key) ?? 0) + 1);
        return key;
    }

    return { resolve, map, canonicals, unmatched };
}

// Slug scheme of the original static university pages (frontend/university/<slug>.html).
export function slugify(name) {
    return name.toLowerCase().replaceAll(' ', '-').replaceAll('--', '-');
}
