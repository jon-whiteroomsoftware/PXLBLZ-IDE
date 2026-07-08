# Issue 335 hold/ramp semantics

Recorded 2026-07-08 against the local Pixelblaze at `192.168.8.224`.

Command:

```bash
PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=adaptation-ramp SAMPLE_VARS=1 FORCE_BRIGHTNESS=0.3 WATCH_MS=9000 npm run issue316
```

Result:

- Generated #335 adaptation-ramp Show source: 3991 bytes.
- Compiler summary reported `renderPolicy=parameter-ramp-one-renderer-per-pixel`,
  `transitionCost=parameter`, and `worstInstantRenderersPerPixel=1`.
- The controller's own compiler accepted the source: bytecode 1840 bytes.
- The run-only program became active on the 256-pixel controller at temporary
  brightness 0.3.
- Observed FPS stayed around 45-46 during the 9 second watch window.

The harness requested `SAMPLE_VARS=1`, but the generated ramp internals are
ordinary private `var`s, not exported Pixelblaze watch variables, so no internal
ramp values were available through `getVars`. The pure tests are the source of
truth for boundary/ramp variable semantics; the hardware run verifies that the
generated artifact compiles, pushes, runs, and remains a one-renderer ramp by
compiler summary.
