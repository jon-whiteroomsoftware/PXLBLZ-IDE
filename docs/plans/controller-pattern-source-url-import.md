# Controller Pattern import through an original-source URL

Status: agreed product direction, updated 2026-10-30; not a completion claim.
Related work: [#1221](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1221).

Import retrieves clean Pattern source from a URL recorded in the saved
Controller artifact and creates a personal Pattern in the recipient's account.
A separate Save compiles that source with the recipient's Controller profile
and replaces the existing saved slot. Import itself leaves the Controller
unchanged.

This direction revises #1221's earlier immediate-write-back decision. The
[current import contract](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/blob/7de0cef3/docs/reference/contracts/controller-pattern-import.md)
describes the implementation reverted on 2026-10-30 and retained in history at `7de0cef3`.

## Purpose

Jon is preparing gifts with hand-picked Patterns, enhanced with features such
as brightness control and slow motion. Recipients should be able to connect
their Controller to PXLBLZ-IDE, import its Patterns into their own accounts,
and begin editing. These personal imports remain separate from the public
Gallery and do not require access to the sender's account.

Recipients can learn how Controller profiles and Save work as they experiment.
The import feature does not need to recreate the sender's complete setup or
preserve every enhancement in the editable source.

Recipients can also tune an already enhanced gift through native Pixelblaze
sliders without importing, editing, or rebuilding its Pattern. Source import
serves those who want to edit; ordinary control adjustment is a simpler path.

## Click one: Import original source

The generated artifact header carries a structured URL identifying a
downloadable clean Pattern. The importer reads that header, retrieves the
referenced source, and saves an ordinary editable personal Pattern with its
attribution and source URL.

The Controller keeps its existing saved Pattern and continues playing as before.
Import does not compile for the Controller, activate another Pattern, delete a
saved slot, or write a replacement. The imported Pattern retains an association
with the original slot for a later explicit Save.

Once imported, the account owns a durable copy of the retrieved source. Editing
and subsequent Saves use that copy and do not depend on fetching the URL again.

## Source provenance and availability

Some existing Patterns contain attribution links in comments. The current
generated header has no structured original-source URL understood by the
importer. Adding that field makes the source reference explicit and preserves
a useful connection to the author.

The download URL must identify clean Pixelblaze source or a supported Pattern
artifact containing it. An attribution page, such as a page crediting an
inspirational shader, is not necessarily a usable download. Initial support
should cover the actual source hosts used for the gifts; a general webpage
extractor is outside this direction.

Gift preparation records a hash of the clean source alongside its URL. Prefer
an immutable version URL where the source host offers one. The hash distinguishes
the source used for the gift from a later revision served at the same address.
It does not establish authorship or permission.

A missing, unavailable, unsupported, or changed source must produce a concrete
explanation. The importer must not silently substitute different source or
claim that the original was recovered. Exact handling of those outcomes and
older artifacts without a source URL remains implementation design work.

This approach carries a reference rather than a second copy of the original
source in the Controller artifact. Its tradeoff is dependence on the referenced
source remaining available until import succeeds.

## Click two: Save to Controller

Save compiles the account's clean source with the recipient's current Controller
profile and overwrites the original saved slot. It builds a complete replacement;
it does not edit or reverse the old wrapping code.

Do not delete the original Pattern first. The existing Save path already supports
overwriting a saved slot. Deletion would add a hardware operation and leave the
gift missing a Pattern if replacement failed.

The first Save uses the recipient's settings. The sender's added slow motion or
brightness-knob behavior may therefore change or disappear unless the recipient
configures the corresponding behavior. Import must not promise to transfer that
setup automatically.

## Native controls for Slow-mo and Dreamy

Generated enhanced Patterns expose **Slow-mo** and **Dreamy** as native
Pixelblaze sliders. A physical potentiometer is optional. Slow-mo deliberately
ranges from slower playback to normal speed; speeding Patterns above normal is
outside the current direction. Its name distinguishes it from any Speed control
authored by the original Pattern's creator. Dreamy controls light persistence.

Generated defaults provide an initial look. After installation, recipients can
tune the sliders in Pixelblaze's own web UI without recompiling or saving a new
Pattern artifact. Native saved control values survive Pattern switches and
Controller restarts. Pixelblaze restores them through the control handlers when
the Pattern activates, before rendering.

Pixelblaze's UI applies changes live while a slider moves, then persists the
values after interaction settles. PXLBLZ-IDE's live Controller controls should
follow the same behaviour: stream temporary adjustments, then explicitly persist
the settled values with `setControls` and `save: true`. Do not write flash for
every slider movement. Browser preview controls remain distinct from controls
on the connected Controller.

Saved Controller control values are separate from generated source defaults and
from the personal Pattern stored in the account. Adjusting the Controller does
not silently edit the account's source. This distinction removes the need to
rebuild a Pattern merely to retain a preferred Slow-mo or Dreamy setting.

Physical bindings drive those same parameters. Ownership is per parameter: one
knob can drive Slow-mo while Dreamy remains software-controlled. When a physical
input owns a parameter, the UI should identify that source and show its observed
value rather than offer a competing software adjustment that the next hardware
sample immediately overwrites. Continuous hardware sampling must not cause
continuous persistence writes.

The immediate task is to make the existing pieces consistent around this native
control model. A new preset system or a larger blend-mode catalogue is not
required for this direction.

Persistence references:

- [Pixelblaze language reference: UI controls](https://electromage.com/docs/language-reference/#user-interface-controls): values survive restarts and Pattern switches.
- [Pixelblaze WebSocket API: UI controls](https://electromage.com/docs/websockets-api#user-interface-controls): control writes require `save: true` for persistence.
- [Manufacturer explanation of UI persistence](https://forum.electromage.com/t/relationship-between-saved-pattern-and-websocket-changes/4719): live changes followed by a deferred persistent write.

## Time dilation: breathing motion

Agreed exploration, 2026-10-30: modulate the Slow-mo rate with a sine wave so a
Pattern gently gathers momentum and settles again. The effect changes how fast
Pattern time advances while keeping display refresh and frame interpolation
smooth. Modulating the frame-sampling frequency to introduce stepping or judder
is a different effect and is outside this exploration.

Use the existing Slow-mo setting as the base speed and add two native controls:

- **Depth:** the amplitude of the speed variation around that base.
- **Period:** the duration of one complete slow-fast-slow cycle, in seconds.

For example, a base of 0.3x with an amplitude of 0.2x and a period of 20 seconds
smoothly varies playback between 0.1x and 0.5x. Depth zero gives the existing
constant-rate behaviour. These controls follow the same persistence and optional
physical-binding model as Slow-mo and Dreamy.

The first exploration uses one sine wave and keeps the resulting rate within
0-1x. Bound the available amplitude by the distance from the base speed to each
limit, rather than clipping the wave into flat stretches. Reverse playback is
outside scope: arbitrary stateful Patterns cannot be reversed simply by making
their time increment negative.

The modulation oscillator runs on real elapsed time, independently of Pattern
time. A 20-second period therefore remains 20 real seconds at any Slow-mo rate.
Advance Pattern time by accumulating elapsed time weighted by the changing
rate. Do not multiply total elapsed time by the instantaneous rate: that can
make Pattern time jump backwards as the rate falls. Nonnegative rates must
produce nondecreasing Pattern time.

Dreamy's decay also remains measured in real seconds. Faster passages then
allow moving light to travel farther before fading, while slower passages
contract its trails. This interaction is the initial visual premise; separate
modulation of Dreamy is not required.

This is a bounded next exploration, separate from making the existing native
controls consistent. Its intended result is breathing, ambient movement that
preserves the Pattern's visual language, without introducing a general
modulation system or a larger blend-mode menu.

## Keep Patterns up to date

The existing toggle says: **Keep PXLBLZ Patterns up to date when Controller
settings change**. It rebuilds managed saved Patterns from source in the account;
it does not fetch upstream author updates or reconstruct missing hardware setup.

Import gives the recipient editable source. The first successful Save makes
that Controller copy managed and eligible for the existing update mechanism.
Import alone must not trigger a replacement, even when the toggle is already
enabled. Remembering the target slot does not establish that this account has
successfully delivered a managed copy.

Automatic rebuilds must account for the Controller's saved control values rather
than silently resetting a tuned look to generated defaults. Preservation across
artifact replacement is a separate requirement from native persistence across
Pattern switches and restarts; it needs verification in the delivery path.
Intentional reset or incompatible control changes need explicit treatment.

## Engineering boundary

This direction removes source unwrapping and immediate hardware replacement
from the normal URL-backed import flow. It does not resolve the separate
Controller Save reliability problem: click two still uses the Save transport,
which must be qualified independently.

The structured header format, supported download hosts and formats, retrieval
mechanism, and handling of unavailable or changed sources need bounded design
before implementation. Control persistence and ownership also need consistent
handling across native sliders, PXLBLZ-IDE's live Controller UI, physical
bindings, and artifact replacement. This document records the agreed product direction,
not completion of #1221 or authorization to publish the current implementation.

## Current implementation references

- [Artifact header](../../src/engine/artifactStamp.ts): current metadata and stamping.
- [Historical import assessment](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/blob/7de0cef3/src/engine/controllerPatternImport.ts): reverted clean-source and wrapped-source policies.
- [Controller Save](../../src/engine/pushPattern.ts): existing overwrite-in-place delivery.
- [Managed updates](../../src/engine/controllerReconciliation.ts): eligibility based on bindings, source policy and push records.
