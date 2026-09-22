# Efficient Pattern engineering

## Keep four concerns distinct

### Frame state

`beforeRender` owns time advancement and expressions whose inputs do not vary by pixel: normalized controls, palette selection, modes, phrase state, coefficients, and shared trigonometric terms.

### Sample geometry

The renderer owns calculations that depend on index or coordinates. Calculate the cheapest rejecting mask first. Avoid evaluating detailed geometry for pixels that cannot contribute.

### Color

Use palette roles and contrast to multiply the perceived value of simple geometry. A color change can create a new phrase without a new renderer or state machine.

### Authored controls

Controls should change a perceptual dimension: density, speed, palette role, direction, edge character, or intensity. Avoid several controls that all perturb the same internal constant. Normalize controls once per frame when possible.

## Cost review

Count and report:

- source bytes and production image bytes when available;
- top-level bindings, scalars, and array words;
- active renderer calls per output pixel;
- repeated trig, roots, angles, noise, loops, and table lookups in the pixel path;
- branch order and which branches exclude expensive work;
- minimum, representative, and maximum pixel counts;
- Fast and Precise evidence, plus Controller evidence when required.

## Show-ready Patterns

A Show-ready Pattern is a reusable visual voice, not a Scene encoded as source.

- Keep routing, physical Zone selection, and long-form choreography outside it.
- Prefer one stable source with a small parameter surface over several copied variants.
- Shared Pattern instance identity means shared private state and clock; repeated placements may still differ through Effects and composition.
- Independent identity is correct when two placements must evolve separately. It is expensive when used only as a label or reset convenience.
- Test source and state multiplication in a small compiled Show before generating a long catalogue.

## Verification captures

Capture at least an establishment frame, a representative moving frame, and a peak or exception. A technically cheap Pattern that does not deliver the promised visual purchase has failed the plan.

