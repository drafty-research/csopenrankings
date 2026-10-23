// Minimal RFC 4180 CSV reader/writer (quoted fields, embedded commas/newlines, "" escapes).

export function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

// Parse a CSV with a header row into objects keyed by column name.
export function parseCSVObjects(text) {
    const [header, ...rows] = parseCSV(text);
    return rows
        .filter(r => r.length > 1 || r[0] !== '')
        .map(r => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

function quote(value) {
    const s = String(value ?? '');
    return /[",\n\r]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows) {
    return rows.map(r => r.map(quote).join(',')).join('\n') + '\n';
}
