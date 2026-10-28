---
name: update-dogfooding
description: Reconciles an existing dogfooding context (a .dogfooding folder in the repo, or one under ~/.dogfooding) with changes to the product, proposing scenario edits for the user to approve. Use when the user asks to update, sync or fix the dogfooding context, including changing its scenarios, priorities or expectations, when a dogfooding run reported context issues, or right after you change product behavior (a feature, CLI, API, UI flow or its docs) in a repo that has a dogfooding context.
---

# Update dogfooding context

Keeps a dogfooding context true to the product. **You propose; the user approves; then you
edit.** The context records what the product is *supposed* to do. A code change might be the
new intent, or it might be a bug, and only the user can say which.

The helper lives in the sibling skill:
`bash <this skill>/../create-dogfooding/scripts/dogfood-context.sh` (`-h` for usage). The
context's own `index.md` explains the format. Read
`<this skill>/../create-dogfooding/references/format.md` when adding scenarios.

## Two ways in

| | Standalone ("update the dogfooding context") | Inline (you just changed the product) |
|---|---|---|
| What to review | `context_commit..HEAD`, plus uncommitted changes | only the change you just made |
| Where the proposal goes | one message after the review, then wait | the last part of your feature reply. The feature work is done; the proposal doesn't block it |
| `commit:` in `index.md` | moves to HEAD once every item has an answer | stays put |
| Persisting | edit in place; commit or open a PR only if asked | edit next to the feature change, on the same branch |

Inline `commit:` stays put because you reviewed only your change. Moving it would hide earlier
drift that nobody has reviewed.

## Workflow

1. **Locate:** run `dogfood-context.sh locate <repo>`.
   - `kind=none`: offer `create-dogfooding` instead.
   - Otherwise note `context_commit`, `commits_since` and `changed_files`.
2. **Gather the changes:** `git log --stat <context_commit>..HEAD` and `git diff <context_commit>`
   over code, docs and examples, plus any requirement changes the user states. Run the product
   where reading the code leaves doubt.
3. **Classify each affected scenario:**

   | Verdict | Proposed action |
   |---|---|
   | still valid | none; report only the count |
   | expectation changed | rewrite Expected/Steps/Success criteria; provenance follows the new source |
   | obsolete | delete the section and move the ID to `retired` |
   | new behavior | add a scenario with the next unused number |
   | dependencies changed | fix `depends_on` |
   | priority looks wrong | suggest it with a reason |
   | **contradicts a `confirmed` expectation** | show both sides (what the user confirmed, what the code does now) and ask which is intended |

4. **Propose:** one message with the reviewed range, conflicts first, then one line per change
   (`ID — action — reason`). Wait for the answer, which can accept all, some or none. Edit
   nothing in the context before then.
5. **Apply only what was accepted:**
   - keep existing IDs;
   - retire removed IDs; reusing one would make old reports point at a different scenario;
   - fix links, `depends_on` and the index table;
   - replace outdated text instead of appending to it;
   - a conflict the user settled becomes `confirmed` (`source: user YYYY-MM-DD`).

   Then run `dogfood-context.sh check <dir>` until it prints `check: ok`.
6. **Move `commit:`/`updated:`** in `index.md` only after a standalone review where every
   proposal got an answer.
7. **If the user declines,** leave the files untouched and don't propose the same change again in
   this session.

## Mistakes seen in testing

- **Editing first and asking afterwards,** or asking scenario by scenario over several messages.
- **Treating newer code as the new truth** for a `confirmed` expectation. The baseline agent did
  this.
- **Appending "Update: …" paragraphs.** Rewrite the section instead.
- **Writing bugs or run results into the context.** They belong in reports and in your reply.
