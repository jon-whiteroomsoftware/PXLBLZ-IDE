# Feature PRD — Hardware-Fidelity Preview & ShaderToy Porting

**Status:** **shipped.** The 16.16 fixed-point "Precise" renderer, the `Shader` library, the porting guide, and the demo overhaul are all in. For *how it works as built* see **`docs/REFERENCE.md`** §8 (fixed-point engine), §14 (libraries & demos), and the porting guide at `docs/guides/Porting ShaderToy shaders to Pixelblaze.md`. This PRD is retained for the **why** — the conceptual framing and the decisions that shaped the work.
**Type:** Feature PRD (companion to `Pixelblaze IDE v2 PRD.md`)
**Supersedes:** ADR-0001 (via ADR-0003)
**Related:** ADR-0002 (main-thread execution), ADR-0003 (fixed-point fidelity default)

---

## Summary

This feature makes the IDE preview **faithful to Pixelblaze hardware's 16.16 fixed-point arithmetic** and then builds a **GLSL/ShaderToy porting toolkit** (a `Shader` library + a porting guide) on top of that faithful base. The two are sequenced deliberately: porting is only worth doing if a pattern that looks right in the preview actually survives upload to a device, and the most common GLSL idioms break on hardware in ways a float64 preview cannot show.

The hardware-fidelity work (the Precise renderer + a Fast float64 escape hatch) benefits **every** pattern, not just ports; the `Shader` library and guide are porting-specific. The implementation — the `fx.*` operators, the fixed-point emit, the per-function shim seam, the divergence harness, and the committed divergence report — is described in `docs/REFERENCE.md` §8 and §16.

---

## Goals

- A designer can trust the preview: **what the preview shows is what the hardware does**, for the numeric domain (range, precision, overflow), within documented exceptions.
- A Pixelblaze user who finds a ShaderToy shader can get it running on their LEDs by following a guide, with a library that absorbs the mechanical parts of the port.
- The existing shader-style demos run correctly on real hardware and become worked references for the porting workflow.

## Non-goals

- **Automated GLSL→Pixelblaze transpilation.** Porting remains human-driven with library support; the deferred "Shader import" idea in the main PRD is *not* what this feature delivers.
- **Bit-exact firmware built-ins.** `perlin`, `prng`, `wave`, and transcendental LUTs are not reverse-engineered to match firmware bit-for-bit (see Divergence, below).
- **Porting GPU-only features.** Textures/`iChannel`, multipass feedback buffers, derivatives (`dFdx`/`fwidth`), `discard`, MRT are out of scope and documented as non-portable.
- **3D / `render3D` porting.** Follows the main PRD's 3D deferral. (Note: 3D *preview* has since shipped via the Pixel Maps feature; porting GLSL specifically into 3D patterns remains out of scope for the guide.)

---

## Background: two independent divergences

This is the central idea the whole feature rests on. WYSIWYG-on-hardware has **two** gaps, and they are independent:

1. **Numeric divergence** — float64 vs 16.16 fixed-point (range ±32768, precision 1/65536, int32-wrap overflow, bitwise ops over the raw 32 bits). **The fixed-point engine closes this.**
2. **Algorithmic divergence** — the runtime shim implements `perlin` as Ken Perlin's 2002 reference (explicitly "not bit-identical to firmware") and `prng` as mulberry32, which are *different algorithms* than the firmware's. Even in perfect fixed-point these return different values. The engine **does not** close this; it is documented and, where it matters, designed around.

A consequence used throughout the porting work: the only constructs that are bit-identical on both sides once fixed-point + overflow match are **pure arithmetic ops** (no `sin`, no `perlin`). So fidelity-critical hashing is built from integer arithmetic, not from `sin`-based or `perlin`/`prng`-based constructs. (This is why the `Shader` hash helpers `hash21`/`hash11` are integer-only — validated bit-identical on a real device, #103/#113.)

Overflow semantics were the key open risk, now **resolved**: the committed divergence harness confirmed against a real device (fw 3.67) that overflow **wraps** (int32, not saturating), multiply/`frac`/`%` **truncate**, and bitwise ops integer-coerce their operands first. See ADR-0003 and `docs/REFERENCE.md` §8.4 for the confirmed table and the residual accepted divergences.

### Critique of the prior porting notes (decision record)

A previous AI-authored porting document (`GLSL to Pixelblaze porting.md`) informed this work but was validated skeptically. Findings that shaped the shipped guide and library:

- **Correct:** unroll vectors to scalars (arrays are the only dynamic allocation and can't be freed); use `beforeRender` for per-frame uniforms; accumulate `t += delta*0.001` for `iTime`; polyfill `step`; provide a floor-based `fract`.
- **Wrong/outdated:** it polyfills `mix`, `smoothstep`, and `clamp` — all three are Pixelblaze **built-ins** already, with GLSL-matching signatures. The `Shader` library deliberately does **not** re-polyfill them.
- **Naming collision:** Pixelblaze ships `frac` (truncate-based); a GLSL floor-based `fract` is a distinct, namespaced name (`Shader.fract`).
- **Dangerously omitted:** the 16.16 overflow cliff (the central porting hazard) and aspect-ratio correction — both are headline gotchas in the guide.

---

## Deferred / open

- **Per-built-in firmware-matched LUTs.** The fixed-point shim's per-function seam was designed so a firmware-matched LUT can later replace `fx.sin` etc. — **only for functions the divergence harness flags as visibly wrong.** None have proven necessary yet; the hook remains.
- **True non-square aspect correction** — the two explicit ports route through `Shader.toUV(x, y, aspect)` but `aspect` is hardcoded to `1` because the preview normalises per-axis and exposes no `cols`/`rows` built-in. Tracked in **#116** (also a hardware-divergence fix, since firmware fits the longest axis to 0..1).
- **Automated GLSL rewrite** — remains a non-goal / research idea (see main PRD Deferred).
