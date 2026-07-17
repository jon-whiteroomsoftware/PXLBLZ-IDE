# Issue 515 render-target arena results

Every generated Show now contains exactly three compiler-owned full-output
arrays. At 2,000 pixels the physical arena consumes the 6,012 words already
reserved by the whole-Show VM ledger. Arena declaration changes neither output
nor per-frame work; it establishes bounded storage for the buffered policies in
later slices.

## Reproduce

```bash
npm run issue515
PIXELBLAZE_IP=192.168.8.224 npm run issue515:hardware
```

The hardware harness compiles both artifacts with the Controller's embedded
compiler, records its active Pattern and pixel count, measures the selected and
counterfactual artifacts, and restores the original state in `finally`. Set
`ISSUE515_PIXEL_COUNTS=2000` for the paired ledger run.

## Physical and logical contract

The generated artifact declares planes 0, 1, and 2 once. Typed compiler helpers
bind four possible roles onto those same planes:

| Role | Channels |
| --- | --- |
| Stage RGB | `r=0`, `g=1`, `b=2` |
| Sample XY | `x=0`, `y=1` |
| Scalar field | `value=0` |
| Previous RGB | `r=0`, `g=1`, `b=2` |

No role allocates storage. The active role remains unassigned until #516 or a
later planner owns lifetime and invalidation. Installation artifacts allocate
their fixed output count; Portable artifacts allocate the supported 2,000-pixel
ceiling.

The compiler summary and Show compile bar disclose the physical plane count,
word count, active role, and every channel binding. A benchmark-only option can
omit declarations for paired comparison, but the VM ledger continues to reserve
the invariant budget.

## Resource fit

At 2,000 pixels the arena is three arrays of 2,000 elements plus three four-word
headers:

```text
3 * (2000 + 4) = 6,012 words
10,240 - 6,012 = 4,228 residual words
```

An exact-fit fixture using one member `array(4224)` reaches 10,240 words after
its own four-word header. `array(4225)` exceeds the pool by one word and produces
the expected artifact blocker. Redline also owns an 84-word interned plan table,
so its measured total is 6,096 words with 4,144 remaining.

## Exactness and artifact cost

Fixture: `stock-show-showcase-redline-installation`, 2,000 pixels. The physical
and declaration-free artifacts matched at 0, 7.5, 15, 22.5, 30, 37.5, 45, 52.5,
and 59.5 seconds in both Fast and Precise 16.16 preview modes.

Physical emission adds 90 delivered source bytes and 48 Controller bytecode
bytes to Redline. Because the arrays are only declared, it adds no instructions
to `beforeRender` or a pixel renderer.

## pb32 hardware result

Controller: pb32, firmware 3.67. Original configuration: 256 pixels. Activation
succeeded at 256, 1,000, and 2,000 pixels, proving the actual arrays compile and
fit. The broad matrix contained isolated sampling stalls in different members
of the 1,000- and 2,000-pixel pairs, so mean changes from that run are retained
as noise evidence rather than treated as performance conclusions.

The clean repeated 2,000-pixel pair produced equal medians:

| Artifact | Mean FPS | Median FPS | Minimum | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Declaration-free counterfactual | 3.079 | 3.127 | 2.950 | 3.167 |
| Physical three-plane arena | 3.044 | 3.127 | 2.540 | 3.165 |

The selected artifact's single low sample changes its mean by -1.13%, while the
paired medians are exactly neutral. That is consistent with the emitted source:
allocation changes activation size but performs no frame work. The ledger uses
the robust paired median and records 0.0% incremental render change.

## Epic ledger line

```text
04 #515 physical three-plane arena · 6,012 words allocated; paired 2,000 px median 3.127 -> 3.127 FPS · incremental 0.0% measured · cumulative reference 2.358 -> 3.037 FPS, +28.8% retained
```
