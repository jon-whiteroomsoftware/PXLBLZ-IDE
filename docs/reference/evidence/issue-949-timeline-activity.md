# #949 authored timeline gesture activity

The existing activity scope now binds Clip resize, native and shift-pointer Clip
move/duplicate, Marker creation/movement, and Show End to diagnostic candidate
waiting. A manual commit precedes activity release; cancellation permits the
waiting candidate. Movement, authored representation, history and save algorithms
remain with their existing owners. Production change: 145 added and 67 removed
lines in ShowEditor (net 78); the reusable 43-line field scope is unchanged.

Source: `a5dd79f0ecc8eeaab714c8558df3d3a8c7fe05e7`. The auxiliary-button repair was qualified at
`90874ae7be25f549868f78ee8d0a974be4b8eb1e`. After a conflict-free rebase onto
docs-only main `9f15610cbb0498601a5e75a0afeea63c442351be`, fresh captures use
`ae3dfa121a62de87f32b1195cce547af7b3070ce`. Source and e2e files byte-match
the previous candidate `e83c4d589ed5d5b586202fb1ac7b8141c090e218`. The fresh
three-case GA run passed in 13.6 seconds (17.4 overall), recorded in
`browser-rebase.log`; unchanged-source focused and fault evidence is retained.

## Consumer proof

`npm run test:e2e:agent-baseline -- -g 'GA: real timeline' --workers=1 --trace=on`
passed the committed three-case GA sequence on 2026-09-08. The real scripted bridge
uses no paid model call. Its actual editor pointer handlers supply ownership;
these checks do not acquire synthetic activity tokens.

| Gesture | While active | After release | Authored history/save |
| --- | --- | --- | --- |
| Clip end resize, cancelled | Seven-second painted preview; Waiting; complete visible/durable Show unchanged | Candidate sets exact eight-second duration; exported Show reopens identically | One step, one PATCH |
| Clip end resize, committed | Seven-second painted preview; Waiting; complete visible/durable Show unchanged | Manual seven-second duration saved; old candidate reports revision-conflict; export reopens identically | One step, one PATCH |
| Show End, committed at 800px | Eighteen-second end preview; Waiting; complete visible/durable Show unchanged | Manual eighteen-second Show saved; old candidate reports revision-conflict; export reopens identically | One step, one PATCH |

Each case begins with Undo disabled. One Undo restores the entire original Show
and disables Undo again. The raw records include that subsequent Undo write, so
their final write arrays contain two PATCHes: one authored result and one Undo.
All three cases asserted zero page errors. The browser fixture also checks serious
console errors. The existing synthetic fixture's reference-map delivery warning
remains visible; this proof does not qualify Controller delivery.

Complete synthetic records, reopened export records and observed writes:
[resize cancellation](issue-949-timeline/resize-cancel.json),
[manual resize](issue-949-timeline/resize-commit.json),
[Show End](issue-949-timeline/end-commit.json).

The committed UI proof record is `.wrsp/ui-proof/949-timeline.json`. Its inspected
PNG captures show desktop Waiting, narrow Waiting, saved candidate and refused
candidate with the manual resize preserved. Desktop is 1440x900; narrow is 800x900.
The in-app browser was unavailable in two discovery probes (only Chrome was
listed; selecting `iab` failed). The disclosed fallback used the repository's
isolated Playwright runtime and synthetic account, rather than personal cookies.

## Focused and fault evidence

Normal source-commit hooks passed TypeScript, lint, e2e coverage/locator checks,
and all 244 ShowEditor tests. The final focused run passed 28 lifecycle and
colocated cases. Cases cover foreign pointer IDs, cancellation/lost capture,
already-active session binding, no-op resize, rejected persistence, delayed native
and shift drops, Marker pointerup-to-click transfer and explicit no-click cancel,
retired callbacks, and Marker-name field overlap through the original 5000ms
candidate deadline. Existing authoring cases cover the geometry and representation
of collapsed-Zone drops and other timeline operations.

Three intentional omission faults failed the behavioral assertions: absent drag
ownership, resize release before manual adoption, and missing native dragend
cleanup. Source was restored before stable browser work. Local logs, fault results
and the review packet are under `.wrsp/949-timeline/`.

A fresh-worktree dependency symlink initially left generated `.husky/_` absent.
The unreviewed commit was immediately replaced after `npm run prepare`, and all
normal checks ran on the replacement. The optional post-commit issue reporter
returned the previously diagnosed SIGPIPE141 on the long issue body; required
checks and commits succeeded, with no hook bypass or reporter retry.

The auxiliary-button correction passed 17 focused cases and all 246 ShowEditor
tests through normal commit hooks. Real right and middle clicks reproduced the
stranded Waiting state on `daf01537`: pointerup was followed by lost capture and
auxclick, with no click; right-click also emitted contextmenu before pointerup.
The repair releases below-threshold auxiliary sequences at pointerup, preserving
primary click ownership and moved auxiliary drag authoring without a timer.
Both actual browser sequences then applied and saved the next candidate with
complete durable-record agreement and zero page errors. Raw evidence:
[before repair](issue-949-timeline/auxiliary-before.json) and
[after repair](issue-949-timeline/auxiliary-after.json). The refreshed GA run on
that source commit passed all three cases (13.8 seconds, 17.7 overall); its log is
`browser-aux-repair.log`.

## Limits and anomalous evidence

The first actual GA run reached `invalid-candidate` and its error snapshot showed
only the diagnostic overlay. It had no trace or captured page error. Adding page
error capture and tracing produced a passing three-case run without any production
change; a subsequent committed repeat with an explicit zero-page-error assertion
also passed (13.8 seconds for GA, 17.7 seconds overall). The original failure is
unexplained, not diagnosed as fixed. Logs are `browser2.log`, `browser3-trace.log`
and `browser-final.log` in the local evidence directory. The earlier anchored
`^GA:` filter matched no full test titles and supplied no behavioral evidence.

Real browser acceptance covers resize, Show End and auxiliary Marker clicks.
Other Marker and Clip move/duplicate lifecycles use focused DOM/diagnostic tests
plus existing authoring regressions.
Placement-pad, sparkline, Effect reorder and retained physical-zone drafts remain
unregistered. Viewport, transport, divider and marquee gestures remain view state.
External narrow context, final Agent placement and hosted service remain separate.
The coordinator owns final committed-tip suites, native review and local landing;
publication remains held.
