# Agent editing baseline (#945)

This baseline combines repeatable no-paid-call diagnostics from the actual Show
editor route with one bounded paid semantic corpus run. The browser evidence
measures visible adoption, durable save, and preview publication with a scripted
agent. The paid evidence measures Luna's intent reliability, provider-call time,
call count, and tokens without a browser. The proposed combined thresholds add
those separate measurements; they are not a direct live-model browser trace and
remain unaccepted until #946.

The unpaid live-run preflight is pinned in
[`evidence/issue-945-live-baseline/unpaid-preflight.md`](evidence/issue-945-live-baseline/unpaid-preflight.md).
It records the initially empty $20 ledger, the 43/43 fake-corpus control, and
held-out metadata verification before the live run.

Contracts this evidence serves:
[agent candidate application](contracts/agent-candidate-application.md),
[Show state, history, and persistence](contracts/show-state-history-persistence.md),
[Show command semantics](contracts/show-command-semantics.md).

## Preview dependency qualification (#955)

Stage compilation now includes current personal Libraries, repairing the historical
H missing-Library preview result below. H requires publication matching the
adopted record as well as its existing save/export/reopen and Undo checks. F uses
plain Clips with a Scene-boundary Cut before timing its two-setting batch; setup
is outside the measured interval. Historical timings remain historical.

The #955 before/after run used the same dev instrumentation on base `b1cc21e6`
and the repaired consumers, respectively, with a scripted 2500 ms bridge delay.
Repo Chromium collected timing channels; the coordinator's separate in-app
browser captures show the actual UI. Setup and Undo are outside the timing window.

| F channel (ms unless noted) | Before | After |
| --- | ---: | ---: |
| Submit to apply completion | 2779 | 2779 |
| Native sampled input processing | 3.3 | 3.1 |
| Actual compiler work | 17.1 | 18.4 |
| Adoption to matching preview | 57 | 58 |
| Actual final-state compilations | 1 | 1 |

Each input total covers 28 reported native entries; events below the reporting
threshold remain unmeasured. These single runs establish no meaningful latency
improvement. The batch already avoids private intermediate compilation, so no
compiler optimization or new scheduling owner was justified. H now publishes its
adopted Library-backed preview (48 ms in this run) and passes its existing complete
record, one-save, exported/reopened Show and Undo oracles.

All seven fixture artifact reports match the unchanged base exactly after removing
only `scriptedTurnMs`. Both runs report the same six historical post-edit Show
bundle byte/hash pin differences; those pins were not rewritten. Generated
Pattern hashes are unchanged. The affected component checks and existing
Fast/Precise replay/checkpoint/Controller artifact cases pass; delayed Save after
editor unmount now refuses through the existing snapshot check. These are browser
and synthetic-provider observations, not Controller hardware proof.

## Private two-Clip rearrangement (#949)

Sequence PP now qualifies a finite private two-plain-Clip swap: one complete
saved record, real export/reopen and Undo, incomplete discard, and stale
delivery preserving manual work. [Private-pair evidence](evidence/issue-949-private-pair/README.md)
records the committed source and consumer results. Historical fixture hashes
remain unchanged; broader temporary compositions and canonical move parity
remain outside this qualification.

## Diagnostic waiting protocol (#949)

The diagnostic overlay consumes the internal bounded wait and displays Cancel.
The FA browser regression uses the actual Clip duration field while a real scripted
request is in flight. A dirty draft keeps the candidate waiting without a visible
record/history/provider change. Escape permits one exact adoption/save and an
export reopened by the production importer; Enter publishes the manual duration
first and refuses the stale candidate. Pointer-clicking diagnostic Cancel preserves
the inspector, draft and focus without adoption. Focus-only permits immediate
adoption. Accepted and manual records are compared in full with durable records;
one Undo restores the original record.

These checks qualify the registered shared text/numeric field families (including
BoundedNumberField wrappers and slider portals), alongside focused lifecycle tests.
GA adds actual Clip resize cancellation/manual commit and Show End manual commit
through the same scripted bridge, with complete visible/durable record comparison,
one history/save and production export reopening. Focused lifecycle tests cover
native/shift-pointer Clip move/duplicate and Marker creation/movement, including
pointer identity, session rebinding, save rejection and overlapping field ownership.
Placement-pad, sparkline, Effect reorder and retained physical-zone input ownership,
external narrow context, and the final Agent panel remain outside this proof. The fixture's existing reference-map delivery diagnostic is unchanged;
successful authoring does not claim Controller delivery readiness.

## Commands

| Command | What it proves | CI |
| --- | --- | --- |
| `npm run test:e2e:agent-baseline` | Live editor cases, including #950 exact resize R: B2 exact gating plus A-D stale/session prevention and E-H retained recovery/adoption cases. Writes `reports/agent-harness/baseline/browser/<run>/` (captures, selected phase records and the bridge log). | explicit only; not a push gate |
| `npm run agent:baseline:fixtures` | Every baseline fixture exported as `.pxlshow` and `.epe` at a fixed stamp, one scripted bridge turn, export again; compares hashes against `src/agent-harness/baseline/evidence/fixtures.json` and exits 1 on drift. `-- --write` re-records after a human has read the diff. | explicit only |
| `npm run agent:smoke`, `npm run agent:corpus -- --fake` | Unchanged from the first slice: bridge path and corpus without an editor. | manual |
| `npx vitest run src/agent-harness src/dev` | Bridge request-id and phase-clock tests, fixture-set coverage and record-hash pins, the observation log. | `npm test` |

The suite spawns `BRIDGE_AGENT=scripted npm run agent:bridge` on an ephemeral
loopback port with `BRIDGE_DELAY_MS=2500`, loads the bridge's own `chat.js`
into the editor tab, and types into that overlay. Nothing is mocked between
the overlay and the store: HTTP, NDJSON, the in-memory MCP pair, a grammar
session, the shared turn runner, `__pxlblzEditor.applyShow`, `updateShow`,
the personal-content PATCH, and the stage preview compile all run for real.
`page.route` is used once, to abort one PATCH in sequence E.

## Pins

| Item | Value |
| --- | --- |
| Code | historical #945 observations through `4e02adcf`, base `b1fbc1e5`; sequence E green oracle introduced by #948 at `bd4cb878` |
| Browser | Playwright Chromium `chromium-1223` / `chromium_headless_shell-1223` (`npm run check:playwright`) |
| Runtime | `scripts/run-authenticated-playwright.ts`: one worker-dev Vite process, isolated migrated D1, synthetic worker identity |
| Agent | `scripted-fake` (corpus fake agent) through `src/agent-harness/bridge/service.ts`; completion delay 2500 ms; no credential read |
| Utterances | `make the first Clip twelve seconds`, `make the first Clip twelve seconds and dim it to half`, `add a marker at ten seconds called Drop` (`src/agent-harness/baseline/scripts.ts`) |
| Fixtures | `src/agent-harness/baseline/fixtures.ts`; record and artifact hashes in `baseline/evidence/fixtures.json` |
| Editor Show | Installation Show created through the UI: TestPattern1D 0–30 s, CometLoom 30–60 s, a 2 s crossfade |
| Model/effort | none (no paid call in this slice) |

## Historical observed outcomes

The #945 run below established all eight bad outcomes as reproductions. #948
inverted sequence E in place: its current oracle requires the saved candidate
to remain visible after a later failed save, remain durable, and reopen as the
same record. B2 inverted A-D to prevention assertions and added exact URL gating. E now begins
with an eligible candidate because stale application is correctly refused. F-G
retain adoption/draft assertions; H retains its separately unqualified preview limitation.

| Seq | Sequence | Observed on the live editor |
| --- | --- | --- |
| A | Delayed reply, manual brightness edit B during inference | Visible after reply: Clip 12 s, brightness 100 %. B is gone. The candidate's PATCH carries the captured `updatedAt`, older than B's PATCH; storage holds the candidate. One undo restores B (30 s, 75 %). |
| B | Target Clip deleted during inference; then the restored target is dragged from 0 s to 15 s during a second delayed request | The first reply resurrects TestPattern1D at 12 s. The real timeline drag shows a 15 s move preview, saves the target at 15 s, and remains visibly at 15 s before the reply. The delayed marker reply replaces it back at 0 s while adding `Drop`; storage matches that stale replacement. One undo restores the dragged 15 s state and removes the marker. |
| C | 5 s inserted at 0 during inference | The insert saved (first Clip at 5000 ms, loop 67 000 ms). The reply put the Clip back at 0 ms and the loop back to its previous length. |
| D | Navigate to another Show and back during inference | The reply arrived after the return, `applyShow` accepted it on the re-installed editor, the Clip shows 12 s, storage holds 12 000 ms. |
| E | A after which a later manual save fails | The failure notice appears; the editor shows B (30 s, 75 %); storage holds the candidate (12 000 ms, brightness 1); reload shows 12 s, 100 %. The restored baseline did not match storage. |
| F | Two operations in one reply | 12 s at 50 % visible and durable; exactly one candidate PATCH; one undo restores 30 s/100 %, redo re-applies. |
| G | Built-in Show draft | Marker `Drop` at 10 000 ms visible in the record; zero personal-content writes; Reset and Undo enabled. |
| H | Personal Pattern calling a personal Library | The reply applied and saved (12 000 ms). The stage preview shows `Unknown library namespace "Blz"`: the preview compile passes no personal Libraries, so no preview publication matched the candidate. `.epe` export in the harness fails the same way (fixture evidence). |

The #948 store regressions and shared authoring contract establish sequence
E's single-client recovery policy. An unsandboxed host run at `68a9aa48` passed
the new browser assertions and reopen check in 9.9 seconds. Its record and
capture are under
`reports/agent-harness/baseline/browser/2026-09-06T03-24-40-328Z/`.

The original #945 fixture command recorded three refusals verbatim: on the stock lesson 101,
the property-animation reference, and the changing-layouts lesson, resizing
the first Clip to 12 s overlaps the next Clip and the grammar refuses. The
Groups lesson, the constructed six-minute Show, and both personal fixtures
accept it.

The current #950 fixture evidence explicitly selects the named original
`make the first Clip twelve seconds` scenario, independently of browser utterance
ordering. Canonical resize now reports the three capacity refusals as 0–5000 ms
and also refuses the long-timeline edit because it would remove a visual
Scene-boundary Transition. Both personal fixtures and the Groups lesson still
accept 12 seconds. Their after-artifact hashes remain identical to #945; only
the successful summary wording changes. All seven source records and before
artifacts retain their original hashes, including the personal-Library export
failure. For deterministic evidence only, returned candidate `updatedAt` is
reset to the source fixture timestamp before export and hashing: canonical
commands now stamp this bookkeeping field at execution time. No other candidate
field is normalized, and the bridge's actual candidate is unchanged.

## Instrumentation and raw records

Request ids: the overlay mints `req-…` at submission and sends it in the body;
the bridge echoes it on every NDJSON line and log line and mints `bridge-…`
when absent. Bridge phase clock on the `done` event (`timing`): accepted,
agent start (after the scripted delay), agent end, each tool call with its
duration and any refusal message, final validation inside the session commit,
export. Editor and preview seam (`src/dev/agentObservation.ts`, dev builds
only, read through `window.__pxlblzObservations.read()`): `agent-apply`
phases `admitted`, `adopted`, `settled`/`failed`/`rejected`, with a digest of
the record the editor then shows, and `preview-published` when a rebuilt
stage runtime paints its first frame, with the digest of the record it
compiled from. No utterance, reply, or Show content enters the observation
log. The overlay keeps its own phase record under `window.__pxlblzChat.requests`.

The same dev log now records `show-compile` request duration, actual compiler
duration (null for a cache hit), cache outcome and Show digest. `input-event`
records native event processing separately from the browser's event duration;
its 16 ms reporting threshold means missing samples cannot be treated as zero.
These are diagnostic timings, not hardware measurements or acceptance limits.
Publication phases retain 200 entries independently of the 200 compile and 200
input entries; reads return at most 600 entries in insertion order. Measurement
floods cannot evict the adoption/settlement/publication correlation channel.

Each sequence's JSON record holds the overlay request record, the bridge
timing, the observation log, every non-GET `/api/shows` request with status,
`updatedAt`, and first-Clip facts, the visible and durable facts, and a
derived `timeline`.

Observed scripted timing across the nine requests in the eight sequences of run
`2026-09-05T15-20-32-601Z` (milliseconds; scripted delay 2500):

| Phase | Observed |
| --- | --- |
| submit to bridge accepted | 1–3 |
| accepted to agent start (the delay) | 2503–2670 |
| agent (fake) | 1–7 |
| final validation | 0–3 |
| export to overlay `done` | 0–1 |
| `done` to `applyShow` adopted | 0–1 |
| adopted to save settled (PATCH 200) | 42–167 personal; 27 stock draft (no request) |
| adopted to preview published | 28–68 (none for H) |
| submit to `applyShow` resolved | 2535–2765 |

These are wall-clock figures from one machine with a fake agent and say
nothing about model latency. They locate where the non-model time goes on the
current code.

## Live baseline

The guarded Luna/high run measured every ordinary corpus case exactly once.
Forty-two of 43 cases passed. The one failure asked a question after discovering
that the vignette Effect uses `amount`, not the requested `strength`; the turn
rolled back, so the expected edit was absent. A semantically wrong or rolled-back
turn remains a failure even when its prose is helpful.

### Pins

| Item | Value |
| --- | --- |
| Run | `2026-09-06T02-58-07-759Z-53104`; 2026-09-05 19:58–20:01 PDT (2026-09-06 02:58–03:01 UTC) |
| Corpus fixture | All 43 `DICTATION_CASES` against `dictationFixture`; exact ordered membership in `run-02/run-manifest.json` |
| Code | Corpus semantics and fixtures at `ef1da005bf8bd4bb7769c76117517ce0811f97b5`. The executable tree also contained the shared protected-file credential loader committed byte-for-byte immediately after the run as `079e7b683cc9e001ddeaadc1b389318aeec3fb19`. |
| Model | `gpt-5.6-luna`, reasoning effort `high`; this is an experiment pin, not a production choice |
| Request | Responses API, `service_tier: default`, `truncation: disabled`, 4000 maximum output tokens, function tools only |
| Prompt cache | No explicit cache key or retention setting. Provider usage reported 883,075 cached of 973,014 input tokens (90.8%); the first call reported zero cached tokens. |
| Browser | None in the paid corpus. Browser figures below remain the separately pinned Playwright Chromium `chromium-1223` scripted run. |
| Held-out | Not loaded, executed, scored, or used for tuning; only the earlier metadata verifier ran |
| Raw run | [`evidence/issue-945-live-baseline/run-02/`](evidence/issue-945-live-baseline/run-02/) |

All 43 transcripts are committed because they contain no credential material
and total 301,707 bytes, below the 1 MB limit. The local ignored source run
remains at `reports/agent-harness/corpus/issue-945-live-run-02/`; a byte-for-byte
comparison against the committed copy passed.

The first invocation made zero calls because the corpus CLI did not implement
the README's `AGENT_HARNESS_ENV_FILE` contract. The ledger stayed empty. The
shared loader repair and its red-then-green test are commit `079e7b68`; the
zero-call record is
[`run-01-zero-call.txt`](evidence/issue-945-live-baseline/run-01-zero-call.txt).

### Intent reliability

`Pass` means the expected outcome and every case assertion passed. `Fail` means
either disagreed. `Actual refusal` counts a `refuse` response separately; it may
be a correct pass, as it was here.

| Operation family | Cases | Pass | Fail | Actual refusal |
| --- | ---: | ---: | ---: | ---: |
| animation | 7 | 7 | 0 | 0 |
| clips | 19 | 19 | 0 | 1 |
| effects | 3 | 2 | 1 | 0 |
| junctions | 3 | 3 | 0 | 0 |
| layer-transitions | 3 | 3 | 0 | 0 |
| structure | 3 | 3 | 0 | 0 |
| timeline | 5 | 5 | 0 | 0 |
| **Total** | **43** | **42** | **1** | **1** |

The expected-outcome partitions were 34/35 edits, 5/5 asks, and 3/3 no-edit
cases. Of the no-edit cases, two asked and one refused. All five ambiguity cases
asked as expected. The sole failure was `effects-add-vignette`
(effects/ordinal): outcome `ask`, expected `edit`; the Clip had no vignette after
transaction rollback. No case used a generic operation.

### Model latency

Per-call latency is each Responses request's wall time. Total model latency is
the sum of those calls within one case, excluding the harness work between
calls. Median uses the middle value (or the mean of the two middle values);
p90 uses nearest rank, `sorted[ceil(0.90 × n) - 1]`. An outlier below means
strictly greater than p90. The derived values are also pinned in
[`derived-metrics.json`](evidence/issue-945-live-baseline/derived-metrics.json).

| Distribution | n | Median | p90 | Max |
| --- | ---: | ---: | ---: | ---: |
| Per model call | 58 | 3,321.5 ms | 5,824 ms | 7,153 ms |
| Total model calls per case | 43 | 3,958 ms | 7,885 ms | 12,977 ms |
| Per-case harness time beyond model calls | 43 | 3 ms | 6 ms | 10 ms |

| Distribution | Outlier | Calls | Time |
| --- | --- | ---: | ---: |
| Per call | `animation-owner-example`, call 2 | 1 | 7,153 ms |
| Per call | `refuse-overlap`, call 1 | 1 | 7,109 ms |
| Per call | `effects-update-parameter`, call 1 | 1 | 6,626 ms |
| Per call | `effects-add-vignette`, call 1 | 1 | 6,200 ms |
| Per call | `clips-time-scale`, call 1 | 1 | 6,072 ms |
| Per case | `animation-owner-example` | 2 | 12,977 ms |
| Per case | `effects-add-vignette` | 3 | 12,273 ms |
| Per case | `clips-batch-resize` | 4 | 11,395 ms |
| Per case | `effects-update-parameter` | 2 | 9,835 ms |

Call count per case was 31 with one call, 10 with two, one with three, and one
with four: 58 calls total, mean 1.35, maximum 4. No rate-limit wait occurred;
response headers reported 500 requests/minute and 500,000 tokens/minute.

### Tokens and accounting

The run used 973,014 input tokens, including 883,075 cached tokens; 7,822 output
tokens, including 4,728 reasoning tokens; and 216.150 seconds inside model
calls. The case-turn sum was 216.288 seconds and the manifest wall interval was
216.565 seconds.

The durable ledger is authoritative for the experiment budget: all 58 entries
settled, with zero ambiguous, unsettled, or overrun entries and no halt. Settled
spend was **$0.049526**; **$19.950474** remains of the $20 aggregate allowance.
The report's `$0.045` line is its transferred flat-rate diagnostic, not ledger
accounting. The final `npm run agent:budget` output is preserved verbatim in
[`final-budget-status.txt`](evidence/issue-945-live-baseline/final-budget-status.txt);
the run-local totals and zero unmeasured cases are in
[`run-02/budget.json`](evidence/issue-945-live-baseline/run-02/budget.json).

### Complete outcome timing

The paid run did not drive the browser, so the completion figures remain the
scripted route measurements above and stay separate from model time:

| Browser outcome | Observed non-model evidence |
| --- | --- |
| Visible application | `done` to synchronous store adoption: 0–1 ms. Across the complete route, a conservative upper bound after removing the fixed 2,500 ms delay is 238 ms: the 265 ms maximum submit-to-durable remainder minus the 27 ms minimum adoption-to-settlement interval. This bound still includes the fake agent's 1–7 ms. |
| Durable save | Adoption to settled PATCH: 42–167 ms for personal Shows; 27 ms for the stock draft with no request. Submit to `applyShow` resolution was 2,535–2,765 ms, or 35–265 ms after removing the fixed delay; that remainder still includes the 1–7 ms fake agent. |
| Preview publication | Adoption to the first matching compiled frame: 28–68 ms. The personal-Library fixture published no matching preview. |

### Proposed thresholds (not accepted)

These are proposals for Jon at #946, not current product requirements. They use
the measured model median and nearest-rank p90 without padding, then add the
conservative browser-route upper bounds above. Exact unrounded sums are shown so
#946 can choose a rounding policy instead of inheriting hidden slack.

| Metric | Proposed median | Proposed tail | Derivation |
| --- | ---: | ---: | --- |
| Total model time per request | ≤ 3,958 ms | p90 ≤ 7,885 ms | Measured total-model distribution |
| Submit to visible adoption | ≤ 4,196 ms | p90 ≤ 8,123 ms | Model value + 238 ms conservative pre-adoption bound |
| Submit to durable settlement | ≤ 4,223 ms | p90 ≤ 8,150 ms | Model value + 265 ms conservative submit-to-durable bound |

Responsiveness proposal: while a request is pending for as long as the observed
12,977 ms model maximum, the editor must continue to accept keyboard edits,
timeline drags, time insertion, navigation, undo/history, and ordinary saves;
no input path may await the model request. Intervening manual work must remain
visible and durable rather than being silently replaced when the candidate
arrives. The existing browser baseline proves the controls remain operable but
also proves the stale candidate can overwrite their result, so the current
system does not yet satisfy the second sentence.

Latency never trades against correctness. A comparison that is faster but falls
below the measured partitions (34/35 edits, 5/5 asks, 3/3 no-edit) is a
regression, not a performance improvement; those counts describe this baseline,
not an accepted quality ceiling. The goal remains as fast as possible after the
correctness checks, durable settlement, and matching preview publication hold.

## Known gaps in this slice

- The captures are Playwright Chromium screenshots from the isolated test
  harness; no in-app-browser proof is claimed.
- The stage preview ignores personal Libraries (sequence H); recorded, not fixed.
- The paid corpus and browser timings are separate runs. The additive
  submit-to-visible and submit-to-durable figures are proposals, not observed
  live-model route distributions.
- `effects-add-vignette` failed one of 43 ordinary corpus cases. It was not
  rerun or tuned.
- The threshold proposals are not accepted; #946 owns that decision.
- The sealed held-out set remains untouched until #958.

## B2 current diagnostic qualification

The current suite requires exact `agent=1`, rejects off/ambiguous flags, clears
transcript on departure and query removal, preserves manual updates/deletion/movement/
time insertion against late full-record replies, and keeps manual Undo/save usable.
The adapter tests cover immutable envelopes, duplicate delivery, edit-undo and external
Pattern/Library/Map restoration, malformed/new missing references, bounded completed
turns and actual delayed save receipts. Historical observations above remain pinned
to their original code and are not present-behavior claims. Active-input waiting,
final panel, hosted service and broad-model Layer independence remain unqualified.

Browser proof uses repository Playwright. The in-app browser connected, but its
documented API allows read-only evaluation and advertises no cookie/session setup
or script injection; the two capability probes established that limit before the
explicit fallback. The fallback uses synthetic authenticated real routes and the
actual manually injected overlay/HTTP/scripted service without paid inference.

## Canonical resize qualification (#950)

[Fixture R evidence](evidence/issue-950-resize/README.md) records exact boundary
adoption, valid no-op, capacity refusal and undo/redo through the scripted live
route. It does not claim paired manual/agent or Layer-independent context proof.
