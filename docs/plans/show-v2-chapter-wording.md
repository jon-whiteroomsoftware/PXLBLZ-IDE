# Prepared Feature Guide wording for chapters (#1040)

Status: prepared, not published. The
[Feature Guide](../reference/PXLBLZ%20Feature%20Guide.md) documents shipped
behavior, and the chapter vocabulary is not user-facing production behavior
until #1039 activates v2. This file holds the replacement wording so #1039 and
#1043 can land it without re-deriving it, and so the vocabulary is reviewed
once rather than invented twice.

What actually changed at #1040 is narrow: the Gallery band and the public
reading card no longer print a Scene count, the reading card's arc is the Show's
chapter list, and the Live preview names the chapter the loop is inside. Nothing
about playback, timing or authoring changed.

## Gallery and the Show page

Current text (Feature Guide, "Gallery", ~line 33):

> A band opens the Show's own page (`/s/<slug>`) with the stage at full size and
> its scenes as an arc.

Prepared replacement:

> A band opens the Show's own page (`/s/<slug>`) with the stage at full size and
> its chapters as an arc: the Show's named passages, each with how long it runs.
> The caption beside a band names the chapter the loop is currently inside.

A Show with no named chapters shows no arc and no caption; nothing is invented
to fill the space. The loop length, Zone count and track stay as they are.

## Markers and chapters

There is no Feature Guide passage for Markers to replace yet. Prepared text, to
be placed with the timeline description when the v2 editor ships:

> A **Marker** is a named point on the timeline. It guides your eye and nothing
> else: playback, Clips and Transitions never depend on one. A Marker can also
> be a **chapter**, which is how a Show names its passages for the Gallery, its
> public page and the Live caption. Chapters read in time order, and two
> chapters at the same moment stay separate. Markers you add are ordinary
> guides; they do not become chapters on their own.

## Live strip narration

Current text (Feature Guide, "Live strip", ~line 685) still describes Scene
following:

> Without a reference guide it follows the Scene in a multi-Scene Show, or the
> most recently started Clip on the first Zone's main lane in a single-Scene
> Show […]

Prepared replacement, for #1039 when the editor's Live strip reads the same
projection the Gallery already does:

> Without a reference guide it follows the current chapter, or the most recently
> started Clip on the first Zone's main lane when the Show has no chapters […]

## What must not be swept

`#1043` owns the bounded Scene-string inventory. Historical artistic Pattern and
Show names, archived plans, and the pinned legacy builder's own comments are not
renamed by a vocabulary scan; only live product strings move.
