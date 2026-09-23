#!/usr/bin/env bash
set -euo pipefail

# Runs a prompt file through claude inside the `claude` container.
#   run-prompt.sh <prompt-file> [-i|--interactive] [-- extra claude args]
# Headless (`claude -p`) by default; -i opens the TUI with the prompt already sent.

usage() {
  echo "usage: $0 <prompt-file> [-i|--interactive] [-- extra claude args]" >&2
  exit 2
}

[ $# -ge 1 ] || usage
prompt_file="$1"
shift

interactive=0
extra=()
while [ $# -gt 0 ]; do
  case "$1" in
    -i|--interactive) interactive=1; shift ;;
    --) shift; extra=("$@"); break ;;
    -h|--help) usage ;;
    *) echo "unknown option: $1" >&2; usage ;;
  esac
done

# Read the prompt before changing directory so relative paths resolve from the caller's cwd.
if [ ! -r "$prompt_file" ]; then
  echo "prompt file not found: $prompt_file" >&2
  exit 1
fi
prompt="$(cat "$prompt_file")"
if [ -z "${prompt//[[:space:]]/}" ]; then
  echo "prompt file is empty: $prompt_file" >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ "$interactive" -eq 1 ]; then
  exec docker compose run --rm claude \
    claude --dangerously-skip-permissions ${extra[@]+"${extra[@]}"} "$prompt"
else
  exec docker compose run --rm -T claude \
    claude -p --dangerously-skip-permissions ${extra[@]+"${extra[@]}"} "$prompt"
fi
