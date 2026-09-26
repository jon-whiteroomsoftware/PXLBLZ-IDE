# Agent Authoring Reference

This page is for anyone writing prompts for a PXLBLZ agent or building one
against the MCP server. It explains how an agent edit is structured and the
few rules that most often decide whether a command succeeds. For connecting
an agent and what you see in the editor, read Part 5 of the
[Feature Guide](PXLBLZ Feature Guide.md).

The built-in Pixelblaze agent and external MCP clients use the same command
set, validated by the same code as the editor's own controls. Anything a
command refuses, the editor would have refused too.

## The shape of an edit

An agent reads before it writes. `read_show` returns the connected Show,
`list_patterns` the stock and personal Patterns it can place (with their
exported controls), `list_controller_profiles` your Controller profiles, and
`list_commands` the full command catalogue with input shapes.

Changes happen inside one private operation:

1. `begin_edit` captures the Show and opens a private working copy. It takes a
   one-line `intent`, which appears in the editor's Activity so the person
   can see what the agent is attempting.
2. Commands such as `create_clips`, `update_clips`, `insert_transition`, or
   `add_property_tracks` change the working copy. Each is checked
   immediately. A refused command reports why, with a code, the offending
   field, and, when an id failed to resolve, the nearest valid ids. Earlier
   commands in the operation stay applied.
3. `commit_edit` offers the whole result to the editor, which revalidates it
   and applies it as one Undo step. `cancel_edit` discards it.
   `get_outcome` reports what finally happened: saved, applied to a draft,
   refused, cancelled, or unknown after lost contact.

A command that asks for something already true returns `unchanged` rather
than failing, so an agent can repeat a step safely.

## Identities and time

Commands address everything by stable id: `clip_id`, `layer_id`, `zone_id`,
and so on. Nothing is addressed by list position or by "the Clip at 12
seconds". Times are whole milliseconds on the Show's global timeline, and an
interval includes its start and excludes its end, so a Clip at `start_ms:
4000, duration_ms: 2000` ends exactly where one starting at 6000 begins.
Collection commands accept 1 to 128 items.

## Placing and changing Clips

`create_clips` places Clips from a `ClipSpec`: `zone_id`, `layer_id`,
`start_ms`, `duration_ms`, and a `pattern` reference. Three optional fields
matter most:

- `instance` decides which running copy of the Pattern the Clip uses.
  `"sole"` (the default) reuses the one existing copy of that Pattern, creating
  it if there is none, and refuses with the candidate ids if there are several.
  `"new"` creates the first copy and refuses if one already exists. An
  explicit `instance_id` shares that copy. Clips that share a copy share its
  state, so motion continues across them; to give a Clip its own copy later,
  use `make_clip_pattern_independent`.
- `entry_policy` is `continue` or `restart`. `restart` resets the Pattern
  when the Clip begins, and every Clip sharing that copy sees the reset.
- `appearance` sets the Clip's opacity, Transform, Aperture, and Effect stack
  from the start; `instance_properties` sets the Pattern's controls and speed.

`update_clips` changes existing Clips by `clip_id`. It can move a Clip in
time or to another Zone or Layer, subject to the usual overlap checks. A time
move carries Transition-connected Clips along with it, and resizing an edge
ripples the Clips connected after it while the Transition stays intact. A Clip
at either end of a Transition between two Clips cannot change Zone or Layer;
remove that Transition first. A whole-output Transition does not block the
move unless it was converted from an older Show file's scene boundary.
`create_layers` adds overlay Layers, optionally with Clips already on them.

## Appearance over time

A Clip's appearance is a series of held keys, so an appearance change has to
say where it lands. `{ "scope": "whole-clip" }` changes every key.
`{ "scope": "at-time", "at_ms": N }` changes the key in effect at that time,
inserting a new key if none starts there and leaving later keys alone. The
time must fall inside the Clip. The Effect stack commands take the same
selector.

Effects are written as `{ kind, parameters }` and Aperture shapes as a shape
plus `shape_parameters`, checked against exactly the ranges the editor's
inspector allows.

## Animation

`add_property_tracks` animates one target with keyframes. Clip targets use
short names: `opacity`, `view-brightness`, `view-phase`,
`transform-position-x`, `transform-position-y`, `transform-rotation`,
`transform-scale-x`, `transform-scale-y`, `aperture-x`, `aperture-y`,
`aperture-width`, and `aperture-height`. Beyond those, `effect` animates an
Effect parameter, `control` a Pattern control, `time-scale` a Pattern's
speed, `layout-split-position` a split Layout, and `show-repeat-scale` the
whole Show. A Clip track is active over its Clip by default.
`edit_property_keyframes` moves, swaps, adds, or removes keys in one step.

## Full schemas

A connected agent can read the complete, generated reference as MCP
resources:

- `pxlblz://schemas/clip-layer-authoring/v2`: JSON Schema for every input.
- `pxlblz://docs/clip-layer-authoring/v2`: defaults, clearing rules, the
  per-Effect and per-shape parameter tables, and worked examples.

Both are generated from the same field definitions the commands validate
against, so they cannot drift from what the server accepts.
