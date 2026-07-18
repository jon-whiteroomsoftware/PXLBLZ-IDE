# Issue #532 - Native Show operation costs

Native scalar access is cheap enough that scalar caching should be chosen for
clarity or reuse, not to avoid a global read. Indexed array traffic is material:
one read costs 1.309 microseconds and one write costs 2.722 microseconds on the
measured pb32. User-function calls cost 1.899-3.449 microseconds as arguments
increase from zero to three, while the generated HSV conversion costs 35.308
microseconds beyond direct RGB capture.

These measurements put a price on the exchanges made by the Show render-target
planner. They do not choose a production cache policy by themselves; complete
Show FPS remains the qualification gate.

## Measurement

The reversible profiler ran on the `Burner bag` pb32 Controller at firmware
3.67 with its native 256-pixel output configuration. Each operation used 2,593
inner-loop iterations and five samples after a three-reading stability gate.
The runner temporarily loaded the probe Pattern, restored the original active
Pattern and pixel count in `finally`, and left the pixel map untouched.

The checked-in raw table is
[`test/perf-harness/show-runtime-costs.md`](../../../test/perf-harness/show-runtime-costs.md).
The highest-value medians are:

| Exchange | Median microseconds | Multiply equivalents |
| --- | ---: | ---: |
| Local-slot substitution | 0.000 | 0.0x |
| Persistent-global read instead of local | 0.005 | 0.0x |
| Persistent-global write instead of local | -0.002 | 0.0x |
| Array read instead of matched local slot | 1.309 | 1.6x |
| Array write added to matched indexed path | 2.722 | 3.4x |
| User call, zero to three arguments | 1.899-3.449 | 2.4-4.3x |
| Global-flag branch | 1.500 | 1.9x |
| Generated HSV conversion beyond RGB capture | 35.308 | 43.7x |
| Shift or mask | 0.797-0.799 | 1.0x |

The near-zero scalar deltas fall inside measured noise. The runtime therefore
does not justify copying a persistent scalar into a local solely to save access
time. Array access, function boundaries, and color conversion are large enough
to matter inside a per-pixel path.

## Replay break-even

Let `C` be the direct producer cost per pixel, `W` the array-write cost, `R` the
array-read cost, and `L` the total frames that share one captured value. Direct
evaluation costs `L*C`. Capture and replay cost `C + W + (L - 1)*R`, so caching
wins when:

```text
C > R + W / (L - 1)
```

For one plane, the measured lower bound moves from 4.031 microseconds per pixel
with one replay frame to 2.670 with two replay frames, then approaches 1.309 for
a long-lived cache. For an RGB target with three independent planes, the same
threshold moves from 12.093 microseconds with one replay to 8.010 with two, then
approaches 3.927. Branches, calls, blend arithmetic, invalidation, and physical
output sit above these lower bounds.

| Captured value | One replay | Two replays | Long-lived floor |
| --- | ---: | ---: | ---: |
| One plane | 4.031 us/pixel | 2.670 us/pixel | 1.309 us/pixel |
| Three-plane RGB | 12.093 us/pixel | 8.010 us/pixel | 3.927 us/pixel |

The rule is concrete: a framebuffer is not automatically faster because memory
is available. It becomes attractive when one capture removes a Pattern render,
an expensive field, or repeated color conversion across enough later frames.

## What #528 means now

The exact coordinate cache in #528 reads two planes. Native array access prices
those reads at about 2.618 microseconds per pixel; one measured global-flag
branch raises the illustrative cached-path floor to about 4.118 microseconds.
At 2,000 pixels, #528 changed median frame time from roughly 332.4 to 355.4
milliseconds, an observed loss near 11.5 microseconds per pixel.

Array reads alone therefore explain about 23% of the observed loss, or about 36%
when one branch is included. Seven two-plane rebuilds across an approximately
60-second, 3 FPS Redline loop add only about 0.21 amortized microseconds per pixel
per frame. Native access cost makes the coordinate cache less attractive, but
it does not explain the full regression.

The remaining gap is large enough for generated structure to dominate. A few
extra user-function boundaries cost 2-3.5 microseconds apiece, and #528 expanded
source from 19,435 to 29,360 bytes and bytecode from 11,810 to 16,938 bytes. The
next attribution ticket should ablate capture/replay, dispatch, and producer
evaluation independently rather than fitting a planner coefficient to the
negative whole-artifact result.

## Decision

No production compiler default changes in #532. The operation table rejects
scalar-read micro-caching, supplies lower bounds for Freeze/Refresh and field
candidates, and strengthens the case for #531's whole-artifact ablation before
another cache policy ships.
