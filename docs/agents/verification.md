# Verification gates

Local verification has three moments: commits get a fast conservative signal,
landing candidates receive substantive correctness review, and pushes prove
that exact approved history before running the comprehensive automated suite.
Review happens once, before landing on local `main`; publication reuses that
evidence instead of reviewing an expanding stack again.

## Gate ownership

| Moment | Gate | Purpose |
| --- | --- | --- |
| During development | `npx vitest run path/to/test.ts` | Keep the red-green-refactor loop focused. |
| Before each commit | `npm run lint` and `npm run test:staged` | Run colocated tests for staged code plus explicitly mapped high-risk invariants. |
| Before landing | `npm run review:candidate -- <base> <tip> [--test-design <json>]` | Review one explicit candidate range and record an immutable approval for a valid pass. |
| Before each push | `npm run review:push`, `npm run test:full`, `npm run test:e2e`, `npm run test:e2e:auth-smoke`, and `npm run test:e2e:shows` | Require exact approval coverage for every outgoing ref, run every Vitest file once, then exercise the unauthenticated smoke flow and the authenticated suites. |

### Candidate review and landing

The shared checkout stays clean on local `main`; every substantive slice is
implemented and committed in a worktree. Independent candidates may be built
concurrently, but final review and landing form a serialized admission queue:

1. Rebase the next independent candidate onto the latest reviewed local `main`.
2. Run its focused verification and commit the final candidate tip.
3. Run `npm run review:candidate -- <main-sha> <candidate-tip>`.
4. If the candidate passes, land it immediately with `git merge --ff-only`.
5. Remove the landed worktree and branch.

Do not review several sibling candidates from the same base. After one lands,
the others must rebase before review. Dependent candidates remain deliberately
stacked until their reviewed base lands.

`review:candidate` resolves the supplied base and tip to exact Git objects,
requires their commit ancestry to be linear, and rejects merge commits. The
review packet sends the exact commit list and per-commit patch series to the
primary reviewer. It also requests first-parent merge
diffs defensively, preserving empty commits, conflict-resolution changes, and
add-then-revert histories that an endpoint-tree diff would hide.

The primary reviewer is routed against range authorship (#637): commits
signal their authoring model with an `X-Authored-Model:` trailer (legacy
Claude `Co-Authored-By:` trailers also classify), and a range authored
entirely by one model family routes to the opposite family first --
Anthropic-authored to GPT-5.6 High, OpenAI-authored to Opus 5 High. Mixed or
unsignalled ranges use the default order (Opus 5 High first). If the primary
reviewer cannot return a valid structured decision because of quota, timeout,
process, or malformed output, the other reviewer receives the same immutable
input; a fallback that lands same-family is recorded on the receipt as
`crossFamily: false` and warned about loudly, never silently. Receipts also
record the signalled `authoredModels`; receipts predating these fields are
unverified on the cross-family axis, and `review:status` displays each
receipt as `cross-family`, `SAME-FAMILY`, or `family-unverified`.

The Anthropic reviewer streams progress while it works (#637): one line per
tool call, a heartbeat once a minute, a 5-minute no-event stall timer as the
primary failure condition, and a 30-minute backstop. On stall or timeout,
partially emitted structured output is surfaced as diagnostics -- clearly
marked as not an approval -- instead of being discarded. Approval always
requires the complete validated result envelope. The Codex fallback is not
streamed and keeps its 15-minute hard cap. P0/P1 findings are blocking and create no coverage; after correction,
the complete candidate range must be reviewed again. A failure containing only
P2/P3 findings records non-terminal advisory coverage for the reviewed range.
Fix those findings in a new commit, then review only that exact follow-up
range. The advisory receipt can be an intermediate edge in a
contiguous chain, but it can never authorize publication as the final receipt.
A clean pass remains valid only with zero findings; contradictory structured
output is malformed and remains fail-closed.

A clean pass or P2/P3-only review writes a receipt below the repository's
common Git directory:

```text
.git/pxlblz/review-approvals/v1/
```

Worktrees share this directory. Receipts are deliberately outside source
control and contain the exact base and tip identities, reviewer and effort,
prompt and output-schema versions, review-policy fingerprint, optional
test-design-context digest, decision, timestamp, and any non-blocking advisory
findings. Receipt files are created
without overwrite permission. Amend, rebase, squash, cherry-pick, changed tip,
changed policy, malformed receipt, missing receipt, or a gap between receipts
invalidates reuse.

The severity contract is part of the reviewer prompt and policy fingerprint.
Changing that contract invalidates older receipts even when their clean result
would otherwise be stronger evidence.

One exception re-keys receipts instead of discarding them: content-id
carry-forward (#637). Receipts record an ordered per-commit content id -- a
byte-exact sha256 of each commit's full `git diff-tree --patch --full-index`
text, deliberately not `git patch-id`, which ignores intra-line whitespace
that is semantic in reviewed code. `review:candidate` carries an approved
chain across a rebase without re-review when the rebased range's content-id
sequence is identical and the intervening commits touch a file set disjoint
from the stack's. The hashed text includes pre-image blob hashes and context
lines, so any intervening change to a stack-touched file changes the content
id; the disjoint-files check is defense in depth on top of that, computed as
the union of paths touched by any intervening commit (not the net endpoint
diff, so touch-and-revert still forces re-review). Because content ids hash
only the diff, carry also recomputes authorship from the rebased commits'
trailers and requires the receipt's recorded `authoredModels` and
`crossFamily` to match -- a message-only reword that changes the authoring
family refuses to carry rather than misstating reviewer independence -- and
requires the supplied test-design context digest to equal every source
receipt's recorded digest. Conflict resolutions, reordering, added or
dropped commits, overlapping files, annotated-tag tips, or receipts
predating content-id recording all fall through to a fresh review. Carried
receipts keep the original reviewer, coverage, advisories, and authorship,
and record `carriedFrom` provenance rooted at the originally reviewed range.

Accepted residual, decided on #637: path disjointness cannot prove semantic
independence -- an intervening commit can change behavior a carried patch
calls into while touching only other files. Re-review closes that window at
the cost of re-reviewing every rebased stack; the recorded decision is that
a byte-identical stack over disjoint files carries, and semantically
entangled landings are expected to overlap in files often enough for the
guards to catch them. The full Vitest and Playwright pre-push runs still
execute against the final rebased history regardless of how approval was
obtained.

Annotated tags retain their tag-object SHA as the exact receipt identity rather
than being reduced to the target commit. Candidate validation peels the tip
only to confirm that checked-out `HEAD` is the tagged commit. The packet includes
annotated-tag contents with the commit series, so new tags and retagging can
receive exact coverage without hiding metadata or publishing an unreviewed
target commit.

Concurrent reviews serialize on `.git/pxlblz/review.lock` (#637): the lock
directory lives in the shared git common directory so worktrees queue
against each other instead of contending for reviewer quota. The claim
primitive is `mkdir` -- the one POSIX create-if-absent that refuses even an
empty existing directory, which matters because a lock mid-release is
transiently empty and rename-based claiming could seize it -- and the lock
is never removed automatically: POSIX has no compare-and-delete, so every
auto-reap scheme admits an interleaving where a delayed reaper displaces a
live successor. Like git's own
`index.lock`, a dead or persistently unreadable holder fails the run
immediately with explicit `rm -rf` instructions, and a live holder is
reported while waiting, up to a 30-minute cap. After a hard crash, one
manual removal is the cost of unconditional serialization.

Use `npm run review:status -- <base> <tip>` to inspect whether a range is
approved, missing, or stale and to display the contiguous receipt chain.

### Systematic test-design context

When `systematic-test-design` produced a candidate model, pass a JSON file with
the review:

```json
{
  "invariants": ["Accepted history remains byte-identical through landing."],
  "partitions": ["single receipt", "contiguous chain", "missing approval"],
  "sequences": ["review A-B, review B-C, then push A-C"],
  "oracles": ["the outgoing range is covered exactly from remote SHA to tip"],
  "residualGaps": ["remote main can advance before publication"]
}
```

The command validates all five arrays, includes them in the review packet, and
records their digest in the receipt. A P0/P1 defect family returns through
`systematic-test-design` before the replacement candidate receives a new full
review. A P2/P3 defect receives the same-class sweep in its corrective slice,
then only that exact follow-up range is reviewed.

### Publication

The Husky `pre-push` hook reads Git's exact ref-update packet. Deleted refs and
unchanged commit identities require no approval; different commit identities
remain reviewable even when their endpoint trees match. Each changed existing
or new ref must have one current approval or a contiguous current chain from
its remote base to its pushed tip. A new ref derives its base only from the
remote main line; if that baseline does not exist, the gate blocks instead of
self-basing the range at the pushed tip. Missing or stale coverage blocks with an explicit
`review:candidate` command; pre-push does not repeat substantive review.

After every outgoing ref has exact coverage, the hook runs the full Vitest suite,
the Playwright smoke suite, and the authenticated smoke and Show suites once. Because this is a Git hook rather than a Claude
or Codex lifecycle hook, it applies equally to agent and terminal pushes.

`npm test` remains the explicit full-suite command. The pre-push hook invokes the
same full suite, so a separate full run immediately before pushing normally adds
delay without adding coverage.

Candidate review transmits the exact private diff and supplied engineering
context to Anthropic under the developer's authenticated Claude session. A
fallback transmits the same material to OpenAI under the authenticated Codex
session. The user has explicitly approved both behaviors for this repository.

## Authenticated browser suites

Authenticated Playwright does not reuse the persistent development database.
`npm run test:e2e:auth-smoke` and `npm run test:e2e:shows` reserve isolated
ports and D1 persistence through the managed runtime registry, seed before
server startup, and release their state after the run. See
[`dev-runtime.md`](dev-runtime.md) for the shared-versus-isolated contract.

Each authenticated run seeds four synthetic worker identities and runs its
specs fully parallel. A worker signs in as the identity derived from its stable
parallel index, and the automatic fixture cleanup lists and deletes records
only through that worker's session. The synthetic namespace is separate from
the persistent development identity, which the suites never read or mutate.

### What the gates actually cover

`playwright.config.ts` sets `testIgnore: '**/*.auth.spec.ts'`, so
`npm run test:e2e` covers **no** authenticated spec on its own. Pre-push
therefore runs the authenticated suites explicitly alongside it.

| Suite | Gate |
| --- | --- |
| `npm run test:e2e` (unauthenticated) | pre-push |
| `npm run test:e2e:auth-smoke` | pre-push |
| `npm run test:e2e:shows` | pre-push |
| `npm run test:e2e:auth-full` (every auth spec) | manual |

Treating "manual" as covered is how #638 happened: three feature-retirement
commits removed UI and fixtures without touching `e2e/`, and `shows.auth`
reached 27 of 40 failing on `main` before anyone noticed. Two static checks in
pre-commit close the awareness gap without paying browser time:

- `npm run check:e2e-coverage` fails when an authenticated spec is named by no
  npm script. Invoking a spec through a bare `npx tsx …` line in this document
  is not coverage; that is precisely how `workspace-recovery.auth.spec.ts` ran
  in no suite while #626 was adding tests to it.
- `npm run check:e2e-locators` fails when a spec names a user-facing string live
  source no longer produces. Labels are usually assembled from templates, so it
  matches a name against each template's static segments in order, honouring the
  template's own anchoring. Re-record with
  `npm run check:e2e-locators -- --record`; `scripts/check-e2e-locators.test.ts`
  pins the behaviour.

  `e2e/known-stale-locators.json` keeps two buckets, and the distinction is the
  point:

  - **`stale`** — produced nowhere in live source. These are broken specs. The
    check gates on this list, and it must shrink to zero.
  - **`unverifiable`** — assembled mostly from runtime data, such as
    `Select ${clip.patternName}`. Static analysis can neither confirm nor refute
    them, and no spec edit will ever "repair" one. They are recorded separately
    and never gate.

  Conflating the two is what made an earlier version of this check useless: it
  filed every `Verb ${x} Noun` label as stale, which both buried the genuinely
  broken names and left the check blind to a rename of the very affordance that
  motivated it.

The locator check exists because the 2.0 rename pass was applied unevenly —
`New show` fixed in two helpers but not four inline call sites, the transition
selector in one call site but not eight, the pan slider but not the zoom slider
on the adjacent line. Each would have failed this check in the commit that made
it.

### Pre-landing e2e responsibility (#673)

Static checks catch dead locators, not broken behavior. Because the Playwright
suites run automatically only at push time, and pushes batch several agents'
landings, a behavioral e2e failure surfaces on whichever agent happens to push
— hours after the commit that caused it, on top of unrelated work (#667's push
absorbed exactly this). The implementing agent is therefore responsible for
e2e validation *before* landing, not the pushing agent:

- Before requesting review for a slice that touches a gate-covered surface,
  run the affected suite in full from the worktree: Show editor, timeline,
  Zones, or Show persistence → `npm run test:e2e:shows`; authentication,
  sessions, or personal content → `npm run test:e2e:auth-smoke`; app shell or
  Pattern Studio surfaces → `npm run test:e2e`.
- Record which suites ran (and their counts) in the issue's Tests section for
  the landing coordinator, and as an `X-E2E:` trailer on the slice's final
  commit (for example `X-E2E: test:e2e:shows 52/52`, before the
  `X-Authored-Model:` trailer) — the candidate reviewer sees only the commit
  range, so the trailer is what clears its advisory.
- Run the whole affected suite, not a filtered test: several failures only
  reproduce under full-suite timing (#672 reproduced 2/2 in suite order and
  0/2 in isolation).
- The candidate reviewer emits a P3 advisory when a diff plainly touches one
  of these flows and the range carries no corresponding e2e evidence. It
  rides the ordinary P2/P3 flow: the range keeps non-terminal advisory
  coverage, and the exact corrective commit is the one carrying the
  `X-E2E:` trailer once the suite has run. The advisory is a prompt to run
  the suite, not a substitute for it.

### Workspace recovery contract

The focused workspace-recovery gate combines store-level fault oracles with a
small authenticated browser matrix:

```bash
npx vitest run src/components/Editor.recovery.test.tsx src/store/mapStore.test.ts
npx tsx scripts/run-authenticated-playwright.ts e2e/workspace-recovery.auth.spec.ts
```

The unit layer proves last-clean Pattern preview/persistence and last-good Map
bake recovery through invalid input, repair, and reload. The browser layer uses
an isolated disposable identity to prove selected-entity cancel, confirmed
deletion, route recovery, API readback, and reload for representative rails.
The authenticated fixture removes only its synthetic records, across every
personal-content resource, even when a test fails. It never cleans or mutates
the persistent shared development identity.

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
examples. The declared cross-operation partitions, review-defect map, and
multi-step cases live in
[`logical-clip-test-matrix.md`](logical-clip-test-matrix.md). Extend the same
harness as more Show authoring operations adopt this contract. Keep projection
assertions focused on visible logical Clips and use the reference callback for
Pattern instances, property tracks, Transitions, logical Clip identity, Groups,
or Layer ownership relevant to the operation.

During development, run:

```bash
npx vitest run src/test/showAuthoringContract.test.ts \
  src/engine/showAuthoringMatrix.test.ts \
  src/engine/showTimelineClipAuthoring.test.ts \
  src/engine/showCompositionModel.test.ts \
  src/engine/showClipInspectorModel.test.ts \
  src/engine/showLayerTransitionAuthoring.test.ts \
  src/store/showStore.test.ts
```

The staged-test selector treats the shared helper as an invariant boundary.
Changing it runs its fault-sensitivity characterization suite, the central
matrix, the operation-specific Show-authoring suites, and the persistence
sequence.

## Show authoring mutation qualification

`npm run test:mutation:show-authoring` checks whether the Show authoring suite
rejects a small catalog of plausible faults. It is intentionally narrower than
whole-file mutation: the command resolves named source fragments through the
TypeScript syntax tree, runs the five owning Vitest suites in an isolated Node
project, and writes `reports/mutation/show-authoring.json`.

The catalog spans every critical operation family without turning mutation
testing into a second full suite:

| Operation | Qualified fault boundary |
| --- | --- |
| Move | Dispatch between ordinary and multi-Scene logical Clip movement |
| Resize | Placement-animation keyframes retain their offset from the moved edge |
| Split | The public plan uses strict interior Clip boundaries |
| Duplicate | The immediate-after destination retains one complete source-Clip duration |
| Delete | The complete logical Clip, its tracks, and connected Transitions are removed together |
| Inspector | Timing and colocated placement fields commit or refuse atomically |
| Transition | Insert validation and resize-delta arithmetic preserve a valid composition |

The wrapper fails closed when the runner cannot start, omits or malforms its
JSON report, reports no mutants, leaves a result pending, times out or errors,
or leaves a meaningful survivor unexplained. Equivalent or mechanically
irrelevant survivors belong in
`scripts/show-authoring-mutation-classifications.json` with a stable
fingerprint and concrete reason. The parser rejects blank, duplicate, and stale
classifications. The qualified #597 run on 2026-07-23 killed all 57 selected
mutants in 6.4 seconds, with no survivors, timeouts, errors, or classifications.

Run this command after changing one of the catalogued transformation boundaries,
after a review cluster exposes weak fault sensitivity in the Show authoring
family, or before handing off a systemic Show-test change. Keep it outside the
pre-commit and pre-push hooks; the ordinary focused and full suites remain the
routine gates.

## Staged-test selection

`scripts/test-staged.mjs` reads added, copied, modified, and renamed paths from
the Git index. When those paths can affect either configured TypeScript project,
it first runs `tsc -b --pretty false`; a type-invalid source or test change
therefore cannot be committed even when ESLint and Vitest accept the file. It
then selects a staged test directly or the colocated test for a staged
JavaScript or TypeScript source file. `scripts/test-selection.mjs` also adds
fixed regression suites when a changed path touches a boundary where a
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
