# Template: paper (Working Paper)

A LaTeX-style working paper in Computer Modern: title block, abstract, generated Contents,
numbered sections, booktabs tables, numbered equations and figures, numbered references.
One **reading level for the whole page** (Abstract → Brief → Full → Appendix) sits in the
sticky running head; changing it rewrites the text in place, keeps the reader's place and
marks what appeared with a change bar in the margin. Worked example:
`examples/paper/index.html`. Shared markup (evidence, citations, model, charts, boxes,
blocks): `../core.md`. Do not repeat it here; use it.

## When to use it
- Quantitative or methodological findings that readers will check: derivations, formulas,
  several tables of numbers, a small cost or sizing model, conflicting published figures
  reconciled with arithmetic.
- Readers who stop at different depths: the founder reads the Abstract, the engineer reads Full.

Not for: dashboards or status pages to scan, answers organised by time or phases, many parts
whose relationships are the point, or a short qualitative note with nothing to check (a
paper with no numbers looks padded).

## Page skeleton
Start from `assets/templates/paper/index.html` (copied by `new-report.sh`). Minimal shape:
```html
<header class="runhead" id="runhead"><div class="rh-inner"><p class="rh-where"><span class="rh-paper">Working Paper</span></p></div></header>
<main id="main" class="paper" tabindex="-1">
  <header class="titleblock">
    <h1>Title</h1><p class="subtitle">Neutral dek</p>
    <p class="authors"><span data-meta="agent"></span><sup>†</sup> · model <span data-meta="model"></span> · <time data-meta="date"></time></p>
    <p class="affil"><sup>†</sup>Role. Prices as of …</p>
    <details class="meta"><summary>Report metadata</summary><div class="meta-panel"></div></details>
  </header>
  <section class="tldr" id="abstract"><h2>Abstract</h2><p><b>Answer.</b> …</p>
    <aside class="notation" aria-label="Notation"><p data-ev-legend></p></aside></section>
  <nav class="toc" id="toc"></nav>
  <!-- optional level-0 figure here, e.g. a box diagram with data-follow="page" -->
  <section class="sec" id="sec-…" data-min="1"><h2>Introduction</h2> … </section>
  …
  <section class="sec appendix" id="sec-model" data-min="2"><h2>Decision model</h2> … </section>
  <section class="sec refs" id="refs" data-min="1"><h2>References</h2><ol class="sources">…</ol></section>
  <footer class="colophon" data-min="1"><p>Set in Computer Modern (CMU, SIL Open Font License).</p></footer>
</main>
```
Load order is fixed in the skeleton: core.css, template.css, then (defer) core.js,
charts.js, `assets/model.js` (uncomment if there is a model), template.js.

## Markup contract

### The reading level
- Levels: `0 Abstract`, `1 Brief`, `2 Full`, `3 Appendix`. Rename or change their number
  with `<main data-level-names="Summary|Detail|Evidence">` (and `data-level-abbr` for the
  phone labels). `data-level="1"` on `<main>` sets the starting level (default 0).
- `data-min="n"` on any element inside `<main>`: shown from level n. `data-max="n"`: shown up
  to level n. Nesting takes the highest `data-min` of the ancestors.
- A passage that is **rewritten** between levels is two siblings: the short one with
  `data-max="1"`, the long one right after it with `data-min="2"`. The reader's anchor jumps
  from one to the other. Inline rewrites work too (`<span data-max="1">…</span><span data-min="2">…</span>`).
- Sections normally carry `data-min="1"`; subsections, tables and equations that are detail
  carry `data-min="2"`; method notes, formulas and data tables `data-min="3"`.
- What shows at Abstract: title block, abstract, notation, Contents and any figure placed
  before the first section. Keep that set to one screen or two.

### Numbering and cross-references (all automatic)
- `<section class="sec">` → §1, §2 …; `<section class="sec appendix">` → Appendix A, B.
  Each `h3` inside → 1.1, A.1. Leave numbers out of the headings. `data-unnumbered` or class
  `refs` (or a section holding `ol.sources`) is unnumbered. `data-notoc` keeps an entry out
  of Contents.
- Floats are numbered in document order, regardless of level (numbers never shift when the
  level changes): `figure.tbl` → Table n (caption **first**, above the table); `figure.photo`
  → Plate n; any other `figure` (`.chart`, `.boxes`, plain) → Figure n; `div.eqn` → (n).
  Inside an appendix: Table A.1, Figure A.1, (A1). `class="nonum"` opts out.
- The label ("Table 3:") is inserted at the start of the `figcaption`. Write the caption as a
  sentence without the label.
- Cross-reference: `<a class="xref" href="#tab-rates"></a>`, left **empty**. It becomes
  "Table 3", "Figure 2", "Plate 1", "(5)", "§4.2" or "Appendix A". Write "Equation
  <a class="xref" href="#eq-x"></a>" if you want the word. A missing target prints "??" and
  warns in the console.
- An xref whose target needs a higher level shows it, e.g. "Table 1 (Full)"; clicking opens
  that level.
- Use id prefixes `sec-`, `fig-`, `tab-`, `eq-`, `plate-`: without JavaScript an empty xref
  falls back to the word ("Table") by prefix.

### Equations
```html
<div class="eqn" id="eq-breakeven" data-min="2"><span class="eqb">H* = <span class="frac"><span>C − F</span><span>r</span></span> ≈ <span class="ev" data-ev="estimate">486 h/month</span></span></div>
```
`.eqb` is the centred body, `.frac` a stacked fraction, `<sub>`/`<sup>` for indices. The
number `(n)` is added on the right. Keep each equation to one idea; put the result in an
`estimate` span.

### Tables
`figure.tbl` > `figcaption` + `.table-wrap` > `table.booktabs` (or core `table.compare`).
Both get booktabs rules (no vertical lines, no fills). `td.num` right-aligns numbers,
`tr.total` adds a midrule and bold. `table.compare` stacks into one block per row on a phone,
labelled from the header row; use it for criteria × options tables.

### Navigation (generated, nothing to write)
- Running head: kicker (`.rh-paper`), the current § and the level control (radio group:
  ←/→, Home/End, 1–4 while focused).
- Contents: built from sections and `h3`s, with the level at which each first appears.
- Notation: `[data-ev-legend]` (keep it empty) becomes one "Notation." paragraph naming the
  typographic code; the reading-level hint ("Brief adds 6 sections, Figures 2–3 …") is
  added after it.
- Routing: Contents, xrefs, citations, deep links (`#tab-rates`), Back/Forward and reload all
  open the level the target needs. Citations open the References without raising the level
  and show one "↩" back to the citing spot. The level is kept per page for the session.

### Core pieces in this template
- **Evidence** is typographic only: `fact` roman + [n], `estimate` *italic*, `assumption`
  SMALL CAPS, `interpretation` bracketed sans "[interpretation: …]". Italic and small caps
  are therefore **reserved**: never use `<em>`/`<i>` for emphasis or small caps for style;
  use `<b>` for emphasis. `p.ev`/`div.ev` with `interpretation` brackets a whole paragraph.
  `data-note` on an estimate adds a footnote-like "?" that opens the derivation.
- **Citations**: core `a.cite`, written right after the claim with no space. Adjacent cites
  merge into one sorted LaTeX group `[3, 8, 12]`.
- **Charts**: core charts, drawn monochrome. Line series take `--s1…` greys; lines without
  a `dash` get dash patterns by order (2nd `7 4`, 3rd `2 3`, …); set `"dash": "none"` for a
  solid line, `"width"` for weight, `"color": "var(--ink)"` to keep a line black. Use
  `markers` with `"bind"` for a model threshold ("H* ≈ {x}"). Narrow screens drop end labels and
  get core's legend, drawn with each line's dash. Charts inside hidden levels draw when shown.
- **Box diagrams**: core `.boxes`, drawn as a line diagram. Extra modifier `.box.solid`
  (inverted, for the physical bottom layer); `.hl` is a heavy, filled box. Lane widths:
  `style="--cols: 1fr 1.45fr"`. Badges render as bold numbers at the right.
- **Layered figure tied to the page level**: `data-levels="A|B|C" data-follow="page"`. The
  figure has no buttons of its own; its level is the page level capped at its last level
  (Abstract → A, Brief → B, Full and Appendix → C). `data-from`/`data-to` inside work as in
  core. Without `data-follow` it keeps core's own buttons.
- **Photo**: `figure.photo` = Plate n, framed by a rule.
- **Shared blocks**: `ol.findings`, `ol.recs`, `ul.risks`, `ol.next` are plain numbered or
  bulleted lists. `data-priority` / `data-level` show as a roman margin note ("high
  priority", "medium risk"; bold when high), and as "1. High — …" on a phone. `.reconcile`
  renders as run-in paragraphs ("Side 1. …", "Side 2. …", then the verdict under a hairline);
  equations and tables may sit inside the verdict. `.callout` is a ruled box.

## Components unique to this template

### Model table (`figure.tbl.calc`)
The live model is a numbered table in the appendix (Full level), not a widget:
```html
<figure class="tbl calc" id="tab-model">
  <figcaption>Interactive. Monthly cost by option. Defaults reproduce the text.</figcaption>
  <div class="calc-grid">
    <div class="table-wrap"><table class="booktabs calc-in"><thead><tr><th>Input <span class="ev" data-ev="assumption">(assumption)</span></th><th class="num">Value</th></tr></thead><tbody>
      <tr><td><label for="in-hours">Hours / month</label></td><td class="num"><input type="number" id="in-hours" data-param="hours" value="2000"></td></tr>
    </tbody></table></div>
    <div class="table-wrap"><table class="booktabs calc-out"><thead><tr><th>Output <span class="ev" data-ev="estimate">(estimate)</span></th><th class="num">USD / month</th></tr></thead><tbody>
      <tr><td>Option A</td><td class="num"><span class="ev" data-ev="estimate" data-out="cost.a" data-format="currency">$481</span></td></tr>
    </tbody></table></div>
  </div>
  <p class="calc-notes">… <span data-show-if="warnings" hidden>Warning: <span data-out="warnings" data-join=" "></span></span></p>
  <button type="button" data-reset>Restore defaults</button>
</figure>
```
- Inputs bind with core `data-param` (min/max/step come from the model). An out-of-range
  value is rejected; the template writes "Enter 100–100,000; using 2,000 h" under the field.
- `[data-reset]` resets the model and is disabled at the defaults. Rows of `.calc-out` are
  read out politely to screen readers after typing pauses. For list outputs (`warnings`) set
  `data-join=" "` so they read as sentences.
- Write every default value inside its element so the table reads without JavaScript, and add
  a `<noscript><p class="nojs-note">…</p></noscript>` stating the defaults.
- Quote live numbers in the prose with `data-out` too (see `#sec-costs` in the example).

### Events and API
`Report.on("level-page", fn(level, name, previous))`, or the DOM event `levelchange` on
`document` (`e.detail.level/name/previous`). `Report.paper.level()`,
`Report.paper.setLevel(n)`, `Report.paper.names`, `Report.paper.needLevel(el)`.

## Brief levels → template
| Brief | Template |
|---|---|
| TL;DR L0 + L1 | The abstract (level 0): `<b>` answer first, then the supporting points. |
| Section L0 | Its Contents title; optionally the first sentence of the Brief text. |
| Section L1 | The Brief paragraph(s): `data-max="1"` when Full rewrites them, plain when they stay. |
| Section L2 | `data-min="2"`: rewritten paragraphs, subsections, tables, equations, both sides of a disagreement. |
| Section L3 | `data-min="3"`: method notes (`p.appx-note`), formulas, data tables, the appendix tail. |
| Visual | A numbered figure at the level of the claim it supports (often Brief). |
| Model | Appendix A as a `figure.tbl.calc` at Full; formulas at Appendix. |
| Disagreements | Brief: one paragraph with the conclusion. Full: `.reconcile` with the arithmetic as equations. |
| Recommendation / Risks / Next | §n with `ol.recs`; risks as an `h3` at Full; next steps at Brief. |

## Mobile and no-JS
- Phone: running head shows the § and abbreviated levels (Abs, Brief, Full, Appx); lanes and
  component grids stack; equations left-align with a hanging indent; `table.compare` stacks;
  the model table becomes one column. Full and Appendix are long on a phone: keep Brief tight.
- Without JavaScript the whole text reads once at its fullest: `data-max` passages hide,
  `data-min` passages show, section, figure, table and equation numbers come from CSS
  counters, citations read "[ref]", empty xrefs read "Table"/"Figure" by id prefix, the
  notation is a short fallback line, Contents and the level control are hidden. Charts need
  script; state the key numbers in the caption or a table.

## Pitfalls
- Using italics or small caps for emphasis: it reads as an estimate or an assumption.
- Writing numbers into headings or captions ("Table 3: …", "2.1 Rates"): they double.
- Putting `data-min`/`data-max` on an element that also has `data-show-if` (both use `hidden`).
- Pointing an xref at content inside a `data-max` passage (it vanishes at higher levels).
- A Brief passage with no Full counterpart followed by a Full one that repeats it: use the
  `data-max`/`data-min` pair so only one shows.
- Forgetting `data-min="1"` on References and the colophon (they then show at Abstract).
- Too much at level 0: the Abstract view should be the abstract, Contents and at most one figure.
- Numbers in prose that the model changes, written as plain text: use `data-out` or say "at
  the defaults".

## Checklist
- [ ] Abstract answers in its first bold sentence; level 0 fits in about two screens.
- [ ] Every section has a Brief version; Full adds, Appendix proves.
- [ ] All xrefs empty or label-like, all targets exist (no "??" on the page).
- [ ] Captions without labels; tables have their caption first.
- [ ] Evidence marked with core `.ev`; no other italics or small caps.
- [ ] Model table defaults match the brief's checks; numbers change when inputs change.
- [ ] `check.mjs` passes; looked at Abstract, Brief and Full at 390 and 1440, and without JS.
