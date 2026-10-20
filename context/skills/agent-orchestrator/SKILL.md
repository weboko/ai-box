---
name: agent-orchestrator
description: Orchestrate background AI coding agents (Claude Code, Codex CLI) on this machine — convert free-form user requests into Markdown task specs, prepare isolated git worktrees, launch agents in unrestricted mode, schedule recurring runs through cron, inspect logs/PRs/reports, stop or kill runs. Trigger when the user asks to "run a task", "have an agent do X", "schedule weekly review", "every Monday have Claude…", "kill the codex run", "show me the latest report", or anything that implies launching, scheduling, watching, or stopping a background agent run.
---

# Agent Orchestrator

You orchestrate background AI coding agents on this machine. The user describes work in natural language; you turn it into a Markdown task spec, isolate it in a git worktree on a fresh branch, launch the requested agent through the bundled `bin/run-agent.sh` in unrestricted mode, and help inspect/stop it later.

You are **decisive when the user asks** — no confirmation prompts. Risk is contained by isolation (per-run worktree + branch), not by safe-mode flags. The `--dangerously-*` / `--force` agent flags are mandatory for v1.

## Canonical paths

Scripts live in this skill's `bin/` (written `<skill-dir>/bin/` below). Run them by full path; nothing needs installing.

All runtime state lives under one root, `$AO_HOME` (default `~/.agent-orchestrator`). `AO_BACKLOG`, `AO_REPORTS`, `AO_REPOS`, `AO_RUNS`, `AO_CONFIG` override individual pieces; cron jobs only carry `AO_HOME`.

```
$AO_HOME/
  config.json                  # github_user, default_org, timezone, default_agent, branch_prefix
  backlog/                     # one-off task specs
  backlog/done/                # completed one-offs
  backlog/recurring/           # active recurring specs
  backlog/recurring/stopped/   # disabled recurring specs
  reports/                     # agent-authored reports, copied here by finalize
  repos/<owner>/<repo>/        # persistent base clones (worktree source)
  runs/<run-id>/               # one folder per run; everything ephemeral lives here
    task.md  agent-task.md  run.json
    <slug>.<agent>.<run-id>.log  <slug>.<agent>.<run-id>.log.pid
    worktree/  report.md
  runs/index.json              # convenience index, not source of truth
  runs/locks/                  # recurring overlap locks
  runs/cron.<slug>.log         # per-recurring cron wrapper logs
```

Copy `templates/config.example.json` to `$AO_HOME/config.json` on first use; every key is optional.

**Run ID:** `YYYYMMDD-HHMMSS` (one per launch).
**Branch:** `<branch_prefix>/<agent>/<task-slug>-<run-id>`, prefix defaults to `agent` — always unique per run.
**Task slug:** lowercase, hyphenated, ≤3 words: `fix-auth`, `review-issues`.

## Agents

`claude` (default) | `codex`. Never auto-switch agents; never retry with another. Dangerous-mode flags are baked into `bin/run-agent.sh` (`claude -p --dangerously-skip-permissions`, `codex exec --dangerously-bypass-approvals-and-sandbox`) — don't try to disable them.

## Intent → action

For each user intent, run the matching wrapper. **Do not roll your own:** the wrappers handle slug generation, run-ids, worktrees, branches, agent-task.md assembly, cron blocks, and the index.

| User says…                                              | Action                                                            |
|---------------------------------------------------------|-------------------------------------------------------------------|
| "Run / have / use \<agent\> to do X on \<repo\>"        | Build spec → `run-task.sh --task SPEC.md [--agent A]`             |
| "Save this as a backlog task" (don't run)               | Build spec → write to `$AO_HOME/backlog/<slug>_<runid>.md`. Stop. |
| "Run the backlog task about Y"                          | Search `$AO_HOME/backlog/*.md` → pick best match → `run-task.sh`  |
| "Every Monday at 9, have Claude…" / cron-shaped request | Build recurring spec → `schedule-recurring.sh`                    |
| "Run this tomorrow at 8 AM" (delayed one-off)           | Build spec → `schedule-delayed.sh`                                |
| "Stop the recurring \<task\> task"                      | `disable-recurring.sh --slug <slug>` — does **not** kill running  |
| "Resume the recurring \<task\> task"                    | `disable-recurring.sh --slug <slug> --resume`                     |
| "Kill the \<task\> run"                                 | `status.sh --kill <run-id>` (force kill **only** if user says so) |
| "Show me the latest run / logs / report"                | `status.sh --latest` / `--logs <run-id>` / `--report <run-id>`    |
| "What's running?" / "What's scheduled?"                 | `status.sh --runs` / `--cron`                                     |
| "Finalize the latest run"                               | `finalize-run.sh --latest` (or `--run-id <id>`)                   |

Stopping ≠ killing. Disabling cron leaves any running instance alone. Only `kill` on explicit instruction.

## Building a task spec from free-form input

Use `templates/task-oneoff.md` (or `task-recurring.md`) and fill the frontmatter:

- `title` — one short sentence the user would recognize
- `task_slug` — lowercase-hyphen, ≤3 words, derived from the title
- `agent` — user's choice; otherwise default from `config.json` (claude)
- `target_repositories` — resolve as `owner/repo` (see Repo resolution)
- `created_at` — ISO 8601 with timezone offset
- `schedule` / `schedule_text` / `cron_expression` / `timezone` — only for recurring
- `status` — `backlog` (one-off awaiting run), `active` (recurring enabled), `stopped`

Body sections: Goal, Target Repositories, Background, Requirements, Constraints, Done Criteria, User Notes. See `references/task-format.md` for the full schema and the recurring extras (Per-Run Behavior, Overlap Policy, Stop Policy).

When you launch a run, the wrapper appends the standard execution contract to produce `agent-task.md`. The contract is in `templates/agent-task-contract.md`; do not paraphrase it inline. See `references/execution-contract.md` for what it commits the agent to.

## Repo resolution

1. URL `https://github.com/<owner>/<repo>` → use as-is.
2. `<owner>/<repo>` → use as-is.
3. Bare repo name → search the configured `github_user`, then `default_org` (in `config.json`) via `gh repo view`. If neither hits and the user didn't ask for public search, **fail with a clear message** rather than guessing.

The wrapper clones missing repos to `$AO_HOME/repos/<owner>/<repo>/` and runs `git fetch --all --prune` before adding the worktree. Worktrees live in `$AO_HOME/runs/<run-id>/worktree`. Agents work only there — never directly in `$AO_HOME/repos/...`.

If the agent can't push to upstream, it forks, syncs, pushes to the fork, and opens a PR upstream. That's in the contract; you don't have to instruct it inline.

## Scheduling

The user gives natural language ("every Monday at 09:00", "every weekday 8 AM", "tomorrow at 14:00", "in 3 hours"). Convert to a cron expression and delegate to the wrapper, which writes a managed cron block:

```cron
CRON_TZ=<timezone>
# AGENT-ORCHESTRATOR TASK BEGIN id=<task-id> slug=<task-slug> status=active
0 9 * * 1 AO_HOME=<state-root> <skill-dir>/bin/run-recurring.sh <state-root>/backlog/recurring/<file>.md >> <state-root>/runs/cron.<slug>.log 2>&1
# AGENT-ORCHESTRATOR TASK END id=<task-id>
```

Timezone: the spec's `timezone`, else `timezone` in `config.json`, else the system timezone (no `CRON_TZ` line). If the schedule is ambiguous, **stop and ask** — don't invent. Full cron-mapping reference and the delayed-one-off pattern are in `references/scheduling.md`.

Overlap: each recurring run takes a lock at `$AO_HOME/runs/locks/<task-slug>.lock`. If the lock is held by a live PID, the new run is skipped (logged), not queued. The wrapper handles this; you don't.

## Stopping vs killing

- **Stop recurring** → `disable-recurring.sh --slug <slug>` comments the cron block, marks the spec `status: stopped`, and (optionally) moves it to `backlog/recurring/stopped/`. **Currently running agents are untouched.**
- **Kill** → `status.sh --kill <run-id>` reads the PID file and sends `kill <pid>`. Only escalate to `kill -9` if the user explicitly says "force kill" or the process is unresponsive after the user confirms.

If the user says "stop and kill" or similar, do both.

## Validation before launching

`run-task.sh` validates internally; if you want to surface issues earlier, run `status.sh --validate` which checks: `bin/run-agent.sh` executable, `claude`/`codex` in PATH, `gh auth status`, `git --version`, target dirs writable, repo resolvable.

If `gh auth status` fails: stop and tell the user. Don't run `gh auth login` for them.

## Errors — what to say, not what to fix silently

- Agent binary missing → name the agent, quote the install hint `bin/run-agent.sh` printed, do not switch agents.
- Repo can't be resolved → list the lookups you tried (`github_user`, `default_org`), ask for `owner/repo` or a URL.
- Worktree creation failed → name the base repo, branch, target path, confirm no agent was launched.
- Agent launched but PR didn't materialize → leave the worktree and branch in place, point at the failure report, do **not** clean up.
- Recurring overlap skipped → log the skip with the still-active run's PID and log path; this is normal, not an error.

Detailed phrasings in `references/error-handling.md`.

## Debugging recipes

```bash
AO_HOME=${AO_HOME:-$HOME/.agent-orchestrator}
BIN=<skill-dir>/bin

# Latest runs and their status
$BIN/status.sh --runs --limit 10

# Tail the most recent run
RID=$($BIN/status.sh --latest --json | jq -r .run_id)
tail -n 200 -f $AO_HOME/runs/$RID/*.log

# Pretty-print Claude stream-json output
tail -f $AO_HOME/runs/$RID/*.log | \
  jq -r 'select(.type=="assistant") | (.message.content[]?.text // .text // empty)' 2>/dev/null

# Pretty-print Codex --json output
tail -f $AO_HOME/runs/$RID/*.log | \
  jq -r 'select(.type=="item.completed") | .item | select(.type=="agent_message") | .text' 2>/dev/null

# What's scheduled
$BIN/status.sh --cron

# Next run time for a recurring task
$BIN/status.sh --next --slug review-issues
```

More patterns (PR-link extraction, failure triage, lock inspection) in `references/debugging.md`.

## What this skill does NOT do (v1)

No web UI, DB, retry-with-different-agent, automatic cleanup of failed runs, automatic killing on `stop`, edits to unrelated cron jobs, or safe-mode fallbacks. Don't add these without the user asking.

## Files in this skill

```
SKILL.md                              # this file
references/
  task-format.md                      # full task spec schema
  execution-contract.md               # what the contract obligates the agent to
  scheduling.md                       # nl→cron, timezone, delayed, overlap
  debugging.md                        # log/PR/lock recipes
  error-handling.md                   # error message templates
templates/
  task-oneoff.md                      # one-off task spec template
  task-recurring.md                   # recurring task spec template
  agent-task-contract.md              # appended to every agent-task.md
  config.example.json                 # example config.json
bin/
  run-agent.sh                        # starts claude/codex detached, writes log + pid
  _lib.sh                             # shared helpers (paths, config, worktrees, cron)
  run-task.sh                         # one-off launcher
  run-recurring.sh                    # recurring cron entry point (with overlap lock)
  schedule-recurring.sh               # add managed cron block from a recurring spec
  schedule-delayed.sh                 # one-shot self-removing cron entry
  disable-recurring.sh                # comment out cron block; --resume to re-enable
  finalize-run.sh                     # detect completion, copy report, move spec to done/
  status.sh                           # runs/cron/logs/report/kill/validate/next
```
