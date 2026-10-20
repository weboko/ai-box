#!/usr/bin/env bash
# Scaffold a report workspace: $REPORTS_HOME/<date>-<slug>/ with a private prompt.md and
# brief.md, and the publishable site/ (core + the chosen template).
#
#   new-report.sh "<title>" <template> [short-name]
#   new-report.sh --switch <slug> <template>   re-scaffold an existing report in another
#                                     template (same slug, brief, model and images; the old
#                                     page is kept outside site/ for reference)
#   new-report.sh --vendor <slug>     fetch Mermaid into an existing report (diagrams)
#   new-report.sh --templates         list the templates
set -euo pipefail

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
reports="${REPORTS_HOME:-$HOME/reports}"
www="${WWW_ROOT:-$HOME/www}"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/create-report"
templates="$skill_dir/assets/templates"

MERMAID_VERSION=11.17.2

die() { echo "new-report: $*" >&2; exit 1; }
names() { for d in "$templates"/*/; do [ -f "$d/template.json" ] && basename "$d"; done | paste -sd'|' -; }

# Mermaid is optional (core charts and box diagrams need no library). Downloaded once into
# the cache, then copied into the report; publish.sh drops it when the page doesn't use it.
fetch_mermaid() {
  local dest=$1/assets/vendor file="$cache/$MERMAID_VERSION-mermaid.min.js"
  mkdir -p "$dest" "$cache"
  if [ ! -s "$file" ]; then
    curl -fsSL --retry 2 -o "$file.part" "https://cdn.jsdelivr.net/npm/mermaid@$MERMAID_VERSION/dist/mermaid.min.js" \
      || { rm -f "$file.part"; die "could not download Mermaid"; }
    mv "$file.part" "$file"
  fi
  cp "$file" "$dest/mermaid.min.js"
}

case "${1:-}" in
  --vendor)
    [ -n "${2:-}" ] && [ -d "$reports/$2/site" ] || die "no report workspace $reports/${2:-<slug>}"
    fetch_mermaid "$reports/$2/site"
    echo "mermaid: $reports/$2/site/assets/vendor/mermaid.min.js"
    echo 'core.js loads it automatically on pages that have a .mermaid element'
    exit 0
    ;;
  --templates)
    exec bash "$skill_dir/scripts/formats.sh" --list
    ;;
  --switch)
    slug=${2:-}; template=${3:-}
    site="$reports/$slug/site"
    [ -n "$slug" ] && [ -d "$site" ] || die "no report workspace $reports/${slug:-<slug>}"
    tpl="$templates/$template"
    [ -n "$template" ] && [ -f "$tpl/template.json" ] || die "unknown template '$template' ($(names | tr '|' ' '))"
    command -v jq >/dev/null || die "jq is required"
    old=$(jq -r '.template // .theme // "old"' "$site/report.json")
    keep="$reports/$slug/index.$old.$(date +%H%M%S).html"
    [ -f "$site/index.html" ] && mv "$site/index.html" "$keep"
    rm -rf "$site/assets/template" "$site/assets/core" "$site/assets/css" "$site/assets/js"
    mkdir -p "$site/assets/template"
    cp -R "$skill_dir/assets/core" "$site/assets/core"
    (cd "$tpl" && find . -type f ! -name index.html ! -name template.json -print0 | while IFS= read -r -d '' f; do
      mkdir -p "$site/assets/template/$(dirname "$f")"
      cp "$f" "$site/assets/template/$f"
    done)
    chmod -R u+w "$site"
    title=$(jq -r '.title' "$site/report.json")
    jq -Rrs --arg t "$(jq -rn --arg t "$title" '$t | @html')" --arg d "$(jq -r '.date' "$site/report.json")" \
      'gsub("\\{\\{TITLE\\}\\}"; $t) | gsub("\\{\\{DATE\\}\\}"; $d)' "$tpl/index.html" >"$site/index.html"
    tmp="$site/report.json.tmp"
    jq --arg t "$template" '.template = $t | del(.theme)' "$site/report.json" >"$tmp" && mv "$tmp" "$site/report.json"
    sed -i.bak -E "s/^- Template: .*/- Template: $template/" "$reports/$slug/prompt.md" && rm -f "$reports/$slug/prompt.md.bak"
    echo "switched:  $slug → $template   (guide: $skill_dir/references/templates/$template.md)"
    echo "old page:  $keep   (reference only; not published)"
    echo "next:      render site/index.html from brief.md, check, publish.sh $slug"
    exit 0
    ;;
esac

title=${1:-}
template=${2:-}
short=${3:-}
[ -n "$title" ] && [ -n "$template" ] || die "usage: new-report.sh \"<title>\" <$(names)> [short-name]"
tpl="$templates/$template"
[ -f "$tpl/template.json" ] && [ -f "$tpl/index.html" ] || die "unknown template '$template' ($(names | tr '|' ' '))"
command -v jq >/dev/null || die "jq is required"

date=$(date +%F)
# URL-safe name from the short name or the title, cut at a word boundary to keep URLs short.
kebab=$(printf '%s' "${short:-$title}" | LC_ALL=C tr '[:upper:]' '[:lower:]' | LC_ALL=C sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
if [ ${#kebab} -gt 40 ]; then
  kebab=$(printf '%s' "$kebab" | cut -c1-41 | sed -E 's/-[^-]*$//')
fi
base="$date-${kebab:-report}"
slug=$base
n=2
while [ -e "$reports/$slug" ] || [ -e "$www/$slug" ]; do
  slug="$base-$n"
  n=$((n + 1))
done

ws="$reports/$slug"
site="$ws/site"
mkdir -p "$site/assets/template" "$site/images"

# Copies, not links: the skill directory is read-only and reports must stand alone.
cp -R "$skill_dir/assets/core" "$site/assets/core"
(cd "$tpl" && find . -type f ! -name index.html ! -name template.json -print0 | while IFS= read -r -d '' f; do
  mkdir -p "$site/assets/template/$(dirname "$f")"
  cp "$f" "$site/assets/template/$f"
done)
chmod -R u+w "$site"

title_html=$(jq -rn --arg t "$title" '$t | @html')
jq -Rrs --arg t "$title_html" --arg d "$date" 'gsub("\\{\\{TITLE\\}\\}"; $t) | gsub("\\{\\{DATE\\}\\}"; $d)' \
  "$tpl/index.html" >"$site/index.html"

# Claude Code marks its subprocesses; any other agent fills this in itself.
agent=""
[ -n "${CLAUDECODE:-}" ] && agent="Claude Code"
jq -n --arg title "$title" --arg slug "$slug" --arg date "$date" --arg template "$template" --arg agent "$agent" \
  --arg created "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{title: $title, slug: $slug, date: $date, created: $created, updated: "", tldr: "", tags: [], model: "", agent: $agent, template: $template, notes: ""}' \
  >"$site/report.json"

cat >"$ws/prompt.md" <<EOF
# $title

- Date: $date
- Model:
- Report: $slug
- Template: $template

## Request

<!-- create-report: replace this line with the user's request, verbatim -->

## Context

<!-- One line: the question the investigation answered, if the request doesn't say it
     ("make a report from this"). -->
EOF

cat >"$ws/brief.md" <<EOF
<!-- create-report: the investigation distilled (references/brief.md). Private, never published. -->
# $title
EOF

cat <<EOF
slug:      $slug
template:  $template   (guide: $skill_dir/references/templates/$template.md)
workspace: $ws
prompt:    $ws/prompt.md   (private: write the verbatim request here)
brief:     $ws/brief.md    (private: the investigation distilled, see references/brief.md)
site:      $site           (everything here gets published)
check:     node $skill_dir/scripts/check.mjs $site
publish:   bash $skill_dir/scripts/publish.sh $slug
EOF
