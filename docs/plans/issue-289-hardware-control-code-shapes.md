# Issue 289 hardware-control code-shape spike

Date: 2026-07-07

Controller tested: Pixelblaze `pixelblaze_pb32_3cd4ee549434`, firmware 3.67,
board type `pb32`, at `192.168.8.224`.

Harness: `test/hardware-control-spike/hardwareControlSpike.ts`. It fetches the
device compiler over HTTP, opens one WebSocket, pushes each fixture
sequentially, reads exported vars, samples FPS where useful, and closes the
socket in `finally`. Keep this one-socket shape; the controller has a small
socket pool.

## Confirmed

- V3 analog input API is `pinMode(pin, ANALOG)` plus `analogRead(pin)`.
  `readAdc()` is V2-only and failed to compile on this V3 controller.
- The compiler did not define mockup-style `A1`/`A2` symbols. Numeric GPIO
  arguments compile. GPIO 32 ran and returned values from `analogRead(32)`.
- ElectroMage's GPIO table is the board-profile authority for user-facing pin
  choices. For v3 Standard, the analog-capable labels are `IO33` on all v3
  boards, plus `IO34`, `IO35`, `IO36`, and `IO39` on hardware revision >= v3.5.
  The 8-pin through-hole header labels `IO26`, `IO25`, and `IO0` are not analog
  inputs.
- ESP32 ADC2 is shared with WiFi at the platform level, so controller profiles
  should offer only board-available analog-capable labels from the ElectroMage
  table. Do not surface raw ESP32 ADC candidate pads that the Pixelblaze PCB
  does not expose as analog inputs.
- Renaming/wrapping `beforeRender(delta)` works. The wrapper received the same
  delta as the renamed original, and the original continued to run.
- Injected code can call exported slider functions from `beforeRender`; the
  exported slider updated its target var on hardware.
- Injected code can assign both plain top-level `var` bindings and `export var`
  bindings.
- Built-ins are not first-class aliasable values. `var oldHsv = hsv` failed at
  compile time with `Undefined symbol hsv`.
- A user function can shadow a built-in name. A fixture defining `function hsv`
  compiled and that function was called. This means call-site rewriting must be
  scope-aware: do not rewrite a locally shadowed `hsv`, but do rewrite genuine
  built-in output calls.
- Output wrappers that forward to `hsv`, `hsv24`, `rgb`, and arity-specific
  `paint` wrappers compiled and ran on hardware.
- Missing optional user-function arguments become `0`. A one-argument call to a
  two-argument user function observed the second parameter as `0`.
- `undefined` is not a Pixelblaze value. `paint(0.2, undefined)` failed to
  compile with `Undefined symbol undefined`; wrappers must avoid optional
  `undefined` forwarding and should generate arity-specific call paths.
- The current test controller's through-hole wiring can drive generated input
  logic digitally. A focused fixture reading `digitalRead(25)` and
  `digitalRead(26)` then calling an exported slider function observed
  `IO25` toggling (`pot0Changes: 2`) and updating the slider target on the
  controller. `IO26` stayed high in that sample (`pot1Changes: 0`), so only
  `IO25` is validated as physically changing so far.

## Measurements

- No-analog baseline: about 124.50 FPS on this device/test rig.
- Output-wrapper fixture: about 124.50 FPS, indistinguishable from baseline for
  this tiny pattern.
- `analogRead(32)` plus one-pole smoothing in `beforeRender`: about 124.50 FPS
  in this fixture, so one read plus simple smoothing is below this rig's
  measurable FPS resolution.
- Floating GPIO 32 values were unstable and spanned the rail in one short run:
  min 0, max 0.999756, final raw 0.005859, smoothed average 0.002594 over 376
  frames. Treat floating reads as unusable signal.

## Guard design

- Profiles should require an explicit board/profile pin selection from the
  ADC1-safe exposed-pin map, not arbitrary symbol text.
- Each hardware input binding should carry a `deadband`, `fallback`, `invert`,
  and smoothing coefficient.
- At runtime, flag a disconnected input when the smoothed signal is pinned near
  0 or 1 for a sustained window, or when short-window raw variance is extremely
  high while the smoothed value does not settle. In that state, use the binding's
  fallback value and surface the live readout as suspect.

## Caveats

- A follow-up run stopped responding while moving from the successful GPIO 32
  probe to GPIO 33. The ElectroMage table confirms `IO33` is analog-capable, so
  treat that timeout as inconclusive controller/socket state, not as evidence
  against `IO33`. Do not brute-force GPIOs on a live controller.
- The attached test controller's analog pot behavior has not been independently
  validated yet. The pots appear to be wired to the top two 8-pin through-hole
  header pads, which the v3 Standard pinout labels `IO26` and `IO25`;
  ElectroMage marks those labels as digital-only. Treat the physical pot wiring
  as an open hardware-validation question, separate from the confirmed
  Pixelblaze code shapes above.
- The through-hole wiring can still keep mixin/input plumbing work unblocked:
  `digitalRead(25)` has now verified that generated code reads a hardware input
  and routes it into injected logic/exported slider calls. This does not validate
  analog range, smoothing, deadband, or fallback behavior.
- Touch constants `T0`, `T2`, `T4`, `T6`, and `T7` compile as constants, but
  they are for `touchRead`, not the analog pot path.

## Sources

- Local ElectroMage language reference:
  `docs/ElectroMage/Pixelblaze Language Reference.md`
- Local ElectroMage GPIO summary:
  `docs/ElectroMage/Pixelblaze GPIO Reference.md`
- ElectroMage GPIO reference:
  https://electromage.com/docs/GPIO/
- Espressif ESP32 ADC documentation:
  https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/adc/adc_oneshot.html
