#!/bin/zsh

# Run one manual-campaign wave: one driver and one Codex tester per batch.
# Usage: BASE_URL=http://localhost:5175 ./run-wave.sh t1:9321 t2:9322 signedout:9323:nosession

set -euo pipefail

if (( $# == 0 )); then
  print -u2 'Usage: run-wave.sh <batch:port[:auth|nosession]> [...]'
  exit 2
fi

script_directory="${0:A:h}"
campaign_root="${CAMPAIGN_ROOT:-$PWD}"
repo_root="${PXLBLZ_REPO_ROOT:-$(git -C "$script_directory" rev-parse --show-toplevel)}"
base_url="${BASE_URL:-}"
session_file="${SESSION_FILE:-$campaign_root/session.json}"

if [[ -z "$base_url" ]]; then
  print -u2 'Set BASE_URL to the managed issue runtime URL.'
  exit 2
fi

typeset -a driver_pids tester_pids batches ports

cleanup() {
  local pid
  for pid in "${driver_pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

for specification in "$@"; do
  parts=(${(s.:.)specification})
  batch="${parts[1]:-}"
  port="${parts[2]:-}"
  mode="${parts[3]:-auth}"

  if [[ ! "$batch" =~ '^[A-Za-z0-9][A-Za-z0-9_-]*$' \
    || ! "$port" =~ '^[0-9]+$' \
    || ( "$mode" != auth && "$mode" != nosession ) ]]; then
    print -u2 "Invalid batch specification: $specification"
    exit 2
  fi
  if (( ${batches[(Ie)$batch]} )); then
    print -u2 "Batch $batch is assigned more than once."
    exit 2
  fi
  if (( ${ports[(Ie)$port]} )); then
    print -u2 "Driver port $port is assigned more than once."
    exit 2
  fi
  if [[ ! -d "$campaign_root/testers/$batch" ]]; then
    print -u2 "Missing batch directory: $campaign_root/testers/$batch"
    exit 2
  fi
  if [[ "$mode" == auth && ! -f "$session_file" ]]; then
    print -u2 "Missing session file for authenticated batch $batch: $session_file"
    exit 2
  fi

  mkdir -p "$campaign_root/evidence/$batch"
  typeset -a session_arguments
  session_arguments=()
  if [[ "$mode" == auth ]]; then
    session_arguments=(--session "$session_file")
  fi

  node "$script_directory/driver.mjs" \
    --port "$port" \
    --evidence-dir "$campaign_root/evidence/$batch" \
    --repo-root "$repo_root" \
    --base "$base_url" \
    "${session_arguments[@]}" \
    > "$campaign_root/driver-$batch.log" 2>&1 &
  driver_pids+=($!)
  batches+=("$batch")
  ports+=("$port")
done

for index in {1..${#batches}}; do
  batch="${batches[$index]}"
  pid="${driver_pids[$index]}"
  log="$campaign_root/driver-$batch.log"
  ready=false
  for attempt in {1..100}; do
    if grep -q '"ready":true' "$log" 2>/dev/null; then
      ready=true
      break
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      print -u2 "Driver $batch exited before becoming ready. See $log"
      exit 1
    fi
    sleep 0.1
  done
  if [[ "$ready" != true ]]; then
    print -u2 "Driver $batch did not become ready. See $log"
    exit 1
  fi
done

for batch in "${batches[@]}"; do
  CAMPAIGN_ROOT="$campaign_root" \
  PXLBLZ_REPO_ROOT="$repo_root" \
    "$script_directory/run-tester.sh" "$batch" \
    > "$campaign_root/codex-$batch.log" 2>&1 &
  tester_pids+=($!)
done

result=0
for pid in "${tester_pids[@]}"; do
  wait "$pid" || result=$?
done

exit "$result"
