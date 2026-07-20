# Issue 315: scope-aware Show merge design

Status: accepted historical design note, 2026-07-08; implemented by the Show
compiler slices that followed.

This note settled the Show compiler design choices used by #316 and later
slices to merge real patterns into one generated Pixelblaze artifact. The
current shipped compiler is documented in the PXLBLZ Technical Reference; this
file remains as rationale for the renaming, time, and control semantics.

## Inputs

- PRD source: `docs/plans/pxlblz-v2-prd.md` section 1.
- Performance source: `docs/plans/archive/issue-314-perf-harness-spikes.md`.
- Existing engine source: `src/engine/bundle.ts`, `src/engine/passEngine.ts`,
  `src/engine/loadPattern.ts`.
- Fixture validation: `src/engine/showMergeDesign.test.ts`.

The current pass engine already has scope-aware call-site traversal for output
interception, but it does not alpha-rename whole member patterns. Shows need a
new compile path that treats each clip/member pattern as a private module inside
one generated Pixelblaze pattern.

## Decision 1: rename member patterns as private modules

Each bundled member pattern is parsed independently, then rewritten under a
stable private prefix:

```text
__pxlblz_show_<memberKey>_<originalName>
```

`memberKey` is compiler-generated from the clip/member position or stable show
node id, sanitized to ASCII identifier characters. User source that already uses
the `__pxlblz_` prefix remains warning-worthy, matching the existing pass-engine
reserved-prefix behavior.

The renamer must build a lexical scope graph and rewrite only references that
resolve to top-level member bindings. It must not rewrite local variables,
parameters, or shadowed builtins. Top-level bindings include:

- `var` declarations
- function declarations
- exported vars
- exported control functions
- render functions: `beforeRender`, `render`, `render2D`, `render3D`

After rewriting, member exports become private implementation details. The final
generated artifact owns the only public `export` surface.

Example shape:

```js
var __pxlblz_show_c0_hue = 0.1
function __pxlblz_show_c0_beforeRender(delta) { ... }
function __pxlblz_show_c0_render(index) { ... }

export function beforeRender(delta) {
  __pxlblz_show_c0_beforeRender(delta)
}

export function render(index) {
  __pxlblz_show_c0_render(index)
}
```

## Decision 2: virtualize the builtins that define a member's world

Shows should transform what a pattern sees before transforming what it emits.
The member compiler therefore needs scope-aware rewrites for selected free
builtins, not just user declarations:

- `pixelCount` becomes the member's virtual pixel count for the target zone or
  virtual screen.
- `time(interval)` becomes a member-local virtual time helper.
- render entry arguments are supplied as zone-local index and coordinates by
  the show-level route/domain wrapper.

The v1 route shape is 1D: resolve physical index ranges to a zone-local
`index` and virtual `pixelCount`. Later 2D/3D route passes can supply zone-local
`x,y,z` coordinates over a pixel map using the same member-private render
function shape.

This is the cheap path for split screens, reverse, mirror, tile/repeat,
phase/offset, ping-pong, and zone-local rendering. Output interception remains
available for power/color clamps, but it is not the default for spatial
adaptation.

## Decision 3: inactive member clocks freeze

Each member has a private elapsed-time accumulator. A member's clock advances
only while that member participates in the current frame:

- steady state: only the active clip's `beforeRender` runs and only its elapsed
  time advances
- transition window: both participating clips' `beforeRender` functions run and
  both elapsed times advance
- outside active/transition windows: member state and member virtual time freeze
- pause/resume: no generated `beforeRender` call means no member time advances;
  resuming continues from the frozen state

There is no automatic state reset in v1. A clip that re-enters later resumes
from its frozen member state. Reset-on-entry can be added later as an explicit
clip adaptation if Shows need theatrical cue-style restarts.

`time(interval)` calls inside a member must use the member-local elapsed-time
helper so patterns using Pixelblaze's clock functions follow the same freeze
semantics as patterns that maintain their own `t += delta` variables.

## Decision 4: member controls are internal by default

Exported controls from member patterns are renamed to private functions. They
are not surfaced automatically on the generated Show artifact. This avoids:

- blowing past the measured exported-control ceiling
- exposing confusing duplicate controls from many clips
- making cheap parameter automation depend on device-visible controls

The Show compiler may call private renamed controls internally once per frame
for parameter automation. This is the cheapest mixin/adaptation lane identified
in the PRD.

Public controls on the generated Show are opt-in proxies:

```js
function __pxlblz_show_c0_sliderSpeed(v) { ... }

export function sliderLeadSpeed(v) {
  __pxlblz_show_c0_sliderSpeed(v)
}
```

Each public proxy counts against the exported-control budget. The #314 spike
observed 247 exported slider controls as the largest successful push and the
first failure at 248 controls on firmware 3.67, so the Show editor should keep a
conservative warning margin below that value. A practical v1 policy:

- expose no member controls by default
- expose Show-authored macro controls explicitly
- expose member controls only when the user pins/promotes them
- warn when generated public controls exceed 200
- block or require an override near the measured device ceiling

Exported member vars follow the same policy: private by default, public only
when the Show declares telemetry or a user-facing macro/readout.

## Compiler outline

1. Bundle each member pattern with existing library inlining.
2. Parse each bundled member as a module and collect top-level bindings,
   exported vars, exported controls, and render functions.
3. Build a lexical scope graph for the member.
4. Rewrite declarations and every reference that resolves to a renamed
   top-level binding.
5. Rewrite selected free builtins (`pixelCount`, `time`) to member-private
   virtual helpers where not shadowed.
6. Strip member `export` keywords.
7. Emit member-private prelude: virtual pixel count, elapsed time, optional
   route/domain helpers, and private render/control functions.
8. Emit show-level `beforeRender` scheduler:
   - advance the active clip only in steady state
   - advance both clips during transition windows
   - apply parameter automation by calling private controls/bind targets
9. Emit show-level render functions:
   - route physical pixels to zones/ranges
   - compute zone-local index/count and coordinates
   - call only the active member in steady state
   - call both members only where blending/transition requires it
10. Emit explicit public controls/telemetry and the transform summary.

## Validation fixtures

`src/engine/showMergeDesign.test.ts` validates the proposed generated shape
against the existing `loadPattern` preview emulator:

- renamed member globals remain independent while local shadowing remains local
- inactive member time bases freeze and transition participants both advance
- member controls are private unless exposed through explicit public proxies

These tests were intentionally not a production compiler. They were executable
fixtures for the design contract #316 implemented.

## Consequences for #316 and later

- #316 built the first real compiler path behind this contract, starting with
  two member patterns, one crossfade, and one zone.
- #317 used the virtual `index`/`pixelCount` path for cheap zone-local rendering
  rather than output interception.
- #318 surfaced artifact size and broad render-cost policy in the Show compile
  bar; richer parameter/domain/output/multi-render cost modeling remains a
  future maturity step.
- #319's power measurement/capping belongs in the output-interception tier and
  should remain opt-in/budget-visible.
