# Ordinary Clip deletion

The Clips inspector keeps its current explicit ordinary Clip selection and timing controls. A compact **Delete Clip** button follows those controls. Group occupancy is display-only; no child Clip target is inferred. The button locks while saving. A removed selection clears only after current saved completion; a newer explicit selection survives.

After final content is deleted, existing Add Clip, history, Layers and Show End stay available. The Stage displays “Add content to preview or export this Show.” Artifact reopening is disabled. Add Clip chooses the existing source/runtime under the landed creation owner.

## Admission boundary

`admitShowV2PilotClipDelete(context & {intent:{kind:'delete-clip';clipId:string}})` is closed and reports all fourteen affected collections. Complete valid zero-effective-content permits ready→empty only for deletion. Owner refusal, stale context and failed persistence cannot retire a newer selection. No compiler policy changes.
