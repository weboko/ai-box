---
repo: <github.com/owner/repo>
tested_commit: <full sha><" (dirty)" if uncommitted changes were tested>
context: <path to the context used, or "temporary (in this run dir)">
context_commit: <sha from index.md> <(N commits behind tested_commit) when stale>
scope: "<the user's request, verbatim>"
mode: <scoped|full>
date: <YYYY-MM-DD HH:MM TZ>
agent: <harness and model id>
environment: <OS/arch, toolchain versions, network or fixtures used>
counts: {passed: 0, failed: 0, blocked: 0, skipped: 0, inconclusive: 0}
---

# Dogfooding report — <product> @ <short sha>

## Summary
<2–4 sentences: does the requested scope work, what is broken, what to fix first.>

## Results

| ID | Title | Priority | Status | Note |
|---|---|---|---|---|
| WALLET-001 | Create wallet | P0 | passed | |
| WALLET-002 | Fund wallet | P0 | failed | F1 |
| DEPLOY-001 | Deploy contract | P1 | blocked | by WALLET-002 |

Setup-only scenarios (run because in-scope ones need them) are marked "setup" in Note.

## Findings

### F1 — <one-line description> (<ID>, <priority>)
- **Scenario:** <ID — title> ([spec](<relative path to feature file>))
- **Commit:** <full sha>
- **Expected:** <from the spec> *(provenance: <confirmed|documented|inferred>)*
- **Actual:** <what happened>
- **Reproduce:**
  1. <exact step, from a fresh clone>
- **Commands and output:**
  ```
  $ <command>
  <relevant output, trimmed to what matters>
  ```
- **Evidence:** `evidence/<file>` <logs, full output, screenshots>
- **Environment:** <only what differs from the frontmatter, or is needed to reproduce>
- **Suspected location:** `<path:line>` <and why, if identifiable>
- **Blocks:** <IDs blocked by this failure>

## Blocked, skipped, inconclusive
- <ID>: <status> — <reason: which failure blocks it, what was missing, why it couldn't be judged>

## Context issues
<Places where the spec looked wrong or stale during the run: wrong steps, behavior the spec
doesn't describe, doc/code contradictions. Input for update-dogfooding. Delete if none.>

## Seen in passing
<Problems noticed while running in-scope steps, and not investigated further because they are
outside the requested scope. One line each. Delete if none.>

## Limitations
<What reduces confidence: stale context, a missing environment, steps that needed workarounds.>
