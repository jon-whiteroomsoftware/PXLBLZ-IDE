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
| `npm run agent:corpus -- --live --model <id> --effort <e>` | The corpus through the OpenAI Responses API. **Not to be run until the #945 budget guard lands**; there is no spend bound in this slice. | yes |
| `BRIDGE_AGENT=scripted npm run agent:bridge` | The bridge on an ephemeral loopback port with the fake agent; each `/utterance` body carries its `script` and optional `delayMs`. Prints the port and the overlay snippet. | none |
| `npm run agent:bridge` | The bridge with the live agent (`BRIDGE_MODEL`, `BRIDGE_EFFORT`, `BRIDGE_PORT`). Same budget caveat. | yes |
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
the Worker. The key is never logged or written to reports.

## Bridge protocol

`POST /utterance` with `{ show, utterance, history?, context?, script?, delayMs? }` returns
NDJSON: `{kind:'tool',name}` and `{kind:'thinking'}` progress lines, then one
`{kind:'done', reply, changed, summaries, show?}`. `script` and `delayMs` are honoured only in
scripted mode. `GET /health` reports the agent and mode; `GET /chat.js` serves the overlay that
the editor tab injects to call `window.__pxlblzEditor.applyShow`. One utterance runs at a time;
a busy bridge answers 429.

## What this slice does not include

The paid-run budget guard and ledger, request-id instrumentation across submission, model,
validation, application, save and preview, the browser sequences that reproduce stale
replacement and save-order failures on the live editor, the acceptance fixture set, and the
sealed held-out utterances are later #945 slices.
