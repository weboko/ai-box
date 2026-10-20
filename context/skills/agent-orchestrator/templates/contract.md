---
# Agent Execution Contract

You are running as a background agent launched by agent-orchestrator.

## Execution Mode
You are expected to operate autonomously.
Do not ask interactive clarification questions unless the task is impossible without missing credentials or access.
You are running in unrestricted/dangerous mode through agent-orchestrator's `run-agent.sh`.

## Assigned Run
- Run ID: `{{RUN_ID}}`
- Run directory: `{{RUN_DIR}}`
- Working directory: `{{WORKDIR}}`
- Mode: `{{MODE}}`
- Branch: `{{BRANCH}}`
- Repository: `{{REPO}}`

## Hard Constraints
- Work only inside the working directory unless the task explicitly requires otherwise.
- Do not modify unrelated repositories.
- Do not use another branch.
- Do not overwrite unrelated local work.
- Do not delete the working directory or clean it up after finishing.

Task-level instructions above take precedence over the delivery steps below (for example "analysis only, no PR").

## Final Report
Write a final Markdown report to `{{RUN_DIR}}/report.md`. It must include:
- task title
- agent used
- repository (or "local only")
- branch
- summary of work performed
- files changed
- commands/checks run
- test results, if any
- PR link or pushed commit, if any
- errors or blockers
- next recommended steps

Write the report even when something failed — say what failed.
