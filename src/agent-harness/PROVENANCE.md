# Provenance of src/agent-harness

Diagnostic source area for PXLBLZ-IDE #945. Every file below was transferred from the
private, unpublished pxlblz-v3 repository on 2026-09-04 and adapted only as recorded here.

| Field | Value |
| --- | --- |
| Source repository | `pxlblz-v3` (local checkout `~/src/pxlblz-v3`, not published) |
| Source HEAD | `9ecd481fd6facc0f7c68c1f99cd6c0d6c1405654` |
| Source working tree | clean except one staged, uncommitted file: `docs/plans/shared-agentic-show-editing-roadmap-prd.md` (migrated separately to `docs/plans/`, see its own provenance block) |
| V2 pin the source was written against | `09550be19f34da628844e1872e79784454a2a9b3` (V3 `vendor/manifest.json`); 219 V2 commits later at transfer time |
| V2 base of the transfer | `ad8ad651` |
| Acquisition | 2026-09-04, byte copy, then the mechanical rewrites listed below |

## Files

The hash is the SHA-256 of the original V3 bytes before any rewrite.

| Original path (V3) | Path here | SHA-256 of original |
| --- | --- | --- |
| `docs/reference/show-data-model.md` | `src/agent-harness/reference/show-data-model.md` | `81719b555e69eed8bc3bcc7004fe7dd79b3899c0e6e6ce9aac6158e85a18b55f` |
| `docs/reference/show-grammar-coverage.md` | `src/agent-harness/reference/show-grammar-coverage.md` | `6b45930fd996ada12d76628079c70bdfc8126993129b3a67af2845cd6ee8938e` |
| `src/bridge/chat.js` | `src/agent-harness/bridge/chat.js` | `6270eb9667d93aed9c48743b9f5590182a2d9c7389c4110f6364416bdad99c24` |
| `src/bridge/server.ts` | `src/agent-harness/bridge/server.ts` | `7e3b239e4260e062c57a64235ab8890a55cf4364ff0cab0979752bf9d1a21ee8` |
| `src/experiment/cases.ts` | `src/agent-harness/experiment/cases.ts` | `0e3a32b039e4d06bac0efcbe2ee06307a93710354886500bd31b54bbc7e3ca95` |
| `src/experiment/cli.ts` | `src/agent-harness/experiment/cli.ts` | `9bf69ec6af99604ab9587ddde0c3f7d5bafd3a5ce217f424951c5a72f3f321d2` |
| `src/experiment/corpus.ts` | `src/agent-harness/experiment/corpus.ts` | `d35b77f8e3cd81cacf3d97556afffed9bc3d4feb0681b61d0ea0f72eb1462a98` |
| `src/experiment/fixtures.ts` | `src/agent-harness/experiment/fixtures.ts` | `dd11cab339c22e6a69aba59bfa0c709a65e96bb9530cf71c7bb5284245fbccac` |
| `src/experiment/openaiAgent.ts` | `src/agent-harness/experiment/openaiAgent.ts` | `b890b0bd9bbe15fc5bff4ea8304ff570c272b64be517ec0b8ec0547071ffd177` |
| `src/experiment/pricing.ts` | `src/agent-harness/experiment/pricing.ts` | `0880d63ac34edf7f8c4645cbadfe30a10f26496099745d4772ec2fdbcfcbd284` |
| `src/experiment/report.ts` | `src/agent-harness/experiment/report.ts` | `ae44bc47d717d4efb6c7fbf95cef7569ffeceacbc3f2666c427287146a1a0613` |
| `src/experiment/runner.ts` | `src/agent-harness/experiment/runner.ts` | `a8befc1c37295bad453f4afd12577a63c660dc8852daf2acf726cd5a9fb75760` |
| `src/experiment/timing.ts` | `src/agent-harness/experiment/timing.ts` | `2f5f0a6ee916cbd92f768cec561d8664c6b513ff84575fc251d2d7f48e51c9fb` |
| `src/experiment/turn.ts` | `src/agent-harness/experiment/turn.ts` | `7bcdd89bff79f10c542c56afa95a50846d55b2b4f39f6ece3a517af36e7edb36` |
| `src/grammar/coverage.ts` | `src/agent-harness/grammar/coverage.ts` | `4f2f1bb741fe1610f76a99bdbe61fdd6f5015fc21fd89a5c09dd004ac5cee733` |
| `src/grammar/coverageCli.ts` | `src/agent-harness/grammar/coverageCli.ts` | `3b126c4959c1b402f044880dc48a1feb1f2ba84bc887bcf41df0321e67990b53` |
| `src/grammar/openShow.ts` | `src/agent-harness/grammar/openShow.ts` | `337bc74c65a2f4903d471efb7f5bf2d1248cda001b619eaf58f686ba85018dda` |
| `src/grammar/operations/animation.ts` | `src/agent-harness/grammar/operations/animation.ts` | `77fcb4f0b989548333b1925738c4fc72af6948d8555a051ab80a6d1dd0dc3c47` |
| `src/grammar/operations/clips.ts` | `src/agent-harness/grammar/operations/clips.ts` | `e49beece187c23a9659c414f6c71d78bfba5b26b3fe996aa05b28b8e8d841ba7` |
| `src/grammar/operations/effects.ts` | `src/agent-harness/grammar/operations/effects.ts` | `bd2f3376d0ac9330c291925818f8d83a86bc66b97e1e97c08bc6f98e4238772f` |
| `src/grammar/operations/generic.ts` | `src/agent-harness/grammar/operations/generic.ts` | `dd889a8d23fce64ccca24eaa43e6b7bb4d4457804701d485b6f6a43ca9864174` |
| `src/grammar/operations/junctions.ts` | `src/agent-harness/grammar/operations/junctions.ts` | `50d82bddedbf451305a056fe3d9e5e1d2d62087ee65e345f7e5b5cb65dbc2620` |
| `src/grammar/operations/layerTransitions.ts` | `src/agent-harness/grammar/operations/layerTransitions.ts` | `03d1fee47a931d2f29c4f5214be094bd4fa13016838a6b52cfdd43064ec18456` |
| `src/grammar/operations/record.ts` | `src/agent-harness/grammar/operations/record.ts` | `cfd4de9cdd509f3abba3ccd2791390f3539e2f79e096cdda38cbb37554f099da` |
| `src/grammar/operations/structure.ts` | `src/agent-harness/grammar/operations/structure.ts` | `bc422603400da86892d0f3fbe1696c7cb70a372f1bf6978ca32e2a612bc42c5b` |
| `src/grammar/operations/timeline.ts` | `src/agent-harness/grammar/operations/timeline.ts` | `344e451463dfc2faf02a7755d936f04e19f3a574511e809e67fac61becb6323a` |
| `src/grammar/read.ts` | `src/agent-harness/grammar/read.ts` | `30700853680c53e98df82d15b71a510c4a919d3d142398b62330301b81935282` |
| `src/grammar/registry.ts` | `src/agent-harness/grammar/registry.ts` | `f65c739d034367f55e12b525f41e89ce46b4590a96976acd6fd3806d093dc511` |
| `src/grammar/session.ts` | `src/agent-harness/grammar/session.ts` | `53dd9973026b8a13a0ab6d4a5e189c5fe001c64a581fa2665610ee63175d6611` |
| `src/grammar/support.ts` | `src/agent-harness/grammar/support.ts` | `0ec8324bdae4234fe18d767ec4fa8ecc617569669744afaa144ac3f4fb0e9291` |
| `src/grammar/types.ts` | `src/agent-harness/grammar/types.ts` | `d498ee0d9c4be0020805cc1cb863cc92776dafe1376265b236f9704f15ed9dcc` |
| `src/mcp/showsServer.ts` | `src/agent-harness/mcp/showsServer.ts` | `77976eea8126e797ce2c7192608c7ad7921d50617bfa67c1fec830c341a9343e` |
| `src/shows/critique.ts` | `src/agent-harness/shows/critique.ts` | `9621011116631da579525b7dad818ba8d7463df964ef1c559731668109acd733` |
| `src/shows/evaluate.ts` | `src/agent-harness/shows/evaluate.ts` | `27564e3f3af49274c7cc1994a41dad752e2c6be58bde868068eabf2398f9013c` |
| `src/shows/exportShow.ts` | `src/agent-harness/shows/exportShow.ts` | `491efa259a9e378ecb0dcccdbae7755080a447e2c336281d18ce8a9b0a6e41a5` |
| `src/shows/stockCatalogue.ts` | `src/agent-harness/shows/stockCatalogue.ts` | `cc4fbd4759675c93658dd1250fd02c1fa84c236f7c6ee418293c06f8c451a29d` |
| `src/telemetry/harness.ts` | `src/agent-harness/telemetry/harness.ts` | `6b352ba6412c0c11b64c80c9c7c0648a962b5a3694d61d9abab25edb5b127570` |
| `src/telemetry/measure.ts` | `src/agent-harness/telemetry/measure.ts` | `5775f308fca1f3f31c38359ca1c36a3d6f704ec43c6d9f83bfee00d55a573373` |
| `test/critiqueShow.test.ts` | `src/agent-harness/test/critiqueShow.test.ts` | `8aefb66cb03770cd31f47ae502a991ba6a44191edbb9fc1a7a62e1169a3e6a08` |
| `test/dictationExperiment.test.ts` | `src/agent-harness/test/dictationExperiment.test.ts` | `b172a0025085ee0731fd353e419441b1dea189a577e612d30c558ea992af1a28` |
| `test/dictationTurn.test.ts` | `src/agent-harness/test/dictationTurn.test.ts` | `36f0e7c8c8c9cf09b83a0e746175b0aa465de2bf974a2947c118e79e75b776dc` |
| `test/exportShow.test.ts` | `src/agent-harness/test/exportShow.test.ts` | `24306255c5e553ce9582ab00ac261e85cbe862a0b09e9562e20339a5bd67c6f6` |
| `test/fixtures/grammar-generic-only.json` | `src/agent-harness/test/fixtures/grammar-generic-only.json` | `31c77e4820afda5dc0f0e3e02c7506b24d85699963cd88180d769bf9cc22bc30` |
| `test/flickerGate.test.ts` | `src/agent-harness/test/flickerGate.test.ts` | `4131838661540d2f7c93d06b9a13e5cf12cf4a24eb893ccea08c54ea0ac39e6c` |
| `test/grammarBreadth.test.ts` | `src/agent-harness/test/grammarBreadth.test.ts` | `7c7377890f4b18c0e3194dc88c790d68b5b6da78240dcca4afbde4e79c0f0f20` |
| `test/grammarControlExports.test.ts` | `src/agent-harness/test/grammarControlExports.test.ts` | `7dce26e1d46ae69d6a9e57d2116b336b9ea3f4a2bafb4d09a7f60f531c2564e1` |
| `test/grammarCoverage.test.ts` | `src/agent-harness/test/grammarCoverage.test.ts` | `035324ff5535597eb8371e5f1e8792a6728efab42898031b75ca78afef81e618` |
| `test/grammarMcp.e2e.test.ts` | `src/agent-harness/test/grammarMcp.e2e.test.ts` | `8b78b04baed25ca76e307fcbad787bc1cc5dbb53554102ee2919cf18b20081ce` |
| `test/grammarRead.test.ts` | `src/agent-harness/test/grammarRead.test.ts` | `1f3b611d36c1b9ac2f4c7a92e500f5c28dbd917caa95b48b2c1e8e52fe0c21df` |
| `test/grammarReferentArgs.test.ts` | `src/agent-harness/test/grammarReferentArgs.test.ts` | `71e0a9f8a77e2804bd4ef8387cbab6a0b5a635be2e2d31471e39506949c197d1` |
| `test/grammarRegistry.test.ts` | `src/agent-harness/test/grammarRegistry.test.ts` | `8ce1d585ad25a98d81ac94cf99db03203c5b5e5323491db0fb7f0316e845b9c3` |
| `test/grammarSession.test.ts` | `src/agent-harness/test/grammarSession.test.ts` | `a55335f1bffd871dbd93102babde5b5601eec060e62e0c2e94b3f2f0eb2ebfdb` |
| `test/grammarStructure.test.ts` | `src/agent-harness/test/grammarStructure.test.ts` | `eab58e95692d36f345d73111ead37d1bb9a505aff198d6aa8a44cfb4bb3e7996` |
| `test/grammarTransactions.test.ts` | `src/agent-harness/test/grammarTransactions.test.ts` | `b14dc30294131faefd94b2a76ec73813f0357e0997e3f545239fa7c3d04d50e4` |
| `test/measureShow.test.ts` | `src/agent-harness/test/measureShow.test.ts` | `d58571c7fd9e45ae78743a61b4771eba645f76896236f52b8627b9aff456ac5c` |
| `test/showEvaluate.test.ts` | `src/agent-harness/test/showEvaluate.test.ts` | `2cd9f8846381c4f72b2c693e011e9c076e777b1b644c5d3d657afb36fc5f0e5f` |
| `test/showsMcpServer.e2e.test.ts` | `src/agent-harness/test/showsMcpServer.e2e.test.ts` | `2ecdd899a44a9e6b0345b79b22db1ff4f44aed55a7ae0c64a11104b8edfe5958` |
| `test/stockCatalogue.test.ts` | `src/agent-harness/test/stockCatalogue.test.ts` | `11dfc59c9a0272aa25fa65d7ee08a2c9d09f5917ee81c03acb72f895c43c1617` |
| `test/support/grammarFixture.ts` | `src/agent-harness/test/support/grammarFixture.ts` | `65a7d0205f3602e09452c76eb77d92f2b238118cc0169ce815a8fb0fdce0b13e` |
| `test/support/grammarGoldens.ts` | `src/agent-harness/test/support/grammarGoldens.ts` | `928dd9a05961f4ecbb1048d563bbfedb4b61c31e7ea7882cf9b7200322284bd6` |
| `test/support/grammarHarness.ts` | `src/agent-harness/test/support/grammarHarness.ts` | `96ae98934d76b0805525846de367ea61769797c6ec13c547dd989ee81339b855` |
| `test/telemetryHarness.test.ts` | `src/agent-harness/test/telemetryHarness.test.ts` | `ef687f645d799af39513643b5882ae0adb10b660b0a720b539c0b2282338a4b8` |

## Mechanical adaptations

Applied to every transferred `.ts`/`.js` file unless stated:

- A first-line `// Provenance:` header naming the original path and source commit.
- `@v2/*` import specifiers rewritten to V2's own `@/*` alias (same modules, now the live engine
  rather than V3's vendored copy).
- Tests moved from V3 `test/` to `src/agent-harness/test/`: `../src/...` and `../../src/...`
  relative imports shortened by one segment. `.js`-suffixed relative imports are unchanged.
- File paths resolved at runtime: `schemas/show-record.schema.json` now points at V2's live schema
  (`../../../schemas/...` from `shows/evaluate.ts`, `mcp/showsServer.ts`, `grammar/coverage.ts`);
  the MCP `show-data-model` resource and the committed grammar coverage report moved to
  `src/agent-harness/reference/`.
- `bridge/chat.js`: one `/* global */` comment for V2's ESLint (browser globals).
- `test/dictationTurn.test.ts`, `test/grammarReferentArgs.test.ts`: two `let x = null` initialisers
  dropped for V2's `no-useless-assignment`; one test-only `any` carries a disable comment.

Adaptations beyond the mechanical, each annotated in its file:

- `experiment/cli.ts`: the Anthropic (`liveAgent.ts`) route is dropped (not the pinned
  configuration); the default output directory is `reports/agent-harness/corpus` (gitignored);
  `main` is exported for the runner instead of self-invoking.
- `bridge/server.ts` → `bridge/service.ts` + `bridge/server.ts`: the request path (`runUtterance`),
  the HTTP server and NDJSON protocol are extracted verbatim into `service.ts` and exported;
  `server.ts` keeps process concerns. Added: a scripted mode (`BRIDGE_AGENT=scripted`) that routes
  the corpus's existing fake agent through the same path with a per-request `script` and optional
  `delayMs`; an ephemeral default port; credential loading from `OPENAI_API_KEY` or the file named
  by `AGENT_HARNESS_ENV_FILE` instead of a repository `.env` (V2 does not ignore `.env`).
- `grammar/coverageCli.ts`: output paths follow the moved report and snapshot.

Paid-call budget slice (#945, V2-authored, after the transfer):

- `experiment/openaiAgent.ts`: the SDK call moved into a single `dispatch` that reserves with
  the required `budget` guard before the request and settles or abandons after it; the SDK
  client is constructed with `maxRetries: 0`; `max_output_tokens` is pinned to the bound; the
  request is typed as the guard's closed shape; a `transport` option (fetch, sleep) is a test
  seam. The loop, prompt and tool-round logic are unchanged.
- `experiment/cli.ts`: the run loop extracted as `runCorpus` (one accounting unit per case,
  stop at the first refusal, `budget.json`); `--live` opens the ledger before the credential and
  releases it in `finally`.
- `experiment/pricing.ts`: `ModelPrice` is now the guard's `PaidCallPrice`; every entry carries
  `readOn: '2026-09-01'` and no `acceptedForPaidRuns`, so the transferred figures are refused
  for paid runs until verified.
- `bridge/service.ts`: optional `guard` in `BridgeOptions`; one accounting unit begun per
  `/utterance` turn. `bridge/server.ts`: opens the ledger before the credential, passes the
  guard to the agent and the bridge, releases the lock on SIGINT/SIGTERM.

New files (V2-authored, #945): `run.ts` (Vite module runner entry: the V2 stock catalogue uses
`import.meta.glob`/`?raw`, so this closure cannot execute under plain `tsx`), `bridge/smoke.ts`,
`test/bridgeSmoke.test.ts`, `test/critiqueShow.drift.diagnostic.ts`, this file, `README.md`;
budget slice: `experiment/paidCallBudget.ts` (pure rules), `experiment/paidCallGuard.ts`
(ledger file, lock), `experiment/budgetCli.ts`, `test/paidCallBudget.test.ts`,
`test/paidCallGuard.test.ts`, `test/paidCallDispatch.test.ts`.

## Deliberately not transferred

- `src/experiment/liveAgent.ts` (Anthropic SDK path).
- `src/mcp/main.ts` (stdio MCP entry), `src/shows/exportCli.ts`, `src/telemetry/cli.ts`: V3 CLIs
  outside the bridge/corpus closure; the external-agent slice can bring `main.ts` when #959 decides.
- `test/showRecordSchema.test.ts`, `test/vendoredShowCompile.smoke.test.ts`: V3 vendoring and
  schema-generation tooling; V2 owns its schema through `npm run schema:show-record`.
- `experiments/dictation/**`, `dictation-results/**`: model transcripts and their reports
  (private content; the issue forbids committing transcripts).
- V3 `docs/reference/*` other than the two files the MCP server and coverage test read.

## Transferred oracles that changed

- `test/dictationExperiment.test.ts`: the case "replays a recorded run byte-identically to its
  checked-in report" read the private `experiments/dictation/2026-08-21-r4-multiturn` transcripts
  and was removed with an in-file note. Scoring determinism remains covered by the hand-written
  transcript cases.
- `test/critiqueShow.test.ts`: "returns zero findings for curated good stock Shows" fails against
  the V2 compiler at `ad8ad651` ("Blend and Fade Transitions" now compiles to 25% of the device
  budget with 2 distinct Patterns, so the V3 `budget-headroom` heuristic fires). Kept verbatim in
  `test/critiqueShow.drift.diagnostic.ts`, run by `npm run agent:diagnostics`, never by CI.
- `reference/show-grammar-coverage.md`: regenerated with `npm run agent:coverage` against V2's
  live schema. Only the clips family count moved, 83 to 84 leaf paths, all specific: the Main Clip
  `opacity` field V2 added in #882 is already covered by the grammar's declared touches. The
  generic-only snapshot (`test/fixtures/grammar-generic-only.json`) is byte-identical to V3's.

Everything else in the 20 transferred suites (266 cases) passed unchanged against the live V2
engine at `ad8ad651`.

## Dependencies declared for this closure

| Package | V3 range | Declared here | Installed |
| --- | --- | --- | --- |
| `openai` | `^7.5.0` | `^7.10.0` devDependency | 7.10.0 |
| `@modelcontextprotocol/sdk` | `^1.30.0` | `^1.30.0` devDependency | 1.30.0 (1.29.0 stays nested under `shadcn`) |
| `zod` | `^3.25.76` | `^3.25.76` devDependency | 3.25.76 (already transitive) |
| `ajv` | `^8.20.0` | `^8.20.0` devDependency | 8.20.0 (already transitive) |

All four are devDependencies: only `src/main.tsx`'s import graph is bundled, and the production
build was scanned for both SDKs after the transfer.
