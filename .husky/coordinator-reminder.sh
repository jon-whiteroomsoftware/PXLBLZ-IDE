#!/bin/sh
# Soft reminder (WRSP #114): coordinators brief a worker for source changes.
# Exits 0 always. Keys on provenance, not on who runs `git commit`: the launcher
# records every path a worker touched in <git-dir>/wrsp/worker-touched, and a
# core.quotePath=false: the record holds raw path bytes; default quoting would render src/café.ts as "src/caf\303\251.ts" and never match.
# process running with WRSP_ROLE=builder (a builder committing per its brief) is
# silent. Arguments are the source path prefixes to watch; default: src bin hooks.
[ "${WRSP_ROLE:-}" = builder ] && exit 0
[ $# -gt 0 ] || set -- src bin hooks
files=$(git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR -- "$@" 2>/dev/null) || exit 0
[ -n "$files" ] || exit 0
gitdir=$(git rev-parse --git-dir 2>/dev/null) || exit 0
touched=$gitdir/wrsp/worker-touched
if [ -s "$touched" ]; then
  # Drop blank lines first: an empty fixed-string pattern would match every path.
  patterns=$(grep -v '^$' "$touched")
  if [ -n "$patterns" ]; then
    files=$(printf '%s\n' "$files" | grep -vxF -f /dev/fd/3 3<<PATTERNS
$patterns
PATTERNS
)
  fi
  [ -n "$files" ] || exit 0
fi
n=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
printf 'WRSP: committing %s source file(s) no worker touched:\n' "$n" >&2
printf '%s\n' "$files" | sed 's/^/WRSP:   /' >&2
printf 'WRSP: a coordinator briefs a worker for source changes (developer skill, #114); launch-worker.sh records worker provenance.\n' >&2
exit 0
