# The brief: the investigation, distilled

Before you write any HTML, distill the finished investigation into `~/reports/<slug>/brief.md`.
It is private and is never published. Every template renders from it, so switching templates
means re-rendering, not re-thinking. It is also where you check that the report says only
what the investigation found.

The source is the investigation that is already done: the conversation, notes, files, and
results it produced. **Don't start new research.** If something the report needs is missing
(a source for a key number, a date), leave a `GAP:` line in the brief and mention it in your
reply. Small look-ups that only make the page work are fine: fetching an image, or confirming
a source URL you already have.

## Format
````markdown
# Title
Subtitle / dek: a neutral framing of the topic (never the user's request).
Kicker: e.g. "Build-vs-buy memo", "Market scan", "Architecture review".
As of: 2026-10-18 (prices, versions)

## TL;DR
L0: The answer in one sentence.
L1: The short paragraph: the 2–4 points that support or qualify it.

## Findings
1. **Claim.** Evidence. {S:src-e2b-pricing} {E: how it was derived}
…

## <Section>            (context, mechanisms, costs, comparison, … whatever the topic needs)
L0: One line: this section's answer.
L1: Short paragraph.
L2: Detail (sub-points, tables, the visual and what it should show).
L3: Derivations and evidence (arithmetic, method, caveats).
Visual: line chart of cost vs hours (series: E2B, Modal, self-host), marker at the user's hours.

## Disagreements      (when credible sources disagree, or when the evidence changed over time:
                       a 2020 measurement vs what newer releases changed)
### A. <what>
Side 1: … {S:src-a}   Side 2: … {S:src-b}
Conclusion: … with the arithmetic or reasoning. {I}

## Recommendation / Risks / Next steps   (when the user is deciding)

## Model               (only if there is one: becomes site/assets/model.js)
Params: name, default, range, unit, kind (assumption/fact), source
Outputs: what is computed, and the formula in words
Checks: output values at the defaults (you will verify the page against these)

## Time               (only if the answer depends on when: dated events, thresholds, phases)

## Sources
- src-e2b-pricing: E2B — Pricing, https://e2b.dev/pricing, accessed 2026-10-18
  (accessed = when the investigation read it; publication dates go in the title when known)
````

## Evidence tags (in the brief)
`{S:src-id}` sourced fact · `{E}` or `{E: derivation}` estimate · `{A}` assumption ·
`{I}` interpretation. In the page they become the core's evidence markup and citations (see
`core.md`). Tag the claims a decision rests on. Every number in the brief either has a source or
is an estimate with its derivation.

## Depth levels
- **L0**: one line, the answer. **L1**: a short paragraph. **L2**: detail. **L3**: derivation and evidence.
- Every template exposes these levels progressively, each in its own way: Longread uses
  ledes and "Go deeper" disclosures, Paper uses Abstract/Brief/Full/Appendix, Blueprint uses
  zoom levels, Cockpit uses tiles and drawers, and so on. Writing all four levels in the brief
  makes rendering mechanical.
- A short investigation makes a short brief. Skip levels and sections that would only pad.

## What decides the template
While writing the brief, notice the shape of the content:
- Is there a model with inputs the reader would change?
- Does the answer depend on when?
- Are there many distinct parts whose relationships matter?
- Is it an argument to read top to bottom?

These signals pick the template (see `choosing.md`).
