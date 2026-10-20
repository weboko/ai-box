---
name: create-report
description: Use when the user wants a finished investigation, research, analysis, comparison or deep dive turned into a visual, interactive, shareable HTML report on their website, asks which report format or template to use, or asks to update, republish or remove a published report.
---

# Create report

Turns an investigation that is **already done** into a visual, interactive HTML report and
publishes it to the user's website: `~/www/<date>-<slug>/`, listed on `~/www/index.html`.
The report exists to make the user understand the topic and decide. Every block, visual and
interaction serves that purpose.

This skill renders findings. It does not investigate. The material is what the
investigation produced: the conversation, notes, files and numbers. If something important
is missing, name it in your reply instead of researching it now.

The reader is the user, and sometimes people they share the link with. Infer what they
already know from how they ask. Everything in `site/` is public on the internet.

## Templates
| Template | Shape it fits |
|---|---|
| `longread` (default) | An argument read top to bottom: memo, analysis, explainer, comparison |
| `paper` | Readers who each want a different depth (Abstract → Appendix), derivations, equations |
| `notebook` | A model the reader should audit and re-run, cell by cell |
| `cockpit` | A live decision model: global sliders recompute every tile |
| `roadmap` | The answer depends on *when*: timeline, growth, dated events, gates |
| `blueprint` | How parts of a system relate: one zoomable drawing |
| `atlas` | A landscape of distinct areas to explore in any order: a map |

`references/choosing.md` has how to pick, the words users use for each, and how to
announce your pick and help the user choose. `bash <this skill>/scripts/formats.sh` prints
the URL of the gallery, which shows each template rendering the same example report.

## Workflow
1. **Read the intent.** Is the user deciding, understanding or learning? What is the actual
   question, what do they already know, and what would change their mind? This decides the
   depth, the tone and whether to give recommendations.
2. **Choose the template and announce it** (`references/choosing.md`):
   - If the user named one, use it. Otherwise pick by the investigation's shape.
   - Get the links with `bash <this skill>/scripts/formats.sh <template>`. It prints the
     example URL and the gallery URL, and publishes the gallery to `~/www/report-formats/`
     first if it is missing or out of date.
   - Send one short message (as interim text, then keep calling tools): the template and
     why it fits, the example link, the other template names they can reply with, and the
     gallery link.
   - Don't wait for a reply; continue. If the user replies with another template, switch.
   - When the user asks which format to use, they asked a question: give 2–3 options with
     their trade-offs, then wait for the answer (`choosing.md`, section 4).
3. **Scaffold:** `bash <this skill>/scripts/new-report.sh "<Title>" <template> [short-name]`
   - It prints the slug (`<date>-<short-name>`, which becomes the URL) and creates
     `~/reports/<slug>/` with `prompt.md` and `brief.md` (private) and `site/` (public).
   - Pass a 2–4 word Latin-letter short name when the title is long or isn't in English.
4. **Save the prompt:** write the user's request verbatim into `prompt.md`, fill in `Model:`,
   and add the one-line `Context:` when the request doesn't name the question ("make a
   report from this"). This file is never published.
5. **Write the brief** (`references/brief.md`): distill the investigation into `brief.md`,
   with the TL;DR, sections at depth levels L0–L3, evidence tags, disagreements, model and
   sources.
   - If the investigation produced a quantitative model, write `site/assets/model.js`
     (`references/core.md`, "Model and controls") and check its outputs against the
     investigation's numbers.
   - Download any images into `site/images/`.
6. **Render:**
   - Read `references/templates/<template>.md` and `references/core.md`.
   - Write `site/index.html` from the skeleton, following the template's worked example in
     `examples/<template>/index.html`. Only the TL;DR and Sources are required: delete the
     skeleton sections the investigation has nothing for.
   - Fill in `site/report.json`: `tldr` = the answer sentence in plain text, plus `tags`,
     `model` (your exact model ID) and `agent` (the harness you run in, e.g. "Claude Code",
     "Codex").
7. **Check:** `node <this skill>/scripts/check.mjs ~/reports/<slug>/site`.
   - It fails on sideways scrolling at 390 px, console errors, NaN in the text, broken
     images, missing sources, or a page that is empty without JavaScript.
   - Then open its screenshots in `~/reports/<slug>/check/` and look: the first screen at
     each width, then the full page in pieces (`*-full-1.png`, …).
   - It doesn't click anything. Try the template's depth mechanism and controls yourself
     (see the note at the top of check.mjs).
   - Fix what's broken.
   - Without node, check the HTML by hand and rely on publish.sh.
8. **Publish:** `bash <this skill>/scripts/publish.sh <slug>`.
   - It checks the text (placeholders, citations, report.json, private files) and re-runs
     the render check without screenshots.
   - Then it copies `site/`, rebuilds the index and prints the URL.
   - If it lists problems, fix them and run it again.
9. **Reply** with the URL and the TL;DR in 2–3 lines, plus any gaps in the investigation
   you noticed.

## How a report reads
- **Progressive depth.**
  - Open with the TL;DR, which is required and comes first: the answer or verdict. Then give
    the big picture, then go deeper.
  - The reader chooses how deep to go and can always come back up. Each template does this
    its own way. Show inline what the argument needs, and put the rest one level down.
- **Only blocks that earn their place.**
  - A short answer makes a short report. Every paragraph carries information the reader
    needs.
  - Write plainly and specifically: numbers, names, mechanisms.
- **Visuals explain.** Each visual sits inside the block it explains and has a caption with
  the takeaway:
  - a diagram for relationships and flows (box diagram, Mermaid);
  - a chart for quantities;
  - a photo for physical subjects and places;
  - a table for comparing options.

  A visual that only decorates gets cut.
- **Interactive where it builds understanding:**
  - a live model when the investigation produced one (costs, growth, a business case);
  - levels for zooming from overview to internals.

  Defaults come from the investigation, and the formula stays visible.
- **Evidence transparency.**
  - Cite claims with `a.cite` links to Sources.
  - Tag the claims a decision rests on: sourced fact, estimate, assumption,
    interpretation.
  - Never invent a number. If you derive one, show how and tag it as an estimate.
- **Reconcile conflicts.**
  - When credible sources disagree, show each position, then give your best-supported
    conclusion with the reasoning or arithmetic behind it.
  - If the evidence doesn't settle it, say so.
- **Recommendations** appear when the user is deciding: concrete, prioritized, with what
  each one depends on. Close with risks, unknowns and next steps when they exist.
- **Creative freedom, aimed at explanation.**
  - Templates are the frame. Build custom visuals (`site/assets/custom.js`, see `core.md`)
    when they explain the topic better.
  - Animations are subtle and purposeful, and they respect reduced motion.
- **Works on phone and desktop alike**, and still reads without JavaScript (the prose
  lives in the HTML).

## Public by default
`site/` gets published. The request and the user's private context stay out of it:
- Keep the contents of `prompt.md` and `brief.md` out of `site/`. Don't quote or paraphrase
  the request ("Prepared for the question: …"). Write the dek as a neutral framing of the
  topic. Naming a kind of reader ("for a small team") is fine; identifying the user or their
  company is not.
- Leave out secrets, tokens, internal hostnames, IPs, file paths and descriptions of weak
  spots in the user's own systems. When the investigation is about their setup, describe it
  in general terms in the report, and give the specifics in your chat reply instead.

## Updating, republishing, switching, removing
- **Updating.** Reports are snapshots. Update one only when asked:
  - edit `~/reports/<slug>/site/` (and `brief.md`), then run `publish.sh <slug>` again;
  - publish.sh stamps `updated` when the original date is older than today;
  - add new findings where they belong and mention what changed in the TL;DR.
- **Older reports.** A report whose `report.json` has `"theme"` instead of `"template"` was
  made before templates existed. Its assets are self-contained, so edit it in place in its
  own format. If the render check in publish.sh fails on something you didn't touch,
  `PUBLISH_SKIP_CHECK=1 publish.sh <slug>` skips that check.
- **Switching templates** (also mid-work, when the user replies with another one):
  `new-report.sh --switch <slug> <template>` keeps the slug, `brief.md`, `model.js` and
  images, and swaps in the new skeleton. Render again from the brief, check, and publish.
- **Removing.** `rm -rf ~/www/<slug>`, then `publish.sh --index`. The workspace in
  `~/reports` stays.
- **Mermaid diagrams.** They need the library: `new-report.sh --vendor <slug>`.
- **Public links.** `WWW_DOMAIN` (the tunnel hostname from `.env`) makes the printed URLs
  public. Without it the scripts print the in-box address, and your reply says the domain
  isn't configured.
