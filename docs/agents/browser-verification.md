# Browser verification

Browser checks on this app fail in a few characteristic ways that look like
product bugs and are not. `CLAUDE.md` sets tool order — in-app browser first,
then the repo Playwright suites. This page covers the traps once you are there.

## Read the right canvas

`document.querySelector('canvas')` returns **Monaco's editor ruler canvas**
(roughly 35×12), not the preview. The preview canvas is `canvas.rounded-sm`,
roughly 308–320 square.

Reading the wrong one reports zero lit pixels and looks like a dead render loop.
An earlier `?screenshot` timer-driven render mode was built on exactly that false
reading and reverted as unnecessary. Select the preview canvas explicitly before
concluding anything about the renderer.

No app change is needed to capture it: the preview paints an initial frame
synchronously on mount, and capture drives animation frames even while the tab is
hidden, so a capture always reflects live state.

## A blank or timed-out capture is a wedged extension

The signature is unmistakable once seen. The capture times out — "waited 45000ms
for `document_idle`" — on *every* tab, including unrelated ones, while page
JavaScript answers instantly and `document.readyState` is `complete`.

The background and tabs APIs stay healthy throughout, so a successful `navigate`
does **not** prove recovery. Only a screenshot or content-script read does. The
wedge has survived reloading the extension, closing all windows, and restarting
the client; a hard **Cmd-Q quit** of the browser is the thing to try before
spending more time. Each failed attempt costs a fixed 45 seconds, so test once
per fix attempt rather than retrying in a loop.

To keep working without a capture: the tools that wait for `document_idle`
(`find`, `read_page`, screenshot) time out under the continuous render loop, but
`Runtime.evaluate` is not gated on it and works instantly while the loop runs.
Enumerate and click through it, and read `document.body.innerText` back:

```js
Array.from(document.querySelectorAll('button')).map(b => b.getAttribute('aria-label'))
```

Pausing the preview first settles the page. This path has driven a full
discover → connect → live-panel verification with no screenshot at all.

## A screenshot dismisses hover-only tips

Playwright and CDP screenshots close the shared hover/focus tip
(`DisabledReasonTip`) and every native `title` tooltip: the tip is open in the
DOM the instant before the capture and gone in the image. That is why the #862
campaign screenshots showed no tooltips on hardware. To photograph a tip, give
its control keyboard focus (`element.focus()` or Tab) and capture; focus keeps
the tip open through the screenshot. To assert a hover tip without a picture,
read `aria-describedby` and the tip's `hidden` attribute after a real
`page.mouse.move` onto the control.

## Verifying Studio as the synthetic user

To drive an issue runtime as its synthetic user, `npm run dev:session -- --issue
<n>` prints a `pxlblz_session` cookie. Set it via `document.cookie`, then
force-reload the route — the client chrome can still show a stale user until you
do, while `/api/me` already reports the synthetic identity.

Use **path** routes (`/PXLBLZ-IDE/studio/controllers/<id>`); hash routes do not
work. To get content without hardware, POST complete records to the
personal-content API — `/api/controllers` accepts a full `ControllerProfile`
JSON; mirror `defaultControllerProfile`.

Audit overflow by walking `scrollWidth > clientWidth` under the relevant
`data-testid` rather than eyeballing screenshots.

## Recording UI proof for the review gate

Since #940 a candidate that changes a path named in `wrsp-ui-proof.json`
(component TSX, `src/App.tsx`, stylesheets) cannot reach `review:candidate`
without a fresh proof record. The record is the route actually driven, not a
green suite. Recipe:

1. Build the UI commit first. Note its full commit id: `git rev-parse HEAD`.
2. Drive the route in a real browser at that commit: the Codex in-app browser
   first, against a managed runtime serving this worktree, as the task's
   synthetic user. Perform the spec's stated operation, then take the
   screenshot. Playwright is the fallback and needs the same honest
   provenance.
3. Save the image under `.wrsp/ui-proof/<issue>-<slug>.<ext>` with the
   extension matching its bytes. Check: `file <path>` must report PNG or
   JPEG (WebM and MP4 also qualify for recordings); a browser that hands
   back JPEG bytes under a `.png` name gets renamed, not trusted. Then open
   the file and look at it. The gate only sniffs the leading bytes; an image
   that does not open, or shows the wrong state, is not proof.
4. Write `.wrsp/ui-proof/<issue>-<slug>.json`:

   ```json
   {
     "version": 1,
     "issue": "<issue>",
     "route": "/PXLBLZ-IDE/studio/shows/<id>",
     "operation": "What was done on the route, in one or two sentences",
     "captures": [".wrsp/ui-proof/<issue>-<slug>.png"],
     "capturedAtCommit": "<full 40-hex commit id from step 1>"
   }
   ```

   Only these keys are allowed; `capturedAtCommit` must be the full id, never
   `HEAD` or a short id.
5. Commit the record and capture as the candidate tip, then run
   `npm run check:ui-proof -- <base> <tip>`. It prints one `✓` line per
   accepted record or `UI PROOF BLOCKED` with the rejection reason. A `✓`
   means the record is well-formed, every capture is present, non-empty,
   carries a recognised media signature, and is fresh for the range. It does
   not mean the gate decoded the image or established where it came from;
   the reviewer opens the capture and checks it against the named route and
   operation.

Any further change to a UI path after the capture marks the record `stale`;
re-drive the route on the new build and re-capture. Committing the record and
its captures never triggers or invalidates the gate. Remember the hover-tip
caveat above: give a control keyboard focus if the proof must show a tip.

## Chrome cannot reach the LAN device on macOS

If Chrome alone cannot reach the controller with `ERR_ADDRESS_UNREACHABLE` while
terminal tools and other browsers succeed, the cause is macOS Local Network
privacy store corruption — not the app, and not a Chrome content setting. This is
an Apple bug that persists across macOS 15 and 26.

**The general discriminator** is `chrome://net-export`: Start Logging to Disk,
reproduce, Stop, then read the failing socket event's `os_error`. A real syscall
errno (macOS `65` = `EHOSTUNREACH`, `61` = `ECONNREFUSED`) means the kernel
refused `connect()`, so the cause is OS or per-app policy. Chrome's own blocks —
Private Network Access, CSP `connect-src`, proxy/PAC, admin policy — produce
synthetic errors with no `os_error` at all. That single field collapses the
hypothesis space.

**Diagnostic fingerprint:**

- Terminal `ping`/`curl`/`nc` reach the device, and Firefox reaches it; Chrome
  fails in every profile and in Incognito.
- Chrome reaches the **gateway** but not **peer** hosts. This is the signature of
  the bug, not a falsification of it — macOS exempts the default gateway by
  design and gates only peers.
- `tcpdump` shows zero packets to the port while other traffic to the same board
  keeps flowing: the SYN never leaves the NIC, which is a local pre-transmission
  rejection.
- System Settings → Privacy & Security → Local Network shows many duplicate
  Chrome rows, all enabled, none effective.

**Root cause:** `plutil -p /Library/Preferences/com.apple.networkextension.plist`
shows dozens of Chrome entries pointing at throwaway `code_sign_clone` paths.
Each silent Chrome auto-update re-registers Chrome as a new identity until the
grant for the running binary can no longer bind.

**What does not work:** toggling the Local Network switch, reinstalling Chrome,
`tccutil reset`, or `sudo rm` on the plist — the file is SIP-protected by path.
The `com.apple.FinderInfo` detritus on the bundle is a red herring.

**The fix** requires Recovery Mode: boot to Recovery and `csrutil disable`, then
from macOS `sudo rm /Library/Preferences/com.apple.networkextension.plist` and
its `.uuidcache.plist` sibling, reboot to Recovery to `csrutil enable`, then open
Chrome, load the peer IP, and click Allow on the local-network prompt. Verify
with `tcpdump` that a SYN now leaves and is answered. This resets local-network
grants for all apps, each of which re-prompts once. Without Recovery Mode, a
different-bundle-id browser such as Chrome Canary gets its own clean grant. The
store slowly re-pollutes over future Chrome updates; the same reset is the cure.

## Producing README assets

The README's animated GIFs come from the deterministic renderer plus ffmpeg:

```bash
npm run render -- --demo <Name> --seconds 6 --fps 30      # needs dev:main on 5174
```

Pass `--diffusion 0..1` or `--light-size 0.15..0.95` to override the mounted
Pattern or Show presentation without changing its saved settings. For example,
the Quadrille launch GIF uses `--diffusion 0.8 --light-size 0.7`.

Encode a looping GIF with an ordered Bayer dither:

```bash
ffmpeg -y -i /tmp/pxlblz-renders/<name>.mp4 \
  -filter_complex "fps=12,scale=560:-1:flags=lanczos,split[base][palette];[palette]palettegen=max_colors=128[colors];[base][colors]paletteuse=dither=bayer:bayer_scale=5" \
  -loop 0 <name>.gif
```

The ordered dither is visually indistinguishable from Floyd-Steinberg on the
LED dot grid and reduced the measured Quadrille GIF from 10.5 MB to 7.1 MB at
diffusion 0.5. The diffusion 0.8 / light size 0.7 version measured 7.9 MB.
Busy multi-Zone Shows run near 1 MB/s at 560 px; smoother diffusion generally
compresses better.

Since #697 the render script accepts `--file <variant.js> --demo <MountDemo>`,
where the demo names the mount point whose map and preview config are used. This
renders 3D variants directly and replaces the old manual browser capture
workaround. Export defaults can run far hotter than in-app slider use is tuned
for, so shipped GIFs may use a calmer variant than the demo's defaults.

Since #879 the renderer also records Shows and starts at an offset:

```bash
npm run render -- --show stock-show-showcase-distortion-effects --start 7 --seconds 2.5 --fps 30
npm run render -- --demo <Name> --start 12 --seconds 4
```

`--start` pre-rolls headless in 1000/fps steps (no paint, no sink), so frame K
sits at `start + K/fps` and is byte-identical to frame `start*fps + K` of a
t=0 render at the same fps. `--show` opens `studio/shows/<id>?capture`
signed in as the synthetic local developer session (`npm run dev:session`
mints the same cookie), hides the IDE chrome, and drives
`window.__pxlblzShow.captureSequence` on `ShowStagePreview`: pause, seek the
transport to 0 for a fresh runtime, pre-roll with `advanceTo`, then step
recorded frames with `advanceLive` (the editor's post-seek playback path) and
save each from inside `paintFastFrame`. Stock Shows work unauthenticated to
the API; personal Shows are out of scope. `--width` must exceed 980 or the
Show workspace hides the stage pane. The stage canvas lands a few px short of
`--width` because of pane padding. The runtime keeps advancing past the loop
point rather than rewinding, matching the compiled Pattern on hardware.

Both capture paths take over an armed 3D auto-orbit for the duration
(`src/dev/captureOrbit.ts`): reset to the canonical view, disarm the wall-clock
turntable, and advance the camera by the same virtual delta as every pattern
step, pre-roll included. The per-step camera is parked in a component ref
that both paint paths prefer over the camera store, so no store write repaints
mid-capture; the store receives the final camera once at the end. A 3D render
is therefore deterministic across runs and `--start` values (verified:
AuroraSphere `--start 2` frame 0 == t=0 frame 20 at 10 fps, byte-identical
across two t=0 runs). A camera the user has disarmed is held where it is.

The banner and launch button are Playwright element screenshots of scratch HTML
built from the brand tokens.

To preview `README.md` locally with images at true GitHub width, convert with the
repo's `marked` dependency, wrap the body in `<article class="markdown-body">`
with `github-markdown-css`, constrain to `max-width: 830px` (the real GitHub
column, which is what matters for image legibility), write it to an untracked
file at the repo root, and serve the repo root over a plain local HTTP server so
relative `docs/screenshots/...` paths resolve. The agent browser pane only
attaches to origins it started itself, so hand over the URL rather than retrying.
