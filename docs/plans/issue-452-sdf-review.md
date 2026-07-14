# Issue #452 SDF silhouette and hardware review

## Status

The headless shape model, persistence, compiler path, cost policy, and
deterministic fixtures are implemented. The common shapes are mechanically
verifiable. Cat head, Side-profile cat, and Bastet remain candidate silhouettes
until a person approves them at representative LED resolutions. Hardware FPS is
also unmeasured.

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

Review both reveal modes at minimum on 16x16, 32x16, and 64x32 Stage maps.

- Cat head reads as a head with two ears, not a crown or generic star.
- Side-profile cat reads horizontally and remains asymmetric; head, tail, and
  legs must not collapse into an amorphous blob.
- Bastet reads vertically and seated; it must remain distinct from Cat head and
  Side-profile cat.
- Heart retains a bottom point and top cleft at low resolution.
- Crescent preserves a visible hole rather than becoming an offset oval.
- Polygon sides 3-8 remain distinguishable where the target resolution permits.

Record approval or requested parameter changes on #452. Parameter changes that
alter persisted normalization or generated equations require refreshed fixtures
and compiler parity tests.

## Hardware review

Run representative fixtures on the target Pixelblaze class and record pixel
count, map dimensions, frame rate, and edge policy. At minimum, measure Bastet,
Side-profile cat, Star, Crescent, and an eight-sided Polygon under Hard and
Blend. Hardware approval remains open until those measurements are attached to
#452.
