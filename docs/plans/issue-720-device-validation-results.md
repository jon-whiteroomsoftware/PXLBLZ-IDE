# Issue 720 device validation results

Status: complete; the #715-#719 program is device-verified
Date: 2026-08-05
Device: pb32 "Burner bag", firmware 3.67, artifacts pushed at 2,000 px

Every claim the #715-#719 program made on proxy evidence held on hardware,
and one claim exceeded it: the pre-program shape-reveal-figures artifact
could not activate first-try at 2,000 px while its reshaped successor
activates cleanly - the byte program did not just create headroom, it
repaired a real activation failure. Raw data:
`test/perf-harness/issue720-validation-report.json`; before artifacts were
compiled from pre-program main (`eeec85b`), after artifacts from `e790dae`.

## Activation

| Artifact | Source B before -> after | Bytecode B before -> after | Activation |
| --- | --- | --- | --- |
| wipe-transitions | 59,605 -> 33,487 | 34,690 -> 19,254 (-44%) | both activate; after first-try |
| shape-reveal-figures | 62,302 -> 39,085 | 35,558 -> 21,910 (-38%) | **before failed first-try**; after first-try |
| property-animation | 65,822 -> 58,946 | 45,426 -> 39,602 (-13%) | both activate |
| #546 qualification | 67,289 -> 59,006 | 46,274 -> 39,814 (-14%) | both activate |

Activation of large artifacts is state-dependent, confirming the #715
ceiling wobble: every before artifact above ~35 KB of bytecode needed the
retry protocol (push a trivial pattern, then retry), while three of four
after artifacts activated first-try. The retry protocol is now part of the
harness and should be standard for any push near the ceiling.

Bytecode runs ~55-70% of source bytes on these artifacts, so the 68,384-byte
source proxy remains conservative for real generated Shows.

## Paired FPS at 2,000 px

| Show | Before median | After median | Change |
| --- | --- | --- | --- |
| property-animation | 2.227 | 2.421 | **+8.7%** |
| wipe-transitions | 0.688 | 0.676 | -1.8% (ranges overlap) |

Property Animation's gain is clean - the sample ranges do not overlap
(before max 2.245 < after min 2.406) - and is the #719 envelope hoist
measured on silicon: the aperture/viewport envelope evaluates once per pixel
instead of six times. Wipe's -1.8% sits inside overlapping sample ranges
(0.648-0.734 vs 0.678-0.737); its 6-second windows sample different scenes
of a looping Show, so the paired medians carry scene-mix noise. Verdict:
neutral within noise, consistent with the #717 slices' design goal of
byte-neutral render paths.

## Table-scheduler wall clock

A 16-scene table-scheduled probe with irregular holds (1.5/2.2/2.9 s
cycling, 600 ms crossfades) exported its scene variable. The sampling loop
slept 120 ms per iteration, but each getVars round-trip added latency: the
report records 89 samples over 26 s, an effective cadence of ~295 ms, which
is the timing oracle's true resolution. Nine scene changes were observed.
One early boundary was detected ~350 ms late - about one sampling interval -
and the neighboring gap compensates exactly. Steady-state boundary errors of
-42, +4, +29, -35, and +45 ms all sit well inside a single ~295 ms sampling
interval, so the boundaries are correct to the precision this oracle can
resolve. The one-ulp fractional-literal tolerance (15 us) is far below that
floor, as predicted; the schedule tables keep wall-clock choreography.

## Program verdict

The #715-#719 chain is fully validated: measured pricing produced honest
gates, the gates produced safe emissions, the emissions activate on
hardware, run at neutral-to-better frame rates, and keep time. 232,226
bytes of catalogue savings stand as real device capability, not proxy
arithmetic.
