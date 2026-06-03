# H8 spike report (#200)

> Filled in after running against a real device. This file is the deliverable.

## Verdict

- **Go / No-go:** **GO** — the extension compiled the rainbow pattern via the device's
  own compiler running **inside the sandboxed iframe**, pushed the bytecode over
  `ws://<ip>:81`, and the Controller **rendered the moving rainbow live**. The full
  fetch -> extract -> sandbox-eval -> bytecode -> push -> execute chain works end-to-end
  from a Chrome extension, no Node bridge. The MV3-host question (the one open unknown)
  is settled.
- **Date run:** 2026-06-03
- **Tester:** Jon Chester

## Environment

- **Chrome version:** (not recorded; same profile as the H1 run, Chrome 148.x)
- **OS:** macOS (Darwin 25.5.0)
- **Controller model / firmware:** Pixelblaze, fw 3.67 (same device as the #112 PoC)
- **Controller IP used:** 192.168.8.224
- **Adapter:** v3AdapterV3 (fw > 3.4) — matched out of the box, no new adapter needed.

## Result

- Did the compiler `eval` succeed **inside the sandboxed iframe**? **Yes** — implied
  decisively by the push succeeding: a NO-GO would have thrown `compile FAILED in
  sandbox` and produced no bytecode to push.
- Did the device accept the bytecode and **render the rainbow live**? **Yes — confirmed
  visually on the strip** (the spike's acceptance bar, same as H1's visual confirmation).
- **Bytecode length / head hex:** **83 bytes, head `400000000b000000…`** — an exact match
  to the #112 PoC for the identical pattern + firmware (same compiler, now run in the MV3
  sandboxed iframe instead of MiniRacer).
- Header reconciled (`8 + opcodeBytes + exportBytes == len`)? **Yes** — log:
  `header: opcodeBytes=64 exportBytes=11 matchesLen=true` (`8 + 64 + 11 = 83`).
- Verbatim `[H8]` service-worker console transcript:
  ```
  [H8] starting. device = 192.168.8.224
  [H8] fetched index.html.gz, decoded chars = 1205502
  [H8] extracted hardwareVariant: 28 chars
  [H8] extracted extendedOperators: 1479 chars
  [H8] extracted constants: 610 chars
  [H8] extracted compiler: 171791 chars
  [H8] assembled compiler env = 174543 chars
  [H8] offscreen document created
  [H8] compiled in sandboxed iframe. bytecode len = 83 head = 400000000b000000...
  [H8] header: opcodeBytes=64 exportBytes=11 matchesLen=true
  [H8] ws open
  [H8] ws <- {"ack":1}
  [H8] ws <- {"activeProgram":{"name":"","activeProgramId":"...","controls":{}},"sequencerMode":0,"runSequencer":false}
  [H8] save sequence sent
  [H8] OK -- pushed via putByteCode. WATCH THE STRIP: a moving rainbow == GO.
  ```
  (followed by streaming `{"fps":124.x,...}` preview-stat frames — the device running.)

## MV3 / CSP findings

- Was eval in the **sandboxed iframe** allowed with the manifest's
  `content_security_policy.sandbox`? **Yes** — no CSP violation blocked the run; the
  compiler ran and produced runnable bytecode. The `sandbox allow-scripts; script-src
  'self' 'unsafe-inline' 'unsafe-eval'` policy is sufficient.
- **Console note (resolved, user error):** the `[H8]` logs initially looked absent — a
  stale text filter was set on the SW console. Clearing it showed the full transcript
  (above). No real lifecycle gotcha; logs land in the SW console as expected.
- Negative control (moving `eval` into the SW to confirm MV3 blocks it): not run.
- `chrome.offscreen.createDocument` + `getContexts`: no friction observed; the offscreen
  document + sandboxed iframe were created and round-tripped the compile without error.

## Extraction findings (for #202)

- Did v3AdapterV3 extract all four pieces cleanly (`hardwareVariant`, `extendedOperators`,
  `constants`, `compiler`)? **Yes** — any miss throws `extraction MISS` before compiling;
  the run reached push, so all four extracted.
- Sizes logged for each piece: hardwareVariant 28, extendedOperators 1479, constants 610,
  compiler 171791 chars; assembled env 174543 chars.
- Did dropping the Python `window = {}` line cause any issue? **No** — the compiler
  attached to the real browser `window` and ran correctly, as expected.

## Surprises / gotchas

- Worked first try on the same device/profile as H1 + the #112 PoC. The only confusion
  was a stale SW-console filter hiding the logs (user error, above) — not a spike finding.
- Bytecode is byte-identical to the #112 MiniRacer PoC (83 bytes, same head) — strong
  evidence the sandboxed-iframe host is faithful to the headless V8 host.

## Implication for the arc

- **GO confirmed.** #202 (H10 push pipeline) proceeds in the extension as written —
  compile in a sandboxed iframe (offscreen-hosted), frame + push over the relay. **No
  Node bridge needed for push.** The #208 containment note "if H8 fails, push needs the
  Node bridge" is now moot — H8 passed.
- Carry forward into #202: (1) firmware-adapter maintenance line item (v3AdapterV3 covers
  fw > 3.4; older firmware needs other adapters); (2) licensing heads-up to Ben Hencke
  before shipping (we execute his compiler) — tracked by #207 (ADR-0004); (3) port the
  extraction + bytecode framing + save sequence from this spike into the productionized
  ExtensionControllerProvider; (4) add log capture / a status surface so the production
  path isn't reliant on the SW console.
