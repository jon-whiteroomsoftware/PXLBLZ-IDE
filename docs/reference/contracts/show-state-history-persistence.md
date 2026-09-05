# Show state, history, and persistence

The Show store owns the editable Show record and its session undo/redo history.
Personal Shows save through the personal-content provider; stock Show edits
remain in in-memory drafts. A visible edit and a durable save are distinct
states, and callers must handle that distinction when reporting success.

## Adoption and history

`updateShow(id, next)` adopts a normalized replacement and records the preceding
Show in history before awaiting personal persistence. A new edit clears redo.
An absent target or the identical record object is a no-op. Callers must supply
an unaliased replacement for the intended Show and preserve its id; this
primitive is not a general validation or identity-admission boundary.

One adopted replacement produces one history entry, regardless of how many
private operations produced it. Undo and redo restore normalized snapshots
while moving through the same store history. History is session state, not a
second durable workspace. Hydration reconciles it with the loaded record;
callers cannot assume history survives a reload or an externally changed Show.

Stock drafts and their history stay in memory until an explicit save-as or
other persistence operation creates personal content. Editing a draft therefore
does not prove that a durable personal Show exists.

## Personal saves and recovery

Full-record saves are queued per Show within this client. A later save starts
after the preceding save settles, including failure. This preserves submission
order at the provider boundary without blocking optimistic editing.

For ordinary `updateShow` failures, the current optimistic record determines
recovery. If a newer record superseded the failed write, the failed call
resolves without restoring its predecessor or publishing a failure notice. If
the failed record is still current, the store restores the last known durable
record together with its matching history, records the failed candidate for
recovery, and rejects the call. With no durable baseline it restores the
preceding record and history. Convenience mutation actions may consume that
rejection; the store's failure state remains the UI's recovery surface. Undo
and redo return `false` on save failure, also used for exhausted history, rather
than rejecting. Callers need the failure state to distinguish those outcomes.

A retry resubmits the captured failed candidate as another update; dismissing
removes the failure notice. Retry is not a merge or an operation-id-based
exactly-once protocol. Callers must not interpret a resolved update promise as
proof that that specific candidate is the current durable record: superseded
failures also resolve, and stock edits have no personal save.

## Known limits and discrepancies

- **Undo/redo failure ordering differs from ordinary updates.** Their failure
  handlers restore a durable record/history pair without checking whether a
  newer optimistic record superseded them. The intended protection against
  older failures overwriting newer edits is therefore not established across
  all write paths. Source inspection identifies this gap; the existing tests
  below do not reproduce the overlapping undo/redo failure sequence.
- Durable-baseline ordering uses client-stamped `updatedAt`, relying on
  monotonic timestamps within a client. It is not a server revision or a
  cross-client conflict protocol; clock skew can misorder records. Callers
  supplying replacements must preserve timestamp ordering.
- The store accepts complete records without comparing an expected base
  revision. Save serialization alone does not prevent a stale replacement
  from overwriting a newer edit.

These limits describe present behavior. They do not authorize weakening the
ordinary-update recovery guarantee or claim that shared editing is safe.

## Ownership and evidence

[Show store](../../../src/store/showStore.ts) owns adoption, history, hydration,
write ordering, failure notices, and retry.
[Personal-content provider](../../../src/engine/personalContentProvider.ts)
owns the storage seam.
[Store tests](../../../src/store/showStore.test.ts) cover grouped history,
stable composition ids through undo/redo, queued writes, superseded ordinary
failures, consecutive failures, hydration races, retry, and in-memory stock
history. Those cases establish bounded single-client recovery; they do not
prove general collaborative editing or the undo/redo overlap gap above.
