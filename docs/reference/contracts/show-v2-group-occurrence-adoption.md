# Opt-in Group occurrence controls

`ShowV2GroupOccurrenceEditor` selects persisted occurrence identities only. Its
pure model presents each definition's name and the occurrence's effective global
start/end, including local holds. Materialized child IDs are never selectable.

The native inspector follows the existing opt-in editor's typography and controls:

```text
Group occurrences
Occurrence [Verse · 2000–8000 ms · occurrence ID]
2000–8000 ms · 1000 ms held
Start (ms) [2000]      Zone [Stage]
Overlay Layer [Overlay]
Translation X [0]      Translation Y [0]
[Move Group] [Duplicate Group]
[Make Group Unique] [Ungroup] [Delete Group]
```

Move and Duplicate submit the complete explicit placement. The model derives
only the containing existing Layout occurrence at the requested start; it never
synthesizes Layouts, changes origin or guesses Layer destinations. Changing Zone
clears all destination bindings. Millisecond inputs remain exact without rounding.
Duplicate allocates one fresh occurrence ID using the repository allocator.
Make Unique allocates the complete definition/local identity plan once, respecting
the existing owner namespaces. Its consequence text distinguishes independent
choreography from shared Pattern runtime identity.

The typed submission boundary accepts only the five existing Group intents and
trusted currentness/receipt notifications. The Route binds it to checked prepared
admission; it cannot receive arbitrary candidates or transformation callbacks.
Existing [Group owners](show-v2-group-edits.md) own domain/Layout/Transition and
sharing policy. [Hold mapping](show-v2-group-holds.md) remains unchanged.

One pending action guards the inspector. Refusal and no-op retain selection and
placement drafts. Successful Duplicate selects its new occurrence; Make Unique
and Move retain the selected shell and refresh its local binding fields. Ungroup
and Delete retire selection. A current failed save retains the draft for explicit
retry; stale/external replacement completion cannot publish status or selection.
The existing [history and persistence](show-state-history-persistence.md) owns
rollback, Undo/Redo, timestamps and the sole provider save queue.

Last-content deletion uses canonical §9's separately validated empty capability:
editable and saveable with preview/export unavailable until content is added.
No placeholder, collection policy or general preparation-refusal bypass is added.
Other changed operations must prepare under their existing ready/empty discipline.

## Qualification boundary

The [test-design packet](../evidence/issue-1038-group-occurrence-ui/test-design.json)
records public-owner/model tests, actual checked admission/store consumers,
reopened native Fast/Precise proof and the committed route/browser qualification.
The first model/panel checkpoint precedes shared Route/admission and browser proof;
its component submission tests alone do not establish persistence completion.
No definition editing, Pattern replacement, new Group format, compiler change,
production activation or downstream ticket belongs to this owner.
