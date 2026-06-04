# Live Controller connectivity goes through a Chrome-extension relay behind a provider seam

**Status:** accepted — the live-Controller arc (epic #208). Builds on the isomorphic `PixelblazeConnection` shipped earlier for the divergence harness and capability spike (`docs/PXLBLZ Technical Reference.md` §13). It **replaces an earlier-anticipated "Node local bridge" mechanism** (see Considered options); this ADR is the as-built record of the decision.

## Context

The IDE deploys to GitHub Pages (**https**); a Pixelblaze speaks only **`ws://<LAN-IP>:81`** (no TLS). An https page opening a plaintext LAN websocket is mixed *active* content and is blocked outright — no prompt, no override (Ecosystem Primer §7). So a deployed web tool cannot reach a device on its own: it needs a helper running outside the browser sandbox that the page can reach and that in turn reaches the device.

The originally-planned helper was a **Node "local bridge"** — a small `ws://127.0.0.1` server wrapping `PixelblazeConnection`. That works but asks every user to install and run a Node process, and it has no natural home for the device's *own compiler* (needed to turn pattern source into the bytecode a push requires).

## Decision

**A Chrome extension is the v1 transport helper**, sitting behind a backend-neutral **provider seam** so no UI code ever imports a concrete transport.

1. **The `ControllerProvider` seam (`src/engine/ControllerProvider.ts`) is the firewall.** It contains the entire "how do we reach a Controller" decision behind one interface: `connect`/`disconnect`, status subscription (a `ControllerStatus` discriminated union), read/monitor (`getConfig`, telemetry, `listPrograms`, `getControls`/`setControls`, `brightness`, `setPixelCount`), and capability-gated `compile`/`pushBytecode`/`getPixelMap`/`pushPixelMap`. The app imports only this module and its types — never an extension API, `PixelblazeConnection`, or `RelayWebSocket`. Anything naming "extension" or "bridge" is in the wrong file. A `NullControllerProvider` (permanently `no-extension`) lets the whole UI render against the seam before any backend exists.

2. **The v1 backend is `ExtensionControllerProvider`**, which owns a `PixelblazeConnection` whose socket is a `RelayWebSocket` — a `WebSocketLike` proxy that tunnels frames across a `window.postMessage` → content-script → service-worker seam to a real `ws://` socket living in the extension. **Because `RelayWebSocket` satisfies the same `WebSocketLike` as the browser/Node sockets, the entire documented JSON/binary protocol engine drives it unchanged** — the relay adds transport, not protocol. Binary frames cross the seam as base64 (`chrome.runtime` messaging is JSON-only). The extension packaging (manifest, service worker, content script, offscreen document) stays entirely on the far side of the transport seam.

3. **The device's own compiler runs inside the extension (H8), not in the app.** A push needs bytecode, and the only faithful compiler is the device's. The helper fetches it from the device and evals it inside an **offscreen-hosted sandboxed iframe** — the only MV3-legal place to eval remote code. Compile is a one-off request/response correlated by `reqId`, independent of any ws connection.

4. **Pattern push overwrites in place.** Each `(Controller, IDE pattern)` pair remembers the device program id it last pushed to and reuses it, so repeated Sends overwrite rather than pile up copies. A remembered id the user deleted on the device is silently re-minted (`controllerBinding.ts`, `pushPattern.ts`). Control values are never part of a push — the binding is identity only.

5. **Map push and read-back honour the firmware's exact-count rule.** A pushed map must contain *exactly* `pixelCount` coordinates or firmware silently drops it (the #204 footgun — see ADR-0004 for the post-hoc stale-map sibling, and Ecosystem Primer §5). So a map push re-bakes the map source to the device's `pixelCount` before encoding (`mapPush.ts`), and the panel can make the count editable (`setPixelCount(n, save:true)`) so a hard-coded-count map can be made to apply (#213). Map *read-back* is an HTTP GET of `/pixelmap.dat` (there is no "get map" WS message), so it too rides the extension helper (#205).

6. **The model is keyed and multi-Controller from day one.** Extension *presence* is global (one extension, one detect); connection *state* is a map of Controllers keyed by IP, exactly one active, each with its own isolated provider/socket/reconnect (`controllerStore.ts`). The registry's *active* provider is what the panel and Send read/drive.

7. **Device-mutating writes are deliberately conservative.** Brightness and live control writes are volatile (`save:false`, mindful of flash wear); `activeProgramId` and pushed patterns persist; `setPixelCount` saves (it must survive a reboot to make a map apply). A map push always routes through a preflight dialog — overwriting the device's single shared map is never a silent one-click.

## Considered options

- **Node local bridge (the original plan)** — rejected as v1. Asks for a Node install + a running daemon, and gives the device compiler no sandbox to live in. Still viable as a *second* backend behind the same seam if the extension route ever fails; the seam exists precisely so it can be swapped in without touching UI.
- **Per-site "allow insecure content" toggle** — rejected. Fragile, per-site, hand-set, and invisible to the app; not a foundation.
- **A single-connection model** — rejected in favour of the keyed map (#210), so multiple benches/controllers are correct by construction even though the header renders one richly today.
- **Compile in the app (re-implement the device compiler)** — rejected. Only the device's own compiler is faithful; re-implementing it is a large, drift-prone surface. Fetch-and-sandbox the real one instead.

## Consequences

- The strict "offline-first, no backend" stance (main PRD; Tech Reference §1) is **narrowed, not broken**: authoring (edit, transpile, preview, copy/download) stays 100% browser-only and requires nothing installed. Live Controller connectivity is **additive** and the one deliberate exception — and even it runs no *server*, only a browser extension on the LAN side.
- Tech Reference §13 is no longer "out-of-band, not used by any in-app UI": the connection layer now backs a real in-app surface (status pills, live panel, Send to Controller). §13 is rewritten to describe the seam, the extension backend, and the push/read-back flows.
- Nothing the IDE invents for the preview reaches the device — the consistent rule holds across the connectivity layer too: pushes carry pattern bytecode and (only on explicit map push) the baked coordinate array; never normals, solidity, recommended settings, or fidelity.
- This was once "deferred and undesigned" direction; it is now substantially built. The earlier forward-looking "Node local bridge" framing is superseded by this ADR.
