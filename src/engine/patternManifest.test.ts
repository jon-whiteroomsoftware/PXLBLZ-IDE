import { parsePatternManifest, PXLBLZ_PATTERN_URL } from './patternManifest'

describe('Pattern source manifests', () => {
  it('parses the approved compact banner and reader guidance', () => {
    const manifest = parsePatternManifest(`// Pattern: Iridescent Fibers
// Built with PXLBLZ-IDE ${PXLBLZ_PATTERN_URL}
// Credit: "iridescent fibers" by evesira — https://www.shadertoy.com/view/tffSDr
//
// Ten additive sine-wave layers form a drifting field of luminous fibers.
// Runs on: 2D maps; designed for a flat panel.
// Controls: Speed — drift rate; Zoom — framing; Thickness — fiber width;
//           Brightness — output gain.

export function render2D(index, x, y) { rgb(x, y, 0) }
`)

    expect(manifest).toEqual({
      name: 'Iridescent Fibers',
      credits: ['"iridescent fibers" by evesira — https://www.shadertoy.com/view/tffSDr'],
      description: 'Ten additive sine-wave layers form a drifting field of luminous fibers.',
      runsOn: '2D maps; designed for a flat panel.',
      controls: 'Speed — drift rate; Zoom — framing; Thickness — fiber width; Brightness — output gain.',
    })
  })

  it('preserves an explicit license and stops before implementation notes', () => {
    const manifest = parsePatternManifest(`// Pattern: Heat Shimmer Tiles
// Built with PXLBLZ-IDE ${PXLBLZ_PATTERN_URL}
// License: ISC
//
// Repeated color panes bend under a slow heat haze.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: Speed — motion rate.
//
// Notes:
// Triangle waves provide the coordinate offsets without Perlin noise.

export function render2D(index, x, y) { rgb(x, y, 0) }
`)

    expect(manifest?.license).toBe('ISC')
    expect(manifest?.description).toBe('Repeated color panes bend under a slow heat haze.')
    expect(manifest?.controls).toBe('Speed — motion rate.')
  })
})
