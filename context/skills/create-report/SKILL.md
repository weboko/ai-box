---
name: create-report
description: Use when the user asks for an investigation, research, deep dive, analysis, comparison or explainer delivered as a report, wants findings turned into a visual, shareable HTML page on their website, or asks to update, republish or remove a published report.
---

# Create report

Turns an investigation into a visual, interactive HTML report and publishes it to the
user's website: `~/www/<date>-<slug>/`, listed on `~/www/index.html`. The report exists to
make the user understand the topic and decide. Every block, visual and interaction serves
that purpose.

The reader is the user, sometimes people they share the link with. Infer what they already
know from how they ask. Everything in `site/` is public on the internet.

## Workflow

1. **Read the intent.** Is the user deciding, understanding or learning? What is the
   actual question, what do they already know, and what would change their mind? This
   decides the blocks, the depth, the tone and whether to give recommendations.
2. **Scaffold** (theme chosen by subject, see `references/themes.md`):
   `bash <this skill>/scripts/new-report.sh "<Title>" <blueprint|editorial|explorer|dashboard> [short-name]`
   It prints the slug (`<date>-<short-name>`, which becomes the URL) and creates
   `~/reports/<slug>/` with `prompt.md` (private) and `site/` (public). Pass a 2–4 word
   Latin-letter short name when the title is long or isn't in English.
3. **Save the prompt:** write the user's request verbatim into `prompt.md`, and fill in
   `Model:`. This file is never published.
4. **Research.** Prefer primary and authoritative sources and keep their URLs as you go
   (`notes.md` next to `prompt.md` is a good scratchpad). Download any images into
   `site/images/`.
5. **Write `site/index.html`** from the skeleton, using `references/blocks.md`, and fill in
   `site/report.json` (`tldr` = the answer sentence in plain text, `tags`, `model` = your
   exact model ID, `agent`). Restyle `assets/css/theme.css` if the topic deserves its own mood.
6. **Look at it:** serve `site/` (e.g. `caddy file-server --root <site> --listen :8099 &`)
   and screenshot it at desktop and phone size, then open the images and look:
   `npx -y playwright@1 screenshot --full-page --wait-for-timeout 2500 [--device "Pixel 7" | --viewport-size 1440,900] <url> <out.png>`
   (the first use needs `npx -y playwright@1 install --with-deps chromium`). Fix what's
   broken. With no node or browser available, check the HTML and rely on publish.sh.
7. **Publish:** `bash <this skill>/scripts/publish.sh <slug>`. It checks the report, copies
   `site/`, rebuilds the index and prints the URL. If it lists problems, fix them and run it
   again.
8. **Reply** with the URL and the TL;DR in 2–3 lines.

## How a report reads

- **Progressive depth.** Open with the TL;DR (required, first): the answer or verdict. Then
  give the big picture, then go deeper section by section. The reader chooses how deep to go
  and can always come back up: `details.more` for optional depth, a layered explorer for
  models and diagrams that have levels, the sticky TOC for orientation. Show inline what the
  argument needs. Collapse what only some readers want.
- **Only blocks that earn their place.** A short answer makes a short report. Every
  paragraph carries information the reader needs. Write plainly and specifically: numbers,
  names, mechanisms.
- **Visuals explain.** Each one sits inside the block it explains and has a caption with the
  takeaway: a diagram for relationships and flows, a chart for quantities, a photo for
  physical subjects and places, a table for comparing options. A visual that only decorates
  gets cut.
- **Interactive where it builds understanding:** a calculator or what-if explorer when the
  investigation produced a model (a business case, costs, growth), a layered explorer for
  zooming from overview to internals, a step-through for processes. Defaults come from the
  research, and the model formula stays visible.
- **Evidence transparency.** Cite claims with numbered `[n]` markers that link to Sources.
  Use evidence tags on the claims a decision rests on: sourced fact, estimate, assumption,
  interpretation. Never invent a number. If you derive one, show how and tag it as an
  estimate.
- **Reconcile conflicts.** When credible sources disagree, show each position, then give
  your best-supported conclusion with the reasoning or arithmetic behind it. If the evidence
  doesn't settle it, say so.
- **Recommendations** appear when the user is deciding: concrete, prioritized, with what
  each one depends on. Close with risks, unknowns and next steps when they exist.
- **Creative freedom, aimed at explanation:** themes and components are starting points.
  Build custom visuals or interactions (SVG, canvas, CSS) when they explain the topic better.
  Animations are subtle and purposeful (`report.css` honors reduced motion).
- **Works on phone and desktop alike.** Check that wide content (tables, diagrams) scrolls or
  zooms at 390px instead of breaking the layout.

## Public by default

`site/` gets published, and the request and the user's private context stay out of it:

- No `prompt.md` contents in `site/`, and no quoting or paraphrasing the request ("Prepared
  for the question: …"). Write the dek as a neutral framing of the topic.
- No secrets, tokens, internal hostnames, IPs, file paths or descriptions of weak spots in
  the user's own systems. When the investigation is about their setup, describe it in general
  terms in the report, and give the specifics in your chat reply instead.

## Updating, republishing, removing

- Reports are snapshots. Update one only when asked: edit `~/reports/<slug>/site/`, then run
  `publish.sh <slug>` again (it stamps `updated` when the original date is older than
  today). Add new findings where they belong and mention what changed in the TL;DR.
- Remove: `rm -rf ~/www/<slug>`, then `publish.sh --index`. The workspace in `~/reports` stays.
- Missing Mermaid or Chart.js (the download failed): `new-report.sh --vendor <slug>`.
- `WWW_DOMAIN` (the tunnel hostname from `.env`) makes the printed URL public. Without it,
  `publish.sh` prints the in-box address, and your reply says the domain isn't configured.
