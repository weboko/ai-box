# Notebook template

A Jupyter-style lab notebook. Markdown cells carry the argument; code cells show each number
as an output, with the pseudo-code that derives it one click away; a single `params` cell
holds every assumption, and editing it re-runs the cells below, flashing only the outputs
that changed. Worked example: `examples/notebook/index.html`. Shared markup: `../core.md`.

## When to use it
- Use it for quantitative work the reader should audit and re-run: cost models, sizing,
  break-evens, benchmarks, forecasts. It needs a `Report.model` to shine (`assets/model.js`).
- It works without a model (cells don't re-run, there is no params cell), but then pick a
  reading template instead.
- Avoid it for narrative arguments, non-technical readers, timelines and phases, or
  structures with many related parts. Findings, recommendations and risks are plain
  markdown cells here, with little special treatment.

## Page skeleton
```html
<main class="notebook" data-file="sandbox-decision.ipynb">
  <header class="nbhead">
    <h1>Title</h1><p class="subt">Dek, prices as of …</p>
    <p class="byline"><time data-meta="date"></time> · <span data-meta="reading-time"></span></p>
    <p data-ev-legend="all"></p>
    <details class="kernel"><summary>Notebook metadata · date, model, agent, tags</summary>
      <div class="meta-panel"></div><p>kernel: assets/model.js …</p></details>
  </header>
  <section class="tldr cell md" id="tldr" data-title="TL;DR">…</section>
  <section class="cell md" data-title="Key findings"><h2>…</h2><ol class="findings">…</ol></section>
  <section class="cell md" data-title="Cost model" data-tags="">…intro…</section>
  <section class="cell params" id="params" data-title="params"><p>Every assumption lives here…</p></section>
  <section class="cell code" id="c-monthly" data-title="monthly cost">
    <pre class="src">…pseudo-code…</pre>
    <div class="out">…output…</div>
  </section>
  …
  <section class="cell md" data-title="Sources" data-tags=""><h2>Sources</h2><ol class="sources">…</ol></section>
</main>
```
Load order is in the skeleton (`assets/template/index.html`): core.css, template.css, then
`defer` core.js, charts.js, model.js, template.js. Start from it.

## Markup contract
**Cells.** Every top-level `section.cell` inside `main.notebook` is a cell, in reading order.
- `cell md`: prose. Write normal HTML (h2, p, lists, core blocks). Start each with an `h2`.
- `cell params`: exactly one, before every code cell that reads the model. Leave it empty
  except for one `<p>` (shown above the fields). The engine writes the fields.
- `cell code`: one computed step. `pre.src` (optional) and `div.out` (required).
- `data-title` is the name in the cell index and the top bar. Use code names for code
  cells (`monthly cost`, `break_even`) and section names for md cells. Without it the first
  heading is used.
- Give cells stable `id`s when anything links to them (`href="#params"`, `#c-break-even`).
- `class="tldr cell md"`: keep `tldr` first; `publish.sh` greps for `class="tldr`.
- `data-file` on `main` is the file name in the top bar (default: slug of the h1 + `.ipynb`).

**Navigation.** The cell index is generated: md cells are the first level, code and params
cells nest under the md cell above them with their `[n]` counter. It is a sidebar from
861 px and a drawer (hamburger in the top bar) below. Scroll-spy selects the cell at 30 % of
the viewport; links into a cell select it; a link to an element inside a hidden derivation
opens it. So: put an md cell before each group of code cells, or they land at the top level.

**Depth.**
- L0/L1: md cell headline and first paragraph (`p.lead` for the TL;DR sentence).
- L2: code-cell outputs; `details.more` inside md cells (`<summary>More: …</summary>`); layered
  figures (`data-levels`, the levels control is labelled "depth").
- L3: the derivation (`pre.src`, behind "show derivation"; "Show all derivations" in the
  toolbar opens every one) and estimate notes (`data-note`).

**Evidence.** Gutter tags show the evidence kinds in a cell. They are derived from the
`.ev[data-ev]` marks and citations inside the cell (citations → `source`). Override with
`data-tags="estimate interpretation"` (any core kind or alias), or `data-tags=""` for none,
which suits intro, heading-only and sources cells. The params cell is tagged from its params'
`ev`. Inline `.ev` spans get a tinted background and a tiny `est`/`asm`/`ai` tag; sourced
facts stay plain with their `[n]`. Don't put `data-out` on the `.ev` element itself; nest it.

## Code cells
```html
<section class="cell code" id="c-hourly" data-title="hourly cost">
  <pre class="src">e2b_rate = vcpu*0.0504 + gib*0.0162   # [#src-e2b-price-calc]
         # = ${params.vcpu}*0.0504 + ${params.gib}*0.0162
e2b_rate</pre>
  <div class="out">
    <pre class="txt">(<span data-out="e2bRate" data-digits="4">0.1656</span> $/h)</pre>
    <p class="note">What the output means, one line.</p>
  </div>
</section>
```
- `pre.src` is readable pseudo-Python (Python highlighting: strings, keywords, numbers,
  `# comments`). It mirrors what `model.js` does; it is not executed. Escape `<` and `&`.
- `${path}` is filled from `Report.value(path)` on every run: `${params.hours}` (a param, printed
  as a literal), `${cost.e2bPro|currency}`, `${e2bRate|number:4}`, `${hours|int}`. Formats are
  core formats, `:n` sets digits; `null` prints `None`.
- `[#src-id]` anywhere in the code becomes a numbered citation.
- `.out` is always visible, also without JavaScript, so **write every default value into the
  markup**: `<span data-out="cost.e2bPro" data-format="currency">$481</span>`.
- Output building blocks: `pre.txt` (a repr line, monospace), `p.note` (grey comment),
  `.table-wrap > table.compare` (styled as a pandas DataFrame; `num` right-aligns), core
  charts, box diagrams, photos, `.verdict`, `pre.warnout` (a red `UserWarning:` line, usually
  with `data-show-if`).
- "Changed" means the output's visible text changed. Cells whose output doesn't depend on a
  param still re-run (new counter) but don't flash.

## The params cell
Generated from `Report.spec.params`, as `name = [field]  # label`:
- Name: `py` on the param if set, else the key in snake_case (`opsHours` → `ops_hours`).
- `label` becomes the comment, `note` a comment line under it, `cite` a citation in it.
- `options` → a select; anything else → a number field. `log: true` params also get a
  slider (or list them in `data-sliders="hours peak"`).
- `data-keys="hours vcpu gib …"` sets which params are editable and their order. Without it,
  all non-`hidden` params are editable. The rest print as read-only constants, so every
  assumption is visible.
- Behaviour: typing re-runs after a pause; an invalid value shows
  `ValueError: hours must be ≥ 100 (got -5). Enter 100 to 100,000 h.` under the field (from
  `min`/`max`/`validate`), the cells below go **stale** (dimmed, "stale" under Out) and the
  kernel shows "Error in params". Recovery: a valid value, Esc (last valid value),
  "default N", or Reset params in the toolbar. Give every param `min`, `max` and `unit`.

## Components unique to the template
- **Scenario rows** use core what-ifs: `<span data-out="breakEven" data-with="buildMonths: 12" data-format="int">69,230</span>`
  (values are numbers, strings or `params.<key>`). Use them for "+12 months" rows and "at 0 h" figures.
- **Warnings**: `<pre class="warnout" data-show-if="warnings" hidden>UserWarning: <span data-out="warnings" data-join="&#10;UserWarning: "></span></pre>`
  prints an array result one item per line.
- **Reconcile cells**: put the two sides in an md cell as `.reconcile > .claim + .claim`
  (two columns), then a `cell code reconcile` whose `.out` holds the arithmetic and a
  `.verdict` (`h4` "Best reading: …" + `p`). The gutter shows "reconcile".
- **Line charts**: set `"endLabels": false` for the notebook look; core's legend then shows as a
  line-swatch key above the plot. Give markers `"format": "int"` so they print `hours = 2,000`.
- **Wide tables** (4+ columns) stack into cards on phones; every cell learns its column name.
- `Report.notebook.runAll()`, `.reset()`, `.showDerivation(id)` for custom scripts.

## Brief levels → notebook
| Brief | Notebook |
|---|---|
| TL;DR L0/L1 | `tldr` md cell: `p.lead` + one paragraph |
| Findings | md cell with `ol.findings`; numbers the model computes use `data-out` |
| Section L0/L1 | md cell: `h2` + first paragraph |
| Section L2 | `details.more`, or code cells whose outputs carry the detail |
| Section L3 | `pre.src` derivations, `data-note` on estimates, "Show data" on charts |
| Visual | the `.out` of a code cell (core chart, boxes with `data-levels`, photo) |
| Disagreements | md cell with `.reconcile` claims + `cell code reconcile` |
| Model params | the params cell |
| Recommendation / risks / next | md cells with `ol.recs`, `ul.risks`, `ol.next` |
| Sources, metadata | last md cell with `ol.sources`; `.meta-panel` in the header `details.kernel` |

## Mobile and no-JS
- Below 861 px: the index is a drawer, toolbar buttons are icons, the current cell shows as
  `[n] title` in the top bar, the gutter folds into a row above each cell. Below 420 px the
  params comments wrap under their fields.
- Without JavaScript: md cells, `.out` outputs with their written defaults ("Out:" in the
  gutter), photos, tables, boxes (all levels) and sources render. Derivations, the params
  cell, charts and the index don't. Citations show as `[source]` links (core).

## Pitfalls
- A code cell above the params cell is not re-run by params edits. Keep params first.
- An output with no default written in shows empty without JS; `check.mjs` won't notice.
- `${…}` only works inside `pre.src`. In outputs use `data-out` / `data-param-value`.
- Prose numbers that are not `data-out` stay at the defaults; the params cell's note says so.
  Make the key ones live, or write "at the report's defaults".
- Don't hand-write prompts, counters, tags or the index: the engine builds them.
- Every md cell needs a heading or `data-title`, or the index shows "cell N".
- Keep `pre.src` lines under ~110 characters; long lines scroll sideways.

## Checklist
- [ ] `main.notebook` with `data-file`; header with legend, byline and `details.kernel > .meta-panel`.
- [ ] TL;DR is the first cell, `class="tldr cell md"`.
- [ ] One params cell before the model's code cells; every param has min, max, unit, ev.
- [ ] Each code cell: `data-title`, `pre.src` derivation, `.out` with defaults written in.
- [ ] Disputes: claims md cell + `cell code reconcile` with a `.verdict`.
- [ ] Intro, heading-only and sources cells have `data-tags=""`.
- [ ] Defaults show and change when params change; an invalid param marks cells stale.
- [ ] `check.mjs` prints `check: ok`.
