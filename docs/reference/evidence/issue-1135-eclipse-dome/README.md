# #1135 Eclipse Dome map and LumaCells: Studio proof

Captured 2026-09-25 from commit `4d06ee3a`, which carries the six-o'clock halo
start (`j / haloCount`). The worktree was served by the registry runtime
`1135:5179` (`npm run dev:issue -- --issue 1135 --profile shared`), against
main's shared API and local D1. Repo Playwright (Chromium) drove the routes at
1440 × 900. Neither route raised a console error or a Vite overlay.

- `eclipse-dome-map-studio.png`: `/studio/maps/eclipse-dome-2d`, signed in
  with the `dev:session -- --issue 1135` developer session in a separate
  browser context. The map is listed under Built-in Maps › Custom / Imported
  and opens read-only. The wire-order gradient runs from the apex outward along
  the clockwise spiral. The halo starts at six o'clock and runs
  counterclockwise. The pane uses the Studio Preview size (1,024 px) and labels
  pixels from 1, so the first halo LED is index 836, exactly at six o'clock;
  its neighbour, labelled 838, is the nearest label. At the 490-pixel contract
  the halo begins at index 400.
- `lumacells-on-eclipse-dome-studio.png`: `/studio/patterns/LumaCells`, signed
  out in its own context. LumaCells is shown with the Eclipse dome map at 490
  pixels, set through the Pixelblaze section's map picker and pixel-count
  editor. Its cells pulse on the dome spiral and the halo. The source header
  shows the hexagonal lattice note.
