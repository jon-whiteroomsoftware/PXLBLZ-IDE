# Controller import hardware diagnostic

`diagnostic:controller-import` is an explicit #1221 hardware diagnostic for #2
Cark at `192.168.8.196`, firmware 3.70, 256 pixels and a 2D map. It uses the
checkout's unpacked extension, the real provider and production Studio Save and
Import controls. It belongs to no test suite, CI job, runner plan or push gate.
Offline verification does not qualify native permission handling or hardware.

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

The diagnostic clicks the real helper popup's **Grant access** after Connect
creates a pending IP grant. It checks the HTTP and WebSocket origins for this
device. If Chromium's native permission interaction does not complete, the run
stops with its concrete failure. No manifest patch, blanket grant, fake relay,
or permission bypass is provided.

## Scope and sequence

Two independent temporary persistent profiles receive only their localhost
session cookies. Both `/api/me` identities must match before setup. Only one
profile connects to hardware at a time. The profiles are removed on exit;
the account Patterns and Controller slots remain.

1. Snapshot account content, bindings, push records, receipts and real device
   config/list/map. Create A's three red, green and blue editable fixtures named
   `Test pat I20-<run-id> 1` through `3`; use Studio Save and reopen actual PBP
   bytes. Associate the profile with the provider's recovered physical identity.
2. Use B's matching profile or create account metadata with pin 35 routed to
   multiply-output brightness. A has no inputs or transforms; neither profile
   enables automatic Pattern updates or a power cap. An incompatible existing
   physical profile is recorded and preserved, then blocks the run.
3. Assert the fixtures occur in **Unimported PXLBLZ Patterns** and capture the
   desktop and narrow presentation. Narrow clipping is evidence, not a fix.
4. Import T1 with **Import and save**. Record source policy, notice, ledger,
   readback and active identity. On success append `// I20 bench edit` through
   Monaco, then Studio Save back to that same slot.
5. Reload before bulk selection to discard the provider's known active bytecode
   footprint. Confirm select-all cancellation preserves account records and
   causes no device writes. Then select only T2/T3 and use the real bulk dialog.
   A disabled running row blocks this interaction; nothing else is played to
   bypass it. Import failures stop further writes and are never retried.
6. Close B, reopen A's retained profile and compare the complete saved fixture
   records, including source, controls and timestamps. Capture A's Saved list
   classification and final active-id/read-health witnesses read-only.
7. Record `deferred: S2/S3 hardware proof required`. Delete nothing. A failed
   transaction may leave the production black drain active; that is evidence.

Only this run's fixture slots can be saved or activated. Admission runs before
the actual provider method delegates. Save admission checks readable PBP
name/source/header and the actual Controller slot ID, independently of the
account Pattern banner ID. An existing unrelated slot cannot be admitted by
renaming its payload. Imports require the captured selected slot. The target
pair remains admitted even if later persistence verification fails.

Nameless drains require the digest produced by compiling the exact production
drain source and a fresh ID absent from saved slots, prior active IDs, admitted
targets and used drain IDs. Settings, controls, variables, deletion and
`setActiveProgram` always refuse. The production provider and transport retain
their timeouts and internal protocol behavior. The harness adds no reconnect,
reboot or retry repair loop. Disposable browser profiles clear only their
remembered startup connection hint before page navigation so Connect is explicit.

## Evidence interpretation

The private ignored output contains streaming `events.jsonl`, version-1
`report.json`, readable `report.md`, screenshots and raw Test pat `.bin` PBP
payloads. The report identifies the product/base revisions, extension file
hashes, synthetic account IDs, device identity, fixture slots and deferred proof.
The served product commit comes from the runtime's `/__identity` endpoint;
the diagnostic checkout revision is recorded separately. A changed served commit
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
declared length, actual length and errors. Worker restarts create explicit
observation gaps. Worker clocks and page clocks have separate origins; compare
their UTC anchors and their own elapsed spans, not raw monotonic values across
contexts. Relay PBP bytes remain the authoritative payload witness.

Node samples GET `/` with `Connection: close`, a ten-second abort bound and at
most one probe in flight. Sampling occurs before writes, concurrently with Save
entry, and serially at elapsed targets 0/5/15/30 seconds after the import batch.
Targets and actual elapsed times are recorded; a slow probe can move later
samples past their nominal targets. This schedule is diagnostic sampling and
does not change product backoff or timeouts.

A resolved `saveProgram` promise only proves that the fire-and-forget command
was sent. It never proves flash persistence. A page saved-program read can time
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
