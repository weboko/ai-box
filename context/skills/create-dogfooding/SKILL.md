---
name: create-dogfooding
description: Writes a reusable dogfooding context for a repo, as linked Markdown files that describe its features and test scenarios with priority, provenance and dependencies, so later dogfooding runs don't rediscover the product. Use when the user wants to set up dogfooding, map out what is worth dogfooding, or create a dogfooding spec for a library, CLI, app or service that has no dogfooding context yet. If one already exists, use update-dogfooding. Not for general documentation, API references, agent instruction files such as AGENTS.md, or unit tests.
---

# Create dogfooding context

A dogfooding context describes the behavior a product is *supposed* to have, as scenarios a
later agent can run. `perform-dogfooding` executes it and `update-dogfooding` keeps it
current. Its value comes from being reusable across machines, agents and runs, so it holds
only intended behavior: no test code, bug lists or run results. Those change with every run
and would go stale inside the context.

Read `references/format.md` before writing files. The helper is
`bash <this skill>/scripts/dogfood-context.sh` (`locate`, `check`, `run-dir`; `-h` for usage).

## Workflow

1. **Locate:** run `dogfood-context.sh locate <repo>`.
   - If it reports `kind=repo` or `kind=local`, a context already exists. Switch to
     `update-dogfooding`; a second context would drift from the first.
2. **Discover** what users can do with the product and what should happen when they do it
   (`references/discovery.md`). Draw on docs, manifests, public exports, CLI parsers, routes,
   examples, CI and build files, and config. Tests count only as evidence of intended usage.
   - In a large repo, split discovery across subagents if your harness has them.
3. **Draft** the plan before writing anything: features → scenarios → priorities →
   `depends_on` → provenance.
4. **Ask** one batch of at most five questions, and only questions whose answers change the
   context. Doc vs code contradictions and the P0 list come first.
   - Record the user's answers as `confirmed` (`source: user YYYY-MM-DD`).
   - Skip this step if discovery left nothing important open.
5. **Ask where to store it**, as its own question, before writing anything. The answer decides
   which git actions you are allowed to take.

   | Option | What happens |
   |---|---|
   | **Repo + PR (recommended)** | `.dogfooding/` on branch `dogfooding/init`, pushed, PR opened |
   | **Repo, local branch** | committed on `dogfooding/init`, not pushed |
   | **Local** | `~/.dogfooding/<owner>/<repo>/`; the repo is not touched |

6. **Write** the files from `assets/templates/`:
   - `index.md`, with its "How this folder works" block kept verbatim (agents without these
     skills rely on it) and `commit:` set to the full HEAD sha;
   - `product.md`, then one `features/<feature>.md` per feature;
   - for repo storage only:
     - `.dogfooding/.gitignore` containing `runs/`;
     - `assets/templates/agents-snippet.md`, appended verbatim to the repo's `AGENTS.md`. Use
       `CLAUDE.md` if that is the only agent instructions file, and create `AGENTS.md` if there
       is neither.
7. **Check:** run `dogfood-context.sh check <context-dir>` until it prints `check: ok`. A
   broken ID or dependency silently breaks blocking and run-to-run comparison later.
8. **Persist** exactly as chosen in step 5. For a PR: commit, push the branch,
   `gh pr create`. Commit signing comes from git config; don't override it.
9. **Reply** in a few lines:
   - where the context lives;
   - features and scenarios by priority;
   - how many expectations are `inferred`, and which ones most need confirming;
   - doc/code contradictions still open;
   - bugs you noticed. They go here, not in the context.

## What goes where

| Found during discovery | Goes in |
|---|---|
| What the product does, its users, build/run steps, environments | `product.md` |
| Behavior a user relies on | a scenario in `features/` |
| Docs and code disagree | the scenario follows the docs (`documented`); the disagreement goes in its Notes and in your questions |
| A bug | your reply. The context describes intended behavior |
| Pass/fail results | nowhere. Running scenarios is `perform-dogfooding`'s job |
| Unit tests | evidence for writing scenarios. Not one scenario per test |

## Mistakes seen in testing

- **Committing before step 5 is answered.** Storage is the user's decision.
- **Adding extra files to the context:** `known-issues.md`, run logs, or a script that runs the
  scenarios. These turn the context into a stale snapshot.
- **Telling agents to keep the context updated automatically.** The snippet asks agents to
  *propose* updates and wait for agreement, so use it verbatim.
- **Labeling code-derived behavior as `documented`.** `documented` needs a doc or spec, and
  inferred priorities are not `confirmed`.
