# Issue #452 SDF silhouette and hardware review

## Status

The headless shape model, persistence, compiler path, cost policy, and
deterministic fixtures are implemented. The user approved the common shapes,
polygons, and Cat head on 2026-07-14 after reviewing the actual engine metrics
at representative matrix resolutions. Side-profile cat and Bastet remain
implemented but provisional by explicit choice; neither blocks use of the
approved catalogue. The representative hardware gate passed on 2026-07-14.

This review is intentionally separate from the production picker and inspector
work in #457 and the final Feature Guide update in #460.

## Candidate construction

| Shape group | Cheap construction | Shape-specific controls |
| --- | --- | --- |
| Ellipse / Rounded box | Aspect-scaled radial norm; box/ellipse norm blend | Aspect, rotation, corner roundness |
| Cross | Union of horizontal and vertical rectangular norms | Aspect, rotation, arm width |
| Heart | Polar boundary from low-order trigonometric terms | Aspect, rotation |
| Star | Repeated angular sectors with alternating outer/inner radius | Points, inner radius, aspect, rotation |
| Crescent | Outer ellipse minus offset circular hole | Aspect, rotation, cutout offset |
| Regular polygon | Exact repeated-sector radial boundary | Sides 3-8, aspect, rotation |
| Cat head | Circular head with two narrow angular ear lobes | Aspect, rotation |
| Side-profile cat | Asymmetric head, tail, and leg angular lobes | Aspect, rotation |
| Bastet | Narrow seated body, broad base, and paired ear lobes | Aspect, rotation |

Every shape uses the shared Grow Incoming/Shrink Outgoing polarity and the
Hard/Stable dither/Blend edge contract.

## Measured artifact evidence

The deterministic catalogue contains 24 representative Heart, Star, Crescent,
Polygon, and signature-cat fixtures across both reveal modes.

- Artifact range: 8,246-8,680 bytes.
- Largest measured fixture: `shape-reveal-bastet-shrink-outgoing`, 8,680 bytes.
- Measured device budget: 68,384 bytes.
- Largest budget ratio: 12.693%.
- Hard and Stable dither evaluate one Pattern per output pixel (`N`).
- Blend evaluates a second Pattern only in the active edge band (`N + E`).

## Human silhouette review

The 2026-07-14 review approved Heart, Star, Crescent, polygons with three
through eight sides, and Cat head. The same SDF construction used by the
existing transitions is accepted for higher-resolution output.

Side-profile cat and Bastet did not read strongly enough at the reviewed low
resolutions. They remain available as provisional signature shapes so future
high-resolution and physical-Controller review can tune them without blocking
the rest of the catalogue.

The original review criteria remain the standard for future tuning:

Review both reveal modes at minimum on 16x16, 32x16, and 64x32 Stage maps.

- Cat head reads as a head with two ears, not a crown or generic star.
- Side-profile cat reads horizontally and remains asymmetric; head, tail, and
  legs must not collapse into an amorphous blob.
- Bastet reads vertically and seated; it must remain distinct from Cat head and
  Side-profile cat.
- Heart retains a bottom point and top cleft at low resolution.
- Crescent preserves a visible hole rather than becoming an offset oval.
- Polygon sides 3-8 remain distinguishable where the target resolution permits.

Parameter changes that alter persisted normalization or generated equations
require refreshed fixtures and compiler parity tests.

## Hardware review

The required matrix ran on a `pb32` Pixelblaze named Burner bag, firmware 3.67,
with a 256-point 2D map. Each generated Pattern was pushed run-only, confirmed
as the active program, allowed to settle for 500 ms, and sampled for 1,500 ms.

| Shape | Hard artifact | Hard FPS | Blend artifact | Blend FPS |
| --- | ---: | ---: | ---: | ---: |
| Bastet | 8,938 bytes | 53.38 | 9,575 bytes | 51.74 |
| Side-profile cat | 8,931 bytes | 51.86 | 9,568 bytes | 50.16 |
| Star | 8,510 bytes | 53.69 | 9,147 bytes | 52.76 |
| Crescent | 8,523 bytes | 54.30 | 9,160 bytes | 52.89 |
| Polygon, 8 sides | 8,565 bytes | 54.39 | 9,202 bytes | 52.54 |

Every probe compiled, became active, and returned usable telemetry. The full
frozen SDF matrix also passed both reveal polarities. The user accepted the
deterministic render as the visual reference before this run; the physical run
establishes compiler and performance viability, not a new anatomical judgment.
Side-profile cat and Bastet therefore remain provisional without blocking the
approved catalogue.
