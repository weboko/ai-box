# Template: longread (The Longread) — the default

A long-form magazine article set in a serif on warm paper, with one vermilion for wayfinding.
Each numbered section opens with its one-line answer as an italic **lede**; detail and
derivations sit behind in-place **"Go deeper"** panels (two levels) that open by height and
by find-in-page. Evidence shows as drawn glyphs (ring = sourced, double tilde = estimate,
flag = assumption, pen = interpretation) with **Tufte-style margin notes** beside their
sentence on desktop and tap-to-open notes on phones. A sticky side contents with scroll-spy
(desktop) and a running head with the current § and a progress line (phones) come free.
Worked example: `examples/longread/index.html`. Shared markup (evidence, citations, model,
charts, boxes, blocks): `../core.md`. Don't repeat it here; use it.

## When to use it
- An argument read top to bottom: build-vs-buy memos, technical or market assessments,
  explainers, comparisons, post-mortems. The reasoning matters as much as the answer.
- Heavily sourced prose: the margin carries the sources so the text stays clean.
- **The default when unsure.** It scales from a 3-section note to a 12-section report.

Not for: a model that is the main event (every number should react → cockpit or notebook),
answers organised by time (roadmap), many parts whose relationships are the point
(blueprint), a landscape to browse in any order (atlas).

## Page skeleton
Start from `assets/templates/longread/index.html` (copied by `new-report.sh`). Minimal shape:
```html
<head> … <script>document.documentElement.className += " js";</script>   <!-- keep: no flash of open panels -->
  core.css, template.css, then defer: core.js, charts.js, [assets/model.js], template.js </head>
<body id="top">
<a class="skip" href="#article">Skip to article</a>
<div class="layout">
  <nav class="toc" id="toc" aria-label="Contents"></nav>          <!-- leave empty: generated -->
  <main id="article" class="article">
    <header class="masthead">
      <h1>Title</h1><p class="dek">Neutral framing</p>
      <p class="byline"><span>Kicker · <time data-meta="date"></time></span><span>… <span data-meta="reading-time"></span></span></p>
      <details class="meta"><summary>About this report</summary><div class="meta-panel"></div></details>
      <aside class="legend-head" aria-label="Evidence legend"><p class="legend-title">Reading the margin</p><div data-ev-legend></div></aside>
    </header>
    <section class="tldr sec" id="tldr" data-title="The short answer"><h2>The short answer</h2><p class="lede">L0</p><p>L1</p></section>
    <section class="sec" id="costs" data-title="The numbers"> <h2>…</h2><p class="lede">…</p> … </section>
    …
    <section class="sec" id="sources" data-title="Sources"><h2>Sources</h2><ol class="sources">…</ol></section>
    <footer class="colophon"><p>Set in Longread Serif … <a href="#top">↑ Back to top</a></p></footer>
  </main>
</div>
```
`class="tldr sec"` must start with `tldr` (publish.sh greps `class="tldr`).

**Required:** only the TL;DR and Sources. Findings, Recommendation, Risks, Next steps and the
calculator are optional: delete the skeleton's section if the investigation has nothing for it
(no decision → no Recommendation). Never leave a section of TEMPLATE-TODO or filler.

## Markup contract

### Sections and navigation
- Every top-level section is `<section class="sec" id="…" data-title="…">` directly in
  `<main>`. Its first `<h2>` is the heading; the engine prefixes "§ n" (hung in the gutter on
  desktop). `data-title` is the short name for the contents and running head (≤ 30
  characters); without it the h2 text is used.
- Give every section a short, stable `id` (`costs`, `cold`, `calc`). Don't number headings yourself.
- Cross-references: `<a class="sec-ref" href="#calc">the calculator</a>` → "§8 the calculator".
  Never hard-code "§8" in prose.
- `<a href="#top">` anywhere scrolls to the top.

### The lede (L0)
- `<p class="lede">` right after the h2: the section's answer in one sentence, not a teaser.
- A lede can quote live numbers (`data-out`, `data-param-value`) and carry evidence marks.

### Go deeper (L2, L3)
```html
<div class="deeper" id="d-costs" data-label="price list and derivation">   <!-- L2 -->
  <h3>Price list</h3> …
  <div class="deeper" id="d-deriv" data-label="the formulas and chart data"> … </div>  <!-- L3 -->
</div>
```
- The engine inserts the button before the panel: "Go deeper: {label}" (nested: "Show
  {label}"), which turns into "Hide {label}" when open, and adds "↑ Back to summary" at the end.
  Write `data-label` as a noun phrase that says what the panel holds.
- Closed panels are `hidden="until-found"`: find-in-page and links into them open them.
- **Replace a summary:** `data-collapse-with="d-findings"` on the short version (e.g. a
  findings list of bold claims only) hides it while panel `d-findings` (the full version) is open.
- Use at most two levels. Put every panel after the L1 prose of its section, not mid-paragraph.

### Evidence and the margin
- Core markup only (`../core.md`, Evidence). The template draws it:
  - `fact` + following `a.cite`(s): a blue ring + number; the margin note lists the source title.
  - `estimate`, `assumption`, `interpretation`: a glyph button after the claim. The margin note
    shows `data-note` (write the arithmetic there). Without `data-note` the note would only
    repeat the legend, so it stays out of the margin (tap-to-open only).
  - Assumption notes get "Change it in §n →" when the page has a `[data-calculator]`.
- Wrap the claim, not the sentence's punctuation: `<span class="ev" data-ev="fact">claim</span><a class="cite" href="#src-x"></a>.`
- A citation without an `.ev` around its claim still works (ring + number, jumps to the
  source) but gets no margin note. Use bare cites in tables, captions and lists of figures.
- Margin notes appear beside running prose: paragraphs, list items, ledes and `.verdict`.
  Notes inside figure captions, tables, box diagrams, the calculator and headings are
  tap-to-open instead. Notes of the two `.claim` columns in `.reconcile` are mirrored into
  the margin beside the block.
- **One note per source per screen.** A source already noted in the same section (or the
  same panel) less than a viewport above gets no second note; its ring number still links to
  the source. So a source cited ten times in a section shows its title once or twice.
- Budget: about one note per 2–3 lines. Dense paragraphs push notes below their sentences.
- **Single-source reports** (a case study built on one post or paper): don't wrap every
  sentence from it as `fact`. Cite it once per paragraph, at the claim that matters, and use
  the margin for your estimates and assumptions (`data-note`), which is where it adds value.

### Figures
- A `<p class="fig-label">` as the first child of any `figure` makes a head row:
  "Figure n · label" with a rule above, and a slot on the right for level pills (`data-levels`)
  and series toggles. Figures are numbered in page order.
- `figure.chart`, `figure.boxes` and `figure.calculator` (and anything with class `fig-wide`)
  span the text column plus the margin on desktop. Photos stay at text width.
- Tables: keep `.table-wrap`; tables with 4+ columns reach into the margin and scroll
  sideways on phones (`class="table-wrap narrow"` opts out).

## Components unique to the template

### Chart extras (on top of core charts)
- **Series toggles**: every `line` chart with 2+ series gets pill toggles in its head (they
  are the legend; the line ends are labelled on wide screens). `"toggles": false` turns them off.
  `"short"` gives the phone label; `"dash": "6 4"` dashes a line and its swatch.
- **Range groups**: in a `range` spec add `"groups": [{"key","name","short","color"}]` and
  `"group"` on each row: rows are coloured by group and get toggles. `"hollow": true` = a claim,
  filled = a measurement.
- Points with `"on": "seriesKey"` (core) hide when that series is toggled off. Give point and
  marker labels `"format": "int"` on a compact axis, so they read "≈ 32,150 h", not "32.2K".

### Box diagram
Core `.boxes` with `data-levels`, styled like a technical drawing: `.box.vendor` = dashed
(not yours), `.box.strong` and `.group.strong` = vermilion wash (yours, the expensive part),
`.group.vendor` = dashed tray of grey chips, `.box.hl` = green outline (the point to notice).
`.badge` is green; `.badge.alt` purple (a shared or caveated figure). `<p class="group-foot">`
at the end of a group is a bold total line. Make the caption follow the level with
`data-to` / `data-from` spans.

### The calculator (only with a model)
Mark its section `data-calculator` (assumption notes and the legend link to it). Inside
`figure.calculator`:
- `.calc-inputs[data-keys="a,b"][data-more="c,d"][data-more-label="More assumptions"]`:
  the engine builds a field per param (label with the assumption flag, number box + unit,
  slider, the param's `note` and `cite`), a "More assumptions" disclosure, and a reset button.
  Defaults: `data-keys` = all non-hidden params; `data-more` = the rest of the non-hidden ones.
  Put a `<p class="nojs">` inside saying what the results show without JavaScript.
- `.calc-verdict`: a serif sentence with live values. The core `data-show-if` swaps
  alternative clauses (`<span class="rel" data-show-if="breakEvenGap">`). It is announced to
  screen readers half a second after the reader stops moving a control.
- `ul.calc-bars[data-best="min|max"] > li[data-bar="path"][data-s="1–6"]`: a name, a bar
  sized to the value, an amount (`data-out`), ★ on the best non-`muted` row. A `li` without
  `data-bar` can hold a `.note` instead of a bar.
- `dl.calc-facts > div > dt + dd + dd`: a 2×2 grid of key numbers with sub-lines.
- `ul.calc-warnings[data-out="warnings"]`: core renders one `<li>` per string; hidden when empty.
- `p.calc-sticky`: a one-line answer pinned under the running head on phones (`aria-hidden`).
- A nested `figure.chart` bound to the model with a `params.*` marker redraws with the inputs.
- **compute() must return every value the verdict quotes** (e.g. `cheapestCost`,
  `breakEvenGap`, `pastBreakEven`): prose can't do arithmetic. For "the same output at other
  inputs" use core `data-with` (`data-out="cost.e2bPro" data-with="hours: result.breakEven"`).

### Small pieces
`.calc` = inline monospace arithmetic (`<span class="calc">(a − b) ÷ c ≈ <b>n</b></span>`);
`pre.formula` = a block of formulas; `.aside-link` = a small sans pointer line;
`.callout[data-kind]`; `.small`; `.nw` keeps words together; `.reconcile .verdict` takes an
`<h4>Reconciliation</h4>` and an `<ol>` of steps.
`ul.risks li[data-level="high|medium|low|unknown"]` gets a small pill before the item (vermilion
for high, dashed for unknown). The engine adds a small vermilion square (the end mark,
`.endmark`) after the last paragraph before the Sources section: the article's printed
"end". It is intended; don't add one yourself.

## Brief levels → template
| Brief | Longread |
|---|---|
| Title, dek, kicker, as-of | `h1`, `.dek`, `.byline` |
| TL;DR L0 / L1 | `.tldr` lede / first paragraph (gets the drop cap) |
| Findings | short `ol.findings[data-collapse-with]` + full list in a `.deeper` |
| Section L0 | `.lede` |
| Section L1 | paragraphs after the lede, plus the section's figure |
| Section L2 | `.deeper` panel: h3 sub-heads, tables, extra figures |
| Section L3 | nested `.deeper`: formulas, data tables, method |
| Evidence tags | `.ev[data-ev]`, `a.cite`, `data-note` = the derivation |
| Disagreements | own section: lede, `.reconcile`, link to the calculator |
| Model | calculator section + live values in ledes |
| Recommendation / Risks / Next | `ol.recs`, `ul.risks`, `ol.next`, each with a lede |

**Short reports** (one screen of findings): TL;DR, 2–4 sections, sources. Skip findings,
panels and the calculator if they'd be empty; a lede plus one paragraph per section is a
complete Longread. **Long reports**: keep each section's visible part (lede, L1, one figure)
to about a screen, and push everything else into panels.

## Mobile and no-JS
- Below 1180 px the contents collapse into the running head (tap it for the drop-down;
  Esc closes). Below 1000 px margin notes become tap-to-open under their sentence; tapping a
  ring number opens its note instead of jumping. Below 760 px the calculator stacks and its
  sticky answer appears. Series toggles switch to `short` labels below 560 px.
- Without JavaScript: all panels are open (labelled "Go deeper: …"), `data-collapse-with`
  summaries are hidden, figure labels show without numbers, the contents and running head
  are absent, live values show the defaults written in the markup, charts are empty (the
  caption must carry the takeaway; L3 tables carry the data), the legend is hidden, glyphs are
  not drawn and citations read "[source]". Prose must read on its own.
- Reduced motion: panels fade instead of growing; no smooth scroll.

## Pitfalls
- A lede that teases ("Let's look at costs") instead of answering. Every lede is a claim.
- Hard-coded "§n" or "Figure n" in prose: they're generated; use `a.sec-ref`.
- Nesting `.sec` sections, or putting sections outside `<main>`: the contents won't see them.
- Panels three deep, or a panel with one sentence in it: fold it into L1.
- Evidence on every clause: the margin overflows and notes drift below their sentences.
- Numbers in prose that the calculator changes: bind them (`data-out`) or say "at the report's defaults".
- A calculator verdict that needs arithmetic in the page: return the value from `compute()`.
- Removing the inline `js` class script: panels flash open on load.
- Writing `class="sec tldr"`: publish.sh needs `class="tldr …"` first.

## Checklist
- [ ] Every section: `class="sec"`, short `id`, `data-title`, h2, a lede that answers.
- [ ] TL;DR first, `class="tldr sec"`; legend in the masthead; `ol.sources` in the last section.
- [ ] L2/L3 in `.deeper` panels with noun-phrase `data-label`s; at most two levels.
- [ ] Decision-critical claims tagged; estimates carry `data-note` with the arithmetic.
- [ ] Each figure has a `.fig-label` and a caption that states the takeaway.
- [ ] Model (if any): calculator section with `data-calculator`; verdict values come from `compute()`.
- [ ] `node scripts/check.mjs site` passes; open a panel, tap a glyph at 390 px, scroll the contents.
