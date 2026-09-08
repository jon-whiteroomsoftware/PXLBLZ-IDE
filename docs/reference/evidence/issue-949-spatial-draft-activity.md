# Physical-zone draft activity (#949)

`ShowZoneSpatialSelector` registers its live rectangle and retained changed LED
selection with the existing 43-line field activity scope. The editable
ShowEditor early return supplies that scope. Pointerup ends the rectangle but
keeps changed indexes owned; Clear acquires synchronously, and cancellation or
lost capture leaves any previous dirty selection owned. Returning to the current
authoritative selection becomes clean. Source identity replacement and unmount
retire the old rectangle. Save adopts before the editor closes; a failed callback
retains the state that remains on screen.

A clean open selector follows authoritative index changes, so later Save cannot
restore stale indexes. Opening and focusing alone remain inactive. Explicit Save
preserves its existing history boundary, including an unchanged Save after an
accepted candidate. Production delta: 84 added and 29 removed lines across the
two components (net 55); selection algorithms and delivery policy are unchanged.

## Consumer evidence

The SA browser regression in `e2e/agent-baseline.auth.spec.ts` passed four cases:

| Sequence | While active | Result |
| --- | --- | --- |
| Clean open selector, direct diagnostic candidate changes indexes | No activity wait | New indexes appear; subsequent Save preserves them |
| Real rectangle, pointerup, Cancel | Waiting with retained changed indexes; complete visible/durable Show unchanged; zero PATCHes | One candidate adopts |
| Real rectangle, pointerup, Save | Same preservation | Manual indexes survive; old broad candidate refuses |
| Clear, rectangle, pointercancel at 720px | Empty selection remains owned and waiting | Cancel admits one candidate |

The first case uses the existing diagnostic adapter because the scripted grammar
has no physical-range operation. It also preserves authorable overlaps and
out-of-range ranges, while `.epe` download remains disabled. The other cases use
the real scripted bridge and overlay, with no synthetic activity tokens or paid
model calls. They start with valid Installation coverage: the existing scripted
grammar refuses to open invalid coverage before producing a candidate. That is an
integration limitation, not a changed policy or qualification of invalid-coverage
scripted authoring.

Every final record matches the durable Show and the actual downloaded `.pxlshow`
reopened through `parseShowFileBundle`. Cancel/manual Save each produce one PATCH
and one Undo entry. Clean candidate plus explicit Save produce two PATCHes and two
Undo entries. Undo exhausts that history and restores the complete original Show.
The browser asserts zero page and serious console errors. Desktop uses 1440x900;
narrow uses 720x900. The first complete run passed in 14.7 seconds (18.2 overall).
Initial probes diagnosed a drag below the clipped editor pane and the scripted
grammar's pre-existing invalid-coverage refusal; neither required a product change.

The in-app browser was available and used first to inspect the real Show route
and physical-zone detail entry. Its existing synthetic identity was left untouched.
The repository's isolated Playwright workflow owns automated acceptance and fresh
committed-source captures. This qualifies the diagnostic editor path, not a
production Agent panel or hosted endpoint.

## Focused and fault evidence

The focused suites pass 21 cases across the selector, spatial-selection engine,
and new lifecycle suite. Complete Show/history/provider checks cover clean source
adoption, retained-draft cancellation/manual Save, and retirement before unmount.
Lifecycle checks cover foreign pointers, overlapping controls, session activation
and replacement, source replacement (including colon-containing ID tuples), lost capture, Clear, return to the current
authoritative set, failed/throwing Save and detached late events.

Removing retained-draft ownership made ten focused cases fail, including the
complete-record waiting oracle. Removing only the early-return provider made the
real browser expect waiting but observe an applied-and-saved candidate. Both
faults were restored before stable capture. Local detailed logs and the systematic
test-design packet live under `.wrsp/949-spatial-draft/`.

The Technical Reference and both candidate/history contracts now name the exact
registered domain. CONTEXT.md has no new vocabulary; the Feature Guide remains
accurate. Optional Property Beat movement remains component-qualified only, and
unlisted inputs, final Agent panel placement, hosted endpoints and model/grammar
coverage remain outside this slice. The coordinator owns final committed-tip
suites, native review and landing. Publication remains held.


Fresh committed-source capture at `ddff1a6395cb1f45658166287bc60aaf5566a4b6`
passed all four cases in 14.8 seconds (18.5 overall). The four
`.wrsp/ui-proof/949-spatial-*.json` records pin that source and attach desktop
and narrow screenshots. Complete records and reopened exports are retained for
[clean source replacement](issue-949-spatial-drafts/clean.json),
[Cancel](issue-949-spatial-drafts/cancel.json),
[manual Save](issue-949-spatial-drafts/save.json), and
[Clear/pointercancel](issue-949-spatial-drafts/clear-cancel.json).
Write arrays also include subsequent Undo operations.

The source-identity collision test first failed for `('a:b', 'c')` versus
`('a', 'b:c')`; both selector identity and React key now encode complete tuples.
Normal source hooks passed lint, typecheck and 267 staged tests. The optional
post-commit issue reporter returned SIGPIPE 141 after successful commits. Layout
classifier advisories for the selector and lifecycle suite are covered by the
actual SA desktop/narrow flow; no visual layout change is introduced.
