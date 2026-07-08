# Issue 317 segment routing hardware note

Recorded 2026-07-08 against the local Pixelblaze at `192.168.8.224`.

Command:

```bash
PIXELBLAZE_IP=192.168.8.224 FORCE_BRIGHTNESS=0.3 SAMPLE_VARS=1 WATCH_MS=6000 npm run issue317
```

Fixture:

- `zone-repeat` compiles the same running pattern into two named Controller
  zones: `left-half` (`0-127`) and `right-half` (`128-255`).
- The fixture uses the production `compileShow` route path, not a hand-written
  Pixelblaze shortcut.
- The intended visual is the same local gradient/sweep animation repeated in
  both halves of the strip, proving that route compilation can pass a zone-local
  index and virtual `pixelCount`.

Observed output:

- Generated source: 4716 bytes, 6.9% of the measured 68384-byte budget.
- Device bytecode: 2260 bytes.
- Compile warnings: 0.
- Controller pixel count: 256.
- Brightness temporarily forced to `0.3` with `save=false`.
- Observed FPS: ~68-71.

Notes:

- Member variables are intentionally hidden inside the generated Show artifact,
  so `SAMPLE_VARS=1` did not print route counters for this fixture.
- The pure tests in `src/engine/showCompiler.test.ts` cover the exact route
  semantics: two simultaneous zone clips, zone-local `index/pixelCount`,
  multi-range zones as continuous local index space, and missing-zone warnings.
