# Blocks and components

The building blocks a report is made of. `report.css` styles everything below and `report.js`
wires up the behavior, so writing the markup is enough. Use only the blocks that earn their
place. If a topic needs something that isn't here, build it: add a `<style>` or `<script>` to
the page, and read colors from the theme variables (`var(--accent)`, `--ink`, `--bg-2`,
`--c1`…`--c6`).

## Contents
- [Page skeleton rules](#page-skeleton-rules)
- [Sections](#sections): TL;DR, Key findings, Context, Deep dive, Evidence and examples, Comparisons, Recommendations, Risks and unknowns, Next steps, Sources
- [Components](#components): citations, evidence tags, callout, collapsible, KPI tiles, figure, diagram, chart, table, reconciliation, layered explorer, step-through, interactive explorer

## Page skeleton rules
- Each top-level block is a `<section id="…">` directly under `<main>`, opened by an `<h2>`.
  The TOC is built from these. `data-toc="Short name"` on a section, or on an `h3[id]`,
  overrides its TOC label. An `<h3>` that has an `id` gets a sub-entry in the TOC.
- Order follows progressive depth: TL;DR → the big picture → mechanisms and detail →
  what to do → caveats → sources.
- Header: set `.kicker` (e.g. "Architecture review", "Market scan", "Travel brief") and
  `.dek`. For a photo-led topic, use `<header class="hero has-image">` and put
  `<img class="hero-img" src="images/hero.jpg" alt="">` and
  `<span class="hero-credit">Photo: … <a href="…">CC BY-SA</a></span>` inside it.
- Utility classes: `.lede` (larger opening paragraph), `.muted`, `.small`.

## Sections

### TL;DR (required, always first)
```html
<section id="tldr" class="tldr" data-toc="TL;DR">
  <h2>TL;DR</h2>
  <p class="answer">Direct answer or verdict in one or two sentences.</p>
  <ul><li>The 2–4 points that support or qualify it.</li></ul>
</section>
```
Copy the answer sentence into `report.json` → `tldr` as plain text. It shows on the index page.

### Key findings
```html
<section id="findings"><h2>Key findings</h2>
  <ol class="findings">
    <li><strong>Claim, stated plainly.</strong> The evidence for it.<a class="cite" href="#src-x"></a></li>
  </ol>
</section>
```

### Context, Deep dive, Evidence and examples
Plain prose sections, with components embedded where they explain something. A Deep dive
usually works best as `h3[id]` subsections, with the most detailed parts in `details.more`.

### Comparisons and trade-offs
A table (see Table) or a chart, followed by one paragraph on what decides between the options.

### Recommendations (when the intent is a decision)
```html
<ol class="recs">
  <li data-priority="high"><strong>Do X.</strong> Why, and what it depends on.</li>
  <li data-priority="medium">…</li>  <!-- high | medium | low -->
</ol>
```

### Risks and unknowns
```html
<ul class="risks">
  <li data-level="high"><strong>Risk.</strong> Impact, and how to reduce it.</li>  <!-- high | medium | low | unknown -->
</ul>
```

### Next steps
```html
<ol class="next"><li><strong>Action.</strong> What it settles.</li></ol>
```

### Sources (last)
```html
<section id="sources"><h2>Sources</h2>
  <ol class="sources">
    <li id="src-cf-docs"><a href="https://…">Page title</a>, Publisher, 2026-03.</li>
  </ol>
</section>
```
List the sources in any order. `report.js` sorts them by first citation, numbers them and adds
the back-links.

## Components

### Citation
`<a class="cite" href="#src-cf-docs"></a>` goes right after the claim. It renders as `[n]` and
links to the source, and the source links back. `publish.sh` refuses to publish if a citation
points at a missing source.

### Evidence tags
Mark the claims a decision rests on. Don't mark every sentence.
```html
<span class="ev" data-ev="fact">…</span>            <!-- sourced; cite it -->
<span class="ev" data-ev="estimate">…</span>        <!-- derived or approximate number -->
<span class="ev" data-ev="assumption">…</span>      <!-- taken as given, not verified -->
<span class="ev" data-ev="interpretation">…</span>  <!-- your reading of the evidence -->
<div class="ev" data-ev="interpretation"><p>A whole paragraph of interpretation.</p></div>
```
A legend appears in the TL;DR automatically for whichever kinds are used. Inline tags are
for short phrases and numbers. A judgment that runs longer than a clause gets the block form.

### Callout
```html
<aside class="callout" data-kind="key">…</aside>   <!-- note | key | warn | tip; data-title="…" overrides the label -->
```

### Collapsible depth
```html
<details class="more"><summary>How the handshake works <span class="hint">2 min</span></summary>
  <div class="more-body"><p>…</p></div>
</details>
```
Use it for depth that is optional. Content the reader needs to follow the argument stays visible.

### KPI tiles
```html
<div class="kpis">
  <div class="kpi"><span class="kpi-value">$4.2B</span><span class="kpi-label">Market size 2025<a class="cite" href="#src-m"></a></span></div>
</div>
```

### Figure (photos and images)
```html
<figure class="figure" data-zoom>
  <img src="images/subject.jpg" alt="What the image shows" loading="lazy">
  <figcaption>What to notice in it.
    <span class="credit">Photo: Author, CC BY-SA 4.0, via Wikimedia Commons <a class="cite" href="#src-img1"></a></span>
  </figcaption>
</figure>
<div class="figure-row"> …two or three figures side by side… </div>
```
Download the image into `site/images/`. Don't hotlink. Keep each image under about 400 KB
and 1600px wide: resize with what's available (`convert -resize 1600x`, `sips -Z 1600`,
`npx sharp-cli`). Look at it before using it (open the
file) to confirm it really shows the subject. `data-zoom` adds a full-screen button.

### Diagram (Mermaid)
```html
<figure class="diagram">
  <pre class="mermaid">
flowchart LR
  B[Browser] -->|HTTPS| E[Cloudflare edge]
  E -->|existing tunnel| C[cloudflared]
  C --> W[Web server]
  </pre>
  <figcaption>What the diagram shows.</figcaption>
</figure>
```
- Use it for relationships: flowchart, sequenceDiagram, classDiagram (UML), erDiagram,
  stateDiagram-v2, timeline, mindmap, quadrantChart, gantt.
- Colors come from the theme. Diagrams get a full-screen button automatically, which helps
  on mobile.
- In the text, write `&lt;` `&gt;` `&amp;` instead of `<` `>` `&`. Put labels with special
  characters in quotes: `A["label (x)"]`.
- For more than about 12 nodes, split the diagram into a layered explorer instead.

### Chart (Chart.js)
```html
<figure class="chart" id="growth">
  <script type="application/json">
  { "type": "bar",
    "format": "currency",
    "data": { "labels": ["2023", "2024", "2025"],
              "datasets": [{ "label": "Revenue", "data": [1.2e6, 2.9e6, 4.1e6] }] } }
  </script>
  <figcaption>The takeaway, not a description of the axes.<a class="cite" href="#src-x"></a></figcaption>
</figure>
```
- Any Chart.js config works. Series colors, fonts, the grid and tooltips come from the theme.
  Don't set colors unless a color has to mean something.
- Extra keys: `"format"` (`currency` | `percent` | `int` | `compact` | `number` | `date`) formats the
  value axis and the tooltips, `"currency": "EUR"`, `"tall": true`, `"table": false` (hides
  the automatic "Show data" table).
- Every chart gets a "Show data" table, so the numbers can be read without the chart.
- Reference line or target: add a dataset like
  `{"type":"line","label":"Target","data":[5000,5000,5000],"borderDash":[6,4],"borderColor":"#888"}`.
- Pick the chart by the job: bars to compare magnitude, a line for change over time,
  stacked bars for parts of a whole. A single headline number is a KPI tile, not a chart.
  Never use two y-axes. Fold anything past 6 series into "Other".

### Table
```html
<div class="table-wrap"><table class="compare">
  <thead><tr><th></th><th>Option A</th><th>Option B</th></tr></thead>
  <tbody>
    <tr><td>Cost</td><td class="good">Free</td><td class="bad">$40/mo</td></tr>
    <tr><td>Setup</td><td class="mid">1 hour</td><td class="best">5 min</td></tr>
  </tbody>
</table></div>
```
`good`, `bad` and `mid` add ✓ ✗ ◐ markers to qualitative cells, and `best` highlights a
cell. Leave numeric cells unmarked. Use `td.num` for
numbers. With `.compare`, the first column stays sticky when the table scrolls sideways.

### Reconciliation (credible sources disagree)
```html
<div class="reconcile">
  <div class="claim"><h4>Gartner</h4><p>$4.2B in 2025<a class="cite" href="#src-g"></a>, counting …</p></div>
  <div class="claim"><h4>IDC</h4><p>$2.8B<a class="cite" href="#src-i"></a>, counting only …</p></div>
  <div class="verdict"><h4>Best estimate: ~$3B</h4><p>Why: the definitions differ by …, so 2.8 + 0.3 (overlap) ≈ 3.1.</p></div>
</div>
```
Show the reasoning or the arithmetic in the verdict. If the evidence doesn't settle it, the
verdict says so.

### Layered explorer (semantic zoom)
Big picture first, with the reader controlling the depth. Each layer is a complete view at one
level of detail (a diagram, text, a table, or a mix), not just a bigger version of the one
before.
```html
<div class="layers" data-label="Zoom">
  <div class="layer" data-title="Overview">  <pre class="mermaid">flowchart LR; U[User] --> S[System]</pre> <p>…</p></div>
  <div class="layer" data-title="Components"> <pre class="mermaid">…</pre> <p>…</p></div>
  <div class="layer" data-title="Internals">  …</div>
</div>
```
`report.js` adds a breadcrumb (Overview › Components › Internals) to show where the reader
is, a depth slider, −/+ buttons, arrow keys and swipe. Diagrams render as their layer opens.
Use 2–5 layers.

### Step-through (presentation-style sequence)
```html
<div class="steps">
  <div class="step" data-title="1. Request leaves the browser">…</div>
  <div class="step" data-title="2. Edge terminates TLS">…</div>
</div>
```
Use it for processes, timelines and walkthroughs that read best one frame at a time.

### Interactive explorer (calculators, what-ifs, simulations)
Use it when the investigation produced a model with real inputs. Defaults come from the
research, and the assumptions stay visible.
```html
<div class="explorer" id="unit-econ">
  <h3>Unit economics</h3>
  <div class="explorer-inputs">
    <label><span class="row">Price / month <output></output></span>
      <input type="range" name="price" min="5" max="50" step="1" value="19" data-format="currency"></label>
    <label><span class="row">Monthly churn <output></output></span>
      <input type="range" name="churn" min="0.01" max="0.15" step="0.005" value="0.04" data-format="percent"></label>
  </div>
  <div class="explorer-outputs"><div class="kpis">
    <div class="kpi"><span class="kpi-value" data-out="ltv" data-format="currency"></span><span class="kpi-label">Lifetime value</span></div>
  </div></div>
  <figure class="chart" id="unit-econ-chart"><script type="application/json">
    {"type":"line","format":"currency","table":false,"data":{"labels":[],"datasets":[{"label":"Cumulative revenue","data":[]}]}}
  </script></figure>
  <p class="note">Model: LTV = price / churn. Assumes constant churn.</p>
</div>
<script>
  Report.explorer("#unit-econ", function (v) {
    var months = Array.from({ length: 24 }, function (_, i) { return i + 1; });
    var ch = Report.chart("unit-econ-chart");
    ch.data.labels = months;
    ch.data.datasets[0].data = months.map(function (m) { return v.price * (1 - Math.pow(1 - v.churn, m)) / v.churn; });
    ch.update("none");
    return { ltv: v.price / v.churn };   // fills [data-out="ltv"]
  });
</script>
```
- The function receives the inputs by `name`: numbers for numeric values, booleans for
  checkboxes, strings for text that isn't a number (e.g. an IP address in a text input). It
  returns values for the `[data-out]` elements. It runs on every input change, after the
  charts exist.
- `data-format="date"` shows a timestamp in ms, a `Date` or an ISO string as "Nov 24".
- A returned value can also be a string (e.g. `"Month 9"`). Strings show as they are.
- `data-format` / `data-currency` / `data-digits` / `data-prefix` / `data-suffix` format both
  the `<output>` next to an input and the `[data-out]` values.
- `Report.chart(id)` returns the Chart.js instance of a `.chart` figure, and
  `Report.fmt(value, format)` formats a number.
- Put the model formula in `.note`, so the reader can see what drives the numbers.
