# PXLBLZ Show implementation model

Use the repository's current domain documents as authority. This reference records the implementation seam relevant to installation showcases.

## Artifact chain

A stock Installation showcase normally consists of:

1. Mapper-compatible raw JavaScript under `src/pixelblaze/stock/maps/sources/`.
2. A source-backed map entry in `src/pixelblaze/stock/maps/stockCatalogue.ts`.
3. One or more raw Pixelblaze Patterns under `src/pixelblaze/stock/patterns/`, discovered by the stock catalogue.
4. Recommended standalone preview settings in `src/pixelblaze/stock/patterns.ts`.
5. A stock Show entry in `src/pixelblaze/stock/shows.ts`.
6. Guide material in the Visual Effects Guide and, when user-visible behavior changes, the Feature Guide.

The Show must compile through the production artifact path. Do not substitute a Canvas-only prototype or preview-only shader.

## Installation contract

- Fix `outputMapId`, `pixelCount`, and `resolution: fixed`.
- Give each physical Zone a nominal count.
- Route every global output index exactly once in every active physical layout.
- Keep ranges contiguous when the wiring permits; document non-contiguous groups when the object requires them.
- Preserve the distinction between map `sample` coordinates used by Patterns and preview `pos` geometry used to draw the Stage.

## Shared composition

Use `ShowCompositionV1.patternInstances` to express identity explicitly. Several placements may reference one instance, which gives them one private clock and one Pattern evaluation path. Placement views and Effects can mirror or remap the source independently.

Top-level Scenes express the phrase score. Scene-local placements express canons, accumulation, and partial-phrase ownership. Cuts are appropriate when the score demands hard system changes and keep evaluation cost predictable.

## Verification

Cover at least:

- exact map point count and physical group boundaries;
- complete, non-overlapping installation coverage;
- phrase names, durations, and total Show duration;
- composition validation and production compilation;
- intended shared Pattern instance identity;
- compiled pattern-evaluation formula;
- representative rendered frames with finite, lit output and distinct phrase signatures;
- palette events such as the intruder and return;
- raw Pattern smoke behavior and an explicit check against prohibited expensive functions;
- production build, lint, and real Stage playback.

The measured device budget remains visible in the compiled summary. Treat it as a hardware-send constraint, not an automatic rejection of an aspirational stock Show. Preserve the ability to lower the map's modeled resolution while keeping the physical grouping and score intact.
