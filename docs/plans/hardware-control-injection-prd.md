# Hardware Control Injection PRD

## Problem Statement

Pixelblaze hardware is often installed in a physical enclosure where the user wants direct tactile controls: a button to change patterns, a potentiometer for brightness, or another knob for speed, density, palette, or another pattern-specific value. Pixelblaze already supports a pattern-change button on dedicated pads, but a hardware brightness knob or assignable control normally requires editing each pattern's source.

That is the wrong ownership boundary for PXLBLZ-IDE. Many patterns are stock examples, ShaderToy ports, third-party imports, or reusable personal patterns that should remain portable and source-visible. Hardware-specific wiring should belong to a Controller configuration, not be permanently baked into every pattern the user edits.

The feature should let a user say:

- This Controller has a potentiometer connected to this analog input.
- Use that potentiometer as a hardware brightness control for every pattern I push to this Controller.
- For this specific pattern, map a hardware potentiometer to `sliderSpeed`, `speed`, or another explicit pattern control.
- Keep the original pattern source clean; generate the hardware-aware artifact only when pushing to that Controller.

The first implementation should be manifest-driven rather than UI-driven. The UI for Controller entities, hardware profiles, and control bindings will evolve once the generated-code model has proven itself.

## Solution

PXLBLZ-IDE will introduce a hardware control injection pipeline that combines:

1. The original pattern source.
2. The normal transpiled artifact for that pattern.
3. A hardware-control manifest describing a Controller's physical inputs and optional per-pattern bindings.
4. A deploy-time transform that emits a generated hardware-aware artifact plus a human-readable transform summary.

The generated artifact is what gets sent to the Pixelblaze Controller. The original pattern remains unchanged in the editor, stock catalogue, personal workspace files, and exported source.

The first target is physical brightness. A potentiometer connected to an analog input should multiply the pattern's output brightness without relying on the Controller's native Web UI brightness. Native Pixelblaze brightness remains the hard safety cap; hardware injection can only dim or shape the pattern output inside that cap.

The second target is explicit pattern binding. If a pattern already has an exported slider function such as `sliderSpeed(v)`, or a variable such as `speed`, a manifest should be able to map a hardware pot to that control without editing the pattern source.

## Strategic Themes

1. Hardware configuration belongs to the Controller, not the pattern.

   A pattern should be portable. A Controller profile describes the physical box: pixel count, installed map, analog inputs, switches, and bindings. A pattern may have optional Controller-specific bindings, but those bindings are not intrinsic to the pattern.

2. Manifest first, UI later.

   The early product should be driven by a text manifest. This keeps the feature inspectable while we learn the right abstractions. A future UI can be layered over the manifest once the model stabilizes.

3. Generated code must be inspectable.

   The transform should emit a summary of what changed: which outputs were wrapped, whether `beforeRender` was injected or wrapped, which pots were read, and which pattern controls were called or assigned.

4. Prefer explicit mappings over inference.

   The system should not guess that a variable named `speed` should be hardware-bound. The manifest should say so. Inference can support validation and suggestions later.

5. Use the pattern's own control logic when available.

   Exported slider functions are the best binding target because pattern authors already encoded scaling, clamping, quantization, and taste there.

6. Avoid hidden runtime tricks when source rewriting is clearer.

   Rewriting output call sites to generated wrapper functions is preferable to shadowing or aliasing Pixelblaze built-ins unless a research spike proves aliasing is safe and substantially better.

## User Stories

1. As a hardware builder, I want to wire a physical potentiometer to a Controller and use it as brightness, so that my enclosure has a real brightness knob.
2. As a hardware builder, I want hardware brightness to apply across every pattern I push to that Controller, so that I do not have to edit each pattern by hand.
3. As a pattern author, I want my original pattern source to stay unchanged, so that it remains portable and easy to share.
4. As a PXLBLZ-IDE user, I want native Pixelblaze brightness to remain the safety cap, so that injected brightness cannot accidentally exceed the Controller's configured output limit.
5. As a user testing hardware injection, I want to inspect the generated artifact, so that I can understand exactly what will run on hardware.
6. As a user testing hardware injection, I want a transform summary, so that I can quickly see whether brightness, `beforeRender`, and control bindings were applied.
7. As a user with a speed knob, I want to map a physical pot to a pattern's existing `sliderSpeed(v)` function, so that the pattern's own scaling logic is reused.
8. As a user with a pattern variable, I want to map a physical pot to a variable such as `speed`, so that I can hardware-control patterns that do not expose sliders.
9. As a user with multiple Controllers, I want hardware mappings to be Controller-specific, so that different physical boxes can have different controls.
10. As a user on localhost, I want the manifest to be a normal workspace file, so that I can edit it with code tools while developing.
11. As a user on GitHub Pages, I want the feature to degrade cleanly if no manifest-backed hardware profile is available, so that normal pattern pushes still work.
12. As a maintainer, I want the transform engine to be pure and tested, so that hardware code generation is reliable without needing a Controller for every test.
13. As a maintainer, I want a research spike to confirm Pixelblaze dialect constraints, so that we do not design around invalid generated code.
14. As a maintainer, I want unsupported output APIs to be reported, so that a pattern is not silently pushed with partial brightness coverage.
15. As a maintainer, I want collisions with user-defined names avoided, so that generated helper code does not break existing patterns.
16. As a maintainer, I want `beforeRender` wrapping to preserve user behavior, so that injected hardware reads do not erase pattern animation logic.
17. As a future UI designer, I want a stable manifest and transform summary model, so that a Controller-profile UI can be built on top later.

## Core Concepts

### Hardware Control Manifest

The manifest describes a Controller's physical controls and how they should affect pushed patterns. It is the first durable interface for this feature.

Conceptual shape:

```yaml
controllers:
  workshop-box:
    hardware:
      pot0:
        pin: A0
        role: brightness
        smoothing: 0.1
        fallback: 1
        invert: false
      pot1:
        pin: A1
        role: assignable
        smoothing: 0.1
        fallback: 0

    globalTransforms:
      brightness:
        source: pot0
        mode: multiply-output

    patterns:
      aurora-drift:
        controls:
          pot1:
            call: sliderSpeed

      color-fields:
        controls:
          pot1:
            assign: paletteIndex
            min: 0
            max: 6
            quantize: true
```

The exact file format may change during implementation, but these concepts should remain:

- Controller identity.
- Hardware input definitions.
- Global transforms such as brightness.
- Per-pattern bindings.
- Smoothing/fallback/invert behavior.
- Explicit target mode: call function or assign variable.

### Output Sinks

Pixelblaze color functions are output sinks. They do not return a color value; they set the current pixel's output while a render function is running.

Supported output sinks for brightness injection should include:

- `hsv(h, s, v)`
- `hsv24(h, s, v)`
- `rgb(r, g, b)`
- `paint(value)`
- `paint(value, brightness)`

`hsv` and `hsv24` accept hue/saturation/value and convert internally to RGB. `hsv` may use extra brightness resolution on supported LEDs; therefore the transform should preserve `hsv` calls as `hsv` calls through a wrapper instead of converting them to RGB.

`rgb` directly sets red, green, and blue channels.

`paint` samples the current palette set by `setPalette(...)`, interpolates RGB from the palette, and optionally accepts a brightness argument. For generated code, arity-specific wrappers are safer than relying on optional-argument or `undefined` semantics:

```js
paint(p)    -> __pxlblz_hw_paint1(p)
paint(p, b) -> __pxlblz_hw_paint2(p, b)
```

### Effective Brightness

For physical brightness injection, effective output is:

```text
native Pixelblaze brightness cap
  * pattern's own output value
  * injected software brightness slider
  * physical pot value
```

Native Pixelblaze brightness is not replaced. It remains the safety cap controlled by the Controller panel or native Pixelblaze UI.

Generated helper shape:

```js
var __pxlblz_hw_uiBrightness = 1
var __pxlblz_hw_pot0 = 1
var __pxlblz_hw_effectiveBrightness = 1

export function sliderHardwareBrightness(v) {
  __pxlblz_hw_uiBrightness = v
}

function __pxlblz_hw_hsv(h, s, v) {
  hsv(h, s, v * __pxlblz_hw_effectiveBrightness)
}

function __pxlblz_hw_hsv24(h, s, v) {
  hsv24(h, s, v * __pxlblz_hw_effectiveBrightness)
}

function __pxlblz_hw_rgb(r, g, b) {
  rgb(
    r * __pxlblz_hw_effectiveBrightness,
    g * __pxlblz_hw_effectiveBrightness,
    b * __pxlblz_hw_effectiveBrightness
  )
}

function __pxlblz_hw_paint1(p) {
  paint(p, __pxlblz_hw_effectiveBrightness)
}

function __pxlblz_hw_paint2(p, b) {
  paint(p, b * __pxlblz_hw_effectiveBrightness)
}
```

The exact analog-read call is intentionally not specified yet. It must be confirmed in the research spike.

### `beforeRender` Wrapping

Hardware controls should be sampled once per frame, not once per pixel. The transform should therefore inject or wrap `beforeRender(delta)`.

If the pattern has no `beforeRender`, generate one:

```js
export function beforeRender(delta) {
  __pxlblz_hw_readControls(delta)
}
```

If the pattern already has `beforeRender`, preserve it:

```js
function __pxlblz_hw_user_beforeRender(delta) {
  // original beforeRender body
}

export function beforeRender(delta) {
  __pxlblz_hw_readControls(delta)
  __pxlblz_hw_user_beforeRender(delta)
}
```

The research spike must confirm that this generated shape is valid Pixelblaze code after transpilation and upload.

### Per-Pattern Binding

Preferred mapping order:

1. Call an exported slider function such as `sliderSpeed(v)`.
2. Call an explicit pattern function named in the manifest.
3. Assign a named variable using explicit min/max/quantize mapping.
4. Apply a global output wrapper.
5. Avoid deep expression rewriting unless a later feature explicitly needs it.

Calling an existing slider is ideal:

```js
export function sliderSpeed(v) {
  speed = mix(0.02, 0.4, v)
}
```

Generated hardware call:

```js
sliderSpeed(__pxlblz_hw_pot1)
```

Direct variable assignment is useful when no slider exists:

```yaml
controls:
  pot1:
    assign: speed
    min: 0.02
    max: 0.4
```

Generated assignment:

```js
speed = mix(0.02, 0.4, __pxlblz_hw_pot1)
```

Quantized assignment:

```js
paletteIndex = floor(mix(0, 6.999, __pxlblz_hw_pot1))
```

The transform should validate that call targets and assignment targets exist when practical, and report warnings when a binding cannot be applied.

## Research Spike Requirements

Before implementation, run a research spike against the Pixelblaze dialect, the emulator, and hardware where needed.

The spike must answer:

1. What is the exact Pixelblaze API for reading analog input pins?
2. Can generated code safely rename and wrap an exported `beforeRender` function?
3. Can injected code call exported slider functions normally from `beforeRender`?
4. Can injected code assign to top-level `var` and `export var` bindings?
5. Can Pixelblaze built-ins be aliased, e.g. `var oldHsv = hsv`, and then called through the alias?
6. Can Pixelblaze built-ins be shadowed safely, or should call-site rewriting remain mandatory?
7. Do optional/default/undefined argument checks behave well enough for wrapper functions, or should wrappers be arity-specific?
8. Are `hsv`, `hsv24`, `rgb`, and `paint` wrappers valid and visually/behaviorally correct on hardware?
9. How should disconnected or floating analog inputs be represented and guarded?
10. How expensive is per-frame analog reading and smoothing relative to typical pattern work?

The spike should produce a short findings note and, if useful, small fixture patterns that demonstrate which generated code shapes work or fail.

## Implementation Decisions

- The feature is manifest-first. Do not build a UI for editing Controller hardware profiles in the first implementation.
- Hardware injection is deploy-time/push-time behavior. The editor's original source remains unchanged.
- The transform should be implemented as a pure engine module with no React imports.
- The transform should parse source and rewrite token/AST ranges. Do not use blind string replacement.
- Generated helper names should use a reserved prefix such as `__pxlblz_hw_`.
- Output brightness injection should rewrite call sites to helper functions rather than trying to monkey-patch built-ins.
- Initial output support should cover `hsv`, `hsv24`, `rgb`, and `paint`.
- Unsupported output APIs should be reported in the transform summary rather than silently ignored.
- Existing `beforeRender` should be wrapped, not replaced.
- If no `beforeRender` exists, one should be injected.
- Existing exported slider functions should be preferred over direct variable assignment.
- Direct variable assignment must be explicit in the manifest and should support min/max and quantize.
- Generated artifacts should be inspectable. The first UI may be a debug/developer affordance rather than a polished product flow.
- Normal Send to Controller behavior should continue unchanged when no manifest or no matching hardware profile is active.
- GitHub Pages/public builds should not require local workspace files; the feature should degrade cleanly unless a later persistence design supplies browser-backed profiles.

## Testing Decisions

- The transform engine should have unit tests that assert external behavior: transformed source, transform summary, warnings, and unchanged original source.
- Tests should cover patterns with and without `beforeRender`.
- Tests should cover `hsv`, `hsv24`, `rgb`, `paint(value)`, and `paint(value, brightness)`.
- Tests should prove comments, strings, property names, and unrelated identifiers are not rewritten.
- Tests should cover name-collision avoidance for generated helper names.
- Tests should cover slider-call bindings and variable-assignment bindings.
- Tests should cover no-manifest/no-profile behavior, where the push artifact is unchanged.
- Integration tests should cover Send to Controller selecting the transformed artifact only when a matching manifest/profile is active.
- Hardware verification should be used for the analog-input API and generated-code-shape findings. Routine transform correctness should stay in pure tests.

## Out of Scope

- A polished Controller-profile UI.
- Browser/GitHub Pages persistence for hardware profiles beyond whatever existing storage can already support.
- Automatic inference of useful pot mappings.
- Continuous sync of hardware controls back into preview controls.
- Editing pattern source to permanently include hardware code.
- Replacing native Pixelblaze brightness.
- Supporting every possible color-output abstraction in v1.
- Deep expression rewriting beyond output sink wrapping, slider calls, and variable assignment.

## Further Notes

Potentiometer wiring guidance:

```text
outside lug -> Pixelblaze 3.3V
outside lug -> Pixelblaze GND
middle lug  -> analog input pin
```

Use a linear potentiometer. `10k` is the preferred default: lower values waste more current, while very high values such as `1M` are more likely to produce noisy ADC readings.

Do not feed `5V` into a Pixelblaze analog input.

The first practical build path should be:

1. Research spike.
2. Manifest schema and parser.
3. Pure transform engine.
4. Generated artifact inspection/summary.
5. Send to Controller integration.
6. Hardware brightness verification.
7. Per-pattern pot binding.
8. Documentation.
