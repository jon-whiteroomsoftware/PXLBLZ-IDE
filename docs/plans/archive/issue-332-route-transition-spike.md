# Issue 332 route-transition hardware spike

Recorded 2026-07-08 against the local Pixelblaze at `192.168.8.224`.

Command pattern:

```bash
PIXELBLAZE_IP=192.168.8.224 FORCE_BRIGHTNESS=0.3 SAMPLE_VARS=1 SHOW_FIXTURE=<fixture> npm run issue332
```

Controller observations:

- Pixel count reported by controller: 256
- Brightness forced temporarily to `0.3` with `save=false`
- Firmware version was not reported by this connection path
- All fixtures compiled with the controller's own compiler and became active

## Fixture Results

| Fixture | Bytecode | Member calls per frame | FPS observed | Finding |
| --- | ---: | ---: | ---: | --- |
| `plain-wipe` | 1169 bytes | 256 | ~95-99 | Cheapest route transition: moving boundary, one renderer per pixel. |
| `plain-dither` | 1173 bytes | 256 | ~86-89 | Dither hash costs more than wipe, but still one renderer per pixel. |
| `pattern-wipe` | 1449 bytes | 256 | ~63-66 | Running-pattern wipe is viable and much cheaper than both-renderer blending. |
| `pattern-dither` | 1453 bytes | 256 | ~59-61 | Running-pattern dither is viable; hash/branch cost is visible but modest. |
| `pattern-crossfade-baseline` | 1549 bytes | 512 | ~35-36 | Both-renderer baseline roughly halves FPS for this pair. |
| `pattern-decimate` | 658 bytes | 64 | ~121-124 | 4-pixel block decimation behaves like a real negative-cost adaptation. |

## Interpretation

The PRD idea is validated: route transitions can be priced differently from
blend transitions. Wipe and dither dissolve fixtures both call exactly one
member renderer per pixel during the transition. For the running-pattern pair,
the route versions stayed around 60-66 FPS while the both-renderer baseline was
around 36 FPS.

This strongly supports prioritizing route transitions (wipe/dither) before or
alongside crossfade in Show v1.x. Crossfade remains useful, but it should be
budget-visible because it requires both renderers for each pixel during the
transition window.

The decimation probe also validates the "negative-cost adaptation" language in
the PRD. Evaluating one source pixel per 4-pixel block produced 64 source
calls for a 256-pixel frame and lifted FPS above the plain route fixtures.

## Harness Fixtures

The fixtures live behind `npm run issue332` via `test/perf-harness/issue316.ts`
and `test/perf-harness/showRouteTransitionFixtures.ts`.

Available fixtures:

- `plain-wipe`
- `plain-dither`
- `pattern-wipe`
- `pattern-dither`
- `pattern-crossfade-baseline`
- `pattern-decimate`

Use `SAMPLE_VARS=1` to print watch variables:

- `frames`
- `calls`
- `last`
- `callsA`
- `callsB`
- `lastA`
- `lastB`
- `progress`

## Follow-Ups

- Teach the production Show route pass to emit the one-renderer-per-pixel shape
  used by `pattern-wipe` and `pattern-dither`.
- Make Show cost estimates distinguish:
  - per-frame work
  - one renderer per pixel route work
  - two renderers per pixel blend work
  - negative-cost decimation/interlacing/hold-buffer adaptations
- Consider a cheaper deterministic dither hash if visual quality is acceptable;
  the dither fixtures are still cheap, but consistently slower than wipes.
