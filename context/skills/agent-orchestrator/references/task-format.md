# Task spec format

Every task is a Markdown file with YAML frontmatter. Use the templates in `../templates/` and fill the fields below. Filename: `<task-slug>_<YYYYMMDD-HHMMSS>.md`.

## Frontmatter — one-off

```yaml
---
title: "<task title>"
task_slug: "<task-slug>"          # lowercase-hyphen, ≤ 3 words
type: "one-off"
agent: "claude"                   # claude | codex
created_at: "2026-05-08T10:30:12+02:00"
target_repositories:
  - "<owner>/<repo>"              # or full GitHub URL
schedule: null                    # always null for one-off
status: "backlog"                 # backlog | running | done | failed
---
```

## Frontmatter — recurring

```yaml
---
title: "<task title>"
task_slug: "<task-slug>"
type: "recurring"
agent: "claude"
created_at: "2026-05-08T10:30:12+02:00"
target_repositories:
  - "<owner>/<repo>"
schedule_text: "every Monday at 09:00"
cron_expression: "0 9 * * 1"
timezone: ""                      # IANA name, e.g. "America/New_York"; empty → config/system
status: "active"                  # active | stopped
---
```

## Body sections (one-off)

```markdown
# Task: <title>

## Goal
<What the agent should accomplish.>

## Target Repositories
- `<owner>/<repo>`

## Background
<User-provided context worth knowing.>

## Requirements
- <…>

## Constraints
- Work only in the assigned isolated worktree.
- Do not modify unrelated files.
- Use the assigned branch.
- Commit changes.
- Push the branch.
- Create a pull request.
- Write a final report.

## Done Criteria
- Changes are implemented.
- Tests/checks are run where practical.
- Branch is pushed.
- Pull request is created.
- Final report is written.

## User Notes
<Original user message or salient excerpts.>
```

## Body sections (recurring)

Same as one-off plus:

```markdown
## Schedule
Natural language:
```txt
every Monday at 09:00
```
Cron: `0 9 * * 1`
Timezone: `<timezone or system>`

## Per-Run Behavior
Each run must:
- create a new isolated run folder
- create a new isolated worktree
- create a new branch
- perform the requested task
- commit changes if any
- push branch and open a PR if changes exist
- write a report

## Overlap Policy
If the previous instance of this recurring task is still running, skip the new run and write a skip log entry.

## Stop Policy
When stopped, disable/comment out the cron entry. Do not kill currently running agents unless explicitly requested.
```

## Slugs and filenames

- Slug rules: lowercase, hyphenated, no spaces or shell-sensitive chars, ≤3 meaningful words.
- One-off path: `$AO_HOME/backlog/<slug>_<runid>.md`.
- Recurring path: `$AO_HOME/backlog/recurring/<slug>_<runid>.md`.
- Stopped recurring: `$AO_HOME/backlog/recurring/stopped/...` or keep the file and set `status: stopped` — be consistent.
- Done one-off: `$AO_HOME/backlog/done/...` after finalize.

## What `agent-task.md` contains

`agent-task.md` is **not** the task spec. It is what the wrapper builds at launch time and feeds to the agent. It concatenates:

1. The original task body (frontmatter stripped or kept as comment).
2. Runtime metadata block — run ID, run dir, worktree, branch, repo.
3. The standard execution contract (`templates/agent-task-contract.md`).

Path: `$AO_HOME/runs/<run-id>/agent-task.md`. The agent reads only this file.
