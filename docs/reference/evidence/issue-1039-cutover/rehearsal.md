# #1039 row-conversion rehearsal

The section 10 migration runbook, rehearsed end to end against a real local D1
store. Local only: there is no remote backend, and no push, deploy or remote
migration was attempted. The remote pass stays blocked on the recorded
Cloudflare migration authorization failure.

## Setup

| | |
| --- | --- |
| Runtime | isolated issue runtime, `npm run dev:issue -- --issue 1039 --description "v2 cutover" --profile isolated`, port 5212 |
| Store | that runtime's own D1 under its `--persist-to` directory |
| User | the runtime's synthetic local identity |
| Corpus | the pinned #1034 corpus - 40 stock Shows and 7 agent baseline fixtures - written through the production v1 writer `createD1Show`, plus one deliberately malformed row with no output contract |
| Seeding | `tsx src/agent-harness/run.ts scripts/seed-show-v2-migration-rehearsal.ts --persist-to <dir> --user <id>` |
| Command | `tsx src/agent-harness/run.ts scripts/show-v2-migrate.ts <inventory\|convert\|rollback> ...` |

The baseline fixtures that declare their own personal Patterns and Libraries
have those rows seeded too, so the personal-dependency conversion path is
rehearsed rather than skipped.

## Passes

**Inventory.** 48 rows, 0 already v2, every row `unrecorded`. The malformed row
is listed with its decode error rather than omitted.

**Pass A - interrupted.** `convert --stop-after 5` stopped after five rows and
exited 3, printing the resume instruction. A following inventory showed exactly
those five rows at v2 with recorded outcomes; the rest were untouched.

**Pass B - resume.** Re-running the same command with no `--stop-after`
resumed from the recorded per-row outcomes and finished the pass. Exit 1,
because one row refused.

| Status | Rows |
| --- | --- |
| `converted` | 42 |
| `already-v2` | 5 (the pass A rows, resumed rather than rewritten) |
| `refused` | 1 |

The single refusal is the deliberately malformed row: *"Show
rehearsal-malformed-row is missing a valid output contract"*. All 47 real
records converted, read back byte for byte, reopened through their portable
`.pxlshow` bytes, resolved their dependencies through the ordinary v2 import
planner, and compiled. The report is
[`conversion-report.json`](conversion-report.json).

**Pass C - idempotency.** Running `convert` again with no changes reported 47
`already-v2` and the same 1 `refused`, and wrote nothing. The report is
[`idempotent-report.json`](idempotent-report.json).

**Rollback.** Rehearsed on a disposable copy of the converted store, never on
the store the runtime serves. `rollback --ids <the 47 converted identities>`
restored 47 rows and exited 0; the owner's restore asserts each row comes back
byte for byte against its recorded source hash before it reports success. A
following inventory on the disposable copy reported *48 rows; 0 already v2* -
every converted row back at v1, with its migration outcome cleared. The
converted store itself was unaffected.

## What the rehearsal changed about the runbook

Two gaps in the landed owner surfaced only against real rows, and both are
repaired in this candidate.

**Flat rows could not convert.** `rehearseShowV2Migration` called
`convertShowRecordV1ToV2` with no source lookup, and a flat v1 row - no
composition sidecar, Clips in `cells`, which is the shape an old personal Show
has - refuses without the exact Pattern source per cell. On the first rehearsal
three baseline rows refused with *"Flat conversion requires the exact Pattern
source for cell c1"*. Against a real personal database that would have refused
most of the rows the migration exists to convert. The owner now takes a
`sources` hook, and the command resolves it from the same database's stock
catalogue and `personal_patterns`. An unresolvable reference still contributes
nothing, so a row whose source is genuinely gone refuses by name instead of
converting against a guess.

**Readback proved storage, not usability.** The owner compared the reopened row
byte for byte with the candidate and stopped there. Section 10 asks for read
back, reopen *and* compile. The owner now takes a `qualify` hook that runs on
the row as read back from storage; the command supplies
`qualifyMigratedShowV2Record`, which rebuilds the portable bundle, serializes
and re-parses it, requires version 2 and an exact match, resolves dependencies
through the ordinary v2 import planner, and prepares and compiles the record. A
qualification refusal is a reported outcome, not a thrown pass: the row keeps
its snapshot and the operator restores exactly the reported identities.

## Redaction

The committed reports carry only Show identities, source hashes, source
versions, statuses and bounded refusal details. No Show name, Pattern source,
Library source or record content appears in them, by construction rather than
by scrubbing - `buildShowV2MigrateReport` never reads those fields, and a
refusal detail is collapsed to one line and truncated at 240 characters. The
user identity appears only as a hash. The rows in this rehearsal are synthetic
in any case: stock Shows and committed agent baseline fixtures.

## Residuals

- The remote pass and its deployed-tip evidence are blocked and were not
  attempted. The command has no `--remote` backend, deliberately.
- No personal authored row was converted; section 10 already records that
  personal exported files are unavailable and that synthetic fixtures cannot be
  labelled personal compatibility evidence. This rehearsal is a procedure
  rehearsal, not personal-data evidence.
- The compile step's *refusal* branch is not reachable by editing a record,
  because the reopen gate revalidates and resolves dependencies first. It is
  proved by the pinned compiled-artifact hashes a qualified row carries.
