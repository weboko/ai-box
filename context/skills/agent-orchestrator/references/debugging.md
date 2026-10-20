# Debugging recipes

`<skill-dir>` is this skill's folder; `$AO_HOME` is the state root (default `~/.agent-orchestrator`). In a shell, set `AO_HOME=${AO_HOME:-$HOME/.agent-orchestrator}` before running the recipes below.

All paths use the run-id from `status.sh --latest --json | jq -r .run_id`.

## Is the agent still running?

```bash
RID=20260508-103012
PID=$(cat $AO_HOME/runs/$RID/*.log.pid)
if kill -0 "$PID" 2>/dev/null; then echo "alive ($PID)"; else echo "exited"; fi
```

`status.sh --runs` does this for the last N runs.

## Tail logs (raw vs pretty)

```bash
# Raw (works for all agents)
tail -n 200 -f $AO_HOME/runs/$RID/*.log

# Pretty for Claude (stream-json)
tail -f $AO_HOME/runs/$RID/*.log | \
  jq -r 'select(.type=="assistant") | (.message.content[]?.text // .text // empty)' 2>/dev/null

# Just tool uses (Claude)
tail -f $AO_HOME/runs/$RID/*.log | \
  jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | "\(.name): \(.input | tostring | .[0:120])"' 2>/dev/null

# Pretty for Codex (`exec --json` JSONL events)
tail -f $AO_HOME/runs/$RID/*.log | \
  jq -r 'select(.type=="item.completed") | .item | select(.type=="agent_message") | .text' 2>/dev/null
```

Codex event names have changed between releases; if the jq filter prints nothing, look at the raw log first.

## Find the PR link

```bash
# In the report
grep -E 'github\.com/[^ ]+/pull/[0-9]+' $AO_HOME/runs/$RID/report.md

# In the log if the agent forgot to write it
grep -oE 'https://github\.com/[^ ]+/pull/[0-9]+' $AO_HOME/runs/$RID/*.log | head -1
```

## Why did a recurring run skip?

```bash
# Cron wrapper logs show skips with PID + log path
grep -E 'SKIP|skipped' $AO_HOME/runs/cron.<slug>.log

# Check the lock
ls -l $AO_HOME/runs/locks/<slug>.lock
cat $AO_HOME/runs/locks/<slug>.lock   # contains wrapper PID
```

## Why did the agent fail?

Order of evidence:
1. `report.md` — agent's own writeup; its "Errors / Blockers" section is most useful when present.
2. `<slug>.<agent>.<run-id>.log` — last 100 lines often show a tool error or `gh` 4xx.
3. `worktree/` — `git status` and `git log` inside it show what was actually committed.
4. `git -C $AO_HOME/runs/$RID/worktree branch --show-current` confirms the branch.

If `report.md` doesn't exist, the agent crashed before finalization — read the tail of the run log.

## Validating before launch

```bash
<skill-dir>/bin/status.sh --validate
```

Checks: `run-agent.sh` executable, agent binaries in PATH, `gh auth status`, `git --version`, target directories writable, `config.json` parseable.

## Listing managed cron blocks

```bash
crontab -l | awk '/# AGENT-ORCHESTRATOR TASK BEGIN/,/# AGENT-ORCHESTRATOR TASK END/'
```

## Checking next firing time

```bash
<skill-dir>/bin/status.sh --next --slug review-issues
```

Prints: cron expression, timezone, next ISO timestamp, enabled/disabled state, last run id, whether the last run is still active.

## Cleaning up (manual, never automatic)

The system never cleans up automatically. To reclaim disk after a failed run:

```bash
# Remove the worktree git-cleanly (preferred)
git -C $AO_HOME/repos/<owner>/<repo> worktree remove --force $AO_HOME/runs/$RID/worktree

# Drop the run folder
rm -rf $AO_HOME/runs/$RID

# Remove from index
jq "map(select(.run_id != \"$RID\"))" $AO_HOME/runs/index.json > /tmp/idx && mv /tmp/idx $AO_HOME/runs/index.json
```

Always confirm with the user before doing this.
