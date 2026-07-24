# Verification gates

Local verification has two layers: commits get a fast, conservative signal;
pushes get one comprehensive landing gate. The push gate combines an independent
correctness review with the complete automated suite, so code does not leave the
machine without both forms of evidence.

## Gate ownership

| Moment | Gate | Purpose |
| --- | --- | --- |
| During development | `npx vitest run path/to/test.ts` | Keep the red-green-refactor loop focused. |
| Before each commit | `npm run lint` and `npm run test:staged` | Run colocated tests for staged code plus explicitly mapped high-risk invariants. |
| Before each push | `npm run review:push`, `npm run test:full`, and `npm run test:e2e` | Review the exact outgoing Git range with Fable Medium or the GPT-5.6 High infrastructure fallback, run every Vitest file once, then exercise the browser smoke flow. |

The Husky `pre-push` hook owns all three steps. Because this is a Git hook rather
than a Claude or Codex lifecycle hook, it runs for pushes initiated by either
agent or from a terminal. `scripts/push-review.ts` reads Git's exact ref-update
packet and assembles one immutable review input containing the outgoing commit
list and patch. Fable Medium receives that input first through the installed
Claude CLI. If Fable cannot return a valid structured decision because of quota,
timeout, process, or response failure, GPT-5.6 High receives the same input
through the installed Codex CLI.

A valid `fail` decision from Fable is authoritative and never invokes the
fallback. A valid `fail` decision from GPT-5.6 High is equally blocking. The gate
also fails closed when neither reviewer returns a valid decision. A blocked
review is terminal: fix the finding or reviewer, then make a new push; never
silently retry or bypass the gate.

`npm run review:push` can exercise the reviewer directly; without Git pre-push
input it reviews `origin/main..HEAD`. The primary review transmits the outgoing
private diff to Anthropic under the developer's authenticated Claude session. A
fallback review transmits the same diff to OpenAI under the developer's
authenticated Codex session. The user has explicitly approved both behaviors
for this repository.

`npm test` remains the explicit full-suite command. The pre-push hook invokes the
same full suite, so a separate full run immediately before pushing normally adds
delay without adding coverage.

## Show authoring edit contracts

Pure Show composition edits use
`src/test/showAuthoringContract.ts` as their common test boundary. An accepted
edit must leave both its Show and composition deeply unchanged, return a
distinct composition, pass `validateShowComposition`, and supply
operation-specific unified-timeline projection and durable-reference
assertions. A refused edit must return the original composition by reference
and leave both inputs deeply unchanged.

Move and resize tests in `src/engine/showTimelineClipAuthoring.test.ts` provide
the initial single-Scene, cross-Scene, accepted, refused, and edit-sequence
examples. Extend the same harness as more Show authoring operations adopt this
contract. Keep projection assertions focused on visible logical Clips and use
the reference callback for Pattern instances, property tracks, Transitions,
logical Clip identity, Groups, or Layer ownership relevant to the operation.

During development, run:

```bash
npx vitest run src/test/showAuthoringContract.test.ts \
  src/engine/showTimelineClipAuthoring.test.ts
```

The staged-test selector treats the shared helper as an invariant boundary.
Changing it runs both its fault-sensitivity characterization suite and the
Show-authoring consumer suite.

## Staged-test selection

`scripts/test-staged.mjs` reads added, copied, modified, and renamed paths from
the Git index. It selects a staged test directly or the colocated test for a
staged JavaScript or TypeScript source file. `scripts/test-selection.mjs` also
adds fixed regression suites when a changed path touches a boundary where a
colocated test is not a sufficient safety net:

- Show compiler and generated controller artifacts
- personal-content persistence, APIs, and database migrations
- controller resource accounting
- Pattern artifact production and stamping
- Vitest configuration and staged-test infrastructure
- shared Show authoring edit contracts

Documentation-only commits skip Vitest at pre-commit. The full review-and-test
pre-push gate is unchanged by the selection result and remains the final
authority.
