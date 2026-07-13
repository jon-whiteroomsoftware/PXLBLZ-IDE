# Show coordinate remapping design (#406)

## Decision summary

Show coordinate remapping changes the sample domain presented to every Pattern
without changing physical pixel ownership or preview geometry. The compiler
applies a Show-wide remap after routing has produced zone-local sample
coordinates and before renderer compatibility chooses or invokes `render`,
`render2D`, or `render3D`.

Two tracer candidates must be measured before product selection:

1. **Synchronized tiling** repeats the local domain with one shared continuous
   scale. It is the expected product slice because it needs one scalar, two
   multiplies, and two fractional-part operations per 2D pixel.
2. **Center rotation** rotates the local domain around `(0.5, 0.5)` and wraps at
   its edges. Sine and cosine are computed once per frame; each 2D pixel then
   needs four multiplies, four additions/subtractions, and two fractional-part
   operations.

The benchmark records generated source size and Fast/Precise emulator time for
both candidates at the same map size. The completed comparison selects
**synchronized tiling** for the product tracer. It adds 163 artifact bytes over
the fixture baseline, uses one scalar and no trigonometry, and performs two
multiplies plus two fractional-part operations per 2D pixel. Center rotation
adds 566 bytes, uses three scalars and two trigonometric calls per frame, and
roughly doubles the per-pixel coordinate arithmetic. Emulator timings showed no
candidate regression but were too JIT-sensitive to rank these small kernels;
the structural counts and physical hardware gate remain authoritative.

Measured comparison: [issue 406 coordinate-remapping results](issue-406-coordinate-remapping-results.md).

## Coordinate-space contract

The runtime pipeline is ordered and the names are not interchangeable:

1. The **Stage Map** supplies the hardware-real `sample` for a physical LED and
   independently supplies or participates in deriving preview `pos`.
2. The **routing layout** selects the semantic zone that owns that LED and may
   normalize the Stage sample into a zone-local sample.
3. **Coordinate remapping** transforms that local sample into the sample passed
   to the source Pattern.
4. Renderer compatibility adapts dimensions and calls the source Pattern.

Remapping never reads or writes `pos`, never reassigns a pixel to another zone,
and never changes a routing layout's local index or virtual `pixelCount`.
Zone-ignorant source Patterns require no edits because the generated outer
renderer changes only their arguments.

## Candidate semantics

### Synchronized tiling

The property is `repeatScale`, clamped to `1..8`. A value of `1` is an exact
identity. Other values use the half-open repeated domain:

```text
sampleX' = frac(clamp(sampleX, 0, 1) * repeatScale)
sampleY' = frac(clamp(sampleY, 0, 1) * repeatScale)
```

Integer values produce an exact grid of synchronized copies. Fractional values
move the repeat seam continuously and therefore remain meaningful during an
eased property transition. The transform is Show-wide: all active Patterns see
the same scale, including both sides of a spatial transition.

For a 1D output, normalized local index position is transformed by the same
equation and converted back to a bounded local index. A 2D source receives both
transformed coordinates. A 1D source on a 2D Stage receives the index derived by
the existing zone-local routing path; the remap then replaces that index from
the transformed local sample so dimensional fallback remains deterministic.
The first implementation does not expose a 3D control; a future 3D extension
must define whether Z repeats independently rather than silently guessing.

### Center rotation

The property is `rotationTurns`. The runtime computes sine and cosine once per
frame, rotates the sample around `(0.5, 0.5)`, then wraps both results with
`frac`. Zero turns is an exact identity branch. This candidate is visually
strong but has more per-pixel arithmetic and makes the rectangular-domain seam
more prominent.

## Authored property model

The destination scene owns the Show-wide target:

```ts
scene.sampleTargets.repeatScale
```

The incoming visual boundary owns the interpolation descriptor:

```ts
transition.propertyTransitions.sample.repeatScale = {
  from,
  durationMs,
  easing,
}
```

This is the same target/transition contract used by time scale, brightness,
controls, and moving split position. It introduces no transform-specific clock,
curve, keyframe, or top-level timeline. A nested Sample lane displays the scene
target and incoming ramp.

## Compiler and preview contract

The Show recipe contains one scalar initial value and ordered ramps. The
generated `beforeRender` evaluates the active scalar once per frame. The outer
renderer transforms the post-routing local sample and invokes exactly the same
one or two Pattern renderers already required by the visual transition policy.
Remapping never increases renderer count.

Show Stage preview continues to execute the generated artifact. Generated-code
inspection, EPE export, Controller send, Fast preview, and Precise preview
therefore use the same transform equation. Compile summary reports scalar
storage, per-pixel coordinate work, dimensional policy, and renderer delta.

## Validation and hardware gate

Automated coverage must include pure transforms and boundaries, normalization
and scene inheritance, boundary-owned easing persistence, 1D/2D fallback,
compiler source assertions and sampled runtime equivalence, editor smoke,
authenticated save/reload, narrow layout, and serious console errors.

Hardware review compiles and activates identity, static, and animated forms on a
physical Pixelblaze with representative 1D and 2D Patterns. It confirms visual
agreement and records FPS against the unmodified Show and the rejected
candidate. That physical gate remains open after automated implementation.
