# Troubleshooting

Set these first; `BIN` is this skill's `bin/` folder.

```bash
AO_HOME=${AO_HOME:-$HOME/.agent-orchestrator}
BIN=<skill-dir>/bin
RID=$($BIN/status.sh --latest --json | jq -r .run_id)   # or a specific run id
R=$AO_HOME/runs/$RID
```

## Is it still running?

`$BIN/status.sh --run $RID` shows `running`, `done`, `failed`, `killed`, or `exited`. `exited` means the process is gone but never finalized (e.g. the box restarted mid-run); run `$BIN/finalize-run.sh --run-id $RID` to record it.

## Reading the log

```bash
tail -n 200 -f $R/agent.log                 # raw, any agent

# Claude (stream-json): assistant text
tail -f $R/agent.log | jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' 2>/dev/null

# Claude: tool calls
tail -f $R/agent.log | jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | "\(.name): \(.input | tostring | .[0:120])"' 2>/dev/null

# Codex (exec --json): agent messages
tail -f $R/agent.log | jq -r 'select(.type=="item.completed") | .item | select(.type=="agent_message") | .text' 2>/dev/null
```

Codex event names have changed between releases; if the filter prints nothing, read the raw log.

## Finding the PR

```bash
grep -oE 'https://github\.com/[^ )]+/pull/[0-9]+' $R/report.md $R/agent.log | head -1
```

## Why did it fail?

In order:
1. `$R/report.md` — the agent's own account; look at "errors or blockers".
2. `$R/exit_code` and the tail of `$R/agent.log` — tool errors, `gh` 4xx, auth problems.
3. `W=$(jq -r .workdir $R/run.json); git -C $W status; git -C $W log --oneline -5` — what was actually committed.
4. `$R/finalize.log` — if the run never reached `done`/`failed`.

No `report.md` usually means the agent crashed or was killed before the end.

## Why didn't a scheduled task run?

```bash
$BIN/schedule.sh list                       # status, schedule, last run; warns if no cron daemon
cat $AO_HOME/runs/cron.<slug>.log           # RUN / SKIP lines and any launch errors
crontab -l                                  # the managed block should list the spec
```

If the block is missing (e.g. after a container rebuild), `$BIN/schedule.sh sync` rewrites it. A `SKIP … reason=previous-run-alive` line means the last run was still going — expected, not an error.

## Push or local tasks: workspace problems

`push` and `local` tasks reuse one folder across runs (`workdir` in `run.json`, default `$AO_HOME/workspaces/<slug>`).

- **"workdir … is in use by run X"** — a previous run is still going. Wait, or kill it if the user asks.
- **"workdir … is a clone of …, not owner/repo"** — the spec's `repo:` or `workdir:` changed. Point `workdir:` somewhere new, or ask the user what to do with the old folder.
- **Push failed / history diverged** — the agent leaves its commit local and says so in the report. `git -C $W status` and `git -C $W log origin/HEAD..HEAD` show what's waiting. The next run starts by pulling with rebase and pushing again.

## Manual cleanup — only when the user asks

Nothing is cleaned up automatically. Persistent workspaces (`push`/`local`) hold the task's accumulated work: never delete one unless the user explicitly asks for that folder to go. For a `pr` run, confirm with the user first, then:

```bash
git -C "$(jq -r .base_repo_path $R/run.json)" worktree remove --force $R/worktree
git -C "$(jq -r .base_repo_path $R/run.json)" branch -D "$(jq -r .branch $R/run.json)"   # local branch only
rm -rf $R
```
