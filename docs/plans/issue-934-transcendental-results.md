# #934 — Approximate transcendentals (perceptual stop, compile option)

Wave-5 epic #923, candidate 10 in the advisory. Measured 2026-09-01 on the
bench pb32 (firmware 3.67, native serial, profile stamped
`native-serial (assumed)`) at 256 px. Cost rows: `issue934-probe-rows.md`
and `issue934-probe-rows-2.md` (raw samples beside each); pairing:
`issue934-approx-ladder.json`; census and drift: `issue934.test.ts`;
contact sheets: `docs/plans/images/issue-934-*-contact.png` (exact left,
approximated right).

## What the bench says a built-in costs (us per call, vs multiply 0.8)

| built-in | cost | substitute measured | cost |
|---|---:|---|---:|
| `exp(-t)`, t in [0.1, 3.1] | **22.1** | reciprocal quartic `1 / P4(t)` | 11.6 |
| | | 64-entry table + lerp | 14.8 |
| | | `(1 + t/16)^-16` | 17.8 |
| library `tanh` (exp + divide) | **46.1** | rational `x (27 + x²) / (27 + 9 x²)` | 11.8 |
| `pow(b, 1.3)`, b in (0, 1] | 8.5 | fitted quadratic `b (a + (1 − a) b)` | 4.9 |
| | | fitted cubic | 6.8 |
| `asin` / `acos` | 4.8 / 4.9 | Abramowitz-Stegun (sqrt + cubic) | 12.3 (**loses**) |
| `log` | 1.5 | — | |
| divide | 2.2 | — | |

Two surprises worth keeping: `exp` is the expensive transcendental on this
VM (27× a multiply; `log` is 1.8×), and array reads are dear enough that a
lookup table loses to a polynomial.

## What shipped

`src/engine/showMemberTranscendentalApproximation.ts` behind
`memberTranscendentalApproximation` (off by default; never at the Exact or
Display-exact stops):

- `exp(E)` with E provably ≤ 0 → `1 / P5(t)`, `t = clamp(−E, 0, 8)` (P5 the
  degree-5 Taylor polynomial of eᵗ; the clamp bounds t⁵/120 inside 16.16
  and e⁻⁸ is below one 8-bit step). The quintic over the quartic costs one
  multiply-add and takes PhantomStar's emulator drift from max 2 to max 1.
- `pow(B, k)`, k a non-integer literal in (0, 4), B provably in [0, 1] →
  `B (a + (1 − a) B)` with the least-squares `a = 30 (1/(k+2) − 1/(k+3) −
  1/20)` computed at compile time (exact at 0 and 1).
- the Shader library's `tanh` helper body → the rational form ZippyZaps
  hand-won (clamp to ±3).

Domain proofs are an interval analysis over pure expressions (literals,
render coordinates unless the member transforms them, single-assignment
locals and constants, straight-line earlier assignments in the same block,
the bounded built-ins, and `abs`/`sqrt`/`hypot` of anything as [0, ∞)).
Every declined site carries a reason.

## Census and pairing

| Pattern | site | emulator drift (max / mean, 8-bit) | pb32 median FPS |
|---|---|---:|---:|
| PhantomStar | `exp(−dist·3)` per ray step | 1 / 0.16 | 0.236 → 0.242 (**+2.3%**) |
| PlasmaNebula | `pow(density, 1.3)` | 4 / 0.55 | 25.15 → 25.29 (+0.6%) |
| Kishimisu | memoized `exp(−len0)` | ≤ 1 | 12.62 → 12.62 (0%) |

Declined with reasons: PulseLoom's five `exp` sites (per-frame envelopes,
sign unproven), WavyBands' `pow(v, 1.25)` (v can be negative), the
holiday stars' `pow(…, 1/p)` (non-literal exponent), MandelbulbHeartbeat's
`pow(radius, bulbPower)` (non-literal), AuroraSphere's `asin` (a recorded
negative, not a candidate). ZippyZaps carries its own `fastTanh`, so no
stock Pattern exercises the library-tanh rewrite; the pairing for that
substitution is the ZippyZaps hand edit (+22.1%, the optimization guide).

## Verdict

The substitutions are cheap per site, but the catalogue has few per-pixel
transcendental sites and none dominates its frame: PhantomStar spends its
frame in the IFS `map()`, so one cheaper `exp` per ray step is 2%. The
option ships because it is measured, disclosed, and visually invisible on
the three Patterns it touches (contact sheets), and because it is breadth
for ShaderToy-class ports where `exp`/`tanh` per pixel is the norm; it is
not a catalogue win at this scale. `asin`/`acos` substitution is a
recorded negative.
