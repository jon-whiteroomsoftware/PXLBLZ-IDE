# PXLBLZ v2 — Remaining Product Work

This document is the forward-looking product plan for the current development
line. It deliberately excludes shipped behavior; the Feature Guide and Technical
Reference own current truth, while archived plans retain completed research and
implementation history.

The stable v1 release remains pinned by tag and maintenance branch. Mainline
reference docs describe current development. `README.md` is the public repository
entry point and must not be changed as routine documentation maintenance; any
edit requires explicit owner review first.

## 1. Current product position

The major v2 foundations are built:

- public Gallery and authenticated six-entity Studio;
- cloud personal content and multi-provider identity;
- Pattern, map, mixin, and library authoring;
- hardware-faithful Fast/Precise preview;
- optional multi-Controller connection through the Chrome extension;
- durable Controller profiles, inputs, bindings, transforms, zones, saved-program
  inventory, read-back, and import;
- first-class 1D/2D/3D maps, geometry families, coordinate views, and
  cross-dimensional renderer adaptation;
- one generated-artifact/pass-engine pipeline with provenance; and
- Show composition with a proportional timeline, transport, seeking, Split,
  Continue/Restart, boundary transitions, property automation, routing layouts,
  Stage preview, Controller push, and EPE export.

These are not roadmap items. Open implementation tickets for completed work may
remain open only as review state; they should not be read as unimplemented scope.

## 2. Review and issue-hygiene queue

Several completed arcs are intentionally open for human review rather than
future implementation:

- #413 and #415-#421 — Show timeline and accurate transport;
- #397 and #403-#406/#408 — routing, spatial effects, remapping, and their
  remaining physical visual/FPS checks;
- #434-#439 and #340 — Show output contracts, guided creation, Installation and
  Portable enforcement, artifact round-trip, legacy classification, keyboard
  flow, and spatial zone selection;
- #401/#402 — catalog Show artifacts and physical/visual review;
- #388 — map geometry/coordinate-space epic whose implementation children have
  landed; and
- hardware-facing items whose software is complete but whose final physical
  confirmation remains open.

Review should either close these issues or record a specific follow-up. Avoid
leaving completed epics looking like active dependency roots.

Known issue cleanup:

- #390 is superseded by #397/#398 and has no distinct remaining slice.
- #278 has no reliable original intent and needs clarification before work.
- #357 (README update) is owner-controlled and must not be picked up without
  explicit approval.
- #276, #296, #381, #382, and #384 need product triage before they enter
  sequencing.

## 3. Shows: next product step

The second Show implementation round is software-complete and awaiting human
review. It shipped Installation and Portable 2D output contracts, guided creation,
coverage and compatibility gates, artifact round-trip, legacy classification,
keyboard authoring, and spatial Installation-zone selection (#434-#439 and
#340). Current behavior belongs in the Feature Guide and Technical Reference;
the completed decisions and delivery slices remain in the
[archived output-contract plan](archive/show-output-contracts.md).

The next independent Show product step is the paired educational progression in
#363. Each contract needs examples that teach its distinct routing vocabulary
through the real create, inspect, export, and Controller-check paths. Example
content must not reopen the contract model or create a second authoring path.

## 4. Show directions that need more evidence

These are recorded product directions, not permission to implement an
undifferentiated “effects system.”

### Masks and negative-cost adaptations

- spatial shutters, checker/Bayer masks, deterministic sparkle, and distributed
  density masks;
- decimation, interlacing, per-clip frame caps, frozen-zone buffers, snapshot
  crossfades, and trails; and
- sparse overlays costed by active coverage rather than mere presence.

Buffered effects trade arrays for renderer work and therefore wait for a
multi-axis cost model covering cycles, permanent memory, code size, and exported
control pressure.

### Modulation

- clip-relative progress and entry/exit envelopes;
- LFO, drift, sample-and-hold, and Show-wide buses;
- time-of-day and night-mode scheduling;
- audio, FFT, beat, accelerometer, and light sources; and
- cross-Pattern modulation through alpha-renamed member state.

Audio/sensor work requires real hardware evidence. Keep a modulation-source seam
but do not task UI/runtime behavior that cannot be validated.

### Output adaptation

A unified final-output pipeline could fuse brightness, color, calibration, and
power work. It needs an explicit policy for `paint()` and library abstractions
before replacing current narrow intercept passes.

Perceptual duty shaping—highlight compression, common-white reduction, or
well-distributed density reduction—is optional appearance/efficiency behavior,
not a more accurate electrical claim and not a replacement for the duty cap.

### Composition language

The current durable authoring model is the Show record edited through the
timeline. A fluent/Strudel-style composition DSL, geometric Pattern language,
and cross-Pattern routing remain later research. Do not create a second source of
truth for ordinary Show editing.

## 5. Controller and hardware residuals

### Required physical validation

- #289 — analog potentiometer behavior after rewiring to an ADC1-safe input;
- #319 — sensor-pulse and night-scheduler mixins when suitable sensor/time
  hardware is available; and
- #336 — final zone-spanning/ramp behavior on representative hardware.

These are evidence gates around shipped software seams, not invitations to
redesign the pass engine or Show model.

### Product follow-ups

- Investigate the reported auto-reconnect-on-power-up problem (#386) through a
  disciplined reproduction before changing reconnect policy.
- Decide whether Controller-side automatic Pattern management (#387) is product
  scope or belongs in the Pixelblaze UI. Current behavior is intentionally
  read/import plus explicit Run/Save, not full playlist management.
- Complete anti-griefing/rate-limit policy for public API and D1 mutation paths
  (#407) before broader public exposure increases write volume.

## 6. Maps and geometry later directions

The coordinate-space overhaul is complete enough to use. Future additions
should be driven by Patterns or physical installations, not catalogue symmetry.

Candidates:

- Torus, Cone, Helix, or another generated Path/Surface with a real use case;
- Cylinder volume when an actual installation justifies its distribution and
  wiring rules;
- assisted fitting/unwrapping of imported point clouds, always explicit about
  axis, origin, topology, and seam; and
- manual renderer override only if multi-renderer Patterns become common enough
  that firmware preference is insufficient.

Do not infer topology or coordinate views from arbitrary imported coordinates.

## 7. Content, onboarding, and release work

### Content

- Build paired flagship and educational Show progressions (#363). Both output
  contracts now run through the real editor; each track should advance from one
  simple Show to an example that uses its distinctive routing vocabulary.
- Add flagship Patterns (#382) only when they broaden the visual vocabulary or
  teach a reusable technique; raw count is not the goal.
- Create small example personal entities (#360) only if they clarify the
  personal/stock distinction without becoming undeletable seed clutter.

### Product polish

- About-page scope and location need triage (#296).
- Hover-icon work (#361) should follow one accessibility vocabulary and avoid
  replacing visible primary actions with mystery meat.
- Documentation visualization work should add diagrams only where a relationship
  is materially easier to understand than prose.

### Public entry point

The stable v1 README links intentionally target the `v1.0.0` documentation tag,
and the stable Pages deployment follows `v1-maintenance`. Mainline documentation
may continue evolving independently. Any README/public-cutover change is a
separate owner-approved action, not part of ordinary documentation cleanup.

## 8. Cost model requirements

Future Show and pass-engine work should report separate axes:

1. **CPU** — per-frame, per-pixel, per-output-call, and renderer-count work;
2. **memory** — scalar globals, array count/elements, and retained buffers;
3. **code size** — generated source, device bytecode, and control/export pressure;
4. **coverage** — active fraction for masks or sparse effects; and
5. **compatibility** — map dimension, topology, firmware, and Controller target.

BeforeRender hoisting should receive credit. Negative-cost effects should report
what Pattern work they avoid while acknowledging outer render and LED transport
that remain. A broad “cheap/expensive” label is useful UI shorthand, not the
underlying model.

## 9. Sequencing

Keep each increment independently reviewable and leave the app shippable:

1. Review and close the software-complete Show output-contract issues
   (#434-#439 and #340), recording specific follow-ups instead of retaining
   completed scope as roadmap work.
2. Build the paired educational Show progressions (#363).
3. Run hardware validation (#289/#319/#336) when the physical setup is ready,
   and continue independent rate-limiting/public-release work (#407).

Do not begin caching, downsampling, replay checkpoints, or worker infrastructure
for Show seeking without real editor evidence. The direct deterministic replay
path remains the baseline and fallback.

## 10. Design and evidence artifacts

- `docs/plans/show-timeline-overhaul-mockup.html` — canonical timeline design
  artifact; the current editor implements its proportional grid, headers,
  transport, automation lanes, and navigator direction.
- `docs/plans/shows-editor-overhaul-mockup.html` — earlier scene-strip baseline,
  retained for design history rather than current interaction authority.
- `docs/plans/archive/show-output-contracts.md` — completed second-round Show
  product contract, creation flow, validation model, and delivery slices.
- `docs/plans/show-output-contracts-mockup.html` — approved compact comparison
  and setup-flow artifact for the second-round New Show experience.
- `docs/plans/archive/` — completed hardware/performance research, catalog Show
  results, and replay decisions. Reference docs state the resulting rule; these
  reports retain the measurements.

## 11. Explicitly out of scope

- Automated GLSL-to-Pixelblaze translation.
- General Controller settings administration from PXLBLZ.
- Continuous synchronization of hardware controls into preview controls.
- Public publishing of personal Patterns.
- Multi-Controller synchronized Shows.
- A second Show animation/keyframe system beside boundary-owned property
  transitions.
