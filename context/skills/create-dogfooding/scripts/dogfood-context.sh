#!/usr/bin/env bash
# Shared helper for the dogfooding skills (create-, perform-, update-dogfooding).
# Portable: bash 3.2+ (macOS) or 5 (Linux), git, POSIX awk. No python, node or yq.
#
#   dogfood-context.sh locate  [repo-path] [context-dir]   where the context is and how stale it is
#   dogfood-context.sh check   <context-dir>               lint the format (exit 1 on problems)
#   dogfood-context.sh run-dir [repo-path] [slug]          make a run folder for a report, print it
#
# Context is looked up in this order: the context-dir argument or $DOGFOOD_CONTEXT,
# <repo>/.dogfooding/, then ${DOGFOOD_HOME:-~/.dogfooding}/<owner>/<repo>/.
set -euo pipefail

die() { echo "dogfood-context: $*" >&2; exit 2; }

# Paths that don't count as product changes when measuring drift: the context itself and
# agent instruction files (create-dogfooding adds its snippet there).
NON_PRODUCT=":(exclude).dogfooding :(exclude)AGENTS.md :(exclude)CLAUDE.md"

# Frontmatter value of a top-level key: fm_get <file> <key>
fm_get() {
  awk -v k="$2" 'NR==1 && $0!="---" {exit} NR>1 && $0=="---" {exit}
    NR>1 && index($0, k": ")==1 { v=substr($0, length(k)+3); sub(/[ \t]+#.*$/, "", v); print v; exit }' "$1"
}

# github.com/owner/repo from the origin remote; local/<dirname> without one.
repo_id() {
  local root=$1 url
  url=$(git -C "$root" remote get-url origin 2>/dev/null || true)
  if [ -z "$url" ]; then echo "local/$(basename "$root")"; return; fi
  url=${url%.git}; url=${url%/}
  url=$(printf '%s\n' "$url" | sed -E 's#^[a-z+]+://##; s#^[^@/]+@##; s#:([^/0-9])#/\1#')
  echo "$url"
}

cmd_locate() {
  local path=${1:-.} ctx_arg=${2:-${DOGFOOD_CONTEXT:-}} root repo owner_repo kind=none dir=""
  [ -d "$path" ] || die "no such directory: $path"
  root=$(git -C "$path" rev-parse --show-toplevel 2>/dev/null) ||
    die "$path is not inside a git repository. Dogfooding context is tied to a repo's commits; run from the product's clone (git init it first if it has none)."
  repo=$(repo_id "$root")
  owner_repo=$(printf '%s\n' "$repo" | awk -F/ '{print $(NF-1) "/" $NF}')
  local home=${DOGFOOD_HOME:-$HOME/.dogfooding}
  if [ -n "$ctx_arg" ]; then
    [ -f "$ctx_arg/index.md" ] || die "no index.md in $ctx_arg"
    dir=$(cd "$ctx_arg" && pwd)
    case "$dir" in "$root"/*) kind=repo ;; *) kind=local ;; esac
  elif [ -f "$root/.dogfooding/index.md" ]; then
    kind=repo; dir="$root/.dogfooding"
  elif [ -f "$home/$owner_repo/index.md" ]; then
    kind=local; dir="$home/$owner_repo"
  fi
  local head ctx_commit="" since="" changed="" dirty=no runs
  head=$(git -C "$root" rev-parse HEAD 2>/dev/null || echo none)
  [ -n "$(git -C "$root" status --porcelain 2>/dev/null)" ] && dirty=yes
  if [ "$kind" != none ]; then
    ctx_commit=$(fm_get "$dir/index.md" commit)
    if [ -n "$ctx_commit" ] && git -C "$root" cat-file -e "$ctx_commit^{commit}" 2>/dev/null; then
      since=$(git -C "$root" rev-list --count "$ctx_commit..HEAD" -- . $NON_PRODUCT)   # product commits only
      changed=$(git -C "$root" diff --name-only "$ctx_commit" HEAD -- . $NON_PRODUCT | wc -l | tr -d ' ')
    else
      since=unknown; changed=unknown   # commit missing here: shallow clone, other fork, or typo
    fi
    runs="$dir/runs"
  else
    runs="$root/.dogfooding/runs"
  fi
  printf 'kind=%s\ndir=%s\nrepo=%s\nroot=%s\nhead=%s\ndirty=%s\ncontext_commit=%s\ncommits_since=%s\nchanged_files=%s\nruns=%s\n' \
    "$kind" "$dir" "$repo" "$root" "$head" "$dirty" "$ctx_commit" "$since" "$changed" "$runs"
}

cmd_run_dir() {
  local path=${1:-.} slug=${2:-} info root runs head id dir
  info=$(cmd_locate "$path")
  root=$(printf '%s\n' "$info" | sed -n 's/^root=//p')
  runs=$(printf '%s\n' "$info" | sed -n 's/^runs=//p')
  head=$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo nohead)
  id="$(date +%Y%m%d-%H%M)-$head${slug:+-$slug}"
  dir="$runs/$id"
  mkdir -p "$dir/evidence"
  case "$dir" in
    "$root"/*)
      if ! git -C "$root" check-ignore -q "$dir"; then
        local exclude
        exclude=$(git -C "$root" rev-parse --git-path info/exclude)
        case "$exclude" in /*) ;; *) exclude="$root/$exclude" ;; esac
        mkdir -p "$(dirname "$exclude")"
        echo "/.dogfooding/runs/" >> "$exclude"
      fi ;;
  esac
  echo "$dir"
}

# One line per problem on stdout. A function rather than inline in $( ), which bash 3.2
# misparses when it contains case patterns.
check_problems() {
  local dir=$1
      [ -f "$dir/index.md" ] || echo "index.md: missing"
      [ -f "$dir/product.md" ] || echo "product.md: missing"
      if [ -f "$dir/index.md" ]; then
        for k in dogfooding repo commit updated; do
          [ -n "$(fm_get "$dir/index.md" "$k")" ] || echo "index.md: frontmatter key '$k' missing or empty"
        done
      fi
      local f rel
      for f in "$dir"/features/*.md; do
        [ -f "$f" ] || { echo "features/: no feature files"; break; }
        rel=${f#"$dir"/}
        grep -q "($rel)" "$dir/index.md" 2>/dev/null || echo "index.md: does not link to $rel"
      done
      # Relative links between context files must resolve. Links that leave the context
      # folder (into the repo) are not checked: they can't resolve for local storage.
      for f in "$dir"/*.md "$dir"/features/*.md; do
        [ -f "$f" ] || continue
        rel=${f#"$dir"/}
        grep -o '\]([^)]*)' "$f" 2>/dev/null | sed 's/^](//; s/)$//; s/#.*$//; s/[[:space:]].*$//' |
        while IFS= read -r l; do
          case "$l" in ""|*:*) continue ;; esac
          local target norm
          target="$(dirname "$f")/$l"
          norm=$(printf '%s\n' "$target" | awk -F/ '{n=0; for(i=1;i<=NF;i++){ if($i==""||$i==".") continue; if($i==".."){ if(n>0) n--; continue } p[++n]=$i } s=""; for(i=1;i<=n;i++) s=s "/" p[i]; print s}')
          case "$norm" in "$dir"/*) [ -e "$norm" ] || echo "$rel: broken link ($l)" ;; esac
        done
      done
      # Feature frontmatter + scenario headings.
      ls "$dir"/features/*.md >/dev/null 2>&1 && awk -v base="$dir/" '
        function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
        function strip(s) { sub(/[ \t]+#.*$/, "", s); return trim(s) }
        function list(s, arr,   n, i, out) {   # "[A, B]" -> arr[1..n]
          s = strip(s)
          if (s !~ /^\[.*\]$/) return -1
          s = substr(s, 2, length(s) - 2); n = split(s, out, ",")
          for (i = 1; i <= n; i++) arr[i] = trim(out[i])
          if (n == 1 && arr[1] == "") n = 0
          return n
        }
        function where() { return FILENAME_REL }
        function endscen() {
          if (cur == "") return
          if (!(cur in stitle)) printf "%s: %s has no title\n", where(), cur
          if (!(cur in sprio)) printf "%s: %s has no priority\n", where(), cur
          if (!(cur in sprov)) printf "%s: %s has no provenance\n", where(), cur
          cur = ""
        }
        FNR == 1 {
          endscen()
          FILENAME_REL = substr(FILENAME, length(base) + 1)
          infm = ($0 == "---"); fmdone = 0; section = ""; files[FILENAME_REL] = 1; pre = ""
          if (!infm) printf "%s: no frontmatter\n", FILENAME_REL
          next
        }
        infm && $0 == "---" { endscen(); infm = 0; fmdone = 1; if (!(FILENAME_REL in fprefix)) printf "%s: frontmatter key prefix missing\n", FILENAME_REL; if (!(FILENAME_REL in ffeat)) printf "%s: frontmatter key feature missing\n", FILENAME_REL; next }
        infm && /^[A-Za-z_]+:/ {
          endscen()
          key = $0; sub(/:.*/, "", key); val = $0; sub(/^[^:]*:[ \t]*/, "", val); val = strip(val); section = key; plist = ""
          if (key !~ /^(feature|prefix|surface|scenarios|retired)$/) printf "%s: unknown frontmatter key %s (allowed: feature, prefix, surface, scenarios, retired)\n", FILENAME_REL, key
          if (key == "feature") ffeat[FILENAME_REL] = val
          if (key == "prefix") {
            fprefix[FILENAME_REL] = val; pre = val
            if (val in prefixfile) printf "%s: prefix %s already used in %s\n", FILENAME_REL, val, prefixfile[val]
            prefixfile[val] = FILENAME_REL
          }
          if (key == "surface" && val !~ /^(cli|api|ui|service|other)$/) printf "%s: surface \"%s\" is not cli|api|ui|service|other\n", FILENAME_REL, val
          if (key == "retired" && val == "") plist = "ret"
          else if (key == "retired") {
            n = list(val, arr)
            if (n < 0) printf "%s: retired must be a list: [A-001, A-002] or one \"- A-001\" line per ID\n", FILENAME_REL
            for (i = 1; i <= n; i++) { retired[arr[i]] = FILENAME_REL }
          }
          next
        }
        infm && section == "scenarios" && /^  - id:/ {
          endscen()
          plist = ""
          cur = $0; sub(/^  - id:[ \t]*/, "", cur); cur = strip(cur)
          if (cur in sfile) printf "%s: duplicate id %s (also in %s)\n", FILENAME_REL, cur, sfile[cur]
          sfile[cur] = FILENAME_REL; order[++nids] = cur
          if (pre != "" && cur !~ ("^" pre "-[0-9][0-9][0-9]+$")) printf "%s: id %s does not match %s-NNN\n", FILENAME_REL, cur, pre
          if (pre == "" && cur !~ /^[A-Z][A-Z0-9]*-[0-9][0-9][0-9]+$/) printf "%s: id %s is not PREFIX-NNN\n", FILENAME_REL, cur
          next
        }
        infm && section == "scenarios" && cur != "" && /^    [a-z_]+:/ {
          key = $0; sub(/^ +/, "", key); sub(/:.*/, "", key); val = $0; sub(/^[^:]*:[ \t]*/, "", val); val = strip(val); plist = ""
          if (key == "title") stitle[cur] = val
          else if (key == "priority") { sprio[cur] = val; if (val !~ /^P[012]$/) printf "%s: %s priority \"%s\" is not P0|P1|P2\n", FILENAME_REL, cur, val }
          else if (key == "provenance") { sprov[cur] = val; if (val !~ /^(confirmed|documented|inferred)$/) printf "%s: %s provenance \"%s\" is not confirmed|documented|inferred\n", FILENAME_REL, cur, val }
          else if (key == "depends_on" && val == "") plist = "dep"
          else if (key == "depends_on") {
            n = list(val, arr)
            if (n < 0) printf "%s: %s depends_on must be a list: [A-001] or one \"- A-001\" line per ID\n", FILENAME_REL, cur
            for (i = 1; i <= n; i++) { ndeps[cur]++; dep[cur, ndeps[cur]] = arr[i]; depfile[cur] = FILENAME_REL }
          }
          else if (key != "source") printf "%s: %s has unknown key %s (allowed: id, title, priority, provenance, source, depends_on)\n", FILENAME_REL, cur, key
          next
        }
        infm && /^[ \t]*-[ \t]/ {   # block list item under depends_on: or retired:
          item = $0; sub(/^[ \t]*-[ \t]*/, "", item); item = strip(item)
          if (plist == "dep") { ndeps[cur]++; dep[cur, ndeps[cur]] = item }
          else if (plist == "ret") retired[item] = FILENAME_REL
          else printf "%s: unexpected list item \"%s\" (only depends_on and retired take lists)\n", FILENAME_REL, trim($0)
          next
        }
        fmdone && /^## [A-Z][A-Z0-9]*-[0-9]+ / {
          h = $0; sub(/^## /, "", h); id = h; sub(/ .*/, "", id); t = h; sub(/^[^ ]+ +(—|-|–) +/, "", t)
          if (id in heading) printf "%s: heading for %s appears twice\n", FILENAME_REL, id
          heading[id] = FILENAME_REL; htitle[id] = trim(t)
          next
        }
        function visit(n,   i, d) {
          if (state[n] == 1) { printf "%s: dependency cycle through %s\n", sfile[n], n; cyc = 1; return }
          if (state[n] == 2) return
          state[n] = 1
          for (i = 1; i <= ndeps[n]; i++) { d = dep[n, i]; if (d in sfile) visit(d) }
          state[n] = 2
        }
        END {
          endscen()
          for (k = 1; k <= nids; k++) {
            id = order[k]
            if (!(id in heading)) printf "%s: no \"## %s — <title>\" section\n", sfile[id], id
            else if (heading[id] != sfile[id]) printf "%s: section for %s is in %s\n", sfile[id], id, heading[id]
            else if ((id in stitle) && htitle[id] != stitle[id]) printf "%s: %s heading title \"%s\" differs from frontmatter \"%s\"\n", sfile[id], id, htitle[id], stitle[id]
            if (id in retired) printf "%s: %s is retired (in %s) and must not be reused\n", sfile[id], id, retired[id]
            for (i = 1; i <= ndeps[id]; i++) {
              d = dep[id, i]
              if (!(d in sfile)) printf "%s: %s depends_on unknown id %s\n", sfile[id], id, d
              if (d == id) printf "%s: %s depends on itself\n", sfile[id], id
            }
          }
          for (id in heading) if (!(id in sfile)) printf "%s: section %s is not in any frontmatter scenarios list\n", heading[id], id
          for (k = 1; k <= nids; k++) visit(order[k])
        }
      ' "$dir"/features/*.md
}

cmd_check() {
  local dir=${1:-} problems
  [ -n "$dir" ] || die "usage: check <context-dir>"
  [ -d "$dir" ] || die "no such directory: $dir"
  dir=$(cd "$dir" && pwd)
  problems=$(check_problems "$dir" 2>&1 || true)
  if [ -n "$problems" ]; then
    printf '%s\n' "$problems" | sort -u
    echo "check: $(printf '%s\n' "$problems" | sort -u | wc -l | tr -d ' ') problem(s) in $dir" >&2
    return 1
  fi
  echo "check: ok ($dir)"
}

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; }

case "${1:-}" in
  -h|--help|help) usage ;;
  locate) shift; cmd_locate "$@" ;;
  check) shift; cmd_check "$@" ;;
  run-dir) shift; cmd_run_dir "$@" ;;
  *) usage >&2; exit 2 ;;
esac
