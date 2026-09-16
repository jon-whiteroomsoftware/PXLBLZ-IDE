# Additive v2 authored Property boundaries

The [canonical specification](../../plans/scene-retirement-specification.md) §§6/7
assigns an exact retained `curveSegment` key time to that key's authored value.
The outgoing descriptor applies strictly after that key and before the next key.
Its source coefficients may disagree with either authored endpoint; complete
existing descriptor admission is unchanged. First and last endpoint guards remain.
Ordinary descriptor-free discontinuities retain the historical evaluator choice:
an interior exact key evaluates its outgoing easing at progress zero. For example,
steps/start and hold/at-zero can differ from the raw key value at that boundary.
No sampled fit, epsilon boundary or evaluator domain narrowing is introduced.

`evaluateShowPropertyKeysV2` and the compiler/internal `evaluateShowPropertyTrack`
apply exact authored equality only to retained descriptors. The existing emitted
expression, scalar baseline evaluator and Layout split-position/repeat-scale
emitter descriptor branches use the same retained-boundary rule. Ordinary direct
emission is unchanged. Member control/time-scale, opacity, View, Transform,
Aperture and Effect bindings consume the shared expression. Zero-duration cuts,
activation, endpoint clamping and restoration precedence retain their behavior.

## Lossless hold and restriction

A hold evaluates the original track at its insertion point, keeps that value for
the inserted duration, then resumes the original curve. Retained descriptor keys
and ordinary continuous keys already produce equal hold and resume values and
keep their existing representation. For an ordinary interior discontinuity whose
original evaluated boundary differs from its raw key value, the incoming kernel
is retained exactly and the synthetic hold uses a constant outgoing descriptor.
The shifted ordinary resume preserves its ID, raw value and outgoing easing.

Converting an ordinary outgoing kernel to a retained descriptor stores its original
evaluated boundary value. If that changes the preceding endpoint, the original
incoming kernel is retained too; this composes through preceding ordinary keys
without approximating their curves. Existing descriptors remain exact.

If a new preceding hold/restriction carrier makes an original first key interior,
its historical first-key guard is preserved with its original outgoing retained
kernel only when the outgoing easing would otherwise jump at that boundary.
Restriction likewise stores the original evaluated value when an ordinary
interior key becomes the new first or final endpoint. Its original outgoing
kernel remains exact; discarded keys are not restored. Repeated holds and
restrictions compose existing source offsets. Holding adds no runtime or reset;
Continue/Restart policies and normal Pattern advancement remain unchanged.

## Bytes and consumer evidence

Descriptor-free direct expression strings and ordinary coherent exact-key held
expressions remain byte-identical. The original descriptor emitter repair changed
two descriptor-only literal expressions; the ordinary compatibility corrective
makes no compiler changes. The unchanged 47-record source parity corpus requires
no hash update or waiver. Lossless transforms intentionally introduce retained
metadata only where a boundary ownership change otherwise loses original values.

[The retained-boundary packet](../evidence/issue-1038-property-boundaries/test-design.json)
qualifies descriptor endpoints/interiors, incoming/outgoing discontinuities, scalar
baselines and native reopened `.epe` artifacts. Its original blanket equality
claim is superseded by this ordinary compatibility distinction.

[The ordinary-boundary corrective packet](../evidence/issue-1038-property-ordinary-boundary/test-design.json)
qualifies historical steps/start and hold/at-zero boundaries, unequal exact-key
holds, inside-kernel holds, endpoint conversion, preceding kernel retention,
repeated holds/restrictions and first-key carrier changes. Native Fast/Precise
reopened artifacts cover Insert Time across all nine target forms and linked held
Groups with both Continue and Restart, comparing delivered frames and every
exported Pattern state field against independent exact checkpoint choreography.
Those comparisons use exact binary values and 125ms steps; fine evaluator and
expression probes independently cover millisecond boundaries. They do not claim
arbitrary-ms Precise state. Existing source/compiler eligibility, scalar range,
schema, renderer and runtime behavior remain unchanged.
