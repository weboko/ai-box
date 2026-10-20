# Cockpit: a live dashboard on a light datasheet

White sheets on a cool grey desk. A **Conditions** band of global sliders recomputes every
tile; each tile shows one headline and opens a **drawer** (a bottom sheet on phones) with
Summary / Evidence / Derivation. A side rail (a bottom tab bar on phones) follows the
sections. One cobalt ink (`--accent`) marks only the reader's conditions, the selected tile
and figures that just recomputed. Evidence shows as lettered dots: S, E, A, I.

Worked example: `examples/cockpit/index.html`. Shared markup: [`../core.md`](../core.md).

## When to use it
- A quantitative decision with a live model (`model.js`) and 3–6 inputs the reader would
  change: build vs buy, pricing, capacity, a business case.
- Several headline numbers that move together, each worth checking on its own.
- Readers who scan, poke a slider, then check one number's derivation.

Don't use it for an argument to read top to bottom (the board has no linear narrative),
for mostly qualitative prose (long text feels cramped in tiles), or for a story in time. It
works without a model (no Conditions band), but then another template is usually better.

## Page skeleton
```html
<header class="top">…h1, .subtitle with <time data-meta="date">, .legend[data-ev-legend="all"],
  details.about > .about-b > .meta-panel…</header>
<section class="conditions" data-keys="hours,ops" data-labels="Hours / month|Ops hours">
  <h2>Conditions</h2><p class="cond-sub">your assumptions; …</p>
  <p class="cond-peek">…one line with data-out / data-param-value…</p>
</section>
<div class="shell"><main id="main" class="board">
  <section class="board-sec" id="overview" data-label="Overview" data-icon="grid" data-cols="6">
    <header class="sec-h"><h2>Overview</h2><p>optional intro</p></header>
    <section class="tile tldr" id="tldr" data-kind="tldr">…</section>
    <article class="tile" data-kind="kpi">…</article> ×3–6
    <article class="tile" data-span="full">…Key findings…</article>
  </section>
  <section class="board-sec" …>…tiles…</section>
  <section class="board-sec" id="sources" data-label="Sources" data-icon="doc">
    <header class="sec-h"><h2>Sources</h2></header><ol class="sources">…</ol></section>
</main></div>
```
Start from the skeleton (`new-report.sh … cockpit`); replace every `TEMPLATE-TODO`.

## Markup contract

### Sections → rail
- `.board-sec` is one rail entry and one grid. `data-label` (defaults to the h2),
  `data-short` (phone tab label, ≤ 8 characters), `data-icon`: `grid chart bars boxes table
  split flag doc list clock alert gauge map layers users check info`, or a raw 16×16 SVG path.
- Keep 4–7 sections: the phone tab bar holds about 7.
- Grid: 4 columns by default; `data-cols="6"` for a KPI row (6 → 3 → 2 as the board narrows),
  also `2` and `3`. Any non-tile child (`.sec-h`, `ol.sources`, a note) spans the row.

### Tiles → drawer (the depth mechanism)
```html
<article class="tile" id="t-cost" data-span="2">
  <h3>Monthly cost vs hours</h3>            <!-- first h3 = title, drawer crumb -->
  …body: what shows on the board (L0/L1 + one visual)…
  <div class="tab" data-tab="summary">…L1–L2…</div>
  <div class="tab" data-tab="evidence">…sources, tables, quotes…</div>
  <div class="tab" data-tab="derivation">…L3 arithmetic, method…</div>
</article>
```
- `data-span="2" | "3" | "full"` (default 1 column). `data-kind="kpi"` (compact Details
  button) or `"tldr"`.
- Everything that isn't a `.tab` is the tile body. The engine adds a header with a Details
  button and moves the tab nodes into the drawer when opened (so charts, live values and
  levels inside tabs keep working).
- A tile with no `.tab` is not clickable. A missing tab shows as a disabled tab button.
  Give every substantive tile a summary; add evidence and derivation where they exist.
- Without JS, tabs print under their tile with a small label: the page becomes a linear
  datasheet with every depth level.
- Link into a tab (a source back-link, `#id` inside a tab) and the drawer opens on it.

### Conditions band
- Built from `Report.spec.params`: `data-keys` picks and orders them (default: all params
  without `hidden`), `data-labels` gives short labels (`|`-separated, same order; the full
  label stays as a tooltip). A param's `ev` puts its dot on the label; `note` becomes the
  slider description.
- Each slider has a "typ" tick at the report default and turns cobalt when changed;
  "Reset to report (N changed)" resets the band. A `log` param also gets an exact-number box
  (clamped on Enter) and arrow keys that move by real steps.
- `.cond-peek`: one line for phones, e.g.
  `<b data-param-value="hours" data-format="int">2,000</b> h/mo · cheapest <b data-out="cheapestName">…</b>`.
  Without it the first three conditions show.
- 3–6 conditions. More go in the model with `hidden: true`, or in a tile via
  `Report.controls(el, {keys})`.

### Core pieces in Cockpit
- **TL;DR**: `section.tile.tldr#tldr` first in the first section, with `p.l0` (the answer)
  and `p.verdict-line` (live: who wins at the reader's conditions). Tabs: summary = L1,
  evidence = findings, derivation = how the verdict is computed.
- **Evidence**: core `.ev[data-ev]` marks; the engine appends one lettered dot per kind. An
  `estimate` with `data-note` gets a clickable E dot that opens the note. Legends sit in the
  header (put `data-ev-legend="all"` there), rail and drawer.
- **Charts**: core charts, coloured `--s1…--s6` (s1 teal, s2 orange, s3 ink, s4 grey ink,
  s5 light grey, s6 light teal). Give the reader's own or "build" option the ink (s3/s4) and
  rented/vendor options hue. Set `"color"` per series when the order doesn't match. Line
  charts get a legend above them, built from `ReportCharts.legend` with line swatches
  (`"legend": false` turns it off). Markers: `"format": "int"` so they read "you: 2,000 h". Use `"table": false` for
  charts whose drawer already has a data table.
- **Boxes / layered figures**: put `figure.boxes[data-levels]` in the tile body; the level
  buttons work on the board and in the sheet.
- **Disagreements**: body = `.reconcile` with two `.claim`s, each a big `p.sv` value + one
  line, plus a range chart. Summary tab = the full `.reconcile` with `.verdict`. Derivation
  = `ol.steps` with `pre.calc`.
- **Tables**: `table.compare` with a `thead` of 3+ columns stacks into label/value rows when
  the board is narrow (phone, or desktop with the drawer open).
- recs / risks / next / callout / photo / sources: core markup, as tile bodies.

## Components unique to Cockpit
- **KPI**: `p.kpi-v` (big number; `<small>` for the unit; `.good/.warn/.bad` colours it),
  `i.sw[style="--c: var(--s1)"]` swatch tying it to a chart series, `p.kpi-sub` one line.
- **Derivation**: `<pre class="calc">` monospace block; `<span class="c">` comments,
  `<b>` results, `data-out` / `data-param-value data-format="int"` for live numbers.
- **Steps**: `ol.steps` numbered reasoning steps.
- **Meter**: a live bar against a limit, built by the engine:
  `<div class="meter" data-meter="cost.total" data-max="5000 | path"><div class="meter-top"><span>Label</span><span><b data-out="cost.total">…</b> / $5,000</span></div></div>`.
  It turns warning-coloured past the limit.
- **Spec strip**: `dl.ratestrip > div > dt + dd` for unit rates and constants.
- **Recomputed trace**: after a condition change, tiles whose body changed get a brief
  cobalt underline on their title and KPI. Nothing to author.
- **Mirror**: on phones the sheet covers the tile, so the tile body's figures (`figure.chart`,
  `figure.boxes`, `figure.photo`, `[data-mirror]`) repeat above the Summary, unless the
  summary has its own figure. `data-mirror="false"` opts a figure out.
- `window.Cockpit.open(tileId, tab)` / `.close()` for custom scripts.

## Brief levels → Cockpit
| Level | Where |
|---|---|
| L0 | TL;DR `p.l0`; each tile's headline (KPI value, chart, one-line lead) |
| L1 | TL;DR summary tab; short tile bodies (lists of bold leads) |
| L2 | Summary tabs: detail, tables, the full reconcile |
| L3 | Evidence tabs (sources, measurement tables) and Derivation tabs (`pre.calc`) |
Each brief section becomes a `.board-sec`; its L0 and visual become tiles; its
"Visual:" line becomes the tile's chart. The model's Params become the Conditions band;
its Outputs become KPIs and `data-out` values; its Checks are what you verify.

## Mobile and no-JS
- < 900 px: the band collapses to the peek line + "Adjust" (a modal bottom sheet); the rail
  becomes a bottom tab bar; the drawer becomes an 80vh modal sheet with focus trap and the
  page inert. Grids fall to 2 (KPIs) or 1 column. 900–1180 px: icon-only rail.
- No JS: no band, rail or drawer; sections stack into one column, tab content prints under
  each tile, live values show the defaults written in the HTML, citations read "[source]".

## Pitfalls
- Prose inside tile bodies: keep bodies to a headline, a visual or a short list; the depth
  goes in tabs. A body longer than ~6 lines makes the board unreadable.
- Live numbers in prose without `data-out`: they go stale when a slider moves. Say "at the
  report's defaults" for static ones (e.g. a table copied from the brief).
- Forgetting the default text inside `data-out` (the no-JS page and first paint show it).
- More than 6 Conditions, or long labels without `data-labels`: the band gets cramped.
- A KPI whose value doesn't come from the model: write it static and tag it.
- Several `figure.chart` on one tile: the board gets heavy; split into tiles.
- Unique ids: tiles get `t-<slug>` ids from their h3; set `id` yourself when titles repeat.
- Chart data a model doesn't return belongs in `model.js` `compute()`, not in a custom
  script. Bind what you can instead: line `points` take `x` / `y` as `{"bind": "path"}`,
  range rows take `value` / `values` / `ranges` as binds, markers take `"format": "int"`
  for their label, and `data-with="key: value"` shows a what-if (e.g. break-even at a
  12-month build) next to the live value. Range-row notes are static text, so rows whose
  value labels must move with the sliders come from `compute()`.

## Checklist
- [ ] TL;DR tile first, with `p.l0`, a live `p.verdict-line` and a summary tab.
- [ ] 3–6 KPI tiles in a `data-cols="6"` section, each with a summary or derivation.
- [ ] Every section has a `data-icon` and a short `data-short` if the label is long.
- [ ] Conditions: `data-keys`, `data-labels`, a `.cond-peek` line.
- [ ] Every number that depends on a param uses `data-out` with its default written in.
- [ ] Claims carry `.ev` marks; estimates have `data-note` or a derivation tab.
- [ ] Sources section last; every `a.cite` has its `li`.
- [ ] `check.mjs` passes; open a tile at 1440 and at 390, move a slider, press Reset.
