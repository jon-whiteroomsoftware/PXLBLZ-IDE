# Controller saved Patterns

Jon approved the original prototype on 2026-10-25, as recorded in
[#1223](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1223) and
[design #1224](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1224).
The first-slice handoff is [comment 6405757537](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1223#issuecomment-6405757537).

The unchanged [archived prototype](controller-saved-patterns-prototype.html)
comes from `/Users/agent/src/pxlblz-wt/briefs/1223-controller-saved-patterns/index.html`.
The [original Files artifact](http://Agent-Mini.local:8642/files/pxlblz-briefs/1223-controller-saved-patterns/index.html)
remains in place. Both contain 17,493 bytes with SHA-256
`10690e231af4c449763eb1d92e1a4a96a819436eba29cf2bb5850a11dc94e348`.
The repository archive is `docs/plans/controller-saved-patterns-prototype.html`.

## Activation-only slice

The provider seam requires an explicit `save` boolean. Switch-menu picks and
profile Run share the store's `save: false` activation, preserving the open
Studio subject and its dirty and delivery records. Existing confirmation,
rollback, late confirmation, session guards and locks remain in place. Save
semantics remain unchanged. Focused unit/component evidence
and a production-transport browser regression accompany this slice; browser
execution and final committed-tip suites remain with the developer.

## Title-picker slice

The running title now opens Saved Patterns from the panel header on every
route. The menu consumes the profile inventory's classification, sorts Saved
PXLBLZ Patterns before Other Patterns, and remembers the Other fold per browser.
The running Other Pattern remains visible while folded; a query searches both
groups. No managed members yields a flat list. Binding reads are scoped to the
current Controller session and inventory. Existing transient activation,
confirmation, focus, pending and failure behavior remains in place.

## Remaining scope

The approved capsule/action-row visibility and whole-percent brightness work
remains future work. Startup-setting controls and classification changes are outside this design.
The bounded firmware prerequisite is documented in the
[device notes](../reference/Pixelblaze%20device%20behaviour%20notes.md#saved-pattern-selection-deletion-and-sequencer-fields).
It does not prove the built product. These post-build physical cases remain
unproved and are not authorized by this slice:

- Built panel pick B, then a Jon-performed cycle returns startup A.
- Built profile Run C, then a Jon-performed cycle returns startup A.
- Save, then a Jon-performed cycle records which Pattern runs (observation only).
