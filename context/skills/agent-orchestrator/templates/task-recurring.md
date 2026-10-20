---
title: "{{TITLE}}"
task_slug: "{{TASK_SLUG}}"
type: "recurring"
agent: "{{AGENT}}"
created_at: "{{CREATED_AT}}"
target_repositories:
  - "{{REPO}}"
schedule_text: "{{SCHEDULE_TEXT}}"
cron_expression: "{{CRON}}"
timezone: "{{TIMEZONE}}"
status: "active"
---
# Recurring Task: {{TITLE}}

## Goal
{{GOAL}}

## Target Repositories
- `{{REPO}}`

## Schedule
Natural language:
```txt
{{SCHEDULE_TEXT}}
```
Cron: `{{CRON}}`
Timezone: `{{TIMEZONE}}`

## Requirements
{{REQUIREMENTS}}

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

## User Notes
{{USER_NOTES}}
