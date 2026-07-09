# Speculative PRD: Portable LED Pattern Lab for WLED-class Controllers

Status: speculative idea capture, 2026-07-09. This is not approved scope, not a
build plan, and not part of the PXLBLZ v2 remaining-work PRD. It records a
possible future direction discussed while comparing Pixelblaze, WLED, shader
authoring, spatial maps, and low-cost LED orchestration.

The current product priority remains finishing the next PXLBLZ v2 release. This
document exists so the ideas are not lost and so future work can evaluate them
without treating them as committed.

## Problem Statement

PXLBLZ is being built around Pixelblaze because Pixelblaze has a strong creative
coding model: readable pattern source, live-editable behavior, exported
controls, and a clean map abstraction that decouples physical wiring from the
space a pattern renders into.

The constraint is audience size. The Pixelblaze user base is small compared with
the broader WLED ecosystem. WLED has a large hardware footprint, active
community, many integrations, and good support for inexpensive ESP-based LED
controllers. But WLED's custom pattern authoring path is much less accessible:
stock WLED is primarily operated through effects, segments, presets, palettes,
playlists, APIs, and realtime streaming. Writing new onboard effects generally
means C++ firmware work, usermods, compilation, flashing, and hardware-specific
support.

There may be an opportunity to bring the strongest parts of the Pixelblaze
authoring model to WLED-class controllers without making WLED users write C++ or
flash custom firmware.

## Opportunity

The broad opportunity is not simply "run Pixelblaze patterns on WLED." That is
one compatibility path, but it is too narrow to be the whole product thesis.

The stronger opportunity is a portable LED pattern lab:

- a creative authoring environment for generative LED patterns
- a canonical spatial map model for 1D, 2D, 3D, and irregular installations
- a preview pipeline that uses the same map model as output
- one or more output backends, including Pixelblaze and stock WLED devices
- WLED support first through realtime streaming protocols, not custom firmware
- possible later export paths for WLED firmware effects or usermods

In this model, WLED is initially treated as a cheap, networked LED endpoint. The
IDE owns the creative runtime, spatial map, orchestration model, and preview.
WLED handles LED output, device networking, hardware compatibility, power
settings, segments, and existing integrations.

## Why WLED Is Interesting

WLED appears to have captured much of the low-cost hobbyist and installation
controller market that might otherwise have considered Pixelblaze. It has:

- broad ESP32/ESP8266 hardware support
- stock effects, palettes, segments, presets, and playlists
- JSON, WebSocket, MQTT, UDP realtime, DDP, E1.31, and Art-Net integration paths
- multi-output and virtual LED workflows
- wide compatibility with Home Assistant, Node-RED, LedFX, Hyperion, xLights,
  FPP-style show systems, and other LED tooling
- a much larger reachable audience than Pixelblaze alone

The weakness is that WLED's authoring model is not equivalent to Pixelblaze's.
It is excellent as a controller and integration endpoint, but less elegant as a
runtime for user-written generative patterns.

## Core Product Thesis

If PXLBLZ eventually expands beyond Pixelblaze, the valuable abstraction is not
"Pixelblaze compatibility." The valuable abstraction is:

> Author expressive spatial LED patterns once, preview them honestly, map them
> to real installations, and drive whatever LED backend the user already owns.

Pixelblaze is one backend. WLED can be another. Future backends could include
DDP receivers, Art-Net nodes, E1.31 universes, FPP/xLights workflows, browser
preview-only installations, or custom hardware.

## Candidate Authoring Modes

### Pixelblaze-like scripting

Keep the spirit of Pixelblaze's model:

- `beforeRender`
- `render(index)`
- `render2D(index, x, y)`
- `render3D(index, x, y, z)`
- exported controls
- palettes and color helpers
- time helpers
- source-level inspectability
- preview/device parity where feasible

This is the most natural bridge from the current PXLBLZ architecture.

### Shader-style authoring

Explore a Shadertoy-inspired mode where a pattern is treated as a function of
position, time, and uniforms:

```glsl
color = f(position, time, uniforms)
```

The practical first implementation would not run GLSL on WLED firmware. Instead,
the IDE or host app renders/evaluates the shader externally, samples the result
at LED coordinates, and streams pixels to WLED.

This could open access to a much larger body of shader-inspired pattern work
than the Pixelblaze pattern ecosystem provides. The useful subset is likely
position/time/uniform-driven shaders, not arbitrary GPU programs that depend on
multi-pass buffers, feedback textures, derivatives, or high-resolution parallel
GPU assumptions.

### Imported Pixelblaze patterns

Existing Pixelblaze patterns may still be valuable, but the ecosystem is not
large enough to make exact compatibility the core market requirement. A future
translator could support a useful subset of Pixelblaze syntax and builtins.

This should be considered a compatibility accelerator, not the product center.

## WLED Output Strategies

### Strategy 1: Stock WLED realtime streaming

This is the preferred first strategy if the idea is ever explored.

The IDE/runtime renders frames externally and streams RGB data to stock WLED
devices using DDP, E1.31, Art-Net, or UDP realtime protocols. Users do not need
custom firmware.

Benefits:

- lowest WLED adoption friction
- works with existing controllers
- avoids board-specific firmware support at the beginning
- allows GPU or desktop-class CPU rendering
- supports shader-style and Pixelblaze-like runtimes
- keeps the IDE's spatial map as the source of truth

Risks:

- requires a host device to be running for live playback
- depends on network reliability and latency
- offline/standalone controller playback is limited
- very large installations need careful bandwidth and frame-rate budgeting

### Strategy 2: WLED configuration and orchestration

The IDE can also use WLED's APIs to configure or orchestrate stock devices:

- discover controllers
- read/write brightness and power state
- manage segments
- manage presets or playlists
- select realtime mode behavior
- bind IDE maps to controller pixel ranges

This should complement streaming rather than replace it.

### Strategy 3: Generated WLED firmware effects

Later, the IDE could generate WLED C++ effects or usermods for a restricted
pattern subset. This would allow standalone playback on the controller.

This is high-friction and should be deferred until demand is proven.

Challenges:

- users must compile and flash firmware unless the IDE makes it turnkey
- generated effects need to fit ESP memory and CPU constraints
- arbitrary GLSL or Pixelblaze source cannot be assumed portable
- WLED version drift becomes a support responsibility
- hardware profiles, flash failures, and board differences become product
  surface area

### Strategy 4: Turnkey firmware management

If custom firmware becomes important, the IDE could abstract firmware work:

- choose board/controller profile
- inject generated effects or usermods
- compile locally or through a service
- flash through browser/Web Serial where possible
- preserve configuration where possible
- track firmware versions per controller

This could be powerful, but it should not be the entry wedge.

## Spatial Mapping Direction

Pixelblaze's map abstraction is a major design lesson. It decouples the physical
topology of LEDs from the coordinate space a pattern renders into. A pattern can
render against `x`, `y`, and `z` positions while the wiring order remains an
implementation detail.

WLED has useful mapping tools, but they are mostly address and layout tools:

- custom LED maps can remap logical pixel order to physical pixel order
- gaps can be represented
- 2D matrix metadata can describe width and height
- segments can reverse, group, offset, space, and layer ranges
- multi-output controllers can expose several physical strings as one logical
  LED space

Those features are valuable, but they are not the same as a general creative
coordinate model. For this future product, the IDE should own the canonical map:

- each logical pixel has coordinates and optional metadata
- preview uses that map
- pattern evaluation uses that map
- streaming backends use that map to address output devices
- WLED `ledmap.json`, segment setup, DDP addressing, E1.31 universes, and other
  exports can be generated from that map when useful

This map-first model may be the strongest bridge between Pixelblaze's elegance
and WLED's ecosystem size.

## User Stories

1. As a creative LED builder, I want to write generative patterns once, so that I
   can use them across different controllers and installations.

2. As a WLED user, I want to author custom patterns without writing C++, so that
   I can move beyond stock effects and preset tuning.

3. As a WLED user, I want the IDE to drive my existing stock WLED controller, so
   that I do not need to flash custom firmware to try the tool.

4. As a Pixelblaze user, I want familiar pattern concepts such as `render`,
   `render2D`, exported controls, and maps, so that the authoring model remains
   expressive and direct.

5. As an installation designer, I want to define LED coordinates separately from
   wiring order, so that patterns render correctly on irregular physical layouts.

6. As a shader-oriented artist, I want to adapt position/time/uniform-driven
   shader ideas to LED maps, so that I can reuse a broader creative coding
   vocabulary.

7. As a show builder, I want to stream rendered frames to multiple WLED devices,
   so that low-cost controllers can form one larger installation.

8. As a practical user, I want previews to match streamed output, so that I can
   trust edits before sending them to hardware.

9. As a power user, I may want firmware export later, so that selected patterns
   can run standalone without a host computer.

10. As a product maintainer, I want firmware export to remain optional and
    delayed, so that early work avoids unnecessary support burden.

## Implementation Ideas If Explored Later

These are not implementation decisions for the current repo. They are candidate
modules if the idea becomes real.

- A portable pattern runtime that can evaluate Pixelblaze-like pattern functions
  against a canonical map.
- A shader sampling pipeline that renders or evaluates GLSL-style patterns and
  samples LED coordinates from the result.
- A map model that stores pixel coordinates, output addressing, controller
  assignment, and optional zone/group metadata.
- A WLED discovery and control adapter for JSON/WebSocket APIs.
- A realtime streaming adapter for DDP first, with E1.31 and Art-Net considered
  later.
- A bandwidth and frame-rate estimator for WLED streaming targets.
- A preset/segment export layer for WLED configuration.
- A later restricted compiler from portable pattern source to WLED C++ effect or
  usermod code.
- A later firmware build/flash manager if custom firmware export proves worth
  the support cost.

## Testing and Validation Ideas

If this moves from speculation to prototype, validation should happen before
large product investment.

Useful prototype checks:

- stream a simple externally rendered pattern to one stock WLED controller
- stream to multiple WLED controllers as one logical map
- verify DDP addressing, latency, and frame-rate limits
- preview the same map used for streaming
- sample a simple shader-like pattern at LED coordinates
- compare a Pixelblaze-like scripted pattern on preview vs WLED streamed output
- test irregular maps, not only straight strips or rectangular matrices
- measure network bandwidth and CPU/GPU cost at realistic pixel counts

Success criteria for an early spike:

- no custom firmware required
- simple setup for an existing WLED device
- preview and hardware output visibly agree
- map abstraction feels stronger than WLED's native address remapping alone
- at least one pattern authoring mode feels meaningfully easier than WLED C++

## Out of Scope

This speculative PRD does not commit to:

- building WLED support in PXLBLZ v2
- replacing the current Pixelblaze-focused IDE direction
- implementing a GLSL compiler
- supporting arbitrary Shadertoy shaders
- compiling arbitrary Pixelblaze source to WLED firmware
- writing or maintaining a WLED fork
- creating a cloud firmware build service
- supporting every WLED board or hardware configuration
- building an xLights/FPP replacement
- making WLED mapping identical to Pixelblaze mapping

## Open Questions

- Is the valuable product a separate app, a later PXLBLZ mode, or a shared engine
  with multiple frontends?
- Should the first WLED target be DDP only, or should E1.31/Art-Net be included
  from the start?
- How much of the existing Pixelblaze-like runtime should be preserved versus
  designing a new portable pattern language?
- Is shader-style authoring a primary mode or an advanced import/sampling mode?
- What is the minimum map model that supports irregular installations without
  becoming too complex for casual WLED users?
- Can WLED users be convinced to run a host app for higher-end patterns, or is
  standalone firmware playback a hard requirement?
- What is the right sharing format for portable patterns and maps?
- How should power budgeting, gamma/color correction, and controller-specific
  constraints be represented across backends?

## Further Notes

The likely wedge is not "another WLED UI." WLED already has many control and
integration surfaces. The stronger wedge is a creative pattern, map, and
orchestration environment that uses WLED as an output backend.

The near-term product lesson for PXLBLZ is also useful even if this future never
happens: the map abstraction, source inspectability, preview parity, generated
artifact inspection, and low-cost orchestration layers are the pieces with the
most portable value.

Relevant WLED references for future research:

- Custom effects and usermods: https://kno.wled.ge/advanced/custom-features/
- Custom LED maps: https://kno.wled.ge/advanced/mapping/
- Segments: https://kno.wled.ge/features/segments/
- Multi-strip support: https://kno.wled.ge/features/multi-strip/
- JSON API: https://kno.wled.ge/interfaces/json-api/
- DDP realtime output: https://kno.wled.ge/interfaces/ddp/
