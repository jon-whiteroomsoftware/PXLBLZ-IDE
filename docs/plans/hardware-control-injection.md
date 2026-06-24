# Hardware Control Injection Plan

## Purpose

Pixelblaze patterns are source-visible and easy to inspect, but adding hardware-specific controls directly to third-party patterns makes those patterns less portable. This plan describes a deploy-time transformation layer that keeps original pattern source clean while producing hardware-aware variants for devices with physical controls such as potentiometers.

The first target is a physical brightness knob, because Pixelblaze exposes global brightness in the Web UI but does not provide a straightforward on-device hardware brightness control. The same approach can later map additional pots to pattern-specific controls such as speed, palette selection, density, or color cycling.

## Core Idea

Keep pattern source generic:

```text
third-party pattern source
  -> deploy profile / hardware manifest
  -> generated hardware-aware pattern
  -> Pixelblaze device
```

The deploy tool performs controlled code rewriting when deploying to a specific hardware profile. The generated code can be inspected, but the original pattern remains unchanged.

## Design Goals

- Preserve third-party pattern source without permanent hardware edits.
- Make global hardware brightness available across every deployed pattern on a device.
- Allow per-pattern mapping of extra physical controls to existing pattern sliders, functions, or variables.
- Prefer explicit manifest mappings over hidden inference.
- Generate inspectable output so a bad mapping is easy to diagnose.
- Keep native Pixelblaze Web UI brightness as the hard safety cap.

## Global Brightness Transform

For hardware brightness, the deploy tool can wrap pattern color output. The effective value becomes:

```text
native Pixelblaze brightness cap
  * pattern's own brightness/value
  * software slider value
  * physical pot value
```

A practical generated pattern can expose a Web UI slider while also reading the hardware pot:

```js
var __uiBrightness = 1
var __hwBrightness = 1
var __effectiveBrightness = 1

export function sliderBrightness(v) {
  __uiBrightness = v
}

function __readHardwareControls(delta) {
  // Replace analogRead(POT0) with the actual Pixelblaze input API/pin.
  __hwBrightness = analogRead(POT0)
  __effectiveBrightness = __uiBrightness * __hwBrightness
}

function __pb_hsv(h, s, v) {
  hsv(h, s, v * __effectiveBrightness)
}

function __pb_rgb(r, g, b) {
  rgb(
    r * __effectiveBrightness,
    g * __effectiveBrightness,
    b * __effectiveBrightness
  )
}
```

Then transform render calls:

```js
hsv(h, s, v)
rgb(r, g, b)
```

into:

```js
__pb_hsv(h, s, v)
__pb_rgb(r, g, b)
```

This avoids relying on device-level global brightness mutation while still making a physical brightness knob work consistently across patterns.

## `beforeRender` Wrapping

The deploy transform should preserve the user's original `beforeRender` behavior.

Original pattern:

```js
export function beforeRender(delta) {
  t1 = time(speed)
}
```

Generated pattern:

```js
function __user_beforeRender(delta) {
  t1 = time(speed)
}

export function beforeRender(delta) {
  __readHardwareControls(delta)
  __user_beforeRender(delta)
}
```

If the source pattern has no `beforeRender`, inject one:

```js
export function beforeRender(delta) {
  __readHardwareControls(delta)
}
```

## Per-Pattern Hardware Mappings

Additional pots should be mapped per pattern through a manifest. This lets the user inspect a pattern, identify meaningful controls, and map hardware without editing the source.

Example:

```yaml
device:
  hardware:
    pot0:
      pin: A0
      role: brightness
      smoothing: 0.1
      fallback: 1
    pot1:
      pin: A1
      role: assignable
      smoothing: 0.1

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
        call: sliderPalette
        quantize: false

  sparkle:
    controls:
      pot1:
        mode: unused
```

## Preferred Mapping Strategies

Prefer mappings in this order:

1. Call an existing exported slider function.
2. Call an explicit pattern function.
3. Assign a named variable.
4. Apply a global output wrapper.
5. Avoid deep expression rewriting unless there is no cleaner option.

Existing sliders are ideal because the pattern author already encoded scaling, clamping, and quantization:

```js
export function sliderSpeed(v) {
  speed = mix(0.02, 0.4, v)
}
```

Generated hardware call:

```js
sliderSpeed(__pot1)
```

Direct variable assignment is useful when the pattern does not expose a slider:

```yaml
controls:
  pot1:
    assign: paletteIndex
    min: 0
    max: 6
    quantize: true
```

Generated helper:

```js
paletteIndex = floor(mix(0, 6.999, __pot1))
```

## Generated Code Shape

A pattern with global brightness and a second pot mapped to `sliderSpeed` could generate:

```js
var __uiBrightness = 1
var __pot0 = 1
var __pot1 = 0
var __effectiveBrightness = 1

export function sliderBrightness(v) {
  __uiBrightness = v
}

function __smooth(current, target, amount) {
  return current * (1 - amount) + target * amount
}

function __readHardwareControls(delta) {
  __pot0 = __smooth(__pot0, analogRead(POT0), 0.1)
  __pot1 = __smooth(__pot1, analogRead(POT1), 0.1)

  __effectiveBrightness = __uiBrightness * __pot0
  sliderSpeed(__pot1)
}

function __pb_hsv(h, s, v) {
  hsv(h, s, v * __effectiveBrightness)
}

function __pb_rgb(r, g, b) {
  rgb(
    r * __effectiveBrightness,
    g * __effectiveBrightness,
    b * __effectiveBrightness
  )
}

function __user_beforeRender(delta) {
  // Original pattern beforeRender body.
}

export function beforeRender(delta) {
  __readHardwareControls(delta)
  __user_beforeRender(delta)
}

export function render(index) {
  // Original render body, with hsv/rgb calls rewritten.
}
```

## Hardware Notes

For a potentiometer used as an analog control:

```text
outside lug -> Pixelblaze 3.3V
outside lug -> Pixelblaze GND
middle lug  -> analog input pin
```

Use a linear potentiometer, with `10k` as the preferred default. Lower values waste more current; very high values such as `1M` are more likely to produce noisy ADC readings.

Do not feed `5V` into a Pixelblaze analog input.

## Transform Safety

The transform should avoid simple blind string replacement where possible. The tool should operate on parsed code or at least token-aware source ranges so it does not rewrite comments, strings, property names, or unrelated identifiers.

Important cases:

- Rewrite `hsv(...)` and `rgb(...)` calls, not text inside comments or strings.
- Preserve existing exported sliders.
- Wrap existing `beforeRender` rather than replacing it.
- Avoid naming collisions by reserving a prefix such as `__pxlblz_hw_` or `__pb_`.
- Emit a summary of every transform before deployment.

Example deployment summary:

```text
Pattern: Aurora Drift
Global brightness: pot0 wraps hsv/rgb output
pot1: calls sliderSpeed(v)
beforeRender: wrapped existing function
Generated artifact: build/deploy/aurora-drift.hw.js
```

## Open Questions

- Confirm the exact Pixelblaze API for reading the target analog input pins.
- Decide whether hardware control mappings live in project metadata, pattern metadata, or a separate hardware manifest.
- Decide how generated artifacts are stored and inspected.
- Decide how to handle patterns using output functions other than `hsv` and `rgb`, such as palette helpers or painting APIs.
- Decide how to represent disconnected hardware controls so analog inputs do not float.
