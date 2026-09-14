# Issue 1030 validation-diagnostic proof

The coordinator ran the real synthetic OAuth MCP connection through **Answer**
on the isolated Show route at code commit
`83d1397da84762aa9538007258f8071b5bb9c088`. The redacted
[refusal record](refusal-proof.json) captures `begin_edit`,
`add_layout_interval` at 10,000 ms, `set_show_end` at 62,000 ms and
`commit_edit`. Admission refused the complete candidate with the controlled
`authoring` / `invalid-scene-duration` issue and
`["scene","scene-3","durationMs"]` path. `get_outcome` and duplicate commit
returned the same receipt. Full `read_show` and provider records were deeply
equal before and after; Undo stayed disabled, so no private change escaped.

The [control record](control-proof.json) captures a separate valid rename. It
applied and saved without a diagnostic, the provider matched the live Show, one
Undo restored the original name, keyboard Enter Redo restored the saved name,
and a fresh reload retained it. The first harness assertion was intentionally
corrected after it treated the existing canonical composition projection from
`captureAgentShowSnapshot` as unexpected. Read-only inspection verified the
projection's two Scenes, two Patterns and placement times; the operation was
not replayed.

The committed [UI-proof record](../../../../.wrsp/ui-proof/1030-validation-diagnostics.json)
references desktop and narrow refusal activity plus saved and reopened control
captures. The existing reason line showed the safe diagnostic message at both
viewport sizes, and the browser reported no console errors.

Canonical MCP command schemas cannot inject an arbitrary malformed persisted
Show. Schema qualification is therefore compositional: the actual editor
admission integration exercises AJV rejection, while relay and MCP integration
carry an actual retained receipt unchanged. The live MCP proof exercises the
semantic refusal and valid saved control without weakening command schemas.
