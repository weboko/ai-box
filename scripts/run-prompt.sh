#!/usr/bin/env bash
set -euo pipefail

# Runs a prompt file through claude inside the `claude` container.
#   run-prompt.sh <prompt-file> [-i|--interactive] [-s|--sonnet] [-- extra claude args]
# Headless (`claude -p`) by default; -i opens the TUI with the prompt already sent.
# Opus 5.5 at medium effort by default; -s switches to Sonnet 5 at high effort. A --model or
# --effort after `--` wins over both, since claude takes the last occurrence.

usage() {
  echo "usage: $0 <prompt-file> [-i|--interactive] [-s|--sonnet] [-- extra claude args]" >&2
  exit 2
}

[ $# -ge 1 ] || usage
prompt_file="$1"
shift

interactive=0
model=claude-opus-5-5
effort=medium
extra=()
while [ $# -gt 0 ]; do
  case "$1" in
    -i|--interactive) interactive=1; shift ;;
    -s|--sonnet) model=claude-sonnet-5; effort=high; shift ;;
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

# The prompt goes before the extra args: variadic claude options such as --allowedTools or
# --add-dir would otherwise swallow it as one of their values.
if [ "$interactive" -eq 1 ]; then
  exec docker compose run --rm claude \
    claude --dangerously-skip-permissions "$prompt" \
    --model "$model" --effort "$effort" ${extra[@]+"${extra[@]}"}
else
  # No stdin: otherwise `claude -p` waits for piped input before starting.
  exec docker compose run --rm -T claude \
    claude -p --dangerously-skip-permissions "$prompt" \
    --model "$model" --effort "$effort" ${extra[@]+"${extra[@]}"} </dev/null
fi
