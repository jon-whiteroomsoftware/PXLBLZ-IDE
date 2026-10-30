# Design a device-wide Calm control: frame-blended slow motion, time dilation and smearing

Source: [PXLBLZ-IDE #1229](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1229), authored on GitHub by `jon-whiteroomsoftware` and created 2026-10-27 at 00:50:35 UTC (2026-10-26 Pacific). The source attributes the original design discussion to Jon and a principal-engineer session on 2026-10-26, and the subsequent specification to a principal-engineer session on 2026-10-27; it does not identify that session. This document preserves the complete issue-body snapshot last updated 2026-10-30 at 17:40:05 UTC, exported under [#1227](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1227).

This is a forward-looking proposal and historical specification with open decisions, rather than an as-built reference. [#1246](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1246) supersedes its lab-axis table and settings; the surviving refusal behavior and preserved invariants still govern as recorded below. Historical progress, handoff and approval statements are retained verbatim as part of the snapshot; follow the linked issues for current implementation and acceptance state. The preserved text begins after the divider.

---

**Control and wrapper supersession:** #1246 supersedes this specification’s lab-axis table and settings: fixed 16 ms Blend, live speed position (1/16 to full) and dreamy decay are the two product controls. Hold, Clock, Eased, stagger, attack, rate-list and step settings leave the engine. The refusal behaviour and preserved invariants below still govern. Follow #1246 for the current implementation, proof and remaining review/landing state.

Origin: a design discussion between Jon and a principal-engineer session on 2026-10-26. Jon is building 16×16 LED matrices as desk gifts. Most stock Patterns are too busy, noisy and jumpy to look at for long, and a hardware brightness pot already handles brightness. Jon asked whether Patterns could be slowed down and smoothed the same way, at the device level, without editing each one. He also asked about time dilation: varying the speed with a sine wave and controlling its amplitude. The analysis below is recorded close to verbatim at Jon's request. Code citations are at commit `dfa2211a`.

## Parent

Epic #1235 (slow-mo for Patterns); this issue is its definition child. Related work: Wave-5 performance epic #923. That epic contains the Performance dial #925 (another single Controller-profile setting that combines lossy levers), the frame-time governor #935, and the spatial hold-and-lerp #937 (`src/engine/showSpatialHold.ts`). The spatial hold already captures member output as RGB and blends between samples. Those levers work across space and aim at frame rate. This proposal works across time and aims at calm, but the capture-and-blend machinery overlaps.

## Proposal

The best idea of the ones discussed is frame blending, the technique video editors use for slow motion: run the pattern slower, render a real frame only every Nth display frame, and crossfade between the last two real frames at full frame rate. What makes it work is tying N to the speed. At half speed you render every 2nd frame; at 1/10 speed, every 10th. The pattern then always sees normal-sized time steps, everything in it slows down evenly, and the crossfade fills the gaps. PXLBLZ already has most of the pieces inside the Show compiler. What's missing is a device-wide version that sits next to the brightness pot.

### Why slowing the clock alone isn't enough

The other macro approach is to give the pattern a slower clock. You scale `delta` and redirect `time()` to a virtual clock, and the pattern slows down smoothly at full frame rate with no frame buffers. The Show compiler already does this for each Pattern's "animation speed": `src/engine/showCompiler.ts:11614` scales `delta` and `:11707` redirects `time()`. It fails in two ways:

1. **Some patterns change per frame, not per second.** New `random()` sparkles every frame, frame counters, `x += 0.01` without `delta`: these ignore the clock completely. They also tend to be the noisy ones.
2. **The Pixelblaze uses fixed-point numbers, and slowing down is where that hurts.** Its numbers have 16 bits after the binary point, so the smallest step is about 0.000015. At 200 FPS and 1/20 speed, a pattern that does `phase += delta/1000 * 0.05` adds less than one of those steps per frame. That rounds to zero, so the pattern freezes or moves in jerks. The IDE's Precise preview mimics this arithmetic, so it shows up before it reaches hardware.

Frame blending fixes both. Per-frame patterns advance once per real frame, so they slow down by N. Every real frame also gets a full-size `delta`, so nothing rounds to zero. Pausing fails, as Jon predicted, because it's frame blending without the blend.

### What it looks like on a 16×16

A crossfade isn't true motion. A dot that moves one pixel between real frames fades from one pixel into the next, which reads as smooth motion between pixels; at this resolution that covers most slow movement. Anything that jumps several pixels between real frames leaves a double image. Because N follows the speed, consecutive real frames are only one normal frame apart, so most patterns stay under one pixel per step. Random sparkle patterns go from flicker to a slow twinkle, which is probably the desired look.

Implementation notes:

- **Blend in RGB, not HSV.** HSV blends swing through the rainbow. The pattern's `hsv()` calls need to be captured as RGB. The Show compiler already captures each Pattern's `hsv`/`rgb` output (`src/engine/showMemberLowering.ts:684`) and already crossfades from a frozen frame to a live one (`src/engine/showCompiler.ts:1377`).
- **Memory:** two RGB frames for 256 pixels is 1,536 array values. Not yet checked against the Pixelblaze V3 array limit; it's the first number to confirm on hardware.
- **Processor cost goes down as you slow down.** Blending 256 pixels is cheap, and the pattern itself only runs every Nth frame.
- **Clock wraparound:** a desk object runs for days. The clock counts seconds, and the largest number the Pixelblaze can hold is 32,767, about 9 hours. A quick search didn't turn up any wraparound in the Show clock. Shows loop, so it may never matter there, but a device-wide wrapper needs one.

**One limit software can't fix:** at low brightness, 8-bit LEDs have few brightness levels. At 10%, a WS2812 pixel has roughly 25 steps between off and full, so a slow 2-second fade visibly steps. APA102/SK9822 LEDs have a separate 5-bit global brightness that keeps more levels near the bottom. This, more than software, may set how slow things can go and still look smooth.

### Time dilation

Yes, and it's almost free once the slower clock exists. Set rate = base × (1 + A·sin(2πt/P)) and add up the elapsed time each frame. Vary the rate, not the time itself.

- Keep A ≤ 1 so the rate never goes negative.
- Reverse isn't possible in this design, because the pattern can only step forward; you can't un-roll a `random()`.
- Rate 0 is fine: the picture just holds.
- The pot could set A instead of the speed, which gives a "breathing" control.

Proposal beyond Jon's ask: other inputs could drive the rate. The existing `night-scheduler` mixin could slow things down at night, and `sensor-pulse` could follow audio. Both already connect an input to a setting (`src/engine/mixins.ts`); the rate would just be one more setting. Inside a Show, speed can already be animated along the timeline today.

### Smearing

Once real frames are stored, these effects become cheap:

- **Temporal smoothing** (averaging each pixel over recent frames) calms flicker, but it isn't the same as slowing down. Averaging random sparkles drifts toward a dim haze.
- **The existing Show "trails" effect** keeps the brighter of the new pixel and the faded old one (`src/engine/showCompiler.ts:4293`). New flashes appear instantly and only the fade-out is slow, so flashes still pop. For calm, slow fade-in is needed too. The fade amount is applied once per frame, so the fade time changes with frame rate (which depends on how heavy the pattern is). A device-wide version should base it on elapsed time instead.
- **Spatial blur** needs the whole frame first, because a pixel's neighbours haven't been computed yet when it renders. The stored frames solve that.
- **Video-feedback "melt":** read the previous frame slightly shifted, rotated or zoomed, and let it fade.
- **Staggered crossfade:** give each pixel a slightly different blend timing based on its position, so changes sweep across the matrix instead of fading all at once.

Before writing spatial blur, try a physical diffuser. It costs no processing, and it's usually the biggest single improvement for a desk LED piece. That comes from experience, not measurement.

### Decisions for Jon

Status (2026-10-27): scope is settled in the comments (preview-only lab for Patterns first; controls and push deferred), and the experiment in item 3 is now the Required proof of the spec below.

1. **Scope.** Recommended: a device-wide "Calm" setting next to the hardware brightness, so it applies to every Pattern pushed to the device; the friends receiving these won't be editing code. The device-level settings currently support only brightness (`GlobalTransform` in `src/engine/controllerProfile.ts:110`), and brightness works by adjusting colour output (`hw-brightness` in `src/engine/mixins.ts`). Calm needs a clock-and-capture wrapper, which is closer to how Shows handle each Pattern.
2. **Controls.** The options are a second pot for speed, a fixed calm preset, or the pot setting speed with a fixed time-dilation wave on top. For a second pot: the `pot-binding` mixin notes that IO33 reads analog on every V3 Standard, while IO34/35/36/39 need hardware 3.5 or later.
3. **Next step.** A quick experiment before designing any UI. Take one pattern that moves by time and one that sparkles randomly, and run each at full, 1/4 and 1/16 speed: first in Precise preview, then on the matrix at desk brightness. That answers the three open questions: how the blending looks, whether low-brightness fades step visibly, and whether the memory fits.

## Design notes for the first version (2026-10-27 discussion)

Decisions and the agreed roadmap are in the comments. These notes carry the remaining detail the spec needs. Code citations are at commit `dfa2211a`.

**What exists today**

- The preview Speed selector (`src/components/SpeedSelector.tsx`, 0.01×–10×, saved per pattern through `src/store/settingsCascade.ts:86`) slows the clock: `src/engine/renderLoop.ts:94` multiplies `delta`. This is the "slow clock only" baseline. A sparkle pattern at 0.1× keeps flickering at full rate, which shows the failure for free.
- The preview does not run Controller-profile transforms. The pass engine runs only on the push path (`src/store/controllerStore.ts:1363`). First build step: the preview applies the generated slow-mo wrapper to the Pattern source before running it, in both Fast and Precise. Build the hook as "apply this list of transforms before running", so other transforms can join later.
- There is no general feature-flag mechanism. Precedents are URL switches: `?capture`, and `?agent=1` (`src/components/ShowEditor.tsx:1242`). Recommended: a `?slowmo=1` switch that shows the slow-mo control.
- Keep the Fast/Precise selector for arithmetic only. Slow-mo level and method get their own control; blending in Precise is how the fixed-point stall is checked.
- The preview already has a Diffusion setting (`src/engine/renderer.ts:75`), a glow model rather than a measured diffuser, useful for judging the diffuser idea.
- The preview's input stand-ins return 0 for `analogRead`/`readAdc` (`src/engine/shim.ts:291`, `:296`). This only matters if the preview later runs device input bindings (out of scope now).

**Design points**

- Fixed step: each real frame advances the Pattern by a fixed amount of virtual time, and the blend fraction is accumulated virtual time divided by that step. The browser (about 60 Hz) and the controller then render the same sequence of real frames whatever their frame rates, and per-frame Patterns run at the same pace on both.
- Capture output as RGB (rewrite `hsv`/`rgb` like `src/engine/showMemberLowering.ts:684`) and blend in RGB.
- Reset-on-rewind precedent for stateful effects: `src/engine/showPreviousRgbFeedback.ts`.
- Persistence: make the fade depend on elapsed time; the existing trails effect applies a per-frame factor (`src/engine/showCompiler.ts:4293`).

**Fidelity and proof**

- Precise preview runs the same slow-mo code with the device's arithmetic, so motion and smoothness carry over. The preview flatters slow fades at low brightness (the screen is smoother than 8-bit LEDs), and light quality differs from screen to LEDs.
- Early hardware check: the preview runs ordinary Pixelblaze code, so paste the generated, wrapped Pattern onto the matrix by hand and compare it side by side with the preview at desk brightness. This needs no push feature.

**Later (not the first version)**

- Shows: a Show compiles to one Pattern, so wrapping the compiled Show slows everything, timeline included ("stretch"). The alternative, a normal-pace timeline with calmed members, is a different product. Open questions: memory on large Shows, and seek.
- Shipping to controllers: follow #925's pattern. The Controller profile owns the setting, the preview honours it, and the toolbar offers a session override.
- Related follow-up: #1234 (preview matches device frame rate).


## Spec: slow-mo lab v1 (roadmap items 1–3)

Status: **approved by Jon, 2026-10-27**, with the decisions recorded below and verbatim in the comments (principal-engineer session; written at `dfa2211a`). Built through #1236, #1237 and #1238 under epic #1235.

### What to build

A preview-only **slow-mo lab** for Patterns, shown only under `?slowmo=1`. One generated Pixelblaze wrapper (a new pass in the pass engine) gives the Pattern a fixed-step clock, captures its output as RGB, and shows in-between frames and an after-effect. The preview runs the wrapped artifact in Fast (`code`) and Precise (`emitFixedPoint(code)`); a later push would send the same `code`. Nothing on the push path changes.

The lab exposes three axes, matching the eventual grouping (tempo / in-between frames / after-effects) without designing the product control:

| Axis | Setting | Values (lab) | Live or rebuild |
| --- | --- | --- | --- |
| Tempo | `rate` | 1, 1/2, 1/4, 1/8, 1/16, 1/32 (slow only) | live |
| Tempo | `stepMs`: Pattern time per real frame | 16 (default), 32 | live |
| In-between | `inBetween` | `clock` (baseline: today's Speed path), `hold` (baseline: stepped), `blend` (linear), `eased` (smoothstep) | `clock` ↔ others rebuilds; among `hold`/`blend`/`eased` live |
| In-between | `stagger` | shape `sweep` / `radial` / `scatter`; width 0–0.9 (0 = off) | live |
| After-effect | `persistence` | off, or attack 0–5,000 ms and decay 0–10,000 ms | on/off rebuilds; dials live |

"Live" settings are wrapper globals the preview updates in place with `handle.setRuntimeVar` (encoded through `shim.encodeScalar` in Precise), so comparing methods does not restart the Pattern. A rebuild reloads the Pattern from t=0, as a source edit does. **Copy generated code** copies the exact `code` the preview runs, with the current live values written in as initializers, for the hand-pasted hardware check.

### Slices

Each slice is shippable behind the flag and lands separately.

1. **A, #1236 — hook, frame blending, baselines, lab panel** (roadmap 1): preview recipe hook, `slowmo` pass with fixed-step clock, RGB capture, two-frame blend (`hold`/`blend`/`eased`), the `clock` baseline, refusals, lab panel, Copy generated code, render-script flags.
2. **B, #1237 — staggered crossfade** (roadmap 2): per-pixel blend offsets.
3. **C, #1238 — persistence** (roadmap 3): attack/decay buffer, including the persistence-only structure over the `clock` baseline.

### Files and functions

- `src/engine/slowMo.ts` (new, pure, no React): `SlowMoSettings`, `SlowMoDeclineReason`, `planSlowMo(code: string, settings: SlowMoSettings, pixelCount: number): SlowMoPlan` (refusal checks and array words), `emitSlowMoWrapper(code, settings, pixelCount): SlowMoWrapResult` (acorn rewrite plus generated prelude and entry points), `slowMoTunables(settings): Record<string, number>` (live values by generated global name), `slowMoArrayWords(pixelCount, structure)`.
- `src/engine/passEngine.ts`: a new `PassRecipeItem` kind, `{ kind: 'slowmo'; settings: SlowMoSettings; pixelCount: number }`, applied by a new `applySlowMoPass` alongside `applyInterceptPass` (`:306`). It reuses `collectIdentifiers` (`:568`), `reservedStem` (`:589`) and the scope walker `walkWithScope` (`:641`). `PassSummary` gains `declined?: { reason: SlowMoDeclineReason; message: string }` and `slowMo?: { arrayWords: number; tunables: string[] }`. A declining pass leaves `ctx.code` unchanged, following #937's declined-with-reason precedent. The pass appends its tunable globals to `metadata.runtimeVars` (`src/engine/loadPattern.ts:15`), so `setRuntimeVar` reaches them; the var watcher stays scoped to authored `patternVars`. `renderFns`, `controls`, `exportedVars` and `patternVars` stay as `bundle()` produced them.
- `src/components/Preview.tsx:176`: replace `bundle(previewSource, libraries)` with `bundleWithPasses(previewSource, libraries, previewRecipe)`. `previewRecipe` is `[]` unless `slowMoEnabled()` and the lab settings need the wrapper. With `[]`, `bundleWithPasses` returns `bundle()`'s `code`/`fxCode` unchanged (`passEngine.ts:149-151`). This is the "apply this list of transforms before running" hook; other preview transforms can join it later. `getSpeed` (`:349`) becomes `speed × (slowMo?.inBetween === 'clock' ? slowMo.rate : 1)`. A new effect pushes live tunables via `setRuntimeVar` without reloading. The rebuild key adds the wrapper's structure (`clock` vs blend family, persistence on/off), not its live values.
- `src/store/previewStore.ts`: a session-only field `slowMo: SlowMoSettings | null` (default `null`), with `setSlowMo`. It is not added to the persisted `partialize` set (`:142-148`) and not to `settingsCascade`. `window.__pxlblz.setPreview({ slowMo })` already reaches it (`Preview.tsx:535`).
- `src/dev/slowMoFlag.ts` (new): `slowMoEnabled()` reads `?slowmo=1`, mirroring `captureEnabled()` (`src/dev/previewCapture.ts:13`). Both the panel and the recipe are gated on it, so without the flag the preview is byte-identical to today even if a stale state exists.
- `src/components/SlowMoLab.tsx` (new), mounted in `PreviewDeck.tsx` next to `<SpeedSelector portaled />` (`:453`) when `slowMoEnabled()`. It has three groups (Tempo / In-between / After-effect), the refusal reason when the pass declines, array words against the VM budget, and Copy generated code. Lab labels only; product presentation is deferred (Jon, comment 4).
- `scripts/render-pattern.ts`: `--slowmo '<SlowMoSettings JSON>'` (adds `slowmo=1` to the URL and calls `setPreview({ slowMo })`) and `--fidelity fast|precise`, for the comparison renders.

### Generated wrapper skeleton

`__sm_` below stands for the reserved stem `reservedStem('slowmo')` = `__pxlblz_slowmo_`. The pass rewrites the bundled `code` (libraries already inlined), so calls inside library code are captured too. The wrapper uses only constructs the Show compiler already emits for the device (top-level `var`/`function`, `array`, `while`, ternaries, `exp`, `clamp`, `%`).

```js
// ── prelude: emitted BEFORE the Pattern so its top-level code can call time()/hsv()
var __sm_rate = 0.25, __sm_step = 16, __sm_curve = 1          // live: curve 0 hold, 1 blend, 2 eased
var __sm_shape = 0, __sm_width = 0                            // live: stagger (slice B)
var __sm_attack = 0, __sm_decay = 2000                        // live: persistence ms (slice C)
var __sm_T = 0        // Pattern clock in units of 65,536 ms: exact integer ms in 16.16
var __sm_acc = 0      // Pattern ms accumulated toward the next real frame
var __sm_f = 0        // blend fraction, __sm_acc / __sm_step, in [0, 1)
var __sm_phase = 0    // 0 = prime (first display frame), 1 = running
var __sm_cap = 0      // 1 on display frames that produce a new real frame
var __sm_r = 0, __sm_g = 0, __sm_b = 0
var __sm_ar = array(pixelCount), __sm_ag = array(pixelCount), __sm_ab = array(pixelCount)  // older real frame A
var __sm_br = array(pixelCount), __sm_bg = array(pixelCount), __sm_bb = array(pixelCount)  // newer real frame B
var __sm_pr = array(pixelCount), __sm_pg = array(pixelCount), __sm_pb = array(pixelCount)  // slice C: shown light, LED levels 0..255
var __sm_kUp = 1, __sm_kDn = 1

function __sm_time(interval) { return (__sm_T % interval) / interval }   // = frac(ms / (interval*65536)), no overflow in 16.16
function __sm_rgb(r, g, b) { __sm_r = clamp(r, 0, 1); __sm_g = clamp(g, 0, 1); __sm_b = clamp(b, 0, 1) }
function __sm_hsv(h, s, v) { /* six-sector HSV→RGB into __sm_r/g/b, clamped; parity-tested against the shim's hsv() */ }

// ── the Pattern's bundled source, rewritten (scope-aware, acorn):
//    callee time( → __sm_time(   rgb( → __sm_rgb(   hsv( and hsv24( → __sm_hsv(
//    export function beforeRender/render/render2D/render3D → function __sm_in_<name>, every reference renamed
//    everything else, including slider/picker exports and `export var`, untouched

// ── entry points: emitted AFTER the Pattern
export function beforeRender(delta) {
  __sm_cap = 0
  if (__sm_phase == 0) { __sm_in_beforeRender(0); __sm_cap = 1 }   // real frame 0
  else {
    __sm_acc += delta * __sm_rate
    var n = 0
    while (__sm_acc >= __sm_step && n < 4) {                         // catch-up cap: 4 real frames per display frame
      __sm_acc -= __sm_step
      __sm_T += __sm_step * 0.0000152587890625; if (__sm_T >= 16384) __sm_T -= 16384   // 1/65536 as a literal: 65536 itself overflows 16.16 to zero
      __sm_in_beforeRender(__sm_step); n += 1
    }
    if (__sm_acc >= __sm_step) __sm_acc = __sm_acc % __sm_step       // drop time beyond the cap
    __sm_cap = n > 0
  }
  __sm_f = __sm_acc / __sm_step
  __sm_kUp = __sm_attack > 0 ? 1 - exp(-delta / __sm_attack) : 1     // slice C, elapsed-time based
  __sm_kDn = __sm_decay > 0 ? 1 - exp(-delta / __sm_decay) : 1
}

function __sm_out(index, o) {                                        // o = stagger offset in [0, width)
  if (__sm_cap) {
    if (__sm_phase == 0) { /* A[i] = B[i] = captured */ } else { /* A[i] = B[i]; B[i] = captured */ }
  }
  var u = clamp((__sm_f - o) / (1 - __sm_width), 0, 1)
  var c = __sm_curve == 0 ? (u >= 1) : __sm_curve == 1 ? u : u * u * (3 - 2 * u)
  // per channel: x = A + (B - A) * c
  // slice C, per channel in LED levels: P += (255x - P) * (255x > P ? kUp : kDn); if abs(255x - P) < 1/64 then P = 255x
  rgb(/* x, or P / 255 with persistence */)
  if (index == pixelCount - 1) __sm_phase = 1
}

export function render2D(index, x, y) {          // one wrapper per entry point the Pattern defines
  if (__sm_cap) { __sm_r = 0; __sm_g = 0; __sm_b = 0; __sm_in_render2D(index, x, y) }   // no colour call = black, as the shim
  __sm_out(index, __sm_width * __sm_offset2D(index, x, y))
}
```

Contract points the skeleton encodes:

- **Real frames.** Real frame 0 is `beforeRender(0)` plus a render at T = 0. Real frame k ≥ 1 advances T by `stepMs` and calls the inner `beforeRender(stepMs)`. The Pattern always sees full-size steps, so delta-accumulating code cannot stall in 16.16. Real frames occur every `stepMs / rate` ms of display time, whatever the display rate, so the browser and a controller produce the same real-frame sequence. A per-frame Pattern runs at a nominal 1000/`stepMs` real frames per second times `rate`. That is a pace set in time, not in display frames; at 16 ms the nominal pace is 62.5 fps. Jon set about 60 fps as the outside edge; faster devices are not a design target.
- **Display.** The display shows `A + (B − A)·c(u)`, so it trails the newest real frame by one real frame in every in-between mode. `hold` therefore shows the same frames on the same schedule as `blend` and `eased`, without the crossfade. At `f = 0` all three modes show identical pixels.
- **Inner render cost.** The inner render runs only on display frames that produce a real frame. Pixel-local state in `render` advances once per real frame.
- **Clock.** `time()` is redirected only in the blend family. T wraps modulo 2^14 (12.4 days of Pattern time, 49.7 days of display time at 1/4). The phase of `time(i)` is continuous across the wrap when `i`'s 16.16 raw value is a power of two; otherwise it jumps once per wrap, the same class as the firmware's own clock wrap. Clock-of-day builtins (`clockHour` and the others) are not slowed (disclosed).
- **Stagger (slice B).** Each pixel has an offset `o ∈ [0, width)` and crossfades inside its own window `[o, o + 1 − width]` within the real-frame interval. Every pixel therefore shows B at the end of the interval and the new A at the start of the next, with no pop at boundaries. Offsets use the coordinates the renderer passes (after the Pattern's own transform stack):
  - `sweep`: `clamp(x, 0, 1)`, or `index / pixelCount` for `render`.
  - `radial`: distance from (0.5, 0.5[, 0.5]) normalized to [0, 1], or `abs(2·index/pixelCount − 1)` for `render`.
  - `scatter`: `(index · 40503/65536) % 1`, a golden-ratio sequence whose constant is exact in 16.16 (emitted as the literal `0.6180267333984375`, never as `40503/65536`: the literal 65536 overflows 16.16 to zero), so Fast and Precise offsets agree exactly.

  With `hold`, stagger gives a wipe.
- **Persistence (slice C).** Persistence is a per-channel attack/decay (phosphor) toward the in-between output. Its coefficients come from display-time delta, so it is frame-rate independent in time: `(1 − k)^(W/d) = e^(−W/τ)`. State is kept in LED levels (0–255) so the 16.16 product only stalls below 1/64 of an LED level, and a snap closes that gap. With `inBetween: 'clock'` plus persistence, the wrapper is pass-through: no clock redirect, no A/B arrays, the inner render runs live every display frame, and persistence is applied on top. The preview has already scaled `delta` by `rate` on this path, so the pass-through computes the persistence coefficients from `delta / rate`; attack and decay stay in display time on both structures.

### Refusal behaviour

`planSlowMo` refuses with one `SlowMoDeclineReason`. The pass then records `declined`, leaves `code` and `fxCode` byte-identical to `bundle()`, the preview keeps running the unwrapped Pattern, and the lab shows the reason.

| Reason | Condition |
| --- | --- |
| `palette-output` | calls `paint(` or `setPalette(` (3 stock Patterns: FastPaletteBlending, NebulaSphere, PlasmaNebula; AuroraSphere names `paint()` only in a comment and calls `rgb()`, so it wraps). Palette capture is a follow-up. |
| `no-renderer` | defines none of `render`, `render2D`, `render3D`. |
| `shadowed-builtin` | declares a top-level binding named `time`, `rgb`, `hsv` or `hsv24`. Local shadowing is respected and not rewritten. |
| `reserved-prefix` | an authored identifier starts with `__pxlblz_slowmo_`. |
| `array-budget` | wrapper words exceed `PIXELBLAZE_VM_ARRAY_WORDS` (10,240; `src/engine/showVmResourceLedger.ts:4`), at 4 header words per array. Blend family: 6N + 24 (N ≤ 1,702); with persistence: 9N + 36 (N ≤ 1,133); persistence-only: 3N + 12 (N ≤ 3,409). A 16×16 matrix uses 1,560 or 2,340 words. The Pattern's own arrays are not counted (residual; the hardware paste checks it). |

A source that fails to parse or bundle never reaches the pass; the preview's existing error path applies.

### Preserved invariants

- Push path untouched: `controllerStore.ts:1363` and `controllerProfilePassRecipe` do not read `slowMo`. Hardware-bound Patterns stay plain code.
- Gallery thumbnails (`previewThumbnail.ts`), Show stage preview and fast replay are not routed through the preview recipe.
- No D1 or localStorage writes for lab state.

### Decisions (Jon, 2026-10-27)

Recorded verbatim in the comments.

1. **Real-frame step:** 16 ms default (about 60 fps nominal, "60 as an outside edge"); lab stops 16 and 32 ms. The session read Jon's "60 milliseconds" as 60 fps; if Jon meant a 60 ms step, correct this before #1236 starts.
2. **Persistence colour model:** per-channel attack/decay (phosphor).
3. **Palette Patterns:** refused in v1.
4. **Tracking:** epic #1235, with children #1229 (definition), #1236, #1237 and #1238.
5. **Lab panel:** no mock-up; the rendering plus simple controls such as a drop-down.

## Limits

- Preview only, Patterns only, behind `?slowmo=1`. Shows, push, Controller-profile fields and toolbar overrides are later work.
- Slow only: `rate ≤ 1`. Time dilation (roadmap 4), spatial blur and feedback melt (roadmap 5) are out of scope.
- No product presentation, Feature Guide entry or CONTEXT.md term until Jon has seen the modes.
- Show compiler output untouched: the slow-mo HSV emitter is its own copy, parity-tested against the shim, not extracted from `emitMemberHsvSink`.
- #1234 (match device frame rate) and LED brightness-step simulation are separate.

## Acceptance criteria

- [ ] Without `?slowmo=1` the Pattern editor shows no lab, and the preview's `code`/`fxCode` are byte-identical to `bundle()` for every stock Pattern.
- [ ] With the flag, the lab drives `clock`, `hold`, `blend` and `eased` at every rate stop in Fast and Precise. Switching among `hold`/`blend`/`eased`, rate, step, stagger and persistence dials does not restart the Pattern.
- [ ] Wrapped real frames equal the unwrapped Pattern stepped at `stepMs`, and the real-frame sequence is independent of display rate (Tests I2, I3).
- [ ] A delta-accumulating Pattern advances at 1/32 in Precise under the blend family, while the `clock` baseline shows the stall (Test I5).
- [ ] Slice B: stagger shapes sweep, radiate and scatter with no pop at real-frame boundaries.
- [ ] Slice C: persistence attack and decay are set in elapsed time, reach the target in Precise, and give haze (slow/slow) and trails (fast/slow).
- [ ] Every refusal reason shows in the lab while the unwrapped Pattern keeps running.
- [ ] Copy generated code yields code that compiles and runs on Jon's 16×16 matrix and matches the preview side by side.
- [ ] Every stock Pattern wraps or declines with a named reason; only the three palette Patterns decline.
- [ ] Jon's verdict on the comparison renders and the matrix check is recorded here.

## Required proof

- **Browser proof (UI proof gate).** Pattern editor at `http://Agent-Mini.local:5174/PXLBLZ-IDE/?slowmo=1`, committed under `.wrsp/ui-proof`:
  - the lab panel at desktop and narrow width;
  - a refusal shown on a palette Pattern;
  - the same route without the flag (no panel);
  - no console errors.
- **Comparison renders** (`npm run render -- --file … --fps 60 --fidelity precise --slowmo '…'`) on the 16×16 map:
  - three Patterns: KaleidoBloom (`time()`-driven), WavyBands (delta-accumulating) and a committed per-frame sparkle fixture (one `random()` pixel per frame, per-frame fade, no `delta`);
  - each at full speed, and at 1/4 and 1/16 under `clock`, `hold`, `blend` and `eased`;
  - slice B adds `sweep` and `scatter` at width 0.5;
  - slice C adds haze (1,500/1,500 ms) and trails (0/2,000 ms) at 1/4.
- **Matrix side by side.** Jon pastes Copy generated code for the sparkle fixture and KaleidoBloom at 1/4 and 1/16 `blend` onto the matrix at desk brightness, filmed next to the preview. Record:
  - that the device compiles and runs it (array use: 1,560 or 2,340 words);
  - device FPS wrapped vs unwrapped;
  - whether low-brightness fades step;
  - Jon's verdict, verbatim.

## Tests

Designed with `systematic-test-design`. Oracle surface: pixels from the wrapped artifact the preview runs, executed through `createFastReplayRuntime` (`src/engine/fastReplay.ts:342`) with `PreparedFastReplay` built from `bundleWithPasses` output, in `fidelity: 'fast'` and `'fidelity'`, using `advanceLive(d)` as the display frame. Source-text assertions are diagnostics only. Synthetic fixtures carry the exact oracles; stock Patterns carry the sweep. Tolerance: exact where stated; otherwise ≤ 2⁻¹⁰ per channel in Fast and ≤ 2⁻⁸ in Precise.

Partitions:

- in-between: `clock` / `hold` / `blend` / `eased`
- rate: 1, 1/4, 1/32
- display delta d: 4, 5, 8, 16, 16.67, 32, 100 ms
- fidelity: Fast / Precise
- entry point: `render` / `render2D` / `render3D` / several
- output sink: `rgb` / `hsv` / `hsv24` / none
- persistence: off / on, τ = 0 / small / large
- stagger: width 0 / > 0 × shape

Must-test cases (the floor):

- **I1 Off identity.** Without the flag, or with `slowMo: null`, `code`/`fxCode` are byte-identical to `bundle()` for every stock Pattern. With `clock` and no persistence the recipe is empty and `getSpeed` = speed × rate.
- **I2 Real-frame fidelity** (`hold`, every entry point and sink, both modes). The display at each `f = 0` frame equals the unwrapped Pattern's frame k−1, where the unwrapped run is `advanceLive(stepMs)` from `advanceLive(0)`, whenever that display frame ran exactly one real frame. At a catch-up (one display frame running two or more real frames), every real frame's `beforeRender` still runs once, in order, and the display blends the two latest captures; the real frames in between are skipped on screen, like a dropped frame. There is no extra render pass (Jon, 2026-10-28, #1236). The fixtures cover `rgb()` and `hsv()` patterns and a `time()`-driven one. The `rgb()`-only, clock-free fixture (values within [0, 1]) is exact in Fast.
- **I3 Display-rate independence.** At rate 1/4 and step 16, with d ∈ {4, 8, 16, 32}, the pixels at display time m·64 ms are identical across d in both modes. At d = 16.67 the real-frame count after W ms is ⌊W·rate/step⌋ ± 1.
- **I4 Per-frame pace.** A counter fixture (incremented each `beforeRender`, no `delta`) advances ⌊W·rate/step⌋ times. Characterization: under `clock` it advances W/d times whatever the rate.
- **I5 No fixed-point stall.** `phase += delta/1000 * 0.05` at rate 1/32, d = 5, Precise: in the blend family the phase is within 2% of W·rate·0.05/1000; under the `clock` baseline the error exceeds 10% (stall or drift). This is the characterization of the issue's failure.
- **I6 Blend geometry.** A two-colour fixture alternates red/blue each real frame (via `rgb` and via `hsv`), sampled at f ∈ {0, 0.25, 0.5, 0.75}:
  - `hold` = A;
  - `blend` = A + (B−A)·f;
  - `eased` = smoothstep;
  - every channel lies within [min(A,B), max(A,B)];
  - the red/blue midpoint has green = 0, never the HSV path through green.
- **I7 Boundary continuity** (`blend`/`eased`). Consecutive display frames across a real-frame boundary differ by at most the per-frame blend step times |B−A|.
- **I8 Stagger** (slice B):
  - width 0 is identical to unstaggered;
  - each pixel's u is monotone in f, 0 at f ≤ o and 1 at f ≥ o + 1 − width;
  - at mid-interval `sweep` progress is non-increasing in x;
  - `scatter` offsets are identical in Fast and Precise and lie in [0, width);
  - the I7 boundary continuity holds with stagger.
- **I9 Persistence** (slice C):
  - a step 0→1 reaches 1 − e⁻¹ ± 2% at t = attack, and 1→0 reaches e⁻¹ ± 2% at t = decay;
  - the value at wall time W agrees across d ∈ {5, 16, 33} within 1/255;
  - Precise at d = 5, decay 10 s reaches ≤ 1/255 within 7 τ (no stall);
  - τ = 0 is pass-through within tolerance;
  - output stays within the input's range;
  - d = 0 (paused) leaves output unchanged;
  - persistence-only over `clock` matches the live Pattern with τ = 0.
- **I10 Clock wrap.** With a test-only initial T just below 2¹⁴, the run crosses the wrap in Precise:
  - T stays in [0, 2¹⁴);
  - no NaN or overflow;
  - `time(0.25)` and `time(1)` stay continuous;
  - `time(0.1)` stays finite.
- **I11 Metadata and controls.**
  - Wrapping leaves `renderFns`, `controls`, `exportedVars` and `patternVars` unchanged, and the tunables appear in `runtimeVars`.
  - A slider still changes wrapped output.
  - `setRuntimeVar` on each tunable changes output without reload.
- **I12 Refusals**, one row per reason, including the budget edges 1,702 accepted / 1,703 refused and 1,133 / 1,134. Each refusal leaves `code`/`fxCode` byte-identical, records the reason in `summary`, and keeps the preview running (component test).
- **I13 Scope-aware rewrite.**
  - Not rewritten: a parameter or local named `hsv`/`time`.
  - Rewritten: calls inside inlined library code; `hsv24` (captured like `hsv`).
  - A sink called from `beforeRender` is harmless.
  - An entry point referenced by another (`render3D` calling `render2D`) still works.
- **I14 Catch-up cap.** At d = 100 and rate 1, step 16: at most 4 inner `beforeRender` calls per display frame, and `acc < step` afterwards.
- **I15 HSV parity.** The emitted `__sm_hsv` matches the shim's `hsv()` over a grid including h < 0, h > 1, s and v outside [0, 1], in both modes.
- **I16 Stock sweep.** Every stock Pattern wraps or declines with a reason; only the three palette Patterns decline. Each wrapped one runs 120 display frames at 1/4 `blend` (plus persistence in slice C) in both modes with finite output in [0, 1].
- **I17 Push isolation.** With `slowMo` active in the preview store, the push artifact from `controllerProfilePassRecipe` + `bundleWithPasses` is byte-identical to the artifact with `slowMo: null`.
- **I18 Lifecycle** (Playwright, `e2e/slowmo.spec.ts`):
  - a source edit or Pattern switch re-primes, so the first frame shows the new frame 0 with no stale A/B;
  - a live tunable change does not reset `getElapsedMs`/T;
  - the flag absent hides the panel.

Residual gaps, left to review and the hardware check: firmware parity of the emitted HSV conversion and of `exp`; memory used by the Pattern's own arrays; the look on LEDs vs screen; device FPS.

## Docs impact

- Technical Reference §6 (Pass engine): the `slowmo` pass kind, the `declined` summary and the wrapper clock contract, marked lab/flagged.
- Technical Reference §9 (frame loop): the preview recipe hook and `getSpeed` composition.
- Technical Reference §31: the per-frame nominal-pace and clock-wrap disclosures.
- `docs/reference/Pixelblaze device behaviour notes.md`: only if the matrix shows fade stepping or a compile or memory surprise.
- Feature Guide and CONTEXT.md: none while flagged.
- No current engineering contract under `docs/reference/contracts/` governs the preview recipe; the Show command and persistence contracts are not touched.

## Progress

- 2026-10-26: analysis recorded (this body).
- 2026-10-27: scope decisions and roadmap recorded in comments; design notes for the first version added; handoff written.
- 2026-10-27: implementation-ready spec for roadmap items 1–3 written (principal-engineer session, at `dfa2211a`); awaiting Jon's approval.
- 2026-10-27: Jon approved the spec and decided the five points (comment); epic #1235 and implementation children #1236, #1237 and #1238 created and attached as native sub-issues.

## Handoff (2026-10-27)

Owner: none; the principal-engineer session has finished. Jon is taking this to the eng lead to plan a lane.

- **Next step:** a developer claims #1236 (slice A). The brief includes this Spec section at the current body revision, Jon's decisions comment, #1236's Tests floor and its Required proof. #1237 and #1238 follow once #1236 lands.
- **Matrix check:** the proof needs Jon at the 16×16 matrix for the pasted side by side; schedule it when #1236 has comparison renders.
- **Open item:** confirm decision 1's reading (60 fps, not a 60 ms step) with Jon if the brief is in doubt.

## Blocked by

Nothing. The spec is approved; build order is in epic #1235.





