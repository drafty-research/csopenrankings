// University page (university.html?u=<slug>). Without a known slug it lists all schools.

import { loadModel } from '../model.js';
import { universe, areaRanks } from '../rank.js';
import { slugify } from '../names.js';
import { esc, showLoadError, schoolSummaryHTML, peopleHTML, draftySchoolUrl, universityPageUrl } from './common.js';

const page = document.getElementById('page');

async function main() {
    let model;
    try {
        model = await loadModel('./data/');
    } catch (error) {
        showLoadError(page, error);
        throw error;
    }
    const schools = [...universe(model, 'both')].sort((a, b) => a.localeCompare(b));
    const slug = new URLSearchParams(location.search).get('u');
    // unranked schools with professor data still get a page (some old links point to them)
    const school = [...schools, ...Object.keys(model.profsBySchool)].find(s => slugify(s) === slug);

    if (!school) {
        document.title = 'computer science open rankings: universities';
        page.innerHTML = `
          ${slug ? `<p class="notice">No university matches “${esc(slug)}”.</p>` : ''}
          <h2 class="header">universities</h2>
          <ul class="uni-index">${schools.map(s => `<li><a href="${universityPageUrl(s)}">${esc(s)}</a></li>`).join('')}</ul>`;
        return;
    }

    document.title = `computer science open rankings for ${school}`;
    const all = { areas: model.taxonomy.areaCodes, subfields: [] };
    page.innerHTML = `
      <h2 class="header">${esc(school)} <a href="${draftySchoolUrl(school)}" target="_blank" rel="noopener"><span class="headermsg">[edit source data]</span></a></h2>
      <div class="source-information" style="margin: 0">
        <div class="rankings-description">
          <p>This page offers additional information about computer science professors at ${esc(school)}: papers that have won best paper awards at top venues in CS, its rank in each area, a list of current professors, and PhD alumni who are professors at other universities.</p>
        </div>
      </div>
      <div class="tablediv">
        <table id="table" style="max-width: 100%">
          <tr class="detail-row"><td class="detail-cell">${schoolSummaryHTML(model, school, { ...all, areaRank: areaRanks(model, 'both')[school] })}</td></tr>
          <tr class="detail-row"><td class="detail-cell">${peopleHTML(model, school, all)}</td></tr>
        </table>
      </div>`;
}

main();
