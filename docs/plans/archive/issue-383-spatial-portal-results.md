# Issue #383 - spatial portal transition hardware results

Validated on 2026-07-10 against the 256-pixel Pixelblaze at `192.168.8.224`,
brightness 0.3. The reusable fixtures live in
`test/perf-harness/issue316.ts` as `show-portal-dither` and
`show-portal-blend`; both use the same warm/cool member Patterns, a four-second
portal, center `(0.5, 0.5)`, and feather width 0.12.

| Fixture | Compiler policy | Observed device FPS |
|---|---|---|
| Portal, stable dither | one renderer per pixel | about 33-40 |
| Portal, true blend | second renderer only in feather band | about 28-30 in the band, returning to about 40 outside it |
| Stock `SceneSplice` | standalone SDF demo | 49.84 mean (26.2-71.0 sampled range) |

The SceneSplice number is a useful same-device reference, not an isolated
transition comparison: its member rendering work differs from the paired portal
fixtures. The paired fixtures establish the meaningful result. Stable dither
retains the one-renderer route cost, while true blend pays its extra cost only
for the bounded spatial band and returns to the same steady-state range.

The Studio path was also exercised end to end with a saved stock Square Stage,
three-second scenes, a three-second portal, generated-source compilation, and
`Push to Burner bag`. The controller accepted and activated the resulting
`render2D` Show artifact.
