# Agent harness (diagnostic)

The local agent-editing harness transferred from pxlblz-v3 for the #945 baseline: a
loopback dictation bridge, the Show grammar and its MCP server, the dictation corpus with its
scripted fake agent, and the evaluation and telemetry tools the MCP server exposes. It runs
against the live V2 engine in this checkout. Nothing here is product code: it is not imported
by `src/main.tsx`, ships in no build, and its ownership stays diagnostic until #946, #947 and
#959 decide what moves into `src/engine/` (#949). `PROVENANCE.md` records every file's origin.

Read `docs/reference/contracts/agent-candidate-application.md` before changing the bridge or
its editor application path, and `docs/plans/shared-agentic-show-editing-roadmap-prd.md` for
the roadmap this serves.

## Commands

| Command | What it does | Paid calls |
| --- | --- | --- |
| `npm run agent:smoke` | One scripted turn through the real bridge (HTTP, NDJSON, MCP, session, turn runner); the candidate is exported as `.pxlshow` and `.epe` and judged after reopening through the V2 importers. Writes `reports/agent-harness/smoke/`. `-- --delay-ms <n>` holds the turn. | none |
| `npm run agent:corpus -- --fake` | The 43-case dictation corpus through the fake agent; transcripts and report under `reports/agent-harness/corpus/`. `--replay <dir>` re-scores transcripts. | none |
| `npm run agent:corpus -- --live --model <id> --effort <e>` | The corpus through the OpenAI Responses API under the paid-call guard below: one accounting unit per case, stops at the first refusal, lists unmeasured cases in `budget.json`. **Refuses before dispatch until a price is accepted in `experiment/pricing.ts` and the ledger exists.** | yes, bounded |
| `BRIDGE_AGENT=scripted npm run agent:bridge` | The bridge on an ephemeral loopback port with the fake agent; each `/utterance` body carries its `script` and optional `delayMs`. Prints the port and the overlay snippet. | none |
| `npm run agent:bridge` | The bridge with the live agent (`BRIDGE_MODEL`, `BRIDGE_EFFORT`, `BRIDGE_PORT`) under the same guard: one accounting unit per `/utterance` turn; the ledger is locked for the process and released on SIGINT/SIGTERM. Same refusal until a price is accepted. | yes, bounded |
| `npm run agent:budget [-- init]` | The paid-call ledger: `status` (default) prints the path, bounds, accepted prices, totals, remaining allowance, lock and last entries; `init` creates an empty ledger at the path and refuses if one exists. | none |
| `npm run agent:coverage` | Regenerates `reference/show-grammar-coverage.md` and the generic-only snapshot from V2's live schema and the grammar registry. | none |
| `npm run agent:diagnostics` | Known-drift oracles kept verbatim (`test/*.diagnostic.ts`); expected to fail and never part of CI. | none |

The ordinary suites under `test/*.test.ts` run in the Vitest `node` project with `npm test`.

## How the commands run

Every command goes through `run.ts`, a small Vite module-runner entry, rather than plain `tsx`:
the V2 stock catalogue loads its Pattern and Map sources with `import.meta.glob` and `?raw`,
which only Vite can evaluate. The runner starts a plugin-free Vite server over this checkout
(alias `@` to `src/`), imports the entry, awaits its exported `main`, and closes the server;
the bridge then stays alive on its own socket. `tsx` and TypeScript still resolve the `@/`
alias for editing and typechecking; execution needs Vite semantics.

## Credentials

The live paths read `OPENAI_API_KEY` from the environment, or from the file named by
`AGENT_HARNESS_ENV_FILE` (the existing protected location outside this repository). Nothing
under this repository is read for it: `.env` is not ignored here and `.dev.vars` belongs to
the Worker. The key is never logged or written to reports. The ledger is opened, validated and
locked before the credential is read, so a budget refusal never touches the key.

## Paid-call budget (#945)

Every live dispatch, retries included, goes through one point in `experiment/openaiAgent.ts`
that asks the guard (`experiment/paidCallGuard.ts`, rules in `experiment/paidCallBudget.ts`)
before the SDK call. The SDK's own retries are disabled so no attempt bypasses it. The bounds
are ceilings authorised for the #945 live baseline (Jon, 2026-09-04; coordinator choices the
same day), pinned in `PAID_CALL_BOUNDS`:

| Bound | Value | Enforced how |
| --- | --- | --- |
| Aggregate, all runs, all worktrees | $20 | Every ledger entry ever written, at actual cost when settled and at its reservation otherwise, plus the next call's reservation, must fit. |
| Per run (one CLI invocation or bridge process) | $2 | Same rule over this run's entries. |
| Model calls per corpus case or bridge turn | 4 | Dispatch attempts, retries and repair turns included; the fifth is refused. |
| Output tokens per call | 4000 | Sent as `max_output_tokens` and reserved in full. |
| Bounded input tokens per call | 200,000 | A request whose bound exceeds this is refused. |
| Price acceptance age | 30 days | An older acceptance is refused. |

The reservation is written to the ledger before the request is sent. A response with usage
settles it at the actual cost; any other outcome (error, timeout, missing usage, a crash
before settlement) leaves it on record as ambiguous at the reserved amount. Nothing ever
removes or reduces an entry except the settlement of that same entry by the run that made
it. Usage reported above the reservation is recorded at its actual cost, flagged, and halts
further dispatch in that run.

The input side of the reservation is derived from the UTF-8 bytes of the request JSON
(times 1.25, plus 64 tokens per input item and tool, plus the output tokens reported for the
unit's earlier calls, since echoed reasoning is re-read server side). Under a byte-level BPE
tokenizer tokens never exceed bytes of the tokenized text; the provider's framing and its
rendering of the tool schemas are not that text, so the margin and allowance stand in for
them. This is a bound under those stated assumptions, not a guarantee, which is why every
settlement checks reported usage against it. The request shape is closed: role messages with
string content, echoed `message`/`function_call`/`reasoning` items, `function_call_output`
with string output, and function tools only. Anything else (images, files, hosted tools,
`previous_response_id`) is refused rather than estimated.

The ledger lives outside every worktree: `AGENT_HARNESS_LEDGER`, else
`$XDG_STATE_HOME/pxlblz-ide/agent-harness-paid-calls.json`, else the same path under
`~/.local/state`. A missing ledger is a refusal, never an implicit fresh start; a malformed
ledger is a refusal and is never rewritten; a second run while the lock file exists is refused,
naming the holder, and a lock left by a crashed run is removed by hand after confirming that
process is gone. Every path prints the ledger location and its totals so an override is
visible in the run's output.

No price is accepted for paid runs in this checkout: `experiment/pricing.ts` carries the V3
figures read on 2026-09-01 with no `acceptedForPaidRuns`, and the guard refuses each of them
before dispatch. Before the first paid run, in this order: verify each rate against the
provider and record the acceptance (name, ISO date, note) on the entry; run
`npm run agent:budget -- init` once at the chosen path; confirm `npm run agent:budget` shows
the expected bounds and an empty ledger. After a run, `budget.json` next to the corpus report
and `npm run agent:budget` carry the accounting, including the cases the bounds prevented
measuring. Reconciling ambiguous entries against the provider's usage page is a human step.

## Bridge protocol

`POST /utterance` with `{ show, utterance, history?, context?, script?, delayMs? }` returns
NDJSON: `{kind:'tool',name}` and `{kind:'thinking'}` progress lines, then one
`{kind:'done', reply, changed, summaries, show?}`. `script` and `delayMs` are honoured only in
scripted mode. `GET /health` reports the agent and mode; `GET /chat.js` serves the overlay that
the editor tab injects to call `window.__pxlblzEditor.applyShow`. One utterance runs at a time;
a busy bridge answers 429.

## What this slice does not include

Request-id instrumentation across submission, model, validation, application, save and
preview, the browser sequences that reproduce stale replacement and save-order failures on
the live editor, the acceptance fixture set, the sealed held-out utterances, and the price
verification and ledger creation that precede any paid run are later #945 slices or
coordinator steps.
