# Understanding Maps

For Pixelblaze owners who want the full story on **pixel maps** — what they are,
how they're authored, what actually reaches the device, and the behaviours worth
knowing about around them. It assumes the platform basics from the **Pixelblaze Ecosystem Primer**;
for how the PXLBLZ IDE handles maps, see the **PXLBLZ Feature Guide**.

**The whole document in two sentences.** A pixel map records where each LED
physically sits, decoupling a pattern's geometry from wiring order — and the map
*function* is full JavaScript that runs once in your browser, with only the baked
coordinate array ever reaching the device. The device stores one map shared by
every pattern, normalizes whatever units you authored in into the `0..1` range
patterns actually see (the Fill/Contain choice), and around `pixelCount` changes
it goes silently stale or silently drops a mismatched map — all by design.

---

## 1. Maps — where the LEDs are

A **pixel map** answers one question: *where is each LED physically located?* The
firmware doesn't assume your LEDs are a straight line. Give it a map, and it hands
each pixel's coordinates to `render2D`/`render3D`, so a pattern is written in real
space rather than wiring order.

The structural facts:

- **Chain index and spatial position are decoupled.** LED #50 in the wiring order
  might sit anywhere. The map is the lookup from index → position.
- **`pixelCount` and the map are separate device settings.** The map function is
  *handed* `pixelCount`; it is never the authority on how many pixels exist. The
  two can disagree — something to be aware of (§5).
- **A device stores one map, shared by every pattern.** It's part of the
  installation, set when you build the thing, not per-pattern.

![The map pipeline: function → array → device → render2D](../images/map-pipeline.svg)

The subtle part is the **dialect split**. The Mapper tab takes a JavaScript
function like:

```javascript
function (pixelCount) {
  var map = []
  for (var i = 0; i < pixelCount; i++) {
    map.push([Math.cos(i * 0.1), Math.sin(i * 0.1)])
  }
  return map
}
```

This is **real, full JavaScript** — `Math.cos`, `Array.push`, the lot — because
**your browser runs it**, not the Pixelblaze. On save, the browser evaluates it once
and uploads only the coordinate array. A pattern, by contrast, is the constrained
fixed-point dialect the *firmware* executes every frame. Same-looking syntax, two
genuinely different execution models:

| | Mapper function | Pattern |
|---|---|---|
| Language | full JavaScript | Pixelblaze dialect (subset) |
| Numbers | float64 | 16.16 fixed-point |
| Math | `Math.sin`, `Math.PI`, … | bare `sin`, `PI`, … |
| Who runs it | the **browser**, once at save | the **firmware**, every frame |
| What reaches the device | the baked coordinate array | the compiled pattern |

So in a mapper you write `Math.floor(x)`; in a pattern you write `floor(x)`. Don't
mix them up.

You author maps in **whatever units fit the build** — millimetres, inches, grid
steps. The firmware computes the world's extent from your coordinates' limits and
normalizes everything into the `0..1` "world units" patterns actually see, so a
1500 mm tree laid out in millimetres scales itself. How non-square extents
normalize is the Fill/Contain choice (§4).

## 2. One strip, many spaces

One physical LED strip can have more than one useful spatial model. You can bend
it into a ring and keep running 1D line patterns on it, treating the LEDs as a
sequence. Or you can write a custom 2D map that places those same LEDs around a
circle, then run 2D patterns that line up with the ring.

Likewise, a strip twisted into a 3D shape like a torus can stay a 1D strip for
chase patterns, or become a 3D mapped object when you provide each LED's
`[x, y, z]` point in space. The wiring order has not changed; the map adds the physical
interpretation that 2D and 3D patterns need.

## 3. Two source formats, any units

The Mapper tab accepts either:

- **A plain JSON array of coordinates** — one arbitrary `[x, y]` pair (2D) or
  `[x, y, z]` triplet (3D) per pixel. A 4-pixel box is literally
  `[[0,0],[100,0],[100,100],[0,100]]`. Good for hand-placed, irregular layouts,
  measured sculptures, or point clouds produced by another tool.
- **A JavaScript `function(pixelCount)`** returning such an array — the generative
  form, good for parametric structures (matrices, rings, helices).

Either way the browser ends up with a coordinate array and uploads only that.
Units are yours; the firmware normalizes from the coordinates' limits (§1).

## 4. Fill vs. Contain

After the mapper produces raw coordinates, the firmware **normalizes** them into a
predictable range. The Mapper tab's **Fill / Contain** dropdown controls how:

![Fill vs Contain: aspect-preserving vs per-axis stretch](../images/fill-vs-contain.svg)

- **Contain** (default): aspect-preserving. The longest axis fits `0..1`; shorter
  axes get a proportionally smaller range (a 15×10 map → x spans `0..1`, y spans
  `0..0.667`). A circle stays a circle; no axis exceeds 1.
- **Fill**: per-axis stretch. Each axis independently fills `0..1`, so a 4:1 map
  fills the unit square and a circle becomes an ellipse.

Both are real hardware behaviours (verified on a 16×16 matrix against a
`y >= 0.9` probe pattern: under Fill, `y` reached 1.0; under Contain it capped
low). Contain is the sensible default; Fill is occasionally right when a pattern
is authored against the unit square regardless of physical shape.

## 5. Stale maps — something to watch for

The mapper runs *once at save*, and only the data is stored — so **changing
`pixelCount` does not re-run the mapper**. The map silently goes stale: grow your
strip from 100 to 200 LEDs and the stored 100-point map still applies, with the
new pixels falling off the end. ElectroMage's own guidance: *"if you rely on
pixelCount and change the number of pixels, visit the mapper page and save it to
re-generate the pixel map."* This is by-design behaviour, and any faithful tool
must reproduce it rather than paper over it.

## 6. The exact-count rule

There's a sharper, *push-time* sibling: **a map written to a device must contain
exactly `pixelCount` coordinates, or the device will not apply it.** Saving a
count-mismatched map appears to succeed but produces no visible change — the map
is dropped, not partially applied — and the reference client refuses to even parse
such a map on read-back. A tool that pushes maps must either generate exactly
`pixelCount` points or set the device's pixel count to match; the two are
inseparable.

## 7. Dimensionality

`pixelMapDimensions()` reports the dimensionality of the installed map, not the
dimensionality of the physical LED build. Its return values are `0`, `2`, or `3`:
`0` means **no map is installed**, `2` means a 2D map, and `3` means a 3D map.

Pixelblaze chooses which render function to call based on the installed map. With
no map installed, it calls the plain `render(index)` form; this is the conceptual
**1D strip** case, where pixels are addressed only by wiring order. With a 2D map
installed, it calls `render2D(index, x, y)`. With a 3D map installed, it calls
`render3D(index, x, y, z)`.

## Further reading

- **Pixelblaze Ecosystem Primer** — the broader platform model: hardware,
  fixed-point numbers, the pattern language, networking, and power.
- **PXLBLZ Feature Guide** — how this IDE handles maps, previews, editor settings,
  and controller pushes.
- **ElectroMage Maps and Map Editing** — the official map syntax and worked
  generator examples.
