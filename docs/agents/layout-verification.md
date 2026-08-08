# Layout verification

The layout gate proves selected product surfaces in real Chromium. It does not
infer visual correctness from jsdom, screenshots, or text-presence assertions.
The shared `@whiteroom/software-process` package owns fault detection and the
fail-closed geometry canary; this repository owns the surfaces, states, widths,
and intentional exceptions that define PXLBLZ-IDE's contract.

## Gate shape

`npm run check:layout-gate` runs the packaged canary through the configured
`chromium-layout` runner. The canary must report a measurable 64px control and
one deliberate overflow. Missing output, duplicate output, zero-width geometry,
the wrong fault, or a failed runner blocks the gate.

`npm run test:layout` runs three layers in the same Browser Mode project:

1. `layoutEnvironment.layout.test.tsx` proves Chromium, the production
   stylesheet, root sizing, and production fonts.
2. `layoutCanary.layout.test.ts` proves the generalized package can measure and
   classify real geometry.
3. `layoutSurfaces.layout.test.tsx` renders the product manifest and requires no
   undeclared collapsed text, overflow, containment escape, or must-fit fault.

`wrsp.config.mjs` gives `layout-contract` authoritative ownership of the
manifest, its Browser Mode setup and tests, the mutation qualifier, and the
covered product components. Staging one of those paths selects the named
Chromium runner. A layout-sensitive `.tsx` or `.css` change outside that map
emits an advisory so the author must add coverage or justify why the change is
not a layout boundary.

## Product surface manifest

`src/test/layoutSurfaceManifest.tsx` is the reviewable risk map. Each entry
names a stable surface, fixes its viewport dimensions, seeds product state,
renders production components, and may declare a readiness condition or a
surface-specific policy annotation.

The initial manifest covers:

- the 352px live Controller panel with firmware notice, installed-map mismatch,
  brightness, pixel count, Pattern controls, power telemetry, and variables;
- the same panel after the map read reports no installed map;
- the offline Controller Profile at 375px with a long authored map name;
- the offline Controller Profile at 1280px with an unknown map identity; and
- the Preview control deck at 375px with a long Pattern name and authored
  slider, toggle, and color controls.

Add a manifest entry when a surface introduces a new width regime, a materially
different conditional subtree, or a previously regressed identity/control. Do
not multiply fixtures for cosmetic variants that exercise the same containment
and shrink behavior.

## Policy annotations and locations

The auditor reports the nearest `data-testid` as its stable location. Put test
IDs on meaningful identities or controls, not on arbitrary wrapper depth. The
installed-map contract uses `installed-map-presentation` and
`installed-map-name`; a failure therefore survives ordinary wrapper refactors.

Intentional exceptions live in DOM attributes that reviewers can see beside
the behavior:

- `data-layout-allow="overflow-x"` permits deliberate tail truncation while
  keeping other fault classes active.
- `data-layout-ignore` excludes browser-native or visually hidden subtrees whose
  geometry is not product layout, such as an `<option>` or an `sr-only` label.
- `data-layout-must-fit` requires complete horizontal visibility even when the
  element otherwise permits truncation.

The manifest applies `data-layout-must-fit` to the representative short
installed-map name. Production still permits long authored names to truncate,
but a name that should fit must never collapse behind fixed metadata again.
Avoid global ignore/allow annotations on a large container: the smallest
element that owns the exception should declare it.

## Historical #757 sensitivity proof

Run:

```bash
npm run test:mutation:layout-757
```

The qualifier temporarily adds the historical failure mechanism to
`ControllerFactRow`: a fixed narrow width starves the installed-map identity
beside non-shrinking metadata. It runs the product layout contract and succeeds
only when Chromium reports `installed-map-name` as a must-fit fault at 0px. A
`finally` block and explicit SIGINT/SIGTERM handlers restore
`ControllerPanel.tsx` byte-for-byte; the command also verifies the restored
content before reporting success. The npm entrypoint holds the repository-wide
suite lock while the production source is mutated, so no other heavy suite can
compile the temporary fault. Expected-failure screenshots are disabled for this
qualification and the command leaves no generated artifacts behind.

Run this qualification after changing the installed-map row, its presentation,
the manifest policy, or the generalized auditor. It is targeted evidence that
the oracle kills the known fault; it is not part of every fast pre-commit run.
