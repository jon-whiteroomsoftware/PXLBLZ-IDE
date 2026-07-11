# Issue #402 - Scene Splice Showcase catalog Show

Scene Splice Showcase is a deterministic 16.1-second Show for a 16x16 2D map.
It alternates two contrasting stock Patterns through the production spatial
portal compiler: Heat Shimmer Tiles opens outward into Neon Circuit Board with
a true blended feather, then an inverted off-center dithered portal returns to
the original Heat Shimmer instance. The final hold loops directly into the
first hold without resetting that member.

## Artifact

- Browser-exported EPE: `artifacts/electromage/scene-splice-showcase.epe`
- Source Patterns: stock `HeatShimmerTiles` and `NeonCircuitBoard`, ISC license
- Stage: stock Square 2D map
- Generated source: 14,213 bytes including provenance/header
- EPE envelope: 20,338 bytes with a 100x150 JPEG preview
- Device bytecode: 5,746 bytes on firmware 3.67
- Renderer policy: one renderer per pixel outside the blended feather; two only
  inside that bounded band

The exact exported file parses through the standard EPE importer and its source
ends with the deterministic compiler output byte-for-byte. Its banner carries
the permanent PXLBLZ URL and `show spatial-transitions` transforms; the readable
header records both source Patterns, licenses, scene holds, portal centers,
directions, feather widths, and feather policies.

## Hardware results

The exact EPE source was parsed from disk, compiled independently of Studio,
activated run-only on the 256-pixel controller, and observed past one complete
loop at brightness 0.3. Firmware-reported FPS was approximately:

- Heat Shimmer hold: 27-29 FPS
- Neon Circuit Board hold: 20-22 FPS
- Outward true-blend portal: 17-22 FPS
- Inward dithered portal: 23-28 FPS

The full sampled range was 17.2-28.6 FPS. The blended feather pays the expected
bounded second-renderer cost; the dithered return remains a one-renderer route.
The stock `SceneSplice` reference measured 49.84 mean FPS in #383, but is not an
isolated transition comparison because it uses much cheaper internal scene
functions. The connected physical matrix was reviewed and accepted: both source
Patterns and both portal directions were legible, the loop looked beautiful,
and no black flash or state reset was observed.

## Proposed catalog copy

**Scene Splice Showcase** turns two ordinary Pixelblaze Patterns into one looping
spatial composition. Heat Shimmer Tiles opens through a soft circular portal to
Neon Circuit Board, then a tighter off-center iris closes back to the still-live
heat scene. Inspect the generated source to see collision-safe Pattern isolation,
a controller-native timeline, and bounded feather-band blending. Built with
PXLBLZ-IDE. License: ISC.
