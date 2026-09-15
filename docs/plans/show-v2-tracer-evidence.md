# Show v2 tracer evidence (#1034)

> **Status: provisional preservation increment.** This additive tracer is not
> wired to product save, import, Undo/Redo, or admission. It does not satisfy
> the full #1034 acceptance set or approve the provisional v2 model.

## Reproducible inputs

- Base commit: `d685125b34c694f311972e258efb48d12cf05cd8`.
- Frozen #1033 plan SHA-256: `a13641e8d6233e037ac1e3993b110fce49f44f3908ad0972a50b81279d79722f`.
- Frozen provisional schema SHA-256: `776c6068c3b179d9775864def12853bd170eaaacca17fe23c57718d203d14c9f`.
- Machine-readable inventory: [`show-v2-parity-report.json`](show-v2-parity-report.json).
- Harness: `npm run show:v2-parity`; regenerate with
  `npm run show:v2-parity -- --write`.

The harness inventories repository sources directly, hashes Show semantics
excluding volatile `updatedAt`, and pins every referenced Pattern, personal
Library, stock Map, and compiler Library source. Missing dependencies refuse.
It does not use the preview wrapper's missing-personal-Pattern fallback.

## Corpus result

The report accounts for 47 available records: 40 stock Shows and seven agent
baseline fixtures. Jon confirmed on 2026-09-14 that no personal authored Show
exports exist, so that category is unavailable with zero records.

The initial frozen-model run converted two records and refused 45. The current
preservation model produces:

| Outcome | Records | Result |
| --- | ---: | --- |
| Converted, lowered, compiled | 20 | Exact matched-time Fast/Precise frames and mapped scalar state; zero parity failures |
| Conversion refused | 20 | 12 positive boundary Transition, six routing change, two Group; codes overlap with three positive-Transition track-activation refusals |
| Lowering refused | 7 | Three track activations cross an additional derived Clip/key section, two positive-Transition activation cases, two fixtures lack exact instance source lookup |

All 47 records have zero unaccounted source leaves. Carrier-free boundary Cuts
are no longer a refusal class: 21 prior Cut-identity refusals are retired with
the exact source ID, boundary owner, and global time. A Cut with any residual
transition-only payload still refuses at that source path.

The 20 accepted records have exact v1/v2 parity for matched-time output and
mapped private state in Fast and Precise, at the same phase in the second loop,
and under the harness's cold-seek comparison. This evidence covers the current
supported subset only.

## Consumer oracles

The focused suite exercises converter to lowerer to the existing compiler and
runtime:

- **Lifecycle:** an unstamped composition remains `continuous` and omits the
  compiler reset stamp; a stamped composition remains `deterministic-loop`.
  Flat Continue retains one shared instance; flat Restart derives separate
  identities. Actual output and state match through 1.25 loops in both modes.
- **Sampling:** one-Zone flat omitted sampling maps to `independent`; existing
  Composition placement maps to `span`. The first implementation's `span`
  mapping produced an immediate pixel-index counterexample, so the model now
  carries this behavior explicitly.
- **Appearance:** two v1 logical-placement segments become one v2 Clip with
  keys `clip:appearance:1@0` and `clip:appearance:2@500`. Opacity, Transform,
  and Aperture match at 249, 499, 500, 501, 750, and 999 ms with mapped member
  state in Fast and Precise. Uniform appearance canonicalizes to one key.
  JSON serialization and parse preserve the provisional record exactly.
- **Track activation:** a three-part 500 ms Cut fixture has a tracked
  Brightness Effect, an interval without that Effect, then a static re-add.
  Conversion emits `activeStartMs: 0` and `activeDurationMs: 500`. Fast and
  Precise v1/v2 output matches the source at 250 ms (`0.625`), 499 ms
  (`~0.2515`), exact 500/750 ms (`1`), and exact 1000/1250 ms (`0.5`). The
  activation interval is half-open and independent of keyframe endpoint hold.
- **Markers:** deleting, moving, or adding narrative Markers leaves generated
  code, Fast/Precise frames, and mapped private state unchanged around every
  edited time. Markers never drive compiler partitioning.
- **Transitions:** seven positive kind/policy cases (six kinds and two
  Crossfade policies) preserve recipe, source, boundary/interior frames, and
  state. This is the one-participant Layer form, not the unconverted v1
  whole-boundary form.
- **Artifacts:** normal `.epe` output reopens through the existing EPE parser.
  The additive provisional JSON codec reopens v2 bytes. This is not ordinary
  authored-v2 `.pxlshow` reopen, which remains intentionally unwired.

Runtime results copy frames and exports before advancement. Precise uses the
public `fidelity` mode. The corpus harness declares a 16 ms fixed schedule with
split final steps; it does not claim the preview UI's `1000 / 60` schedule or
Trails `clear-at-target` behavior. The exact activation-value oracle uses the
same direct live deltas on both sides so repeated fixed-point timestep rounding
does not masquerade as a lifecycle result.

## Diagnosed repair history

Retiring structural Cuts initially admitted three stock Shows whose final
sample diverged. The first lowerer collapsed every global Clip and property
track into one compiler section. That made source Scene-local track activation
coexist in one section and allowed held endpoints to affect later content.
Deriving transient sections from Clip and appearance-key boundaries, rebasing
placements/tracks, and adding explicit half-open track activation fixed all
three. Marker times are not part of the derivation.

The original Effect-target validator also checked an Effect identity across
every appearance key. v1 requires the identity only in appearance spans that
intersect the track's active interval. The validator now enforces that exact
intersection. An Effect absent exactly at the active end is valid.

## Current refusal and implementation ledger

| Area | Current result | Classification |
| --- | --- | --- |
| Unknown or malformed source fields | Structural validation refuses before conversion; immutable input | Intentional fail-closed rule |
| Carrier-free v1 Cut | Retired with exact source/time accounting; output/state parity proved | Supported |
| Cut with residual payload | Refuses at exact payload path | Requires explicit payload rehoming before support |
| Track activation within one derived section | Global half-open interval lowers to source contribution; Effect identity checked only on intersection | Supported |
| Track activation crossing another Clip/key boundary | Three stock records refuse before compile | Next lowering implementation: partition one activation without changing its curve/holds |
| Positive-boundary track contribution | Typed refusal; nominal Clip rectangles are not substituted | Next conversion/lowering proof: preserve both source contributions during the Transition |
| Whole-boundary positive Transition | 12 records refuse; direct one-participant Layer matrix is green | Converter implementation remains |
| Routing/Layout occurrence change | Six records refuse | Lowering/compiler proof remains |
| Group definitions/occurrences | Two records refuse | Materialization and occurrence-private runtime proof remains |
| Flat fixture without exact instance lookup | Two fixtures refuse | Dependency qualification, not a model decision |
| Coincident positive windows in different Zones | Provisional v2 validates; current v1 scheduler rejects | Compiler-domain decision gate |

### Smallest compiler-domain counterexample

Two Zones each contain an outgoing Clip ending at 400 ms and an incoming Clip
starting at 600 ms. Separate Crossfade and Wipe records own the same 200 ms
window. The provisional v2 record passes structural/domain validation. The
current adapter and compiler have one shared transition render target and
reject the overlap even though the Zones differ. Current accepted v1 input
also rejects this overlap, so this is proposed v2 domain widening rather than
loss of a supported v1 record. No workaround or compiler change was added.

## Remaining proof gaps

This increment does not prove full #1034 acceptance. Named gaps include:

- incoming/outgoing private-state contribution and pre-roll during positive
  Transitions, unrelated content entering/leaving a window, alpha/source-over
  interaction, and simultaneous Layout transfer;
- shared instance once-per-frame behavior across an actual gap and simultaneous
  users, plus Freeze, Strobe, Blink, Trails, and occurrence-private Groups;
- repeated/reconfigured Layout occurrences, Zone disappearance/reappearance,
  and Group/Clip behavior across Layout change;
- ordinary authored-v2 `.pxlshow` reopen and later save, history, admission,
  and persistence flows.

The report retains `fixedStepFreshPhaseResiduals` as a diagnostic. Repeated
16 ms stepping does not produce an exact fresh-phase raw-state oracle because
Fast accumulates tiny floating residuals and Precise quantizes each timestep.
Second-loop v1/v2 parity remains exact. The focused deterministic-reset case
uses exact 1000 ms and 250 ms deltas and proves reset in both modes.

## Gate status

Keep the model and tracer provisional. The current preservation increment is
ready for candidate review once committed, but #1034 remains open. Do not begin
#1035 or wire production consumers until the remaining named proof families
and the coincident-transition compiler-domain decision are resolved.
