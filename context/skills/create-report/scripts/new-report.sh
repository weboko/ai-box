#!/usr/bin/env bash
# Scaffold a report workspace: $REPORTS_HOME/<date>-<slug>/ with a private prompt.md and
# the publishable site/ (template, chosen theme, Mermaid and Chart.js).
#
#   new-report.sh "<title>" <blueprint|editorial|explorer|dashboard> [short-name]
#   new-report.sh --vendor <slug>     re-fetch the JS libraries into an existing report
set -euo pipefail

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
reports="${REPORTS_HOME:-$HOME/reports}"
www="${WWW_ROOT:-$HOME/www}"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/create-report"

MERMAID_VERSION=11.17.2
CHARTJS_VERSION=4.5.1

die() { echo "new-report: $*" >&2; exit 1; }

# Downloads each library once into the cache, then copies it into the report. A failed
# download warns instead of failing: the report still works, minus diagrams or charts.
fetch_vendor() {
  local dest=$1/assets/vendor name version url file
  mkdir -p "$dest" "$cache"
  while read -r name version url; do
    file="$cache/$version-$name"
    if [ ! -s "$file" ]; then
      if ! curl -fsSL --retry 2 -o "$file.part" "$url"; then
        rm -f "$file.part"
        echo "new-report: warning: could not download $url; $name will not render" >&2
        continue
      fi
      mv "$file.part" "$file"
    fi
    cp "$file" "$dest/$name"
  done <<EOF
mermaid.min.js $MERMAID_VERSION https://cdn.jsdelivr.net/npm/mermaid@$MERMAID_VERSION/dist/mermaid.min.js
chart.umd.min.js $CHARTJS_VERSION https://cdn.jsdelivr.net/npm/chart.js@$CHARTJS_VERSION/dist/chart.umd.min.js
EOF
}

if [ "${1:-}" = "--vendor" ]; then
  [ -n "${2:-}" ] && [ -d "$reports/$2/site" ] || die "no report workspace $reports/${2:-<slug>}"
  fetch_vendor "$reports/$2/site"
  echo "vendor libraries refreshed in $reports/$2/site/assets/vendor"
  exit 0
fi

title=${1:-}
theme=${2:-}
short=${3:-}
[ -n "$title" ] && [ -n "$theme" ] || die 'usage: new-report.sh "<title>" <blueprint|editorial|explorer|dashboard> [short-name]'
theme_css="$skill_dir/assets/report/css/themes/$theme.css"
[ -f "$theme_css" ] || die "unknown theme '$theme' (blueprint, editorial, explorer, dashboard)"
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
tpl="$skill_dir/assets/report"
mkdir -p "$site/assets/css" "$site/assets/js" "$site/images"

# Copies, not links: the skill directory is read-only and reports must stand alone.
cp "$tpl/css/report.css" "$site/assets/css/report.css"
cp "$theme_css" "$site/assets/css/theme.css"
cp "$tpl/js/report.js" "$site/assets/js/report.js"
chmod -R u+w "$site"

title_html=$(jq -rn --arg t "$title" '$t | @html')
jq -Rrs --arg t "$title_html" --arg d "$date" 'gsub("\\{\\{TITLE\\}\\}"; $t) | gsub("\\{\\{DATE\\}\\}"; $d)' \
  "$tpl/index.html" >"$site/index.html"

# Claude Code marks its subprocesses; any other agent fills this in itself.
agent=""
[ -n "${CLAUDECODE:-}" ] && agent="Claude Code"
jq --arg title "$title" --arg slug "$slug" --arg date "$date" --arg theme "$theme" --arg agent "$agent" \
  --arg created "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '.title = $title | .slug = $slug | .date = $date | .created = $created | .theme = $theme | .agent = $agent' \
  "$tpl/report.json" >"$site/report.json"

cat >"$ws/prompt.md" <<EOF
# $title

- Date: $date
- Model:
- Report: $slug

## Request

<!-- create-report: replace this line with the user's request, verbatim -->
EOF

fetch_vendor "$site"

cat <<EOF
slug:      $slug
workspace: $ws
prompt:    $ws/prompt.md   (private: write the verbatim request here)
site:      $site           (everything here gets published)
publish:   bash $skill_dir/scripts/publish.sh $slug
EOF
