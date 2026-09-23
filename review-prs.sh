#!/usr/bin/env bash
# Dogfood logos-docs with prompts/prs-review.md. Headless by default; -i for interactive.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$root/scripts/run-prompt.sh" "$root/prompts/prs-review.md" "$@"
