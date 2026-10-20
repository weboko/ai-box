# Roadmap template (Growth Roadmap)

The decision as a project schedule. A sticky time ruler (named eras, a today line, a playhead
rail with detents) sits above Gantt swimlanes: chart lanes bound to the model, strip lanes, and
item lanes of milestones and bars. The reader drags the playhead (or uses ← → PgUp PgDn Home
End) and one cursor moves through every lane, chart and read-out. Milestones preview their card
on hover or focus; pinning keeps cards open side by side with their detail. Below 900px the
lanes become a vertical spine of steps that the ruler follows. Shared markup: `../core.md`.
Worked example: `examples/roadmap/index.html` (+ `examples/roadmap/assets/model.js`).

## When to use it
- The answer depends on **when**: a threshold reached as usage grows, a break-even month,
  dated evidence (price changes, releases, benchmarks), a phased plan with a decision gate.
- There is (ideally) a model whose outputs change per step and inputs the reader would vary.

Not for: content with no time axis, a single static comparison, an argument to read top to
bottom (use Longread or Paper), or many parts whose structure matters more than their order.
A roadmap without a model still works (items lanes only), but then a list may be enough.

## Page skeleton
```html
<header class="rm-head"><div class="rm-head-in">
  <div class="rm-head-main"><h1>…</h1><p class="sub">…</p></div>
  <div class="rm-head-side"><p class="rm-legend" data-ev-legend="all"></p>
    <details class="rm-meta"><summary>Report details</summary><div class="meta-panel"></div></details></div>
</div></header>
<main>
  <section class="tldr" id="tldr"><h2>TL;DR</h2><p class="lede">L0</p><p>L1</p>
    <div class="verdict">…live, at the cursor…</div>
    <details><summary>Key findings…</summary><ol class="findings">…</ol></details></section>
  <section class="rm-sim"><div class="rm-sim-row"><h2>Simulate growth</h2><div data-controls="hours growth"></div></div></section>  <!-- model param keys -->
  <div class="roadmap" id="timeline" data-unit="month" data-from="-9" data-to="24" data-today="2026-10-18" data-rows="timeline">
    <h2>Timeline</h2>
    <ol class="eras">…</ol>
    <p class="rm-readout">…</p>
    <template class="rm-step">…</template>
    <section data-lane="usage">…chart…</section>
    <section data-lane="events"><h3>…</h3><ol class="items"><li …>card</li></ol></section>
  </div>
  <section class="block" id="costs" data-nav="Costs"><h2>Costs</h2>…</section>
  …
  <section class="block" id="sources"><h2>Sources</h2><ol class="sources">…</ol></section>
</main>
```
Load order is in the skeleton (`assets/templates/roadmap/index.html`). Everything inside `main`
is width-limited for you; the engine inserts the sticky ruler right before `.roadmap`.

## The time axis: `.roadmap` attributes
| Attribute | Meaning |
|---|---|
| `data-unit` | `month` (default), `quarter`, `week`, `year`, `day`. Drives labels ("Jan 27", "Q1 27"). |
| `data-from` / `data-to` | Domain in units from today; negative = past. |
| `data-start` | First simulated step (default 0 = today). The playhead runs `start…to`. |
| `data-today` | ISO date of "today" (`2026-10-18`). Without it, labels are relative only ("M3"). Fractional times map to the calendar exactly, not floored: whole units from today (same day of month), then the fraction as days (month ≈ 30.44 days). Month 4.8 from 20 Oct 2026 is ≈ 14 Mar 2027, labelled "Mar 2027"; the number shows to one decimal ("month 4.8"). |
| `data-today-label`, `data-today-note` | Text on the today line / in the spine. |
| `data-tick`, `data-page`, `data-step` | Ruler tick spacing, PgUp/PgDn step, playhead step (units). |
| `data-rel`, `data-unit-label` | Relative prefix (`M` → "M3") and unit word ("month 21"). |
| `data-rows`, `data-x` | Path to the model's per-step rows and their time key (default `t`). |
| `data-scrub-label`, `data-scrub-hint`, `data-past-label` | Ruler gutter text, past-shade label. |
| `data-cursor` | Starting playhead position. |

### The model for a roadmap
Put the time model in `assets/model.js` (core `Report.model`). `compute(p)` returns, besides
its normal outputs, **one row per step** and **named moments**:
```js
compute: function (p) {
  var timeline = [];
  for (var t = 0; t <= 24; t++) { var H = p.hours * Math.pow(1 + p.growth / 100, t);
    timeline.push({ t: t, usage: H, costA: …, costB: …, cheapest: "a", cheapestName: "Option A" }); }
  return { …, timeline: timeline,
    moments: { gate: 21, beMonth: 19.9, beIn: true, buildStart: 22, breakEvenPoint: { x: 19.9, y: 5474 } } };
}
```
- Return `null` for a moment that does not happen within the domain; bound items then hide
  (or show their `data-off-label`), bound eras hide, and detents disappear.
- Return booleans for `data-show-if` (`moments.gateIn`), since `0` is falsy.
- The playhead is not a model param: moving it never recomputes. It sets the engine's cursor,
  fires `Report.on("cursor", fn(t, row))` (`report:cursor` on `document`), and re-binds the
  `data-cursor-*` elements below. `Roadmap.seek(t)`, `Roadmap.t`, `Roadmap.row(t)` are public.

## Markup contract
**Eras** (`ol.eras > li`): named phases on the ruler. Class = kind, coloured by the template:
`past`, `now`, `watch`, `gate`, `build`, `phase`. `data-at` / `data-until`, or `data-at-bind` /
`data-until-bind`. `data-short` is used when the chip is too narrow. Era text may contain
`data-show-if` spans; hidden ones are dropped. Eras never overlap, whatever the sliders do:
- An era is visible only if its start is known (not `null`), before `data-to`, and before its own
  `data-until` (if set); invisible eras don't cut the others.
- Visible eras are sorted by start (tie: the later one in markup wins).
- Each ends at its `data-until` or at the next visible era's start, whichever is earlier. With no
  `data-until` (or a bound `null`), it ends at the next visible era's start, else at `data-to`.
- An era whose end is not after its start is hidden.
So bind only the starts that move (`data-at-bind="moments.prepStart"`); you rarely need extra
moments for ends. A `data-until` only matters when you want a gap before the next era.

**Lanes** (`section[data-lane]`, direct children of `.roadmap`, in display order). `h3` + optional
`p.lane-sub` go into the single label gutter. Kinds:
- **Item lane**: contains `ol.items`. Each `li` is a card (see below). `data-min-height` (px).
- **Chart lane**: contains one core `figure.chart` with a `line` spec. The engine fills
  `x.key` (= `data-x`), `x.min` (= `data-start`), `x.max` (= `data-to`) and `bind` (= `data-rows`),
  then aligns the plot with the ruler; y tick labels fall into the empty past area. Use `height`
  (100–170), `y.log` for growth (core starts it at the decade below the data; `y.ticks` sets the tick count), short
  `short` names (they sit in the 84px right pad), `"cursorLabel": "<series key>"` to label the
  cursor mark, `"cursor": false` on a series to skip its ▲ cursor mark.
- **Strip lane**: `data-strip="<row key>"` + `data-cats="key=Label|key=Label"`: one coloured cell
  per step by category (colours `--s1…` in `data-cats` order: keep it the same as the chart
  series order). Optional `data-strip-value="<row key>"` + `data-format` for the cell tooltip.
- `data-narrow="hide"` drops a chart or strip lane from the narrow layout (keep one chart).

**Cards** (`ol.items > li`), the depth mechanism:
```html
<li id="m-gate" data-at-bind="moments.gate" data-ev="interpretation" data-label="Decision gate"
    data-off-label="No gate ≤ 24 mo" data-detent="past the decision gate">
  <h4>Decision gate — month <span data-out="moments.gate">21</span></h4>   <!-- card title -->
  <p class="kicker">Triggered by …</p>                                     <!-- meta line -->
  <p>L1: the short paragraph shown on hover.</p>
  <details class="more"><summary>Detail and derivation</summary>…L2/L3…</details>
</li>
```
- Position: `data-at` (units), `data-date` (ISO, converted with `data-today`) or `data-at-bind`.
  Add `data-until` / `data-until-bind` for a bar, `data-soft` / `data-soft-bind` for a hatched
  "could run this long" extension, `data-style="plan|watch|build|ops"` for the bar colour.
- `data-ev` = the shape before the label (● fact ▲ estimate ■ assumption ◆ interpretation),
  from core's evidence kinds. No `.ev` class on the `li`.
- `data-label` = the chip on the lane (short); default is the `h4` text. `data-when` overrides
  the generated time text ("month 21 · Jul 2028", or the date for `data-date`).
- `data-off-label`: when the bound position is `null` or past `data-to`, show this muted label
  at the end instead of hiding the item; `data-off-when` replaces its time text.
- `data-detent` = a detent on the playhead rail (hollow until passed); its value is the read-out
  chip once passed ("past the decision gate"). Use it for one to three moments that matter.
- `data-muted`, `data-wide` (pinned card spans two columns; automatic if it holds a figure/table).
- Give every card an `id`: findings, recommendations and other links point at it (`href="#m-gate"`)
  and the engine pins/opens the card. Citations and links inside closed cards work the same way.

**Cursor bindings** (anywhere, typically in `.verdict`, `.rm-readout`, `template.rm-step`):
`data-cursor-out="<row path>"` (+ core `data-format`, `data-digits`, `data-suffix`…),
`data-cursor-time` (`""` → "M3 · Jan 2027", `rel`, `short`, `label`), `data-cursor-era`,
`data-cursor-if="<path>"` / `"!<path>"`, and `<i class="swatch" data-cursor-cat="<key>">` (strip
colour). Write the step-0 value inside, like `data-out`. Core `data-out` keeps working for
values that don't depend on the cursor (moments, totals).
- `.rm-readout` is moved into the sticky ruler after the era name and the time chip.
- `template.rm-step` is the content of each step row in the narrow spine (same bindings,
  evaluated per row).
- `figure.chart[data-cursor="<row key>"]` anywhere: its core cursor line follows that row value
  (e.g. a cost-vs-hours chart follows `usage`); `data-cursor=""` follows `t`.

**Controls**: any `[data-controls="hours growth"]` gets core's standard sliders (`Report.controls`)
for those keys, which are the model's param keys (`params[].key` in `model.js`); empty = all
non-hidden params. Without JavaScript `.rm-sim` and `details.rm-inputs` are hidden, so state the
defaults in the `p.rm-nojs` line.
`.rm-sim > .rm-sim-row` lays them out in one row above the ruler; use `details.rm-inputs` in a
block for the secondary assumptions.

**Navigation** is generated: TL;DR, the roadmap, then every `section.block` (label = `data-nav`
or its `h2`), plus "Pinned (n)" while cards are pinned. The current section is highlighted.

### Recipe: a cumulative or payback lane
A line that starts negative (one-off cost, then monthly savings). Use a linear y axis (log
can't show negatives); core extends it below 0 by itself, and `y.min` / `y.max` accept
`{"bind": "path"}` if you need a fixed range.
```js
var cum = -p.migrationCost, payback = null;          // in compute(), after building rows
rows.forEach(function (r) { var prev = cum; cum += r.saving; r.cumulative = cum;
  if (payback == null && prev < 0 && cum >= 0) payback = r.t - 1 + -prev / (cum - prev); });
moments.payback = payback; moments.paybackPoint = payback == null ? null : { x: payback, y: 0 };
```
```html
<section data-lane="payback"><h3>Payback</h3><p class="lane-sub">cumulative $, from −migration cost</p>
  <figure class="chart" id="lane-payback"><script type="application/json">
  { "type": "line", "height": 140, "y": { "format": "currency" },
    "series": [ { "key": "cumulative", "name": "Cumulative saving", "short": "Net" } ],
    "points": [ { "bind": "moments.paybackPoint", "label": "payback" } ] }
  </script></figure></section>
```
Add a milestone with `data-at-bind="moments.payback" data-detent="past payback"` so the
moment is also a card and a detent on the playhead rail.

## Core pieces, placed
- TL;DR: `.lede`, one paragraph, `.verdict` (live), findings inside a `details`, each with an
  `a.rm-onto` "on timeline" link to its card.
- Evidence: shapes before each `.ev` (combined kinds show two shapes); keep `data-note` for
  derivations. The header legend is `p.rm-legend[data-ev-legend]`.
- Charts that are not about time (cost vs volume, ranges) go in blocks or in a card's `.more`.
- Box diagrams / layered figures fit in a card's `.more` (they work when pinned).
- `.reconcile` (disagreements) inside `details.disp` in a block; link to it from the dated cards.
- `ol.recs`, `ul.risks`, `ol.next`, `table.compare` in blocks. Add `class="stack"` + `data-label`
  on cells for wide tables that should stack on a phone. `.calc` = monospace derivation box.

## Brief levels → template
- **L0**: TL;DR `.lede`; each milestone's `data-label`; era names.
- **L1**: TL;DR paragraph; card `h4` + first paragraph (hover/focus preview).
- **L2**: card `details.more` (open in pinned cards), lane charts, the verdict.
- **L3**: `.calc` derivations and `data-note`s inside `.more`; reference blocks (rates, tables,
  disagreements) below the timeline.
Time section of the brief → eras, dated items (`data-date`), computed moments. Model section →
`assets/model.js` with `timeline` rows and `moments`.

## Mobile and no-JS
- Below 900px: the ruler stays sticky (thin eras, fewer ticks), item lanes become a vertical
  spine of steps with era headers, a today divider and expandable cards. Scrolling the spine
  moves the playhead; dragging the playhead scrolls the spine (once the reader is in it).
  Chart and strip lanes stack as normal charts unless `data-narrow="hide"`.
- Without JavaScript: eras show as a phase list, each item lane as a list of cards (title,
  kicker, L1, collapsible detail), data-only lanes are hidden, and all blocks read normally.
  Write a `p.rm-nojs` line stating the defaults the static list reflects.

## Trying it (public hooks)
`Roadmap.seek(t)`, `Roadmap.t`, `Roadmap.row(t)`, `Roadmap.pin(id)` / `unpin(id)` / `pinned`;
the playhead is `input.rm-range` (arrows, PgUp/PgDn, Home/End); lane cards are
`button[data-rm-item="<li id>"]` (hover/focus = preview, click = pin); spine cards (narrow) are
`button[data-rm-vt="<li id>"]`; pinned cards are `[data-rm-card="<li id>"]`.
```python
page.focus(".rm-range"); page.keyboard.press("End")                  # playhead to the end
print(page.evaluate("Roadmap.t"), page.inner_text(".rm-ro"))         # cursor + read-out
page.click("[data-rm-item='m-gate']"); assert page.is_visible("[data-rm-card='m-gate']")
page.evaluate("Report.set('growth', 5)"); page.evaluate("Roadmap.seek(0)")
```

## Pitfalls
- Chart lanes must use `type: "line"` with numeric `t`; rows should cover `data-start…data-to`.
- Keep lane chart `short` names ≤ 10 characters, or they spill out of the right pad.
- `data-cats` order must match the chart series order, or colours disagree between lanes.
- A bound moment of `0` is falsy in `data-show-if`; return a boolean (`beIn`).
- Dense evidence near today stacks into rows; keep `data-label`s short (2–4 words).
- Don't put the same figure in two cards: one card holds it, the others link to it.
- Projected positions are estimates: tag growth inputs as `assumption` and say so in the sim.
- Static comparisons don't belong on the time axis; put them in blocks.

## Checklist
- [ ] `.roadmap` has unit, from/to, today, tick, page (and rows/x with a model).
- [ ] Every card has an `id`, `data-ev`, a short `data-label`, an `h4`, an L1 paragraph.
- [ ] Bound items, eras and detents disappear or show `data-off-label` when moments are null.
- [ ] Verdict, readout and step template use `data-cursor-*` with defaults written inside.
- [ ] Findings and recommendations link to their cards.
- [ ] One to three detents; no detent on an item that is off the axis.
- [ ] `check.mjs` passes; scrub to both ends, change an input, pin two cards, check 390px.
