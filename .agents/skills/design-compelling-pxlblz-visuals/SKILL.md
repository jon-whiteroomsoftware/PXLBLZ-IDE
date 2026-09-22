---
name: design-compelling-pxlblz-visuals
description: Define, critique, and refine compelling visual language for PXLBLZ Patterns and Shows independently of topology or implementation. Use when creating a Pattern concept, Portable Show, Installation Show, palette, motion grammar, or rhythmic intensity arc; when work feels generic, rainbow-heavy, flat, repetitive, or technically impressive but visually weak; or when another skill needs a reusable aesthetic brief before engineering. Produce a Visual Direction Packet that Pattern- and Show-building skills can consume.
---

# Design Compelling PXLBLZ Visuals

Design the visual system before choosing its implementation. Give the work a recognizable premise, a short graphic vocabulary, authored time structure, and enough restraint that every escalation reads.

## Load the doctrine

- Always read [impact-rubric.md](references/impact-rubric.md) before proposing or judging a direction.
- Read [palette-doctrine.md](references/palette-doctrine.md) before choosing color roles.
- Read [temporal-composition.md](references/temporal-composition.md) for animated Patterns or any Show-length score.

## Produce a Visual Direction Packet

1. State the audience, context, desired feeling, duration, and reason the piece exists. Distinguish an ambient work, a daily-use Pattern, and an aspirational sizzle reel.
2. Write one governing premise. It must describe the visual law rather than list effects: for example, "a red signal machine accumulates pressure in discrete blocks, evacuates into cyan silence, then locks into white impact."
3. Choose a short graphic grammar. Name the dominant silhouette, two or three supporting primitives, texture policy, edge character, and whether glyphs or text belong. Prefer bold fields, blocks, rails, targets, stripes, masks, and negative space over equal-weight detail.
4. Establish hierarchy. Identify the hero voice, supporting voices, background, void, and punctuation. A viewer should know where to look in one second.
5. Assign palette roles rather than collecting colors. Treat black as space and white as impact. Choose one or two main hues and, when useful, one temporary intruder palette that changes the structure and then leaves.
6. Choose two to four motion verbs, such as lock, march, fold, shear, orbit, shutter, accumulate, fracture, or answer. Reuse them at different scales instead of adding unrelated motion techniques.
7. Score nested time. Define the smallest pulse, development unit, phrase or section changes, and full arc. Use discrete stair steps for accumulation and subtraction. A long piece must change its governing system, not merely let parameters drift.
8. Define repetition with difference. State what remains invariant and which small variables may change: mirror, direction, scale, phase, density, mask, timing, ownership, or palette role.
9. Specify ordinary frames and accents separately. The work must read between hits; strobe, white, and peak brightness may punctuate structure but cannot substitute for it.
10. Record the intended release. Decide what disappears, relaxes, returns, or remains unresolved after the peak.

Return a compact packet with these fields:

- intent and audience;
- governing premise;
- graphic grammar and hierarchy;
- palette roles;
- motion verbs;
- timing hierarchy and phrase arc;
- invariants and permitted variations;
- signature ordinary frames and impact moments;
- restraint rules and known failure modes.

Do not begin code until the packet is coherent enough that another agent could recognize an off-brief result.

## Apply the ruthless aesthetic review

Reject or revise the direction when any answer is weak:

- Can the premise be recognized from one representative frame?
- Is there one dominant visual law rather than a catalogue of techniques?
- Does black create shape, separation, anticipation, or rest?
- Is white scarce enough to mean impact?
- Do the main colors have distinct jobs?
- Does repetition create identity while limited differences create development?
- Does every major section change hierarchy, ownership, density, motion law, or palette role rather than merely texture?
- Does the piece remain compelling with strobe disabled and intensity reduced?
- Is there a memorable unfamiliar turn inside a coherent familiar system?
- Could a viewer describe the piece afterward without saying only "colorful lights"?

Use the scored rubric in the reference to diagnose the weakest dimension. Repair the governing system before polishing local detail.

## Preserve the boundary

Keep this skill topology- and implementation-independent. Do not choose map coordinates, Zone ranges, pixel counts, renderer architecture, or device budgets here. Pass the Visual Direction Packet to `co-design-pxlblz-visual-performance`, which will preserve the aesthetic law while selecting a resource strategy. That Visual Performance Plan then feeds `build-efficient-pxlblz-patterns` or `compose-pxlblz-installation-shows` without moving hardware concerns back into this skill.
