# #1039 row-conversion rehearsal

**Outcome (2026-09-25, #1105).** The remote conversion described here was never
run. Production's six v1 `personal_shows` rows were backed up off-repository
and deleted instead; `SELECT COUNT(*) FROM personal_shows` returned 0. The D1
conversion tool was then retired (#1042 Phase 5b).

The section 10 migration runbook, rehearsed end to end against a real local D1
store. Local only: there is no remote backend, and no push, deploy or remote
migration was attempted. The remote pass stays blocked on the recorded
Cloudflare migration authorization failure.

This is the second rehearsal. It re-runs the whole runbook on base
`c13ea6d19756de0c06d66d61b418a286b48dc04b` through the command as repaired by
this candidate - the working `npm run` entry point, the corrected `--stop-after`
ordering, and the Stage dimension resolved from the record - and it replaces the
first rehearsal's reports. What the first rehearsal changed about the runbook
itself is kept at the end, because that is why the owner has its `sources` and
`qualify` hooks.

## Setup

| | |
| --- | --- |
| Runtime | isolated issue runtime, `npm run dev:issue -- --issue 1039 --description "v2 cutover" --profile isolated`, port 5212 |
| Store | that runtime's own D1 under its `--persist-to` directory |
| User | the runtime's synthetic local identity, `github:local-agent-15` |
| Corpus | the pinned #1034 corpus - 40 stock Shows and 7 agent baseline fixtures - written through the production v1 writer `createD1Show`, plus one deliberately malformed row with no output contract |
| Seeding | `npx tsx src/agent-harness/run.ts scripts/seed-show-v2-migration-rehearsal.ts --persist-to <dir> --user <id>` |
| Command | `npm run show:v2-migrate -- <inventory\|convert\|rollback> ...` |

The baseline fixtures that declare their own personal Patterns and Libraries
have those rows seeded too, so the personal-dependency conversion path is
rehearsed rather than skipped.

## Passes

**Inventory.** `48 row(s); 0 already v2.` Every row `unrecorded`. The malformed
row is listed with its decode error rather than omitted.

**Pass A - interrupted.** `convert --stop-after 5` printed

```
Stopped after 5 settled row(s) at operator request.
Re-run the same command to resume from the recorded per-row outcomes.
```

and exited 3. The following inventory reported `48 row(s); 5 already v2` with
exactly five rows recorded `converted`: `baseline-animation`,
`baseline-groups`, `baseline-long-timeline`, `baseline-personal-base`,
`baseline-personal-library-pattern`. That count is the corrective this candidate
carries: the interruption now lands after the fifth outcome is durable, so the
count the operator asked for and the count the store settled agree. The previous
command interrupted inside the fifth row's qualification, which left that row
written but unrecorded.

**Pass B - resume.** Re-running the same command with no `--stop-after` resumed
and finished the pass. Exit 1, because one row refused.

| Status | Rows |
| --- | --- |
| `converted` | 42 |
| `already-v2` | 5 (the pass A rows) |
| `refused` | 1 |

The five pass-A rows are re-read, re-qualified and recorded `already-v2` rather
than skipped on the recorded hash, because a converted row's stored bytes are no
longer the bytes its outcome recorded. That is the runbook's "changed originals
are rechecked" rule doing its work on the rows the operator's own interruption
changed; their recorded source hash in the report is therefore the v2 row's.

The single refusal is the deliberately malformed row: *"Show
rehearsal-malformed-row is missing a valid output contract"*. All 47 real
records converted, read back byte for byte, reopened through their portable
`.pxlshow` bytes, resolved their dependencies through the ordinary v2 import
planner, and compiled. The report is
[`conversion-report.json`](conversion-report.json).

**Pass C - idempotency.** Running `convert` again with no changes reported
`{"already-v2":47,"refused":1}` and wrote nothing. The report is
[`idempotent-report.json`](idempotent-report.json).

**Rollback.** Rehearsed on a disposable copy of the converted store, never on
the store the runtime serves. `rollback --ids <the 47 converted identities>`
restored 47 rows and exited 0. The following inventory on the copy reported
`48 row(s); 0 already v2` - every converted row back at v1, with its migration
outcome cleared - while an inventory of the served store still reported
`48 row(s); 47 already v2`, so the copy is what was rolled back.

Converting the restored copy from scratch then reproduced the same per-row
source hashes as the original pass for every one of the 43 rows pass A had not
touched, which is the report-surface evidence that the restore returns the
original bytes rather than something merely valid. The five pass-A rows differ
there for
the reason above: this report records their v2 hash, the restored copy's records
their v1 hash.

## Redaction

The committed reports carry only Show identities, source hashes, source
versions, statuses and bounded refusal details. No Show name, Pattern source,
Library source or record content appears in them, by construction rather than
by scrubbing - `buildShowV2MigrateReport` never reads those fields, and a
refusal detail is collapsed to one line and truncated at 240 characters. The
user identity appears only as a hash. The rows in this rehearsal are synthetic
in any case: stock Shows and committed agent baseline fixtures.

## What the first rehearsal changed about the runbook

Both gaps surfaced only against real rows, and both are repaired in the landed
owner.

**Flat rows could not convert.** `rehearseShowV2Migration` called
`convertShowRecordV1ToV2` with no source lookup, and a flat v1 row - no
composition sidecar, Clips in `cells`, which is the shape an old personal Show
has - refuses without the exact Pattern source per cell. On the first rehearsal
three baseline rows refused with *"Flat conversion requires the exact Pattern
source for cell c1"*. Against a real personal database that would have refused
most of the rows the migration exists to convert. The owner takes a `sources`
hook, and the command resolves it from the same database's stock catalogue and
`personal_patterns`. An unresolvable reference still contributes nothing, so a
row whose source is genuinely gone refuses by name instead of converting
against a guess.

**Readback proved storage, not usability.** The owner compared the reopened row
byte for byte with the candidate and stopped there. Section 10 asks for read
back, reopen *and* compile. The owner takes a `qualify` hook that runs on the
row as read back from storage; the command supplies
`qualifyMigratedShowV2Record`, which rebuilds the portable bundle, serializes
and re-parses it, requires version 2 and an exact match, resolves dependencies
through the ordinary v2 import planner, and prepares and compiles the record. A
qualification refusal is a reported outcome, not a thrown pass: the row keeps
its snapshot and the operator restores exactly the reported identities.

## Third rehearsal, on the flipped build

Re-run on the activation candidate, after `SHOW_V2_ROUTE_DEFAULT` became
`true`, to prove the runbook is unchanged by the flip. Same isolated runtime
(`npm run dev:issue -- --issue 1039 --profile isolated`, port 5212), the same
seeder and the same pinned corpus - 47 v1 rows plus one deliberately malformed
row - through the same `npm run show:v2-migrate` entry point.

| Pass | Result |
| --- | --- |
| `inventory` | `48 row(s); 0 already v2.` Every row `unrecorded`; the malformed row listed with its decode error |
| `convert --stop-after 5` | `Stopped after 5 settled row(s) at operator request.` |
| `convert` (resume) | `{"already-v2":5,"converted":42,"refused":1}` - the five settled rows are recognised, not redone |
| `convert` (repeat) | `{"already-v2":47,"refused":1}` - idempotent, no second write |
| `rollback --ids <47>` | `Restored 47 row(s) from their migration backups.` |
| `inventory` | `48 row(s); 0 already v2.` - the restore is complete |
| `convert` (reconvert) | `{"converted":47,"refused":1}` |

The one refusal is the seeded malformed row, by name:
`Show rehearsal-malformed-row is missing a valid output contract`. It stays
recoverable and is reported rather than skipped. Nothing in the runbook needed
a change for the flip: the conversion path never reads the route gate, which is
the same reason the application cannot convert a row on its own.

## Residuals and open observations

- The remote pass and its deployed-tip evidence are blocked and were not
  attempted. The command has no `--remote` backend, deliberately.
- No personal authored row was converted; section 10 already records that
  personal exported files are unavailable and that synthetic fixtures cannot be
  labelled personal compatibility evidence. This rehearsal is a procedure
  rehearsal, not personal-data evidence.
- The compile step's *refusal* branch is not reachable by editing a record,
  because the reopen gate revalidates and resolves dependencies first. It is
  proved by the pinned compiled-artifact hashes a qualified row carries.
- Eight stock reference rows -
  `stock-show-reference-blend-fade-transitions`, `-dissolve-transitions`,
  `-easing`, `-shape-reveal-figures`, `-shape-reveal-transitions`,
  `-slide-transitions`, `-wipe-transitions`, `-zoom-spin-transitions` - carry a
  different recorded v1 source hash than the first rehearsal's report. The hash
  is taken over the stored D1 row, so their stored bytes differ between the two
  rehearsal bases (`51b36469` and `c13ea6d1`). The statuses and totals are
  unchanged, both pinned parity reports are exact on this base
  (`show:v2-parity` 47 records, `show:v2-native-parity` 40 Shows), and
  `src/pixelblaze/` is byte-identical between the two bases, so the compiled
  and exported behaviour of those Shows did not change. Which landed change
  moved their stored row bytes is recorded here as an open observation rather
  than explained; it is not a migration behaviour and nothing in this candidate
  depends on it.
- The Stage-dimension corrective is proved at the resolver's own partitions.
  What the dimension changes downstream is the compiler's refusal of `portal`,
  `motion` and 2D `wipe` on a non-2D Stage; no fixture in this slice builds such
  a Transition on a 3D Stage, so that consequence is proved where that gate
  lives rather than restated in the migration suite.
