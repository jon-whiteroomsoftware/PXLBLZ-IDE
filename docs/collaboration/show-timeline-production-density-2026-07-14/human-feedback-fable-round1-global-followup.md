# Human feedback: Fable Round 1 global follow-up

This checkpoint records the ownership question exposed by the continuous
PortalBloom clip and a candidate lesson for the dual-model design skill.

## PortalBloom across a Scene boundary

The mock draws PortalBloom as one continuous Pattern clip beginning in the
Portal Bloom Scene and extending into Afterglow. The current coarse model can
represent that literally: one `ShowCell` is anchored to its starting Scene and
zone and uses `sceneSpan` to cover the following Scene column. It retains one
Pattern reference, one adaptation and Effect stack, and one Continue/Restart
policy across the span.

If no routing target, Pattern target, placement property, restart policy, or
other rendered content changes at the Scene boundary, that boundary is
visually silent for this clip. The named Scene changes, but the continuing
Pattern does not. A full-Show Transition may still matter because other zones
or the flattened Scene output change; the fixture must state that rather than
leaving the visible consequence ambiguous.

In the proposed Scene-composition model, ownership becomes clearer:

- the Show owns one continuing Pattern-instance identity;
- each Scene owns its own bounded placement referencing that instance; and
- Continue makes the two placements visually continuous without restarting the
  Pattern clock.

The global overview may visually join contiguous placements that reference the
same continuing instance, but it must retain a subtle Scene seam or continuation
cue so selection, copying, and Scene ownership remain understandable. The joined
bar is a presentation grouping, not a new persisted owner.

## Representative-fixture requirement

Add a lesson to the dual-model design skill after this first iteration: visual
proposals must use representative fixtures that obey the actual domain model and
compiler constraints. A fixture must identify the entity owning each visible
span, declare whether state continues or restarts, and specify what changes at a
semantic boundary. It should not depend on empty space, decorative keyframes, or
impossible timing to make a layout appear successful.

For this study, future fixtures should include both visually silent Scene
boundaries with continuing Pattern state and visibly active boundaries caused
by routing, property, placement, or source changes.
