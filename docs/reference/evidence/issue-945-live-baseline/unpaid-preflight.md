# Issue #945 live-baseline unpaid preflight

This record preserves the unpaid controls completed at code tip
`f61264f1844bc2af1cfbfe93e16ecb53646c2301` on 2026-09-05 Pacific time.
`AGENT_HARNESS_ENV_FILE` was unset, so the paid corpus was not started. The
default ledger was created once and no credential was read.

## Ledger status before any paid call

Command: `npm run agent:budget`

Exit: 0

```text

> pxlblz-ide@1.0.0 agent:budget
> npm run check:node && tsx src/agent-harness/experiment/budgetCli.ts


> pxlblz-ide@1.0.0 check:node
> wrsp-check-node && node scripts/check-node-floor.mjs

ledger: /Users/voidstar/.local/state/pxlblz-ide/agent-harness-paid-calls.json
bounds: $20 aggregate, $2 per run, 4 calls per case or turn, 4000 output tokens per call, acceptances at most 30 days old
prices accepted for paid runs: gpt-5.6-luna $0.2/$0.02/$1.2 per M input/cached/output, above 272000 input tokens 2x input 1.5x output, cache writes 1.25x (#945 root coordinator (gpt-6-astra), 2026-09-05; https://developers.openai.com/api/docs/models/gpt-5.6-luna (standard tier text prices, long-context and cache-write terms))
provider input ceilings accepted for paid runs: gpt-5.6-luna 1050000 tokens (#945 root coordinator (gpt-6-astra), 2026-09-05; https://developers.openai.com/api/docs/models/gpt-5.6-luna (context window, maximum output); https://developers.openai.com/api/reference/cli/resources/responses/methods/create (truncation))
reservation per call for gpt-5.6-luna: $0.532200 (1050000 input tokens and 4000 output tokens at the worst applicable documented rates; at most 3 unsettled or ambiguous calls fit one $2 run)
created 2026-09-06T02:46:54.736Z: #945 live baseline: Jon authorised the existing OpenAI credential with a $20 aggregate maximum on 2026-09-04
consumed $0.000000 over 0 entries (0 settled, 0 ambiguous, 0 unsettled, 0 overruns); remaining $20.000000
```

The status shows the documented bounds, both acceptances inside the 30-day
window, the $0.5322 reservation, no halt, and an empty ledger. Settled spend is
$0; 0 of 43 live corpus cases are measured and 43 remain unmeasured.

## Fake-corpus control

Command: `npm run agent:corpus -- --fake`

Exit: 0

```text
# Dictation experiment report — scripted-fake

First-try success: **43/43** (100%). Tool calls: 77; transactions: 35. Asked when it should: 5/5; refused when it should: 3/3.

## By operation family

| Family | Cases | First-try | % |
| --- | --- | --- | --- |
| animation | 7 | 7 | 100% |
| clips | 19 | 19 | 100% |
| effects | 3 | 3 | 100% |
| junctions | 3 | 3 | 100% |
| layer-transitions | 3 | 3 | 100% |
| structure | 3 | 3 | 100% |
| timeline | 5 | 5 | 100% |

## By referent source

| Referent | Cases | First-try | % |
| --- | --- | --- | --- |
| direct | 8 | 8 | 100% |
| hover | 5 | 5 | 100% |
| none | 6 | 6 | 100% |
| ordinal | 10 | 10 | 100% |
| pattern-name | 7 | 7 | 100% |
| selection | 1 | 1 | 100% |
| time | 6 | 6 | 100% |

## Generic-operation use (the gap signal)

None.

## Failures

None.
```

## Held-out integrity control

Command: `npm run agent:held-out:verify`

Exit: 0

```json
{
  "version": "v1",
  "caseCount": 16,
  "categories": {
    "animation": 2,
    "clarification": 2,
    "clips": 3,
    "effects": 2,
    "junctions": 1,
    "layer-transitions": 1,
    "refusal": 2,
    "structure": 1,
    "timeline": 2
  },
  "releaseGate": "#958",
  "manifestSha256": "2699c06c18b11c86a36e9c7462dc5fcb8206cf83f2158c11711d42d7d78d17de",
  "path": "/Users/voidstar/src/worktrees/pixelblaze-v2-945-baseline/src/agent-harness/held-out/v1",
  "permittedAction": "integrity-verification"
}
```

No held-out input or expected outcome was opened, executed, scored, or used for
tuning.
