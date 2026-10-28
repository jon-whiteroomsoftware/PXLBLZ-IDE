# Controller import hardware diagnostic

`diagnostic:controller-import` is an explicit #1221 hardware diagnostic for #2
Cark at `192.168.8.196`, firmware 3.70, 256 pixels and a 2D map. It uses the
checkout's extension in a temporary pre-granted copy, the real provider and
production Studio Save and Import controls. It belongs to no test suite, CI job,
runner plan or push gate.
Offline verification does not qualify native permission handling or hardware.

The UI diagnostic below remains parked. S1 also provides the separate direct-engine
probe described next; its results cannot qualify extension, UI or store behavior.

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
finishes before the next batch starts. The first HTTP stop, lost connection,
failed/unqualified result or thrown setup failure ends the sequence without a
batch retry. Reports include requested/completed counts, each outcome and the
first stop's batch, phase, operation and last attempted save ordinal/slot where
known. Save phase remains distinct from failure phase; an uncorrelated liveness
stop explicitly records no save correlation. Full per-batch timing, rows and slot
ledgers remain private; stdout exposes sanitized summaries. Failed or incomplete
sequences exit nonzero. Every drain batch still needs an observed import drain
activation to qualify.

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
and rejected Saves. The 60-second protocol cap remains provisional; measured
hardware latency must set the final deadline at no less than 20 seconds.
The liveness verdict clock pauses during socket-owned Save and resumes its
remaining 20-second ungated budget on release. Gating creates no failed poll or
fabricated success. Shutdown cancels queued polling without releasing Save.
Production helper HTTP is always serialized; the default probe's HTTP/HTTP
overlap is a fidelity boundary, even though both enforce Save admission holds.

Each batch's [runtime](../../scripts/controller-import-hardware-probe-runtime.ts)
keeps Node's global fetch implementation with one owned undici 7.29.0 Agent,
without imposing a connection limit in overlap mode or altering headers. The CLI
retains its pinned-origin, GET and redirect guard. All exit paths stop the monitor,
disconnect the provider, destroy the owned HTTP dispatcher, terminate and await
owned WebSockets (including connecting sockets), then restore global fetch before
writing the final report. Cleanup is idempotent and creates no timer; failures
are explicit failed results and do not skip remaining owners or the report.
The offline child-process oracle uses parent-owned loopback HTTP and WebSocket
fixtures to prove natural exit with an unfinished body and a peer that does not
complete graceful close. It does not identify which handle kept the observed I26
process alive after reporting and disconnecting, or establish hardware behavior.
No process-wide dispatcher or unrelated handle is destroyed.

Each private per-batch `report.json` also retains `webSockets`: runtime-local
`socketId`, URL, UTC ISO `createdAt`, optional `openedAt`/`closedAt`, `errors`,
and optional `closeCode`/UTF-8 `closeReason`. Construction attempts are recorded
before construction; only actual `open` and `close` events set their timestamps.
Count opened physical connections from `openedAt`, not factory calls. Closed
records survive cleanup. The mode-0600 `socket-events.jsonl` streams the same
captured values as `created`, `open`, `error`, and `close` observations with
`socketId`, URL and `utc`.

Raw underlying `ws` errors retain available string/number `code`, `name`,
`errno`, `syscall`, and `message`, plus those fields from a one-level cause.
Missing fields remain absent. The exact raw message `Unexpected server response:
<status>` supplies numeric `httpStatus`; no `unexpected-response` listener is
installed because it would change handshake failure behavior. The protocol's
Event-style error callback can still yield a generic connection rejection;
that wrapper is not evidence of an underlying error class. These diagnostics
add no retry, delay or scheduling change. Socket records and raw error fields
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

## Invocation

An operator must provision the managed main runtime on port 5174 and the #1221
runtime assignment first. Obtain two distinct synthetic sessions using
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
  --url http://localhost:5174/PXLBLZ-IDE/ \
  --session-a .wrsp/private-a.json --session-b .wrsp/private-b.json \
  --out .wrsp/i20-run-001 --run-id run-001 --run
```

The default browser is headed full Chromium. `--headless` also selects the full
Chromium channel. The host must have the repository Playwright browser installed
and support unpacked extensions. Missing `--run` refuses before file mutations,
browser launch or network requests; `--help` only prints help.

The diagnostic always loads a fresh private copy at `<out>/extension`, including
on main port 5174. Only its manifest changes: `host_permissions` gains exactly
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

Two independent temporary persistent profiles receive only their localhost
session cookies. Both `/api/me` identities must match before setup. Only one
profile connects to hardware at a time. The profiles are removed on exit;
the account Patterns and Controller slots remain.

1. Snapshot account content, bindings, push records, receipts and real device
   config/list/map. Create A's three red, green and blue editable fixtures named
   `Test pat I20-<run-id> 1` through `3`; use Studio Save and reopen actual PBP
   bytes. Associate the profile with the provider's recovered physical identity.
2. After A's first live Connect, wait up to ten seconds for exactly one matching
   auto-created physical profile; never POST a duplicate while creation is pending.
   A has no inputs or enabled transforms; its factory's disabled brightness and
   power-cap defaults are accepted. Use B's matching profile, or seed it before
   its first Connect if absent. B has exactly one analog pin-35 input with finite
   smoothing in [0,1], fallback .5 and invert false, and one enabled multiply-output
   brightness transform referencing that input. Preserve the observed .2 smoothing
   and disabled power cap. Both profiles require the standard v3 board, empty
   bindings, no electrical profile and automatic Pattern updates disabled.
   Disabled transforms remain inert. An incompatible existing physical profile
   is recorded in full and preserved, then blocks the run.
3. Assert the fixtures occur in **Unimported PXLBLZ Patterns** and capture the
   desktop and narrow presentation. Narrow clipping is evidence, not a fix.
4. Import T1 with **Import and save**. Record source policy, notice, ledger,
   readback and active identity. On success append `// I20 bench edit` through
   Monaco, then Studio Save back to that same slot.
5. Reload before bulk selection to discard the provider's known active bytecode
   footprint. Confirm select-all cancellation preserves account records and
   causes no device writes. Then select only T2/T3 and use the real bulk dialog.
   A disabled running row blocks this interaction; nothing else is played to
   bypass it. Ordinary provider errors are recorded while production continues
   later captured rows. Final UI outcomes determine import failure; failures
   are never retried and no new bulk attempt follows a final failure.
6. Close B, reopen A's retained profile and compare the complete saved fixture
   records, including source, controls and timestamps. Capture A's Saved list
   classification and final active-id/read-health witnesses read-only.
7. Record `deferred: S2/S3 hardware proof required`. Delete nothing. A failed
   transaction may leave the production black drain active; that is evidence.

Jon granted broad Pattern authority on **192.168.8.196 only**, including playing,
modifying and deleting existing Patterns. S1 still runs only the seven steps
above and defers cleanup. The explicit future `pattern` admission scope requires
an exact pending id/name from the captured saved slots, including arbitrary
non-PXLBLZ IDs. It permits transient Play (`save:false`), Delete, same-name
structurally readable PBP Save and a target push after that admitted Save.
An artifact stamp is optional for an existing Pattern. No nameless drain is
admitted in this scope; captured slot/name metadata remains unchanged.

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

The private ignored output contains streaming `events.jsonl`, version-1
`report.json`, readable `report.md`, screenshots and raw Test pat `.bin` PBP
payloads. The report identifies the product/base revisions, extension file
hashes, source/patched manifest hashes, explicit permission/match additions,
complete source/copied non-manifest hashes, synthetic account IDs, device
identity, fixture slots and deferred proof. JSON and Markdown state the fidelity cost.
Managed main's served commit is S1's observed product revision, obtained from
the runtime's `/__identity` endpoint. Candidate hardware proof requires its own
verified served revision; this correction adds no candidate-runtime route.
After `/__identity` and before connection, local `git ls-tree` and `git show`
verify the complete source extension path set and bytes against the served
commit's `extension/`. A mismatch refuses with
`Served extension differs from the diagnostic source extension`. Successful
served-extension identity is recorded; diagnostic and served commits may differ.
The diagnostic checkout revision is recorded separately. A changed served commit
blocks a later profile opening rather than mixing revisions in one run.
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

Node samples GET `/list` with `Connection: close`, a ten-second abort bound and at
most one probe in flight. Sampling occurs before writes, concurrently with Save
entry, and serially at elapsed targets 0/5/15/30 seconds after the import batch.
Targets and actual elapsed times are recorded; a slow probe can move later
samples past their nominal targets. This schedule is diagnostic sampling and
does not change product backoff or timeouts. Each completed probe records its
path, declared length, content/transfer encodings and actual decoded body bytes.

A resolved `saveProgram` promise proves positive device completion, while reopened
saved-program readback supplies artifact evidence. A page saved-program read can time
out after five seconds while the extension's HTTP fetch finishes later; compare
the provider error, relay response and worker-body spans separately. Raw PBP
bytes can be reopened with the existing `decodePbp`/`recoverSavedProgram`
helpers to check names, source, stamps and bytecode independently.

`reproduced` means an observed hardware import failure, `not-reproduced` means
the attempted sequence completed without that failure, and `blocked` means a
required identity, permission, selection or verification boundary was unusable.
Blocked and import-failure runs exit nonzero while retaining evidence. Temporal
correlation between a save and HTTP unavailability is not a root-cause claim.
Current wrapped-source behavior is expected in S1: a missing B brightness wrapper
is recorded as pending S3 qualification. S2 persistence/readback proof and S3
wrapper proof remain required before cleanup is considered.
