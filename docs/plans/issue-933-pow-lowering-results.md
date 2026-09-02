# #933 — Display-exact tier and the integer-pow lowering

Wave-5 epic #923, candidate 9 in the advisory. Measured 2026-09-01 on the
bench pb32 (firmware 3.67, native serial, profile stamped
`native-serial (assumed)`) at 256 px. Cost rows:
`test/perf-harness/issue933-probe-rows.md` (round five in
`show-runtime-costs.md`); ladder: `issue933-pow-ladder.json`; census and
tier proofs: `issue933.test.ts`.

## What shipped

- **The tier.** `qualifyDisplayExact` in `test/perf-harness/benchCore.ts`
  renders both modes and classifies a candidate `display-exact` (max 8-bit
  channel delta 0 in both modes over the window) or `lossy`, per mode and
  combined; `npm run drift` prints the verdict. Review caught that the
  bench checksum hashes the same quantized bytes, so "checksum-exact" was
  not a separately measurable tier: operation-exactness is a property of a
  transform's argument, recorded as such in `docs/agents/verification.md`
  with the residual; the guide's §5 gains the `[display-exact]` tag.
- **The pass.** `src/engine/showMemberPowLowering.ts`, behind
  `memberPowLowering` (off by default, never at the Exact stop): `pow(b, k)`
  for literal integer 2 <= k <= 4 becomes a multiply chain. k = 2 only on a
  plain name or literal (the firmware fast-paths `pow(b, 2)` at 2.28 us and
  a hoisted chain loses at 2.54 us); k = 3 / 4 hoist a computed base into
  one function-local temp when the site sits in a hoistable statement.
  Eligibility needs a pure base (built-ins only when the module does not
  declare a function or variable of that name; an authored `pow` disables
  the pass) with a provable magnitude bound such that bound^k <= 32767 (firmware overflow diverges: `pow(200, 2)` = 32768,
  `200 * 200` = -25536); bounds flow from render coordinates ([0, 1]),
  literals, single-assignment locals and never-written module constants,
  and the bounded built-ins (wave, sin, abs, clamp, mod, sqrt, hypot, ...).
  Every declined site carries a reason.

## Cost rows (us per site, pb32)

| form | pow | chain, hoisted base | chain, plain name | saving (hoisted / plain) |
|---|---:|---:|---:|---:|
| k = 2 | 2.28 | 2.54 | 0.79 | -0.26 / 1.5 |
| k = 3 | 7.63 | 3.62 | ~1.6 | 4.0 / ~6.0 |
| k = 4 | 7.65 | 4.70 | ~2.4 | 3.0 / ~5.2 |

Firmware facts (bench probe): a negative base with an integer exponent
follows C `powf`; positive-base samples of `pow(b, k)` equalled the chain
bit-for-bit in 16.16 (k = 2, 3, 4), the negative-base sample differed by one
LSB.

## Census: no stock per-pixel site

Sixteen stock Patterns call `pow`. One qualifies — Oasis, a once-at-
activation gamma table `pow(wave(...), 4)` — and no stock Show carries it
as a member, so the option changes no stock artifact (pinned in
`issue933.test.ts`). The rest: non-integer exponents (Caustics 1.3,
WavyBands 1.25, Orrery3D 1.5, RealWorldLights negative, the holiday stars'
`1 / p`), exponents above 4 (PendulumWave 8, ShoalScatter3D 6;
IridescentFibers' `pow(..., 8)` is already hand-expanded), or a variable
exponent in a per-frame table fill (ZippyZaps' `pow(a, i)` in
`beforeRender`, already hoisted off the pixel path by #916). The pass is
breadth for future ShaderToy ports, where `pow(abs(uv.x), 3)`-class sites
are the norm; it moves nothing in the catalogue today.

## Ladder: the per-pixel fixture (`issue933.ts`, 6 sites, 256 px)

| variant | median FPS (A) | median FPS (B) | bytecode |
|---|---:|---:|---:|
| exact | 47.856 | 47.833 | 444 B |
| lowered | 61.938 | 61.938 | 560 B |

**+29.5% median FPS** (A/B/A/B pairing, 6 s samples, 2 s settle), the six
sites' savings summing to ~19 us of a ~130 us pixel.

## The tier verdict on that fixture, and what it teaches

Fast: display-exact (checksum unchanged). Precise: **max delta 1**, mean 0.002/255, changed
fraction rounding to 0.000% — one 16.16 LSB from the k = 3 / k = 4 sites
lands on an 8-bit edge in a handful of channels, so the strict tier
classifies the fixture `lossy`. Per-site isolation: the plain-name k = 2
site and the `abs(dx + dy)^4` site are display-exact in both modes; each wave- or
abs-based k = 3 / 4 site alone drifts by one LSB in Precise.

The bench firmware matched the multiply chain on every positive-base
sample, so this is the **Precise emulator's `pow` fidelity** bounding what
the tier can certify, not the hardware. The tier stays strict (max 0, both
modes) as specified; the consequence is recorded rather than tuned away:

- Artifacts the pass rewrites must be qualified individually, and some
  that are display-exact on the device will be declined by the emulator.
- The right fix is emulation, not the threshold: a follow-up that samples
  the firmware's `pow` across a base/exponent grid and matches the Precise
  runtime to it (the #556/#907 method) would let the tier certify these
  sites. Until then, the option is a measured, disclosed lever for ports.

## Limits kept

- No UI (Jon deferred the dial); the option is compile-time only.
- Never on at the Exact stop; off by default; no vintage pin needed
  because the default reproduces prior emission byte-for-byte across the
  catalogue (`issue933.test.ts`).
- Exponents outside 2..4, non-literal exponents, impure or unbounded
  bases, and sites without a preceding-statement insertion point are
  declined with a reason in the compile summary.
