# Issue 334 route-cost transitions

Recorded 2026-07-08 against the local Pixelblaze at `192.168.8.224`.

All runs used the production `compileShow` path with the same warm/cool member
patterns, temporary brightness 0.3, 256 pixels, and one short-lived WebSocket per
fixture.

## Wipe

```bash
PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=show-wipe FORCE_BRIGHTNESS=0.3 WATCH_MS=12000 npm run issue316
```

- Generated source: 7264 bytes.
- Summary: `renderPolicy=route-transition-one-renderer-per-pixel`,
  `transitionCost=route`, `worstInstantRenderersPerPixel=1`.
- Device compiler accepted it: 3132 byte bytecode.
- Observed FPS: initial 43, transition/steady samples around 39-40 FPS.

## Dither

```bash
PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=show-dither FORCE_BRIGHTNESS=0.3 WATCH_MS=12000 npm run issue316
```

- Generated source: 7273 bytes.
- Summary: `renderPolicy=route-transition-one-renderer-per-pixel`,
  `transitionCost=route`, `worstInstantRenderersPerPixel=1`.
- Device compiler accepted it: 3128 byte bytecode.
- Observed FPS: initial 42, transition/steady samples around 38-40 FPS.

## Crossfade Baseline

```bash
PIXELBLAZE_IP=192.168.8.224 SHOW_FIXTURE=show-crossfade-baseline FORCE_BRIGHTNESS=0.3 WATCH_MS=12000 npm run issue316
```

- Generated source: 7494 bytes.
- Summary: `renderPolicy=steady-active-transition-both`,
  `transitionCost=renderer-window`, `worstInstantRenderersPerPixel=2`.
- Device compiler accepted it: 3240 byte bytecode.
- Observed FPS: dipped to roughly 20-29 FPS during the two-renderer transition,
  then returned to about 40 FPS after the crossfade window.

The route-cost transition fixtures therefore match the #334 cost model: both
members pay per-frame `beforeRender` cost during the transition window, but each
pixel evaluates exactly one renderer.
