# Documentation diagram house style

Every diagram in `docs/images/` is a hand-authored flat SVG sharing one dark
house style. The in-app Documentation workspace is always dark, so diagrams
bake a dark card background; the same file renders as a legible dark card on
GitHub in either GitHub theme. Do not emit theme-adaptive
`prefers-color-scheme` variants: the app's theme is fixed and does not follow
the OS.

## Canvas and typography

- `viewBox` width 720; height as needed (250-330 typical).
- One full-bleed background rect: `fill="#14171c"`.
- Font stack on the root element:
  `'IBM Plex Mono','SF Mono',ui-monospace,Menlo,monospace`.
- Title line top-left at `y="34"`, `font-size="13"`, primary text color.
- Optional legend row beneath the title: `14x11` swatch rects with 10px
  secondary-color labels.
- Closing caption at the bottom, `font-size="11"`, primary text color — one
  or two lines stating the takeaway, lowercase sentence style.
- Escape typographic characters as numeric entities (`&#8212;`, `&#8776;`,
  `&#181;`, `&#215;`) so files stay ASCII.

## Palette

| Role | Hex |
| --- | --- |
| card background | `#14171c` |
| primary text | `#dde3ea` |
| secondary text, strokes, arrows | `#97a1ac` |
| accent fill (the one blue) | `#5c92c7` |
| secondary block fill (dark slate) | `#454e59` |
| tertiary block fill (mid grey) | `#6d7681` |
| light-blue block fill (second series) | `#9dbede` |
| quiet stroke / rail | `#59626d` |
| panel fill (boxes inside a container) | `#232a33` |
| panel fill, subtle variant | `#1d232b` |
| panel fill, near-background | `#191e24` |
| highlighted panel fill | `#2b3a4d` |

Rules of thumb: one blue means one emphasized series or system boundary;
greys carry everything unemphasized; never use gradients, shadows, rounded
corners, or more than these colors. Boxes are 1-1.5px strokes in the
secondary color (or accent for the emphasized container). Arrows are a line
plus a small filled triangle path.

## Content rules

- A diagram exists only when it clarifies a relationship prose would make
  harder to retain (the #357 criterion). Delete decorative diagrams.
- State real measured numbers, not illustrative ones, and keep them in sync
  with `docs/reference/Show Rendering Optimization Results.md` or the owning
  reference section.
- Register every new image in `src/docs/catalog.ts` `sharedAssets` and
  reference it from Markdown with a meaningful alt text sentence.
- Keep filenames ASCII kebab-case (`frame-time-budget.svg`).
