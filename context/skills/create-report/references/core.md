# Core markup: the same in every template

Every template loads `assets/core/` (core.css, core.js, charts.js). The core handles evidence,
citations, sources, metadata, the live model, charts, layered figures and box diagrams, and
the markup for them is the same in every template. What differs between templates is the
page structure and the depth mechanism around these pieces (see `references/templates/<name>.md`).
Each template draws the same markup in its own visual language.

**HTML first:** all prose lives in `index.html` markup, so the report still reads without
JavaScript. JavaScript is for `model.js` and custom visuals.

## Contents
- [Evidence](#evidence) · [Citations and sources](#citations-and-sources) · [Metadata](#metadata)
- [Model and controls](#model-and-controls) · [Live values](#live-values)
- [Charts](#charts) · [Box diagram](#box-diagram) · [Layered figure](#layered-figure)
- [Photo](#photo) · [Table](#table) · [Shared blocks](#shared-blocks) · [Custom visuals and scripts](#custom-visuals-and-scripts)

## Evidence
Mark the claims a decision rests on, not every sentence.
```html
<span class="ev" data-ev="fact">€97.30/month</span><a class="cite" href="#src-hetzner"></a>
<span class="ev" data-ev="estimate" data-note="2 boxes × (€97.30 + €49/24) × 1.16">≈ $235/month</span>
<span class="ev" data-ev="assumption">20 ops-hours a month</span>
<span class="ev" data-ev="interpretation">for a two-person team that is the whole company for half a year</span>
<div class="ev" data-ev="interpretation"><p>A whole paragraph of judgement.</p></div>
```
- `fact` = sourced (put the citation right after it). `estimate` = derived or approximate: put
  the derivation in `data-note`, and the core adds a small "?" toggle that shows it.
  `assumption` = taken as given, not verified. `interpretation` = your judgement.
- Combine kinds with a space: `data-ev="estimate interpretation"`.
- `<p data-ev-legend></p>` (or any element) gets a legend of the kinds the page uses;
  `data-ev-legend="all"` lists all four. Put one near the top.
- Never invent a number. If you derive one, tag it `estimate` and show how in `data-note`.

## Citations and sources
```html
…claim<a class="cite" href="#src-e2b-pricing"></a>
<ol class="sources">
  <li id="src-e2b-pricing"><a href="https://e2b.dev/pricing">E2B — Pricing</a>, accessed 2026-10-18.</li>
</ol>
```
- Leave `a.cite` empty. The core numbers sources by first citation, writes `[n]`, puts the
  source title in the tooltip and adds back-links. List sources in any order.
- One `ol.sources` per page. `publish.sh` refuses a citation without a matching `li`.
- A source without a URL (the team's own billing data, an interview) is a plain-text `li`:
  `<li id="src-billing">The team's billing data, October 2026 (private).</li>`. Describe
  private sources in general terms.
- Source ids: `src-` plus a short name (`src-hetzner-prices`), never bare numbers.

## Metadata
`report.json` (filled by you and by `new-report.sh`) feeds the page:
`<time data-meta="date"></time>`, `<span data-meta="reading-time"></span>`,
`data-meta="model|agent|tags|updated|notes"`, and `<div class="meta-panel"></div>`, which gets a
definition list of all of them. `notes` is optional: one line such as "Prices accessed
2026-10-18; 1 EUR = 1.16 USD". Templates put these in their header or footer.

## Model and controls
Only when the investigation produced a quantitative model (costs, sizing, growth, a business
case). Put it in `site/assets/model.js`, loaded after core:
```js
Report.model({
  params: [
    { key: "hours", label: "Sandbox-hours per month", min: 100, max: 100000, log: true, step: 10,
      default: 2000, format: "int", unit: "h", ev: "assumption", note: "730 h = one sandbox always on" },
    { key: "tier", label: "Plan", options: [{ value: "pro", label: "Pro" }, { value: "hobby", label: "Hobby" }], default: "pro" }
  ],
  compute: function (p) {           // pure: same params → same result
    var cost = 150 + p.hours * 0.166;
    return { cost: cost, series: [/* rows for a chart */], breakEven: 32150 };
  }
});
```
- Param fields: `key label min max step log default format unit ev note cite hidden options digits currency validate(v, params)`.
  `ev` takes the evidence kinds: `fact`, `estimate`, `assumption`, `interpretation`.
  `hidden: true` keeps a param out of the standard controls, but it can still be set.
- Defaults come from the investigation. Every default that is an assumption says so (`ev`).
- `compute` returns any object. Paths into it (`cost.e2bPro`, `series`) are what the page binds
  to. Return chart rows ready to plot, e.g. `series: [{hours, e2bPro, modal}, …]`.
- JS API: `Report.set("hours", 3000)` or `Report.set({…})` (invalid values are rejected and
  returned as `{key: message}`), `Report.reset()`, `Report.params`, `Report.defaults`,
  `Report.result`, `Report.value("cost.e2bPro" | "params.hours")`, `Report.computeWith({hours: 500})`
  (what-if without changing the page), `Report.on("update", fn(result, params, changedKeys))`.
  "update" also fires once at start, after the "ready" phase, with `changedKeys = []`.
- Standard controls: `Report.controls(container, {keys: [...]})` renders labelled sliders with
  read-outs, help text and "Reset to report values". Templates that have their own control UI
  (a Conditions band, a params cell, a scrubber) document it in their guide.
- Hand-made inputs bind with `data-param`: `<input type="range" data-param="hours">`,
  `<input type="number" data-param="peak">`, `<select data-param="tier">`. A `log` param maps a
  range slider logarithmically.

## Live values
Any element can show a model value. The core formats it and updates it on every change.
```html
<b data-out="cost.e2bPro" data-format="currency">$481</b>
<span data-out="breakEven" data-format="int" data-suffix=" h" data-empty="beyond 500,000 h">32,150 h</span>
<span data-param-value="hours">2,000 h</span>        <!-- the current param, formatted -->
<b data-out="breakEven" data-with="buildMonths: 0" data-format="int">13,260</b>  <!-- what-if: same model, other params -->
<b data-out="cost.e2bPro" data-with="hours: result.breakEvenOps" data-format="currency">$2,349</b>  <!-- values: numbers, params.<key>, result.<path> -->
<span data-out="warnings" data-join="; "></span>     <!-- arrays are joined (default ", ") -->
<ul data-out="warnings"></ul>                          <!-- …or become list items in a ul/ol -->
<p data-show-if="warnings">…</p>  <p data-show-if="!hobbyFits">…</p>
<tr data-highlight="cheapest=e2bPro">…</tr>             <!-- .is-hl while the path equals the value -->
```
- Formats: `currency` (`data-currency="EUR"`), `percent` (0.25 → 25%), `int`, `number`,
  `compact` (32K), `date`, `raw`. Also `data-digits`, `data-prefix`, `data-suffix`, `data-empty`.
- **Write the default value inside the element** (`$481`), so it reads without JavaScript.
- The TL;DR answer states the conclusion at the report's defaults, and it can stay static.
  Supporting sentences that the sliders can change use `data-out` or say "at the defaults".
- Prose that quotes a number in a sentence either uses `data-out`, or states that it is at
  the report's defaults.

## Charts
Dependency-free SVG charts. The template's CSS colours them: series take `--s1…--s6` in
order, and an estimate or assumption series is dashed (`"ev": "estimate"`).
```html
<figure class="chart" id="cost-vs-hours">
  <script type="application/json">
  { "type": "line", "bind": "series",
    "x": { "key": "hours", "label": "Sandbox-hours per month", "format": "compact" },
    "y": { "format": "currency", "max": 10000 },
    "series": [ { "key": "e2bPro", "name": "E2B Pro", "short": "E2B" },
                { "key": "selfAll", "name": "Self-host, all-in", "short": "All-in", "ev": "estimate" } ],
    "markers": [ { "bind": "params.hours", "label": "You: {x}" } ],
    "points":  [ { "x": 32150, "y": 5487, "label": "Break-even" } ],
    "bands":   [ { "from": 13000, "to": 32000, "label": "break-even range" } ] }
  </script>
  <figcaption>The takeaway, not a description of the axes.<a class="cite" href="#src-x"></a></figcaption>
</figure>
```
- Types:
  - **line**: `x.key` numeric, one line per series. `x.log`/`y.log` for log axes, `y.max` to
    clip outliers (clipped lines get "↑" at the end label). Markers, points and bands can
    take `"bind"` instead of a number.
  - **bar**: horizontal bars, one row per category (`x.key`, default `"label"`), one bar per
    series. Set `"_highlight": true` on a row to outline it.
  - **stack**: horizontal stacked bars, rows × series parts, with the total at the end.
  - **range**: dots and ranges on one axis, e.g. latency claims vs measurements:
    `"rows": [{ "label": "E2B (benchmark)", "ranges": [[264, 603]], "note": "median–p95" }, { "label": "Claim", "value": 150, "shape": "diamond" }]`,
    plus optional `band` and `marker`.
- Data: `"data": [rows]` inline, or `"bind": "<path in the model result>"` (it redraws on
  every model change).
- Points take `"x"`/`"y"` as numbers or `{"bind": "path"}` each. `"on": "seriesKey"` puts the
  point on that series' line at x (e.g. `{"x": {"bind": "params.hours"}, "on": "e2bPro", "label": "{y}"}`).
  `"format"` / `"yFormat"` override the axis formats in point labels. Range rows take
  `value`/`values`/`ranges` as data or `{"bind": "path"}`. Markers take `"format"` to override
  the axis format in their label (e.g. `"int"` for "You: 2,000 h" on a compact axis).
- Axis options: `format`, `currency`, `digits`, `prefix`, `suffix`, `min`, `max` (a number or
  `{"bind": "path"}`), `log`, `label`. Linear y starts at 0, or below 0 when the data go negative;
  and `ticks` (target tick count on y; by default it follows the chart height).
- Every chart gets a "Show data" table (`"table": false` turns it off). `"height": 280` fixes
  the height.
- JS: `Report.chart("cost-vs-hours")` → handle with `.update(spec)`, `.cursor(x)` (a vertical
  time cursor), `.toggle(seriesKey, hidden)`. `ReportCharts.draw(el, spec)` draws into any element, and `ReportCharts.legend(series)`
  returns the legend HTML.
- Pick the type by the job: line for change over a continuous axis, bar to compare
  magnitudes, stack for parts of a whole, range for spreads and disagreeing measurements. A
  single headline number is a live value or a KPI, not a chart. Never use two y-axes. Fold
  anything past 6 series into "Other".

## Box diagram
Architectures, stacks and "what you own" pictures, as HTML boxes, with levels of detail.
```html
<figure class="boxes" data-levels="Overview|Components|Effort" data-weights-at="2">
  <div class="lanes">
    <div class="lane">
      <h4>Rent: E2B or Modal</h4>
      <p class="lane-sub">you own the top two boxes</p>
      <div class="box">Your agent / app</div>
      <div class="box">E2B or Modal SDK</div>
      <div class="box vendor" data-to="0">Vendor platform<small>control plane, scheduler, snapshots…</small></div>
      <div class="group" data-from="1"><p class="group-title">Vendor-owned</p>
        <div class="items"><div class="box">control plane</div><div class="box">scheduler</div></div></div>
    </div>
    <div class="lane">
      <h4>Self-host</h4>
      <div class="box">Your agent / app</div>
      <div class="box strong" data-to="0">Your platform<small>8 components you build and run</small></div>
      <div class="group" data-from="1"><p class="group-title">You own every box</p>
        <div class="items">
          <div class="box" data-weight="3">API + lifecycle<small>auth, rate limits</small><span class="badge" data-from="2">2–4 mo</span></div>
          <div class="box" data-weight="1.5">Scheduler<span class="badge" data-from="2">1–2 mo</span></div>
        </div></div>
      <div class="box hl">jailer → Firecracker → KVM</div>
    </div>
  </div>
  <figcaption>What you own in each path. <span data-to="0">Overview: …</span><span data-from="1">…</span></figcaption>
</figure>
```
- Lanes are columns that stack on a phone. Consecutive boxes in a lane get arrows
  (`data-arrows="none"` on a lane turns them off). `.group > .items` is a grid of smaller boxes.
- Box modifiers: `vendor`/`dim` (dashed, not yours), `strong`, `hl` (accent).
  `small` gives a sub-line, `.badge` a pill in the corner.
- `data-weights-at="2"`: from level 2, each `.items` grid becomes a treemap whose box areas
  are proportional to `data-weight` (effort, cost, share), in the author's order. Use
  `data-weighted` on the figure to make it a treemap at every level.

## Layered figure
Any figure (or other element) with `data-levels="A|B|C"` gets level buttons. Inside it,
`data-from="n"` / `data-to="n"` show an element only from or up to level n (0-based), and
`data-level="1"` sets the starting level. Use it to zoom a diagram, chart or table from
overview to detail, and to make the caption follow the level. Without JavaScript, all levels
show.

## Photo
```html
<figure class="photo" data-zoom>
  <img src="images/datacenter.jpg" alt="What the image shows" loading="lazy" width="1280" height="638">
  <figcaption>What to notice in it. <span class="credit">Photo: Hetzner Online GmbH, CC BY-SA 4.0<a class="cite" href="#src-photo"></a></span></figcaption>
</figure>
```
Download images into `site/images/`, keep each under about 400 KB and 1600 px wide, and open
the file to check that it really shows the subject. `data-zoom` adds a full-size view.

## Table
```html
<div class="table-wrap"><table class="compare">
  <thead><tr><th></th><th>E2B</th><th>Self-host</th></tr></thead>
  <tbody><tr><th>Isolation</th><td class="good">microVM</td><td class="mid">as strong as your config</td></tr></tbody>
</table></div>
```
`good`/`mid`/`bad` mark qualitative cells, `best` highlights one cell, and `num` right-aligns
numbers. Keep the `.table-wrap` so wide tables scroll on a phone.

## Shared blocks
Semantic markup that every template styles its own way. Use the blocks that earn their place.
```html
<section class="tldr" id="tldr">…</section>                     <!-- required, first -->
<ol class="findings"><li><strong>Claim.</strong> Evidence.</li></ol>
<div class="reconcile">                                         <!-- credible sources disagree -->
  <div class="claim"><h4>Vendor A says</h4><p>…</p></div>
  <div class="claim"><h4>Benchmark B measured</h4><p>…</p></div>
  <div class="verdict"><h4>Best reading: …</h4><p>The reasoning or arithmetic.</p></div>
</div>
<ol class="recs"><li data-priority="high|medium|low"><strong>Do X.</strong> Why, and what it depends on.</li></ol>
<ul class="risks"><li data-level="high|medium|low|unknown"><strong>Risk.</strong> Impact, and how to reduce it.</li></ul>
<ol class="next"><li><strong>Action.</strong> What it settles.</li></ol>
<aside class="callout" data-kind="note|key|warn|tip">…</aside>
```

## Custom visuals and scripts
If the topic needs something the core and the template don't have, build it in
`site/assets/custom.js` / `custom.css`. Every skeleton has commented-out lines for both:
custom.css after template.css, and custom.js after template.js. Read colours from
the variables (`var(--accent)`, `--ink`, `--s1…--s6`), and use `Report.observeResize(el, fn)`
to redraw at new widths. Inline scripts run before the deferred core, so wrap them:
```js
document.addEventListener("report:ready", function () { /* Report.* is ready */ });
```
Respect `prefers-reduced-motion` (`Report.reduceMotion`).
