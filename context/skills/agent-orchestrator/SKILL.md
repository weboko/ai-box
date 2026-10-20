---
name: agent-orchestrator
description: Orchestrate background AI coding agents (Claude Code, Codex CLI) on this machine — convert free-form user requests into Markdown task specs, prepare isolated git worktrees, launch agents in unrestricted mode, schedule recurring or delayed runs through cron, inspect logs/PRs/reports, stop or kill runs. Trigger when the user asks to "run a task", "have an agent do X", "schedule weekly review", "every Monday have Claude…", "kill the codex run", "show me the latest report", or anything that implies launching, scheduling, watching, or stopping a background agent run.
---

# Agent Orchestrator

The user describes work in natural language; you turn it into a task spec and launch it. Each run gets its own git worktree on a fresh branch, the agent (`claude` or `codex`) runs there unattended in unrestricted mode, opens a PR, and writes a report. You help inspect, schedule and stop runs.

Be **decisive when the user asks** — no confirmation prompts. Risk is contained by isolation (per-run worktree + branch), not by safe-mode flags. Never switch agents or retry with another one.

## Layout

Scripts are in this skill's `bin/` (written `bin/` below); call them by full path. State lives under `$AO_HOME` (default `~/.agent-orchestrator`):

```
config.json        # optional: github_user, default_org, default_agent, branch_prefix
backlog/           # one-off specs waiting to run;  backlog/done/ after they ran
scheduled/         # <slug>.md specs with cron: or run_at: — source of truth for the crontab
reports/           # copies of agent reports: <slug>_<run-id>_<agent>.md
repos/<owner>/<repo>/   # base clones the worktrees come from
runs/<run-id>/     # task.md agent-task.md run.json agent.log agent.pid exit_code report.md worktree/
runs/cron.<slug>.log    # what each scheduled firing did (RUN / SKIP)
```

Run id `YYYYMMDD-HHMMSS`. Branch `<branch_prefix>/<agent>/<slug>-<run-id>` (prefix defaults to `agent`). Template for `config.json`: `templates/config.example.json`.

## Intent → command

| User says…                                       | Do                                                                    |
|--------------------------------------------------|-----------------------------------------------------------------------|
| "Have \<agent\> do X on \<repo\>"                | Write spec → `bin/run-task.sh --task SPEC [--agent A]`                |
| "Save this as a backlog task" (don't run)        | Write spec to `$AO_HOME/backlog/<slug>.md`. Stop.                     |
| "Run the backlog task about Y"                   | Pick the best match in `$AO_HOME/backlog/*.md` → `bin/run-task.sh`    |
| "Every Monday at 9, have Claude…"                | Spec with `cron:` → `bin/schedule.sh add SPEC`                        |
| "Run this tomorrow at 8 AM"                      | Spec with `run_at:` → `bin/schedule.sh add SPEC`                      |
| "Stop / resume the \<slug\> schedule"            | `bin/schedule.sh disable SLUG` / `resume SLUG` — doesn't kill runs    |
| "Delete the \<slug\> schedule"                   | `bin/schedule.sh remove SLUG`                                         |
| "What's scheduled?"                              | `bin/schedule.sh list`                                                |
| "What's running?" / "latest run"                 | `bin/status.sh --runs` / `--latest`                                   |
| "Show logs / the report"                         | `bin/status.sh --logs RUN_ID` / `--report RUN_ID\|latest`             |
| "Kill the \<task\> run"                          | `bin/status.sh --kill RUN_ID` (`--force` only if the user says so)    |

Stopping a schedule ≠ killing a run. If the user says "stop and kill", do both.

Runs finalize themselves when the agent exits: `run.json` gets `done` (exit 0 and a report) or `failed`, the report is copied to `reports/`, and a backlog spec moves to `backlog/done/`. `bin/finalize-run.sh --run-id ID` is only for repairing a run whose process died.

## Writing a spec

Fill `templates/task.md`:

- `title` — one short sentence the user would recognize.
- `slug` — lowercase-hyphen, ≤3 words (`fix-auth`, `review-issues`). Scheduled slugs must be unique.
- `agent` — the user's choice, else omit (config `default_agent`, else `claude`).
- `repo` — `owner/repo` or a GitHub URL; one repo per task.
- Body: Goal, Background, Requirements, Done Criteria, User Notes. Keep it task-specific — worktree, branch, commit/push/PR and report rules come from `templates/agent-task-contract.md`, appended automatically. To deviate (e.g. "analysis only, no PR"), say so in Requirements; the contract defers to the task.
- Recurring tasks: write the goal so each run stands alone ("triage issues opened since the last run").

Save one-offs anywhere (usually `$AO_HOME/backlog/<slug>.md`); `schedule.sh add` copies scheduled specs into `scheduled/`.

## Repo resolution

`owner/repo` or a URL is used as-is. A bare name is looked up under config `github_user`, then `default_org`, via `gh repo view`; if neither has it, fail and ask for `owner/repo` — don't guess or search public GitHub unless asked. The base clone is created or fetched automatically; agents only ever work in the run's worktree.

## Scheduling

Times are **machine-local** — check with `date +%Z` and convert if the user gave another zone, then tell them which zone you used. If the request is ambiguous ("sometime tomorrow", "twice a week"), ask; don't invent a time.

| Phrase                 | `cron:`         |   | Phrase                     | `cron:`        |
|------------------------|-----------------|---|----------------------------|----------------|
| every day at 09:00     | `0 9 * * *`     |   | every Monday at 09:00      | `0 9 * * 1`    |
| every weekday at 8 AM  | `0 8 * * 1-5`   |   | every weekend at 10        | `0 10 * * 0,6` |
| every 6 hours          | `0 */6 * * *`   |   | 1st of the month at 09:00  | `0 9 1 * *`    |

One-shot: `run_at: "YYYY-MM-DD HH:MM"`; after it fires the spec moves to `backlog/done/`.

`schedule.sh` regenerates one marked block in the user's crontab from `scheduled/*.md` on every change (`schedule.sh sync` rebuilds it, e.g. after a container rebuild). A firing is skipped and logged when the previous run of that slug is still alive. Scheduling needs a running cron daemon — `schedule.sh list` warns when there isn't one.

## Before launching / when things fail

`bin/status.sh --validate` checks git, jq, `gh auth status`, agent binaries, crontab/cron daemon and the state dir. Report failures plainly, don't work around them:

- `gh` not authenticated → tell the user to run `gh auth login`; don't start auth flows yourself.
- Agent binary missing → name the agent and the install hint the script printed; don't switch agents.
- Repo unresolved → list what was tried (`github_user`, `default_org`), ask for `owner/repo`.
- Worktree creation failed → name the base repo, branch and target; no agent was started.
- Run `failed` / no PR → leave the worktree and branch, point at `report.md` and `agent.log`. Never clean up on your own.
- Scheduled firing skipped → normal; the `SKIP` line in `runs/cron.<slug>.log` names the live run.

Log reading, PR-link extraction, failure triage and manual cleanup: `references/troubleshooting.md`.

## Not in scope

No web UI or database, no retries or agent fallback, no automatic cleanup, no killing on "stop", no edits to crontab lines outside the managed block.
