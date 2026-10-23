// Data maintenance page (maintain.html). Everything runs in the browser; results are
// offered as downloads to commit to data/.

import { fetchSources, buildModel } from '../model.js';
import { universe } from '../rank.js';
import { parseCSVObjects, toCSV } from '../csv.js';
import { cleanName } from '../names.js';
import { createSuggester } from '../suggest.js';
import { aggregateCsrankings } from '../csrankings-snapshot.js';
import { esc } from './common.js';

const $ = id => document.getElementById(id);
let sources;           // committed files, possibly with replacements
const replaced = {};   // key -> description of the replacement
const choices = new Map();  // unmatched name -> chosen canonical
let model;

function download(filename, text, type = 'text/csv') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function rebuild() {
    model = buildModel(sources);
    $('replaced').textContent = Object.keys(replaced).length
        ? `Report uses: ${Object.values(replaced).join('; ')}. Commit the new file(s) to data/ when they look right.`
        : '';
    renderSummary();
    renderCoverage();
    renderUnmatched();
    renderAliasChecks();
    $('config').textContent = JSON.stringify(model.config, null, 2);
}

function renderSummary() {
    const ranked = universe(model, 'both');
    const complete = Object.values(model.deptSize).reduce((a, b) => a + b, 0);
    const issues = model.issues.length
        ? `<ul>${model.issues.map(i => `<li class="notice notice-error">${esc(i)}</li>`).join('')}</ul>`
        : '<p>No structural problems found.</p>';
    $('summary').innerHTML = `
      <ul>
        <li>${ranked.size} ranked schools (${Object.keys(model.usnews).length} from U.S. News, ${Object.keys(model.macleans).length} from Maclean's)</li>
        <li>${model.profs.length} professors in prof_data.csv; ${complete} complete rows count toward department size; ${model.placementRows.length} used for placement rank</li>
        <li>${model.papers.length} best papers, ${model.bestPaper.length} author credits</li>
        <li>csrankings.org: ${Object.keys(model.csrankings).length} schools with publications from ${model.config.csrankings.minYear} on</li>
        <li>${model.resolver.map.size} aliases mapping to ${model.resolver.canonicals.size} canonical names</li>
      </ul>
      ${issues}`;
}

function renderCoverage() {
    const schools = [...universe(model, 'both')].sort();
    const noCsr = schools.filter(s => !(s in model.csrankings));
    const noProfs = schools.filter(s => !(s in model.deptSize));
    const list = names => `<ul class="uni-index">${names.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
    $('coverage').innerHTML = `
      <p><strong>${noCsr.length}</strong> ranked schools have no csrankings.org publications from ${model.config.csrankings.minYear} on. Check this list after refreshing csrankings.csv: a well-known school appearing here means csrankings.org changed how it spells the name.</p>
      ${noCsr.length ? list(noCsr) : ''}
      <details>
        <summary>${noProfs.length} ranked schools have no complete professor rows in prof_data.csv</summary>
        <p class="muted">These get no department size and no professor list. This is usually missing Drafty coverage rather than a naming problem; check against Drafty's University column if a school you expect is here.</p>
        ${list(noProfs)}
      </details>`;
}

function unmatchedNames() {
    const merged = new Map();
    for (const [source, names] of model.resolver.unmatched) {
        for (const [name, count] of names) {
            const entry = merged.get(name) ?? { name, count: 0, sources: new Set() };
            entry.count += count;
            entry.sources.add(source);
            merged.set(name, entry);
        }
    }
    return [...merged.values()];
}

function renderUnmatched() {
    const ranked = universe(model, 'both');
    const suggest = createSuggester(model.resolver.canonicals);
    const onlyRanked = $('only-ranked').checked;
    const rows = unmatchedNames().map(entry => {
        const suggestions = suggest(entry.name, 3);
        // only a close match to a ranked school is worth reviewing first
        return { ...entry, suggestions, rankedHit: suggestions.some(s => ranked.has(s.name) && s.score >= 0.6) };
    }).filter(r => !onlyRanked || r.rankedHit)
        .sort((a, b) => b.rankedHit - a.rankedHit || b.count - a.count || a.name.localeCompare(b.name));

    if (rows.length === 0) {
        $('unmatched').innerHTML = '<p>No unmatched names.</p>';
        return;
    }
    $('unmatched').innerHTML = `
      <p class="muted">${rows.length} names.</p>
      <table class="maint-table">
        <tr><th>name in source</th><th>uses</th><th>where</th><th>canonical name to use</th></tr>
        ${rows.map((r, i) => `
          <tr>
            <td>${esc(r.name)}</td>
            <td>${r.count}</td>
            <td>${esc([...r.sources].join(', '))}</td>
            <td>
              <input type="text" list="sugg-${i}" data-name="${esc(r.name)}" value="${esc(choices.get(r.name) ?? '')}" placeholder="leave empty to keep unmatched">
              <datalist id="sugg-${i}">${r.suggestions.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
              <div class="muted">${r.suggestions.map(s => `<a href="#" data-pick="${esc(s.name)}" class="${ranked.has(s.name) ? 'ranked' : ''}">${esc(s.name)}</a> (${s.score.toFixed(2)}${ranked.has(s.name) ? ', ranked' : ''})`).join(' · ') || 'no suggestion'}</div>
            </td>
          </tr>`).join('')}
      </table>`;
    updateChoiceCount();
}

function updateChoiceCount() {
    const n = [...choices.values()].filter(Boolean).length;
    $('choice-count').textContent = n ? `${n} new alias${n === 1 ? '' : 'es'} chosen` : 'no aliases chosen yet';
}

function renderAliasChecks() {
    const rows = parseCSVObjects(sources.aliases);
    const { map } = model.resolver;
    const seen = new Map();
    const duplicates = [];
    for (const r of rows) {
        const key = cleanName(r.alias);
        if (seen.has(key) && seen.get(key) !== cleanName(r.canonical)) duplicates.push([r.alias, seen.get(key), r.canonical]);
        seen.set(key, cleanName(r.canonical));
    }
    const chains = [...map].filter(([alias, canon]) => map.has(canon) && map.get(canon) !== canon && alias !== canon)
        .map(([alias, canon]) => [alias, canon, map.get(canon)]);
    const ranked = universe(model, 'both');
    const rankedAliases = [...map].filter(([alias, canon]) => ranked.has(canon) && alias !== canon).length;
    $('alias-checks').innerHTML = `
      <ul>
        <li>${rows.length} rows; ${rankedAliases} aliases point at ranked schools.</li>
        <li>${duplicates.length} aliases listed more than once with different canonical names (the first row wins).</li>
        <li>${chains.length} chains: the canonical name is itself listed as an alias of another name. The first mapping is used and the chain is not followed; decide which name is right and update the rows.</li>
      </ul>
      ${duplicates.length ? `<table class="maint-table"><tr><th>alias</th><th>first row says</th><th>later row says</th></tr>${duplicates.map(d => `<tr>${d.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</table>` : ''}
      ${chains.length ? `<table class="maint-table"><tr><th>alias</th><th>maps to</th><th>which is also an alias of</th></tr>${chains.map(c => `<tr>${c.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</table>` : ''}`;
}

function downloadAliases() {
    const rows = parseCSVObjects(sources.aliases);
    const existing = new Set(rows.map(r => cleanName(r.alias)));
    const sourceOf = new Map(unmatchedNames().map(e => [e.name, [...e.sources][0]]));
    for (const [alias, canonical] of choices) {
        if (!canonical || existing.has(alias)) continue;
        rows.push({ alias, canonical, source: (sourceOf.get(alias) ?? 'manual').split(' ')[0] });
    }
    rows.sort((a, b) => a.alias.toLowerCase().localeCompare(b.alias.toLowerCase()) || (a.alias < b.alias ? -1 : 1));
    download('aliases.csv', toCSV([['alias', 'canonical', 'source'], ...rows.map(r => [r.alias, r.canonical, r.source])]));
}

async function useCsrankingsUpstream(text, label) {
    $('csr-download').textContent = 'Aggregating…';
    await new Promise(r => setTimeout(r, 0));
    const snapshot = aggregateCsrankings(text, model.config.maintenance.csrankingsSnapshotFloorYear);
    sources.csrankings = snapshot;
    replaced.csrankings = `csrankings.csv built from ${label}`;
    $('csr-download').innerHTML = '';
    const btn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'download the new csrankings.csv' });
    btn.addEventListener('click', () => download('csrankings.csv', snapshot));
    $('csr-download').append(btn, Object.assign(document.createElement('span'), {
        className: 'muted',
        textContent: ` ${snapshot.split('\n').length - 2} rows from ${model.config.maintenance.csrankingsSnapshotFloorYear} on. Commit it as data/csrankings.csv.`,
    }));
    rebuild();
}

function wireEvents() {
    const readFile = input => input.files[0]?.text();
    $('file-prof').addEventListener('change', async e => {
        sources.prof = await readFile(e.target);
        replaced.prof = `prof_data.csv from ${e.target.files[0].name}`;
        rebuild();
    });
    $('file-bpa').addEventListener('change', async e => {
        sources.rawBpa = await readFile(e.target);
        replaced.rawBpa = `rawBpa.txt from ${e.target.files[0].name}`;
        rebuild();
    });
    $('file-csr').addEventListener('change', async e => {
        await useCsrankingsUpstream(await readFile(e.target), e.target.files[0].name);
    });
    $('fetch-csr').addEventListener('click', async () => {
        $('csr-download').textContent = 'Downloading…';
        try {
            const res = await fetch(model.config.maintenance.csrankingsSourceUrl, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await useCsrankingsUpstream(await res.text(), 'csrankings.org (fetched just now)');
        } catch (error) {
            $('csr-download').textContent = `Download failed: ${error.message}`;
        }
    });
    $('only-ranked').addEventListener('change', renderUnmatched);
    $('unmatched').addEventListener('input', e => {
        if (e.target.dataset.name === undefined) return;
        choices.set(e.target.dataset.name, cleanName(e.target.value));
        updateChoiceCount();
    });
    $('unmatched').addEventListener('click', e => {
        const pick = e.target.closest('[data-pick]');
        if (!pick) return;
        e.preventDefault();
        const input = pick.closest('td').querySelector('input');
        input.value = pick.dataset.pick;
        choices.set(input.dataset.name, pick.dataset.pick);
        updateChoiceCount();
    });
    $('download-aliases').addEventListener('click', downloadAliases);
}

async function main() {
    try {
        sources = await fetchSources('./data/');
    } catch (error) {
        $('summary').innerHTML = `<p class="notice notice-error">${esc(error.message)}</p>`;
        throw error;
    }
    wireEvents();
    rebuild();
}

main();
