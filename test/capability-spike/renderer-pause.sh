#!/usr/bin/env bash

# Human-in-the-loop probe for Pixelblaze's undocumented renderer pause command.
# This sends no save flag and therefore performs no flash write.
#
#   bash test/capability-spike/renderer-pause.sh pause [controller-ip]
#   bash test/capability-spike/renderer-pause.sh resume [controller-ip]

set -euo pipefail

action="${1:-pause}"
controller_ip="${2:-${PIXELBLAZE_IP:-192.168.8.224}}"

case "$action" in
  pause)
    pause_value=true
    ;;
  resume)
    pause_value=false
    ;;
  *)
    echo "Usage: $0 <pause|resume> [controller-ip]" >&2
    exit 2
    ;;
esac

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"

cd "$repo_root"

PXLBLZ_PAUSE_ACTION="$action" \
PXLBLZ_PAUSE_IP="$controller_ip" \
PXLBLZ_PAUSE_VALUE="$pause_value" \
node --input-type=module <<'NODE'
import WebSocket from 'ws'

const action = process.env.PXLBLZ_PAUSE_ACTION
const ip = process.env.PXLBLZ_PAUSE_IP
const pause = process.env.PXLBLZ_PAUSE_VALUE === 'true'
const url = `ws://${ip}:81`
const socket = new WebSocket(url)
let acknowledged = false

const timeout = setTimeout(() => {
  console.error(`Timed out waiting for Pixelblaze acknowledgement from ${url}.`)
  socket.terminate()
}, 5_000)

socket.on('open', () => {
  const frame = { pause }
  socket.send(JSON.stringify(frame))
  console.log(`Sent ${JSON.stringify(frame)} to ${url}.`)
})

socket.on('message', (data, isBinary) => {
  if (isBinary) return

  let message
  try {
    message = JSON.parse(data.toString())
  } catch {
    return
  }

  if (!Object.hasOwn(message, 'ack')) return
  acknowledged = true
  clearTimeout(timeout)
  console.log(`Pixelblaze acknowledged ${action}: ${JSON.stringify(message)}.`)
  socket.close()
})

socket.on('error', (error) => {
  clearTimeout(timeout)
  console.error(`WebSocket error: ${error.message}`)
})

socket.on('close', () => {
  if (!acknowledged) process.exitCode = 1
})
NODE

if [[ "$action" == "pause" ]]; then
  echo "Renderer pause requested. Inspect the LEDs now."
  echo "Resume with: bash test/capability-spike/renderer-pause.sh resume $controller_ip"
else
  echo "Renderer resume requested."
fi
