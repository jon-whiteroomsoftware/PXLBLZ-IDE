#!/usr/bin/env bash
set -euo pipefail

# Classifier launch (#940): every delegated CLI launch names an approved model
# and effort explicitly. This hook is ordinary automation, so it uses the
# standing Codex worker pair; it never inherits a session's interactive model.
CLASSIFIER_MODEL="gpt-5.6-sol"
CLASSIFIER_EFFORT="high"

COMMIT_MSG=$(git log -1 --pretty=%B)
COMMIT_SHA=$(git log -1 --pretty=%H | cut -c1-8)
COMMIT_DIFF=$(git show HEAD --stat | tail -n +2 | head -30)
CURRENT_BRANCH=$(git branch --show-current)

# Extract unique issue numbers from the commit message
ISSUE_NUMS=$(echo "$COMMIT_MSG" | grep -oE '#[0-9]+' | tr -d '#' | sort -un || true)

if [ -z "$ISSUE_NUMS" ]; then
  exit 0
fi

# The structured final output: Codex is asked for exactly this shape, and the
# decision is written to a file rather than parsed from the transcript.
CLASSIFIER_DIR=$(mktemp -d "${TMPDIR:-/tmp}/pxlblz-issue-classifier.XXXXXX")
trap 'rm -rf "$CLASSIFIER_DIR"' EXIT
CLASSIFIER_SCHEMA="$CLASSIFIER_DIR/schema.json"
cat > "$CLASSIFIER_SCHEMA" <<'EOF'
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "action": { "type": "string", "enum": ["close", "comment", "nothing"] },
    "message": { "type": "string" }
  },
  "required": ["action", "message"]
}
EOF

for ISSUE_NUM in $ISSUE_NUMS; do
  echo "🔍 Checking issue #$ISSUE_NUM..."

  ISSUE_JSON=$(gh issue view "$ISSUE_NUM" --json title,body,state 2>/dev/null || true)
  if [ -z "$ISSUE_JSON" ]; then
    echo "   ⚠️  Could not fetch issue #$ISSUE_NUM — skipping"
    continue
  fi

  ISSUE_STATE=$(echo "$ISSUE_JSON" | jq -r '.state')
  if [ "$ISSUE_STATE" = "CLOSED" ]; then
    echo "   Already closed — skipping"
    continue
  fi

  ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
  ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body // ""' | head -30)

  PROMPT="You manage GitHub issues for a software project. Decide what action to take on an issue given the commit below. Decide from this text alone; do not run commands or read files.

COMMIT MESSAGE:
$COMMIT_MSG

FILES CHANGED:
$COMMIT_DIFF

ISSUE #$ISSUE_NUM: $ISSUE_TITLE
$ISSUE_BODY

Respond with JSON only (no markdown fences):
- {\"action\":\"close\",\"message\":\"<closing comment>\"} if the commit fully resolves this issue
- {\"action\":\"comment\",\"message\":\"<progress comment>\"} if the commit partially addresses it
- {\"action\":\"nothing\",\"message\":\"\"} if the commit only references the issue for context or is unrelated"

  if ! command -v codex >/dev/null 2>&1; then
    echo "   ⚠️  Classifier unavailable (codex not on PATH) — skipping issue #$ISSUE_NUM"
    continue
  fi

  # The prompt travels over stdin (never argv) and the transcript is discarded,
  # so neither the issue excerpt nor the reply reaches stdout or the process
  # list. The exit status decides first: a classifier that exits nonzero is a
  # failed call even when it already wrote a valid-looking decision file, and
  # the hook skips the issue without touching it and without failing the
  # commit. A successful call that leaves no decision is skipped the same way.
  DECISION="$CLASSIFIER_DIR/decision-$ISSUE_NUM.json"
  rm -f "$DECISION"
  if ! printf '%s' "$PROMPT" | codex exec \
    --model "$CLASSIFIER_MODEL" \
    --config "model_reasoning_effort=\"$CLASSIFIER_EFFORT\"" \
    --sandbox read-only \
    --ephemeral \
    --color never \
    --output-schema "$CLASSIFIER_SCHEMA" \
    --output-last-message "$DECISION" \
    - >/dev/null 2>&1; then
    echo "   ⚠️  Classifier call failed — skipping issue #$ISSUE_NUM"
    continue
  fi

  if [ ! -s "$DECISION" ]; then
    echo "   ⚠️  Classifier returned no decision — skipping issue #$ISSUE_NUM"
    continue
  fi
  TEXT=$(cat "$DECISION")

  # Strip any markdown fences and trim surrounding whitespace. Avoid `xargs`:
  # it parses shell-style quoting and chokes ("unterminated quote") on any
  # apostrophe in the model's text (e.g. "Pixelblaze's"). jq tolerates leftover
  # whitespace, so a plain sed trim is enough.
  TEXT=$(printf '%s' "$TEXT" \
    | sed -e 's/^```json//' -e 's/^```//' -e 's/```$//' \
          -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

  # Slurp the stream and take only the first JSON value (-s '.[0]'). The model
  # sometimes emits more than one object (e.g. an example alongside its answer);
  # a bare `jq -r '.action'` would then print one line per object and ACTION
  # would become e.g. "nothing\nnothing", falling through to the error branch.
  ACTION=$(echo "$TEXT" | jq -rs '(.[0].action) // "nothing"' 2>/dev/null || echo "nothing")
  MESSAGE=$(echo "$TEXT" | jq -rs '(.[0].message) // ""' 2>/dev/null || echo "")

  case "$ACTION" in
    close)
      # Comment-only (#940): one commit cannot infer completion of a whole
      # issue, so the hook never applies the 📦 implemented label and never
      # closes. The coordinator applies the label after inspecting the
      # commits the issue body names as its full implementation scope.
      echo "   💬 Commit recorded; issue #$ISSUE_NUM stays open — it claims implementation scope, not review, landing, or release"
      gh issue comment "$ISSUE_NUM" --body \
        "Commit $COMMIT_SHA on \`$CURRENT_BRANCH\` claims implementation of this issue's scope. The coordinator applies \`📦 implemented\` after inspecting the identified full-scope commits; this comment is not closure, review, landing, or release."
      ;;
    comment)
      echo "   💬 Adding comment to issue #$ISSUE_NUM"
      gh issue comment "$ISSUE_NUM" --body "${MESSAGE:-Addressed in commit $COMMIT_SHA}"
      ;;
    nothing)
      echo "   — No action needed for issue #$ISSUE_NUM"
      ;;
    *)
      echo "   ⚠️  Unexpected action '$ACTION' — skipping"
      ;;
  esac
done
