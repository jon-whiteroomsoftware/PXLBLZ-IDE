#!/bin/sh
set -eu

ROOT=$(git rev-parse --show-toplevel)
HOOK="$ROOT/.husky/pre-push"
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/pxlblz-pre-push-ref-test.XXXXXX")
trap 'rm -rf "$TEST_DIR"' EXIT

BIN_DIR="$TEST_DIR/bin"
CALL_LOG="$TEST_DIR/calls.log"
OUTPUT="$TEST_DIR/output.log"
mkdir -p "$BIN_DIR"
: > "$CALL_LOG"

cat > "$BIN_DIR/npm" <<'STUB'
#!/bin/sh
printf 'npm %s\n' "$*" >> "$WRSP_PRE_PUSH_TEST_CALL_LOG"
if [ "${1:-}" = "run" ] && [ "${2:-}" = "review:push" ]; then
  while IFS= read -r update; do
    printf 'review-input %s\n' "$update" >> "$WRSP_PRE_PUSH_TEST_CALL_LOG"
  done
fi
STUB

cat > "$BIN_DIR/wrsp-check-test-evidence" <<'STUB'
#!/bin/sh
printf 'evidence %s\n' "$*" >> "$WRSP_PRE_PUSH_TEST_CALL_LOG"
STUB

# The current hook uses npx for this binary. Keep the red test deterministic;
# the corrected hook may resolve the PATH-stubbed package binary directly.
cat > "$BIN_DIR/npx" <<'STUB'
#!/bin/sh
exec "$@"
STUB

chmod +x "$BIN_DIR/npm" "$BIN_DIR/npx" "$BIN_DIR/wrsp-check-test-evidence"
export WRSP_PRE_PUSH_TEST_CALL_LOG="$CALL_LOG"

HEAD_SHA=$(git rev-parse HEAD)
ZERO_SHA=0000000000000000000000000000000000000000
OTHER_SHA=1111111111111111111111111111111111111111
REMOTE_SHA=2222222222222222222222222222222222222222

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_contains() {
  file=$1
  expected=$2
  grep -F -- "$expected" "$file" >/dev/null ||
    fail "expected $file to contain: $expected"
}

assert_call_count() {
  prefix=$1
  expected=$2
  actual=$(grep -c "^$prefix" "$CALL_LOG" || true)
  [ "$actual" -eq "$expected" ] ||
    fail "expected $expected '$prefix' calls, got $actual"
}

run_hook() {
  updates=$1
  : > "$CALL_LOG"
  : > "$OUTPUT"
  set +e
  printf '%s\n' "$updates" |
    PATH="$BIN_DIR:$PATH" sh "$HOOK" origin test > "$OUTPUT" 2>&1
  status=$?
  set -e
  return "$status"
}

MATCHING_UPDATE="refs/heads/wrsp-prepush-refs $HEAD_SHA refs/heads/wrsp-prepush-refs $REMOTE_SHA"
if ! run_hook "$MATCHING_UPDATE"; then
  fail "single update equal to HEAD should pass"
fi
assert_contains "$CALL_LOG" "review-input $MATCHING_UPDATE"
assert_call_count "evidence $HEAD_SHA" 1
FIRST_CALL=$(sed -n '1p' "$CALL_LOG")
THIRD_CALL=$(sed -n '3p' "$CALL_LOG")
[ "$FIRST_CALL" = "npm run review:push -- origin test" ] ||
  fail "review:push must remain the first publication command"
[ "$THIRD_CALL" = "npm run check:artifact-oracle" ] ||
  fail "artifact oracle must remain ahead of runner evidence"

MISMATCHING_UPDATE="refs/heads/topic $OTHER_SHA refs/heads/topic $REMOTE_SHA"
if run_hook "$MISMATCHING_UPDATE"; then
  fail "update not equal to HEAD should refuse"
fi
assert_contains "$OUTPUT" "refs/heads/topic"
assert_contains "$OUTPUT" "$OTHER_SHA"
assert_contains "$OUTPUT" "check out refs/heads/topic and push from it, or run npx wrsp-runner test $OTHER_SHA there"
assert_call_count "evidence " 0

DELETION_UPDATE="(delete) $ZERO_SHA refs/heads/obsolete $REMOTE_SHA"
if ! run_hook "$DELETION_UPDATE"; then
  fail "deletion should be skipped"
fi
assert_contains "$CALL_LOG" "review-input $DELETION_UPDATE"
assert_call_count "evidence " 0

NOTES_ONLY_UPDATE="refs/heads/notes-source $OTHER_SHA refs/notes/wrsp-usage $REMOTE_SHA"
if ! run_hook "$NOTES_ONLY_UPDATE"; then
  fail "notes-only update should be skipped"
fi
assert_contains "$CALL_LOG" "review-input $NOTES_ONLY_UPDATE"
assert_call_count "evidence " 0

NOTES_WITH_BRANCH_UPDATE="refs/notes/wrsp-usage $OTHER_SHA refs/heads/notes-mirror $REMOTE_SHA
$MATCHING_UPDATE"
if ! run_hook "$NOTES_WITH_BRANCH_UPDATE"; then
  fail "notes update alongside branch tip equal to HEAD should pass"
fi
assert_contains "$CALL_LOG" "review-input refs/notes/wrsp-usage $OTHER_SHA refs/heads/notes-mirror $REMOTE_SHA"
assert_contains "$CALL_LOG" "review-input $MATCHING_UPDATE"
assert_call_count "evidence $HEAD_SHA" 1

TWO_UPDATES="$MATCHING_UPDATE
$MISMATCHING_UPDATE"
if run_hook "$TWO_UPDATES"; then
  fail "two updates with one mismatch should refuse"
fi
assert_contains "$OUTPUT" "refs/heads/topic"
assert_contains "$OUTPUT" "$OTHER_SHA"
assert_call_count "evidence " 0

printf 'PASS: pre-push runner evidence binds to outgoing refs\n'
