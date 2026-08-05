# Issue 715 packed-data pricing results

Status: measured on hardware; go decision for the packed-plan program
Date: 2026-08-05
Device: pb32 "Burner bag", firmware 3.67, 256 px

The packed-plan direction is a measured go. The device compiler emits
array-literal elements at 4.25 bytecode bytes per element — 4.7x denser than
the 20-byte per-element assignment emission every current emitter and pricing
model assumes — and a guarded two-per-word packing reaches 2.25 bytecode bytes
per 15-bit value at n=2048. Both encodings are checksum-verified on hardware.
The activation ceiling for literal-heavy bytecode varies run to run between
70,475 and 77,111 largest-activating bytes but never failed below 70,607 —
above the 68,384-byte statement-filler ceiling (#314) in every observation, so
data-heavy artifacts are not penalized. Reproduce with `npm run issue715` (offline
invariants) and `npm run issue715:hardware` (full measurement, writes
`test/perf-harness/issue715-pricing-report.json`).

## Pricing

Effective activation-budget bytes per usable data value, measured with the
Controller's own compiler (bytecode delta over an `array(n)` baseline):

| Encoding | n=256 | n=1024 | n=2048 | Source bytes/value (n=2048) |
| --- | ---: | ---: | ---: | ---: |
| Per-element assignment (today's emission) | 20.00 | 20.00 | 20.00 | 13.82 |
| Array literal, 11-bit values | 4.25 | 4.25 | 4.25 | 5.36 |
| Array literal, packed 2x15-bit + unpack loop | 3.13 | 2.38 | 2.25 | 11.97 |

The 4.25 figure is raw data plus ~6% framing: array literals compile to an
effective data segment. The packed encoding approaches the 2-byte floor as the
fixed unpack loop amortizes.

Consequence for the 68,384-byte source proxy: it diverges from bytecode in
both directions depending on encoding. Assignments cost 1.45x their source
bytes in bytecode (the proxy under-charges); plain literals cost 0.79x (the
proxy over-charges); packed literals cost 0.19x (the proxy over-charges more
than 5x). #716 must price data chunks on a bytecode axis rather than scaling
source bytes.

## Correctness

One pattern initialized a 1,024-element plain literal array and a 512-word
packed array, unpacked the latter, and exported order-sensitive two-lane
checksums per array: the low lane folds `value % 256`, the high lane folds
`floor(value / 256)`, covering every bit plane of 15-bit values. The two
arrays use distinct seeded streams so their expectations are independent.
All four lanes read back exactly (literal low 475 / high 738, packed low 586
/ high 261). An earlier single-lane `% 256` checksum was rejected in review:
it was blind to the upper bits, and its shared seed made the literal and
packed sums structurally equal.

Two hazards were measured and are load-bearing for any emitter:

- **Decimal parse error.** For ~0.5% of 32-bit words (2 of 400 sampled), the
  device compiler parses the canonical decimal one ulp low, and no decimal
  string reaches the exact word. The error is always -1, never +1. The packed
  encoding therefore stores 15-bit lanes with the low lane odd
  (`(lo << 1) | 1`): a -1 ulp flips the guard bit without changing
  `floor(lane / 2)` and, because the lane is never zero, cannot borrow into
  the high lane. Full 16-bit lanes are unsafe.
- **Unrepresentable multipliers.** 65536 and 32768 do not fit 16.16, so the
  natural fraction-to-lane decode overflows silently (the first hardware
  checksum attempt failed exactly this way). The safe decode is
  `floor(((w - hi) * 256) * 128)`, whose maximum intermediate is 32767.5.

## Activation ceiling

Bisection with literal-heavy filler (`var t = [...]` plus a black render),
across two independent runs:

```text
Run 1: 68,079 B activate · 70,475 B activate · 70,607 B fail · 72,331 B fail · 76,579 B fail
Run 2: 76,579 B activate · 77,111 B activate · 77,379 B fail · 78,707 B fail · 85,079 B fail
```

The ceiling is state-dependent: the same 76,579-byte artifact failed in run 1
and activated in run 2, moving the largest-activating point from 70,475 to
77,111 bytes between runs (plausibly device heap state after prior failed
pushes). Every observed activation at or below 70,475 bytes succeeded, every
observed failure sits above 70,607 bytes, and both bounds exceed the
68,384-byte statement-filler ceiling — so the established budget remains a
safe, slightly conservative bound for data-heavy artifacts, and the spread is
a reason to keep it rather than chase the higher run-2 numbers. Activation
time grows mildly with size and stays near one second at the ceiling.

## Unpack cost

Unpacking 512 packed words (1,024 values) every frame in `beforeRender` cost
3.6–3.9 ms per frame across runs (124.50 -> 85.66 median FPS at 256 px in the
recorded run), i.e. 7.1–7.6 us per word. As a one-time activation step — the
intended use — unpacking a worst-case ~4,000-word table costs ~30 ms once,
invisible next to the ~1 s activation itself. Per-frame unpacking is priced
out; plan tables should unpack once or be read in place.

## Program consequences

- #716: replace the 20 B/element and per-loop pricing with the measured
  encoding table; add a bytecode-axis estimate for data chunks; gate packed
  fixtures against the 68,384-byte budget (retained as the conservative bound
  under the measured 70,475-byte literal ceiling).
- #717: plan tables should prefer plain array literals (4.25 B/value, no
  unpack, no quantization) and reserve packed 2x15 for tables large enough
  that the ~2x further compression matters; unpack once at activation.
- Routing tables (#573 pricing) are also mispriced: a packed routing table
  emitted as an array literal would cost ~4.25 B/element in bytecode versus
  the 20 B/element the planner currently assumes, which may flip some
  range-branch decisions — the FPS gate, not the byte gate, becomes the
  binding constraint.
