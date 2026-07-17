import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShowTransitionXrayPictogram } from './ShowTransitionXrayPictogram'
import type { ShowBoundaryTransition } from '@/engine/personalContentRecords'

function transition(overrides: Partial<ShowBoundaryTransition>): ShowBoundaryTransition {
  return {
    id: 'transition-xray',
    afterSceneId: 'scene-1',
    kind: 'crossfade',
    durationMs: 2000,
    easing: 'linear',
    ...overrides,
  }
}

describe('ShowTransitionXrayPictogram', () => {
  it('turns Crossfade easing into opposed additive intensity ramps', () => {
    render(<ShowTransitionXrayPictogram transition={transition({
      kind: 'crossfade',
      easing: { curve: 'steps', steps: 4, position: 'end' },
    })} />)

    const glyph = screen.getByTestId('transition-xray-pictogram')
    expect(glyph).toHaveAttribute('data-transition-kind', 'crossfade')
    expect(glyph).toHaveAttribute('data-easing', 'steps')
    expect(glyph.querySelectorAll('[data-crossfade-ramp]')).toHaveLength(2)
  })

  it('draws the configured Wipe variant, orientation, direction, and count', () => {
    const { rerender } = render(<ShowTransitionXrayPictogram transition={transition({
      kind: 'wipe', wipeVariant: 'linear', direction: 0.25,
    })} />)
    const linear = screen.getByTestId('transition-xray-pictogram')
    expect(linear).toHaveAttribute('data-transition-kind', 'wipe')
    expect(linear).toHaveAttribute('data-wipe-variant', 'linear')
    expect(linear).toHaveAttribute('data-direction', '0.25')

    rerender(<ShowTransitionXrayPictogram transition={transition({
      kind: 'wipe', wipeVariant: 'blinds', orientation: 'horizontal', count: 12,
    })} />)
    expect(screen.getByTestId('transition-xray-pictogram')).toHaveAttribute('data-wipe-variant', 'blinds')
    expect(screen.getAllByTestId('wipe-blind')).toHaveLength(8)
  })

  it('uses the configured Dissolve family, grain, and seed', () => {
    render(<ShowTransitionXrayPictogram transition={transition({
      kind: 'dither', dissolveVariant: 'block', blockSize: 32, seed: 17,
    })} />)
    const glyph = screen.getByTestId('transition-xray-pictogram')
    expect(glyph).toHaveAttribute('data-dissolve-variant', 'block')
    expect(glyph).toHaveAttribute('data-seed', '17')
    expect(glyph.querySelector('[data-dissolve-grain="block"]')).toBeInTheDocument()
  })

  it('positions and rotates the configured Portal shape and reveal mode', () => {
    render(<ShowTransitionXrayPictogram transition={transition({
      kind: 'portal', shape: 'star', centerX: 0.25, centerY: 0.75,
      rotation: 0.125, scale: 0.7, starPoints: 7, revealMode: 'shrink-outgoing',
    })} />)
    const glyph = screen.getByTestId('transition-xray-pictogram')
    expect(glyph).toHaveAttribute('data-portal-shape', 'star')
    expect(glyph).toHaveAttribute('data-reveal-mode', 'shrink-outgoing')
    expect(glyph).toHaveAttribute('data-center', '0.25,0.75')
    expect(glyph).toHaveAttribute('data-rotation', '0.125')
    expect(glyph.querySelector('[data-portal-geometry="star"]')).toBeInTheDocument()
  })

  it('shows the configured Motion operation, direction, anchor, and address policy', () => {
    render(<ShowTransitionXrayPictogram transition={transition({
      kind: 'motion', motionVariant: 'push', direction: 0.25,
      anchorX: 0.2, anchorY: 0.8, addressPolicy: 'wrap',
    })} />)
    const glyph = screen.getByTestId('transition-xray-pictogram')
    expect(glyph).toHaveAttribute('data-motion-variant', 'push')
    expect(glyph).toHaveAttribute('data-direction', '0.25')
    expect(glyph).toHaveAttribute('data-anchor', '0.2,0.8')
    expect(glyph).toHaveAttribute('data-address-policy', 'wrap')
  })

  it('uses the authored Fade color', () => {
    render(<ShowTransitionXrayPictogram transition={transition({ kind: 'fade-color', color: '#ff3366' })} />)
    expect(screen.getByTestId('fade-color-swatch')).toHaveAttribute('fill', '#ff3366')
  })
})
