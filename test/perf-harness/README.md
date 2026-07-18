# Perf harness

Six complementary tools live here. Keep their questions apart:

| tool | question | source of truth |
|---|---|---|
| **emulator bench** (`bench.ts`, #247) | "how many ops did my pattern do?" | the in-repo emulator — no hardware |
| **visual drift** (`drift.ts`) | "how much did the image change?" | the in-repo emulator — no hardware |
| **hardware profiler** (`profiler.ts`, #245) | "what does each op cost on the device?" | a physical Pixelblaze on your LAN |
| **hardware FPS bench** (`devbench.ts`, #248) | "did my pattern get faster on the device?" | a physical Pixelblaze on your LAN |
| **Show attribution** (`issue531.hardware.test.ts`, #531) | "which frame-time component dominates this Show?" | controlled artifacts on a physical Pixelblaze |
| **routing representation spike** (`issue400.ts`) | "how should dynamic layouts be encoded?" | both emulators + device compiler + optional hardware |

The emulator bench proves an edit was *output-preserving* (checksum) and counts
ops; the drift tool quantifies intentional visual changes; the FPS bench measures
the *whole-frame* speedup the edit actually buys on hardware.

The issue #400 runner is a repeatable composite benchmark for Show routing. It
builds contiguous, serpentine-band, interleaved, and sparse-exception fixtures at
256 and 1,024 pixels with 2, 4, and 8 layouts; compares range branches, RLE,
packed lookup, and eligible formulas; and records source/bytecode size, globals,
array pressure, and Fast/Precise timing. With `--hardware`, it opens one socket,
pushes only candidates that fit the measured device budget, samples FPS, then
leaves a slow-switching visual probe active:

```bash
PIXELBLAZE_IP=192.168.8.224 npm run issue400 -- --hardware
```

The committed result is
[`docs/plans/archive/issue-400-routing-representation-results.md`](../../docs/plans/archive/issue-400-routing-representation-results.md).

---

## Emulator bench (`npm run bench`, #247)

Times any demo in both **Fast** (float64) and **Precise** (16.16 fixed-point)
modes and emits a **pixel checksum**, so an optimization pass can prove it
changed the speed *without changing the visual*.

```bash
npm run bench -- Kishimisu                  # both modes, time + checksum
npm run bench -- Kishimisu --frames 60 --grid 32x32
npm run bench -- TestPattern3D --grid 12x12x12   # ROWSxCOLSxLAYERS for 3D
npm run bench -- --list                     # available demos
```

The **checksum is the guard rail**: it's an FNV-1a hash of the 8-bit-quantized
RGB buffer over a fixed window of frames at a fixed virtual clock. Re-run after
an edit and compare it *per mode* — identical checksum ⇒ byte-for-byte identical
output, so any frame-time delta is a pure speed change. (8-bit quantization
absorbs sub-ULP float noise between modes/machines while staying sensitive to
real visual change.) The bench picks a default grid by the demo's
dimensionality (1D strip / 2D plane / 3D cube) unless `--grid` overrides it.

### Load-bearing caveat — it counts OPS, not native cost

Every math built-in is a native JS `Math.*` in **both** shims
(`src/engine/shim.ts`); Precise only adds a raw↔float quantization per call. So
the bench rewards **fewer ops, fewer loop iterations, and factoring invariants
into `beforeRender`** — but it will **not** reward `sin`→`wave` or
`sqrt`→`hypot` (it may even *penalize* them, since here `wave` wraps `cos` and
is strictly more work). For true per-call hardware cost, use the profiler below.

This tool is pure and hardware-free; the pure core (`benchCore.ts`) is unit-
tested (`benchCore.test.ts`) and runs in the normal `npm test` gate.

| file | role |
|---|---|
| `bench.ts` | CLI: parse args, load demo + libs off disk, print time + checksum |
| `benchCore.ts` | pure bench engine: bundle → render N frames → mean time + checksum |
| `benchCore.test.ts` | guards checksum determinism & sensitivity |

---

## Visual drift (`npm run drift`)

Compares two pattern sources over the same deterministic emulator frame window
and reports *how much* the pixels changed. This is the lossy-optimization
prefilter: use it when an edit intentionally trades a little visual fidelity for
speed, such as approximating `exp`/`pow`, cutting octaves, lowering raymarch
steps, or replacing a smooth curve with a cheaper one.

```bash
npm run drift -- Kishimisu /tmp/Kishimisu.lossy.js
npm run drift -- /tmp/base.js src/pixelblaze/stock/patterns/ZippyZaps.js --mode precise
npm run drift -- PhantomStar /tmp/PhantomStar.fast.js --frames 8 --grid 16x16
```

Output includes the baseline/candidate emulator frame time and checksums, then
8-bit RGB drift metrics:

- `mean` — average absolute channel delta, 0..255.
- `rmse` — root-mean-square channel delta; more sensitive to larger errors.
- `p95` / `max` — tail size, useful for spotting localized artifacts.
- `changed>=N` — fraction of RGB channels whose absolute delta meets the
  threshold (`--threshold`, default 2).

Treat these as a sorting aid, not a judge. A tiny numeric drift can hit a
visually important feature, and a large drift can be perfectly acceptable in a
turbulent or noisy pattern. The intended loop is: generate broad candidates,
use drift to find the promising ones, eyeball them, then use `devbench` for the
real hardware FPS number.

---

## Hardware operation cost profiler (#245, #532)

Measures the **real relative cost of Pixelblaze operations on actual hardware**.
The original matrix covers built-ins (`sin`, `pow`, `perlin`, and others); the
Show-runtime matrix adds array traffic, scalar locals/globals, user calls,
dispatch, generated HSV conversion, and packed-value bit operations. Results
live in [`costs.md`](./costs.md) and
[`show-runtime-costs.md`](./show-runtime-costs.md).

## Why the emulator can't answer this

Our preview implements **every** math built-in as a native JS `Math.*` call in
both the Fast and Precise paths (`src/engine/shim.ts`); the fidelity path only
quantizes results. So the emulator measures *operation/call count*, not
hardware's per-function cost — and even gets the ordering wrong (`wave()` is
*slower* than `sin()` there, but on hardware `wave()` is a cheap table lookup).
The device is the only source of truth.

**This is a hardware, out-of-band tool.** It needs a physical Pixelblaze on the
LAN and is excluded from the pre-commit gate because it touches the network.
The runner temporarily loads the probe bytecode, then restores the original
active Pattern and pixel count in `finally`; it never reads or writes the pixel
map.

## How to run

Run the full operation matrix against a reachable Controller:

```bash
PIXELBLAZE_IP=192.168.8.224 npm run profile
```

Run only the multiply control and Show-runtime range when iterating on #532:

```bash
PIXELBLAZE_IP=192.168.8.224 PROFILE_SHOW_RUNTIME=1 npm run profile
```

The runner auto-tunes the inner-loop count, waits for three stable EMA readings,
collects five samples by default, subtracts each operation from its declared
paired baseline, and normalizes the result to a multiply. Environment variables
can override the target, settle interval, stability tolerance, repetitions, and
output-profile label.

## Method

- The profiler runs the selected operation `iters` times per frame and exports a
  short EMA of frame time. The runner rejects a probe that does not stabilize.
- **Net cost = `ms(operation) - ms(paired baseline)`**, divided by `iters`.
  Built-ins use the identity loop; arrays, calls, branches, and color conversion
  use matched shapes so indexing or direct-expression scaffolding cancels.
- Costs are reported **relative to a multiply** — robust to per-frame fixed cost
  and the exact `iters`/firmware FPS target.
- Measured in `beforeRender`, isolated from the per-pixel map/LED-output path.

### Anti-cheat

So the bytecode VM can't optimise the loop away: each op's argument is the
running accumulator (no hoisting), the accumulator carries across frames into a
read-back sink (not dead code), and operands wrap through `frac(... + 0.123)`
each iteration to stay in `[0,1)` (bounded — no 16.16 overflow shifting costs).

## Files (profiler)

| file | role |
|---|---|
| `profiler.js` | Pixelblaze-dialect probe Pattern, temporarily loaded by the runner |
| `profilerModel.ts` | probe catalog, paired subtraction, dispersion, and report serialization |
| `profiler.ts` | reversible runner: compile, load, tune, stabilize, sample, restore, report |
| `costs.md` | original native built-in matrix |
| `show-runtime-costs.md` | cache and dispatch exchange matrix for Show compilation |

The `fn` codes in `profiler.js` and `PROFILE_OPS` in `profilerModel.ts` must stay
in sync; the focused test enforces that contract.

---

## Show frame-time attribution (`npm run issue531`, #531)

Builds diagnostic-only artifact ladders for Redline, the five-Pattern acceptance
Show, output reuse, scalar fields, and content-key composition. Ordinary Show
compilation remains byte-for-byte unchanged. The reversible hardware run
records source, expanded source, bytecode, VM words, persistent globals, FPS,
frame-time distributions, and pairwise millisecond deltas:

```bash
npm run issue531
PIXELBLAZE_IP=192.168.8.224 npm run issue531:hardware
```

The hardware runner waits after each activation so the preceding Pattern's last
FPS packet cannot enter the sample window, restores active Pattern and pixel
count in `finally`, and leaves the pixel map untouched. Capture elision is emitted
only for a one-member render-pure boundary; other fixtures retain an explicitly
unresolved Show-overhead bucket.

---

## Restart-global liveness census (`npm run issue536`, #536)

Runs a compile-only half-open lifetime census over all stock Shows, the
five-Pattern acceptance Show, and disjoint/overlapping boundary fixtures. The
census charges exact activation tracking and entry initialization while
excluding Continue, Controls, public/watch state, scheduler-owned state,
arrays, call initializers, and unproved lifetimes.

The research gate stops before emission: the representative median reclaim is
0%, no over-limit Show crosses below 256 globals, and the weighted 15.07%
result is dominated by reference artifacts already blocked by byte size. The
focused suite is the machine-readable report; no Controller run is required
because no production code or active render loop changes.

```bash
npm run issue536
```

---

## Acceptance Show qualification (`npm run issue520`, #520)

The acceptance harness compiles a 36-second, 2,000-pixel routed Show containing
five stock Pattern instances, five physical Zones, continued instance clocks,
Effects, snapshot/live Crossfade, and scalar-field Dissolve. It reports the
resource envelope, cache plan, optimization counterfactuals, and deterministic
Fast/Precise captures:

```bash
npm run issue520
```

Two opt-in companions complete qualification:

```bash
PIXELBLAZE_IP=192.168.8.224 PIXELBLAZE_FW=3.67 npm run issue520:hardware
ISSUE520_VISUAL=1 npm run issue520:visual
```

The hardware runner pushes the baseline, each cumulative compiler layer, the
selected snapshot/live artifact, current 2,000-pixel Redline, and a separately
labeled unsupported 4,000-pixel Redline stress probe. It always restores the
Controller's original program and pixel count in `finally`. The visual runner
writes `/tmp/pxlblz-issue520-contact-sheet.png` with representative Scene and
Transition boundaries for human review.

---

## Hardware FPS bench (`npm run devbench`, #248)

Closes the optimization loop on real hardware, fully automated — no hand-loading.
Give it a demo (or any `.js` source file) and it bundles, compiles to device
bytecode, pushes the pattern run-only over the LAN, **confirms the device is
actually rendering it**, then samples the FPS the firmware reports. Pass two or
more sources to get a before/after Δ.

```bash
PIXELBLAZE_IP=192.168.8.224 npm run devbench -- Kishimisu
PIXELBLAZE_IP=192.168.8.224 npm run devbench -- /tmp/Kishimisu.baseline.js Kishimisu
PIXELBLAZE_IP=192.168.8.224 npm run devbench -- a.js b.js --settle 4000 --sample 5000
```

A handy before/after recipe is to diff the committed version against your working
tree: `git show HEAD:src/pixelblaze/stock/patterns/Kishimisu.js > /tmp/base.js`, then
`npm run devbench -- /tmp/base.js Kishimisu`.

### How it works (and why it needs no Chrome extension)

The device runs **bytecode**, compiled by its *own* embedded compiler. In the app
that compile is routed through the extension's sandboxed iframe only because MV3
CSP forbids `eval` in a service worker. Node has no such restriction, so devbench
fetches the device compiler over HTTP (`/index.html.gz`), extracts it with the
tested `compilerExtraction.ts`, and evals it in a Node `vm` context with a
`window` shim. Push + FPS readback reuse `PixelblazeConnection` wholesale — the
same Node comms layer `profiler.ts` uses.

- **Active-program guard.** A run-only push mints a throwaway id; after pushing,
  devbench calls `getConfig()` and refuses to report FPS unless
  `activeProgramId` matches the id it pushed. A meaningless number from a
  pattern the device never switched to is thus impossible.
- **FPS sampling.** The firmware streams `fps` in its periodic status frames;
  `PixelblazeConnection` captures the latest passively. devbench discards a
  `--settle` window (default 3 s) then averages distinct readings over a
  `--sample` window (default 4 s).

### Caveat — very slow patterns need a longer sample window

The default 4 s sample assumes a normal frame rate. A pathologically heavy port
can render at a fraction of an FPS (PhantomStar is ~0.24 FPS ≈ 4.2 s/frame on the
16×16 panel), so the default window catches only one or two frames — far too few
to trust a before/after Δ. For sub-1-FPS patterns pass a long window so you
collect ~10 frames per side, e.g. `--settle 6000 --sample 40000`. (Separately, the
post-push active-program guard waits ~2 s for the device to finish loading the
freshly compiled bytecode before calling `getConfig`; too short a wait there makes
`getConfig` time out on the settings packet that carries `brightness`.)

### Caveat — frees the socket pool

The Pixelblaze has a small WebSocket pool; if a connect fails with `ECONNRESET`
while HTTP still answers, another client (a browser tab on the device web UI, the
IDE on `localhost`, the stock editor, the phone app) is holding a socket. Close
it and retry.

## Files (FPS bench)

| file | role |
|---|---|
| `devbench.ts` | bundle → compile (headless) → push → confirm-active → sample FPS → Δ |

It reuses `src/engine`: `bundle.ts`, `compilerExtraction.ts`, `bytecodePush.ts`,
`PixelblazeConnection.ts`. The `buildBytecode` blob layout mirrors
`extension/sandbox.js` (keep in sync if the bytecode format changes).
