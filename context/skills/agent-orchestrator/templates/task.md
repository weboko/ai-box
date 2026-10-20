---
title: "{{TITLE}}"
slug: "{{SLUG}}"
agent: "{{AGENT}}"
repo: "{{REPO}}"
# Optional — where the agent works (default: pr with a repo, local without):
# mode: "push"              # pr | push | local
# create_repo: true         # pr/push: create the repo on GitHub if it doesn't exist
# visibility: "private"     # with create_repo: private | public
# workdir: "~/notes/x"      # push/local: persistent folder (default $AO_HOME/workspaces/<slug>)
# Scheduled tasks only — set exactly one, in machine-local time:
# cron: "0 9 * * 1"
# run_at: "2030-01-02 08:30"
---
# Task: {{TITLE}}

## Goal
{{GOAL}}

## Background
{{BACKGROUND}}

## Requirements
{{REQUIREMENTS}}

## Done Criteria
{{DONE_CRITERIA}}

## User Notes
{{USER_NOTES}}
