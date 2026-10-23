// Aggregates csrankings.org's generated-author-info.csv (about 18 MB) into
// data/csrankings.csv: one row per school, conference and year with the summed
// adjusted count. Year and conference filters are applied later, at load time,
// using data/config.json, so this file keeps every year from `floorYear` on.

import { parseCSV, toCSV } from './csv.js';

export function aggregateCsrankings(text, floorYear) {
    const [header, ...rows] = parseCSV(text);
    const col = name => {
        const i = header.indexOf(name);
        if (i === -1) throw new Error(`generated-author-info.csv has no "${name}" column`);
        return i;
    };
    const iDept = col('dept'), iArea = col('area'), iYear = col('year'), iAdj = col('adjustedcount');
    const totals = new Map();
    for (const r of rows) {
        if (r.length < header.length) continue;
        const year = parseInt(r[iYear], 10);
        if (!(year >= floorYear)) continue;
        const key = `${r[iDept]}\u0000${r[iArea]}\u0000${year}`;
        totals.set(key, (totals.get(key) ?? 0) + parseFloat(r[iAdj]));
    }
    const out = [...totals].map(([key, total]) => [...key.split('\u0000'), Math.round(total * 1e5) / 1e5]);
    out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] - b[2]));
    return toCSV([['school', 'conf', 'year', 'adjcount'], ...out]);
}
