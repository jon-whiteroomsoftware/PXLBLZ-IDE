# Feature PRD Draft: WLED Matrix Integration

Status: product and technical direction draft, 2026-07-18. This document records
the current WLED integration thesis and the decisions reached through ecosystem
and source research. It is not approved implementation scope, an issue plan, or
part of the remaining PXLBLZ v2 release commitment.

This draft supersedes the broader speculative WLED Pattern Lab note and two
intermediate backend proposals. The first proposed lowering Pixelblaze source
directly into generated WLED C++. The second proposed interpreting Pixelblaze's
undocumented bytecode inside WLED. The current direction preserves compatibility
with Pixelblaze source while making PXLBLZ's own visual intermediate representation,
program format, and runtime authoritative. Realtime streaming remains the
stock-firmware preview path; a portable PXLBLZ runtime is the product center; and
native C++ is an optional maximum-performance backend from the same representation.

## 1. Decision

PXLBLZ should explore WLED first as a **Portable 2D Show target for WLED
matrices**. WLED remains responsible for controller configuration, networking,
segments, persistence, power management, LED protocols, and physical output.
PXLBLZ supplies the visual authoring, mapping, choreography, compilation, and
installation workflow that WLED does not currently provide.

The first standalone backend should compile the supported Pixelblaze-compatible
source profile and authored PXLBLZ Show model into a compact PXLBLZ Program. A
target-neutral typed visual IR separates frame work, pixel kernels, composition,
state, and choreography before any hardware backend is selected. The portable
backend emits uploadable PXLBLZ bytecode for a flash-once WLED usermod. A later
native backend may emit specialized C++ for installations whose measured workload
justifies rebuilding firmware.

The durable compilation model is:

```text
Pixelblaze-compatible Pattern source --\
PXLBLZ Pattern and library source ------> typed visual IR
PXLBLZ Show model ---------------------/       |
                                                +--> portable PXLBLZ Program
                                                +--> native WLED C++
                                                +--> Pixelblaze source artifact
```

Pixelblaze bytecode remains useful as a behavioral oracle and empirical reference,
but it is not the shipping program format and does not constrain PXLBLZ's runtime
design. Patterns and complete Shows become uploadable data rather than new firmware
builds while PXLBLZ retains the freedom to optimize its own semantics.

DDP provides the preceding live-preview path: authors can validate orientation,
mapping, color, and performance on stock WLED before installing the runtime.

The initial product promise is deliberately narrower than general WLED support:

> Design or import a resolution-independent 2D Pattern or Show in PXLBLZ, preview
> it on a WLED matrix, and upload it to a flash-once PXLBLZ runtime as a self-running
> WLED Effect.

## 2. Why this direction is credible

WLED supplies an unusually large substrate beneath the visual algorithm. Its
firmware already owns the parts that would be expensive and strategically weak
for PXLBLZ to rebuild:

- ESP32 and ESP8266 hardware support;
- digital, SPI, PWM, HUB75, and network output buses;
- LED chipset timing and color-order handling;
- matrix, panel, Segment, grouping, mirroring, and address-map configuration;
- frame scheduling, transition handling, pixel buffers, brightness, and power
  limiting;
- Wi-Fi setup, browser control, JSON, WebSocket, MQTT, DDP, E1.31, Art-Net, and
  device synchronization;
- presets, playlists, usermod configuration, filesystem persistence, and OTA
  updates; and
- a large hobbyist community and third-party integration ecosystem.

WLED is capable of running matrices, but its native authoring model remains an
Effect chooser with a compact set of controls, palettes, Segments, presets, and
playlists. PXLBLZ's native 2D Patterns, visible Stage, Portable Show contract,
zones, layers, property animation, spatial transitions, and generated-artifact
pipeline address a different part of the problem.

The public WLED usage dashboard currently reports 7,224 Matrix devices and
103,230 Non-Matrix devices among devices reporting matrix status, or about 6.5%
Matrix. The telemetry is directional rather than a market survey: dashboard
charts use different denominators, and Matrix combines addressable-pixel grids,
strip matrices, and panels. It nevertheless establishes an existing population
of thousands of matrix installations inside a much larger WLED footprint.

Official HUB75 panel support entered mainline WLED in version 16. Dedicated
firmware targets now support common 32x32, 64x32, 64x64, and 128x64 panels and
chains on qualified ESP32 hardware. That creates a newly accessible dense-panel
audience whose visual-authoring needs align especially well with PXLBLZ.

HUB75 is neither exclusively consumer nor exclusively industrial hardware. It is
a simple parallel scan-panel interface used by inexpensive maker modules and by
the modular panels behind commercial signs, scoreboards, stage displays, and video
walls. Unlike a WS2812 strip, a HUB75 panel does not retain one self-clocked color
value per LED. The controller continuously scans rows and generates color depth
through high-rate pulse-width modulation. That produces far more pixels per dollar
and much tighter pitch, at the cost of continuous refresh, parallel wiring, DMA
buffers, substantial 5V power, and greater panel-specific variation.

As of this draft, representative retail prices put a 64x32 panel around USD 18-26
from a direct maker supplier and USD 40-75 through a supported US hobby retailer.
A 64x64 panel is roughly USD 29-55. Suitable ESP32-S3 HUB75 controller boards are
about USD 20-25, with lower-cost boards near USD 10. Power supply, distribution,
cabling, diffusion, and an enclosure remain separate. A credible single-panel
prototype therefore starts around USD 50-120 rather than at the panel price alone.
Commercial outdoor and rental-grade systems add weatherproofing, calibrated
modules, redundant power/data, and sender/receiver controllers and belong to a
different cost and reliability class even when the panel boundary is related.

For PXLBLZ, HUB75 supplies a dense literal canvas: text, sprites, image-like fields,
generative animation, audio-reactive graphics, transitions, dashboards, signage,
and tiled installations all become practical. WLED 16 currently constrains the
qualified panel sizes, chain direction, controller family, and memory envelope;
the first PXLBLZ profile should follow those limits instead of treating every
nominally compatible panel as interchangeable.

## 3. Product opportunity

Pixelblaze remains an elegant creative runtime, but its small community limits
how many people can discover or use even excellent authoring software. WLED has
a substantially larger reachable hobbyist population. Supporting it allows the
existing PXLBLZ investment to serve another controller ecosystem instead of
requiring a separate product or a replacement runtime.

The Matrix-first wedge also makes the value legible. On a strip, sophisticated
spatial choreography can look like a more elaborate way to select an effect. On
a 32x32 or 64x32 canvas, PXLBLZ's layers, zones, motion, spatial transitions, and
preview visibly expand what the hardware can do.

The intended relationship is:

> WLED makes the matrix work. PXLBLZ lets the author direct it.

PXLBLZ must not become another general WLED settings UI. It should read the
device facts required for authoring and deployment, display compatibility, and
delegate hardware ownership to WLED wherever WLED already has authority.

### Critical market hypothesis

WLED's audience size becomes relevant only if matrix users can cross the
installation boundary. A large no-code controller community does not imply a
large audience willing to compile and flash custom firmware. A source-built
runtime is an appropriate execution proof, but it is not evidence that the broader WLED
population can adopt the standalone product.

The product must therefore validate two propositions separately:

1. PXLBLZ can compile a visually meaningful 2D Show that performs well on WLED.
2. The visual result motivates matrix users to install it through the available
   workflow.

DDP preview lowers the commitment required to experience the first proposition.
A turnkey runtime image is likely necessary before community reach turns into
practical distribution. The flash-once architecture then makes every subsequent
Pattern or Show a much lower-friction upload.

## 4. Intended users and jobs

### WLED matrix builder

A builder with an existing addressable-pixel matrix or HUB75 panel wants visuals
beyond stock effects without writing C++, maintaining a WLED fork, or assembling
a show from disconnected presets.

### Visual author

An author wants to compose a complete 2D performance with Patterns, Scenes,
zones, layers, transitions, and animated properties while seeing the final
matrix output during authoring.

### Installation designer

A designer wants wiring order and creative coordinates to remain separate. The
same Portable 2D Show should retain its composition across compatible matrix
resolutions, while an Installation Show may own exact gaps, addresses, and
physical routing.

### Pixelblaze author reaching WLED

An existing PXLBLZ user wants selected Patterns and Shows to run on inexpensive
WLED-compatible hardware without rewriting the visual logic by hand.

## 5. First target profile

The first profile constrains the problem enough to establish honest parity:

- WLED 16 or newer;
- ESP32-class hardware;
- one logical rectangular 2D matrix;
- RGB output initially, with an explicit RGBW policy before RGBW qualification;
- one WLED device;
- PXLBLZ Portable 2D Patterns and Shows;
- `render2D`, or `render` adapted under the existing renderer policy;
- live hardware preview over DDP;
- one board-specific WLED firmware containing the portable PXLBLZ runtime;
- uploadable, versioned PXLBLZ program packages for standalone playback; and
- 2,048 qualified output pixels, covering 32x32 and 64x32 canvases.

The product-wide Show ceiling should move from a single Pixelblaze-derived
constant to target-aware capability. The common authored ceiling increases from
2,000 to 2,048 so a standard 64x32 matrix is representable. Each Controller
profile may impose a lower measured limit; future WLED profiles may exceed 2,048
after CPU, memory, bus, and frame-rate qualification. The new number is an
initial interoperability boundary, not a claim about WLED's ultimate capacity.
Because one 64x64 HUB75 panel contains 4,096 pixels, it is the next explicit
qualification milestone for an ESP32-S3 profile with suitable PSRAM; it is not
silently covered by the initial 2,048-pixel promise.

## 6. Core experience

### 6.1 Connect and inspect

PXLBLZ discovers or connects to a WLED device through its JSON API and reads the
facts required for a target profile:

- WLED version and build;
- chip, flash, heap, and PSRAM when reported;
- pixel count and matrix dimensions;
- bus and RGB/RGBW capabilities;
- Segment geometry;
- current LED map selection; and
- realtime-protocol availability.

The Inspector reports compatibility without taking ownership of ordinary WLED
settings. Unsupported firmware, hardware, geometry, or color output produces a
specific reason and an actionable next step.

### 6.2 Author against the real target

The existing Stage displays the connected matrix dimensions and PXLBLZ Show
zones. Portable reference geometry remains an authoring aid rather than exact
LED identity. An Installation target may import or construct an exact address
map and gap layout.

The editor continues to use canonical PXLBLZ concepts. Patterns do not learn
about WLED Segments, GPIO pins, or bus types. Shows do not degrade into WLED
playlists merely because WLED is the output backend.

### 6.3 Preview on stock WLED

Run can evaluate the Pattern or Show in the existing Fast runtime and stream the
completed frame to WLED over DDP. This preview path requires no custom firmware
and validates:

- orientation and address order;
- map and gap placement;
- visible color and brightness behavior;
- network throughput;
- target pixel count; and
- achievable frame rate.

DDP preview is explicitly host-driven. Closing the browser or losing the network
ends playback; it does not imply that the Show has been installed.

### 6.4 Compile a portable program

Export lowers the selected Pattern or complete Show into typed visual IR, applies
target-independent optimization, and emits a versioned PXLBLZ Program. The package
contains portable bytecode, code and state tables, choreography, controls,
coordinates, output contracts, source provenance, and an exact resource manifest.
It is data for the runtime, not a WLED firmware image.

Compilation should remain available in the browser because PXLBLZ owns the
frontend, IR, optimizer, and portable emitter. Server infrastructure may later
build native firmware or cache expensive artifacts, but WLED-only users do not
need a Pixelblaze Controller, ElectroMage compiler, Python worker, or proprietary
bytecode to create a portable program.

Pixelblaze source import targets a documented compatibility profile rather than
arbitrary JavaScript or every historical firmware behavior. The compiler reports
unsupported syntax or semantics directly. Existing Pixelblaze compilation and
hardware execution remain valuable differential tests for compatible source but
are not production dependencies.

### 6.5 Install and run under WLED

After the user deliberately installs a compatible runtime build, the PXLBLZ
Effect appears in WLED. PXLBLZ can subsequently upload compatible programs to the
runtime without rebuilding or reflashing firmware. WLED supplies native selection,
presets, automation, restart behavior, networking, and LED output; the runtime
supplies PXLBLZ execution, program state, controls, and creative coordinates.
The Pattern or Show runs without PXLBLZ or another host remaining connected.

## 7. Technical model

### 7.1 Pixelblaze-compatible source profile

PXLBLZ accepts the useful visual subset of Pixelblaze's JavaScript-shaped language,
including Pattern state, arrays, controls, lifecycle functions, renderers, and
qualified builtins. It does not promise arbitrary JavaScript, undocumented
firmware behavior, or byte-for-byte compatibility with ElectroMage's compiler.

The frontend reuses the existing parser, library bundler, binding analysis,
renderer metadata, and transforms. Every accepted construct lowers into explicit
typed semantics. Unsupported dynamic behavior fails at compile time with a source
diagnostic instead of leaking into the embedded runtime.

### 7.2 Typed visual IR

The visual IR is the durable boundary between authoring and execution. It models
what the program means without encoding browser JavaScript, Pixelblaze bytecode,
WLED APIs, or a particular processor. The first profile needs explicit forms for:

- Pattern kernels, functions, controls, globals, arrays, and private instance state;
- frame, row or zone, and per-pixel computations;
- 1D, 2D, and later 3D renderer coordinates;
- color, palette, noise, waveform, and random operations;
- Show score, Pattern identity, Continue/Restart, routing, layers, transitions,
  and render targets; and
- static resource sizes, output contracts, and provenance.

The IR is not a new author-facing language. It is a compiler model that allows
one source frontend and several measured backends.

### 7.3 Execution phases

The compiler divides work by how often its value can change:

1. **Frame phase:** advance clocks, controls, Pattern simulations, arrays, Scenes,
   and transitions once per frame.
2. **Pixel-kernel phase:** evaluate only expressions that genuinely vary by pixel,
   with coordinates and relevant zone data already available.
3. **Composition phase:** apply masks, layers, blends, palettes, transitions, and
   render-target sampling through specialized operations.

This division is the main performance strategy. An expression that changes once
per frame should not execute 4,096 times merely because the source placed it near
a renderer. Compile-time, installation, frame, zone or row, and pixel invariants
should be hoisted to the narrowest valid frequency.

### 7.4 Program optimization

The compiler can optimize a complete Show more aggressively than a general
Pattern VM because it knows the Stage, topology, active Pattern instances, zones,
layers, and transitions. The first optimizer should prioritize structural wins:

- compile each distinct Pattern kernel once and allocate separate state blocks
  for its instances;
- precompute fixed coordinates, routing, masks, and constant expressions;
- skip inactive Patterns, invisible layers, and pixels outside a kernel's routes;
- specialize renderer dimension and exact output profile;
- fuse common color, palette, blend, mask, noise, and transition sequences into
  visual superinstructions; and
- calculate every stack, array, state block, render target, and scratch region
  before upload.

Instruction-dispatch tricks come after these reductions. Avoiding work has more
leverage than interpreting unnecessary work faster.

### 7.5 Portable WLED runtime

One C++ usermod implements the versioned PXLBLZ Program VM and registers a PXLBLZ
Effect with WLED. WLED's scheduler invokes the adapter once per active Segment.
The runtime executes the frame program, dispatches the relevant pixel kernels and
composition operations, then writes completed logical colors through the Segment
pixel API.

Each Segment instance owns isolated program state: globals, arrays, stack,
controls, clocks, random state, render targets, and Pattern-instance blocks.
State must live in Segment-owned allocation or a usermod-managed table keyed by
stable Segment identity, never in shared C++ statics. The runtime validates program
format, required operations, exact resource sizes, output dimension, and Program
ABI before activation.

The runtime is not a security boundary. It must reject malformed programs and
bound memory and execution, but it still shares the WLED process, heap, and
watchdog. Every frame receives an instruction or work budget and a cooperative
abort path.

### 7.6 Show representation

Simple WLED presets and playlists cannot preserve the complete PXLBLZ Show model.
The PXLBLZ Program therefore represents the Show directly as a kernel table,
Pattern-instance and state table, control table, score, routing data, transition
programs, render-target plan, and resource manifest.

This avoids flattening the Show into duplicated Pixelblaze source. Six instances
of one Pattern carry one kernel and six private state blocks. Continue/Restart,
property animation, spatial transitions, and logical routing remain explicit
runtime semantics rather than generated source conventions. Native WLED presets
may select or configure the PXLBLZ Effect but are not the Show's canonical model.

### 7.7 Portable and native backends

The portable backend emits compact, uploadable PXLBLZ bytecode. It supports rapid
iteration, program catalogues, compatibility validation, and installation without
firmware rebuilds.

The native backend lowers the same optimized IR into C++ specialized for an exact
board, resolution, and Show. It removes interpreter dispatch and may fuse more
operations, but it requires a new firmware build. Native output is an optimization
tier for measured workloads, not a second semantic implementation. Deterministic
fixtures must compare both backends against the same reference interpreter.

### 7.8 Numeric and visual parity

PXLBLZ Fast preview remains the responsive authoring runtime. A typed IR reference
interpreter becomes the target-neutral conformance oracle. Precise preview and real
Pixelblaze hardware remain compatibility oracles for imported Pixelblaze source.

The ordinary PXLBLZ runtime should use the fastest qualified numeric policy for
the target, expected initially to favor native 32-bit floating point. A declared
Pixelblaze-compatibility profile may preserve fixed-point behavior when a Pattern
depends on it. Accepted backend differences are measured and reported rather than
silently described as identical execution.

### 7.9 Output and color

The portable or native runtime writes logical RGB or RGBW values through WLED's
Segment pixel API. WLED retains authority over Segment transforms, address mapping,
global brightness, automatic brightness limiting, bus selection, chipset timing,
and physical transmission.

Initial RGB qualification may leave the white channel unused. RGBW support
requires an authored or documented white-extraction policy; it must not emerge
accidentally from controller configuration.

## 8. Controls

Native WLED Effect metadata exposes five sliders, three checkboxes, three color
slots, and palette selection. PXLBLZ Patterns can expose a less constrained set
of exported control functions. The runtime therefore needs both a deterministic
native mapping and a program-state API for controls that do not fit WLED's Effect
surface.

The first policy should:

1. map compatible sliders, toggles, colors, and palettes into native WLED
   controls;
2. preserve labels and useful defaults in the Effect metadata;
3. identify quantization, especially WLED's reduced-range fifth slider;
4. allow selected values to be baked into an export preset; and
5. expose additional compatible controls through usermod JSON state or a small
   dedicated page; and
6. reject or clearly freeze controls that the qualified runtime cannot represent.

## 9. Mapping and topology

### 9.1 Rectangular matrices

Regular matrices use WLED's native virtual width and height. Portable 2D Show
zones remain normalized PXLBLZ regions and adapt to the connected resolution.
WLED's physical matrix and panel configuration resolves those coordinates to
the output buses.

### 9.2 Address maps and gaps

WLED `ledmap.json` is an address permutation with optional matrix dimensions and
gap entries. PXLBLZ can visualize, validate, import, and export that information.
An exported map must not be described as an arbitrary coordinate map: it cannot
represent general floating-point `x`, `y`, or `z` positions by itself.

### 9.3 PXLBLZ coordinate maps

An Installation Show may require coordinates richer than WLED's native grid. A
generated artifact can include a compact coordinate table indexed by WLED's
logical pixels. The Effect evaluates PXLBLZ renderers against those coordinates
while WLED continues to own logical-to-physical addressing.

This mechanism can later support strips arranged as architectural edges,
irregular 2D sculptures, or mixed strip-and-matrix installations without asking
WLED to adopt Pixelblaze's complete map model.

### 9.4 3D

The first WLED contract is 2D. WLED can physically drive LEDs arranged in 3D,
but it has no equivalent native 3D creative-coordinate contract. General 3D
requires a baked PXLBLZ coordinate runtime, installation-specific performance
evidence, and separate product validation.

## 10. Runtime and program packages

Distribution has two artifacts with different compatibility boundaries.

The reproducible **runtime firmware package** should contain:

- PXLBLZ runtime usermod source and its WLED Effect registration;
- supported PXLBLZ Program ABI, operations, and numeric profiles;
- WLED commit/tag, PlatformIO environment, board, and required build flags;
- supported hardware, panel, matrix-size, and resource profiles;
- build identity, source, licenses, and installation and recovery instructions;
  and
- an optional prebuilt firmware image for the exact named board.

The uploadable **program package** should contain:

- the validated PXLBLZ Program header, portable bytecode, code table, and state
  layout;
- compiler, optimizer, Program ABI, and operation-profile identity;
- Pattern or Show identity, controls, output dimension, and numeric contract;
- Show score, Pattern-instance table, routing, transitions, and render-target plan
  when applicable;
- optional compiled coordinate or address-map resources;
- source Pattern, Show, library, and map provenance;
- resource requirements, integrity hash, and compatibility warnings; and
- optional WLED preset and Segment configuration assistance.

Program packages are portable across WLED boards whose installed runtime advertises
the same ABI and sufficient resources. They must not encode a PlatformIO target or
pretend that installing a program can repair incompatible firmware.

## 11. Deployment ladder

### Level 1: Stock-WLED preview

PXLBLZ discovers and controls the device through JSON and streams preview frames
through DDP. No custom firmware is required. This establishes the connection,
target profile, mapping, and hardware verification loop.

### Level 2: Source-built runtime

PXLBLZ publishes the runtime usermod against a pinned WLED version. An experienced
user compiles and flashes it, then uploads PXLBLZ Programs without another
firmware build. This is the smallest standalone proof of the portable runtime.

### Level 3: Turnkey board-specific runtime

PXLBLZ builds a complete runtime firmware binary locally or through a service
after the user chooses an exact board profile. The workflow backs up configuration
and presets, explains firmware provenance, requires deliberate confirmation
before flashing, and provides a recovery path.

### Level 4: Program catalogue and managed upload

PXLBLZ discovers the installed runtime and its Program ABI, compiles locally,
validates exact resource requirements, and uploads the program package to WLED
storage. Multiple Patterns or Shows may form a catalogue selected through native
presets or runtime state without further flashing.

Native C++ remains an optional performance tier from the same visual IR. It is
not a required rung in the preferred deployment ladder.

## 12. Delivery sequence

### Phase 0: Semantic and runtime feasibility spike

The first gate proves that one deliberately narrow source profile can travel
through a PXLBLZ-owned compiler and execute efficiently on WLED. It should:

1. select a representative corpus from current PXLBLZ content: one stateless
   Pattern, one stateful Pattern with arrays, one coordinate-heavy 2D Pattern,
   and one small Portable 2D Show with two Pattern identities, Continue/Restart,
   property animation, and one spatial transition;
2. define the minimum accepted Pixelblaze-compatible source semantics and typed
   visual IR required by that corpus, with explicit diagnostics for everything
   outside the profile;
3. lower the corpus into the IR and execute it in a pure TypeScript reference
   interpreter, comparing deterministic frames with Fast preview, Precise
   preview, and real Pixelblaze output where applicable;
4. emit the first PXLBLZ Program and execute it through the portable WLED runtime
   on an ESP32-S3 HUB75 target; and
5. measure the same IR through a minimal native C++ emitter only after the
   portable path works, so the project has evidence for whether a second backend
   earns its complexity.

The spike records accepted source features, IR operations, Program bytes,
runtime flash, static state and render-target memory, operations per frame,
frame rate, watchdog behavior, compilation time, and frame parity. ESP32-S3 with
PSRAM is the preferred first runtime target; one conventional ESP32 profile
should follow before the architecture is treated as portable.

The go bar is execution of the representative stateful 2D Show at 64x32, or
2,048 pixels, without Pattern-specific C++, source flattening, manual binary
patching, or a host connection. Every material visual difference must be
explained, and measured CPU and memory headroom must support the next product
increment. If the slice requires a general JavaScript runtime, or the portable
Program cannot meet its frame budget despite structural optimization, narrow the
source profile or use the native backend for that complexity class. Do not turn
the spike into an open-ended language implementation.

This gate addresses the plan's most consequential blind spot: an imagined IR can
become a new platform before it has proven one useful visual. The smallest useful
experiment is one complete vertical slice through parsing, IR, reference
execution, portable execution, output, and profiling. The project should not
design a broad instruction set ahead of that slice.

Before Phase 4 expands, pair the runtime spike with a small installation-friction
probe. Package the runtime and one signature 2D Show for one well-known matrix
board, and observe a small group of WLED matrix users attempting stock-firmware
preview, one-time runtime installation, and a second program upload. Record where
they stop, what recovery help they need, and whether subsequent upload materially
changes their interest. This separates runtime feasibility from addressable
adoption.

### Phase 1: WLED target and DDP preview

Add a framework-agnostic WLED device profile, JSON client, and DDP transport
behind the existing Controller-provider seam. Connect one matrix, read its
capabilities, display compatibility, and stream the current Stage without
changing WLED's durable configuration.

### Phase 2: Portable runtime and one Pattern

Build the versioned runtime usermod against pinned WLED. Implement only the
Program operations required by the first corpus, install the runtime manually,
and upload one locally compiled Pattern package. Map its compatible controls and
verify that WLED can select and run isolated instances on multiple Segments.

### Phase 3: Structurally compiled Portable 2D Show

Compile a complete Show directly from the Show model into the visual IR and
PXLBLZ Program. Prove that distinct Pattern kernels are stored once, instances
retain private state, choreography remains data, and render targets are allocated
from the resource plan. Qualify deterministic timing, Continue/Restart, zones,
property animation, and selected transitions at 32x32 and 64x32.

### Phase 4: Packaging, dual-backend evidence, and adoption

Define the runtime capability handshake and versioned Program-package format.
Upload and replace Programs without reflashing the runtime. Compare portable and
native C++ output generated from the same IR, and retain the native tier only for
target profiles or complexity classes with a material measured benefit. Run the
installation-friction probe before broadening hardware support.

### Phase 5: Mapping, HUB75 expansion, and turnkey runtime

Add address-map import/export, gaps, exact Installation coordinates, presets,
Segment setup assistance, compatibility manifests, and guided runtime installation.
Qualify one 64x64 HUB75 profile at 4,096 pixels on suitable ESP32-S3 hardware only
after the 2,048-pixel profile has measured CPU and memory headroom.

## 13. Acceptance criteria for the first product increment

The first independently useful increment is complete when an author can:

- connect to a qualified WLED 16+ ESP32 matrix;
- see dimensions, pixel count, color capability, firmware, and compatibility;
- preview a Portable 2D Pattern or Show on the hardware over DDP;
- build and install one reproducible runtime usermod through documented PlatformIO
  steps without maintaining a PXLBLZ-specific WLED fork;
- compile one Pattern locally into a versioned PXLBLZ Program;
- upload and replace its program package without reflashing firmware;
- select the PXLBLZ runtime as a normal WLED Effect;
- use every declared compatible native control;
- run it without PXLBLZ remaining connected; and
- reproduce deterministic comparison frames within the backend's documented
  numeric and color tolerances.

The 64x32 qualification case must process 2,048 pixels without memory failure,
watchdog reset, network starvation, or an undisclosed frame-rate collapse on the
named target profile.

## 14. Success measures

Technical validation should answer whether the backend is viable before product
investment expands:

- at least three materially different Patterns lower through the owned IR into
  PXLBLZ Programs and execute without Pattern-specific C++;
- the representative Show preserves its authored lifecycle and transition
  behavior;
- the shared runtime and program artifacts fit named ESP32 and ESP32-S3 profiles
  with measured headroom;
- reference, portable, and any retained native output agree under deterministic
  fixtures;
- device setup does not require a PXLBLZ-specific WLED fork; and
- source-profile, IR, Program ABI, runtime, and WLED version changes are rejected
  or isolated behind declared compatibility layers.

Product validation should establish that the matrix niche values composition,
not merely another effect catalogue:

- WLED matrix users can complete preview without firmware modification;
- source-comfortable users can install the runtime from the package;
- users can add subsequent programs without a firmware toolchain;
- observed matrix users reveal whether one-time runtime installation creates a
  viable bridge toward a turnkey workflow;
- authors can produce a result that would be materially difficult to express as
  one stock Effect plus presets; and
- community feedback supports standalone Show installation as the next step.

Numeric adoption targets should follow an instrumented prototype rather than be
invented in this draft.

## 15. Risks and mitigations

### Semantic scope and language-runtime sprawl

Pixelblaze-shaped source resembles JavaScript closely enough to invite an
accidental promise of arbitrary JavaScript compatibility. Dynamic language
features would enlarge the compiler, runtime, test surface, and security model
without necessarily improving visual authorship.

**Mitigation:** derive source profile 1 from a representative PXLBLZ corpus;
publish accepted semantics and compile-time diagnostics; explicitly reject
dynamic evaluation, prototypes, reflective property access, and other features
outside the visual model; and expand only when a concrete authored behavior
justifies the cost.

### Premature IR lock-in

An instruction set designed from imagined future needs may preserve the wrong
abstractions, make Shows expensive, or create migration debt before the first
useful WLED artifact exists.

**Mitigation:** design the smallest typed IR that carries the Phase 0 corpus;
keep a target-neutral reference interpreter; version the IR and Program ABI
separately; retain source and build identity for recompilation; and add operations
only from measured compiler or runtime pressure.

### Portable interpreter performance

An interpreter adds dispatch overhead inside a workload that may already execute
thousands of pixel kernels, transitions, and compositions per frame. HUB75 output
and WLED services compete for the same controller resources.

**Mitigation:** separate frame, pixel, and composition frequencies; hoist
invariants; precompute topology and routing; cull inactive work; add measured
visual superinstructions; use exact static resource plans; and compare a native
C++ backend from the same IR before raising target limits.

### Dual-backend divergence

Portable Program and native C++ output can drift in numeric policy, lifecycle,
control behavior, or optimization semantics.

**Mitigation:** keep one authoritative typed IR and reference interpreter; run
the same deterministic fixtures against every backend; specify numeric profiles
in the artifact; and retain the native tier only where measured performance
justifies its permanent conformance burden.

### WLED resource limits

Show compilation can multiply Program code, private runtime state, render
targets, and per-pixel instruction work. WLED transitions may also execute
current and outgoing Effects in one frame.

**Mitigation:** target ESP32-class boards, retain the Show compiler's resource
ledger, add WLED-specific CPU/heap/flash budgets, and qualify named matrix sizes.

### WLED version coupling

The custom-Effect and usermod interfaces are source-level APIs rather than a
stable binary plugin ABI.

**Mitigation:** pin runtime packages to WLED releases, isolate WLED bindings in a
small adapter, test against a support matrix, and avoid modifying core files.

### Firmware installation

Building and flashing introduces board-selection, configuration-loss, recovery,
and support risk.

**Mitigation:** keep DDP preview stock, make runtime installation explicit,
require exact board selection, back up state before managed flashing, retain
reproducible source, and never flash silently.

### Runtime safety

The portable runtime executes inside WLED with no process or memory sandbox. A
malformed Program, invalid resource declaration, or valid but excessive workload
can corrupt state or starve networking and LED refresh.

**Mitigation:** validate framing, types, control flow, and resource bounds before
storage; use compiler-declared static state and render-target limits; enforce a
per-frame work budget and cooperative abort; make replacement atomic and
recoverable; preserve a safe-mode path; and test watchdog, allocation, and power-
loss failures.

### Control mismatch

WLED's native control surface cannot represent every exported Pattern function.

**Mitigation:** provide deterministic mappings, surface quantization, allow
intentional baked values, and block misleading exports.

### Mapping overclaim

WLED address maps do not represent arbitrary PXLBLZ coordinates.

**Mitigation:** distinguish address maps from creative coordinate maps in the
model and artifact; include coordinates in the runtime when necessary.

### Licensing and provenance

WLED is EUPL-1.2-or-later, while Patterns, libraries, community usermods, and
panel drivers may carry different terms. Distributed runtime firmware creates
obligations distinct from distributing source-authored Program packages.

**Mitigation:** retain source, library, IR, Program, runtime, and build provenance;
pin upstream source; include licenses; avoid implying Pixelblaze affiliation;
and review execution and redistribution obligations before offering firmware
binaries or a public catalogue.

### Product diffusion

Broad WLED support could distract from the coherent Matrix-first value and from
finishing the current PXLBLZ release.

**Mitigation:** keep this work outside the current release commitment, validate
one target profile, and require evidence before expanding into general strips,
multi-device output, shader authoring, or other ecosystems.

### Reach versus installability

Matrix telemetry and WLED's community size measure possible reach, not the number
of users willing to replace stock firmware. A successful compiler can still fail
as a product if installation remains specialist work.

**Mitigation:** let users experience the result through stock-firmware DDP first,
measure installation abandonment with a signature Show, and treat a turnkey
runtime build as a likely distribution requirement rather than optional polish.

## 16. Explicitly out of scope for the first increment

- importing WLED C++ Effects into PXLBLZ;
- replacing WLED's hardware configuration, integrations, or ordinary UI;
- general 1D WLED product support;
- 3D WLED Shows;
- ESP8266 qualification;
- arbitrary JavaScript or full ECMAScript compatibility;
- compatibility with Pixelblaze bytecode or its undocumented VM ABI;
- import or execution of source-less Pixelblaze bytecode;
- arbitrary C++ or WLED usermod ingestion;
- shader or ISF import;
- xLights or FPP choreography export;
- multi-device synchronization;
- every WLED board, panel driver, or custom build;
- a permanent PXLBLZ WLED fork;
- broad cloud firmware builds before one runtime profile is proven; and
- automatic firmware flashing without explicit device, backup, and recovery
  steps.

## 17. Decisions recorded by this draft

- WLED integration is additive; PXLBLZ does not replace WLED's substrate.
- Matrices, especially dense 2D panels, are the initial market and technical
  wedge.
- Portable 2D Show is the initial authored contract.
- WLED 16+ on ESP32-class hardware is the initial controller family.
- DDP is the stock-firmware preview path, not the installed artifact format.
- Pixelblaze-compatible source, not Pixelblaze bytecode, is the compatibility
  boundary.
- A typed PXLBLZ visual IR is the authoritative executable model shared by all
  new backends.
- A flash-once PXLBLZ runtime executing compact, uploadable Programs is the
  preferred standalone backend.
- Native WLED C++ generated from the same IR is an optional measured performance
  tier, not a separate compiler architecture.
- A complete PXLBLZ Show compiles structurally from the Show model into shared
  code, private instance state, choreography, routing, transitions, and an exact
  resource plan rather than first flattening into duplicated Pattern source.
- WLED Segment runtime state hosts independent PXLBLZ Program instances where
  possible.
- The same frontend can continue emitting ordinary Pixelblaze source artifacts
  for Pixelblaze hardware.
- PXLBLZ retains authority over creative coordinates and Show semantics.
- WLED retains authority over hardware mapping, buses, power, networking, and
  physical output.
- The common Show ceiling rises to 2,048 and evolves toward target-aware limits.
- Source, build identity, licenses, and provenance are part of the artifact.
- Browser-local compilation is the first path because PXLBLZ owns the compiler;
  a server may later cache builds or produce board-specific native firmware.
- Turnkey runtime firmware and uploadable program catalogues are later deployment
  layers.
- WLED Effect import into PXLBLZ is not part of this direction.

## 18. Open decisions

- Which exact ESP32 and ESP32-S3 boards form the first support matrix?
- Which Pixelblaze-compatible language features define source profile 1?
- Which typed forms and operations define visual IR version 1, and how are saved
  sources and Programs migrated across later versions?
- Should Program version 1 use a stack, registers, or a mixed representation,
  and which operand encodings should be fixed-width versus variable-length?
- Which common visual operations deserve purpose-built superinstructions only
  after profiling?
- Which numeric profile is the default, and which Patterns genuinely require a
  Pixelblaze-like 16.16 compatibility mode?
- What minimum frame rate qualifies 1,024- and 2,048-pixel Shows by complexity
  class?
- Which native controls map automatically, and which require explicit author
  assignment?
- Does one PXLBLZ Effect select a program catalogue, or can the runtime register
  stable WLED Effect entries per installed program?
- What deterministic RGBW policy should qualify the first RGBW target?
- Can the WLED usermod adapter remain a thin versioned layer across supported
  releases?
- Should native firmware builds run locally or through a separate service after
  browser-local Program compilation is proven?
- How should WLED artifacts be shared without confusing source compatibility,
  board compatibility, and installed firmware?
- When should the target-aware Show limit become a general output-contract
  capability rather than a WLED-specific gate?

## 19. Relevant current architecture

The exploration should extend, not fork, these existing seams:

- `src/engine/bundle.ts` for Pattern/library bundling and metadata;
- `src/engine/passEngine.ts` for authored transforms;
- `src/engine/fxEmit.ts` for target numeric emission precedent;
- `src/engine/loadPattern.ts` for runtime renderer and control interfaces;
- `src/engine/renderCompatibility.ts` for dimensional adaptation;
- `src/engine/showCompiler.ts` for one-artifact Show generation and resource
  accounting;
- `src/engine/ControllerProvider.ts` for transport abstraction;
- `src/engine/layout.ts` and `src/engine/maps/` for map and layout authority;
- the Fast/Precise preview runtimes as behavioral references; and
- `src/engine/compilerExtraction.ts`, `src/engine/bytecodePush.ts`,
  `src/engine/pushPattern.ts`, `src/engine/pbpEncode.ts`, and
  `extension/sandbox.js` as Pixelblaze-backend evidence and behavioral oracles,
  not foundations for the new runtime.

The new compiler, typed visual IR, reference interpreter, optimizer, Program
encoder, verifier, and resource planner should remain pure engine modules. WLED
transport and runtime packaging belong behind target adapters. UI components
should select a target, display diagnostics, and invoke those services without
reimplementing compilation rules.

The existing Show output contracts remain authoritative, but WLED Programs may
compile directly from the Show domain model instead of using flattened
Pixelblaze source as an intermediate. This draft extends Portable 2D to another
qualified backend; it does not weaken the distinction between resolution-
independent choreography and exact Installation topology.

## 20. Research sources

- WLED usage dashboard: https://usage.wled.me/
- WLED custom Effects and usermods:
  https://kno.wled.ge/advanced/custom-features/
- WLED JSON API and Effect metadata:
  https://kno.wled.ge/interfaces/json-api/
- WLED DDP support: https://kno.wled.ge/interfaces/ddp/
- WLED mapping: https://kno.wled.ge/advanced/mapping/
- WLED mixed 2D and 1D setup:
  https://kno.wled.ge/advanced/2d-1d-Mixed-Setup/
- WLED HUB75 support: https://kno.wled.ge/advanced/HUB75/
- WLED source and license: https://github.com/wled/WLED
- ZRanger1 Pixelblaze Python client and bytecode tooling, retained only as
  behavioral-reference material:
  https://github.com/zranger1/pixelblaze-client
- Pixelvation HUB75 Pixelblaze bridge and output-expander prior art:
  https://github.com/Pixelvation/PixelvationEngine_HUB75 and
  https://github.com/simap/pixelblaze_output_expander
- ESP32 HUB75 DMA driver used across matrix projects:
  https://github.com/mrcodetastic/ESP32-HUB75-MatrixPanel-DMA
- Waveshare 64x32 and 64x64 HUB75 panels:
  https://www.waveshare.com/rgb-matrix-p3-64x32.htm and
  https://www.waveshare.com/rgb-matrix-p2-64x64.htm
- Waveshare ESP32-S3 HUB75 controller:
  https://www.waveshare.com/esp32-s3-rgb-matrix.htm
- Adafruit MatrixPortal S3 and representative panels:
  https://www.adafruit.com/product/5778 and
  https://www.adafruit.com/product/5362
