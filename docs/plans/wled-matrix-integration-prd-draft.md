# Feature PRD Draft: Standalone PXLBLZ Runtime and WLED Matrix Integration

Status: product and technical direction draft, updated 2026-08-05. This document
records the current standalone-runtime and WLED-integration thesis. It is not
approved implementation scope, an issue plan, or part of the remaining PXLBLZ v2
release commitment.

This draft supersedes the broader speculative WLED Pattern Lab note and two
intermediate backend proposals. The first proposed lowering Pixelblaze source
directly into generated WLED C++. The second proposed interpreting Pixelblaze's
undocumented bytecode inside WLED. The current direction treats Pixelblaze as a
compatibility frontend and design reference while making PXLBLZ's own visual
semantics, intermediate representation, program format, and runtime authoritative.
Realtime streaming remains the stock-WLED preview path. A portable embedded
runtime and a more capable Pi-class Linux appliance become complementary targets
from the same representation rather than competing definitions of the product.

## 1. Decision

PXLBLZ should build a **target-neutral standalone visual platform**, with WLED as
its first embedded integration and matrix-market wedge. WLED remains responsible
for controller configuration, networking, Segments, persistence, power
management, LED protocols, and physical output on ESP devices. PXLBLZ supplies
the visual semantics, authoring, mapping, choreography, compilation, and
installation workflow that WLED does not currently provide.

The platform should also preserve a first-class path to a Pi-class Linux
appliance. That controller runs the complete PXLBLZ service locally, continues
playback without a browser or remote server, and can use substantially more CPU,
memory, storage, audio processing, and GPU execution. It may drive panels through
a direct adapter, send completed frames to an internal deterministic output
coprocessor, or use WLED devices as network output nodes. Multiple ESP devices are
therefore an output-topology choice before they are a rendering strategy.

Every standalone backend should consume the same PXLBLZ Program. A target-neutral
typed visual IR separates frame work, pixel kernels, composition, state,
resources, and choreography before hardware selection. An ESP/WLED backend may
execute compact uploadable bytecode from a flash-once usermod. A Linux backend may
interpret the same program, compile it to native code or WebAssembly, and lower
eligible pixel or image kernels to GPU shaders. Specialized C++ remains available
where a measured embedded workload justifies rebuilding firmware.

The durable compilation model is:

```text
Pixelblaze-compatible Pattern source --\
Native PXLBLZ authoring ----------------> typed visual IR --> PXLBLZ Program
PXLBLZ Show model ---------------------/                         |
                                                                +--> ESP/WLED VM
                                                                +--> native ESP C++
                                                                +--> Linux CPU/WASM
                                                                +--> Linux GPU kernels
                                                                +--> Pixelblaze artifact
```

Pixelblaze bytecode remains useful as a behavioral oracle and empirical reference,
but neither it nor Pixelblaze source semantics defines the new platform. PXLBLZ
preserves the qualities worth carrying forward: compact generative authorship,
immediate feedback, resolution independence, approachable controls, standalone
playback, and easy deployment. Fixed-point assumptions, one-pixel-at-a-time
execution, implicit lifecycle rules, and severe state and memory limits remain
compatibility concerns rather than native design constraints.

DDP provides the preceding live-preview path: authors can validate orientation,
mapping, color, and performance on stock WLED before installing the runtime.

The initial WLED product promise remains deliberately narrow even though the
architecture is broader:

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

This profile is an import and migration surface, not the native language
specification. Native PXLBLZ semantics may add explicit resources, buffers,
passes, structured simulation state, typed coordinate spaces, richer controls,
audio inputs, and color processing that Pixelblaze hardware could not support.
Compatibility code may preserve a Pixelblaze lifecycle or numeric profile when
needed; new work should not inherit those limits by default.

### 7.2 Typed visual IR

The visual IR is the durable boundary between authoring and execution. It models
what the program means without encoding browser JavaScript, Pixelblaze bytecode,
WLED APIs, or a particular processor. The first profile needs explicit forms for:

- Pattern kernels, functions, typed controls, globals, structured collections,
  arrays, and private instance state;
- frame, row or zone, and per-pixel computations;
- declared render targets, persistent buffers, textures, and pass dependencies;
- typed 1D, 2D, and later 3D coordinate spaces and transformations between them;
- color, palette, linear-light blend, noise, waveform, audio-feature, and
  deterministic random operations;
- Show score, Pattern identity, Continue/Restart, routing, layers, transitions,
  and render targets; and
- static resource sizes, scalable quality policies, output contracts, and
  provenance.

The IR is not initially a new author-facing language. It is the semantic model
that allows compatibility source, future native authoring, visual operations, and
the Show editor to produce one program for several measured backends. The model
should make expensive behavior visible enough for compilation, capability checks,
and graceful target-specific scaling without exposing hardware APIs to Patterns.

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

### 7.4 Derived zones and compositional transforms

A Show should be able to derive one Zone's output from another Zone's rendered
result. The simplest form makes Zone X display whatever Zone Y currently displays
without duplicating or re-running Y's Pattern. The same operation can attach a
transform chain such as mirror, rotate, scale, offset, crop, palette or color
shift, opacity, mask, or blend.

This is more than an editor shortcut. It establishes a reusable visual-source
primitive in the Show model and IR:

```text
Zone Y render target --> spatial transform --> color transform --> Zone X
```

The compiler represents the relationship as a render-target reference and
transform chain. It shares Y's computed pixels where the target permits sampling,
then specializes or fuses the chain for smaller devices. Zone dependencies form
an acyclic graph by default. A deliberate cycle is a feedback effect and requires
an explicit delayed buffer, bounded storage, and a target that advertises that
capability. Copy, mirror, and color shift should not accidentally become a second
Pattern instance with divergent state.

### 7.5 Program optimization

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

### 7.6 Portable WLED runtime

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

### 7.7 Show representation

Simple WLED presets and playlists cannot preserve the complete PXLBLZ Show model.
The PXLBLZ Program therefore represents the Show directly as a kernel table,
Pattern-instance and state table, control table, score, routing data, transition
programs, render-target plan, and resource manifest.

This avoids flattening the Show into duplicated Pixelblaze source. Six instances
of one Pattern carry one kernel and six private state blocks. Continue/Restart,
property animation, spatial transitions, and logical routing remain explicit
runtime semantics rather than generated source conventions. Native WLED presets
may select or configure the PXLBLZ Effect but are not the Show's canonical model.

### 7.8 Target backends

The PXLBLZ Program is the portable semantic artifact; bytecode is one execution
format rather than the abstraction itself. A package may retain source and typed
IR, carry a compact baseline executable, and cache target-specific artifacts that
can always be rebuilt from the authoritative representation.

The ESP portable backend emits compact, uploadable bytecode. It supports rapid
iteration, program catalogues, compatibility validation, and installation without
firmware rebuilds. The ESP native backend lowers the same optimized IR into C++
specialized for an exact board, resolution, and Show. It removes interpreter
dispatch and may fuse more operations, but it requires a new firmware build.

A Linux CPU backend may begin as a reference interpreter, then compile eligible
code to native ARM64 or WebAssembly after profiling. A Linux GPU backend lowers
pure pixel and image-space kernels to a supported shader representation while the
CPU retains Show scheduling, stateful simulation, audio analysis, resource
management, and output orchestration. GPU execution is an optimization of the
same semantics, not a second authoring model.

Every backend is an optimization tier for measured workloads. Deterministic
fixtures must compare each retained backend against the same reference interpreter.

### 7.9 Pi-class Linux appliance

The higher-capacity standalone target is a local Linux ARM64 appliance rather
than a remote rendering service. Compute Module 5 is the current reference shape,
but the contract is a capability profile rather than one permanent board. The
device boots directly into PXLBLZ, serves its authoring and control surface over
the local network, stores Programs and Shows locally, and continues playback when
the browser disconnects or the wider network disappears.

The appliance may use direct HUB75 hardware, an internal real-time output
coprocessor for parallel addressable-pixel lanes, or WLED devices receiving
completed frames over a private wired or wireless network. WLED remains a useful
output substrate in the last case, but it does not define Linux runtime semantics.
Local USB or I2S audio capture supplies waveform and derived audio resources
without a PC or cloud service.

A productized unit requires appliance concerns beyond raw compute: durable eMMC
storage, read-only or atomic system updates, watchdog and recovery behavior,
thermal management, predictable startup, and a small carrier or output board.
Those requirements belong to the target package and do not leak into the visual
program.

### 7.10 Shadertoy and shader-shaped authoring

Shadertoy demonstrates the most GPU-friendly subset of this model. It compiles a
GLSL fragment function, supplies uniform inputs such as time and resolution, and
runs the function independently for the pixels of a full-screen image. Texture
channels and additional buffers allow multi-pass composition and frame-to-frame
feedback. The GPU driver compiles the shader source; JavaScript primarily owns the
editor, uniforms, resources, and draw loop.

PXLBLZ should use Shadertoy as an execution and authoring precedent, not adopt it
as the complete runtime. A Shadertoy-like kernel maps naturally to the IR's
pixel-kernel phase and a Pi GPU backend. It does not by itself model stateful Show
choreography, Zone routing, controls, CPU-side simulations, arbitrary installation
topology, output devices, or bounded execution on ESP hardware.

Direct Shadertoy or Interactive Shader Format import can remain outside the first
increment while the IR preserves the required shapes: typed vectors, uniforms,
samplers, render targets, pass dependencies, and explicit feedback buffers. A
future native PXLBLZ syntax may offer a shader-shaped kernel without making GLSL
the canonical language.

### 7.11 Numeric and visual parity

PXLBLZ Fast preview remains the responsive authoring runtime. A typed IR reference
interpreter becomes the target-neutral conformance oracle. Precise preview and real
Pixelblaze hardware remain compatibility oracles for imported Pixelblaze source.

The ordinary PXLBLZ runtime should use the fastest qualified numeric policy for
the target, expected initially to favor native 32-bit floating point. A declared
Pixelblaze-compatibility profile may preserve fixed-point behavior when a Pattern
depends on it. Accepted backend differences are measured and reported rather than
silently described as identical execution.

### 7.12 Output and color

Every runtime produces logical RGB or RGBW frames behind a target adapter. The
WLED adapter writes through the Segment pixel API; WLED retains authority over
Segment transforms, address mapping, global brightness, automatic brightness
limiting, bus selection, chipset timing, and physical transmission. A Linux
adapter may write directly to HUB75 hardware, transfer complete frames to an
internal output coprocessor, or stream them to WLED nodes. Pattern and Show
semantics do not change with that choice.

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

Distribution separates the portable Program from target runtime packages with
different compatibility boundaries.

The reproducible **WLED runtime firmware package** should contain:

- PXLBLZ runtime usermod source and its WLED Effect registration;
- supported PXLBLZ Program ABI, operations, and numeric profiles;
- WLED commit/tag, PlatformIO environment, board, and required build flags;
- supported hardware, panel, matrix-size, and resource profiles;
- build identity, source, licenses, and installation and recovery instructions;
  and
- an optional prebuilt firmware image for the exact named board.

The reproducible **Linux appliance package** should contain:

- supported PXLBLZ Program ABI, operations, numeric profiles, and CPU/GPU
  capabilities;
- the local PXLBLZ service, target adapters, browser application, and startup
  configuration;
- operating-system image, update and rollback policy, watchdog and recovery
  behavior, and exact board or module profile;
- audio and output-driver support with named compatible interfaces; and
- build identity, source, licenses, integrity metadata, and recovery image.

The uploadable **program package** should contain:

- the validated PXLBLZ Program header, authoritative typed representation or
  portable executable, code table, and state layout;
- compiler, optimizer, Program ABI, and operation-profile identity;
- Pattern or Show identity, controls, output dimension, and numeric contract;
- Show score, Pattern-instance table, routing, transitions, and render-target plan
  when applicable;
- optional compiled coordinate or address-map resources;
- source Pattern, Show, library, and map provenance;
- resource requirements, integrity hash, and compatibility warnings; and
- optional rebuildable target artifacts such as ESP bytecode, native ARM64 or
  WebAssembly modules, GPU shaders, and WLED preset or Segment assistance.

Program packages are portable across runtimes that advertise the same semantic
ABI, required operations, and sufficient resources. Target caches may name an
exact environment but must not become the only retained representation. Installing
a Program cannot repair incompatible WLED firmware or an incompatible appliance
image.

## 11. Deployment paths

WLED and the Linux appliance are parallel standalone targets after a shared
authoring and compilation path. The numbered WLED levels describe adoption
friction rather than a sequence that must culminate in Linux.

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

### Pi-class appliance path

A development image runs the reference or CPU backend on a named Raspberry Pi,
stores Programs locally, accepts local browser connections, captures local audio,
and drives one qualified output adapter. A later Compute Module carrier and
appliance image package power, storage, recovery, audio, and output into a turnkey
controller. CPU-native and GPU backends replace or supplement interpretation only
after the shared Program and conformance fixtures work.

The appliance requires no remote server for compilation, playback, audio, or
ordinary control. Optional network output nodes remain part of the installation,
not an external source of animation horsepower.

## 12. Delivery sequence

### Phase 0: Semantic and runtime feasibility spike

The first gate proves that one deliberately narrow semantic profile can travel
through a PXLBLZ-owned compiler and execute on materially different targets. It
should:

1. select a representative corpus from current PXLBLZ content: one stateless
   Pattern, one stateful Pattern with arrays, one coordinate-heavy 2D Pattern,
   and one small Portable 2D Show with two Pattern identities, Continue/Restart,
   property animation, one spatial transition, and one derived Zone that mirrors
   and color-shifts another Zone;
2. define the minimum accepted Pixelblaze-compatible source semantics and native
   typed visual IR required by that corpus, with explicit diagnostics for
   everything outside the compatibility profile;
3. lower the corpus into the IR and execute it in a pure TypeScript reference
   interpreter, comparing deterministic frames with Fast preview, Precise
   preview, and real Pixelblaze output where applicable;
4. emit the first PXLBLZ Program and execute it through the portable WLED runtime
   on an ESP32-S3 HUB75 target;
5. execute the same Program through a headless Linux CPU runner on a Pi-class
   ARM64 target without changing its semantics; and
6. lower one eligible stateless pixel kernel to a fragment shader as a bounded
   feasibility test, not as a commitment to shader-first authoring.

The spike records accepted source features, IR operations, Program bytes,
runtime flash, static state and render-target memory, operations per frame,
frame rate, watchdog behavior, compilation time, and frame parity. ESP32-S3 with
PSRAM remains the preferred first embedded runtime target. Raspberry Pi 5 or
Compute Module 5 is the initial Linux development reference, not a permanent
hardware decision.

The embedded go bar is execution of the representative stateful 2D Show at
64x32, or 2,048 pixels, without Pattern-specific C++, source flattening, manual
binary patching, or a host connection. The Linux go bar is autonomous playback
of the same Program with local storage and one qualified output path; it does not
yet require a product enclosure or a retained GPU backend. Every material visual
difference must be explained. If the ESP Program cannot meet its frame budget
despite structural optimization, narrow that target's capability profile or use
its native backend rather than shrinking the platform's canonical semantics. Do
not turn the spike into an open-ended language implementation.

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
property animation, selected transitions, and a derived-Zone transform chain at
32x32 and 64x32.

### Phase 4: Packaging, multi-backend evidence, and adoption

Define the runtime capability handshake and versioned Program-package format.
Upload and replace Programs without reflashing the runtime. Compare portable and
native C++, Linux CPU, and any GPU output generated from the same IR. Retain each
optimization tier only for target profiles or complexity classes with a material
measured benefit. Run the WLED installation-friction probe before broadening its
hardware support.

### Phase 5: Mapping, HUB75 expansion, and turnkey runtime

Add address-map import/export, gaps, exact Installation coordinates, presets,
Segment setup assistance, compatibility manifests, and guided runtime installation.
Qualify one 64x64 HUB75 profile at 4,096 pixels on suitable ESP32-S3 hardware only
after the 2,048-pixel profile has measured CPU and memory headroom.

In parallel, package the Linux runner as a local appliance prototype with audio
input and one direct or coprocessor-backed output adapter. Measure higher
resolution, multi-pass, persistent-buffer, and audio-reactive workloads before
choosing interpretation, native compilation, WebAssembly, or GPU lowering as its
production execution strategy.

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
- the same Program executes autonomously through a Pi-class Linux CPU runner;
- reference, portable, Linux, and any retained native or GPU output agree under
  deterministic fixtures;
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

### Smallest-common-denominator semantics

Using one Program across ESP and Linux targets can tempt the language and Show
model to preserve every limit of the smallest controller. That would reproduce
the compromises this platform is intended to escape.

**Mitigation:** make native PXLBLZ semantics authoritative; give each target an
explicit capability and resource profile; permit compile-time rejection or
quality scaling on constrained devices; and keep Pixelblaze behavior in a named
compatibility profile. Portability means a shared meaning and honest capability
check, not guaranteed execution of every Program on every device.

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

### Multi-backend divergence

Portable Program, native C++, Linux CPU, and GPU output can drift in numeric
policy, lifecycle, control behavior, sampling, or optimization semantics.

**Mitigation:** keep one authoritative typed IR and reference interpreter; run
the same deterministic fixtures against every backend; specify numeric, texture,
and color profiles in the artifact; and retain an optimization tier only where
measured performance justifies its permanent conformance burden.

### GPU boundary and shader-shaped scope

GPU throughput can encourage a second shader language or force stateful Show
behavior into a per-pixel execution model that cannot represent it cleanly.

**Mitigation:** lower only pure pixel and image-space kernels to the GPU; keep
Show scheduling, structured simulation, resource ownership, and output on the
CPU; treat Shadertoy as a precedent and possible import surface rather than the
canonical runtime; and qualify multi-pass and feedback through explicit render
targets in the shared IR.

### WLED resource limits

Show compilation can multiply Program code, private runtime state, render
targets, and per-pixel instruction work. WLED transitions may also execute
current and outgoing Effects in one frame.

**Mitigation:** target ESP32-class boards, retain the Show compiler's resource
ledger, add WLED-specific CPU/heap/flash budgets, and qualify named matrix sizes.

### Physical output throughput

A Pi-class renderer can produce frames faster than a single serial pixel lane or
network node can transmit them. More CPU or GPU does not remove LED protocol,
panel refresh, wiring-distance, or network-bandwidth limits.

**Mitigation:** model output bandwidth separately from render cost; qualify named
parallel-lane and HUB75 adapters; use an internal real-time coprocessor where Linux
timing is unsuitable; and use WLED nodes as distributed output only when physical
topology justifies the network boundary.

### Linux appliance operations

Linux adds storage corruption, updates, boot time, thermal behavior, service
recovery, and driver qualification that do not exist in the same form on an ESP.

**Mitigation:** define the product as an appliance rather than a general-purpose
computer; prefer eMMC, atomic or read-only system images, watchdog recovery, and
named audio and output adapters; and keep playback independent of the browser,
internet, and remote services.

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
one complete Program across the reference interpreter and narrow embedded and
Linux runners, and require evidence before productionizing broad strip support,
distributed output, shader import, or other ecosystems.

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
- a production Pi-class carrier board or finished appliance image;
- a general-purpose GLSL, Vulkan, or WebGPU programming environment;
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
- WLED 16+ on ESP32-class hardware is the initial embedded controller family.
- A Pi-class Linux ARM64 appliance is a first-class prospective target from the
  same Program; Raspberry Pi 5 and Compute Module 5 are development references,
  not permanent hardware commitments.
- DDP is the stock-firmware preview path, not the installed artifact format.
- Pixelblaze-compatible source is an import and migration boundary, not the
  native PXLBLZ language or semantic specification.
- A typed PXLBLZ visual IR is the authoritative executable model shared by all
  new backends.
- A PXLBLZ Program is the portable semantic artifact. Compact bytecode, native
  code, WebAssembly, and GPU shaders are possible execution forms rather than the
  cross-target abstraction.
- A flash-once WLED runtime executing compact, uploadable Programs is the
  preferred embedded standalone backend.
- A Linux appliance runs locally and remains independent of a browser, remote PC,
  cloud service, or external animation server during playback.
- Native WLED C++ generated from the same IR is an optional measured performance
  tier, not a separate compiler architecture.
- A complete PXLBLZ Show compiles structurally from the Show model into shared
  code, private instance state, choreography, routing, transitions, and an exact
  resource plan rather than first flattening into duplicated Pattern source.
- A Zone may derive its image from another Zone through explicit spatial, color,
  mask, opacity, and blend transforms without duplicating the source Pattern or
  its state.
- Shadertoy's fragment-kernel and buffer model informs GPU lowering, but GLSL and
  Shadertoy do not define the complete PXLBLZ runtime.
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
- WLED devices may serve as network output nodes for a central appliance; using
  several devices as independent renderers is not the default scaling strategy.
- WLED Effect import into PXLBLZ is not part of this direction.

## 18. Open decisions

- Which exact ESP32 and ESP32-S3 boards form the first support matrix?
- Which Pixelblaze-compatible language features define source profile 1?
- What native PXLBLZ authoring syntax or structured model should expose features
  that have no Pixelblaze equivalent?
- Which typed forms and operations define visual IR version 1, and how are saved
  sources and Programs migrated across later versions?
- Does a Program retain typed IR as its portable executable representation, carry
  a custom bytecode baseline, or contain both? If bytecode is retained, should it
  use a stack, registers, or a mixed representation?
- Which common visual operations deserve purpose-built superinstructions only
  after profiling?
- Which numeric profile is the default, and which Patterns genuinely require a
  Pixelblaze-like 16.16 compatibility mode?
- Which workload and deployment evidence should choose interpretation, native
  ARM64, WebAssembly, or GPU lowering for the Linux appliance?
- Which IR kernels can lower safely to fragment or compute shaders, and which
  texture, sampling, feedback, and numeric rules form the conformance contract?
- Which direct HUB75, internal output-coprocessor, and WLED-network paths form the
  first Pi-class output profile?
- Which local audio interfaces and derived waveform, spectrum, loudness, onset,
  beat, and tempo resources belong in the first native input profile?
- Which derived-Zone transforms belong in the core Show model, and how should an
  explicit feedback dependency declare its delayed buffer and resource cost?
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
- Raspberry Pi 5 architecture and GPU capabilities:
  https://www.raspberrypi.com/news/introducing-raspberry-pi-5/
- Compute Module 5 hardware and productization model:
  https://www.raspberrypi.com/documentation/computers/compute-module.html
- Raspberry Pi HUB75 output and Pi 5 GPU-rendering prior art:
  https://github.com/hzeller/rpi-rgb-led-matrix and
  https://github.com/bitslip6/rpi-gpu-hub75-matrix
- RP2040 parallel addressable-pixel output precedent:
  https://learn.adafruit.com/introducing-feather-rp2040-scorpio
- Shadertoy uniform and fragment-kernel reference:
  https://www.shadertoy.com/view/MsySzy
- OpenGL fragment-shader execution model:
  https://www.khronos.org/opengl/wiki/Fragment_Shader
