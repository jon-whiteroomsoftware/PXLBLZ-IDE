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

The direct follow-ups to this arc are complete: #590 shipped
coverage-directed Clip Viewport evaluation, and #591/#678/#679 grew it into
the full shaped-Aperture catalogue with Soft, Hard, and Dither edges.

The Built-in Show curriculum (#363) is built under its revised
[catalogue build packet](stock-show-catalogue-build-packet.md); its remaining
work is captures and human release review.
