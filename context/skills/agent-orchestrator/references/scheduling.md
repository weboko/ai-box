# Scheduling

Use the current user's crontab. Timezone comes from the spec's `timezone` frontmatter, then `timezone` in `config.json`; if neither is set, no `CRON_TZ` is written and cron uses the system timezone.

Cron jobs get `AO_HOME` baked into the command line, so a custom state root survives into cron. Other `AO_*` overrides do not — set them under `AO_HOME` instead.

## Natural-language → cron

| User phrase                       | cron               | Notes                          |
|-----------------------------------|--------------------|--------------------------------|
| every minute                      | `* * * * *`        | Reject unless explicit         |
| every hour at :00                 | `0 * * * *`        |                                |
| every 6 hours                     | `0 */6 * * *`      |                                |
| every day at 09:00                | `0 9 * * *`        |                                |
| every morning at 9                | `0 9 * * *`        | "morning" → 09:00 unless told  |
| every weekday at 8 AM             | `0 8 * * 1-5`      |                                |
| every Monday at 09:00             | `0 9 * * 1`        | Sun=0/7, Mon=1, …              |
| every Friday at 5 PM              | `0 17 * * 5`       |                                |
| every weekend at 10               | `0 10 * * 0,6`     |                                |
| 1st of every month at 09:00       | `0 9 1 * *`        |                                |
| every 15 minutes                  | `*/15 * * * *`     |                                |

If the request is ambiguous ("sometime tomorrow", "around lunch", "twice a week"), **stop and ask** for a concrete time. Don't invent a schedule.

## Managed cron block format

The wrapper writes blocks delimited by markers so we can find/disable them later:

```cron
CRON_TZ=<timezone>   # only if a timezone is configured
# AGENT-ORCHESTRATOR TASK BEGIN id=<task-id> slug=<task-slug> status=active
0 9 * * 1 AO_HOME=<state-root> <skill-dir>/bin/run-recurring.sh <state-root>/backlog/recurring/<file>.md >> $AO_HOME/runs/cron.<task-slug>.log 2>&1
# AGENT-ORCHESTRATOR TASK END id=<task-id>
```

The `id` is `<slug>-<run-id>` from when the recurring task was first scheduled. The wrapper sets `CRON_TZ` once at the top of the user crontab if not already present.

`crontab -l | grep -E '# AGENT-ORCHESTRATOR TASK (BEGIN|END)'` lists all managed entries.

## Disabling

To stop a recurring task: comment the command line **inside** the block (keep the BEGIN/END markers and update `status=disabled` in the BEGIN comment). To resume: uncomment and restore `status=active`. The disable wrapper does this idempotently.

```cron
# AGENT-ORCHESTRATOR TASK BEGIN id=review-issues-20260508-103012 slug=review-issues status=disabled
# 0 9 * * 1 <skill-dir>/bin/run-recurring.sh ...
# AGENT-ORCHESTRATOR TASK END id=review-issues-20260508-103012
```

## Delayed one-off (`schedule-delayed`)

`schedule-delayed.sh --spec <spec> --at "YYYY-MM-DD HH:MM"` writes a managed block (id `delayed-<slug>-<YYYYMMDD-HHMM>`) whose cron fields match the target minute, hour, day and month. When it fires, the command touches a stamp file (`$AO_HOME/runs/.delayed-<id>.fired`) so it can't run twice, calls `run-task.sh`, then removes its own block from the crontab.

## Overlap policy (recurring)

`run-recurring.sh` takes a flock on `$AO_HOME/runs/locks/<task-slug>.lock` before delegating to `run-task.sh`. If the lock is held and the held PID is alive, the new run is **skipped** — write a one-line entry to `$AO_HOME/runs/cron.<task-slug>.log` and exit 0. Stale locks (PID dead) are reclaimed.

Locks track the **wrapper** PID, not the agent PID, because the agent is detached. The lock is released when the wrapper exits — which is when the agent has been launched. So overlap protection is "skip if the previous launch is still in progress", not "skip while the agent is still running". For a stricter policy (skip while agent still alive), the wrapper also checks the previous run's `<run-dir>/<slug>.<agent>.<run-id>.log.pid` against `kill -0`.

## Showing next run time

`status.sh --next --slug <slug>` parses the cron block and computes the next firing in the spec's timezone. Implementation can shell out to `python3 -c "from croniter import croniter; ..."` if `croniter` is installed; otherwise fall back to `chronic --next` or the bundled awk approximation in the wrapper.
