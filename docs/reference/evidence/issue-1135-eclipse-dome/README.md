# #1135 Eclipse Dome map and LumaCells: Studio proof

Captured 2026-09-25 from commit `3caf1637`, rebased unchanged onto `c0a608ed`
as `2aa753fa`; main moved only in `docs/`, so everything outside `docs/` is
identical to the captured build. The worktree was served by its own
worker-dev Vite process on port 5290, outside the runtime registry, after
`npm run preflight -- port 5290`. It used a throwaway, worktree-local migrated
D1 store; the stale registry assignments left no issue runtime free. Repo
Playwright (Chromium 1223) drove the routes at 1440 × 900.

- `eclipse-dome-map-studio.png`: `/studio/maps/eclipse-dome-2d`, signed in
  with the `dev:session` developer session in a separate browser context. The
  map is listed under Built-in Maps › Custom / Imported and opens read-only.
  The wire-order gradient runs from the apex outward along the clockwise
  spiral. The halo starts at six o'clock and runs counterclockwise. The pane
  uses the Studio Preview size (1,024 px), so the halo begins at index 836
  (the pane labels pixels from 1). At the 490-pixel contract it begins at
  index 400.
- `lumacells-on-eclipse-dome-studio.png`: `/studio/patterns/LumaCells`, signed
  out. LumaCells is shown with the Eclipse dome map at 490 pixels, set through
  the Pixelblaze section's map picker and pixel-count editor. Its cells pulse
  on the dome spiral and the halo. The source header shows the hexagonal
  lattice note.

The Vite dev overlay reported a D1 foreign-key failure when saving a Studio
setting. The throwaway store had no seeded identity row. It is not a product
fault, and the overlay was removed before each capture.
