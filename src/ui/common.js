// Shared helpers for the page scripts.

import { bestPaperBySubfield, bestPaperTitles } from '../rank.js';
import { slugify } from '../names.js';

export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export const BEST_PAPER_URL = 'https://jeffhuang.com/best_paper_awards/';

export function scholarAuthorUrl(name) {
    return `https://scholar.google.com/scholar?q=${encodeURIComponent(name)}&hl=en`;
}

export function scholarTitleUrl(title) {
    return `https://scholar.google.com/scholar?as_q=${encodeURIComponent(title)}&hl=en`;
}

export function draftyProfUrl(name) {
  return '#'  
  //return `https://drafty.cs.brown.edu/csprofessors?src=csor_${encodeURIComponent(name)}&searchCol=0&searchVal=${encodeURIComponent(name)}`;
}

export function draftySchoolUrl(school) {
    return `https://drafty.cs.brown.edu/csprofessors?src=csor_${encodeURIComponent(school)}&searchCol=1&searchVal=${encodeURIComponent(school)}`;
}

export function universityPageUrl(school, base = './') {
    return `${base}university.html?u=${encodeURIComponent(slugify(school))}`;
}

export function setUpdated(model) {
    const el = document.getElementById('update_info');
    if (el && model.config.updated) el.textContent = `updated in ${model.config.updated}`;
}

export function showLoadError(container, error) {
    const local = location.protocol === 'file:';
    container.innerHTML = `<p class="notice notice-error">Could not load the ranking data${local
        ? ': this page has to be served over HTTP (for example <code>python3 -m http.server</code>), not opened as a file.'
        : `. ${esc(error.message)}`}</p>`;
}

// The per-school summary panel: best paper credit by subfield, rank by area, best paper titles.
export function schoolSummaryHTML(model, school, { areas, subfields, areaRank, pageLink = false }) {
    const label = model.taxonomy.subfieldLabel;
    const credit = bestPaperBySubfield(model, school, areas, subfields);
    const more = `<a class="footer_bpa_link" href="${BEST_PAPER_URL}" target="_blank" rel="noopener">see more...</a>`;
    const creditHTML = credit.length === 0
        ? `<p>* No best paper awards yet, hopefully there are some coming soon. :) ${more}</p>`
        : credit.map(([s, v]) => `<p>${esc(label[s] ?? s)}: ${(Math.round(v * 100) / 100).toFixed(1)}</p>`).join('') + (credit.length < 4 ? more : '');

    const ranks = areaRank ?? {};
    const rankHTML = model.taxonomy.areas.map(a => `
        <div class="metric">${esc(a.label.toLowerCase())}: ${ranks[a.code] ?? 'n/a'}</div>`).join('');

    const titles = bestPaperTitles(model, school, 4);
    const titlesHTML = titles.length === 0
        ? `<p>* No data yet, hopefully more coming soon. :) ${more}</p>`
        : `<div class="best-paper-titles">${titles.map(t => `<p><a href="${scholarTitleUrl(t)}" target="_blank" rel="noopener" title="Search Google Scholar">&#128279;</a> ${esc(t)}</p>`).join('')}</div>` + (titles.length < 4 ? more : '');

    return `
      <div class="grid-container">
        <div class="grid-item1">
          <p><b><a href="${BEST_PAPER_URL}" target="_blank" rel="noopener" class="footer_bpa_link">best paper awards</a><br># of awards per subfield</b></p>
          <div class="bpa-subfields">${creditHTML}</div>
        </div>
        <div class="grid-item2">
          <p><b>${esc(school)}'s [rank by area]</b>${pageLink ? ` <a class="footer_drafty_link" href="${universityPageUrl(school)}">[university page]</a>` : ''}</p>
          <div class="metric_flex">${rankHTML}</div>
        </div>
        <div class="grid-item3">
          <p><b>best paper winners</b></p>
          ${titlesHTML}
        </div>
      </div>`;
}

// Professors at a school and PhD alumni of it who are professors elsewhere.
export function peopleHTML(model, school, { areas, subfields }) {
    const { subfieldArea, subfieldLabel } = model.taxonomy;
    const visible = p => subfields.includes(p.subfield) || areas.includes(subfieldArea[p.subfield]);
    const sorted = obj => Object.values(obj ?? {}).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const profs = sorted(model.profsBySchool[school]);
    const alumni = sorted(model.alumniBySchool[school]);
    const contribute = `<a class="footer_drafty_link" target="_blank" rel="noopener" href="${draftySchoolUrl(school)}">contribute here</a>`;
    const links = p => `
        <td><a class="link_logo" target="_blank" rel="noopener" href="${draftyProfUrl(p.name)}" title="Drafty profile">&#9401;</a></td>
        <td><a class="link_logo" target="_blank" rel="noopener" href="${scholarAuthorUrl(p.name)}" title="Google Scholar">&#9404;</a></td>`;
    const rows = (list, second, empty) => {
        const shown = list.filter(visible);
        if (list.length === 0) return `<tr class="sub_prof_row"><td></td><td>* No ${empty} data yet, hopefully more coming soon. :) ${contribute}</td><td></td><td></td></tr>`;
        return shown.map(p => `<tr class="sub_prof_row"><td>${esc(p.name)}</td><td>${esc(second(p))}</td>${links(p)}</tr>`).join('');
    };
    return `
      <div class="prof_alumni_parent">
        <div class="professor_subtable">
          <table class="prof-dropdown-table">
            <tr><th class="sub_row_header prof_professor" colspan="4">professors (${profs.length})</th></tr>
            <tr><th class="sub_sub_row_header prof_name">name</th><th class="sub_sub_row_header prof_subfield">subfield</th><th class="sub_sub_row_header prof_links" colspan="2">links</th></tr>
            ${rows(profs, p => subfieldLabel[p.subfield] ?? p.subfieldLabel, 'professor')}
          </table>
        </div>
        <div class="alumni_subtable">
          <table class="prof-dropdown-table">
            <tr><th class="sub_row_header prof_alumni" colspan="4">phd alumni (${alumni.length})</th></tr>
            <tr><th class="sub_sub_row_header prof_name">name</th><th class="sub_sub_row_header prof_university">university</th><th class="sub_sub_row_header prof_links" colspan="2">links</th></tr>
            ${rows(alumni, p => p.university, 'alumni')}
          </table>
        </div>
      </div>`;
}
