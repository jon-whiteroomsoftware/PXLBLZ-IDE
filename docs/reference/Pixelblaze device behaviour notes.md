# Pixelblaze device behaviour notes

Firmware behaviours proven on hardware that shape how PXLBLZ talks to a
Controller. Each is here because it produced a long debugging detour at least
once: the failure modes are silent, so the device looks healthy while the feature
looks broken.

## Device-name writes need read-back confirmation

The configured Controller name is written over the WebSocket as
`{"name":"Road case"}`. Firmware sends no acknowledgement for the write. A
subsequent `getConfig` settings packet reports the applied top-level `name`, and
the setting survives a controller reboot.

PXLBLZ therefore treats send completion as insufficient. It reads config back
on the same live connection and updates the Controller profile only after the
exact requested name is reported. An offline profile cannot be renamed, and a
failed or unconfirmed write leaves the last device-authoritative name intact.

## A pushed map must match pixelCount exactly

A pushed pixel map must contain exactly `pixelCount` coordinates. The firmware
silently accepts a mismatched map — `putPixelMap` and `savePixelMap` both report
success — and then drops it. Pixels never rearrange and no error is raised. The
reference client confirms the rule from the other direction by hard-erroring on
read-back: "Map does not match pixelCount; re-save map and try again."

Two consequences for this IDE:

- Baked map points are sized to the **preview** count (`activePixelCount`), which
  has no relationship to the device's wired count, so a naive push usually
  no-ops. `resolveMapPushPoints` in `src/engine/mapPush.ts` re-bakes the map
  source at the device count first, mirroring the reference client calling the
  map function with `getPixelCount()`.
- A map function that hard-codes its point count — ignoring its `pixelCount`
  argument and always returning, say, 16 positions — cannot conform. That needs
  the coupled `setPixelCount` remedy, which is not built.

`setPixelCount` does exist on the wire as `{"pixelCount": N, "save": true}`.

Map **read-back** is a plain HTTP `GET` of `/pixelmap.dat`, not a WebSocket
message; there is no WS "get map" and the `getConfig` packet carries no map
information. The blob header is three little-endian `uint32`s —
`[formatVersion, numDimensions, bodyBytes]` — and
`numPixels = bodyBytes / numDimensions / formatVersion`.

## Reducing pixel count leaves the tail lit

Reducing the Controller's pixel count leaves every LED beyond the new count
frozen at its last colour. WS2812s hold their last value until re-clocked, and
the device only clocks `pixelCount` LEDs.

Proven on hardware by hooking `WebSocket.prototype.send` on the device's own web
UI:

- The canonical Pixelblaze UI does **not** clear the tail on a count reduction.
- Pushing a smaller map does **not** clear it either.
- The device UI sends `pixelCount` and map writes over **HTTP**, not WebSocket;
  only `ping` and `sendUpdates` cross the WS. The firmware accepts a single WS
  client, so a second `new WebSocket` is refused.
- There is no per-pixel wire command.

The only approach that works is blackout-then-shrink, implemented in
`src/engine/applyControllerPixelCount.ts`: set brightness to 0, wait roughly
400 ms so one full-length black frame is clocked out, write the new count, then
restore brightness. Brightness comes from `getConfig()`; if it cannot be read,
skip the blackout and just write the count rather than stranding the strip dark.
Only do this on a genuine reduction.

## Live control values are drifted variables, not positions

The firmware's live `activeProgram.controls` (from `getConfig`) reports each
control's bound **variable** value, not its 0..1 UI position. A Pattern that
binds a slider to an exported variable the render loop also mutates — an
accumulator, for instance — reports wildly out-of-range values. Measured on
hardware: `sliderOctaves` at 2.37e+21, `sliderGlow` at -1.55e-15, colour-picker
triplets all above 1.

The stored fallback does not rescue it either: `getControls(activeProgramId)`
returns an empty object for a **run-only** program, one pushed to run rather than
saved to flash. So for a run-only Pattern there is no clean source for real
slider positions — neither live nor stored.

A **saved** Pattern whose controls were never adjusted behaves the same way
(measured on the bench pb32, firmware 3.67, 2026-08-17, #873): its stored
`getControls` is `{}`, and right after activation — and on every later read —
the live map reports uninitialized values for every control (`sliderSpeed:
-1.694739e+38`, `sliderThickness: -2.13e-14`, `sliderBrightness: -1.51e+26`)
while the exported variables hold the Pattern's own defaults (`speed 0.20`,
`zoom 0.33`, `thickness 0.44`, `brightness 0.65`). The slider handlers were
never invoked, so nothing links the two. A live `setControls` write reads back
exactly (`sliderSpeed: 0.77`) and the bound variable follows it. The panel
therefore shows such controls as unset until the user moves them; the exported
variables in the watched list are the only truthful numbers, and they are not
slider positions.

The IDE treats any slider value outside a finite 0..1 as *unset* rather than
trying to repair it, because the true value is genuinely unknowable until the
user sets one. That surfaces through `DeckSlider`, which accepts
`value: number | null`; `null` renders an indeterminate state — a hollow accent
ring on an empty track with a dash readout whose hover text explains the state,
and an `aria-valuetext` of "not set" so assistive tech does not announce the
range input's midpoint as a value (#873) — and stays **draggable**, since
dragging is how the control gets its first real value. The custom thumb styling
lives in `.deck-slider-unset`. An earlier attempt that dimmed and disabled the
control was rejected: the unset state has to look interactive.

## Saved Pattern selection, deletion, and sequencer fields

The saved-Pattern protocol uses two fire-and-forget JSON commands:

- `{"activeProgramId": id, "save": bool}` selects an existing saved Pattern.
  `save: true` persists that selection as the Pattern used after reboot; it does
  not save Pattern bytes, which already exist on the Controller.
- `{"deleteProgram": id}` removes one saved Pattern. The command has no
  acknowledgement, so PXLBLZ re-lists the complete inventory before treating a
  deletion as confirmed.

The sequencer packet that carries `activeProgram` can also carry top-level
`sequencerMode` (`0` off, `1` shuffle, `2` playlist) and `runSequencer`. These
fields are passive device state; a packet that omits them does not prove the
sequencer changed mode.

Firmware 3.67's behavior when the deleted Pattern is active remains unobserved.
PXLBLZ does not depend on that undefined behavior: every user-facing delete
action is disabled for the running row. On firmware 3.67, the namespaced
hardware probe confirmed run-only activation, restoration of the prior running
Pattern, inactive deletion, and exact preservation of every unrelated saved
Pattern. Delete-active and post-reboot observation remain deliberately deferred
to a controlled bench session; the automated probe never changes boot selection.

## The saved-pattern preview JPEG is a 1D waterfall

The PBP preview JPEG is a fixed **100×150** image, not a snapshot of the 2D grid
render. Verified by pulling every preview off the bench device: all exactly
100×150, between roughly 3.5 and 9 KB.

- **Width is 100 columns** — a fixed 100-pixel 1D *strip*, one column per LED
  index. It is not the device pixel count; a 16×16 = 256 matrix still previews
  100 wide.
- **Height is 150 rows** — 150 successive frame iterations, time flowing top to
  bottom.
- **Higher-dimension Patterns** are fed strip coordinates, with X varying across
  the 100 pixels and the missing axes supplied as a constant.

Our implementation lives in `src/engine/previewThumbnail.ts`, which builds a
synthetic 100-pixel 1D strip and then applies the **same firmware-compatible
renderer policy as the live preview**: `selectRenderCompatibility` picks the
compatible exported render function, and missing Y/Z are **centred at 0.5**, not
pinned to 0. Do not reach for `render3D` directly on the assumption that a
fallback chain will cascade — `loadPattern` leaves absent render slots as no-ops,
so dispatching to a function the Pattern does not export renders black.

Over the wire, `{"getPreviewImg": id}` returns binary packets of type `04`, framed
as `[type, flags, ...payload]` with bit 1 marking first and bit 4 marking last.
The reassembled payload is a 17-character id followed by raw JPEG bytes.
`listPrograms` returns binary type `07` whose payload is `id\tname\n` lines.

## Cloud discovery endpoint

`GET https://discover.electromage.com/discover` takes no parameters and matches
devices by the caller's public IP server-side. It returns a JSON array of
controller objects:

```json
[{
  "arch": "esp32", "boardType": "pb32", "version": "3.67",
  "id": "pixelblaze_pb32_3cd4ee549434",
  "ip": "73.83.29.50",
  "localIp": "192.168.8.224",
  "name": "Burner bag",
  "createdAt": "2026-06-05T02:25:54.201Z",
  "timeZone": "America/Los_Angeles"
}]
```

Use `localIp` to connect, `name` as the candidate label, and `id` as a stable
de-duplication and binding key. Note that `ip` is the public WAN address the
server matched on, not something to connect to.

**This is the only discovery path available to the extension.** The LAN UDP
beacon on port 1889 used by both reference clients cannot be reached from MV3:
`chrome.sockets.udp` is a deprecated Chrome Apps API and MV3 has no raw UDP or
TCP at all, only fetch, WebSocket, and WebRTC. The cloud endpoint sends no CORS
header so the page itself cannot read it, but the extension service worker with
host permissions bypasses CORS — the same mechanism used for `/pixelmap.dat`
read-back.

Manual IP entry remains the universal fallback. Discovery needs network discovery
enabled on the device, requires the device and browser host to share a public IP,
and fails in AP mode, on isolated VLANs, or when the service is down.
