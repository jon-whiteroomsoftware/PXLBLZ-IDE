# Verification gates

Commits get a focused conservative signal. Final candidates receive the required
full-suite evidence and substantive exact-range review before landing.
Publication consumes those records and runs its separate artifact oracle;
it does not execute the four heavy suites again.

Since #724 the gate implementation lives in the shared
`@whiteroom/software-process` package (vendored as a release tarball under `vendor/`, a `file:` devDependency in
`package.json`); the npm script names are unchanged. This repository supplies
its project policy, staged-test selection boundaries, artifact deliverables,
and e2e meta-check paths in `wrsp.config.mjs`, and its UI proof policy in the
pure-data `wrsp-ui-proof.json`. The reviewer prompt's project-specific advisory
paragraph is `review.projectPolicy` there and participates in new candidate
review context. Native approvals retain the policy and reviewer
facts that authorized their exact ranges; later policy changes do not revoke
those approvals. Rewrites still require new coverage or supported carry.

The installed release is pinned in `package.json` and `package-lock.json`;
runner adoption was delivered in #962. The release-specific sections below
retain historical adoption evidence. See
[WRSP 0.5.2 review packet adoption](#wrsp-052-review-packet-adoption-961) for
the packet representation introduced there,
[WRSP 0.5.1 review policy](#wrsp-051-review-policy-960) for reviewer routing,
and [WRSP 0.5.0 consumer guards](#wrsp-050-consumer-guards-940) for guard history.

## WRSP 0.9.0 adoption (#975)

This release adds deferred code review with inspected visual proof and bounded
contract-feasibility discussion. It preserves native historical approvals and
requires final-tip test evidence under the installed package and configuration.

| Field | Value |
| --- | --- |
| Release | `@whiteroom/software-process` 0.9.0, tag `v0.9.0` |
| Source | `20238cb743be4cce6af0e79ed0dbf66688ab03aa` |
| Tarball | `vendor/whiteroom-software-process-0.9.0.tgz` |
| SHA256 | `368d298b225d81a39a3200e85cc60a13e9cdfc4f46deebfe6b794f75341cf48c` |

The source release passed 686 tests and its exact-range Fable High review,
including native two-stage browser/image acceptance and packed-bin startup
checks. Consumer final-suite, approval, and publication records belong to #975.
Canonical execution and review-workflow guidance was deployed from the reviewed
source artifacts; the installed native worker hook passed 14 interface cases.
These host changes are distributed separately from the executable tarball.

## Execution workers and issue classifier

Execution workers follow `~/.agents/execution-policy.md`: Astra Low, then Sol
High, then Fable High when unavailable. Opus is excluded from implementation.
Each launch names its exact model and effort. Availability fallback records its
reason; a worker that does not converge requires diagnosis and a changed
approach, with deliberate Astra Medium escalation where justified. Model or
context changes preserve the candidate lineage and review breaker. Permission
refusals stop the affected action.

The optional post-commit issue classifier remains comment-only and defaults to
`gpt-6-astra` / `low`. Paired `WRSP_ISSUE_CLASSIFIER_MODEL` and
`WRSP_ISSUE_CLASSIFIER_EFFORT` overrides also support `gpt-5.6-sol` / `high`.
Partial, empty, or unsupported pairs are rejected before paid launch. Failure
skips the optional comment; this hook adds no automatic Fable CLI fallback.
Its invocation settings do not alter candidate reviewer routing.

## WRSP 0.8.0 adoption (#969)

This historical migration installed the first-tranche verification and capture changes plus
native ranked reviewer selection and persistent approvals. It replaced the
tracked 0.6.0 tarball from #962. The capture adapter imports the package's public
`capture-scenario` export; a fresh install provides that implementation without
staging development code in `node_modules`.

| Field | Value |
| --- | --- |
| Release | `@whiteroom/software-process` 0.8.0, tag `v0.8.0` |
| Source | `b426a382675836eda6f336ba531d63db263281cc` |
| Tarball | `vendor/whiteroom-software-process-0.8.0.tgz` |
| SHA256 | `1ee188a10dac9f8aecb09f102c44b11aa4479733637e2f1b1a5709a3ba8c248f` |

The tarball hash was checked before installation and `npm ci --offline`
completed from the tracked lockfile. Consumer source, capture proof, final
runner evidence and exact review coverage are distinct steps; their immutable
commits and final results are recorded in #969.

The project-policy update removes trailer/spec-change-as-execution claims.
Under the installed native approval contract, historical exact-range approvals
retain their original model, effort and policy facts. No old receipt is relabeled,
and this migration does not require reviewing the previously pushed stack again.
New or rewritten commit identities still need matching coverage. Test evidence
binds the current package/configuration/tip and requires fresh final-suite results.

### Classifier override at adoption

At #969 the classifier defaulted to Sol High, with an explicitly authorized
Astra Low override. Current selection is described in
[Execution workers and issue classifier](#execution-workers-and-issue-classifier).

## Gate ownership

| Moment | Gate | Purpose |
| --- | --- | --- |
| During development | `npx vitest run path/to/test.ts` | Keep the red-green-refactor loop focused. |
| Before starting in a worktree | `npm run preflight -- worktree` and `npm run preflight -- port <n>` | Refuse substantive work in the shared checkout; report a port's owner before a dev server claims it. |
| Before each commit | `npm run lint` and `npm run test:staged` | Run colocated tests for staged code plus explicitly mapped high-risk invariants. |
| Before landing (ordinary review) | `npm run review:candidate -- <base> <tip> [--test-design <json>]` | Enforce the UI proof gate for the range, then review one explicit candidate range and record an immutable approval for a valid pass. `npm run check:ui-proof -- <base> <tip>` runs the proof gate alone. |
| Final committed tip, before landing | `npx wrsp-runner test <tip>` | One coordinator executes the required full Vitest and three browser suites declared in `wrsp.config.mjs`; matching completed records are reused. |
| Before each push | `npm run review:push`, `npm run check:artifact-oracle`, and `wrsp-check-test-evidence <tip>` through `.husky/pre-push` | Require exact approval coverage, prove exported Show deliverables reopen, and consume matching evidence for all required runner suites. |
| Periodic sweep | `npm run check:issue-proof -- --since-days <n>` | Audit recently closed issues for a named and attached proof. A report, not a hook. |

### Candidate review and landing

The shared checkout stays clean on local `main`; every substantive slice is
implemented and committed in a worktree. Independent candidates may be built
concurrently, but final review and landing form a serialized admission queue:

1. Rebase the next independent candidate onto the latest reviewed local `main`.
2. Run its focused verification and commit the final candidate tip.
3. Have one coordinator run `npx wrsp-runner test <candidate-tip>` for the required
   full suites, preserving job ids and results. Other agents do not submit the
   same candidate concurrently; the runner queues jobs but does not merge them.
4. Run `npm run review:candidate -- <main-sha> <candidate-tip>` with required proof.
5. If the candidate passes, land it immediately with `git merge --ff-only`.
6. Remove the landed worktree and branch.

A repair or rebase changes the exact tip and requires fresh full evidence.
Runtime, configuration, command, and package changes can also invalidate records.
For Show command convergence, run `npm run test:show-command-convergence`
before source freeze. It selects the canonical command directory (including
registry, goldens and touches), diagnostic grammar breadth/structure/registry,
all `canonical*` adapter suites, and the grammar MCP suite. This cross-catalog
check supplements operation-specific checks and leaves final suites outstanding.

During repairs, use focused tests to settle the changed behavior and keep the
full required suites outstanding. A focused pass, an e2e spec change, or an
`X-E2E:` trailer does not constitute full-suite evidence. Resume already known
jobs after a collection failure rather than resubmitting them.

Before repeating a failed prerequisite, capture attempt, or advisory repair,
name what changed, what remains unproved, and why another attempt should help.
If progress stalls, preserve evidence and discuss changing approach, narrowing
scope, or deferral with Jon. The three-P0/P1 stop still applies; existing gates
remain mandatory and advisory landing semantics do not guarantee convergence.

`review:candidate` resolves the supplied base and tip to exact Git objects,
requires their commit ancestry to be linear, and rejects merge commits. The
review packet sends the exact commit list and every per-commit changed line to
the primary reviewer, with unchanged endpoint context represented once. The
per-commit series uses zero-context patches and requests first-parent merge
diffs defensively, preserving empty commits, conflict-resolution changes, and
add-then-revert histories that an endpoint-tree diff would hide. Packet
construction finishes a size and completeness preflight before launching a
reviewer. Missing, incomplete, or oversized input remains a non-approval; the
packet is never truncated to fit the transport.

The reviewer tier is Fable High, Astra Medium, Sol 5.6 High, then Opus 5 Extra
High. A single-family candidate tries only the opposite family's reviewers in
that order: GPT authorship tries Fable then Opus; Claude authorship tries Astra
then Sol. A valid review with findings stops the route for repair. Unavailable
or unusable reviewers advance to the next eligible model; exhaustion fails.
Mixed-family ranges need splitting, and unsignalled authorship stays unverified.

An explicit choice applies to one invocation:

```bash
npm run review:candidate -- <base> <tip> \
  --reviewer-model claude-opus-5 --reviewer-effort xhigh
```

An explicit choice has no fallback unless both fallback model and effort flags
are supplied. The next ordinary invocation returns to the ranked tier. Native
receipts preserve actual reviewer, effort, and authorization facts; the later
status and push gates consume exact contiguous coverage ending in clean
approval without repeating the review. Historical ledgers below describe what
the older evaluator did at those migrations, not current revocation behavior.

Provider runtime permission and execution-agent selection are separate from
review routing. The execution policy above governs workers; receipt provenance
continues to record the actual reviewers and efforts.

The Anthropic reviewer streams progress while it works (#637): one line per
tool call, a heartbeat once a minute, a 5-minute no-event stall timer as the
primary failure condition, and a 30-minute backstop. On stall or timeout,
partially emitted structured output is surfaced as diagnostics -- clearly
marked as not an approval -- instead of being discarded. Approval always
requires the complete validated result envelope. The Codex reviewer is not
streamed and keeps its 15-minute hard cap. P0/P1 findings are blocking and create no coverage; after correction,
the complete candidate range must be reviewed again. A failure containing only
P2/P3 findings records non-terminal advisory coverage for the reviewed range.
Fix those findings in a new commit, then review only that exact follow-up
range. The advisory receipt can be an intermediate edge in a
contiguous chain, but it can never authorize publication as the final receipt.
A clean pass remains valid only with zero findings; contradictory structured
output is malformed and remains fail-closed.

#### Deferred UI proof

`npm run review:candidate -- <base> <code-tip> --defer-ui-proof` allows code
review to overlap browser capture. Clean or advisory code review creates an
immutable awaiting-proof record, exits nonzero, and grants no landing or push
coverage. Missing deferred UI evidence is not itself a code-stage finding.
Actual defects and other required evidence remain subject to normal review.

Follow the [browser proof recipe](browser-verification.md#deferred-proof-completion)
to append complete proof packages and run
`npm run review:candidate -- <base> <final-tip> --complete-ui-proof <pending-id>`.
Completion pins the original base, code tip, policy and test-design context;
its reviewer receives actual capture bytes and the proof history, without
repeating the unchanged code review. An evidence-only `proof-incomplete` result
preserves pending state and changes no breaker fact. Product defects retain
normal severity. Successful composition records both review scopes in a native
version-2 receipt; advisories from either stage remain advisory.

The final four runner suites still bind the final committed tip before landing;
publication consumes their evidence without rerunning them. A composed receipt
does not qualify for generic content-identical rebase carry. Ordinary review
retains its proof prerequisite and version-1 receipt path.

#### Review outcomes and the repair loop (WRSP 0.5.1)

Every non-approval exits nonzero and writes no approval receipt. Classify the
actual result; neither the word BLOCKED nor exit status 1 is a verdict.
The heading retains its historical anchor; the outcomes below are current:

| Outcome | Meaning | What continues |
| --- | --- | --- |
| `CANDIDATE CONTRACT DISCUSSION REQUIRED` | A valid `contract-infeasible` result identifies a requirement beyond the supported domain and proposes bounded rescope. No approval or pending code attestation is created. | Discuss immediately with Jon before further affected implementation or review. No fallback, added P0/P1 evidence, or breaker reset. Missing proof or ordinary achievable defects do not qualify. |
| `CANDIDATE REPAIR REQUIRED` | The review completed and found P0/P1 defects. No approval is created for that candidate. | Authorized repair: fix, verify, commit a new tip, and review the replacement full range while the candidate converges. Landing is blocked; correction is not. |
| `CANDIDATE REVIEW PAUSED` | Three consecutive P0/P1 (terminal) outcomes on one candidate lineage. The breaker refused the fourth reviewer launch before it started. | Discuss the invariant, the approach, or the enforcement layer with Jon. `--acknowledge-non-convergence` admits exactly one further attempt and prints a warning naming the streak it overrode. A clean or advisory outcome ends the streak. |
| `CANDIDATE REVIEW ERROR` | Provider, prerequisite, validation, lock, freshness, or contradictory-structured-output failure. No valid review approval is available. | A transient error is retried after its cause is fixed. A real permission or security denial, unusable verification, or unrecoverable failure stops that action: report the exact reason and never bypass the gate. |

Independent work continues through any of these unless it shares the blocker.
The breaker's outcome records in `.git/wrsp/review-outcomes/v1/` and the round
log in `.git/wrsp/review-rounds.jsonl` are keyed by lineage, not by policy
fingerprint, so a package upgrade does not reset an in-progress streak: the
#945 corrective lineage on base `b1fbc1e5` carried two terminal outcomes
(tips `a4e11cc0` and `54f47d5b`) into the 0.5.1 adoption and still does. A
P2/P3-only failure is not terminal and takes the ordinary advisory path above.

A clean pass or P2/P3-only review writes a receipt below the repository's
common Git directory:

```text
.git/wrsp/review-approvals/v1/
```

Worktrees share this directory. Receipts are deliberately outside source
control and contain the exact base and tip identities, reviewer and effort,
prompt and output-schema versions, review-policy fingerprint, optional
test-design-context digest, decision, timestamp, and any non-blocking advisory
findings. Receipt files are created
without overwrite permission. Amend, rebase, squash, cherry-pick, changed tip,
malformed receipt, missing receipt, or a gap between receipts invalidates direct
reuse. Supported content-identical carry can establish new exact identities.
Native approvals retain the policy, severity contract, model and effort facts
under which they were accepted; changing those facts for later reviews does not
revoke historical exact-range coverage.

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
Every carry attempt appends one JSON line to `.git/wrsp/carry-log.jsonl`
(#725) -- carried, refused with a typed reason such as `files-overlap` or
`content-mismatch`, or no candidate -- so the cost of rebase-driven
re-reviews is measurable before any carry-policy tuning. The log is
observational only; a telemetry write failure warns and never blocks review.

Accepted residual, decided on #637: path disjointness cannot prove semantic
independence -- an intervening commit can change behavior a carried patch
calls into while touching only other files. Re-review closes that window at
the cost of re-reviewing every rebased stack; the recorded decision is that
a byte-identical stack over disjoint files carries, and semantically
entangled landings are expected to overlap in files often enough for the
guards to catch them. Exact-tip WRSP evidence for the required full Vitest and
Playwright suites still covers the final rebased history regardless of how
approval was obtained.

Annotated tags retain their tag-object SHA as the exact receipt identity rather
than being reduced to the target commit. Candidate validation peels the tip
only to confirm that checked-out `HEAD` is the tagged commit. The packet includes
annotated-tag contents with the commit series, so new tags and retagging can
receive exact coverage without hiding metadata or publishing an unreviewed
target commit.

Concurrent reviews serialize on `.git/wrsp/review.lock` (#637): the lock
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

After every outgoing ref has exact coverage, the hook runs the artifact oracle
gate and then requires passing WRSP evidence for the exact local tip. The four
required suites are `test:full`, the public Playwright smoke suite, and the
authenticated smoke and Show suites. Agents create that evidence before
landing with `npx wrsp-runner test <tip>`; the hook never starts a local heavy
suite or falls back to one. Because this is a Git hook rather than a Claude or
Codex lifecycle hook, it applies equally to agent and terminal pushes.

`npm test` remains the explicit local full-suite command. Publication normally
uses the remote runner evidence instead.

Vitest reports the DOM component suite as `|jsdom|`: it provides DOM APIs but
does not compute layout or run browser rendering. A project name containing
`browser`, `chromium`, `firefox`, `webkit`, or `playwright` is reserved for a
project with Vitest Browser Mode explicitly enabled. The configuration loads
`assertVitestProjectIdentity` and fails before discovery if a project label
overstates that execution environment.

Files named `*.layout.test.ts` or `*.layout.test.tsx` run only in the
`chromium-layout` project. That project uses Vitest Browser Mode with the
Playwright provider and headless Chromium; it imports the production
`src/index.css` entrypoint and waits for `document.fonts.ready` before tests
measure anything. Run it directly with `npm run test:layout`. The unfiltered
`npm test` command also discovers this project, so the required `full-vitest`
runner suite includes real-browser layout coverage while ordinary component
tests stay in the faster `jsdom` project. Run `npm run check:playwright` before
diagnosing a browser-startup failure. The product surface manifest, policy
annotations, stable fault locations, gate canary, and #757 mutation
qualification are documented in
[`layout-verification.md`](layout-verification.md).

Candidate review transmits the exact private diff and supplied engineering
context to whichever family the route selects first -- Anthropic under the
developer's authenticated Claude session, or OpenAI under the authenticated
Codex session -- and a fallback transmits the same material to the other. The
user has explicitly approved both behaviors for this repository.

## Authenticated browser suites

Authenticated Playwright does not reuse the persistent development database.
`npm run test:e2e:auth-smoke` and `npm run test:e2e:shows` reserve isolated
ports and D1 persistence through the managed runtime registry, seed before
server startup, and release their state after the run. See
[`dev-runtime.md`](dev-runtime.md) for the shared-versus-isolated contract.

### Visual Effects Guide screenshots

Run `npm run docs:screenshots:visual-effects` to refresh the two committed
screenshots used by `docs/guides/Visual effects guide.md`. The command starts
the isolated authenticated Playwright harness, opens the built-in Redline
Installation Show at a 1280 x 720 viewport, pauses and seeks to 16.9 seconds,
then captures the overview and the RedlineMachine Entity Detail Panel. It
overwrites these exact assets:

- `docs/screenshots/show-visual-toolkit-overview.png`
- `docs/screenshots/show-visual-toolkit-entity-detail.png`

The capture spec checks the current Show-editor landmarks before writing each
file, then verifies the PNG signature and 1280 x 720 dimensions. Inspect both
image diffs before committing them; the command proves repeatable production
and current UI structure, while the guide's editorial sign-off remains a human
review.

### Public suite targeting (#746)

The public suite is candidate-aware for the same reason the authenticated
suites own their ports: the stable reviewed-main runtime intentionally always
occupies Vite `5174`, so the old config — hard-coded `5174` with
`reuseExistingServer: true` — let a worktree gate run pass "20/20" against
old main instead of the candidate under test. The suite now refuses to run
against an unverified server:

- `npm run test:e2e` (`scripts/run-public-playwright.ts`) reserves a
  shared-profile UI port from the managed runtime registry, starts a
  candidate-owned dev server (`reuseExistingServer: false`), and releases
  the reservation after the run.
- To reuse a managed issue runtime that is already serving the same
  worktree, set `PLAYWRIGHT_STUDIO_URL` to its URL; the wrapper then
  reserves nothing and tests that server.
- `playwright.config.ts` requires an explicit target: a bare
  `npx playwright test` fails with instructions instead of silently
  falling back to `5174`.
- Before any spec runs, `e2e/public.global-setup.ts` fetches the dev-only
  `/__identity` endpoint and fails closed unless the served worktree is the
  worktree under test — a server that does not answer, answers malformed, or
  serves a different worktree refuses the run. The verified target line
  (`Public e2e verified target: <url> serving <worktree> @ <commit>`) is the
  run's identity evidence; include it with the suite counts when recording
  e2e results.

### Suite serialization (#748)

The heavy suites (`test:full`, every `test:e2e*`, and the mutation run)
serialize on `.git/pxlblz/suite.lock` through
`scripts/with-suite-lock.ts`. The lock lives in the common git directory, so
concurrent agents in different worktrees queue instead of stacking Vitest
worker pools and Playwright fleets — stacked suites drove load average to 56
on 2026-08-07 and produced contention timeouts plus wall-clock skew failures
in timing-sensitive tests, which measure scheduler starvation rather than
the code under test. A waiting run reports the holder and its suite label; a
dead holder's lock is reaped automatically by pid-liveness (unlike the
review lock, an unlikely reap race costs one overlapped suite run, not a
corrupted approval, so self-healing is the right trade). Focused
`npx vitest run path/to/test.ts` runs stay unserialized: the red-green loop
must never queue behind a full suite.

Each authenticated run seeds four synthetic worker identities and runs its
specs fully parallel. A worker signs in as the identity derived from its stable
parallel index, and the automatic fixture cleanup lists and deletes records
only through that worker's session. The synthetic namespace is separate from
the persistent development identity, which the suites never read or mutate.

### What the gates actually cover

`playwright.config.ts` sets `testIgnore: '**/*.auth.spec.ts'`, so
`npm run test:e2e` covers **no** authenticated spec on its own. The required
runner evidence therefore names the authenticated suites explicitly alongside
it.

| Suite | Gate |
| --- | --- |
| `npm run test:e2e` (unauthenticated) | required runner evidence at pre-push |
| `npm run test:e2e:auth-smoke` | required runner evidence at pre-push |
| `npm run test:e2e:shows` | required runner evidence at pre-push |
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
  `npm run check:e2e-locators -- --record`; the packaged
  `check-e2e-locators` test suite pins the behaviour.

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

### Pre-landing e2e responsibility (#673, #969)

Static locator checks do not prove working behavior. The implementing agent
owns focused behavioral checks and required browser proof for changed flows;
the final-suite coordinator owns the complete required runner suites under the
[verification plan](#candidate-review-and-landing). This preserves the original
#673 goal of finding behavioral defects before landing without repeating a full
local suite before its authoritative run.

Record cases, failures, job ids, and results in the issue's Tests section. For
public e2e, retain the wrapper's `Public e2e verified target:` line so the URL
and worktree actually exercised remain visible. Whole-suite ordering still
matters (#672), which is why a focused pass leaves the full suite outstanding.

`review.projectPolicy` asks the reviewer to assess behavioral coverage and
required proof. A spec change or `X-E2E:` trailer is not execution evidence and
no longer creates an automatic trailer-only corrective round. Actual missing
behavioral coverage or browser/artifact proof remains a finding under the
normal severity contract. The publication hook independently validates all
required exact-tip suite records.

## WRSP 0.5.0 consumer guards (#940)

This section preserves the original guard adoption and qualification evidence.
For the optional deferred review path added later, use
[Deferred UI proof](#deferred-ui-proof); ordinary guard behavior remains below.

The 0.5.0 release added four consumer guards on top of the review, selection,
layout, and e2e meta-check gates this repository already ran. Each is wired to
the installed package's own executable; nothing below is a local
reimplementation. `scripts/wrsp-guard-fixture.ts` drives those executables in
disposable Git repositories under the OS temp directory, so the rejection
partitions are asserted by the ordinary Vitest suite instead of by live
candidate or push denials.

### UI proof gate

`wrsp-ui-proof.json` at the repository root declares which paths are UI:
component TSX under `src/components/` excluding colocated `*.test.tsx`,
`src/App.tsx`, and every stylesheet under `src/`. A candidate whose diff
touches one of them cannot reach review without a valid, fresh proof record
in `.wrsp/ui-proof/`: a JSON file naming the route driven in a real browser,
the operation performed, one or more committed captures carrying PNG, JPEG,
WebM, or MP4 bytes, and the full commit id the capture was taken from. That
commit must be an ancestor of the tip with no UI path changed since. The
policy is a data file rather than a `wrsp.config.mjs` section because the gate
reads it as a blob from both ends of the range and gates under the union;
executable configuration cannot be evaluated trustworthily at a historical
revision. `review:candidate` enforces the gate before taking the review lock;
`npm run check:ui-proof -- <base> <tip>` is the standalone form. It applies
from the adoption commit onward: on a range where neither end carries the
policy file it fails closed rather than reporting "not required".

The capture recipe is in
[`browser-verification.md`](browser-verification.md#recording-ui-proof-for-the-review-gate).
The first record, `.wrsp/ui-proof/940-redline-zone-properties.json`, is the
coordinator's Codex in-app-browser capture of the Redline Installation Zone
properties dialog on reviewed main; the adoption candidate itself touched no
UI path, so the gate reported "not required" on that range while the
missing-record, text stand-in, missing-file, empty-file, malformed, valid,
stale, and no-policy partitions are asserted in
`scripts/wrsp-ui-proof-gate.test.ts` against the same policy and the same
capture bytes.

Evidence boundary: the gate is workflow hygiene for trusted contributors, not
an authenticity check. It verifies the record's schema, that each named
capture exists in the tip as a non-empty regular file whose leading bytes
carry a PNG, JPEG, WebM, or MP4 signature, that `capturedAtCommit` is an
ancestor of the tip, and that no UI path changed after it. It does not decode
the media, prove the bytes came from a browser, or detect a crafted
signature-only file, a fabricated image, or a dishonest commit id; active
spoofing is outside its threat model (Jon, 2026-09-04). A `✓` therefore means
the record is complete and fresh, not that anyone has looked at the image.
The reviewer opens the submitted capture and inspects it against the route
and operation the record names; a capture that fails to open, or shows the
wrong state, is not proof even though the gate accepted it. The first record
was inspected that way by the coordinator: a 1280x720 JPEG of the Zone
properties dialog.

### Exported-artifact oracles

Two deliverables are configured under `artifacts.deliverables` in
`wrsp.config.mjs`, both run through the named `artifact-oracle` runner
(`npx vitest run --project node --reporter default <test>`; Vitest 4 has no
`basic` reporter, so the package default runner fails at startup here):

| Deliverable | Test | Exporter | Importer |
| --- | --- | --- | --- |
| `show-pxlshow` | `src/engine/showFileBundle.oracle.test.ts` | `buildShowFileBundle` then `serializeShowFileBundle`, the Show editor's "Export Show file" pair | `parseShowFileBundle`, `planShowImport`, `applyShowImportPlan`, the Pattern list's `.pxlshow` file input |
| `show-epe` | `src/engine/showEpeExport.oracle.test.ts` | `compileShowForArtifact` then `buildShowEpeExport`, the Show editor's `.epe` download | `parseEpe`, then `extractPatternAuthors` and `resolveArtifactPreferredMap`, the Pattern list's `.epe` file input |

Every assertion runs against the file reopened from disk: gzip magic and
byte-for-byte preservation of the embedded user Pattern and custom Map in the
`.pxlshow`; banner metadata, the checksum over the reopened body, the Show
name, both Pattern references with their credits, the authored colour
literal, and preferred-map resolution for the `.epe`. `npm run
check:artifact-oracle` runs both and requires exactly one
`WRSP-ARTIFACT-ORACLE` report per deliverable with a matching name and a
positive byte count.

Evidence boundary: the checker validates a structured report emitted by
trusted, reviewed test code that it ran itself. An absent or empty export,
a test that never reports, a bare marker, and a mismatched name all fail
(`scripts/wrsp-artifact-oracle-gate.test.ts`). The parser does not
authenticate a well-formed report forged by untrusted code; that is what
candidate review of the oracle tests is for.

### Environment preflight

`npm run preflight -- worktree` exits 1 in the shared checkout and 0 in a
linked worktree, by comparing the git dir with the common dir. `npm run
preflight -- port <n>` names the owning pid of an occupied port and exits 1;
an uninspectable port is treated as occupied. `npm run preflight -- blocker
<gh-auth|network> [--host]` runs a sandbox write canary first: a denied
canary is `SANDBOX-LOCAL` (exit 3) regardless of the probe, a passing probe
is `HOST OK`, and a failing probe is `HOST FAILURE` (exit 1) only under an
explicit `--host` attestation from an unsandboxed shell, otherwise
`INDETERMINATE` (exit 3). Only `HOST OK` and `HOST FAILURE` are host verdicts.
The worktree and port partitions are asserted in
`scripts/wrsp-preflight-gate.test.ts` against a disposable repository and an
ephemeral listener the test owns; the blocker probes depend on host
credentials and are run by hand.

### Closed-issue proof audit

`npm run check:issue-proof -- --since-days <n>` lists every issue closed as
completed in the window whose body lacks a non-empty `## Required proof`
section or which has no `Proof:` line with content in the body or a comment.
It is an audit report over an eventually consistent tracker, not a hook:
the #940 adoption run over 7 days checked 28 issues and flagged 26, almost
all closed before the `Proof:` convention existed. Attach proof to issues
you close from now on; do not mass-edit history to make the sweep green.

### Adoption ledger (0.5.0, historical)

| Field | Value |
| --- | --- |
| Release | `@whiteroom/software-process` 0.5.0, tag `v0.5.0` |
| Source commit | `96a9df8ab59b1e01c023c41ed2d59f69310386ea` |
| Tarball | `vendor/whiteroom-software-process-0.5.0.tgz`, 82883 bytes (removed by #960, replaced by 0.5.1) |
| Tarball sha256 | `e5ac84eebf0019b3802dc92fe0e2a9bb3c84aed7c6773cdbba790128729e979e`, verified against the downloaded release asset before install |
| Installed bins | 12 (`wrsp-check-artifact-oracle`, `-check-e2e-coverage`, `-check-e2e-locators`, `-check-issue-proof`, `-check-layout-gate`, `-check-node`, `-check-ui-proof`, `-preflight`, `-review-candidate`, `-review-push`, `-review-status`, `-test-staged`) |
| Adopted | 2026-09-04, #940, replacing 0.4.1 (`d16fe10dc071da5592e23c440c246723e68af3c27f3596007af6f7dd2436667f`) |
| Review policy | `REVIEW_APPROVAL_POLICY_VERSION` 2 to 3; Anthropic reviewer `Fable 5.1 High` (was `Opus 5 High`); OpenAI reviewer `GPT-5.6 High` (`gpt-5.6-sol`, high) |

Behaviour-identical after the bump: staged-test selection, the layout gate
(canary still reports the 64px control), and the e2e meta-checks; the 0.4.1
to 0.5.0 diff touches none of their sources.

### Receipts across the bump (0.4.1 to 0.5.0, historical)

Installing 0.5.0 changes the review policy fingerprint. Receipts written
under 0.4.1 stay on disk unchanged as historical provenance, and
`review:status` still lists them, but the new evaluator cannot count them
toward current coverage: on the day of adoption
`npm run review:status -- b0e7415f 00c97810` reported `Status: stale` with
31 stale-policy receipts for the range #944 had already published. That is
why #944 published the old-policy range before this adoption landed. The
installed evaluator is per checkout: a worktree on 0.5.0 does not change
what the shared checkout on 0.4.1 evaluates until main itself carries the
bump.

## WRSP 0.5.1 review policy (#960)

The 0.5.1 release is a review-policy migration, not a new guard. Its source
change is
[whiteroom-software-process#19](https://github.com/jon-whiteroomsoftware/whiteroom-software-process/issues/19),
authorized by Jon on 2026-09-05 as a core-package-first migration consumed
here by #960. The 0.5.0 to 0.5.1 diff touches `push-review`,
`review-routing`, `review-carry`, `review-candidate`, and the README; the
consumer guards, staged-test selection, layout gate, and e2e meta-checks are
byte-identical, and `scripts/wrsp-guard-fixture.ts` continues to drive the
same executables.

What changed for this repository:

- The OpenAI reviewer is `gpt-6-astra` at `model_reasoning_effort="medium"`,
  recorded on receipts and outcomes as `Astra Medium` with effort `medium`.
  Anthropic-authored ranges route there first. The Anthropic reviewer remains
  `claude-fable-5-1` at high effort, recorded as `Fable 5.1 High`, and reviews
  OpenAI-authored ranges first.
- Receipt effort is now taken from the reviewer that actually ran instead of
  being fixed at `high`; a carried receipt keeps its original reviewer and
  effort, and carry only projects historical `GPT-5.6 High` onto the OpenAI
  family when recomputing cross-family facts. Nothing relabels a stored name.
- The three review-outcome classes described in
  [Review outcomes and the repair loop](#review-outcomes-and-the-repair-loop-wrsp-051)
  replaced the single `CANDIDATE REVIEW BLOCKED` line. Breaker threshold,
  outcome records, receipts, and publication coverage rules are unchanged.

### Adoption ledger (0.5.1)

| Field | Value |
| --- | --- |
| Release | `@whiteroom/software-process` 0.5.1, tag `v0.5.1` |
| Source commit | `97f078ae2cbe50902222c868b9f69c1c396ee6fe` (WRSP #19, `Use Astra Medium for OpenAI review`) |
| Tarball | `vendor/whiteroom-software-process-0.5.1.tgz`, 83316 bytes |
| Tarball sha256 | `b1d230be92309def841482161075370791f9cb6a64700cc62d9d50d6c13092c5`, verified against the published artifact before install; the lock's sha512 integrity was recomputed from the same bytes |
| Installed bins | 12, unchanged from 0.5.0 |
| Adopted | 2026-09-05, #960, replacing 0.5.0 (`e5ac84eebf0019b3802dc92fe0e2a9bb3c84aed7c6773cdbba790128729e979e`) |
| Review policy | `REVIEW_APPROVAL_POLICY_VERSION` stays 3; the fingerprint changes because reviewer models and efforts are part of it. OpenAI reviewer `Astra Medium` (`gpt-6-astra`, medium; was `GPT-5.6 High`, `gpt-5.6-sol`, high). Anthropic reviewer `Fable 5.1 High`, unchanged |

### Receipts across the bump (0.5.0 to 0.5.1)

Installing 0.5.1 changes the review policy fingerprint again. Every receipt
written under 0.5.0 stays on disk unchanged, keeps its recorded `GPT-5.6
High` and `high` provenance, and is listed by `review:status`, but it cannot
cover a range under the installed evaluator and is never evidence that Astra
reviewed anything: on the day of adoption `npm run review:status -- 00c97810
b1fbc1e5` reported `Status: stale` with 2 stale-policy receipts for the range
#940 had published under 0.5.0. The #945 corrective lineage's two Sol reviews
were terminal, so they exist only as outcome records, not receipts; they stay
as written. Current-policy coverage over every outgoing commit has to be
re-established under 0.5.1 before the next publication, by reviewing the
outgoing range (or a contiguous chain over it) with the installed package.

At the adoption commit no Astra Medium receipt existed in this repository:
the route was proven by the package's own tests and by the installed
constants, not by a live review. The first live Astra Medium receipt at
medium effort is the proof #960 owes, and it can only come from reviewing an
Anthropic-authored candidate under 0.5.1; until that receipt is on disk, do
not describe the Astra route as exercised here.

## WRSP 0.5.2 review packet adoption (#961)

The 0.5.2 release changes the packet representation so repeated context cannot
crowd complete commit history out of the reviewer transport. One shared source
section carries unchanged endpoint context with immutable revision, blob, path,
and line references. The following per-commit section retains the complete
sequence as zero-context patches. The gate measures the whole request before a
provider starts and refuses an input above 1,048,576 characters without
truncating it.

This representation change leaves reviewer routing, severity handling, the
three review outcomes, breaker lineage, receipt carry, publication coverage,
and `REVIEW_APPROVAL_POLICY_VERSION` unchanged. `REVIEW_PROMPT_VERSION` moves
from 7 to 8, so the changed prompt and packet fingerprint require fresh review
for new outgoing ranges. Existing receipts and outcomes remain on disk with
their recorded policy and provenance; they gain no retroactive coverage.

### Adoption ledger (0.5.2)

| Field | Value |
| --- | --- |
| Release | `@whiteroom/software-process` 0.5.2, local lightweight tag `v0.5.2` |
| Source | [whiteroom-software-process#22](https://github.com/jon-whiteroomsoftware/whiteroom-software-process/issues/22), commit `52c1a50db7b390914f02943a30fb22549be791de` (`Preserve raw review packet evidence`) |
| Source review | Fable 5.1 High clean corrective receipt for `93becb47b905afda7cc447a4ccfaec04cb2feaa5..52c1a50db7b390914f02943a30fb22549be791de`, following advisory coverage of the preceding range; source full suite 286/286 and focused packet suite 36/36 |
| Tarball | `vendor/whiteroom-software-process-0.5.2.tgz`, 85839 bytes |
| Tarball sha256 | `6bcf735ec5f0426de2a9d1561f8eaf0848fd1d1da9c49bf7f7a9d98df3480bae`, verified against the reviewed local artifact before install; the lock's sha512 integrity was recomputed from the same bytes |
| Installed bins | 12, unchanged from 0.5.1 |
| Review policy | `REVIEW_APPROVAL_POLICY_VERSION` stays 3; `REVIEW_PROMPT_VERSION` moves from 7 to 8 because the packet instructions changed; reviewer models and efforts are unchanged |

The real #945 candidate range
`6cd09151a7f602c898d8406a5b1bfd1be21165bf..60f93563b54afd42118b6fb1b5ab89e209c5709e`
proves the consumer boundary. With the same project policy and systematic
test-design context, 0.5.1 built a 1,063,694-character request, above the
1,048,576-character ceiling. Version 0.5.2 builds a 522,631-character request.
All 8 commits appear in order, and its 352 zero-context hunks match 352 hunks
counted independently across per-commit `git show` output. The installed size
preflight accepts the complete packet without launching a reviewer.

### Receipts across the bump (0.5.1 to 0.5.2)

The prompt-version change produces a new review policy fingerprint. Receipts
written under 0.5.1 remain immutable historical provenance and still appear in
`review:status`, but they cannot cover a new outgoing range evaluated under
0.5.2. Outcome records remain keyed by lineage rather than policy fingerprint,
so the package upgrade does not reset a terminal streak. After #961 lands, the
#945 candidate must rebase and receive fresh review under the installed 0.5.2
fingerprint.

### Goal-based manual campaigns

Use the [manual test campaign playbook](manual-test-campaigns/playbook.md) for
broad goal-based discovery, user-guide audits, hardware campaigns, or an
independent docs-versus-product evaluation. The package preserves the #788 and
#800 goal catalogs, tester protocol, verdict schema, reusable Playwright HTTP
driver, and Codex batch runners. Manual campaign evidence characterizes a
finding; a promoted automated test owns repeatable regression coverage.

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

### Flake probing and host load

The authenticated suites funnel all four workers through one candidate-owned
worker-dev Vite process, which makes results sensitive to host load. An open
browser pane running the app's WebGL preview measurably raises the flake rate.
Idle or close app tabs before a full-suite run. A single-spec failure carrying a
"Checking Studio access" snapshot is a clue to investigate session readiness
and host load; the snapshot alone does not establish the cause.

The suite wrappers pass extra flags through to Playwright, so repeat probes are
cheap:

```bash
npm run test:e2e:shows -- -g "<pattern>" --repeat-each 6 --workers 4
```

Do not edit a spec while the wrapper's build phase is running. Workers may load
either version, and `error-context.md` renders the *current* file against the
executed run's positions — add a unique marker line before trusting which version
failed. Use filtered tests during diagnosis; the authoritative runner still
executes the whole configured suite for final evidence. Never run two
authenticated suites concurrently: they collide on ports and shared D1.

### React act() warnings hide behind the console intercept (#917)

Vitest's console intercept drops jsdom console output that lands outside a
test's execution window — which is exactly when most React "not wrapped in
act(...)" warnings fire (async store chains finishing after a synchronous test
body returns). A piped `npx vitest run` can therefore report a clean-looking
run while the same suites flood the gate's TTY output with warnings. To audit
or reproduce them deterministically, disable the intercept:

```bash
npx vitest run --project jsdom --disableConsoleIntercept 2>&1 | grep -c "not wrapped in act"
```

The count must be zero. When a warning appears, the fix belongs in the test:
wrap direct store mutations made while components are mounted in `act()`, let
provider promise chains land inside an act-wrapped drain or an RTL async wait
(`waitFor`/`findBy*` disable the act environment while polling), and in a
suite-level `afterEach` call `cleanup()` before store teardown so `stop()`-style
resets find no mounted subscribers. Never silence the warning channel itself.

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

### Identity-keyed compiler fixes need a lowering-level regression

A compiler fix that keys on placement or Clip identity must be regression-tested
through the real lowering, not only against hand-authored recipe fixtures.
Composition lowering rewrites identities — segment placement ids, `instanceId`
Clip ids, `@scene` cell ids — so a recipe-level fixture can encode an identity
assumption that the actual lowering violates.

The #676 capture-coallocation fix keyed on `placementId` and was covered only by
fixtures with stable ids, so it silently never engaged for logical Clips spanning
authored Scene boundaries, where segments are `X` and `X--span-<sceneId>` linked
by `logicalClipId`. #693 was the resulting sibling bug.

Add at least one model-level regression running ShowRecord plus composition
through `showRecordToCompileRecipe` and then `compileShow`; the #693 tests at the
end of `showCompositionLowering.test.ts` are the template.

## Clip detail dialog matrix

The Clip Entity Detail dialog qualifies through a field round-trip contract in
`src/components/ShowClipEntityDetail.matrix.test.tsx`: every editable
control's emitted patch is applied through the real inspector engine and
re-projected, and the result must be exactly what the dialog then displays.
Scope-capability, read-only, and typed-edit lifecycle sweeps walk the surface
partitions. The declared partitions, field families, layered fault-sensitivity
map, and maintenance rule live in
[`clip-detail-test-matrix.md`](clip-detail-test-matrix.md).

## Show authoring mutation qualification

Command-convergence candidate `Proof:` lines cite the runner receipt, review
receipt, committed test rows and mutation summary counts. Screenshots are required
only when changed paths trigger `wrsp-ui-proof.json`. Keep mutation reports in
ignored `.wrsp/`; do not commit full-record JSON dumps, exported fixtures or
compressed mutation reports under `docs/reference/evidence/`. Existing historical
packets are retained or pruned through their separately scoped cleanup.

`npm run test:mutation:show-authoring` checks whether the Show authoring suite
rejects a small catalog of plausible faults. It is intentionally narrower than
whole-file mutation: the command resolves named source fragments through the
TypeScript syntax tree, runs the owning Vitest suites (including the shared
removal contract suite) in an isolated Node project, and writes `.wrsp/mutation/show-authoring.json`.

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

`wrsp-test-staged` (the packaged staged-test driver) reads added, copied,
modified, and renamed paths from
the Git index. When those paths can affect either configured TypeScript project,
it first runs `tsc -b --pretty false`; a type-invalid source or test change
therefore cannot be committed even when ESLint and Vitest accept the file. It
then selects a staged test directly or the colocated test for a staged
JavaScript or TypeScript source file. The boundary map in `wrsp.config.mjs` also adds
fixed regression suites when a changed path touches a boundary where a
colocated test is not a sufficient safety net:

- Show compiler and generated controller artifacts
- personal-content persistence, APIs, and database migrations
- controller resource accounting
- Pattern artifact production and stamping
- Vitest configuration and staged-test infrastructure
- shared Show authoring edit contracts

Documentation-only commits skip Vitest at pre-commit. The review, artifact,
and exact-tip evidence gates at pre-push are unchanged by the selection result
and remain the final publication authority.

## Qualification tiers for Pattern transformations (#933)

Three tiers. The first is a property of the transform's argument; the
other two are measured per artifact and never assumed from the transform
class:

- **Operation-exact.** The transform preserves every arithmetic operation
  and its order (loop unrolling, hoisting a value that is recomputed
  identically, wrapper inlining), so the result is bit-identical in 16.16
  and float64 by construction. The Exact stop's bar; proven by the
  argument in the pass's header plus the catalogue checksum parity tests.
- **Display-exact.** Measured: the largest absolute 8-bit channel delta
  over the drift window is 0 in both preview modes (`qualifyDisplayExact`
  in `test/perf-harness/benchCore.ts`; `npm run drift` prints the verdict
  per mode). Note the bench checksum hashes the same quantized 8-bit bytes,
  so on this oracle "checksums equal" and "display-exact" are one fact - a
  ULP-level change that never crosses an 8-bit edge in the window is
  invisible to both, which is exactly why the operation-exact tier is an
  argument rather than a measurement. A display-exact pass (first: #933
  integer-pow lowering, `memberPowLowering`, off by default) changes
  results by ULPs and may ship without a human visual gate, never at the
  Exact stop, and only for artifacts the measurement qualifies.
  Named residual: the window is finite, and the firmware's own gamma and
  brightness stage after the linear 8-bit value is not modeled.
- **Lossy.** Anything else; priced by the drift tool and approved by eye
  (`docs/guides/Optimizing Pixelblaze patterns.md` §5).
