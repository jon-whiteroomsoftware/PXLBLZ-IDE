# Pixelblaze Pattern Orchestration Software Ideas

## Purpose

Capture the reusable software ideas that came out of the Tazii exterior lighting project: pattern orchestration, non-destructive wrapping, transitions, semantic segment routing, and preview tooling for Pixelblaze projects.

This document is intentionally generic. The installation-specific build plan lives in [Tazii Exterior Lighting Concept](./tazii-exterior-lighting-concept.md).

## Prior Art and Gap

Pixelblaze already has several adjacent capabilities and community projects:

- The built-in Pixelblaze sequencer can run saved patterns on an interval, including playlist/shuffle behavior, but pattern changes are abrupt.
- Firestorm and Pixelblaze sync can coordinate multiple controllers and playlists.
- The WebSocket API and community clients can select patterns, set variables, and control devices externally.
- The forum threads "Sequences and Crossfading" and "Fade transitions" show recurring demand for smooth transitions.
- Jeff's "Music Sequencer / Choreography" pattern is a powerful in-pattern framework with pattern queues, timing helpers, beat callbacks, and phrase/measure/note timing.
- `jvyduna/pyblaze-sequencer` is an external Python/Google Sheets timecode sequencer that sends timed commands to one or more Pixelblazes.
- The Chromatik Pixelblaze plugin provides discovery and basic Pixelblaze control from a broader lighting platform.

The apparent gap is an ergonomic PXLBLZ layer that treats existing Pixelblaze patterns as composable source material, generates deployable Pixelblaze code, and gives users transitions, adaptation, routing, and preview without permanently forking third-party patterns.

## Core Direction

PXLBLZ should act as a pattern compositor/compiler, not only a pattern editor.

Pixelblaze patterns are often not written from scratch. A more useful workflow is:

- Import or reference an existing third-party pattern.
- Apply non-destructive adaptations.
- Bind physical controls.
- Route the pattern to named physical segments.
- Mirror, offset, palette-shift, mask, or post-process it.
- Compile or deploy the adapted result without permanently forking the original source.

The likely output is a generated Pixelblaze "show pattern" that contains multiple adapted pattern renderers and transition logic. This avoids relying on Pixelblaze's built-in pattern switching when smooth transitions are required.

## Non-Destructive Pattern Wrapping

One major PXLBLZ direction is deploy-time or compile-time wrapping of existing patterns.

Example ideas:

- Attach a physical potentiometer to a pattern variable without editing the original pattern.
- Add sensor or button behavior around a third-party pattern.
- Add palettes, brightness caps, or safety envelopes.
- Inject mapping helpers.
- Add transition hooks.
- Add output-zone routing.

The original pattern remains intact. PXLBLZ stores an adaptation recipe and generates deployable Pixelblaze code.

Conceptual example:

```ts
usePattern("community/fireflies")
  .bindPot("brightness", { pin: "A0", range: [0.1, 1.0] })
  .palette("moroccan-lantern")
  .to("arch-left")
  .mirrorTo("arch-right");
```

## Patterns as Clips

Another direction is treating patterns as animation clips rather than complete standalone programs.

Possible clip model:

```ts
clip("lantern-flicker", { duration: 30000 });
clip("zellij-drift", { duration: 45000 });
clip("oasis-wash", { duration: 60000 });
```

Possible sequencing model:

```ts
sequence()
  .play("lantern-flicker")
  .crossfade("zellij-drift", 8000)
  .overlay("sparkle-crown", { amount: 0.2 });
```

This would let an entire Pixelblaze pattern be the compiled output of a higher-level composition.

## Transitions

Transitions may be the first useful vertical slice because Pixelblaze's normal pattern switching does not provide smooth visual handoff.

Useful transition primitives:

- Fade out.
- Fade in.
- Crossfade.
- Wipe.
- Segment wipe.
- Radial or crown-point wipe.
- Palette fade.
- Brightness envelope.
- Delayed echo transition between high-resolution and low-resolution zones.

The important implementation detail is that a crossfade generally needs both source and destination renderers available in the same generated pattern. PXLBLZ can warn when a composition becomes too expensive for the target Pixelblaze.

## Segment Routing

PXLBLZ should understand named segments and zones, independent of physical output channel numbers.

Conceptual example:

```ts
pattern("aurora")
  .to("arch-left")
  .to("arch-right", { mirror: true, phase: 0.25 })
  .to("rock-zones", { sample: "low-res-wash" });
```

The creative model should speak in terms of semantic zones. A separate deployment model can assign those zones to Output Expander channels, pixel ranges, maps, or multiple Pixelblaze controllers.

## Mirroring and Phase Primitives

Reusable primitives:

- `mirror`
- `phaseOffset`
- `paletteOffset`
- `reverseDirection`
- `inward`
- `outward`
- `towardCrown`
- `fromCrown`
- `alternate`
- `delay`
- `echo`
- `crossfade`

Examples:

```ts
arch.left.run(zellijDrift);
arch.right.run(zellijDrift.mirror().phase(0.25));
```

```ts
arch.run(pulse.towardCrown());
rocks.run(pulse.blur().delay(500));
```

## Low-Resolution Wash Sampling

A high-resolution pattern should be able to drive lower-resolution physical zones in a coordinated way.

Possible transforms:

- `blur`
- `average`
- `sampleAtZoneCenter`
- `sampleVertical`
- `sampleArchBack`
- `brightnessEnvelope`
- `paletteSimplify`
- `lowResEcho`

This is a strong reusable idea: the same animation field can be sampled differently for strips, pods, panels, arches, or wash lights.

## Post-Processing Effects

PXLBLZ could support post-processing transforms around third-party patterns:

```ts
source("plasma")
  .posterize(5)
  .palette("tile-jewel")
  .mask("moroccan-stars")
  .brightnessEnvelope("breathing")
  .sparkle({ density: 0.03 });
```

Possible transforms:

- Palette substitution.
- Brightness caps.
- Gamma/contrast shaping.
- Posterization.
- Sparkle layers.
- Geometric masks.
- Stencil simulation.
- Segment-specific blur.
- Time warping.
- Phase offset.
- Color temperature adjustment.

This would allow third-party patterns to supply movement while PXLBLZ supplies theme, taste, mapping, and physical adaptation.

## Geometric Pattern Language

The Tazii project suggests a broader pattern language based on geometric fields:

- Repeating diamonds.
- Star lattices.
- Tile grids.
- Mirrored triangles.
- Arches and crown points.
- Radial or pseudo-radial symmetry.
- Slow shifting cell colors.

The important point is not that the physical LEDs form a high-resolution matrix. PXLBLZ can define abstract fields and sample them onto whatever geometry exists.

## API Inspiration

Useful prior API shapes to study:

- Remotion's sequence model: nested time ranges, explicit durations, and transitions.
- Tone.js Transport/Part/Event scheduling: a global clock with scheduled musical events.
- Strudel/Tidal-style notation: compact pattern language based on cycles, transformations, and composable expressions.
- Video editing timelines: clips, tracks, transitions, effects, and preview.
- Live lighting software: cue lists, scenes, chases, fixture groups, and overrides.

The PXLBLZ version should feel closer to "compose pattern clips and transformations" than "manually write one giant Pixelblaze pattern."

## Controls and Interaction

Possible reusable controls:

- Physical potentiometer binding.
- Button binding.
- Scene advance.
- Late-night dim mode.
- Ambient vs party mode.
- Sensor or microphone reactivity.
- Web UI controls through Pixelblaze or PXLBLZ.

The potentiometer-binding idea is especially important: PXLBLZ could wrap an existing pattern and bind a physical input to one of its variables without modifying the source pattern directly.

## Preview and Simulation

PXLBLZ could preview:

- Named segments.
- Mirrored halves.
- Low-resolution zones as blobs or wash cones.
- Stencil or mask overlays.
- Multiple output-channel assignments.
- Generated maps.
- Crossfades and wipes before deployment.

The preview does not need photorealism to be useful. It needs enough spatial truth to evaluate motion, symmetry, contrast, timing, and physical routing.

## Open Questions

- How should PXLBLZ represent physical outputs vs semantic segments?
- Should PXLBLZ generate Pixelblaze maps, wrapper code, or both?
- How should third-party pattern wrapping work?
- What is the minimal clip/sequencer model?
- How should repeated/mirrored segments be compiled?
- How should low-resolution wash zones sample detailed animation fields?
- How should Output Expander config be stored alongside PXLBLZ project config?
- How should PXLBLZ estimate generated pattern cost before deployment?
- What is the smallest useful transition system?

## Next Steps

- Define an initial semantic segment model.
- Prototype mirror, phase, and delayed wash primitives.
- Prototype a wrapper around an existing Pixelblaze pattern.
- Prototype a generated show pattern with two clips and a crossfade.
- Sketch a small Strudel-inspired composition syntax.
- Build a minimal preview that can show named zones and transitions.
