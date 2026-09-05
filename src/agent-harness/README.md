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
| `npm run agent:corpus -- --live --model <id> --effort <e>` | The corpus through the OpenAI Responses API under the paid-call guard below: one accounting unit per case, stops at the first refusal, lists unmeasured cases in `budget.json`. **Refuses before dispatch until a price with explicit terms (`experiment/pricing.ts`) and a provider input ceiling (`experiment/providerLimits.ts`) are accepted for the model and the ledger exists; only `gpt-5.6-luna` is accepted.** | yes, bounded |
| `npm run agent:held-out:verify` | Verify the sealed v1 held-out manifest, artifact hashes, finite case count and #958 release gate. Prints metadata only; it cannot execute or score a case. | none |
| `BRIDGE_AGENT=scripted npm run agent:bridge` | The bridge on an ephemeral loopback port with the fake agent; each `/utterance` body carries its `script` and optional `delayMs`. Prints the port and the overlay snippet. | none |
| `npm run agent:bridge` | The bridge with the live agent (`BRIDGE_MODEL`, `BRIDGE_EFFORT`, `BRIDGE_PORT`) under the same guard: one accounting unit per `/utterance` turn; the ledger is locked for the process and released on SIGINT/SIGTERM. Same refusal until a price and a ceiling are accepted. | yes, bounded |
| `npm run agent:budget [-- init]` | The paid-call ledger: `status` (default) prints the path, bounds, accepted prices with their terms, accepted ceilings, the per-call reservation, totals, remaining allowance, halt, lock and last entries with their settlement basis (exit 1 while halted); `init` creates an empty ledger at the path and refuses if one exists. | none |
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
same day), pinned in `PAID_CALL_BOUNDS` and validated at open (finite money, integer counts):

| Bound | Value | Enforced how |
| --- | --- | --- |
| Aggregate, all runs, all worktrees | $20 | Every ledger entry ever written, at its settled figure when settled and at its reservation otherwise, plus the next call's reservation, must fit. |
| Per run (one CLI invocation or bridge process) | $2 | Same rule over this run's entries. |
| Model calls per corpus case or bridge turn | 4 | Dispatch attempts, retries and repair turns included; the fifth is refused. |
| Output tokens per call | 4000 | Sent as `max_output_tokens` and reserved in full. |
| Price and ceiling acceptance age | 30 days | An older acceptance is refused. |

**Request shape.** Every request pins `service_tier: 'default'` and `truncation: 'disabled'`
alongside the output cap. `default` selects the provider's standard pricing explicitly; the
provider's own default, `auto`, inherits whatever tier the project is configured for, so an
unpinned request could be billed at rates the guard never accepted. `disabled` makes input past
the context window fail with HTTP 400 instead of being trimmed and billed. The shape is
otherwise closed: role messages with string content, echoed `message`/`function_call`/
`reasoning` items, `function_call_output` with string output, and function tools only. Anything
else (images, files, hosted tools, `previous_response_id`, a changed output cap, another tier,
truncation on or absent) is outside the shape the ceiling and price were accepted for and is
refused (`shape-unsupported`) rather than estimated. If a response nevertheless echoes a
`service_tier` other than `default`, the entry is kept at its reservation as ambiguous and the
ledger halts (below): the accepted rates do not price that tier.

**Price terms.** A price is three standard-tier rates (uncached input, cached input, output per
million tokens) plus explicit `terms`: the documented long-context surcharge (strictly above a
threshold of input tokens the whole request is billed at an input multiplier and an output
multiplier) or `'none'`, and the multiplier over the uncached input rate charged for tokens
written to the prompt cache. A price without terms, with a multiplier below 1, a non-integer
threshold, or a cached rate above the uncached rate is refused (`pricing-invalid`): flat rates
alone are not a schedule the guard will reserve from.

**Reservation basis.** The worst case of one call is the provider-enforced maximum input
tokens for the selected model and the supported request shape, priced as uncached cache-written
input at the long-context multipliers whenever the ceiling exceeds the threshold, plus the
output cap at its multiplier. Every factor that can apply at the ceiling is applied together, so
the figure is an inference from documented factors, not a measured bill. The ceiling is
recorded in `experiment/providerLimits.ts` as a `ProviderInputLimit`: the integer figure, the
request shape it was verified for, the exact primary source, the date read, an evidence line
stating what the source says and how enforcement was confirmed, and a separate
`acceptedForPaidRuns` (name, ISO date, note). A model without an accepted ceiling is refused
(`limit-unknown`, `limit-unaccepted`, `limit-stale`, `limit-invalid`, `limit-shape`) before any
network call, exactly as a model without an accepted price is. The full ceiling is reserved on
every call whatever the request's size, so a run may reserve more per call than it spends; that
is accepted, a false cost authorisation is not.

The request's own size is not a basis for anything monetary. The guard records the UTF-8
byte count of the request JSON on the entry as `estimatedInputTokens`, a diagnostic for
reading the ledger, and refuses a request whose byte count already exceeds the ceiling
(`input-too-large`) because the provider would reject it and the ledger would still hold the
full reservation. The estimate never lowers a reservation.

**Settlement basis.** The reservation is written to the ledger before the request is sent. A
response with usage settles it from the categories the installed SDK (openai 7.10.0) documents:
`input_tokens`, `input_tokens_details.cached_tokens`, `input_tokens_details.cache_write_tokens`
and `output_tokens`. Cached tokens take the cached rate, reported cache writes the cache-write
rate (charged in full even when they exceed the uncached count), the uncached remainder the
input rate, and above the long-context threshold every input-side rate and the output rate
take their multipliers. When the response omits the cache-write category, every uncached token
is charged at the cache-write rate and the entry records `settledBasis: 'upper-estimate'` with
a `settledNote` saying so; when every category was reported it records
`'reported-categories'`. Neither figure is the provider's invoice: both are the guard's
accounting from documented rates, and reconciling them against the provider's usage page is a
human step. Any other outcome (error, timeout, missing or malformed usage, a crash before
settlement) leaves the entry on record as ambiguous at the reserved amount. Nothing ever
removes or reduces an entry except the settlement of that same entry by the run that made it.
Cost arithmetic that leaves the finite range refuses (`arithmetic-overflow`) rather than
reserving a nonsense figure.

**Overrun halt.** If reported usage ever exceeds what the reservation assumed (more input
tokens than the accepted ceiling, more output tokens than the cap, or a higher settled cost),
the entry is settled at its actual cost and flagged, and in the same write a `halt` record
(time, run, entry, reason) is stored in the ledger document. A response served under a service
tier other than the pinned `default` halts the same way, with its entry kept at the reservation.
The run stops, and every later run refuses at open (`ledger-halted`, before the credential is
read) with that diagnosis. The halt is never cleared by opening a new run: a human reconciles
the charged usage against the provider, records the outcome, and removes the `halt` field from
the ledger file by hand, leaving the entries as recorded. An overrun means the provider did not
enforce the ceiling the reservation relied on, so the ceiling's evidence must be revisited
before it is trusted again.

The ledger lives outside every worktree: `AGENT_HARNESS_LEDGER`, else
`$XDG_STATE_HOME/pxlblz-ide/agent-harness-paid-calls.json`, else the same path under
`~/.local/state`. A missing ledger is a refusal, never an implicit fresh start; a malformed
ledger (including a malformed halt record or a settled entry without a basis) is a refusal and
is never rewritten; a second run while the lock file exists is refused, naming the holder, and
a lock left by a crashed run is removed by hand after confirming that process is gone. Every
path prints the ledger location and its totals so an override is visible in the run's output.

**What is accepted.** One model, `gpt-5.6-luna`, from the provider's official model page and
Responses reference read by the #945 root coordinator on 2026-09-05 (not verified by Jon):
$0.20 / $0.02 / $1.20 per million input / cached input / output tokens at the standard tier,
2x input and 1.5x output for the whole request above 272,000 input tokens, cache writes at
1.25x the uncached input rate, and a 1,050,000-token context window used as the input ceiling
(input cannot exceed the window; with `truncation: 'disabled'` a larger request fails with 400).
Both acceptances expire 30 days after 2026-09-05. At those figures every Luna call reserves
$0.5322 (1,050,000 × $0.20 × 2 × 1.25 per million, plus 4000 × $1.20 × 1.5 per million). A
settled call releases the difference, so a run's spend is the sum of its settled costs plus one
outstanding reservation; but each ambiguous outcome (a 429, a timeout, a missing usage block)
keeps its full $0.5322, so a $2 run tolerates at most three of them before the fourth
reservation is refused (`run-exhausted`), and the $20 aggregate at most 37. The terra and sol
entries carry no terms and no acceptance and are refused; the shipped ceiling table has no
other model. No paid call is authorised by these entries alone: the bounded baseline waits for
the held-out set to be sealed and the guard reviewed.

Before the first paid run, in this order: confirm the acceptances above are still inside their
window; run `npm run agent:budget -- init` once at the chosen path; confirm
`npm run agent:budget` shows the expected bounds, both acceptances with their terms, the
$0.5322 per-call reservation and an empty ledger. After a run, `budget.json` next to the corpus
report and `npm run agent:budget` carry the accounting, including each entry's settlement basis
and the cases the bounds prevented measuring. Reconciling ambiguous entries, upper-estimate
settlements and any halt against the provider's usage page is a human step. The corpus
report's own cost line (`estimateCostUsd`, transferred from V3) is a flat-rate diagnostic and
not the ledger.

## Sealed held-out corpus

The finite v1 release set is sealed under `held-out/v1/`. Inputs and expected outcomes are
separate JSON artifacts, authenticated by `manifest.json` and its independent
`manifest.sha256`. The manifest records the case count, category distribution, source base and
usage boundary. Before #958, only `npm run agent:held-out:verify` may read the set, solely to
check integrity. The ordinary fake, live, replay and tuning paths continue to import only
`experiment/cases.ts`; they do not load this directory. Do not include held-out contents in
prompts, baseline reports, tuning decisions or handoffs. #958 owns the first execution and
scoring of this exact seal.

## Bridge protocol

`POST /utterance` with `{ show, utterance, history?, context?, script?, delayMs? }` returns
NDJSON: `{kind:'tool',name}` and `{kind:'thinking'}` progress lines, then one
`{kind:'done', reply, changed, summaries, show?}`. `script` and `delayMs` are honoured only in
scripted mode. `GET /health` reports the agent and mode; `GET /chat.js` serves the overlay that
the editor tab injects to call `window.__pxlblzEditor.applyShow`. One utterance runs at a time;
a busy bridge answers 429.

## What this slice does not include

Request-id instrumentation across submission, model, validation, application, save and
preview, browser failure reproductions, and the acceptance fixture set remain separate #945
slices. The budget guard and sealed held-out corpus are present; ledger creation and the
bounded paid baseline remain coordinator steps. The held-out set is not executed or scored
until #958.
