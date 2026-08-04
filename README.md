# PXLBLZ-IDE

PXLBLZ-IDE is a browser-based authoring environment for
[Pixelblaze](https://electromage.com/) LED controllers. Write and preview
Patterns with hardware-faithful math, give them real maps and reusable
libraries, then choreograph complete multi-Pattern **Shows** on a timeline —
and compile all of it into one ordinary Pixelblaze Pattern that runs on the
controller by itself.

**[Open PXLBLZ-IDE](https://pxlblz-ide.whiteroomsoftware.com/)**

No hardware is required to explore. The Gallery, editor, preview, Show
timeline, and documentation all run in the browser. When a Pixelblaze is on
your network, the companion
[Chrome extension](https://chromewebstore.google.com/detail/pxlblz-ide-controller-hel/hjdkmngopeofakdbjfkaomcmgkcidoeg)
connects it live.

![The Show editor: a timeline of Pattern Clips compiling into one Pixelblaze Pattern](docs/screenshots/show-visual-toolkit-overview.png)

## Why it exists

I built the Pixelblaze tool I wanted for myself. The original wishlist was
modest:

1. Develop and debug Patterns without a controller on my desk
2. Store Patterns and maps off-device
3. Reusable code libraries
4. Benchmarking and optimization tools

Getting there meant writing a real parser and compiler for the Pattern
language, and that foundation kept paying for itself: shared libraries became
practical, then safe code injection, then combining complete Patterns. The
compiler grew into a Show system — a video-editor-style timeline that
transitions between Patterns, animates their controls, and routes different
work to different zones, while still emitting one plain Pattern for the
hardware. PXLBLZ has gone well beyond the tool I originally wished for. I was
not dreaming big enough.

## What's inside

- **Gallery** — a public catalogue of built-in Patterns rendered live by the
  real preview engine, each with a shareable detail page and one-click
  **Open in Studio**.
- **Studio** — the signed-in workspace: Patterns, Shows, Maps, Controllers,
  Mixins, and Libraries in one three-pane environment with folders, search,
  and Trash. Personal content is saved to your cloud workspace.
- **The editor** — Monaco configured for the Pixelblaze language: completion,
  hover help, inline errors, and quiet auto-save. Exported controls and
  watched variables appear beside the preview, just as Pixelblaze users
  expect.
- **Faithful preview** — 1D, 2D, and 3D maps as a WebGL point field. **Fast**
  mode uses float64 for everyday editing; **Precise** mode emulates the
  hardware's 16.16 fixed-point math closely enough to expose the overflow bugs
  that make shader ports look fine on a laptop and explode on a controller.
- **First-class maps** — stock and custom maps as real Mapper JavaScript, a
  catalogue organized by physical geometry, and a strict separation between
  the coordinate a Pattern samples and the position the preview draws.
- **Libraries** — namespaced, documented, reusable functions (`SDF`, `Anim`,
  `Color`, `Coord`, `Noise`, `Shader` ship stock). Compilation tree-shakes and
  flattens only what a Pattern actually calls into its artifact.
- **Shows** — Clips on Layers and Zones under one proportional timeline, with
  first-class Transitions, Effects, Property animation, and deterministic
  seeking. A Show compiles into a single portable Pixelblaze Pattern; close
  the browser and the controller keeps performing it alone.
- **Controller integration** — discovery and live connection through the
  extension, Run/Save with the controller's own compiler, durable per-device
  profiles, hardware input bindings, power caps, and inspectable generated
  code. Nothing crosses to hardware except through a deliberate send.

## Accounts and storage

Gallery, documentation, preview, and live Controller access are public.
Studio uses GitHub or Google sign-in; personal content lives in an
authenticated cloud workspace rather than fragile browser storage. Signed
out, the app runs as a non-durable demo. Studio sign-in is opening up as
part of the v2 launch; if you arrive before it fully opens, new sign-ins
are still invite-only, and everything else works without an account. Controller traffic stays between
your browser and your local network — the hosted app never proxies it. The
[privacy page](https://pxlblz-ide.whiteroomsoftware.com/docs/privacy)
has the details.

## What it deliberately does not do

- It does not manage WiFi, LED hardware settings, playlists, or other device
  administration. The Pixelblaze web UI already does that well.
- It cannot recover source from a saved Pattern that contains only compiled
  code. Import `.epe` files or source-bearing programs instead.
- It does not synchronize a Show across several controllers.

## Documentation

The in-app **Docs** workspace is the primary reading surface; the same
Markdown lives in [`docs/`](docs/) in this repository.

- **[Pixelblaze Ecosystem Primer](https://pxlblz-ide.whiteroomsoftware.com/docs/ecosystem-primer)** —
  start here if the Pixelblaze platform itself is new to you.
- **[Feature Guide](https://pxlblz-ide.whiteroomsoftware.com/docs/feature-guide)** —
  a tour of every PXLBLZ surface, from Gallery to Shows.
- **[Understanding Maps](https://pxlblz-ide.whiteroomsoftware.com/docs/understanding-maps)** —
  the full pixel-map mental model.
- **[Visual Effects Guide](https://pxlblz-ide.whiteroomsoftware.com/docs/show-visual-toolkit)** —
  Effects, Transitions, and Property animation by example.
- **[Optimizing Pixelblaze Patterns](https://pxlblz-ide.whiteroomsoftware.com/docs/optimization-guide)** —
  measured frame costs and porting tactics.
- **[Inside the Show Compiler](https://pxlblz-ide.whiteroomsoftware.com/docs/show-compiler)** —
  how a timeline becomes one Pattern.
- **[Technical Reference](https://pxlblz-ide.whiteroomsoftware.com/docs/technical-reference)** —
  how the whole thing is built.

## Acknowledgement

Thanks to [Ben Hencke](https://electromage.com/about) and ElectroMage for
building Pixelblaze. It has been a small box with an outsized effect: a lot of
fun, and a generous way into making electronics feel approachable. PXLBLZ-IDE
is an independent project and is not affiliated with or endorsed by
ElectroMage.

## Previous release

The original 1.0 release remains available at
[jon-whiteroomsoftware.github.io/PXLBLZ-IDE](https://jon-whiteroomsoftware.github.io/PXLBLZ-IDE/),
with its docs pinned at the
[v1.0.0 tag](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/tree/v1.0.0/docs/reference).
Version 1 stored its workspace in the browser; version 2 is a new application
with cloud accounts, and does not migrate v1 browser storage.

## License and feedback

PXLBLZ-IDE is free and open source under the
[ISC license](LICENSE). Bug reports and suggestions are welcome on the
[issue tracker](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues);
general project mail can go to
[pxlblz@whiteroomsoftware.com](mailto:pxlblz@whiteroomsoftware.com).
