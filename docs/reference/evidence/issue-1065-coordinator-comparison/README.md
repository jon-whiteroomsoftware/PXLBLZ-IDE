# Coordinator comparison before the Show editor connection

The existing editor and the stored-v2 route are visibly different. The coordinator
opened all four corpus pairs in the in-app browser on 2026-09-17, at 1440 x 1000
and 390 x 844, before accepting the oracle candidate. The screenshots document
layout inspection only: they are not deterministic pixel-comparison evidence.
Some captures retain an earlier playing frame despite pausing through the UI.
The automated oracle must independently qualify fixed-time capture stability.

The managed #1065 runtime uses synthetic account `local-agent-16`. The seed command
stores each source in `e2e/fixtures/showEditorEquivalence.json` as v1 and stores its
conversion through `convertShowRecordV1ToV2` as v2. No personal Show was changed.
Both ordinary routes were opened side by side at desktop width; narrow pairs were
inspected sequentially in the same resized tab. The routes use
`/PXLBLZ-IDE/studio/shows/oracle-<key>-v{1,2}?capture`. The capture flag does not
select a record version; storage does.

| Corpus key | Desktop v1 / v2 | Narrow v1 / v2 |
| --- | --- | --- |
| fresh | [v1](fresh-v1-desktop.png) / [v2](fresh-v2-desktop.png) | [v1](fresh-v1-narrow.png) / [v2](fresh-v2-narrow.png) |
| installation-layouts | [v1](installation-v1-desktop.png) / [v2](installation-v2-desktop.png) | [v1](installation-v1-narrow.png) / [v2](installation-v2-narrow.png) |
| groups-animation | [v1](groups-v1-desktop.png) / [v2](groups-v2-desktop.png) | [v1](groups-v1-narrow.png) / [v2](groups-v2-narrow.png) |
| stock-lesson | [v1](lesson-v1-desktop.png) / [v2](lesson-v2-desktop.png) | [v1](lesson-v1-narrow.png) / [v2](lesson-v2-narrow.png) |

Every desktop pair shows the rejected v2 route's extra header, narrower timeline,
always-present inspector column and Group forms. Every narrow pair shows those
forms replacing the visible Stage area. The v1 editor retains its compact toolbar,
Clip/Transition rendering and Stage controls. The Installation baseline shows
physical routing and Layout switches; the Group baseline shows layered Clips and
animation summaries; the stock lesson shows Transition pictograms and an animation
curve. These are concrete visual failures, irrespective of backend capability.

The rejected v2 UI is only the failing test target. It supplies no code, design
reference or guidance for the connection. The existing v1 editor alone defines UX.

These captures supplement, and do not replace, the oracle's named-surface pixel
comparison, deterministic recapture qualification, and persisted pointer-drag,
history, save and Undo checks. No unchanged-UX claim is made by this packet.
