#!/bin/zsh

# Launch one ephemeral Codex tester for a prepared manual-campaign batch.
# Usage: CAMPAIGN_ROOT=/private/tmp/campaign ./run-tester.sh <batch-id>

set -euo pipefail

if (( $# != 1 )); then
  print -u2 'Usage: run-tester.sh <batch-id>'
  exit 2
fi

campaign_root="${CAMPAIGN_ROOT:-$PWD}"
batch="$1"
batch_directory="$campaign_root/testers/$batch"

for required in assignment.md tester-protocol.md user-guide.md verdict-schema.json; do
  if [[ ! -f "$batch_directory/$required" ]]; then
    print -u2 "Missing $batch_directory/$required"
    exit 2
  fi
done

command codex exec \
  --skip-git-repo-check \
  -C "$batch_directory" \
  -s workspace-write \
  -c sandbox_workspace_write.network_access=true \
  -c "model_reasoning_effort=${CODEX_REASONING_EFFORT:-high}" \
  --ephemeral \
  --output-schema "$batch_directory/verdict-schema.json" \
  -o "$batch_directory/verdict.json" \
  "You are a manual tester. Read assignment.md, tester-protocol.md, and user-guide.md in your working directory. Execute the assigned goals in order through the running browser driver, gather the required evidence, and end with only the JSON verdict document." \
  < /dev/null
