# #957 production built-in service proof

Source captured: `6a5e037194d33873c867a410ac768900b170d424`, on landed
`ce916b1d` plus the shared executor/channel checkpoints and cancellation repair.
The managed isolated issue runtime served `http://localhost:5207/PXLBLZ-IDE/`.
The browser used its synthetic `github:local-agent-07` session.

[Consumer facts](consumer-facts.json) contain actual before/after records,
numeric history deltas, write counts, operation identities, reopened result,
completed retirement response, and the explicit receipt/settlement/presentation
layer map. [Review test design](test-design.json) records the controlled domains
and remaining qualification limits.

| Case | Consumer result |
| --- | --- |
| Personal rename | History 0→1; one real personal PATCH; saved activity; reopened name equal. |
| Stock rename | History 0→1; zero personal PATCH; applied-to-draft activity. |
| Stale resize → Retry | Manual Marker invalidates original request; old not-applied activity retained. New operation/retryOf, exact 9,000 ms, one new history/PATCH, saved activity, composer draft preserved. |
| Cancel during held provider | Cancelled receipt; unchanged geometry and persisted Show; zero history additions/PATCH. |
| Remove opt-in during held provider | Completed `no_live_editor` response; persisted Show exactly unchanged and zero PATCH. Agent region/edge absent. History across remount is not used as an oracle. |
| Responsive/keyboard | Desktop pinned; narrow tucked; keyboard Enter opens narrow drawer with readable outcomes and preserved draft. |

Seven inspected PNGs and five native manifests live under
`.wrsp/ui-proof/957-service-*`. Every record preserves the actual captured source
commit. The successful cases came from a main run and a bounded tail run on the
same source: the tail completed opt-out and narrow-open proof without repeating
unrelated passing cases. No page runtime errors were observed in those runs;
this is not a blanket console-error assertion.

## Injection boundary and qualification

Only `/api/agent/*` browser requests are intercepted into an isolated actual
Worker, account Durable Object, allowance owner, relay, and HTTP handler. That
sidecar uses synthetic authentication and the explicit injected provider-fetch
argument. Canonical commands execute in the real browser private executor and
existing admission. Editor content loading and personal writes remain on the
managed runtime's actual API and isolated D1. There is no diagnostic grammar or
`__pxlblzEditor` mutation in these flows.

Independent unintercepted production-route requests returned `401 unauthorized`
without a session and `503 service_disabled` with the synthetic session. This
proves route mounting and current configuration refusal separately from the
injected successful path. The canonical local environment has no configured
provider credential/agent service keys. No paid inference, real-model response
identity/billing qualification, real external MCP-client qualification, remote
migration, deployment, or publication occurred.

[Reproduction fixture](reproduce.mjs) runs from the candidate repository root
with the repository's Playwright, esbuild, and Miniflare packages. Obtain the
managed synthetic session with `npm run dev:session -- --issue 957 --json` and
provide its output path through `AGENT_PROOF_SESSION`. The fixture is explicitly
local and creates named synthetic Shows. Its provider hold has a bounded
request-owned timer; the fifth scenario waits for the real rolling-minute
admission limit. It never substitutes the provider's global fetch with a paid
transport.

## Focused verification

Normal source commit hooks passed. Final affected checks passed 24 tests across
controller, admission-owner, editor-session and route files, plus the separately
named React lifecycle test. The complete finite refusal-copy/controller check
passed 16 tests. Earlier focused provider/budget checks passed 21 tests; private
turn/provider checks passed 18; trusted service orchestration passed five; the
actual allowance-owner/provider integration passed two. These are development
checks, not a claim that final committed-tip suites ran. Root owns those suites
and exact-range review.

## Preserved diagnosis

Early fixture failures were not product failures: chooser accessible-name
matching included explanatory text; stock `draft` and stale `not-applied`
presentation outcomes differ from admission status; a bare synthetic hold
promise triggered workerd's hung-request detector; and the disabled drawer's
layout wrapper remains around the editor even when its Agent region/edge vanish.
The final fixture uses declared outcome layers, bounded hold scheduling, actual
region/edge selectors, and authoritative persisted records after remount.

Two local environment events were separate: Jon's existing localhost identity
needed matching isolated users/identities rows (managed startup seeds synthetic
accounts only); root seeded only those rows. Later the rebase's transient DO
exports triggered the documented `__mf_do_wrapper` undefined-class hot-reload
failure. The verified owned issue957 process was recovered through managed
release/start, preserving isolated D1 and the account seed; main5174 and remote
state were untouched. Earlier exploratory captures retain their original
identity and are not relabeled as final passing proof.
