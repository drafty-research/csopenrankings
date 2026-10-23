// Main rankings page (index.html).

import { loadModel } from '../model.js';
import { computeRankings, tieRanks, areaRanks, isCanadian, ALL_SOURCES } from '../rank.js';
import { esc, setUpdated, showLoadError, schoolSummaryHTML, peopleHTML } from './common.js';

const COLUMNS = [
    { title: '#', css: 'rank_total' },
    { title: 'university', css: 'rank_university' },
    { key: 'count', title: 'size', css: 'rank_university', tip: 'Number of permanent faculty who can advise computer science Ph.D. students, as listed on at: <a class="tooltip_link" href="https://drafty.cs.brown.edu/csprofessors?src=csor_tooltip" target="_blank" rel="noopener">https://drafty.cs.brown.edu/csprofessors</a>' },
    { key: 'usnews', title: 'U.S. News', css: 'rank_usnews', tip: "Reputation rankings gathered by U.S. News for American Universities and MacLean's for Canadian Universities" },
    { key: 'csrankings', title: 'csrankings.org', css: 'rank_csrankings', tip: 'Rankings based on faculty publications calculated using a similar methodology as csrankings.org' },
    { key: 'pagerank', title: 'placement rank', css: 'rank_pagerank', tip: 'PageRank-style ranking based on placement of bachelors and doctorate graduates into professor positions' },
    { key: 'bpa', title: 'best paper awards', css: 'rank_bpa', tip: 'Ranking of university for winning best paper awards as listed on: <a class="tooltip_link" href="https://jeffhuang.com/best_paper_awards/" target="_blank" rel="noopener">https://jeffhuang.com/best_paper_awards/</a>' },
    { title: 'total', css: 'rank_total', tip: 'Sum of the ranking numbers in the selected rankings' },
];

const $ = id => document.getElementById(id);
const tableDiv = $('tablediv');
const notice = $('notice');
let model;
let openSchool = null;
const areaRankCache = new Map();

// --- selection state <-> checkboxes <-> URL -------------------------------------------

function renderAreaControls() {
    $('areas').innerHTML = model.taxonomy.areas.map(area => `
      <div class="areabutton-buttondiv-wrapper">
        <div class="areabutton">
          <div class="buttonlabel">
            <input type="checkbox" id="area-${area.code}" class="area" value="${area.code}" checked>
            <label for="area-${area.code}" class="area-label">${esc(area.label)}</label>
          </div>
        </div>
        <hr>
        <div class="buttondiv">
          <div class="subfieldbuttons">
            ${area.subfields.map(s => `
            <div class="buttonlabel">
              <input type="checkbox" id="sub-${s.code}" class="subfield" data-area="${area.code}" value="${s.code}" checked>
              <label for="sub-${s.code}">${esc(s.label)}</label>
            </div>`).join('')}
          </div>
        </div>
      </div>`).join('');
}

const checked = selector => [...document.querySelectorAll(`${selector}:checked`)].map(el => el.value);

function readSelection() {
    return {
        sources: checked('input.datasrc'),
        areas: checked('input.area'),
        subfields: checked('input.subfield'),
        country: $('countries').value,
    };
}

function syncAreaBoxes() {
    for (const area of model.taxonomy.areaCodes) {
        const subs = [...document.querySelectorAll(`input.subfield[data-area="${area}"]`)];
        $(`area-${area}`).checked = subs.every(s => s.checked);
    }
}

function writeURL(sel) {
    const params = new URLSearchParams();
    if (sel.sources.length !== ALL_SOURCES.length) params.set('sources', sel.sources.join(','));
    const allSubs = document.querySelectorAll('input.subfield').length;
    if (sel.subfields.length !== allSubs) params.set('subfields', sel.subfields.join(','));
    if (sel.country !== 'both') params.set('country', sel.country);
    if (openSchool) params.set('open', openSchool);
    const query = params.toString();
    history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

function readURL() {
    const params = new URLSearchParams(location.search);
    if (params.has('sources')) {
        const sources = params.get('sources').split(',');
        document.querySelectorAll('input.datasrc').forEach(el => { el.checked = sources.includes(el.value); });
    }
    if (params.has('subfields')) {
        const subs = params.get('subfields').split(',');
        document.querySelectorAll('input.subfield').forEach(el => { el.checked = subs.includes(el.value); });
    }
    if (['usa', 'canada'].includes(params.get('country'))) $('countries').value = params.get('country');
    openSchool = params.get('open');
    syncAreaBoxes();
}

// --- table ------------------------------------------------------------------------------

function showNotice(text) {
    notice.hidden = !text;
    notice.textContent = text ?? '';
}

function render() {
    const sel = readSelection();
    writeURL(sel);
    if (sel.areas.length === 0 && sel.subfields.length === 0) {
        showNotice('Select at least one area or subfield to see a ranking.');
        tableDiv.innerHTML = '';
        return;
    }
    const rankings = computeRankings(model, sel);
    const shown = ALL_SOURCES.filter(s => rankings[s]);
    if (shown.length === 0) {
        showNotice('U.S. News has no ranking for this selection (it covers all areas together, or any mix of AI, Systems and Theory). Add another ranking source or change the areas.');
        tableDiv.innerHTML = '';
        return;
    }
    const dropped = sel.sources.filter(s => !rankings[s]);
    showNotice(dropped.includes('usnews')
        ? 'U.S. News is not included: it has no ranking for this selection (it covers all areas together, or any mix of AI, Systems and Theory).'
        : null);

    const head = COLUMNS.map(c => `<th class="main_row_header ${c.css}">${c.tip
        ? `<div class="tooltip_size">${esc(c.title)}<span class="tooltiptext_size">${c.tip}</span></div>`
        : esc(c.title)}</th>`).join('');

    const showCanada = sel.country === 'both';
    const body = tieRanks(rankings.sum).map(([school, rank, total]) => {
        const cells = COLUMNS.filter(c => c.key).map((c, i) => {
            const cls = `column${i + 3}`;
            if (c.key !== 'count' && !rankings[c.key]) return `<td class="${cls}" value="not-included-ranking"></td>`;
            const value = rankings[c.key][school];
            return value === undefined ? `<td class="${cls}" value="not-in-ranking"></td>` : `<td class="${cls}">${value}</td>`;
        }).join('');
        const isOpen = school === openSchool;
        const rowClass = showCanada && isCanadian(model, school) ? ' class="canada"' : '';
        return `
          <tr${rowClass} data-school="${esc(school)}" tabindex="0" aria-expanded="${isOpen}">
            <td class="column1">${total === null ? '' : rank}</td>
            <td class="column2">${esc(school)}<span class="expand">${isOpen ? '-' : '+'}</span></td>
            ${cells}
            <td class="column8">${total === null ? 'n/a' : total}</td>
          </tr>
          ${isOpen ? detailRowsHTML(school, sel) : ''}`;
    }).join('');

    tableDiv.innerHTML = `<table id="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function areaRanksFor(country) {
    if (!areaRankCache.has(country)) areaRankCache.set(country, areaRanks(model, country));
    return areaRankCache.get(country);
}

function detailRowsHTML(school, sel) {
    const areaRank = areaRanksFor(sel.country)[school];
    return `
      <tr class="detail-row"><td colspan="8" class="detail-cell"><div class="detail-inner">${schoolSummaryHTML(model, school, { ...sel, areaRank, pageLink: true })}</div></td></tr>
      <tr class="detail-row"><td colspan="8" class="detail-cell"><div class="detail-inner">
        <button type="button" class="close_footer" data-close="1" aria-label="Close details">close ×</button>
        ${peopleHTML(model, school, sel)}
      </div></td></tr>`;
}

function toggleSchool(school) {
    openSchool = openSchool === school ? null : school;
    render();
}

// --- events -----------------------------------------------------------------------------

function wireEvents() {
    document.querySelectorAll('input.datasrc').forEach(el => el.addEventListener('change', () => {
        if (checked('input.datasrc').length === 0) {
            el.checked = true;
            showNotice('Please choose one or more ranking sources.');
            return;
        }
        render();
    }));
    document.querySelectorAll('input.area').forEach(el => el.addEventListener('change', () => {
        document.querySelectorAll(`input.subfield[data-area="${el.value}"]`).forEach(s => { s.checked = el.checked; });
        render();
    }));
    document.querySelectorAll('input.subfield').forEach(el => el.addEventListener('change', () => {
        syncAreaBoxes();
        render();
    }));
    const setAll = value => {
        document.querySelectorAll('input.area, input.subfield').forEach(el => { el.checked = value; });
        render();
    };
    $('toggle_select_all').addEventListener('click', () => setAll(true));
    $('toggle_deselect_all').addEventListener('click', () => setAll(false));
    $('countries').addEventListener('change', render);

    document.querySelectorAll('button.collapsible').forEach(btn => btn.addEventListener('click', () => {
        const content = $(btn.getAttribute('aria-controls'));
        const opening = content.hidden;
        document.querySelectorAll('button.collapsible').forEach(other => {
            $(other.getAttribute('aria-controls')).hidden = true;
            other.setAttribute('aria-expanded', 'false');
            other.textContent = '+';
        });
        content.hidden = !opening;
        btn.setAttribute('aria-expanded', String(opening));
        btn.textContent = opening ? '−' : '+';
    }));

    tableDiv.addEventListener('click', e => {
        if (e.target.closest('a')) return;
        if (e.target.closest('[data-close]')) return toggleSchool(openSchool);
        const row = e.target.closest('tr[data-school]');
        if (row) toggleSchool(row.dataset.school);
    });
    tableDiv.addEventListener('keydown', e => {
        const row = e.target.closest('tr[data-school]');
        if (row && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            toggleSchool(row.dataset.school);
            tableDiv.querySelector(`tr[data-school="${CSS.escape(row.dataset.school)}"]`)?.focus();
        }
    });
}

async function main() {
    try {
        model = await loadModel('./data/');
    } catch (error) {
        showLoadError(tableDiv, error);
        throw error;
    }
    setUpdated(model);
    const siteNotice = model.config.notice;
    if (siteNotice) {
        $('site-notice').textContent = siteNotice;
        $('site-notice').hidden = false;
    }
    document.querySelectorAll('.csr-min-year').forEach(el => { el.textContent = model.config.csrankings.minYear; });
    renderAreaControls();
    readURL();
    wireEvents();
    render();
    if (openSchool) tableDiv.querySelector(`tr[data-school="${CSS.escape(openSchool)}"]`)?.scrollIntoView({ block: 'center' });
}

main();
