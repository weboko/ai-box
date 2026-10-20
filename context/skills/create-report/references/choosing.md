# Choosing a template

Seven templates, one per way of reading. Every one handles evidence, citations, sources,
progressive depth and phone/desktop the same way (see `core.md`). They differ in how the
reader moves through the content. Pick by the **shape of the investigation**, not by the topic.

## 1. Did the user name one?
Use it, even if another would fit better (you may say so in one line). Render it at the
scale of the material: as many regions, tiles, cells or lanes as the investigation really
has. Don't invent sections to fill the template. Words users may use:

| Template | Users may say |
|---|---|
| `longread` | article, essay, memo, write-up, explainer, blog post, magazine, long form, "just a normal report" |
| `paper` | paper, working paper, academic, LaTeX, research paper, whitepaper, technical report |
| `notebook` | notebook, Jupyter, lab notebook, "show your work", "let me rerun the numbers", auditable |
| `cockpit` | dashboard, cockpit, board, control panel, datasheet, "something I can play with" |
| `roadmap` | roadmap, timeline, Gantt, schedule, "when does it pay off", "over time" |
| `blueprint` | blueprint, canvas, zoomable drawing, engineering drawing, architecture diagram |
| `atlas` | atlas, map, landscape, territory, explorer, gazetteer |

"Theme", "style", "format" and "layout" all mean template. These count as naming one only
when the user asks for a format ("as a notebook", "make it a dashboard"). A described need
("he'll want to check the math", "I want to play with the numbers") is a signal for step 2,
not a name. If the word is ambiguous ("visual", "interactive"), choose with step 2. "Map"
means `atlas`, but "mind map" or "map of the system" means `blueprint`.

## 2. Otherwise, pick by the investigation's shape
Go down the list and take the first row that fits strongly. If nothing fits strongly, use
**longread**.

| If the core of the investigation is… | Template | Needs |
|---|---|---|
| **About *when***: growth thresholds, dated events, price or vendor changes, a phased plan with re-evaluation gates | `roadmap` | A time axis the answer depends on |
| **A live decision model**: several linked numbers the reader will change to see their own case (pricing, capacity, build-vs-buy with many inputs) | `cockpit` | A model with ≥3 meaningful inputs and ≥4 outputs worth a tile |
| **A model to audit**: the reader should see and re-run each derivation (cost models, benchmarks, sizing, forecasts) | `notebook` | A model whose steps are the story |
| **How parts of a system relate**: an architecture, a stack, an ecosystem where the structure is the point | `blueprint` | ≥6 distinct parts with relationships |
| **A landscape**: distinct areas (options, segments, regions, vendors) the reader explores in any order, asking "where does this fit" | `atlas` | ≥5 areas that make sense side by side |
| **Several readers who each want a different depth** (a founder reads the abstract, an engineer reads the appendix), with formal derivations, equations and numbered tables | `paper` | Content written at all four depth levels |
| **An argument read top to bottom**: analysis, explainer, memo, comparison, most research | `longread` | Nothing; works for short and long reports |

`cockpit` vs `notebook`, when both have a model: the reader who wants to **try their own
inputs** and watch many numbers move gets `cockpit`. The reader who wants to **check how each
number is derived** gets `notebook`.

A model that covers only one criterion of several (cost, in a comparison that is mostly
about latency, features and ops) is a calculator inside `longread`, not a `cockpit`.
`atlas` is for a landscape explored in any order. A head-to-head comparison of a few options
is a table and a recommendation (`longread`).

Signals that rule a template out:
- **No model** (no inputs the reader would change): not `cockpit` or `notebook`.
- **No time axis**: not `roadmap`. A threshold in scale (vectors, users, requests) is not a
  time axis unless the investigation measured dates or a growth rate. Without those it is a
  model input (`cockpit`, `notebook`, or a calculator in `longread`), and you don't invent
  a growth rate to make a timeline.
- **Fewer than about 5 distinct parts or areas**: not `blueprint` or `atlas`.
- **A short answer** (a few findings, under about 1,500 words): `longread`.
- **A reader on a phone who wants the answer fast**: avoid `blueprint` (pan and zoom) and `paper` at full depth.

Cost to author, from cheapest: longread < paper < notebook < cockpit < roadmap < blueprint
< atlas. Blueprint and atlas need the most care (spatial layout), so pick them only when
the spatial view really explains something.

## 3. Announce the pick, then keep going
Right after reading the request, before writing the brief, tell the user in one short
message:
1. The template and the reason, tied to their content.
2. The example link (`bash <skill>/scripts/formats.sh <template>` prints it, with the gallery link).
3. The alternatives they can reply with, and the gallery link.

Then continue working **without waiting for a reply**. Example:

> I'll make this a **Roadmap**: your answer changes as usage grows, so a timeline with the
> break-even month shows it best. Example: https://example.com/report-formats/roadmap/ —
> reply with longread, paper, notebook, cockpit, blueprint or atlas to switch (all formats:
> https://example.com/report-formats/).

If the user replies with another template while you work, switch. The brief stays as it is:
run `new-report.sh --switch <slug> <template>` and render again from the brief. If you had
already published, publishing again replaces the report under the same URL.

## 4. When the user asks for help choosing
Give the 2–3 templates that fit this investigation. For each, say in one line what the
reader would do in it and the trade-off for this content, with its example link. Name
your pick. Give the gallery link (`formats.sh <template>` prints both). Then wait for their
answer, because they asked a question. Example:

> For this one I'd pick **Cockpit**: you have six inputs and the reader wants their own
> numbers. Each tile recomputes as they drag the conditions, but there's no top-to-bottom
> argument. **Notebook** shows every derivation and reruns it, but it reads like an
> engineer's artefact. **Longread** is the easiest to read through, with one calculator
> inside the article. All formats: https://example.com/report-formats/
