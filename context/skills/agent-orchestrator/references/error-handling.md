# Error message templates

When something fails, surface it concretely. Don't silently fall back, don't auto-retry, don't switch agents.

## Agent binary missing

```
Agent binary not found: <agent>.
Install hint: <hint from run-agent.sh>
No run was started.
```

## Repo can't be resolved

```
Could not resolve repo: <repo-name>.
Searched:
  1. configured GitHub user (<github_user>)
  2. configured default org (<default_org>)
Provide owner/repo or a full GitHub URL, or explicitly ask for public GitHub search.
```

## gh not authenticated

```
gh CLI is not authenticated on this machine.
Run `gh auth login` yourself — I won't initiate auth flows on your behalf.
```

## Worktree creation failed

```
Failed to create isolated worktree.
  Base repo : $AO_HOME/repos/<owner>/<repo>
  Branch    : agent/<agent>/<slug>-<run-id>
  Target    : $AO_HOME/runs/<run-id>/worktree
  Error     : <git output>
No agent was launched.
```

## run-agent.sh missing or not executable

```
<skill-dir>/bin/run-agent.sh is not executable (or missing).
Fix with: chmod +x <skill-dir>/bin/run-agent.sh
No run was started.
```

## PR creation failed (post-launch)

This is the agent's failure, not ours. Surface but don't intervene:

```
Run <run-id> finished but did not create a PR.
  Worktree (preserved) : $AO_HOME/runs/<run-id>/worktree
  Branch (preserved)   : agent/<agent>/<slug>-<run-id>
  Failure report       : $AO_HOME/runs/<run-id>/report.md
  Log                  : $AO_HOME/runs/<run-id>/<slug>.<agent>.<run-id>.log
```

## Recurring overlap skipped

Logged to `cron.<slug>.log`, not surfaced unless asked:

```
[<iso-time>] SKIP slug=<slug>
  previous PID  : <pid>  (alive)
  previous log  : $AO_HOME/runs/<previous-run-id>/<slug>.<agent>.<previous-run-id>.log
```

## Invalid / ambiguous schedule

```
Could not convert schedule to cron safely.
  Original     : "<user phrase>"
  Reason       : <e.g., "no time of day specified" / "ambiguous weekday">
Please give me a concrete time, e.g. "every Monday at 09:00 America/New_York".
```

## "Stop" was misread as "kill"

If the user says "stop" and you're tempted to kill the running PID, **don't**. Run the disable wrapper and tell them:

```
Disabled the recurring schedule for <slug>. Currently running instance(s) were left alone.
To kill the running run too, say so explicitly (e.g. "kill run <run-id>").
```
