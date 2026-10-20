#!/usr/bin/env bash
# The report formats gallery: one example report per template, all on the same topic, so a
# user can see what each template looks like before choosing.
#
#   formats.sh                      publish the gallery if missing or stale, print its URL
#   formats.sh <template>           same, then print that template's example URL and the
#                                   gallery URL ("example: …" / "all formats: …")
#   formats.sh --list               list the templates: name, aliases, one-line pitch
#   formats.sh --build <template> <dir>   assemble one example site into <dir> (for checks)
set -euo pipefail

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
www="${WWW_ROOT:-$HOME/www}"
dest="$www/report-formats"
templates="$skill_dir/assets/templates"
examples="$skill_dir/examples"

die() { echo "formats: $*" >&2; exit 1; }
command -v jq >/dev/null || die "jq is required"

list_templates() {
  local d
  for d in "$templates"/*/; do
    [ -f "$d/template.json" ] && basename "$d"
  done | sort -t/ -k1,1 | while read -r n; do
    printf '%s\t%s\n' "$(jq -r '.order // 99' "$templates/$n/template.json")" "$n"
  done | sort -n | cut -f2
}

# Assemble a standalone example site: core + template assets + shared model/photo + the
# example's own files (index.html, report.json, optional assets/ and images/).
build_one() {
  local name=$1 out=$2 tpl="$templates/$1" ex="$examples/$1"
  [ -d "$tpl" ] || die "unknown template '$name'"
  [ -f "$ex/index.html" ] || die "template '$name' has no example yet ($ex/index.html)"
  rm -rf "$out"
  mkdir -p "$out/assets/template" "$out/images"
  cp -R "$skill_dir/assets/core" "$out/assets/core"
  (cd "$tpl" && find . -type f ! -name index.html ! -name template.json -print0 | while IFS= read -r -d '' f; do
    mkdir -p "$out/assets/template/$(dirname "$f")"
    cp "$f" "$out/assets/template/$f"
  done)
  cp "$examples/_shared/model.js" "$out/assets/model.js"
  cp "$examples/_shared/"*.jpg "$out/images/" 2>/dev/null || true
  cp -R "$ex/." "$out/"
  chmod -R u+w "$out"
}

version() {
  (cd "$skill_dir" && find assets examples scripts/formats.sh -type f -print0 | sort -z | xargs -0 shasum | shasum | cut -c1-12)
}

public_url() {
  local path=$1 domain=${WWW_DOMAIN:-}
  domain=${domain#http://}; domain=${domain#https://}; domain=${domain%/}
  if [ -n "$domain" ]; then echo "https://$domain/$path"; else echo "http://localhost:${WEB_PORT:-8080}/$path"; fi
}

publish_all() {
  local v tmp n cards
  v=$(version)
  if [ -f "$dest/.version" ] && [ "$(cat "$dest/.version")" = "$v" ]; then return 0; fi
  tmp="$dest.publishing"
  rm -rf "$tmp"
  mkdir -p "$tmp/shots"
  cards=""
  for n in $(list_templates); do
    [ -f "$examples/$n/index.html" ] || continue
    build_one "$n" "$tmp/$n"
    for s in 1440 390; do
      [ -f "$examples/_gallery/$n-$s.png" ] && cp "$examples/_gallery/$n-$s.png" "$tmp/shots/"
    done
    cards+="$(jq -c --arg n "$n" '. + {name: $n}' "$templates/$n/template.json")"$'\n'
  done
  printf '%s' "$cards" | jq -rs '
    map(
      "    <li class=\"card\" id=\"\(.name)\">"
      + "<a class=\"shot\" href=\"\(.name)/\"><picture><source media=\"(max-width: 700px)\" srcset=\"shots/\(.name)-390.png\">"
      + "<img src=\"shots/\(.name)-1440.png\" alt=\"\(.title | @html) example\" loading=\"lazy\"></picture></a>"
      + "<div class=\"body\"><h2><a href=\"\(.name)/\">\(.title | @html)</a> <code>\(.name)</code></h2>"
      + "<p class=\"pitch\">\(.pitch | @html)</p>"
      + "<dl><dt>Best for</dt><dd>\(.bestFor | @html)</dd><dt>Weak spot</dt><dd>\(.weakness | @html)</dd></dl>"
      + "<p class=\"say\">Ask for it: " + ((.aliases // []) | map("<q>\(@html)</q>") | join(", ")) + "</p></div></li>"
    ) | join("\n")' >"$tmp/.cards"
  jq -Rrs --rawfile cards "$tmp/.cards" 'gsub("\\{\\{CARDS\\}\\}"; $cards)' "$skill_dir/assets/formats-index.html" >"$tmp/index.html"
  rm -f "$tmp/.cards"
  echo "$v" >"$tmp/.version"
  mkdir -p "$www"
  rm -rf "$dest"
  mv "$tmp" "$dest"
}

case "${1:-}" in
  --list)
    for n in $(list_templates); do
      jq -r --arg n "$n" '"\($n)\t\(.title)\t(\((.aliases // []) | join(", ")))\t\(.pitch)"' "$templates/$n/template.json"
    done
    ;;
  --build)
    [ -n "${2:-}" ] && [ -n "${3:-}" ] || die "usage: formats.sh --build <template> <dir>"
    build_one "$2" "$3"
    echo "built: $3"
    ;;
  "")
    publish_all
    public_url "report-formats/"
    ;;
  -*)
    die "unknown option $1"
    ;;
  *)
    [ -d "$templates/$1" ] || die "unknown template '$1' (formats.sh --list)"
    publish_all
    if [ -f "$examples/$1/index.html" ]; then echo "example:     $(public_url "report-formats/$1/")"; fi
    echo "all formats: $(public_url "report-formats/")"
    ;;
esac
