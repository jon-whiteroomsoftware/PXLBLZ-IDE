# #1048 actual-workerd proof

Candidate: 79364b1b7fa9bb1539933f39915656e97ba18028
Base: b2f8426e7e391d440d00e124590d9f1772d1db6d

Command:
`npx vitest run src/worker/agent/agentMcpRouting.test.ts src/worker/agent/agentMcpSchemaCensus.test.ts src/worker/agent/agentRelay.test.ts src/worker/agent/AgentAccount.test.ts src/worker/agent/agentRelay.runtime.test.ts src/worker/agent/agentOAuth.runtime.test.ts src/engine/agentDeliveryJournal.test.ts src/engine/agentPrivateExecutor.test.ts src/worker/agent/builtinService.test.ts`

Result: 9 files passed, 78 tests passed.

Actual-workerd cases:
- Authenticated OAuth client: fresh read, server-minted begin operation, pending same-key begin retry with no second browser delivery, then ten simultaneous independent mutations received one at a time at contiguous relay sequences 1..10; every call returned changed.
- Lost commit reply: terminal cancel received the next sequence, settled commit as result_unavailable, and made the late commit reply unknown.
- Durable Object eviction: Miniflare `unsafeEvictDurableObject` recreated AgentAccount while its SQLite binding survived. Two old-binding dispatch/retry attempts returned retirement_unconfirmed, browser receive observed retiring, and retirement ACK ended the generation. A fresh binding then completed read_show and began a new operation at sequence0.
- Built-in caller-owned envelopes and browser duplicate/conflict/gap checks remained green.

Schema census:
- Exact base b2f8426 observed response: 62 tools, 271,687 UTF-8 bytes.
- Candidate response: 62 tools / 57 mutation tools, 269,177 bytes.
- Delta: -2,510 bytes.
