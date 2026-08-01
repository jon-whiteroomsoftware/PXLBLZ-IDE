# PXLBLZ Keyboard Shortcuts

PXLBLZ keeps its global shortcut set small and gives specialized controls their
own keyboard behavior. This guide collects both kinds of interaction, along
with modifier-assisted gestures that are useful but easy to miss.

`Command/Ctrl` means Command on macOS and Ctrl on Windows or Linux.
`Option/Alt` means Option on macOS and Alt on Windows or Linux. Text fields and
the code editor retain typing keys. Menus, popovers, sliders, and other focused
controls retain their normal navigation and editing keys unless a section below
names an app-level shortcut.

This guide covers PXLBLZ-owned behavior. The code editor retains Monaco's
standard platform shortcuts, and ordinary browser controls retain their normal
keyboard behavior.

## Preview

Preview playback uses the same shortcut wherever authoring work happens.

### Playback

| Shortcut | Action |
|---|---|
| `Space` | Play or pause the active Preview. |

`Space` works throughout Studio and on Pattern detail pages. Text fields and the
code editor keep it for typing. Outside the Show timeline, buttons, links,
selectors, sliders, menus, and entity-tree rows delegate Space to Preview
playback instead of using their native Space action. Inside the Show editor,
the timeline toolbar, Zone rail, timeline entities, Navigator, and playhead
also pass Space through to playback. An open timeline menu or popover keeps
Space so its focused button can still be activated.

### 3D Preview

Drag directly on a 3D Preview to orbit the camera. Grabbing the Preview pauses
automatic orbiting; releasing it resumes automatic movement. This interaction
works wherever a Pattern or Show presents a 3D Preview. Preview playback
remains controlled by `Space` when the canvas has focus.

## Studio layout and personal content

The Studio panes and personal-content tree can be operated without precise
pointer movement.

### Pane dividers

| Shortcut | Action |
|---|---|
| `Left` or `Right` | Move a focused pane divider by 10 pixels. |
| `Shift+Left` or `Shift+Right` | Move a focused pane divider by 50 pixels. |

Drag a divider to resize the adjacent panes directly. PXLBLZ remembers a
deliberate divider position for that Studio mode.

### Personal-content tree

| Shortcut | Action |
|---|---|
| `Up` or `Down` | Move focus to the previous or next tree row. |
| `Right` | Expand a collapsed folder. |
| `Left` | Collapse an expanded folder. |
| `Enter` | Open an entity or toggle a folder. |
| `Enter` while renaming | Save the new name. |
| `Escape` while renaming | Cancel the rename. |

Personal entities and folders can also be dragged to reorder or reorganize
them. Drop near the upper or lower edge of a row to insert before or after it;
drop in the center of a folder row to move the item into that folder. The title
above the center pane is also a rename control for editable personal content.

## Exact fields and compact sliders

Many exact numeric fields have a small grip at their right edge. The grip opens
a compact slider without permanently taking space from the inspector.

| Shortcut | Action |
|---|---|
| `Enter` or `Space` on the grip | Open and pin the compact slider. |
| Arrow keys | Adjust by the field's authored step. |
| `Home` or `End` | Move to the slider's minimum or maximum. |
| `Enter` | Commit the slider value. |
| `Escape` | Cancel the slider edit and restore the previous value. |

Click the grip without moving to pin the slider. Hold and drag the grip to
preview values continuously and save once when the pointer is released, even
if the pointer leaves the slider before release. Exact text fields use `Enter`
to commit and `Escape` to restore their previous value.

## Menus, dialogs, and other focused controls

PXLBLZ controls follow familiar keyboard conventions wherever possible:

- Arrow keys move through menu and combobox choices.
- `Home` and `End` move to the first and last choice when the control supports
  them.
- `Enter` chooses, saves, or commits the current value.
- `Escape` closes or cancels and restores focus to the invoking control.
- Narrow-screen Show dialogs trap `Tab` and `Shift+Tab` until the dialog is
  closed.

These local behaviors take priority over surrounding Studio or Show shortcuts
while the control is active.

## Show transport and history

Show shortcuts operate when the timeline workspace owns the keyboard. A text
field or open editing control retains its native keys.

| Shortcut | Action |
|---|---|
| `Space` | Play or pause the Show. |
| `A` | Return to the start of the Show. |
| `1` | Set playback speed to 1x. |
| `2` | Set playback speed to 1.5x. |
| `3` | Set playback speed to 2x. |
| `Left` or `Right` | Seek backward or forward five seconds. |
| `Command/Ctrl+Z` | Undo the last Show edit. |
| `Command/Ctrl+Shift+Z` | Redo the last undone Show edit. |

Changing playback speed does not start or stop playback. Five-second seeking
clamps at the Show bounds, preserves the current play/pause state, and leaves
the visible timeline viewport where it is.

The focused playhead has finer keyboard scrubbing. `Left` and `Right` move by
one second at first, by two seconds after the key has been held for half a
second, and by five seconds after one and a half seconds. Releasing the key
commits the final position.

## Show selection and editing

Selection shortcuts keep the timeline navigable without putting every Show
entity into the browser's ordinary Tab order.

| Shortcut | Action |
|---|---|
| `Tab` or `Shift+Tab` | Move to the next or previous Clip or Group, wrapping at either end. |
| `Delete` or `Backspace` | Delete the selected Clip, Group occurrence, Zone, or non-Cut Transition. |
| `Escape` | Close or back out of the current Show context. |

Tab traversal starts from the timeline workspace or a Clip or Group. A Group
is one stop until it is isolated; an isolated Group exposes its Group Clips.
The timeline toolbar and Zone rail retain ordinary browser Tab navigation.

`Escape` gives the most local interaction the first chance to close. It closes
an active menu, popover, field, or dialog before it exits Group isolation,
closes Entity Detail, or clears the timeline selection and returns focus to the
Show workspace.

## Show timeline navigation

The timeline combines keyboard modifiers with the pointer for faster movement
through long Shows.

| Interaction | Action |
|---|---|
| `Command/Ctrl+wheel` | Zoom around the playhead, or around the viewport center when the playhead is out of view. |
| `Shift+wheel` | Pan the timeline horizontally. |
| Click or drag the ruler or playhead | Seek through the Show. |
| Hold `Option/Alt` while scrubbing | Temporarily reverse the current Snap setting. |
| Drag the Navigator's center | Pan the visible timeline viewport. |
| Drag a Navigator edge | Resize the visible timeline viewport. |

When the Navigator has keyboard focus, `Left` and `Right` move its pan thumb or
active edge by five percent of the visible duration. `Space` still controls
playback from the Navigator and playhead.

## Creating and arranging Clips

Clip gestures distinguish moving an existing object from changing timeline
time. `Option/Alt` duplicates a Clip body, but reverses Snap while resizing a
Clip edge.

| Interaction | Action |
|---|---|
| Double-click an empty Layer | Open the Pattern chooser at that Layer and time. |
| `Option/Alt`-double-click an empty Layer | Open the Pattern chooser with Snap temporarily reversed for the insertion time. |
| Drag a Clip body | Move the Clip to a valid time, Layer, or Zone. |
| Start a Clip drag with `Option/Alt` held | Drag an independent duplicate of the Clip. |
| Drag a selected Clip edge | Resize the Clip's start or end. |
| Hold `Option/Alt` while resizing | Temporarily reverse the current Snap setting. |
| `Shift`-click a Clip | Add it to or remove it from the current multi-selection. |
| Drag across empty timeline space | Marquee-select Clips for a multi-selection. |
| Double-click a Group Clip | Enter modeless Group isolation. |
| `Escape` while a Group is isolated | Exit isolation and restore the Group selection. |

For duplication, hold `Option/Alt` before the drag begins. PXLBLZ latches the
duplicate operation at drag start, so releasing the modifier during the drag
does not turn it back into a move.

A connected Clip-and-Transition chain moves rigidly when dragged horizontally.
Moving it to another Layer removes its attached Transitions. A collapsed Zone
miniature remains a valid drop target, so a Clip can be moved into that Zone
without expanding it first. Invalid drops, including collisions and positions
outside the Show, cancel instead of partially applying the move.

## Markers, Transitions, and Show End

Several compact timeline controls support direct manipulation in addition to
their visible buttons and detail panels.

| Interaction | Action |
|---|---|
| Click a Transition junction | Select the Transition and open its chooser or details. |
| Click the Marker control | Add a Marker at the playhead. |
| Drag the Marker control onto the ruler | Create a Marker at the drop time. |
| Drag an existing Marker | Move the Marker. |
| Drag the Show End diamond | Change the Show duration. |
| Hold `Option/Alt` during a Marker or Show End drag | Temporarily reverse the current Snap setting. |

Show End cannot move before the last authored content. Clicking an already
selected timeline entity toggles its transient Entity Detail closed; clicking
the timeline background closes transient details without changing pinned
details.

## Clip placement

The Place pad edits Content and Aperture geometry directly. Its modifier keys
provide coarse movement, constrained sizing, and coupled motion.

| Interaction | Action |
|---|---|
| Arrow keys | Nudge the focused Content or Aperture by 0.01 stage units. |
| `Shift`+Arrow key | Nudge by 0.1 stage units. |
| Drag Content | Move the Content rectangle. |
| Drag a Content corner | Resize Content. |
| Hold `Shift` while resizing Content | Constrain the Content rectangle to a square. |
| Drag the rotation handle | Rotate Content. |
| Hold `Shift` while rotating | Snap rotation to 15-degree increments. |
| Drag Aperture | Move the Aperture rectangle. |
| `Option/Alt`-drag Aperture | Move Aperture and carry Content with it. |
| Drag an Aperture corner | Resize Aperture. |

When Aperture placement is enabled, Content sizing remains uniform without a
modifier. Dragging bare pad space while Aperture is focused sweeps the visible
cells. Nearby grid lines and rectangles provide magnetic alignment during
placement.

## Zones and Effects

The Zone spatial selector and Effect stack combine direct manipulation with
keyboard completion and cancellation.

| Interaction | Action |
|---|---|
| Drag in the Zone spatial selector | Select pixels using the visible Replace, Add, or Subtract mode. |
| `Enter` in the Zone spatial selector | Save the spatial selection. |
| `Escape` in the Zone spatial selector | Cancel the spatial selection. |
| Drag an Effect's handle | Reorder it within its compiler stage. |

An Effect cannot be dragged across compiler stages. Its action menu provides
keyboard-accessible move commands when dragging is inconvenient.
