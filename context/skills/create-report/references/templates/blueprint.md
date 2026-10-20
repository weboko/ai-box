# Blueprint: the report as one zoomable engineering drawing

A cyanotype sheet the reader pans and zooms. Zoomed out (L0) every region is a numbered label;
closer (L1) each region shows its summary; closer still (L2) the summary swaps for full detail.
A minimap, a breadcrumb and a guided tour (‹ › or N / P) keep readers oriented; "Read as list"
turns the same page into a plain document. Evidence is line style; disputes are revision clouds.

Worked example: `examples/blueprint/index.html`. Shared markup: [`../core.md`](../core.md).

## When to use it
- The relationships between parts are the point: a system architecture, a build-vs-buy with
  components and effort, an ecosystem map. One diagram can be the centrepiece.
- 8–20 sections that can sit side by side (context, costs, disputes, calculator, sources…).
- Readers who explore rather than read top to bottom.

Not for: an argument meant to be read in order, a report with fewer than about 5 sections, a
story driven by time, or an audience mostly on phones (they end up in the list view).

## Page skeleton
Start from `assets/templates/blueprint/index.html` (filled by `new-report.sh`). Keep the inline
`<script>` in `<head>`: it switches to the drawing before first paint.
```html
<header class="bp-title">                       <!-- title block -->
  <h1>Title</h1> <p class="dek">Neutral framing.</p>
  <p data-ev-legend="all"></p>                  <!-- becomes the LINE KEY -->
  <dl class="fields"><div><dt>Date</dt><dd><time data-meta="date">2026-10-18</time></dd></div></dl>
  <details><summary>Metadata</summary><div class="meta-panel"></div></details>
</header>
<main class="sheet">
  <section class="tldr region" id="tldr" data-title="TL;DR" data-gloss="Rent: E2B first">
    <h2>TL;DR</h2>
    <div class="lod1">summary prose</div>
    <div class="lod2 cards"><article class="card" data-crumb="The answer"><h3>The answer</h3>…</article></div>
  </section>
  <section class="region" …>…</section>
  <section class="region" id="sources" data-title="Sources" data-span>
    <h2>Sources: parts list</h2><div class="lod2"><ol class="sources">…</ol></div>
  </section>
</main>
```
Write `class="tldr region"` with `tldr` first: `publish.sh` looks for `class="tldr`.

## Markup contract
**Regions.** Every piece of content lives in a `section.region` that is a direct child of
`main.sheet`. Source order is reading order: it sets the balloon numbers, the tour and the
list view. Attributes:
- `data-title`: short name (1–3 words) for the L0 label, breadcrumb, minimap and tour.
- `data-size="s|m|l|xl"`: width class (default `m`). Use `l` for wide tables or a calculator,
  `xl` for the centrepiece diagram. Never set pixel widths, heights or positions.
- `data-span`: full width of the sheet (sources). `data-col="2"`: start column 2 here.
- `data-gloss`: a red handwritten note under the L0 label (the one-line answer).
- `data-l0="top"`: put the L0 label at the top, so the region's picture shows beneath it.
- `data-list="open"`: show its detail expanded in the list view.
- `data-list-template="id"`: append a `<template id>`'s content in the list view only.
- First child: an `<h2>` (the balloon number comes from CSS). A `<span class="stamp">AI
  judgement</span>` inside the h2 marks a region that is wholly interpretation.

**Auto layout.** The engine measures each region at its width class, packs them into balanced
columns (3 on desktop, 2 on a phone) without breaking reading order, and sizes the sheet to
fit. A column is as wide as its widest region; narrower regions sit side by side when they fit
(two `m` beside an `xl`), and a lone narrower one grows at most 25%. Regions grow with their
content; nothing is clipped. Keep most regions `m` so the summaries keep a readable measure.

**Depth = layers.** Each direct child of a region is one of:
- `.lod1`: the summary, shown at L1 only. Short: a big sentence, a few bullets, tiles.
- `.lod2`: the detail, shown at L2 only, swapped in place of `.lod1` (they share one cell, so
  zooming never moves anything). Put it in `.card`s: each card is a tour stop and a breadcrumb
  node (`data-crumb`, else its first heading).
- no class: shown at L1 and L2 (figures, photos, diagrams). A `figure.chart` here is drawn
  twice: a simple copy at L1, the full chart with "Show data" at L2.
The layers zoom their content so ordinary sizes stay legible at their threshold (≥ 11 px on
screen). Never set font sizes in px; use the components below and plain markup. Put `lod`
classes only on direct children of a region. `.canvas-only` hides an element in the list
view; `.list-only` hides it on the drawing.

**Navigation (built by the engine).** Breadcrumb from the region and the `[data-crumb]` /
`.card` under the view centre; minimap; tour: each region at L1, then its cards (or its whole
detail, or screen-sized parts of a big card-less block) at L2; `[data-stop]` adds a stop.
Links inside the drawing (citations, `href="#id"` cross-references, back-links) fly to their
target and show a "Back to …" chip. Keys: + − zoom, arrows pan, N / P tour, 0 whole sheet,
H start, L list, Esc back.

**Core pieces in the drawing.**
- Evidence `.ev[data-ev]`: solid underline = fact (cite right after), dashed = estimate, dotted =
  assumption, red handwriting = interpretation. Blocks get the line as a left rule, table cells
  under the cell, `.box.ev` as the box outline. The `[data-ev-legend]` in the title block is the
  line key; put a second one in the TL;DR summary.
- Charts: core specs. Estimate series dash, the `params.*` marker is the dotted highlighter
  "you". Line-chart tooltips work on the drawing and in the list view.
- `.boxes` with `data-levels` follow the zoom (level 0/1/2 at L0/L1/L2; buttons only in the
  list view). With `data-weights-at`, core lays `.items` out as a treemap: box area ∝
  `data-weight`, in your order. Lane widths follow `data-weight` on `.lane`. Box modifiers: `vendor` (hatched,
  not yours), `strong`, `hl` (highlighter), `tiny`, `ruled-out` (struck through).
  `<p class="dimension">12–18 months</p>` inside a `.group` draws a vertical dimension line.
- `.region.cloud` + `data-mark="A"`: revision cloud, balloon △A. Use for disagreements; put
  `.reconcile` (claims + verdict, each also a `.card`) in its `.lod2`.
- Model: `[data-controls="key1 key2"]` renders `Report.controls` (dotted = assumptions);
  `data-out` everywhere; core's `[data-highlight="path=value"]` marks a row or tile;
  `<ul class="warnings" data-out="warnings" data-show-if="warnings" hidden>` lists an array.
- Sources: one `ol.sources` inside a `.lod2` block of a `data-span` region. The engine adds the
  L1 parts list and a "used in: 03 Context · …" line to each source.

## Components unique to the template
| Markup | Use |
| --- | --- |
| `.cards` (`data-cols="2|3|4"` optional) > `.card` | L2 detail units and tour stops |
| `p.big` | the headline sentence of a summary |
| `dl.tiles > div > dt + dd` | 2–4 headline numbers at L1 |
| `dl.tags > dt + dd` | labelled lines: Side 1 / Side 2 / Resolved, Claim / Measured |
| `.columns > div > h3 + p` | 2–4 options side by side at L1 |
| `.formula` (`p`, `span` or `pre`) | monospace working: arithmetic, derivations |
| `dl.outs > div > dt + dd` | calculator outputs (dashed = estimates) |
| `.redline` (with `.ev[data-ev=interpretation]`) | a red note pencilled onto a diagram |
| `.stamp` | "AI judgement" stamp in a heading |
| `.hint` | quiet UI hint (add `canvas-only`) |

## Brief levels → template
- **L0** (one line): the region's `data-title`, plus `data-gloss` on the TL;DR.
- **L1** (short paragraph): the region's `.lod1`.
- **L2** (detail): `.lod2` cards: tables, lists, reconcile blocks, calculator inputs.
- **L3** (derivation): inside L2: `.formula` blocks, `data-note` on estimates, a card for the
  working, "Show data" on charts.
- Visuals named in the brief: un-classed figures (L1 + L2). The centrepiece diagram is a
  `.boxes` figure in an `xl` region with `data-l0="top"`.

## Mobile and no-JS
- Phone: the same drawing in two columns of narrow regions, title block on top, tour and zoom in
  a bottom bar, minimap small (hidden at L2). The overview (0 / L0) fits the sheet's width and
  starts at the top; pan down for the rest. Lanes stack when narrow. "Read as list" is one tap.
- No JavaScript (and "Read as list"): a full-detail document in reading order: title block as the
  header, every region with summary and detail, cloud regions boxed in red. Charts and controls
  need JS, so tables and `data-out` defaults must carry the numbers.

## Pitfalls
- A region without `.lod1` opens at L2 directly and has no summary at L1. Give every region both,
  except sources.
- Long `.lod2` prose without cards: the tour pans it in screen-sized parts. Prefer cards.
- A card taller than about two screens at L2 is flagged; split it.
- Long `data-title`s shrink the L0 label until it is unreadable; keep them to 1–3 words.
- Text sized in px or very small classes fails the legibility guard. Open the page with `?dev`:
  offending text is outlined and listed (the console always gets the warnings).
- Un-classed blocks are L1-sized: a long paragraph without a class becomes huge at L2.
- Persistent figures are L1-sized, so keep their labels short; put the long caption in `.lod2`.
- Duplicate numbers in prose must be `data-out` or say "at the report's defaults".

## Checklist
- [ ] `class="tldr region"` first; every region has an `<h2>`, a short `data-title`, a size class.
- [ ] Every region has `.lod1` (summary) and `.lod2` (cards), except sources.
- [ ] The centrepiece is a `.boxes` figure with levels; weights where area should mean effort.
- [ ] Disagreements are `.region.cloud` with `data-mark` and a `.reconcile`.
- [ ] Line key in the title block and the TL;DR; evidence marks on the claims that matter.
- [ ] One `ol.sources` in a `data-span` region.
- [ ] `?dev` shows no legibility issues; `check.mjs` passes; walk the tour once at 390 and 1440.
