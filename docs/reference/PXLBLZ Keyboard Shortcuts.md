# PXLBLZ Keyboard Shortcuts

PXLBLZ keeps its global shortcut set small: a handful of app-wide keys, plus
specialized keyboard and modifier behavior inside particular controls. This
guide covers both, with an emphasis on the modifier-assisted gestures that are
useful but easy to miss.

`Command/Ctrl` means Command on macOS and Ctrl on Windows or Linux.
`Option/Alt` means Option on macOS and Alt on Windows or Linux.

Only PXLBLZ-owned behavior appears here. The code editor keeps Monaco's
standard platform shortcuts, text fields keep their ordinary typing and
editing keys, and browser-native controls behave the way they do everywhere
else.

## Conventions that apply everywhere

PXLBLZ controls follow familiar keyboard conventions wherever possible:

- Arrow keys move through menu and combobox choices, and `Home` and `End` jump
  to the first or last choice when the control supports them.
- `Enter` chooses, saves, or commits the current value.
- `Escape` closes or cancels, and returns focus to the control that opened it.

While a menu, popover, dialog, or other focused control is active, its local
keys take priority over the surrounding Studio or Show shortcuts. On narrow
screens, Show dialogs keep `Tab` and `Shift+Tab` inside the dialog until you
close it.

## Preview

### Playback

| Shortcut | Action |
|---|---|
| `Space` | Play or pause the active Preview. |

`Space` is the app's most global shortcut. It plays or pauses the Preview
throughout Studio and on Pattern detail pages, even when something else has
keyboard focus: outside the Show timeline, buttons, links, selectors, sliders,
menus, and tree rows all hand `Space` to Preview playback instead of treating
it as a click. Inside the Show editor, the timeline toolbar, Zone rail,
timeline entities, Navigator, and playhead pass `Space` through the same way.

The exceptions are places where `Space` means something else: text fields and
the code editor keep it for typing, and an open timeline menu or popover keeps
it so you can still activate its focused choice.

### 3D Preview

Drag a 3D Preview to orbit the camera. While you hold it, automatic orbiting
pauses; when you release it, automatic movement resumes. This works wherever a
Pattern or Show presents a 3D Preview, and `Space` still controls playback
while the canvas has focus.

## Studio layout and personal content

You can operate the Studio panes and your personal-content tree entirely from
the keyboard.

### Pane dividers

| Shortcut | Action |
|---|---|
| `Left` or `Right` | Move a focused pane divider by 10 pixels. |
| `Shift+Left` or `Shift+Right` | Move a focused pane divider by 50 pixels. |

You can also drag a divider to resize the adjacent panes directly. Once you
set a divider position, PXLBLZ remembers it for that Studio mode.
To use the arrow shortcuts, press `Tab` until the divider receives keyboard
focus; clicking or dragging a divider does not move keyboard focus to it.

### Personal-content tree

| Shortcut | Action |
|---|---|
| `Up` or `Down` | Move focus to the previous or next tree row. |
| `Right` | Expand a collapsed folder. |
| `Left` | Collapse an expanded folder. |
| `Enter` | Open an entity or toggle a folder. |
| `Enter` while renaming | Save the new name. |
| `Escape` while renaming | Cancel the rename. |

You can also drag entities and folders to reorganize them: drop near the upper
or lower edge of a row to insert before or after it, or drop on the center of
a folder row to move the item into that folder. To rename editable personal
content, you can also click its title above the center pane.

## Exact fields and compact sliders

Many exact numeric fields have a small grip at their right edge. The grip
opens a compact slider, so you can scrub the value without the inspector
permanently giving up space to a full-size slider.

| Shortcut | Action |
|---|---|
| `Enter` or `Space` on the grip | Open and pin the compact slider. |
| Arrow keys | Adjust by the field's step. |
| `Home` or `End` | Jump to the slider's minimum or maximum. |
| `Enter` | Commit the slider value. |
| `Escape` | Cancel the slider edit and restore the previous value. |

Clicking the grip without dragging pins the slider open. Holding and dragging
the grip previews values continuously and saves once when you release — even
if the pointer has left the slider by then. In the text field itself, `Enter`
commits and `Escape` restores the previous value.

## Show transport and history

Show shortcuts work whenever the timeline workspace has the keyboard — that
is, whenever you are not typing in a text field or working inside an open
editing control.

| Shortcut | Action |
|---|---|
| `Space` | Play or pause the Show. |
| `A` | Return to the start of the Show. |
| `1` | Set playback speed to 1x. |
| `2` | Set playback speed to 2x. |
| `3` | Set playback speed to 3x. |
| `Left` or `Right` | Seek backward or forward five seconds. |
| `Command/Ctrl+Z` | Undo the last Show edit. |
| `Command/Ctrl+Shift+Z` | Redo the last undone Show edit. |

Changing playback speed never starts or stops playback. Five-second seeking
clamps at the Show bounds, keeps the current play/pause state, and leaves the
visible timeline viewport where it is.

The playhead itself offers finer scrubbing when it has focus: `Left` and
`Right` move by one second at first, speed up to two seconds after the key has
been held for half a second, and to five seconds after one and a half seconds.
Releasing the key commits the final position.

## Show timeline navigation

Modifier-and-pointer combinations make it faster to move through a long Show.

| Interaction | Action |
|---|---|
| `Command/Ctrl+wheel` | Zoom around the playhead, or around the viewport center when the playhead is out of view. |
| `Shift+wheel` | Pan the timeline horizontally. |
| Click or drag the ruler or playhead | Seek through the Show. |
| Hold `Option/Alt` while scrubbing | Temporarily reverse the current Snap setting. |
| Drag the Navigator's center | Pan the visible timeline viewport. |
| Drag a Navigator edge | Resize the visible timeline viewport. |

When the Navigator has keyboard focus, `Left` and `Right` move its pan thumb
or active edge by five percent of the visible duration. `Space` still controls
playback from the Navigator and the playhead.

## Show selection and editing

`Tab` walks the timeline's Clips and Groups directly, so you can reach every
entity without tabbing through the whole page.

| Shortcut | Action |
|---|---|
| `Tab` or `Shift+Tab` | Move to the next or previous Clip or Group, wrapping at either end. |
| `Delete` or `Backspace` | Delete the selected Clip, Group occurrence, Zone, or Transition (other than a Cut). |
| `Escape` | Close or back out of the current Show context. |

Tab traversal starts from the timeline workspace or from a Clip or Group. A
Group counts as one stop until you isolate it; an isolated Group exposes its
Group Clips. The timeline toolbar and Zone rail keep ordinary browser Tab
navigation.

`Escape` gives the most local interaction the first chance to close. It
dismisses an active menu, popover, field, or dialog before it exits Group
isolation, closes Entity Detail, or clears the timeline selection and returns
focus to the Show workspace.

## Creating and arranging Clips

Clip gestures separate moving an object from changing timeline time. One
modifier does double duty: `Option/Alt` duplicates when you drag a Clip body,
but temporarily reverses Snap when you resize a Clip edge.

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
| Double-click a Group Clip | Enter Group isolation. |
| `Escape` while a Group is isolated | Exit isolation and restore the Group selection. |

To duplicate, hold `Option/Alt` before the drag begins. The duplicate is
latched at drag start, so you can release the modifier mid-drag without
turning the duplicate back into a move.

A connected Clip-and-Transition chain moves rigidly when dragged horizontally;
moving it to another Layer removes its attached Transitions. A collapsed Zone
miniature is still a valid drop target, so you can move a Clip into that Zone
without expanding it first. Invalid drops — collisions, or positions outside
the Show — cancel cleanly instead of partially applying the move.

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

Show End cannot move earlier than the last authored content. Clicking an
already selected timeline entity toggles its transient Entity Detail closed,
and clicking the timeline background closes transient details without
changing pinned ones.

## Clip placement

The Place pad edits Content and Aperture geometry directly. Modifiers give you
coarse movement, constrained sizing, and coupled motion.

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

When Aperture placement is enabled, Content sizing stays uniform without any
modifier. Dragging bare pad space while Aperture is focused sweeps the visible
cells, and nearby grid lines and rectangles snap magnetically during
placement.

## Zones and Effects

The Zone spatial selector and the Effect stack combine direct manipulation
with keyboard completion and cancellation.

| Interaction | Action |
|---|---|
| Drag in the Zone spatial selector | Select pixels using the visible Replace, Add, or Subtract mode. |
| `Enter` in the Zone spatial selector | Save the spatial selection. |
| `Escape` in the Zone spatial selector | Cancel the spatial selection. |
| Drag an Effect's handle | Reorder it within its compiler stage. |

An Effect cannot be dragged across compiler stages. When dragging is
inconvenient, the Effect's action menu offers the same moves as
keyboard-accessible commands.
