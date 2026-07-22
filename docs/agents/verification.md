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
| Before each push | `npm run review:push`, `npm run test:full`, and `npm run test:e2e` | Review the exact outgoing Git range with Fable Medium, run every Vitest file once, then exercise the browser smoke flow. |

The Husky `pre-push` hook owns all three steps. Because this is a Git hook rather
than a Claude or Codex lifecycle hook, it runs for pushes initiated by either
agent or from a terminal. `scripts/push-review.ts` reads Git's exact ref-update
packet, sends the outgoing commit list and patch to Fable Medium through the
installed Claude CLI, and requires structured pass/fail output. It fails closed
on findings, malformed output, reviewer failure, or the ten-minute timeout. A
blocked review is terminal: fix the finding or reviewer, then make a new push;
never silently retry or bypass the gate.

`npm run review:push` can exercise the reviewer directly; without Git pre-push
input it reviews `origin/main..HEAD`. The review transmits the outgoing private
diff to Anthropic under the developer's authenticated Claude session. The user
has explicitly approved that behavior for this repository.

`npm test` remains the explicit full-suite command. The pre-push hook invokes the
same full suite, so a separate full run immediately before pushing normally adds
delay without adding coverage.

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

Documentation-only commits skip Vitest at pre-commit. The full review-and-test
pre-push gate is unchanged by the selection result and remains the final
authority.
