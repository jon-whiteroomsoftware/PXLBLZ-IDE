# About PXLBLZ

PXLBLZ-IDE is an IDE for Pixelblaze LED controllers, built around one idea:
do more with Patterns without editing code. Write and preview Patterns, add
functionality to existing ones, and recombine complete Patterns into Shows on
a timeline, the way a video editor arranges clips. Everything compiles into
one ordinary Pixelblaze Pattern, and the whole IDE runs in the browser — no
controller required.

## Why it exists

**I built the Pixelblaze tool I wanted for myself.**

A Pixelblaze Pattern is flexible and wonderfully portable, but it is also one
source file. Reusing code usually means copying it. Connecting hardware inputs
means modifying someone else's Pattern. A Controller can rotate through a
playlist, but every change is a hard cut.

PXLBLZ began by adding a real parser and compiler. That foundation made shared
libraries practical, then made it possible to inject and rewrite code, isolate
identifiers, and combine complete Patterns safely.

The compiler grew into a Show authoring system. A clip-based timeline can
transition between Patterns, animate their variables and render speed, move and
reflect their output, and send different work to virtual zones. The result still
compiles into one Pattern that runs on the Controller.

PXLBLZ has gone well beyond the tool I originally wished for. I was not dreaming
big enough.

## The project

PXLBLZ is an independent project by
[Jon Chester](https://www.linkedin.com/in/jon-chester). It is not affiliated
with or endorsed by ElectroMage. The application is free and open source under
the [ISC license](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/blob/main/LICENSE).
The [source code](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE) and
[public issue tracker](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues)
are on GitHub.

The codebase was written using Claude and Codex in roughly equal amounts,
working under a documented process: test-driven slices, cross-model code
review on every commit, mutation testing on the high-risk engines, and full
end-to-end suites before anything ships. Jon remains responsible for product
design, operation, and releases.

## Accounts, data, and Controllers

The Gallery, documentation, API reference, preview, and live Controller access
are public. Studio uses GitHub or Google sign-in when you want a durable personal
workspace.

Personal Patterns, maps, mixins, libraries, Shows, and Controller profiles are
stored in Cloudflare D1 and scoped to your account. Small device and session
preferences may remain in the browser. Production records page views and a small
set of product actions; local development and tests do not send analytics.

Controller communication stays between your browser and your local network
through the optional PXLBLZ browser extension. The hosted application does not
proxy that traffic.

## Acknowledgement

Thanks to [Ben Hencke](https://electromage.com/about) and ElectroMage for
building Pixelblaze. It has been a small box with an outsized effect: a lot of
fun, and a generous way into making electronics feel approachable.

## Feedback and bugs

Use [GitHub Issues](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues)
to report a bug or suggest an improvement. General project mail can be sent to
[pxlblz@whiteroomsoftware.com](mailto:pxlblz@whiteroomsoftware.com).
