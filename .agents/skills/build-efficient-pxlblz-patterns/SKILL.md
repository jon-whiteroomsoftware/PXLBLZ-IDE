---
name: build-efficient-pxlblz-patterns
description: Build, revise, or evaluate a production Pixelblaze Pattern from a Visual Direction Packet and Visual Performance Plan. Use when implementing a visually compelling PXLBLZ Pattern, making a Pattern reusable inside Shows, designing controls and state, reducing per-pixel or artifact cost without losing the premise, or proving source, globals, preview, Precise-mode, and Controller performance. This skill owns one Pattern artifact, not Stage topology or long-form Show composition.
---

# Build Efficient PXLBLZ Patterns

Implement one expressive Pattern whose visual purchase survives its hardware constraints. Keep frame-wide state, per-pixel geometry, controls, and future Show reuse deliberately separable.

## Establish the two design inputs

1. Obtain a Visual Direction Packet from `design-compelling-pxlblz-visuals`, or normalize the user's brief to its premise, hero effect, grammar, palette, motion, and intensity contract.
2. Obtain a Visual Performance Plan from `co-design-pxlblz-visual-performance`. If none exists, create the smallest useful plan before choosing implementation math.

Read [pattern-engineering.md](references/pattern-engineering.md) before implementation. In a PXLBLZ repository, also read the project's canonical Pixelblaze semantics, compiler, preview, and testing references.

## Define the Pattern contract

Record dimensionality, coordinate assumptions, renderer arity, time behavior, controls, private state, palette behavior, pixel-count range, and target Controller. State the hero effect in perceptual terms and identify the exact calculations that buy it.

If the Pattern will appear in Shows, design it as reusable material:

- Keep scene identity, routing, and Stage topology outside the Pattern.
- Expose a small set of meaningful controls rather than cloning source for variations.
- Let multiple placements share one Pattern instance when their clocks and private state may agree.
- Require a new instance only for genuinely independent state history, clock, or controls.

## Build from frame state into pixels

1. Put clock advancement, modes, palette selection, control normalization, and every proven frame-invariant expression in `beforeRender`.
2. Keep the renderer as a small sample-dependent kernel. Branch away from inapplicable work before expensive geometry.
3. Establish the image with cheap gates, folds, repeats, mirrors, phase, address changes, affine transforms, and palette contrast.
4. Add a selective field, non-linearity, lookup, or extra state only when the production preview shows a clear gain.
5. Give every repeated trig call, root, angle, noise octave, array, and renderer variant a named visual purchase.
6. Preserve Pixelblaze numeric and language constraints. Test Fast preview for iteration and Precise preview for device-like behavior; neither substitutes for hardware qualification when hardware is part of the target.

Do not optimize the hero into blandness. Reduce invisible supporting work first, then move invariant work, share structure, simplify controls, and only then choose a perceptually equivalent hero mechanism.

## Prove the Pattern incrementally

Use the repository's TDD and verification workflow.

1. Write a failing compile or behavior test for the Pattern contract.
2. Add the smallest implementation that produces a lit, changing, bounded output.
3. Assert renderer arity, controls, deterministic frame advancement where supported, representative color or geometry behavior, and prohibited operations if the plan names them.
4. Measure source bytes, top-level bindings, globals and arrays, per-frame work, per-pixel expensive operations, and the supported runtime proxy.
5. Test the intended minimum, representative, and maximum pixel counts.
6. Inspect ordinary, low-energy, and peak frames in the production preview. Compare captures to the Visual Direction Packet, not merely to a passing checksum.
7. If the Pattern is Show-bound, compile a small reuse probe with several placements or Scenes. Compare shared identity with unnecessary unique identities so accidental source/state multiplication is visible early.
8. Qualify on the target Controller when the commission requires it, recording image bytes, VM headroom, and frame metrics.

## Review the result

Reject or revise the Pattern when any answer is weak:

- Is the hero effect legible within one second?
- Is variation produced mostly by a stable grammar rather than copied kernels?
- Does `beforeRender` own frame-wide work and the renderer own only sample-dependent work?
- Does each expensive operation create a visible feature?
- Are controls few, meaningful, and cheap to evaluate?
- Can the Pattern be reused in a Show without baking in scene-specific identity?
- Do Fast, Precise, and hardware evidence support the claims made for each?
- Does the fallback ladder preserve the premise under a tighter budget?

Finish with the Pattern source, controls, representative captures, test commands and outcomes, all three performance ledgers, hardware caveats, and the next reuse or composition handoff.

