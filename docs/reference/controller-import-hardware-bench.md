# Controller import hardware diagnostic

`diagnostic:controller-import` is an explicit #1221 hardware diagnostic for #2
Cark at `192.168.8.196`, firmware 3.70, 256 pixels and a 2D map. It uses the
checkout's extension in a temporary pre-granted copy, the real provider and
production Studio Save and Import controls. It belongs to no test suite, CI job,
runner plan or push gate.
Offline verification does not qualify native permission handling or hardware.

The S4 UI diagnostic below is prepared offline and remains held for Jon's later
hardware go. S1 also provides the separate direct-engine probe described next;
its results cannot qualify extension, UI or store behavior.

The production helper now serializes full-body Controller HTTP per normalized
host across page ports and holds new HTTP starts while any socket owns a Save.
Only defined owner completion or actual owner close releases that hold; provider
timeouts and local close requests do not. Cloud discovery remains independent.
The unpacked helper must be reloaded separately for adoption; helper publication
remains held. VM provider/relay tests prove this software agreement, not physical
behavior. Helper restart clears ownership, and reconnect after close can overlap
an ongoing firmware write. The direct probe enforces these Save ownership
boundaries in both HTTP modes; outside Save, only its optional serial mode
matches helper HTTP serialization. Physical Save latency/overlap measurements
remain pending.

## S1 direct-engine diagnostic

`controller-import-hardware-probe.ts` connects Node directly to **#2 Cark at
192.168.8.196** and runs the production import command in T2/T3 order. It requires
no browser, session, D1 database or real account. It is explicit operator tooling,
never imported by CI, hooks or a push gate. Help performs no network or writes.
Run from the probe's worktree with a fresh ASCII run id:

```sh
npx tsx scripts/controller-import-hardware-probe.ts --help
npx tsx scripts/controller-import-hardware-probe.ts --device 192.168.8.196 --case drain --run-id i24-drain-001 --run
npx tsx scripts/controller-import-hardware-probe.ts --device 192.168.8.196 --case control --run-id i24-control-001 --run
npx tsx scripts/controller-import-hardware-probe.ts --device 192.168.8.196 --case drain --run-id i26-serial-001 --http serial --repeat 3 --run
```

Each invocation requires the exact address, one supported case and `--run`.
Unknown/repeated arguments, reused run directories, symlink output roots and
invalid run ids refuse. Outputs stay private under ignored `.wrsp/<run-id>/`:
streaming `events.jsonl` and `socket-events.jsonl`, exact fixture `.pbp` bytes, `batch.json` and full
`report.json`. Stdout contains a sanitized JSON summary with row stages/outcomes,
operation timings, HTTP poll aggregates, saved slot/name and transient-id ledger,
outgoing measured size and resident knownness, active-id observations and fidelity
cost. Source, PBP/config/account bodies and raw errors stay off stdout. Do not
publish the private run directory.

`--http overlap` (default) is diagnostic stress scheduling: HTTP requests may
overlap outside Save. Both modes hold all new HTTP starts from the first type-1
Save frame until defined completion or actual owning socket close. Generic ack,
local close request, rejected Save and deadline do not release that hold; old
sockets cannot release another owner's hold. `--http serial`
puts saved `/p/<id>` reads, `/list` liveness polls and complete compiler acquisitions
in one FIFO queue for this probe's pinned device. A turn includes headers, body,
decode and settlement; a deadline aborts the owned operation and the turn remains
held until that operation settles. Non-OK bodies are cancelled before releasing
the turn. Compiler helper attempts share one acquisition turn without nesting
another queue admission. Queue wait and request duration are recorded separately:
`http.queue` ends at admission, before the `http.read` or `compiler.http` request
span and its 5000ms deadline begin. Aggregate maximum concurrency and queue wait
distinguish probe pressure from service time. The setup readiness deadline still
covers five seconds total, including queue wait. Polls get ordinary FIFO turns;
shutdown cancels queued polling. This is optional diagnostic scheduling, not
product HTTP serialization or evidence that the firmware serializes requests.

`--repeat N` defaults to 1 and accepts positive safe integers; control refuses
values above 1. Repeat 1 retains the artifact layout and fixture names above.
For larger drain runs, the exclusive run directory contains `batch-001/`,
`batch-002/`, etc., each with the existing private artifacts, plus an aggregate
`report.json` at the run root. Fixture names and account identities include the
batch index. Each batch performs fresh inventory, mints new slots, selects the
saved LineDancer2D and confirms its active id and unknown resident cache. It owns
fresh in-memory accounts, receipts, connections and HTTP resources. Cleanup
finishes before the next batch starts. Between batches, the probe awaits the
prior socket's actual close event, then settles for at least 1000ms before
constructing the next socket. Earlier connect failures came from a socket pool
exhausted by abrupt probe closes; clean close and awaiting actual close address
that failure. The 1000ms settle matches the product default and remained unchanged
for clean-close qualification so the rerun changed one variable. Removing it is
proposed for S4 cleanup. It adds no connect retry. The first batch proceeds without
a settle timer, and defaults remain overlap/repeat=1. The first HTTP stop, lost connection,
failed/unqualified result or thrown setup failure ends the sequence without a
batch retry. Reports include requested/completed counts, each outcome and the
first stop's batch, phase, operation and last attempted save ordinal/slot where
known. Save phase remains distinct from failure phase; an uncorrelated liveness
stop explicitly records no save correlation. Full per-batch timing, rows and slot
ledgers remain private; stdout exposes sanitized summaries. Failed or incomplete
sequences exit nonzero. Every drain batch still needs an observed import drain
activation to qualify. Only after every requested batch qualifies, the probe
waits for the last socket's actual close and the same 1000ms settle, then makes
one fresh connection with no HTTP, protocol commands or Save. This separate
post-run check connects once, awaits actual open and cleanup, and requires a
clean path with actual close code 1000. It has no retry. Any batch, setup or HTTP
failure skips the check entirely. Its sanitized `postRunConnectCheck` result
appears separately in stdout and the repeat>1 aggregate report, without changing
requested/completed counts, outcomes, batches or first-stop semantics. Overall
success and exit status require both batch qualification and post-run success;
post-run failures use `connection.connect` or `connection.close` in that separate
summary. Repeat 1 keeps its existing batch report. Both repeat modes gain private
run-root `post-run-connect-report.json` and `post-run-socket-events.jsonl` files
when the check runs. Defaults and help flags remain unchanged.

The probe creates two in-memory A Patterns named `Test pat I24 <run-id> T2/T3`,
green and blue with 1D/2D render functions, original A identity stamps and real
device-compiler bytecode. It checks compiler readiness with an initial tiny compile
before polling or writes, refuses name collisions, allocates fresh slots absent
from the initial inventory and verifies
each fixture's exact saved bytes with setup-only readiness polling bounded to
five seconds total. Only setup retries missing/different saved bytes and the known
`Saved program ... is not a readable PBP blob.` recovery error, waiting at most
100ms between reads within that fixed deadline. Read timeouts, HTTP/network errors,
failed guards and deadline expiry stop setup immediately. Each run has fresh
in-memory B Patterns, receipts, bindings, push records and labels; A source is never a canonical B
candidate. These are current stored-artifact imports. S3 source policy is outside
this probe's scope.

Both cases call [`importControllerPattern`, lines 280–340](../../src/engine/controllerPatternImportExecution.ts#L280-L340)
through [`runControllerPatternBatch`, lines 28–38](../../src/engine/controllerPatternBatch.ts#L28-L38),
concurrency one, T2 then T3. Ordinary row errors continue to the next captured row.
The product write queue, drain/save/immediate-read/verify/activate sequence,
timeouts and batch implementation remain unchanged. No sleeps or read retries
are added around import. The UI preserves selected-id order and uses this same
serial helper in [`ControllerSavedProgramsPane`, lines 1426–1441](../../src/components/ControllerSavedProgramsPane.tsx#L1426-L1441)
and [lines 1469–1474](../../src/components/ControllerSavedProgramsPane.tsx#L1469-L1474).

The **drain** case requires exactly one existing saved name containing
`LineDancer2D` (case-insensitive), reads its bytecode size, switches to it with
`save:false` after setup and confirms its active id. That switch invalidates the
provider's resident cache. The measured outgoing size is separate from the
product-reported unknown resident size, which forces the production drain policy.
At least one confirmed import drain activation is required to qualify the case.
The **control** case instead compiles and confirms a tiny luminous 2D run-only
Pattern, seeding a known small resident footprint. It imports the same fixtures;
any confirmed drain activation fails the no-drain precondition. Neither case
creates a saved control slot.

Independent raw `GET /list` polling begins before setup writes, with one request
in flight and a 5000ms deadline covering headers and body. Each next attempt starts
1000ms after the previous attempt settles. Polling continues through the batch and
60 seconds after it ends, including ordinary row failure. Config/active-id
observations are timestamped during that window.

Exactly 20 ungated seconds without a full successful 2xx body read, measured from
poll start or the last success and excluding socket-owned Save holds, declares
`stopped-http-unavailable`, even with a request pending. HTTP errors, body failures,
transport failures and deadlines do not
refresh that window. A later success clears the verdict before the first mutation.
After mutations begin, an unavailable verdict is terminal: subsequent rows stop,
and HTTP recovery is recorded but cannot permit another write, including
restoration. A refused mutation does not mark mutations as started. The probe
retains a 60-second observation window for a setup hang too, then closes the socket
for eng-lead discussion of observed liveness. It never reboots, reconnects or
automatically retries the whole run.

In `i25-drain-001`, `/list` successes took 451–865ms and a compiler fetch took
about 2.5 seconds. The old 250ms polling schedule, 1-second deadline and up to four
overlapping requests stopped setup before any Pattern mutation; HTTP later
returned 31 responses with status 200. This run exposed probe self-load and
suggested serialization or busy-window contention. Single-request service and
firmware-wide serialization remain unproved; the observation establishes no
product root cause or S2 direction. See the
[I25 diagnosis](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1221#issuecomment-6456992468).

After the observation window, responsive HTTP permits one separately labelled
`restore` push of the tiny luminous Pattern, with active ids observed before and
after. This is bench restoration, outside the measured import and outside S2's
product fix. An unavailable Controller receives no recovery write. S1 deletes
nothing (`deletedSlots: []`); every fixture slot and transient id remains in the
summary. Jon's disposable-Pattern authority for #2 Cark is recorded in #1221
comments [c6455390270](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1221#issuecomment-6455390270)
and [c6455395795](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1221#issuecomment-6455395795); this probe still writes only its fresh
fixture slots and run-only ids. It changes no settings, brightness, map, pixel
count, network, sequencer, firmware or reboot state.

The Node provider uses [`PixelblazeConnection`, lines 134–135](../../src/engine/PixelblazeConnection.ts#L134-L135)
with an owned Node `ws` factory and reuses
[`fetchControllerCompiler`](../../test/perf-harness/controllerHardware.ts).
Connection and correlated request deadlines are 5000ms; activation defaults are
unchanged. Compiler acquisition is per compile, matching
[`background.js`, lines 435–442](../../extension/background.js#L435-L442): every
compile, including the product's drain compile, fetches the Controller compiler
and completes fetch/decompression/compilation before returning bytecode. Each
acquisition has a 5000ms overall deadline and its own abort guard; the helper's
existing download attempts cannot issue another request after that deadline.
The recorded pinned GET wrapper stays installed until the helper settles, then
global fetch is restored in `finally`. No compiler closure is cached across calls.
No alternate connection follows a compiler timeout. Resident-size
bookkeeping mirrors
[`ExtensionControllerProvider`, lines 758–786](../../src/engine/ExtensionControllerProvider.ts#L758-L786):
clear before attempted push, cache only confirmed activation, invalidate on saved
switch/disconnect, and return a known size only while config reports that id.
Save awaits the protocol's actual positive completion; its span includes that
complete latency and rejects on unconfirmed Save. Reports list successful Save
latencies by ordinal, phase and slot, with count and maximum, excluding pending
and rejected Saves. The final protocol deadline is 20 seconds, including prior
FIFO acknowledgement debt and awaited completion; explicit `saveTimeoutMs`
overrides remain available. This deadline never releases HTTP ownership.
The liveness verdict clock pauses during socket-owned Save and resumes its
remaining 20-second ungated budget on release. Gating creates no failed poll or
fabricated success. Shutdown cancels queued polling without releasing Save.
Production helper HTTP is always serialized; the default probe's HTTP/HTTP
overlap is a fidelity boundary, even though both enforce Save admission holds.

Each batch's [runtime](../../scripts/controller-import-hardware-probe-runtime.ts)
keeps Node's global fetch implementation with one owned undici 7.29.0 Agent,
without imposing a connection limit in overlap mode or altering headers. The CLI
retains its pinned-origin, GET and redirect guard. All exit paths stop the monitor,
disconnect the provider, destroy the owned HTTP dispatcher, and close and await
owned WebSockets (including connecting sockets), then restore global fetch before
writing the final report. Each socket's first local close request sends native
`close(1000)` and arms one 5000ms terminate fallback. Provider-shaped no-code
close calls use the same owner as runtime cleanup. Repeated close or shutdown
calls send no additional close frame and never restart the bound. Actual close
clears the timer, including a synchronous callback. If no actual close occurs
and the socket is not CLOSED at the bound, the owner requests termination once;
cleanup still awaits actual close, never the request or timer expiry. A connecting
socket may actually close with 1006; this remains failed-handshake evidence.
Cleanup is idempotent; the between-batch and post-run settle starts only after
actual close, never a local close request or readyState guess. Failures
are explicit failed results and do not skip remaining owners or the report.
The offline child-process oracle uses parent-owned loopback HTTP and WebSocket
fixtures to prove natural exit with an unfinished body and a peer that does not
complete graceful close. It does not identify which handle kept the observed I26
process alive after reporting and disconnecting, or establish hardware behavior.
No process-wide dispatcher or unrelated handle is destroyed.

Each private per-batch `report.json` also retains `webSockets`: runtime-local
`socketId`, URL, UTC ISO `createdAt`, optional `openedAt`/`closedAt`, `errors`,
and optional `closeCode`/UTF-8 `closeReason`. Local close requests add UTC ISO
`closeRequestedAt` and `closePath` (`clean` or `terminate-fallback`); fallback
also adds UTC ISO `terminateRequestedAt`. A peer close without a local request
omits these request fields. `clean` describes the attempted path; only actual
code 1000 proves a normal handshake. Construction attempts are recorded
before construction; only actual `open` and `close` events set their timestamps.
Count opened physical connections from `openedAt`, not factory calls. Closed
records survive cleanup. The mode-0600 `socket-events.jsonl` streams the same
captured values as `created`, `open`, `error`, `close-request`,
`terminate-fallback`, and `close` observations with `socketId`, URL and `utc`.
Actual close observations include the locally requested path when present.
The separate mode-0600 post-run report and event log retain the same private
socket lifecycle, raw error and settle fields.

After the first batch, each socket's private record and `created` observation
also include `reconnectSettle`: UTC ISO `previousClosedAt`, `settleStartedAt`,
`settleEndedAt`, and configured `settleMs` (1000). First-batch records and callers
without sequencing omit this field. `openedAt` still requires an actual open
event; failed connects retain settle, raw error and actual close evidence without
a fabricated open time. Callers without sequencing still use the same clean
close owner and fallback.

Raw underlying `ws` errors retain available string/number `code`, `name`,
`errno`, `syscall`, and `message`, plus those fields from a one-level cause.
Missing fields remain absent. The exact raw message `Unexpected server response:
<status>` supplies numeric `httpStatus`; no `unexpected-response` listener is
installed because it would change handshake failure behavior. The protocol's
Event-style error callback can still yield a generic connection rejection;
that wrapper is not evidence of an underlying error class. These diagnostics
add no retry, delay or scheduling change within a batch's protocol, HTTP or Save
operations. Admission of a subsequent batch or the separate post-run check waits
for actual close plus the settle above; failure-stop behavior is unchanged and
no connect retry is added. Socket records, settle metadata and raw error fields
stay out of stdout, aggregate root summaries and sanitized timing tables. They
contain no headers, source, config, sessions or response bodies. Offline mocked
socket artifacts verify retention and lifecycle semantics, not physical proof.

Saved reads mirror [`background.js`, lines 472–480](../../extension/background.js#L472-L480)
(GET path, status and body) and
[`ExtensionControllerProvider`, lines 509–550](../../src/engine/ExtensionControllerProvider.ts#L509-L550)
(recovery), with the [5000ms timeout at line 170](../../src/engine/ExtensionControllerProvider.ts#L170): trimmed
encoded id, 404 as missing, other non-OK status as `GET /p/<encoded-id> -> <status>`,
and successful bytes recovered even when empty/corrupt. Production's provider
5000ms reply timeout does not cancel the helper's HTTP fetch. The probe instead
owns a 5000ms deadline covering fetch, body and recovery, aborts unfinished fetch and reports
`Saved program <id> read timed out.` without an internal retry. Readiness retries
belong only to fixture setup; import and provider reads retain zero retries.
The probe's queue holds each admitted read through the whole body, and its owned
fetch abort and resource cleanup differ from the extension relay's lifetime.
These matches do not establish identical complete HTTP scheduling or cancellation.
Recorder spans pair start with end/error, record UTC/monotonic duration and body size/hash, and
distinguish setup, import, observation and restore.

Every result states: **Direct engine/protocol probe without extension relay, UI or
store guards; probe HTTP scheduling and cancellation differ.** The drain qualification begins with unknown resident
cache after an observed saved-program switch; control begins with a known small
resident established by confirmed push. These observations isolate the direct
engine/protocol sequence and cannot prove UI guards, relay behavior or native
permissions. Reproduced row failures, unproved case preconditions and stopped runs
exit nonzero; a successful qualified control exits zero. Offline tests prove the
adapter/recorder boundaries, not hardware liveness:

```sh
wrsp-log npx vitest run scripts/controller-import-hardware-probe-support.test.ts --maxWorkers 2
```

### Clean-close serial qualification (2026-10-28)

One serial drain run at `78e5c255`, after Jon power-cycled Cark, qualified all six
requested batches and the separate post-run connection check. Twelve import rows
completed with readback, twenty-four Saves received positive completion, and no
receipt remained write-pending. Every batch activated the drain. No HTTP stop or
cleanup error occurred. All six batch sockets and the post-run socket actually
closed through the clean path with code 1000; none used termination fallback.

| Batch | Confirmed Saves | Maximum Save completion (ms) |
| --- | ---: | ---: |
| 1 | 4 | 2355.819 |
| 2 | 4 | 2047.768 |
| 3 | 4 | 2046.383 |
| 4 | 4 | 2395.168 |
| 5 | 4 | 2615.987 |
| 6 | 4 | 2179.678 |

The post-run socket was created 1004ms after the last batch's actual close and
opened in 24ms. The 1000ms settle was retained; no retry occurred. This qualifies
the direct engine/protocol run, while extension, UI and full-ticket proof remain
separate. The final 20-second Save deadline was selected above the measured
2615.987ms maximum (about 7.6 times that maximum). This historical six-batch run
used the provisional 60-second cap; the final setting has not been physically
rerun and does not complete full-ticket proof. The
sanitized result is recorded on [#1221](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1221);
private device artifacts remain unpublished.

## Invocation

An operator must provision managed main for A on port 5174 and the admitted
#1221 candidate for B on port 5179 first. This reference does not authorize a
hardware run. Obtain two distinct synthetic sessions using
`npm run dev:session -- --developer --json` and
`npm run dev:session -- --issue 1221 --json`. Keep only their JSON output in
private ignored files. Using `npm run --silent dev:session -- ...` suppresses
the outer npm banner; the nested `check:node` command may still print a banner,
which must not be included in the JSON file. Do not paste session contents into
issues, logs or reports.

Choose a fresh directory underneath an existing ignored checkout directory,
such as `.wrsp/`. The diagnostic refuses existing output directories, other
Controller addresses, other URLs, unsupported accounts and missing opt-in.

```sh
npm run diagnostic:controller-import -- --help
npm run diagnostic:controller-import -- \
  --device 192.168.8.196 \
  --url-a http://localhost:5174/PXLBLZ-IDE/ \
  --url-b http://localhost:5179/PXLBLZ-IDE/ \
  --steps 2,1,3,4,5,6 \
  --session-a .wrsp/private-a.json --session-b .wrsp/private-b.json \
  --out .wrsp/i50-run-001 --run-id run-001 --run
```

The default browser is headed full Chromium. `--headless` also selects the full
Chromium channel. The host must have the repository Playwright browser installed
and support unpacked extensions. Missing `--run` refuses before file mutations,
browser launch or network requests; `--help` only prints help. Both URLs are
required exact strings. Aliases, swapped origins, other ports, credentials,
whitespace, queries, hashes, duplicate arguments and unknown flags refuse.
`--steps` must be a nonempty prefix of `2,1,3,4,5,6,7`. A preparation-only prefix
can stop safely; another process cannot resume its in-memory prerequisites.
Selecting 7 also requires `--cleanup-inventory <private.json>`, read before launch.

The diagnostic loads one fresh private copy at `<out>/extension`, prepared for
B's port 5179 while retaining the main 5174 match. Only its manifest changes:
`host_permissions` gains exactly
`http://192.168.8.196/*` and `ws://192.168.8.196/*`. Optional permissions remain
unchanged. The helper admits only `http://localhost:<numeric-port>/PXLBLZ-IDE/`
without credentials, query or hash; for a port other than 5174 it appends that
port's `http://localhost:<port>/*` content match once. This does not widen the
runtime CLI policy. Repository `extension/` files remain unchanged.

Before copying, the source manifest bytes must have SHA-256
`326f933e446ca8942a32707afeedc30e9f02350c11cbddf6591d2b11a8a80299`.
Any byte change refuses with `Source extension manifest differs from the admitted bench baseline`
and requires explicit readmission. Symlinks, non-regular inputs and an existing
destination refuse. The copy proof verifies complete file paths and identical
non-manifest bytes after copying. Before any Connect click, the worker must
confirm both exact device origins with `chrome.permissions.contains`; a missing
grant stops the run. No grant popup opens, and connection must reach `data-phase=live`.

Fidelity cost: the agent bench does not exercise the grant UI or the shipped match list. Jon's manual bench on 2026-10-27 exercised the grant on real Chrome.

## Scope and sequence

Two temporary persistent profiles receive only their synthetic localhost
session cookies. Each context, page, API request, module import and navigation
is bound to its role's origin. Both `/api/me` identities pass before account or
Controller mutations. Only one context connects to hardware at a time. The
actual dispatcher awaits B2, A1, B3, B4, B5, A6, A7 and stops at the first failure.

1. **B2:** snapshot both accounts, then require one preexisting B profile for the
   target IP before connecting. Read config/map/list, confirm #2 Cark / 3.70 /
   256 pixels / 2D, and verify its physical identity against that profile. Record
   original active ID and full saved inventory. B requires one analog pin-35
   input, finite smoothing in [0,1], fallback .5, invert false and one enabled
   multiply-output brightness transform referencing it. Missing or incompatible
   profiles stop without overwrite or seed. Close B cleanly.
2. **A1:** reopen A and validate its inert physical profile: no inputs or enabled
   transforms. Both roles require standard v3, empty bindings, no electrical
   profile and automatic updates disabled; disabled defaults remain inert.
   Create the three red, green and blue `Test pat I20-<run-id> 1` through `3`
   fixtures, use normal Studio Save and reopen actual PBP. Every A stamp must
   have valid integrity, kind `pattern`, the A record ID and empty transforms.
   Capture complete A records and close A cleanly.
3. **B3:** reopen B, assert all three **Unimported PXLBLZ Patterns** rows and
   capture desktop/narrow views. Clipping remains a report-only observation.
4. **B4:** before the first Import-and-save click, one combined physical request
   asks Jon to attend through bulk/cleanup, observe B's pot changing T1 brightness
   and LEDs never being left dark, and return a minimum pot to lit. Terminal
   input must equal `READY <run-id>`; EOF, other text or delay grants nothing.
   Import T1. Assert its actual B personal source has no old banner/profile
   wrapper, its receipt is `authored-verified` and `complete`, binding retains
   the same Controller slot and that slot is active. Reopened bytes require an
   integrity-valid B Pattern stamp, hardware-brightness transform and
   `analogRead(35)`. Append `// I50 bench edit <run-id>` in Monaco, Save and
   require both the edit and B wrapper when reopening the same slot.
5. **B5:** disconnect and await clean close before reloading to clear the known
   resident footprint. Select-all cancellation must preserve complete account
   snapshots and admit zero provider mutations. Read and record the actual
   unique secondary non-submit dismiss label (or exact Cancel/Done) before
   capture/click. Select only T2/T3,
   retain that captured membership through self-activation, require exactly two
   row results, both Saved rows, both B-stamped reopened artifacts and T3 active.
   Record the running row's Delete-only reason without deleting. Capture Studio,
   result and Saved classification at desktop/narrow widths. No retry follows
   any failed assertion.
6. **A6:** close B cleanly and reopen A. Compare complete A fixture records,
   including controls and timestamps, and record A's own Saved classification
   without requiring B's classification result. Retain A for cleanup.
7. **A7:** require successful steps 1–6 and exact terminal input
   `PROOF <run-id> S2 S3 POT LIT`. Record this attestation with UTC, run ID,
   diagnostic revision and both served revisions. Only then admit cleanup.

Before every connected full navigation or context destruction the real provider
disconnects to suppress reconnect intent. A worker-installed native WebSocket
witness then requests close(1000) and awaits the retained actual close event,
bounded to five seconds. A close request or context-close promise grants nothing.
Each explicit Connect arms one construction; concurrent, unarmed or replacement
construction, abnormal close, error or missing event permanently stops the run.
Worker disappearance also stops. UTC construction/open/request/actual-close times
and actual codes are flushed before destruction. Unconnected API contexts require
no fictional socket witness. Finalization can close existing sockets and collect
retained evidence; it never reconnects, and cannot erase an earlier gate failure.

Cleanup input is a private JSON object with `startup`, `controller`, `a` and `b`.
The startup is `{id,name,source:"operator-confirmed-startup"}`; deletion arrays
contain exact `{id,name}` pairs of preexisting Test pats and may be empty. A name
matching `^Test pat(?:[ -]|$)` alone grants no authority. Step 7 appends this run's
known Controller fixtures, A records and B imports. All exact pairs must match
fresh inventories without duplicate IDs, ambiguous names or mismatches before
the first deletion. Every pair is reread immediately before its mutation.

The operator-confirmed startup must be the exact non-Test saved pair in both the
original B inventory and the fresh inventory. Config exposes active ID, not
configured startup. Missing confirmation or an unavailable pair stops with
`Original saved startup Pattern is unavailable; cleanup held`. The harness plays
only that pair transiently with `save:false`, confirms its active ID, then deletes
only admitted Controller pairs and admitted account records through their own
origins. B account cleanup opens no hardware connection. Metadata copies remove
only corresponding Pattern IDs and matching deleted-slot labels, preserving
siblings. Final inventories, complete sibling records, metadata and active
startup are reopened and asserted. Cleanup errors stop immediately; startup
settings are never edited and no recovery connection is made.

Fixture Save and Import retain their narrower constraints. Admission runs before
the actual provider method delegates. Save admission checks readable PBP
name/source/header and the actual Controller slot ID, independently of the
account Pattern banner ID. An existing unrelated slot cannot be admitted by
renaming its payload. Imports require the exact captured selected slot/name.
Reads have broad authority, but only reads matching the captured selection and
saved slots advance the pending row, using captured order. Repeated reads retain
the row, backward or unselected reads cannot change it, and a later row can follow
an earlier provider or UI precheck failure. Successful target pushes do not mark
row boundaries because production reads the same slot again after Save. The
target pair remains admitted even if later persistence verification fails.

Nameless drains require the digest produced by compiling the exact production
drain source and a fresh ID absent from saved slots, prior active IDs, admitted
targets and used drain IDs. Activation and deletion refuse in fixture scopes.
Settings, controls and variables refuse in every scope; idle or wrong-target
writes also refuse. Admission refusal, target/identity changes, worker observation
failure and unusable UI verification stop writes. The production provider and transport retain
their timeouts and internal protocol behavior. The harness adds no reconnect,
reboot or retry repair loop. Disposable browser profiles clear only their
remembered startup connection hint before page navigation so Connect is explicit.

## Evidence interpretation

The diagnostic records Studio Save's real result before checking the admitted
slot so compilation/product failures remain distinguishable from
admission-observation gaps.

The private ignored output contains streaming `events.jsonl`, version-2
`report.json`, readable `report.md`, screenshots and raw Test pat `.bin` PBP
payloads. The report identifies the product/base revisions, extension file
hashes, source/patched manifest hashes, explicit permission/match additions,
complete source/copied non-manifest hashes, synthetic account IDs, device
identity, fixture slots, selected/completed steps, cleanup admission and operator
proof. JSON and Markdown state the fidelity cost. Each runtime's `/__identity`
provides its independently pinned `servedRevisions.a` or `.b`.
After `/__identity` and before connection, local `git ls-tree` and `git show`
verify the complete source extension path set and bytes against the served
commit's `extension/`. A mismatch refuses with
`Served extension differs from the diagnostic source extension`. Successful
served-extension identity is recorded; diagnostic and served commits may differ.
The diagnostic checkout revision is recorded separately. A and B may serve
different valid local git objects; a changed same-role commit blocks reopening.
Events contain per-step status, provider spans, admission overhead, source and
stamp witnesses, receipt stages, active reads and account preservation.

Provider `execute` timestamps mark entry into the original method after
admission. Admission and observation callback overhead are recorded separately.
The page relay records correlated `get-program`/`program-data` timestamps, exact
response lengths, SHA-256 digests and decode results. Only this run's PBP
payloads are retained; no trace, HAR, storage state, cookie serialization or
authentication traffic capture is enabled.

The extension worker observes clones of the existing `/`, `/p/<id>` and `/list`
responses without another request or delaying delivery of the original
Response. Its UTC/monotonic start, header and body-complete records expose status,
declared Content-Length, Content-Encoding, Transfer-Encoding, decoded body bytes
and errors. Fetch decodes compressed bodies: encoded Content-Length and decoded
byte counts cannot establish truncation by comparison. Worker restarts create explicit
observation gaps. Worker clocks and page clocks have separate origins; compare
their UTC anchors and their own elapsed spans, not raw monotonic values across
contexts. Relay PBP bytes remain the authoritative payload witness.

Node reads GET `/list` serially before/after Save and import with
`Connection: close`, a ten-second bound covering the complete body and at most
one probe in flight. Health errors stop the run. Full bodies, status and timing
are retained privately. No health probe overlaps Save, and no fixed post-import
delay schedule serves as success evidence.

A resolved `saveProgram` promise proves positive device completion, while reopened
saved-program readback supplies artifact evidence. A page saved-program read can time
out after five seconds while the extension's HTTP fetch finishes later; compare
the provider error, relay response and worker-body spans separately. Raw PBP
bytes can be reopened with the existing `decodePbp`/`recoverSavedProgram`
helpers to check names, source, stamps and bytecode independently.

`completed-selected-prefix` means all selected assertions and final close gates
passed. `blocked` or `failed` exits nonzero with the exact cause/stage retained.
Reports distinguish hardware proof attested from cleanup completed/held. A
missing or damaged stamp, wrong wrapper, incomplete receipt or wrong binding
fails S4; source inspection alone never qualifies physical behavior. Offline
fake-operated tests prove dispatcher/operator/socket/cleanup boundaries only.
Real browser integration, native permissions, physical close and S2/S3 hardware
remain unproved until the separately authorized run.
