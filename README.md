# CS Open Rankings

CS Open Rankings ranks computer science departments in the United States and Canada by combining four ranking sources, filtered by 30+ subfields of computer science:

- **U.S. News / Maclean's**: reputation, from surveys of academics.
- **csrankings.org**: faculty publications at selected conferences (geometric mean of adjusted counts).
- **Placement rank**: a PageRank over where professors got their bachelors and PhDs and where they work now, using the [Drafty CS professors dataset](https://drafty.cs.brown.edu/csprofessors).
- **Best paper awards**: credit for [best paper awards](https://jeffhuang.com/best_paper_awards/) at top conferences, weighted by author position.

Each school's total is the sum of its rank in each selected source; a school missing from a source gets that source's last place.

The site is entirely static. There is no backend or build step, and the page makes no requests to any third-party service. The browser loads the CSV and text files in `data/` and computes every ranking itself. That makes it a good fit for GitHub Pages.

## Run it locally

Any static file server works. From the repository root:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly as a file does not work: browsers block `fetch()` of local files.

## Deploy on GitHub Pages

In the repository settings, under **Pages**, choose **Deploy from a branch**, pick the branch and the `/ (root)` folder. The site is the repository as-is. `.nojekyll` keeps GitHub from running Jekyll over it.

## Repository layout

| Path | What it is |
| --- | --- |
| `index.html` | The rankings |
| `placement-rank.html` | Placement rank scores (PageRank over bachelors and doctorate placements) |
| `university.html?u=<slug>` | One page per school; without `u` it lists every school |
| `maintain.html` | Maintenance tool for data updates (not linked from the site) |
| `data/` | All data the site uses, described below |
| `src/` | JavaScript modules: `model.js` loads `data/`, `rank.js` computes rankings, `pagerank.js`, `bpa.js` (rawBpa.txt parser), `names.js` (alias lookup), `ui/` (one script per page) |
| `frontend/university/*.html` | Redirects from the old static university pages to `university.html` |
| `test/` | `node --test` suites (see Tests) |

## Data files

Everything in `data/` is plain text, so it can be inspected and edited by hand and changes show up in diffs.

| File | Source | How to update |
| --- | --- | --- |
| `prof_data.csv` | Drafty's CS professors export. Columns: `FullName,University,JoinYear,SubField,Bachelors,Doctorate` | Replace with a new export |
| `rawBpa.txt` | <https://jeffhuang.com/best_paper_awards/rawBpa.txt> | Download and replace |
| `csrankings.csv` | csrankings.org's `generated-author-info.csv` (~18 MB), summed per school, conference and year | Build it with `maintain.html` (below) |
| `usnews.csv`, `usnews_ai.csv`, `usnews_sys.csv`, `usnews_thr.csv` | U.S. News overall score and per-area ranks | Edit by hand when U.S. News publishes |
| `macleans.csv` | Maclean's program reputation ranks for Canadian schools | Edit by hand |
| `aliases.csv` | `alias,canonical,source`: maps every spelling of a university used in any source to one canonical name | Edit by hand, or use `maintain.html` |
| `taxonomy.json` | Areas and subfields (UI labels and order), which conferences belong to which subfield, and Drafty's SubField labels | Edit by hand |
| `config.json` | Settings, below | Edit by hand |

### Settings (`data/config.json`)

- `csrankings.minYear`: only count csrankings.org publications from this year on (was hard-coded to 2013). `csrankings.csv` keeps years from `maintenance.csrankingsSnapshotFloorYear` (2000), so any `minYear` from then on works without rebuilding it.
- `csrankings.excludeConfs`: conferences left out of the csrankings.org score.
- `bestPaper.creditSystem`: how authors share credit: 0 = 1 each, 1 = 1/n, 2 = 1/position, 3 = 1/position normalized to sum to 1 (default).
- `bestPaper.noAffiliation`: affiliations counted as "No Affiliation".
- `usnews.missingAreaRank`: rank used for a school missing from one U.S. News area list when several areas are combined.
- `pagerank`: iterations, damping factor and convergence tolerance.
- `updated`: the "updated in …" text under the title.
- `notice`: an optional announcement shown under the title of the rankings page (plain text). Remove the line or set it to `""` to hide it.

### University names

Each source spells schools differently ("Univ. of California - Berkeley", "University of California--Berkeley", …). Every name is looked up in `aliases.csv` after decoding HTML entities and collapsing whitespace:

1. If the name appears in the `canonical` column, it is used as-is.
2. Otherwise, if it appears in the `alias` column, it becomes that row's `canonical` name.
3. Otherwise it is kept as written and reported as unmatched on `maintain.html`.

There is no fuzzy matching on the live site, so results never depend on guesses. The ranked schools are those in `usnews.csv` plus `macleans.csv`; an unmatched name only matters if it should have been one of them.

`aliases.csv` replaces the old Python name maps and Wikidata lookups. The `source` column records where a row came from (`usnews`, `csrankings`, `drafty`, `bestpaper`, `macleans`, `general` for the old general map, `reviewed` for manual fixes).

## Updating data

1. Replace or rebuild the file(s):
   - **Professors**: replace `data/prof_data.csv` with the new Drafty export.
   - **Best papers**: replace `data/rawBpa.txt` with the current file from jeffhuang.com.
   - **csrankings.org**: open `maintain.html`, click **fetch it from GitHub** (or choose a downloaded `generated-author-info.csv`), then **download the new csrankings.csv** and save it as `data/csrankings.csv`.
2. Open `maintain.html` (with the new files in place, or pick them in section 1 to preview first) and check:
   - **Ranked schools with missing data**: a well-known school listed here usually means a source changed how it spells the name.
   - **Unmatched names**: names with no alias, sorted so close matches to ranked schools come first. Choose a canonical name for the ones that matter and click **download aliases.csv**, then save it over `data/aliases.csv`.
3. Run `npm test` (or let GitHub Actions run it on push), commit, and push.

## Tests

```sh
npm test
```

Requires Node 22 or later; there are no dependencies to install.

- `test/units.test.mjs`: parsers, name lookup, PageRank and the csrankings snapshot.
- `test/data.test.mjs`: checks the committed data. For example, every U.S. News and Maclean's school resolves, `aliases.csv` has no conflicting rows, and well-known schools have csrankings.org data.
- `test/parity.test.mjs`: feeds the data of the previous Python + JavaScript site (`test/fixtures/legacy-model.json`) to the new ranking code and checks the results against that site's own output (`test/golden/`).

## License

[CC BY-NC-ND 4.0](LICENSE).
