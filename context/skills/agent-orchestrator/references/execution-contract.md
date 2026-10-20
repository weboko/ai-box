# Execution contract

Every `agent-task.md` ends with the standard contract from `templates/agent-task-contract.md`. The wrapper substitutes `{{RUN_ID}}`, `{{AGENT}}`, `{{TASK_SLUG}}`, `{{REPO}}`, `{{BRANCH}}`, `{{RUN_DIR}}`, `{{WORKTREE}}` before launch — you never edit the contract per-run.

## What the contract obligates the agent to do

- Operate **autonomously**. No interactive clarification unless a credential or access blocker is genuinely missing.
- Stay inside the assigned worktree. Don't touch the persistent base repo or unrelated repos.
- Use the assigned branch only. Don't reuse or merge into other branches.
- Inspect → implement → run available checks → commit → push → open a PR.
- Use `gh` for GitHub. If push to upstream is unavailable, fork → sync → push to fork → PR upstream.
- If there's nothing useful to do, **don't open an empty PR** — write a report explaining why.
- Write a Markdown report to `$AO_HOME/runs/<run-id>/report.md` with: metadata, summary, files changed, checks run, results, errors, next steps, PR link.
- On failure, leave the worktree and branch in place. Don't clean up.

## Why this matters when you're orchestrating

You **don't restate the contract** in your conversation with the user or paraphrase it inline. The wrapper appends it verbatim. If the user asks "how do I know it'll push the branch?" or "what if there's no useful change?" — answer from the contract, don't promise things outside it.

If the user wants to **deviate** (e.g. "just analyze, don't open a PR"), capture that as a concrete `Constraints` line in the task body. The contract still applies, but task-level constraints take precedence per the spec body's "Constraints" section. Make this explicit in the spec rather than trying to rewrite the contract.

## Reading reports

Reports live at:

- `$AO_HOME/runs/<run-id>/report.md` (canonical).
- `$AO_HOME/reports/<task-slug>_<run-id>_<agent>.md` (copy made by `finalize-run.sh`).

The PR link, if any, will be in the report's metadata block. If it's not there and the agent claimed success, check the log for `https://github.com/.*/pull/`.
