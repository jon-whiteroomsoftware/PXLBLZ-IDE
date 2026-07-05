# PXLBLZ v2 Direction — Conversation Handoff

**Purpose:** Distills a strategy/design conversation (claude.ai, July 2026) into repo context
for continued work in Claude Code. Companion to two existing plan docs, which this document
comments on but does not replace:

- `docs/plans/hardware-control-injection-prd.md` (build-ready PRD)
- `docs/plans/pixelblaze-pattern-orchestration-software-ideas.md` (pre-PRD idea capture)

Where this doc disagrees with the code or those docs, treat this as *review input*, not authority.

---

## 1. Context: 1.0 retrospective (forum launch post-mortem)

The 1.0 launch post on forum.electromage.com received near-zero engagement. Analysis
(facts vs. interpretation separated):

**Facts**
- The forum is small and slow; the closest comparable (Tarball's browser emulator, ~2 months
  prior) drew ~6 replies / 4 likes over six weeks.
- The launch post led with a feature list, used only static screenshots (no motion), had two
  different app URLs across post and README, and asked no specific question of readers.
- The forum audience skews hardware builders / pattern *consumers*, not pattern *developers*.

**Conclusions (interpretation)**
1. Low engagement ≠ "no value." Real signal is usage analytics (launches, return visits) —
   still to be checked.
2. The addressable audience for an *IDE* is a small subset of a small community. The features
   with broad appeal are the ones consumable by non-developers: **patterns themselves, and
   (future) orchestration/adaptation of patterns without coding.**
3. 2.0 launch playbook: lead with a 10-second GIF of the best ShaderToy port; one link/CTA;
   drip patterns as individual Show-and-Tell posts crediting PXLBLZ; ask a specific question;
   seed the thread by recruiting 3–5 known power users pre-launch.

This retro directly motivates the v2 feature direction: shift value from "editor for authors"
toward "compositor/adapter for consumers."

## 2. The strategic core: one transpiler pipeline, not three features

The planned features — hardware control injection, universal brightness, and pattern
orchestration — are all instances of one pipeline:

```
parse (Acorn) → namespace/rename → passes[] → merge → emit + transform summary
```

**Pass taxonomy (proposed vocabulary):**

| Pass | Does | Used by |
|---|---|---|
| inject | prepend vars/exports; wrap or synthesize `beforeRender` | HW controls, sensors, scheduling |
| intercept | rewrite output-sink call sites (`hsv`/`hsv24`/`rgb`/`paint`) to wrappers | brightness, power cap, palette remap, gamma |
| bind | call exported slider fn / assign named var (min/max/quantize) | HW pots → pattern controls |
| route | gate render by index range / named segment | segment routing |
| blend | transition mixer between two renderers | crossfades, wipes |

**Key recommendation:** implement the HW-injection PRD's transform engine as this *generic,
recipe-driven pass engine* (pure engine module, no React, per existing architecture), not a
bespoke `hw` module. The HW manifest and a future orchestration recipe are two front-ends
emitting pass lists. HW injection then becomes the v1 proof of the engine, and orchestration
reuses ~all of it.

## 3. Review notes: Hardware Control Injection PRD

**Endorsed as-is:** call-site rewriting over built-in aliasing; arity-specific `paint`
wrappers; `beforeRender` wrap-not-replace; manifest-first; native brightness as safety cap;
pure engine + behavior-level tests.

**Additions requested:**
1. **ADC pin validation (verify in spike):** on ESP32, ADC2 pins are unusable while WiFi is
   active (always true on Pixelblaze). Manifest pin vocabulary should validate against
   usable ADC1 pins per board variant; docs must warn.
2. **Floating-input guard needs a concrete design**, not just a spike question: manifest
   `deadband`, plus a fallback heuristic for rail-pinned / high-variance readings.
3. **Add `power-cap` to the manifest `role:` enum** (or design the enum to admit it later):
   same output-sink wrapper machinery; estimates/limits total current draw. High practical
   value for battery and undersized-PSU installs.
4. **Transform summary should include an estimated per-pixel cost delta** — seed of the cost
   model orchestration will need.

## 4. Review notes: Orchestration ideas doc

**Highest value ÷ effort (do first):** generated show pattern with 2 clips + crossfade;
segment routing to named zones; post-processing transforms (palette swap, brightness
envelope, posterize).

**Pushback / decisions proposed:**
1. **Defer the fluent DSL.** v1 recipe is JSON/YAML (`clips`, `transitions`, `routes`),
   consistent with manifest-first. The Strudel/Tone.js-style API compiles *to* the recipe later.
2. **Time-slicing is the default emission strategy:** steady-state runs only the active
   clip's `beforeRender`/render; both renderers evaluate only during a transition window.
   Halves steady-state cost vs. always-both.
3. **State namespacing is the hard 20% and needs its own design note before any prototype:**
   alpha-renaming all globals/`t`/exported controls across N merged patterns; semantics of N
   `beforeRender` time bases under pause/resume (freeze vs. advance).
4. **Park for later (separate projects):** low-res wash sampling, geometric pattern language.

## 5. Adjacent feature ideas surfaced (ranked, not yet in any PRD)

1. **Power/current limiter** (intercept) — see §3.3.
2. **Sensor-board mixins** (inject) — make any unmodified pattern sound-reactive via the
   sensor expansion globals; strong demo/marketing value ("make any pattern dance").
3. **Color-pipeline mixins** (intercept) — gamma, color temperature, saturation limit,
   global palette remap (WLED-parity appeal).
4. **Scheduling mixin** (inject) — time-of-day dim/off behavior compiled in.
5. **Minification / dead-code elimination** — an *enabler* for orchestration (device code-size
   limits with N folded patterns), not a nice-to-have.
6. **Compile-time precomputation** — bake LUTs (wavetables, palettes, easing) into arrays;
   real FPS lever on fixed-point hardware; pairs with ShaderToy ports.
7. **Debug instrumentation pass** — auto-inject per-section timing / watch counters
   (automates the "caveman profiler"); only profiling story on the platform.
8. **Auto-generated master UI** when composing patterns (sliders/toggles from exported vars).

## 6. Consolidated research spike (supersedes PRD list)

Existing tooling makes most of this cheap: divergence harness (`test/divergence-harness/`)
and hardware perf microbenchmark (`test/perf-harness/`).

1. `analogRead`/pin API; confirm ADC1-only-under-WiFi constraint (hardware).
2. Rename/wrap exported `beforeRender`; call exported sliders from injected code; assign to
   `export var` from injected code (emulator + hardware).
3. Wrapper-indirection cost: `__pxlblz_hw_hsv` vs direct `hsv`, per-pixel (perf harness —
   runnable now, no new hardware work).
4. **Device budgets:** max pattern code size, global/array count limits, exported-control
   limit → determines clips-per-show ceiling.
5. **Two real renderers merged:** steady-state FPS, time-sliced vs. both-running, on a
   300–1000 pixel rig.
6. Floating-ADC behavior characterization → informs §3.2 guard design.
7. (From PRD, retained) built-in aliasing/shadowing viability; optional-arg semantics;
   `hsv`/`hsv24`/`rgb`/`paint` wrapper correctness on hardware.

## 7. Open questions

- What do 1.0 usage analytics actually show (launches, retention)? Gates how much the retro
  conclusions should steer prioritization.
- Manifest/recipe file format final shape (YAML vs JSON; where stored per environment —
  localhost workspace file vs D1-backed for GitHub Pages users).
- Clip time-base semantics on pause/resume (see §4.3).
- How the pass engine's transform summary and cost model surface in UI (debug affordance v1).

## 8. Proposed next steps (in order)

1. Spec the **pass engine** module: recipe IR + pass interfaces reconciling both plan docs.
2. Run spike items **3–5** via the perf harness.
3. Write the **state-namespacing design note** (pre-req for orchestration prototype).
4. Implement HW injection per PRD *on top of* the pass engine (build path: spike → manifest
   schema/parser → engine → artifact inspection → Send-to-Controller integration → hardware
   brightness verification → per-pattern binding → docs).
5. Revisit orchestration PRD-ification once 1–4 land.
