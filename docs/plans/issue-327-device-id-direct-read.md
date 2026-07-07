# Issue 327 device-id direct-read spike

Date: 2026-07-07

Controller tested: Pixelblaze `pixelblaze_pb32_3cd4ee549434`, firmware 3.67,
board type `pb32`, at `192.168.8.224`.

Harness: `test/hardware-control-spike/deviceIdProbe.ts`. It opens one short
WebSocket, dumps complete JSON frames around `{ getConfig: true }`, closes the
socket, then probes local HTTP endpoints and cloud discovery.

## Finding

The cloud-discovery id is reconstructable from direct local reads.

- WebSocket `{ getConfig: true }` settings packet includes `boardType: "pb32"`
  and `chipId: 3986670` (`0x3cd4ee`). It does not include the exact cloud id
  string.
- Local HTTP `GET /wifistatus` returns the Wi-Fi MAC address:
  `34:94:54:EE:D4:3C`.
- Reversing the MAC bytes and lowercasing yields `3cd4ee549434`.
- Combining the WebSocket board type with the reversed MAC suffix yields the
  exact cloud-discovery id:
  `pixelblaze_${boardType}_${reverseMacBytes(mac)}` →
  `pixelblaze_pb32_3cd4ee549434`.
- Cloud discovery cross-check for `192.168.8.224` returned the same id.

Other local HTTP endpoints checked:

- `/config.json` returned normal device settings, including name and pixel
  count, but no id/MAC/board type.
- `/`, `/index.html`, and `/index.html.gz` served the native UI. Static endpoint
  hints in the UI included `/config.json`, `/wifistatus`, and `/pixelmap.txt`.
- `/config`, `/discover`, `/discovery`, `/settings`, `/settings.json`,
  `/status`, `/status.json`, `/info`, `/info.json`, `/version`,
  `/version.json`, `/api/config`, `/api/discover`, and `/api/status` returned
  404 on this firmware.

## Recommendation

Use direct read as the primary identity recovery path for typed-IP connections:

1. Open the normal WebSocket and read the settings packet via `{ getConfig: true
   }` to get `boardType`.
2. Fetch `http://<ip>/wifistatus` to get the MAC address.
3. Construct `deviceId = pixelblaze_${boardType}_${reverseMacBytes(mac)}`.
4. Use cloud discovery as a fallback and optional cross-check by matching
   `localIp`.

The unclaimed state remains useful when both direct local reads and cloud
discovery fail, but on the tested V3 firmware, discovery is not required for
identity.
