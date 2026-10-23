// Placement rank page (placement-rank.html): PageRank scores across all areas.

import { loadModel } from '../model.js';
import { placementRankings } from '../rank.js';
import { esc, showLoadError, universityPageUrl } from './common.js';

const tableDiv = document.getElementById('tablediv');

async function main() {
    let model;
    try {
        model = await loadModel('./data/');
    } catch (error) {
        showLoadError(tableDiv, error);
        throw error;
    }
    const r = placementRankings(model);
    const cell = (cls, value) => value === undefined
        ? `<td class="${cls}" value="not-in-ranking"></td>`
        : `<td class="${cls}">${esc(value)}</td>`;
    const head = ['#', 'university', 'size', 'bachelors', 'doctorate', 'placement score']
        .map((title, i) => `<th class="placement_rank_page ${i === 5 ? 'rank_pagerank' : 'rank_university'}">${title}</th>`).join('');
    const body = r.sum.map(([school, rank]) => `
        <tr>
          <td class="column1">${rank}</td>
          <td class="column2"><a href="${universityPageUrl(school)}">${esc(school)}</a></td>
          ${cell('column3', r.count[school])}
          ${cell('column4', r['bach score'][school])}
          ${cell('column5', r['doct score'][school])}
          ${cell('column6', r.score[school])}
        </tr>`).join('');
    tableDiv.innerHTML = `<table id="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

main();
