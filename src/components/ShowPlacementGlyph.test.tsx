import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NEUTRAL_SHOW_CLIP_TRANSFORM } from '@/engine/showClipTransform'
import { DEFAULT_SHOW_CLIP_VIEWPORT } from '@/engine/showClipViewport'
import { describeShowPlacement, ShowPlacementGlyph } from './ShowPlacementGlyph'
import type { ShowClipTransform, ShowClipViewport } from '@/engine/personalContentRecords'

const transform = (patch: Partial<ShowClipTransform> = {}): ShowClipTransform => ({ ...NEUTRAL_SHOW_CLIP_TRANSFORM, ...patch })
const viewport = (patch: Partial<ShowClipViewport> = {}): ShowClipViewport => ({ ...DEFAULT_SHOW_CLIP_VIEWPORT, enabled: true, ...patch })

describe('placement description', () => {
  it('reads a neutral placement plainly', () => {
    expect(describeShowPlacement({ transform: transform() })).toBe('Full Zone, centered · no aperture')
  })

  it('names a turned box', () => {
    expect(describeShowPlacement({ transform: transform({ rotation: 30 / 360 }) })).toContain('turned 30 degrees')
  })

  it('prefers a shape people would say aloud over coordinates', () => {
    const summary = describeShowPlacement({ transform: transform(), viewport: viewport({ width: 1 / 3 }) })
    expect(summary).toBe('Full Zone, centered · left a third visible')
  })

  it('falls back to extents when the window is not edge-aligned', () => {
    const summary = describeShowPlacement({ transform: transform(), viewport: viewport({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }) })
    expect(summary).toContain('aperture half by half')
  })

  it('reduces enlarged aperture extents without treating them as proper fractions', () => {
    const summary = describeShowPlacement({
      transform: transform(),
      viewport: viewport({ x: 0.25, y: 0.25, width: 4 / 3, height: 2 }),
    })
    expect(summary).toContain('right 4/3 by bottom 2x visible')
  })

  it('splits the read for the paired views', () => {
    const props = { transform: transform({ scaleX: 0.5, scaleY: 0.5 }), viewport: viewport({ width: 0.5 }) }
    expect(describeShowPlacement({ ...props, view: 'placement' })).toBe('half size, centered')
    expect(describeShowPlacement({ ...props, view: 'aperture' })).toContain('visible')
  })

  it('describes enlarged content with reduced improper ratios', () => {
    expect(describeShowPlacement({
      transform: transform({ scaleX: 4 / 3, scaleY: 4 / 3 }),
      view: 'placement',
    })).toBe('4/3 size, centered')
    expect(describeShowPlacement({
      transform: transform({ scaleX: 2, scaleY: 2 }),
      view: 'placement',
    })).toBe('2x size, centered')
  })

  it('reports an absent aperture in the aperture view', () => {
    expect(describeShowPlacement({ transform: transform(), view: 'aperture' })).toBe('No aperture: the whole Zone is visible')
  })
})

describe('glyph rendering', () => {
  it('labels itself with the same read for screen readers', () => {
    render(<ShowPlacementGlyph transform={transform()} />)
    expect(screen.getByRole('img', { name: 'Full Zone, centered · no aperture' })).toBeInTheDocument()
  })

  it('exposes an accurate accessible label for enlarged content', () => {
    render(<ShowPlacementGlyph transform={transform({ scaleX: 4 / 3, scaleY: 4 / 3 })} />)
    expect(screen.getByRole('img', { name: '4/3 size, centered · no aperture' })).toBeInTheDocument()
  })

  it('draws a dashed window only when an aperture is enabled', () => {
    const { container, rerender } = render(<ShowPlacementGlyph transform={transform()} />)
    expect(container.querySelectorAll('[stroke-dasharray]')).toHaveLength(0)
    rerender(<ShowPlacementGlyph transform={transform()} viewport={viewport({ width: 0.5 })} />)
    expect(container.querySelectorAll('[stroke-dasharray]')).toHaveLength(1)
  })

  it('ignores a disabled aperture', () => {
    const { container } = render(<ShowPlacementGlyph transform={transform()} viewport={viewport({ enabled: false, width: 0.5 })} />)
    expect(container.querySelectorAll('[stroke-dasharray]')).toHaveLength(0)
  })

  it('ignores the aperture entirely in the placement view', () => {
    const { container } = render(<ShowPlacementGlyph transform={transform()} viewport={viewport({ width: 0.5 })} view="placement" />)
    expect(container.querySelectorAll('[stroke-dasharray]')).toHaveLength(0)
  })

  it('turns the content with the stored rotation', () => {
    const { container } = render(<ShowPlacementGlyph transform={transform({ rotation: 0.25 })} />)
    expect(container.querySelector('g[transform^="rotate(90"]')).not.toBeNull()
  })

  it('keeps unique clip ids across instances', () => {
    const { container } = render(
      <>
        <ShowPlacementGlyph transform={transform()} viewport={viewport({ width: 0.5 })} />
        <ShowPlacementGlyph transform={transform()} viewport={viewport({ width: 0.25 })} />
      </>,
    )
    const ids = [...container.querySelectorAll('clipPath')].map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('full-Zone aperture', () => {
  it('says so plainly rather than reading as an extent', () => {
    expect(describeShowPlacement({ transform: transform(), viewport: viewport() }))
      .toBe('Full Zone, centered · aperture over the whole Zone')
  })
})
