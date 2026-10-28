---
name: perform-dogfooding
description: Dogfoods a product end to end against the scope the user names (a priority, a feature, what a branch changed, or everything), then writes an evidence-backed report that another agent can use to reproduce and fix each failure. Use when the user asks to dogfood a repo or part of it, or to exercise its features the way a real user would. Not for running or writing the repo's own unit or integration test suites.
---

# Perform dogfooding

**The user decides what gets tested; you decide how.** The report goes to a fixing agent that
never saw your run, so every status must be trustworthy and every failure reproducible
without rediscovering the product.

Helper: `bash <this skill>/../create-dogfooding/scripts/dogfood-context.sh` (`-h` for usage).

## 1. Find the dogfooding context

Run `dogfood-context.sh locate <repo>`.

- **`kind=repo` or `kind=local`:** read `index.md` (it explains the format), `product.md`, and
  the feature files in scope. If `commits_since` is above 0, say how far behind the context
  is, continue, and note it in the report.
- **`kind=none`:** ask which the user wants, then wait:
  - **A.** They provide a dogfooding context or an equivalent list of scenarios.
  - **B.** They describe the product, and you derive the scenarios.
  - **C.** You discover the product yourself, limited to the requested scope.

  Exploring a repo is costly and full of judgment calls, so that choice is theirs. Once they
  pick B or C, the run is authorized. Write the scenarios in the standard layout
  (`<this skill>/../create-dogfooding/references/format.md`) into `<run dir>/context/`. Include
  `index.md` and `product.md`, so `check` passes and the user can keep it as-is. List them in
  the plan message, and at the end offer to keep them via `create-dogfooding`.

## 2. Turn the request into a scenario set

| User says | Scenarios |
|---|---|
| "P0", "critical", "P0 and P1" | by `priority` |
| "user-facing" | features with `surface: ui` or `cli` |
| a feature or workflow name | matching feature files or scenario titles |
| "what this branch/PR changed" | scenarios of the features whose code or `source` paths `git diff <base>...HEAD` touches. New behavior with no scenario gets an ad hoc check, reported without an ID with its expectation marked `inferred`, and listed under "Context issues" |
| "full", "everything" | all scenarios, in **full mode** |

This set is the scope. Testing beyond it spends the user's time and blurs what the report
covers.
- Prerequisites of in-scope scenarios (`depends_on`) run as **setup**.
- Problems you happen to notice elsewhere get one line under "Seen in passing".
- If the request is vague ("the important stuff"), ask.

## 3. Plan

- Order the scenarios by `depends_on`.
- Build the environment from `product.md` "How to build and run". Prefer local and throwaway
  setups.
- Ask before any step that touches a shared, public or paid resource (testnets, real accounts,
  external APIs, messages to people), since those effects can't be undone. Offer a local
  alternative where one exists.
- Post the plan in one short message (IDs in order, environment, setup items) and continue.
- Create the run folder with `dogfood-context.sh run-dir <repo> <scope-slug>`. It has
  `evidence/` inside and stays out of git.

## 4. Execute

Run each scenario's Steps and check its Success criteria. Save full output, logs and
screenshots in `evidence/`. For UIs, use any browser automation available, installing it if
needed.

| Status | Meaning |
|---|---|
| `passed` | every success criterion verified |
| `failed` | a criterion checked and not met |
| `blocked` | a scenario it depends on failed or was blocked (name it) |
| `skipped` | deliberately not run (say why) |
| `inconclusive` | ran but couldn't be judged |

**After a failure:**
- **Scoped mode (default):** mark everything that depends on it, directly or transitively, as
  `blocked`, and don't run those scenarios. Don't seed state, edit data files or patch code to
  get past the failure. Results reached that way describe a path real users can't take, and
  the fixing agent would trust them.
- **Full mode:** attempt dependents only through an honest alternative the product offers (its
  own import, a shipped fixture, a documented admin route), and record it in the Note.
  Otherwise mark them `blocked`.
- **The user explicitly asks you to get past it:** do it, record exactly how, and report those
  results as "passed/failed (with workaround: …)".

If the failed expectation is `inferred`, the scenario may be wrong rather than the product. Say so
in the finding.

## 5. Report

Fill `<this skill>/assets/report.md` into `<run dir>/report.md`. Every `failed` and
`inconclusive` scenario gets a full finding block. State the scope verbatim, along with the
tested commit and the context commit. If the user gave reporting instructions, follow them.

**Comparison, only when asked:**
- Match the previous `report.md` they point to by scenario ID.
- List regressions, fixes, and new or missing scenarios.
- Note differences in scope, commit or environment.
- Add it as a "Comparison" section.
- Don't hunt for old reports: they usually live on other machines.

## 6. Reply

Give the counts, the failures (most severe first), and the report path. Then ask whether they
want an HTML version:
- if one of your skills creates or publishes reports (for example `create-report`), name it;
- otherwise offer a simple page.

Before sending, check:
- nothing outside the scope was tested;
- nothing reached through seeded state or patched code is reported as a normal result.
