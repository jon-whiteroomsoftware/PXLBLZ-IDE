---
name: co-design-pxlblz-visual-performance
description: Co-design a PXLBLZ visual concept and its Pixelblaze performance strategy before implementation. Use after or alongside design-compelling-pxlblz-visuals when selecting high-impact Pattern or Show mechanisms, comparing visual payoff with source, state, renderer, transition, memory, and Controller costs, planning repetition with variation, or turning a Visual Direction Packet into an implementation-ready Visual Performance Plan. This is an early design skill, not a late optimization gate.
---

# Co-design PXLBLZ Visual Performance

Turn a compelling visual direction into resource jujitsu: spend limited Pixelblaze resources where the viewer will notice them, and use repetition, transformation, timing, and shared identity everywhere else. Preserve the visual premise while choosing mechanisms that can survive the target hardware.

## Establish the design problem

1. Obtain a Visual Direction Packet from `design-compelling-pxlblz-visuals`, or normalize the user's brief to an equivalent premise, hero effect, supporting grammar, palette roles, motion law, and intensity arc.
2. Identify the target artifact: one Pattern, a Portable Show, or an Installation Show. Record dimensionality, pixel count or range, duration, Stage topology when applicable, Controller profile, and whether the result is exploratory or must activate on real hardware.
3. Establish explicit budgets for source or compiled artifact, globals and arrays, active Pattern evaluations, render targets, and frame time. Mark unknown limits as provisional and schedule an early measurement; never silently invent certainty.

Read [cost-model.md](references/cost-model.md) before selecting mechanisms. Use [visual-performance-plan.md](references/visual-performance-plan.md) as the output contract.

## Design impact and cost together

Work from the hero effect outward rather than optimizing a finished design after the fact.

1. Name the one visual purchase that must remain unmistakable. Describe what the audience perceives, not the algorithm used to produce it.
2. Generate at least two implementation grammars for that purchase. Compare them across the three ledgers: artifact and state, active render work, and memory and concurrency.
3. Select the cheapest grammar that preserves the intended perception. Prefer repetition with variation, shared clocks and state, phase offsets, affine transforms, mirroring, palette changes, masks, address changes, and rhythmic scheduling before buying another unique Pattern or renderer.
4. Give every expensive operation, independent Pattern instance, renderer, transition, render target, and large table a visible job. Remove purchases whose absence is not perceptible in the production preview.
5. Design supporting voices from cheap materials so the resource budget remains concentrated in the hero.

Do not confuse data with duplicated programs. A short array of parameters can be cheap; a unique Pattern instance may duplicate renamed private bindings, Pattern source, and generated wrappers in a compiled Show. Likewise, low runtime concurrency does not guarantee a small artifact when a compiler unrolls similar scene or transition code at every boundary.

## Plan repetition with variation

Treat reuse as both a visual principle and an engineering advantage.

- Reuse Pattern identity when placements may share private state, controls, and clock. Create independent identity only when the visible behavior requires independent state or time.
- Derive family resemblance through transforms, masks, palette roles, phase, physical routing, and sparse parameter records.
- Prefer a small cast of strong voices recurring in new relationships over a catalogue of nearly identical unique Patterns.
- For instructional or reference Shows, isolate the concept being demonstrated. A transition catalogue should spend resources on transitions, not duplicate content Patterns merely to distinguish scenes.
- Repetition is not sameness. Establish a stable law, vary one or two legible dimensions, then use a rare exception for emphasis.

## Prototype the cost curve early

Measure before the complete Pattern or long Show hides the scaling behavior.

1. Compile the smallest representative unit: one Pattern, one Scene, or one transition.
2. Repeat the same unit several times and compare it with several varied units. Separate fixed cost from per-instance, per-boundary, and per-pixel growth.
3. Measure a representative peak where the most renderers, Effects, or transition sources are active.
4. Record source bytes, production artifact or Controller image bytes, globals and array words, active Pattern evaluations, render targets, and available runtime or hardware frame metrics.
5. If a cost grows unexpectedly, redesign the grammar or expose a compiler opportunity. Do not disguise structural duplication by merely shortening the presentation.

Use measurements to shape the concept. They are feedback about the available material, not a final compliance ceremony.

## Produce the Visual Performance Plan

Return the completed contract from [visual-performance-plan.md](references/visual-performance-plan.md). The plan must make these decisions explicit:

- the protected hero effect and its visual purchase;
- the cheap supporting grammar;
- shared versus independent Pattern identity and state;
- renderer and evaluation depth in steady state and at peaks;
- transition and scene-boundary strategy;
- source, artifact, global, array, render-target, and frame-time budgets;
- each expensive purchase and why it pays visible rent;
- the first measurement slice and full verification matrix;
- an ordered fallback ladder that preserves the premise as budgets tighten.

Pass the plan to `build-efficient-pxlblz-patterns` for a Pattern or to `compose-pxlblz-installation-shows` for an Installation Show. A strong plan does not prescribe every line of code; it protects the visual law and resource exchanges the implementation must prove.

