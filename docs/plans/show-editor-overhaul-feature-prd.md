# Show editor overhaul - completed arc

Status: complete. The unified Show editor shipped through issues #579-#589 and
#592. The original feature PRD, interaction design, and final UX decision are
retained as design history under [`archive/`](archive/):

- [Feature PRD](archive/show-editor-overhaul-feature-prd.md)
- [UX design](archive/show-editor-overhaul-ux-design.md)
- [Final UX decision](archive/show-editor-overhaul-final-ux-decision.md)

The shipped product no longer exposes Scene headers, Scene X-ray, Super Detail,
or a Scene-local editor. Authors work on one proportional timeline of direct
Clips, Layers, Transitions, Groups, Zones, Zone Layout intervals, Markers, and
Property animation. The persisted and compiled model still uses internal Scene
partitions as a compatibility and lowering representation; they are not a
second authoring scope.

Current behavior belongs in:

- [`CONTEXT.md`](../../CONTEXT.md) for canonical Show language;
- the [Feature Guide](../reference/PXLBLZ%20Feature%20Guide.md#part-4--shows)
  for the user workflow; and
- the [Technical Reference](../reference/PXLBLZ%20Technical%20Reference.md#part-5--shows)
  for persistence, authoring boundaries, lowering, compilation, and delivery.

## Remaining follow-ups

GitHub Issues owns the remaining work. The direct follow-ups to this arc are:

- #590, which may optimize rectangular Clip Viewport coverage before Pattern
  evaluation without changing saved behavior or UI; and
- #591, which may add Circle/Ellipse and later shaped apertures after #590
  establishes the reusable coverage path.

The Built-in Show curriculum remains a separate unfinished content arc under
#363. Its revised
[catalogue build packet](stock-show-catalogue-build-packet.md) defines the
approved fifteen-lesson unified-editor progression; fixture rebuilding, guide
handoffs, captures, and human review remain. Broader ideas such as
multi-selection and clipboard editing (#472) remain post-release product work
rather than unfinished overhaul scope.
