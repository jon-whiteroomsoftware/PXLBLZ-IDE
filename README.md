# PXLBLZ-IDE

PXLBLZ-IDE is a browser-based pattern editor for
[Pixelblaze](https://electromage.com/) LED controllers. It lets you write,
preview, tune, and export Pixelblaze patterns without needing a controller on
your desk, then push the result to hardware when you are ready.

The IDE can be run from the link below and is fully functional. If you later
want to connect to a controller, install the companion Chrome extension.

**[Open PXLBLZ-IDE](https://pxlblz-ide.pages.dev/)**

## Why it exists

I started this project to address some wishlist features I had for Pixelblaze:

1. Develop and debug patterns without a controller
2. Store patterns and maps off-device
3. Reusable code libraries
4. Benchmarking and optimization tools

The IDE provides these four features, and a few others:

- A rich editor with autocomplete, hover help, background compile errors, and
  quiet auto-save.
- A live 1D / 2D / 3D preview that can show patterns rendered as lines, rings,
  poles, flat 2D maps, cylinders, shells, and volumes.
- A software renderer with hardware-accurate 16.16 fixed-point math.
- First-class maps (named, saveable), including stock 2D and 3D maps plus your
  own.
- Bundled libraries for SDFs, animation, color, coordinates, noise, and
  ShaderToy-style porting helpers.
- Copy / download of a flat, tree-shaken `.js` controller-ready artifact, or push
  it straight to your controller.
- Benchmarking scripts that automate perf testing under emulation and on device.

## What else works today

- Connect to a Pixelblaze over the local network through the companion Chrome
  extension. Run or save patterns and maps to a controller.
- Uses ElectroMage's discovery service to find controllers on your local network.
- Edit user patterns in the browser and preview them in the IDE or on a controller.
- Import `.epe` files exported from Pixelblaze.
- Clone shipped demos and stock maps into editable copies.
- Tune preview-only display controls such as light size, diffusion, solidity,
  playback speed, and Fast / Precise rendering.
- Use pattern controls and watch exported variables in the preview.

## What it does not do

- It does not manage saved patterns, playlists, WiFi, LED hardware settings, or
  other device administration. Use the Pixelblaze web UI for that.
- It does not read patterns back from a controller. Import `.epe` files instead.

## Acknowledgement

Thanks to [Ben Hencke](https://electromage.com/about) and ElectroMage for
building Pixelblaze. It has been a small box with an outsized effect: a lot of
fun, and a generous way into making electronics feel approachable.

## Bundled libraries

Open the **Code** menu in the app header for source and hover summaries.

| Library  | What it provides                                                                      |
| -------- | ------------------------------------------------------------------------------------- |
| `SDF`    | 2D signed distance fields: circles, rects, rings, stars, polygons, smooth boolean ops |
| `Anim`   | Easing curves, oscillators, phase timing, looping primitives                          |
| `Color`  | HSV/RGB blends, palette interpolation, color math                                     |
| `Coord`  | Polar coordinates, rect-to-polar conversion, transforms                               |
| `Noise`  | Value noise, Voronoi distance, organic variation                                      |
| `Shader` | GLSL gap-fillers such as `fract`, `step`, `dot`, palettes, and hardware-safe hashes   |

## Good to know

- The Cloudflare deployment stores signed-in personal patterns, maps, settings,
  and controller metadata in D1. Signed-out use and local development fall back
  to this browser's IndexedDB. **Clearing site data clears only that local
  fallback workspace.**
- If the app does not reconnect to a Pixelblaze Controller when it opens, reload
  the browser window first. If it still does not pick up, manually disconnect and
  reconnect from the Controller menu.
- Preview controls affect only the on-screen preview. Controller variables and
  brightness live in the Controller menu.

## Local development

```bash
npm install
npm run dev
```

The normal development server runs at `http://localhost:5174/`.

Personal patterns/maps use browser-local IndexedDB in local development unless
you explicitly run a Cloudflare-style build with remote storage enabled.

Useful checks:

```bash
npm test
npx tsc --noEmit
npm run build
```

### GitHub Pages analytics

The production build installs Google Analytics only when
`VITE_GA_MEASUREMENT_ID` is set. For GitHub Pages, add a repository variable
named `GA_MEASUREMENT_ID` with your GA4 measurement ID, for example `G-XXXXXXXXXX`.
Local development and builds without that variable do not load Google Analytics.

### Cloudflare Pages deployment

GitHub Pages serves this app under `/PXLBLZ-IDE/`, but Cloudflare Pages serves it
from the site root. Root production builds default to the authenticated
D1-backed provider; GitHub Pages-style builds and localhost default to
browser-local IndexedDB.

The D1 binding is named `PXLBLZ_DB` in `wrangler.jsonc`, and points at the
Cloudflare database named `pxlblz-ide`. Apply the schema migration with:

```bash
npm run db:migrate:remote
```

That command requires Wrangler to be authenticated, either by running Wrangler in
an interactive terminal that can log in, or by setting `CLOUDFLARE_API_TOKEN`.
For local Cloudflare runtime checks after building:

```bash
cp .dev.vars.example .dev.vars
npm run cf:build
npm run db:migrate:local
npm run cf:dev:local
```

Then visit `http://localhost:8788/api/d1/health`; a migrated D1 binding returns
`{"ok":true,"schemaVersion":"1"}`.

For browser OAuth testing, fill in `.dev.vars` with a localhost GitHub OAuth app
whose callback URL is `http://localhost:8788/api/auth/callback`. For API-level
smoke without OAuth, run `npm run cf:session` and send the printed
`pxlblz_session` cookie with local requests.

The tracked Wrangler configuration also sets:

```txt
VITE_BASE_PATH=/
VITE_PERSONAL_CONTENT_PROVIDER=remote-api
```

Set `VITE_PERSONAL_CONTENT_PROVIDER=browser` in an explicit local environment
when you want to force browser-local fallback in a production-style build.

### Cloudflare GitHub OAuth

The backend uses GitHub OAuth/session endpoints for cloud-backed storage:

- `GET /api/auth/login` starts GitHub OAuth.
- `GET /api/auth/callback` exchanges the GitHub code, upserts the user in D1,
  and sets a signed `pxlblz_session` cookie.
- `GET /api/me` returns the signed-in GitHub user or `{ "authenticated": false }`.
- `GET` or `POST /api/auth/logout` clears the session cookie.

Create a GitHub OAuth app for the Cloudflare deployment and set its callback URL
to:

```txt
https://pxlblz-ide.pages.dev/api/auth/callback
```

For local end-to-end OAuth testing, create a second GitHub OAuth app with:

```txt
http://localhost:8788/api/auth/callback
```

Then set Cloudflare Pages environment variables/secrets:

```txt
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
SESSION_SECRET
GITHUB_ALLOWED_LOGINS      # optional comma-separated GitHub logins
GITHUB_ALLOWED_IDS         # optional comma-separated numeric GitHub ids
GITHUB_OAUTH_REDIRECT_URI  # optional override, useful for local testing
```

`SESSION_SECRET` should be a long random value, for example from
`openssl rand -base64 32`. When either allow-list variable is set, only matching
GitHub users can sign in. With neither allow-list set, any GitHub user can
authenticate. Signed-in users read and write personal patterns through
`/api/patterns`, personal maps through `/api/maps`, provider-owned settings
through `/api/settings/:key`, and controller metadata through
`/api/controller-metadata/:key`.

For production smoke checks, D1 inspection, exports, and restore notes, see
**[Cloudflare Operations](docs/reference/Cloudflare%20Operations.md)**.

## Documentation

- **[PXLBLZ Feature Guide](docs/reference/PXLBLZ%20Feature%20Guide.md)** - start
  here if you use Pixelblaze and want to know what the IDE does.
- **[Pixelblaze Ecosystem Primer](docs/reference/Pixelblaze%20Ecosystem%20Primer.md)** -
  background on the Pixelblaze model this project assumes.
- **[PXLBLZ Technical Reference](docs/reference/PXLBLZ%20Technical%20Reference.md)** -
  how the IDE is built: preview engine, maps, settings cascade, controller
  connection, storage, and the transpiler.
- **[Cloudflare Operations](docs/reference/Cloudflare%20Operations.md)** -
  how the production Pages/D1 deployment is configured, backed up, and smoked.

## Status

PXLBLZ-IDE is small, local-first, and still evolving. Expect rough edges, keep
copies of patterns you care about, and file issues with enough detail to
reproduce the problem.

## Where from here

This feels useful and feature-complete enough to call a 1.0, but it probably has
some bugs left to shake out. If you try it and something breaks, please open a
GitHub issue with enough detail to reproduce it.

More features are welcome if there is real interest, and pull requests are also
welcome. Small, focused changes with a clear use case are easiest to review.
