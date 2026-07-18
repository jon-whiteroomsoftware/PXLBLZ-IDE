# Verification gates

Local verification has two layers: commits get a fast, conservative signal;
pushes get one comprehensive landing gate. This keeps routine feedback useful
without weakening the invariant that every test passes before code leaves the
machine.

## Gate ownership

| Moment | Gate | Purpose |
| --- | --- | --- |
| During development | `npx vitest run path/to/test.ts` | Keep the red-green-refactor loop focused. |
| Before each commit | `npm run lint` and `npm run test:staged` | Run colocated tests for staged code plus explicitly mapped high-risk invariants. |
| Before each push | `npm run test:full` and `npm run test:e2e` | Run every Vitest file once, then exercise the browser smoke flow. |

`npm test` remains the explicit full-suite command. The pre-push hook invokes
the same full suite, so a separate full run immediately before pushing normally
adds delay without adding coverage.

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

Documentation-only commits skip Vitest at pre-commit. The full pre-push gate is
unchanged by the selection result and remains the final authority.
