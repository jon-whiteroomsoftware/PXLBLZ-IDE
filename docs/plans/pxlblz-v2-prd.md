# PXLBLZ v2 release plan

PXLBLZ v2 is feature-complete at the platform level. The remaining release work
is a short queue of product affordances, content review, launch preparation, and
known defects. Current behavior belongs in the Feature Guide and Technical
Reference; this document names only work that has not yet shipped or has not yet
passed its human release gate.

The stable v1 release remains pinned by tag and maintenance branch. Mainline
documentation describes the v2 development line. `README.md` now describes the
v2 product as the public entry point; publishing it to the default branch and
clearing the invite-only Studio access gate remain one owner-controlled
release action, and the README carries an explicit invite-only caveat until
that gate clears.

## Product position

The v2 foundation is built:

- a public Gallery plus an authenticated, cloud-backed Studio;
- Pattern, map, Mixin, Library, Show, and Controller-profile authoring;
- recursive personal folders, manual ordering, recovery through Trash, and
  immutable Built-in definitions with session-editable Show drafts;
- Fast and Precise preview across 1D, 2D, and 3D maps;
- reusable Libraries with dependency pruning and optional call-site inlining;
- optional live Controller access through the Chrome extension;
- generated Pattern and Show artifacts with provenance, attribution, output
  contracts, inspection, export, Run, Save, and recovery;
- a proportional Show timeline with direct Clips on Layers and Zones, linked
  Groups, changing Zone Layout intervals, Property animation, Clip Transform
  and Viewport, presentation modes, literal Transitions, global timing tools,
  deterministic seeking, and Stage preview; and
- a measured Show compiler with compact score and plan representations, exact
  resource disclosure, a shared three-plane render-target arena, and a supported
  output envelope of at most 2,000 pixels.

These are current product facts, not roadmap promises. The
[Feature Guide](../reference/PXLBLZ%20Feature%20Guide.md),
[Technical Reference](../reference/PXLBLZ%20Technical%20Reference.md), and
[Show Rendering Optimization Results](../reference/Show%20Rendering%20Optimization%20Results.md)
own the durable explanation.

## Remaining v2 release work

GitHub Issues is the executable source of truth. This section is a product-level
release map, not a second issue tracker.

### Small product capabilities

- **Show inputs and output controls (#522).** A compiled Show should accept the
  intended user inputs and expose useful output sliders without weakening its
  ordinary Pixelblaze artifact contract.

### Content and human review

- **Show curriculum (#363).** The seventeen-lesson Learn course (100–106,
  201–207, 301–303) and the rebuilt reference Showcases are implemented and
  landed. What remains is release review: fresh Redline review, captures, and
  normal-speed human review of the complete catalogue before publication
  approval.
- **Visual-toolkit review (#442 and #460).** The engine and production UI are
  implemented. These issues remain human review of naming, examples,
  screenshots, and explanatory copy rather than open technical architecture.

The active catalogue brief remains
[`stock-show-catalogue-build-packet.md`](stock-show-catalogue-build-packet.md),
which owns the approved lesson sequence, fixture direction, migration map, and
review gates. The completed Show-editor, toolkit, and Scene-composition designs
are retained under [`archive/`](archive/) as rationale and evidence.

### Launch and operations

- **Final public documentation and README cutover (#357).** Review tone, links,
  screenshots, and the public entry point only when the v2 deployment is ready
  to replace v1. Routine doc sweeps must not make that cutover implicitly.
- **Go-to-market work (#362).** Prepare the community introduction and release
  assets. [`community-introduction.md`](community-introduction.md) owns the
  current narrative and capture plan.
- **Bug and polish intake (#63).** Only concrete v2 regressions or release polish
  belong in the omnibus issue; product additions should retain their own issue.

## Definition of v2 release-ready

The release is ready when all of the following are true:

1. The remaining v2 capability issues are complete or explicitly deferred by the
   owner.
2. The current Built-in catalogue has passed visual and editorial review.
3. Gallery, Studio, authentication, persistence, docs, Pattern detail, preview,
   Show compile/export, and Controller Run/Save pass the production smoke path.
4. The privacy page, account-data contact path, and production analytics
   configuration match the deployed service.
5. No known bug risks silent loss of personal content or an unsafe Controller
   replacement.
6. The Feature Guide and Technical Reference describe the shipped build, and the
   README cutover has received explicit owner approval.

The full Vitest and Playwright publication gate remains the mechanical release
check. Hardware evidence is required only for a change that affects Controller
execution, transport, firmware compatibility, or a claim based on physical FPS.

## Deferred product work

Deferred work stays outside the v2 acceptance boundary even when it is valuable.
Milestones and issue bodies remain authoritative if this summary drifts.

### v2.1

- compositional primitive Pattern library (#501);
- deeper saved-program and Controller-storage management (#485);
- hidden diagnostic Patterns for mapping, hardware, and Show debugging (#481);
- broader help strategy (#423); and
- hardware-validated sensor and scheduler Mixins (#319).

### v3 and research

- trustworthy account metrics beyond the shipped privacy page and coarse GA4
  integration (#500);
- simulated audio inputs and beat-synchronous Shows (#475);
- AI Show direction and evolving showcraft (#441); and
- the WLED matrix direction in
  [`wled-matrix-integration-prd-draft.md`](wled-matrix-integration-prd-draft.md).

None of these should reopen the v2 Show model, generated-artifact contract, or
2,000-pixel support envelope without a new measured design decision.

## Product boundaries that remain intentional

PXLBLZ is a specialist authoring tool, not a replacement for Pixelblaze device
administration. The following boundaries remain deliberate:

- A Show saves choreography but compiles into one ordinary Pixelblaze Pattern.
- Personal content is durable in authenticated D1 storage; the browser stores
  only small session and device preferences.
- Gallery content is Built-in and public. Personal Patterns are not published.
- Controller access is optional and local. The hosted service does not proxy LED
  traffic.
- Preview presentation settings do not silently ride along with hardware output.
- Portable Shows target compatible 2D surfaces; Installation Shows target one
  fixed map and pixel count.
- The Show editor has one direct timeline. The persisted composition and
  compiler may retain internal Scene partitions for compatibility and lowering,
  but they never create a Scene-local authoring scope. Recursive timelines are
  outside the current model.
- Property animation is the one numeric property-over-time mechanism.
- Effects change one source; Transitions combine boundary sources; routing assigns
  zones. The UI and persistence model keep those owners distinct.
- Generated cost and compatibility claims come from the compiler and measured
  hardware evidence, not hand-maintained menu labels.

## Documentation ownership

- `CONTEXT.md` defines canonical product language and conceptual boundaries.
- `docs/reference/` explains as-built user and technical behavior.
- `docs/guides/` teaches focused workflows and visual practice.
- `docs/plans/` contains only active release, content, research, and future
  product direction.
- `docs/plans/archive/` preserves completed decisions, spikes, measurements, and
  mockups without making them look like unimplemented scope.
- GitHub Issues owns implementation state, review gates, verification, and
  remaining work.

The public v1 README intentionally follows a different cadence. Updating it is a
release action, not documentation housekeeping.
