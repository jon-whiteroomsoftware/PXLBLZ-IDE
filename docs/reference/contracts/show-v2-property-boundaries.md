# Additive v2 authored Property boundaries

The [canonical specification](../../plans/scene-retirement-specification.md) §§6/7
assigns every exact authored key time to that key's value. A retained outgoing
`curveSegment` applies strictly after that key and before the next authored key.
Its source coefficients may disagree with either authored endpoint; complete
existing descriptor admission is unchanged. First, interior and last keys follow
one boundary rule. No sampled fit, epsilon boundary or evaluator domain narrowing
is introduced.

`evaluateShowPropertyKeysV2` and the existing compiler/internal
`evaluateShowPropertyTrack` return exact authored values before evaluating a
retained segment. `emitShowPropertyTrackExpression` applies the same rule to
interior descriptor keys; its existing first-key and last-key guards remain.
Member control/time-scale, opacity, View, Transform, Aperture and Effect bindings
consume that shared expression. Positive scalar descriptor ramps likewise use
`from` exactly at their start in the scalar baseline evaluator and the existing
Layout split-position/repeat-scale emitter channels. Zero-duration cuts,
activation, existing endpoint clamping, restoration precedence and ordinary ramps
retain their existing behavior.

## Hold diagnosis and preservation

The observed Group/Insert Time projection symptom originated in the wrong exact
key value. It was used as the synthetic hold seed, changing the preceding ordinary
endpoint and interpolating toward the shifted authored resume. Correcting equality
makes the existing hold seed and resume values equal. The existing linear hold
interval is therefore exactly constant; no additional hold/incoming descriptor
or new mapping branch is required. Original incoming descriptors, ordinary
endpoints and shifted authored resume IDs/values/descriptors remain unchanged.
Repeated exact/inside holds and repeated restriction compose the existing source
offset rather than fitting a new curve. Runtime identity, advancement and authored
Continue/Restart policies are unchanged; holding does not add a reset.

## Bytes and consumer evidence

Descriptor-free expression strings and ordinary exact-key held expressions remain
byte-identical to their independently authored ordinary oracles. The compiler
change consists of two descriptor-only literal expressions; every other byte,
including its existing embedded NUL, is preserved. The unchanged 47-record source
parity corpus requires no hash update or waiver. Descriptor-bearing generated
expressions intentionally change to implement the existing exact-key contract.
Persisted authored data and descriptor coefficients are not rewritten.

[The boundary packet](../evidence/issue-1038-property-boundaries/test-design.json)
links fine before/at/after evaluator and emitted-expression formulas, first/interior/
last/before-first keys, incoming/outgoing discontinuities, repeated holds/restriction,
ordinary expression bytes, scalar baseline and actual native `.epe` reopening.
All nine target families compare delivered Fast/Precise frames and nonempty Pattern
state with independently authored descriptor-free exact checkpoint choreography.
Two linked held Groups additionally cover shared elapsed/PRNG/control state and
both Continue and full Restart. Exact binary coefficients/checkpoints make those
125ms comparisons exact; they do not claim arbitrary-ms Precise state.

The independent static-scalar native oracle has a different prior routing history.
Its state comparison excludes only routed render-capture scratch channels and
compares every other exported field, including Pattern elapsed, runtime clock,
PRNG, authored controls and adapter state; delivered frames are separately exact. The nine-family checkpoint choreography has the same
history and compares every exported value. Existing source/compiler eligibility,
scalar range policies, schema, renderer and runtime behavior remain unchanged.
