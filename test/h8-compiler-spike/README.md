# H8 spike: can the device compiler run inside the MV3 extension? (#200)

The **last open unknown** in the Send-to-Controller arc. Everything else is already
proven:

- **#193 (H1)** — a Chrome extension can relay `ws://LAN` to the https page. ✅
- **#112 capability spike** — ElectroMage's compiler, pulled off the device and run
  *headless* (MiniRacer/V8), emits bytecode the device accepts and renders. A full
  compile -> frame -> push -> execute pipeline rendered a live rainbow on
  `192.168.8.224` (fw 3.67). ✅ See `../capability-spike/`.

What #112 did **not** prove is the execution *host*. It ran the compiler in MiniRacer
and recommended a Node bridge (`node:vm`). The project then pivoted to the **Chrome
extension** transport. So this spike asks the one remaining question:

> Can the device's compiler run inside an **MV3-legal host** — a **sandboxed iframe**
> (relaxed CSP) hosted by an **offscreen document** — and emit accepted bytecode,
> **without** remote eval in the service worker (forbidden by MV3 CSP)?

If yes: push lives entirely in the extension; #202 (H10) proceeds as written. If no:
push falls back to the ADR-0004 Node bridge — contained to push only; the H5-H7
monitoring already shipped is unaffected.

## Why a sandboxed iframe (the crux)

The compiler is **remote code** (downloaded from the device per firmware). MV3's
extension CSP forbids `eval` / `new Function` / remote `<script>` in the service worker
*and* in normal extension pages (including offscreen documents). The single documented
escape hatch is a page listed under manifest `sandbox.pages`: sandboxed pages run under
a **relaxed CSP** that permits `'unsafe-eval'`. The service worker has no DOM and cannot
host an iframe, so an **offscreen document** hosts the sandboxed iframe. That three-hop
arrangement (SW -> offscreen -> sandboxed iframe) is exactly what this spike exercises.

## What's here

| path | role |
|---|---|
| `extension/manifest.json` | MV3 manifest: `offscreen` permission, `sandbox.pages`, relaxed sandbox CSP, http+ws host perms. |
| `extension/background.js` | Service worker / orchestrator. Fetches+gunzips `index.html.gz`, extracts the compiler (v3AdapterV3), drives the compile, frames + pushes the bytecode over `ws://<ip>:81`. Holds `DEVICE_IP` + the test pattern. |
| `extension/offscreen.html` / `offscreen.js` | Offscreen document. Strict CSP; pure message relay between the SW and the sandboxed iframe. |
| `extension/sandbox.html` / `sandbox.js` | The sandboxed iframe. Relaxed CSP; `eval`s the device compiler, runs `compilePattern`, builds the bytecode blob. **This is the context under test.** |
| `report.md` | Fill in after running. The actual deliverable. |

The extraction + bytecode framing are ported from `pixelblaze-client`'s
`compilePattern` / `sendPatternToRenderer` (the same code the #112 PoC used). One
deliberate change from the Python: we do **not** prepend `window = {}` — in a browser
host `window` is read-only and already present, and the compiler attaches to it.

## Setup (1 edit)

In **`extension/background.js`** set `DEVICE_IP` to your Controller's LAN IP.
(`host_permissions` use `http://*/*` + `ws://*/*` wildcards, so no manifest edit is
needed. The pattern is the same rainbow the #112 PoC used.)

## Run

1. `chrome://extensions` -> **Developer mode** -> **Load unpacked** -> select the
   `extension/` folder.
2. Open the service-worker console: on the extension card, click the **service worker**
   link (this is where `[H8]` logs land).
3. Click the extension's **toolbar icon** to run the spike. (There's no UI; the icon
   click is the trigger.)
4. **Watch the strip.** Expected final log line:
   `[H8] OK -- pushed via putByteCode. WATCH THE STRIP: a moving rainbow == GO.`
   and the LEDs render a moving rainbow. No flash write (live push only).

### What each outcome means

- **Rainbow renders** -> **GO**. The compiler runs in the sandboxed iframe; push can
  ship in the extension. Record the bytecode length/head (should match #112's 83-byte
  `400000000b000000…` for the identical pattern + firmware).
- **`[H8] compile FAILED in sandbox: …`** with an eval/CSP error -> the MV3 host is the
  blocker. **NO-GO on the extension host**; push falls back to the Node bridge. Capture
  the exact error.
- **`extraction MISS: …`** -> the firmware's bundle shape changed and v3AdapterV3 no
  longer matches; a new adapter is needed (orthogonal to the eval question).

## Acceptance

The device's compiler, eval'd **inside the sandboxed iframe** (never the service
worker), produces bytecode that the Controller accepts and **renders live** — driven
end-to-end from the extension. ✅ / ❌ -> record in `report.md`, report on #200.

## Notes / caveats to watch

- **Service-worker eval is expected to fail** — that's the premise. If you're curious,
  the negative control is to move the `eval` into `background.js`; MV3 should block it.
  The spike does not do this automatically.
- **`getContexts` / `chrome.offscreen`** require a recent Chrome (109+ for offscreen,
  116+ for `getContexts`). The H1 run was on Chrome 148, so this is fine on the same
  setup.
- **Firmware coupling**: v3AdapterV3 handles fw > 3.4 (incl. 3.67). Older firmware needs
  a different adapter — see `pixelblaze-client` `compilePattern`.
- Throwaway spike code; excluded from the commit gate like the rest of `test/`.
