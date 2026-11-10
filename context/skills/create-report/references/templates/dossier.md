# Template: dossier (The Dossier)

A light, airy briefing pack. On top, **the brief**: one screen with the verdict, a tally of
the register, what to know, who should read what, numbers you can quote with their caveats,
claims not to make and questions to ask next. Below it, **the register**: one card per
judged item (a requirement, a finding, a test scenario) with a status label, a one-line
summary and a body that opens in place. Readers filter by status, see what changed since the
last round, group by area or severity and copy the register as a Markdown checklist. At the
end, **the outbox**: messages ready to send. Set in Fraunces (headings, numbers), Figtree
(reading) and Atkinson Hyperlegible Mono (ids, paths, hashes, where 0/O and l/1 must not be
confused). Worked example: `examples/dossier/index.html`. Shared markup, including the kit
(status, entry, tally, quotables, message): `../core.md`. Don't repeat it here; use it.

## When to use it
- **A review against a list**: milestone delivery, RFP or requirements check, readiness
  review, roadmap status ("what exists, what's planned, what's missing").
- **An audit or a test run** whose result is a set of separate findings or scenarios, each
  with its own status, location and fix.
- **A follow-up round**: the same items re-checked; `data-was` shows what moved.
- **Research other people will act on**: a BD team quoting numbers, colleagues replying to a
  partner, a grantee receiving a review. The brief and the outbox are written for them.

Not for: one argument that reads top to bottom (longread), a model to re-run (notebook,
cockpit), an answer organised by time (roadmap). Fewer than about 5 items to judge is a
table inside a longread, not a register.

## Page skeleton
Start from `assets/templates/dossier/index.html` (copied by `new-report.sh`). Minimal shape:
```html
<body id="top" data-short-title="Short name for the top bar">
<main class="page" id="main">
  <header class="masthead"> .kicker (spans) · h1 · .dek · .byline · details.meta · p.legend[data-ev-legend] </header>
  <section class="tldr brief sec" id="tldr" data-title="Brief">
    <h2>The brief</h2>
    <div class="brief-grid">
      <div class="brief-main"> .verdict-card (+ .tally) · .know > ol.know-list </div>
      <aside class="brief-side"> .routes </aside>
    </div>
    <h3>Numbers you can quote</h3> dl.quotables
    <div class="brief-pair"> ul.dont · ul.asks </div>
  </section>
  <section class="sec" id="register" data-title="Register"> h2 · .lede · div.register[data-export] > article.entry… </section>
  <section class="sec" id="…" data-title="…"> prose: method, numbers, decisions, next steps </section>
  <section class="sec" id="outbox" data-title="Outbox"> article.message… </section>
  <section class="sec" id="sources" data-title="Sources"> ol.sources </section>
  <footer class="colophon">…</footer>
</main>
```
`class="tldr brief sec"` must start with `tldr` (publish.sh greps `class="tldr`).
**Required:** the brief (with its verdict card) and Sources. Every other block is optional:
delete it when the investigation has nothing for it. Research without a decision drops
`data-verdict` (a neutral card) and labels it "The answer".

## Markup contract

### Top bar and sections
- The engine builds a sticky top bar from every `main > section.sec`: one tab per section
  (named by `data-title`, ≤ 20 characters), scroll-spy, a reading-progress line, the short
  title once the masthead scrolls away, and "✗ n" on a tab whose section holds blocking entries.
- Sections after the brief get a small number ("01") before their h2. Don't number headings yourself.
- `<p class="lede">` after each h2: the section's answer in one sentence, never a teaser.

### The brief (L0)
- `.verdict-card[data-verdict]`: `go`, `conditional`, `hold`, `no-go`, or none. `.verdict-label`
  names the call in a few words ("Verdict · Not closable yet, but close"); `.verdict-text` is the
  answer in one sentence; one short paragraph qualifies it. Put the `.tally` inside the card;
  with two registers, give each tally a `p.tally-label`.
- `.know-list`: 3–5 points, each a bold claim plus one sentence, tagged and cited.
- `.routes`: one link per kind of reader (`<a href="#…"><b>Reader</b>What they'll find</a>`).
  Name readers by role, never by person.
- `.quotables`: 2–4 numbers someone will repeat. Each `dt` is the number as it should be said;
  the `dd` says what it measures, with the source; `.caveat` says how not to misquote it.
- `.dont` / `.asks`: claims the evidence doesn't support (quote the tempting claim, then why
  not), and the questions that would settle open items (start with whom to ask).
- The engine adds "Print the brief" (prints only the brief) and "Copy the brief" (plain text
  for chat or email).

### The register (L1 → L2 → L3)
- `div.register` holds `article.entry` cards (kit markup in `core.md`). The head, summary and
  tags always show; everything after them is the L2 body that opens in place. Write the
  fields (`dl.entry-fields`) and any table or figure there. L3 is a native
  `<details class="deeper"><summary>…</summary>…</details>` inside the body.
- Bodies of blocking entries (bad tone) start open; with 6 or fewer entries, all start open;
  `data-open` on an entry forces it open. `data-more="Evidence"` renames its button.
- `data-export` on the register adds "Copy as Markdown" (a checklist the reader can paste
  into an issue or PR).
- Facets: `data-area` (group by area), `data-sev` (group by severity), `data-status` (always).
  The engine offers only the facets the entries carry.
- On desktop (≥ 1180 px) an "At a glance" index of every entry sits beside the register:
  status symbol, id and title, each a link.
- Several registers are fine (deliverables, then spec findings); each gets its own tools.
  Point each tally at its register with `data-of`.
- Order entries the way the source orders them (the milestone's list, the file tree) or by
  fix order; the filters and grouping cover the other views.

### Rounds
For a follow-up review, put the previous status in `data-was` on every entry (equal to
`data-status` when it didn't change) and `data-since="round 2"` on the tally. The register
gains a "Changed" filter, entries show "▲ was Open", and the tally ends with "▲ 9 improved
since round 2". Never invent an earlier status: leave `data-was` out on a first review.

### Prose sections
Method ("How it was checked": what was run, what was read, what was out of reach), the
numbers (a chart, a table, a `details.deeper` with the derivation), decisions (a
`table.compare`), recommendations and risks (`ol.recs[data-priority]`, `ul.risks[data-level]`),
next steps. Keep each to a lede plus a screen.

### The outbox
`article.message[data-to][data-via]` with an h3 subject and a `.message-body`. Write in the
reader's voice ("Thanks for m0-r1…"), not the report's, so it can be pasted unchanged. One
message per recipient. Keep private context out: the page is public.

## Brief levels → template
| Brief | Dossier |
|---|---|
| Title, dek, kicker, as-of | `h1`, `.dek`, `.kicker` spans |
| TL;DR L0 / L1 | `.verdict-text` / the paragraph under it |
| Findings | `.know-list` (3–5) |
| Items judged (requirements, findings, scenarios) | `.entry` cards: summary = L1, fields = L2, `details.deeper` = L3 |
| Previous round | `data-was` on entries, `data-since` on the tally |
| Section L0 / L1 / L2 / L3 | `.lede` / paragraphs / table or figure / `details.deeper` |
| Evidence tags | `.ev[data-ev]`, `a.cite`, `data-note` |
| Numbers people will repeat | `.quotables` with `.caveat` |
| Recommendation / Risks / Next | `ol.recs`, `ul.risks`, `.asks` in the brief |
| Messages to send | `.message` in the outbox |

## Mobile and no-JS
- Below 860 px the brief stacks; below 700 px the top bar shows only the tabs (scrolling
  sideways, the current one kept in view), the register's filter chips scroll in one row and
  the tools stop being sticky. Below 560 px an entry's title takes its own line under the id,
  status and button.
- Without JavaScript: no top bar, every entry body is open, no filters or index, tallies are
  empty (so the verdict text must carry the counts that matter), Copy buttons are absent and
  citations read "[source]". Everything still reads in document order.
- Print: "Print the brief" prints only the brief; a normal print gives the whole dossier with
  every entry open.

## Pitfalls
- A register of 3 items: use a table in a longread instead.
- Status colour without the word: always use the kit labels, never colour a cell by hand.
- Mixed vocabularies in one register ("met" here, "pass" there): pick one set per register.
- `data-was` on a first review, or guessed: deltas must come from the earlier round's report.
- Quotables without caveats, or more than four: the point is the few numbers people repeat.
- Outbox messages that quote the user's private context: the site is public.
- `class="brief tldr sec"`: publish.sh needs `class="tldr …"` first.

## Checklist
- [ ] Brief: verdict card with a one-sentence answer, tally pointing at the register, 3–5 points, routes.
- [ ] Every entry: id, title (a noun phrase), `data-status`, one-line summary, fields that say what closes it.
- [ ] Follow-up round: `data-was` on every entry, `data-since` on the tally.
- [ ] Decision-critical claims tagged; estimates carry `data-note` with the arithmetic.
- [ ] Outbox messages in the reader's voice, free of private context.
- [ ] `node scripts/check.mjs site` passes; at 390 px open an entry, filter "Missing", group by area.
