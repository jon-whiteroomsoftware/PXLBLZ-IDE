# Agent editing baseline (#945, browser slice)

Repeatable, no-paid-call diagnostics from the actual Show editor route through
the transferred bridge to visible application and persistence. This page pins
what was run, what was observed, and where the raw records are. It records
scripted-bridge timing only: the agent is the corpus's fake agent with a fixed
completion delay, so nothing here is a model-latency measurement or a target.
The live corpus run, the sealed held-out set, and the proposed thresholds are
still open in #945.

Contracts this evidence serves:
[agent candidate application](contracts/agent-candidate-application.md),
[Show state, history, and persistence](contracts/show-state-history-persistence.md),
[Show command semantics](contracts/show-command-semantics.md).

## Commands

| Command | What it proves | CI |
| --- | --- | --- |
| `npm run test:e2e:agent-baseline` | Eight sequences on the live editor route in Chromium against a real scripted bridge process: the reproductions below. Writes `reports/agent-harness/baseline/browser/<run>/` (one JSON record and one screenshot per sequence, plus the bridge log). | explicit only; not a push gate |
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
| Code | this commit (see `git log -1 -- docs/reference/agent-editing-baseline.md`), base `b1fbc1e5` |
| Browser | Playwright Chromium `chromium-1223` / `chromium_headless_shell-1223` (`npm run check:playwright`) |
| Runtime | `scripts/run-authenticated-playwright.ts`: one worker-dev Vite process, isolated migrated D1, synthetic worker identity |
| Agent | `scripted-fake` (corpus fake agent) through `src/agent-harness/bridge/service.ts`; completion delay 2500 ms; no credential read |
| Utterances | `make the first Clip twelve seconds`, `make the first Clip twelve seconds and dim it to half`, `add a marker at ten seconds called Drop` (`src/agent-harness/baseline/scripts.ts`) |
| Fixtures | `src/agent-harness/baseline/fixtures.ts`; record and artifact hashes in `baseline/evidence/fixtures.json` |
| Editor Show | Installation Show created through the UI: TestPattern1D 0–30 s, CometLoom 30–60 s, a 2 s crossfade |
| Model/effort | none (no paid call in this slice) |

## Observed outcomes

All eight sequences pass as reproductions: the assertions encode the bad
outcome. A later fix turns the case red; invert it into a regression test
then.

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

The fixture command records three refusals verbatim: on the stock lesson 101,
the property-animation reference, and the changing-layouts lesson, resizing
the first Clip to 12 s overlaps the next Clip and the grammar refuses. The
Groups lesson, the constructed six-minute Show, and both personal fixtures
accept it.

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
current code; distributions and thresholds wait for the live run.

## Known gaps in this slice

- The captures are Playwright Chromium screenshots from the isolated test
  harness; no in-app-browser proof is claimed.
- The stage preview ignores personal Libraries (sequence H); recorded, not fixed.
- No held-out set, no paid corpus run, no thresholds: still open in #945.
