# Hardware bench

Work that touches the physical Pixelblaze runs against one bench controller on
the local network. This page covers reaching it, measuring on it, and the two
failure modes that most often look like software bugs.

## Reaching the controller

The pb32 Controller lives at `192.168.8.224` — HTTP on port 80, the Pixelblaze
WebSocket on port 81. Hardware scripts read `PIXELBLAZE_IP` and already default
to that address.

It does **not** answer `ping` or a bare `nc -z` probe. Those fail on a perfectly
healthy device, so never treat them as an availability check. Verify with a real
connection instead:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://192.168.8.224/   # expect 200
```

LAN access requires running outside the command sandbox; a sandboxed failure is
not evidence the device is down.

When the controller is unavailable, ask. If nobody is around, keep building the
software side and leave the issue open with a note that it still needs the
hardware run before it can close.

## Measuring on device

`npm run devbench` (`test/perf-harness/devbench.ts`) is the automated
optimization loop. It bundles a demo or any `.js` file, compiles it to bytecode
using the device's own embedded compiler headless in Node, pushes it run-only
over the LAN, confirms `getConfig().activeProgramId` matches what it pushed, and
only then samples the firmware's reported `fps`. The active-program guard is
deliberate: without it the number could describe whatever was already running.

```bash
PIXELBLAZE_IP=192.168.8.224 npm run devbench -- Kishimisu
PIXELBLAZE_IP=192.168.8.224 npm run devbench -- /tmp/base.js Kishimisu   # before/after
```

Stock Patterns live in `src/pixelblaze/stock/patterns/`, which is the directory
devbench resolves demo names against. Capture a baseline from there:

```bash
git show HEAD:src/pixelblaze/stock/patterns/Kishimisu.js > /tmp/base.js
```

Two operational notes. The post-push settle must stay at roughly two seconds: at
400 ms the device is still loading fresh bytecode and will not answer the
settings packet carrying top-level `brightness`, so `getConfig` hangs until
timeout and reports "Pixelblaze request timed out waiting for brightness" even
though connect and push both succeeded. Slow patterns also need a longer
`--sample` window — PhantomStar runs near 0.24 FPS.

devbench complements the emulator: `npm run bench` gives op count and checksum,
`npm run profile` gives per-built-in cost. A targeted profiler round runs
only the named probes plus their baselines and the multiply unit, and writes
its table elsewhere so the committed full tables stay put:

```bash
PROFILE_ONLY=56,57 PROFILE_OUTPUT=$PWD/test/perf-harness/issueNNN-probe-rows.md npx tsx test/perf-harness/profiler.ts
```

Append the rows to `show-runtime-costs.md` as a dated round (#924 is the
model).

## Static pricing without hardware: the bytecode oracle (#906)

`test/perf-harness/bytecodeOracle.ts` runs the Controller's own compiler
headless and counts compiled 32-bit words (~0.35 us/word on the pb32), so an
emission idiom can be priced as a word diff before any device time is spent.
Populate the local compiler cache once with a reachable device
(`ISSUE906_REFRESH=1 PIXELBLAZE_IP=<ip> npx vitest run
test/perf-harness/issue906.oracle.test.ts`); after that the oracle works
offline. The cache directory is ignored, never committed. Measured codegen
facts — statement and select shapes, loop overhead, the short-circuit
verdict — live in `test/perf-harness/codegen-facts.md`
(`ISSUE906_FACTS=1` regenerates it) and
`test/perf-harness/issue906-shortcircuit.json`. Word counts are a planning
proxy: a shipped idiom still gets one hardware probe.

## Two failures that look like bugs

**A stale extension.** After changing `extension/background.js`, reload the
unpacked extension at `chrome://extensions` and then reload the IDE tab. The
service worker caches the old code, so newly added relay handlers stay inert —
the page request simply times out and the feature looks broken while the code is
correct. Lead with this whenever handing over a hardware check that touched
`background.js`.

**A full socket pool.** The firmware accepts only a small number of concurrent
WebSocket connections. A `ECONNRESET` on connect while HTTP still answers means
the pool is full, not that the code is wrong. Every live viewer holds a socket:
the device's own web UI tab, each app instance, the phone app. Close the others
before suspecting a bug.

## Testing disconnect detection

The bench bag's power switch cuts the **LEDs only**. The controller board stays
powered, so its WiFi and WebSocket stay up and keep streaming frames — which
reads as "disconnect isn't being detected" when there is genuinely nothing to
detect.

To exercise a real drop, unplug the board itself or drop WiFi. Once it truly goes
silent the liveness watchdog in `PixelblazeConnection` fires `stale` and
reconnects. Confirm the board is unpowered before treating stuck status as a bug.

## The bench panel is wired column-serpentine

The 16×16 (256 pixel) test panel snakes its data in **vertical** strips with
every other strip reversed. The stock row-major Plane map therefore renders
rotated and torn on it, which looks like a broken Pattern and is not.

A custom serpentine map fixes it, verified on hardware across several Patterns
with column snaking and serpentine reversal enabled and no axis flips. Stock maps
live in `src/pixelblaze/stock/maps/`; reuse the column-serpentine generator
rather than re-deriving one.

When a Pattern looks rotated or torn on the physical panel, suspect the map
winding before the Pattern.
