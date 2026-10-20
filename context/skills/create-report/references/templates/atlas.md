# Template: atlas (The Atlas)

The report drawn as a map. The world page holds the title, TL;DR and key in a cartouche above
a generated map. Each **region** is a plate (a page); **places** inside a region are pages of
their own that hold the derivations. Point at, tap or Tab to a territory to preview it; click,
tap again or Enter to open it. A locator inset marks "you are here", breadcrumbs and a
gazetteer index give every page a grid reference, and plates the reader opened are flagged as
charted. Worked example: `examples/atlas/index.html`. Shared markup: `../core.md`.

## When to use it
- 4–9 distinct areas the reader explores in any order: market or landscape surveys,
  architecture overviews, multi-option comparisons, build-vs-buy with several parts.
- The areas differ in size or weight, have sub-parts, and some ground is contested.
- "Where does this fit relative to everything else" matters.

Not for: a linear argument read top to bottom (use a longread or paper), one or two sections,
answers that hinge on dates (roadmap), or a live-number dashboard. The map shows relative
weight, not real geography; if regions have no meaningful sizes, set equal weights.

## Page skeleton
```html
<header class="atlas-top"><a class="brand" href="#world">Short atlas name</a></header>
<main id="main" tabindex="-1">
  <section class="world" id="world" data-weight-means="What territory size means.">
    <header class="cartouche">
      <div class="ct-title"><h1>Title</h1><p class="ctail">Dek</p>
        <p class="csub">Kicker · <time data-meta="date"></time></p>
        <p class="ckey"><b>Key</b> <span data-ev-legend="all"></span></p></div>
      <section class="tldr" id="tldr"><h2>TL;DR</h2><p class="l0">L0</p><p>L1</p></section>
    </header>
    <div data-map></div>                       <!-- the world map is drawn here -->
    <section class="highlights"><h2>Survey highlights</h2><ol class="findings">…</ol></section>
  </section>
  <article class="plate" id="r-costs" data-region data-name="Cost Plains" data-weight="3" data-l0="…">
    <h2>Cost Plains</h2><p class="l0">…</p>
    <div class="lead">…</div>                  <!-- sits beside the plate map -->
    <section><h3>…</h3>…</section>
    <article class="place" data-place id="p-pass" data-name="Break-even Pass" data-kind="point" data-l0="…">
      <h3>Break-even Pass</h3><p class="l0">…</p>…
    </article>
  </article>
  … more plates …
  <section class="atlas-sources" id="sources"><h2>Sources</h2><ol class="sources">…</ol>
    <details class="colophon"><summary>Colophon</summary><div class="meta-panel"></div></details></section>
</main>
```
Start from `assets/templates/atlas/index.html`; replace every `TEMPLATE-TODO`.

## Markup contract
**Pages.** `section.world`, every `article.plate[data-region]`, every `article.place[data-place]`
and the sources section become pages; the engine adds the gazetteer (`#index`). Only one page
shows at a time. Every in-page link is a route: `href="#r-costs"` opens that plate,
`href="#p-pass"` that place, `href="#some-id"` the page containing that element, scrolled to
it. Citations open the sources page and flash the entry. Back/Forward return to the same
scroll position. Give every plate and place a stable `id` (`r-…`, `p-…`); never `#main`.

**Regions** (`article.plate[data-region]`, in reading order; numbered I, II, III…):
- `data-name` (full name), `data-l0` (one line for previews and the index; falls back to
  the first `p.l0`), `data-label` (short map label), `data-sub` (small map sub-label).
- `data-weight` = relative area on the world map (default 1). Keep weights honest: if area
  means nothing, use equal weights and say so in `data-weight-means` on `.world`.
- `data-kind`:
  - `land` (default): a territory in the main landmass (squarified treemap, organic borders).
  - `disputed`: land, hatched, with contested red borders. Use for credible disagreements.
  - `island`: a small island in the sea strip. Use for tools and side plates (calculator,
    comparison table).
  - `reef`: a dotted reef with hazard marks. Use for risks.
  - `route`: a dashed road between two regions (`data-from`, `data-to` = region ids). Use for
    the trade-off comparison between options.
  - `flag`: the expedition flag at the top-left with a trail to `data-to` (a place or region
    id). Use for the recommendation and next steps.
- `data-unit="engineer-month"`: the region's place areas are drawn to scale; the legend gets
  a scale square. Only set it when place weights are real quantities.
- `data-ridge="<chart id>"`: draws that line chart's series as ridges inside the region,
  live with the model. `data-ridge-series="a,b"` picks series; `data-ridge-pass="pass · {x} h"`
  marks where the first two cross (`{x}` = crossing, `{path}` = any model value, e.g.
  `{breakEven}`).
- `data-tint="1…6"` overrides the land colour; `data-shape="M…Z"` replaces the generated
  outline with a hand-drawn SVG path in the 1000×640 frame (rarely worth it).
- `data-map="none"` drops the plate map; `data-map="show"` forces one on a land region with
  no places. Put `<div data-map></div>` inside a plate to choose where the map goes.

**Places** (`article.place[data-place]`, nested inside their region, or anywhere with
`data-region="<region id>"`): `data-name`, `data-l0`, `data-label`, `data-sub`, `data-n`
(number badge), `data-weight` (area inside the region), `data-kind="point"` (a survey point
instead of a district: landmarks, single facts, derivations). A land region with area places
gets a name band on top; point places line up along its bottom.

**Generated chrome** (don't write it): plate heads with "Plate II · H3", the plate map with
its places, "Places in this region", "Other plates" (with charted flags), place
previous/up/next links, the world plate list ("Charted n of N"), the legend panel, the locator
inset, breadcrumbs, the Index/Legend/Sources tools. `<p data-uncharted></p>` (put it in the
recommendation plate) becomes "Still uncharted: …".

**Core pieces in the atlas.** Evidence marks render as cartographic symbols: survey point •
(fact) before the `[n]`, dashed ring ◌ (estimate; the ring is the button that opens
`data-note` as a calculation strip), triangle △ (assumption), nib ✎ (interpretation, italic).
Charts, box diagrams, layered figures, tables, photos, `.reconcile`, `ol.recs`, `ul.risks`
(hazard triangles), `ol.next` work as in core.md. Also: `<p class="calc">` for a derivation
line, `<div data-controls="k1,k2"></div>` for the model's sliders,
`.tiles[data-best="cheapest"] > .tile[data-key]` (highlights the tile whose key equals the
model value), `<ul class="warn" data-list="warnings" data-show-if="warnings">` (a model array
as a list).

## How the brief maps on
| Brief | Atlas |
|---|---|
| Title, dek, kicker | cartouche `h1`, `.ctail`, `.csub` |
| TL;DR L0 / L1 | `.tldr .l0` / the paragraph after it |
| Findings | `.highlights ol.findings`, each ending in a `.seeplate` link to its plate |
| Section L0 | the plate's `p.l0` (+ `data-l0` if the line is long) |
| Section L1 | `.lead` beside the plate map |
| Section L2 | `section`s in the plate: charts, tables, diagrams |
| Section L3 | places: derivations, `.calc` lines, source tables, `data-note`s |
| Disagreements | a `disputed` region; one place per disagreement with a `.reconcile` |
| Model | an `island` plate with `data-controls`, tiles, the chart, formulas |
| Comparison table | a `route` plate |
| Risks | a `reef` plate with `ul.risks` |
| Recommendation, next steps | the `flag` plate, with `data-uncharted` |
| Sources, metadata | `section.atlas-sources` with the colophon `.meta-panel` |

Pick regions from the brief's sections: one region per distinct area, sized by how much it
weighs. Turn the sub-parts of an area into places. 4–9 regions and 0–10 places per region
read well; past that, labels truncate and the phone map turns into numbered badges.

## Mobile and no-JS
- Phone: the world map shrinks to Roman-numeral badges; a tap shows the preview as a bottom
  sheet and a second tap opens it; the locator inset is a chip at the bottom right; tables
  scroll sideways; claims and reconciliations stack.
- Keyboard: Tab walks the territories (preview on focus), Enter opens, Esc closes the
  preview, legend or inset. Every page focuses its heading on arrival.
- Reduced motion: no fly-in, no marker glide or pulse.
- Without JavaScript there is no map: the page reads as one document, world → plates with
  their places nested → sources. Write it so that order makes sense, and keep every number in
  the HTML (live values hold their defaults).

## Pitfalls
- Don't hand-write the plate list, place lists, breadcrumbs or index; they are generated.
- Don't nest a plate inside another plate, or a place inside a place.
- Long names get truncated on the map: give a short `data-label`.
- A `route`'s `data-from`/`data-to` and a `flag`'s `data-to` must be existing ids.
- Weights are areas, not ranks: a weight of 4 is twice the area of 2.
- Don't put citations inside `data-l0` (it is plain text); the page's `p.l0` can have them.
- Live numbers in a plate that starts hidden still update; charts draw when shown.
- Hash links to ids that don't exist land on the world map with a notice; check them.

## Checklist
- [ ] Every plate and place has an `id`, `data-name`, a heading and a one-line `p.l0`.
- [ ] Weights mean what `data-weight-means` says; `data-unit` only where areas are real.
- [ ] Disagreements are a `disputed` region; risks a `reef`; recommendation a `flag`.
- [ ] Each finding links to its plate; the recommendation plate has `<p data-uncharted>`.
- [ ] Short `data-label`s for long names; the world map has no `…` on key labels at 1440.
- [ ] Evidence marks on the claims that matter; estimates carry `data-note`.
- [ ] `check.mjs` passes; open a plate, a place, the index and sources at 390 and 1440.
