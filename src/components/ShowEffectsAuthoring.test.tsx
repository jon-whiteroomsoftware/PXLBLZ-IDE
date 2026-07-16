import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDefaultShow } from '@/engine/showModel'
import type { ShowClipEffect } from '@/engine/personalContentRecords'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { ShowEffectPalette, ShowEffectStack } from './ShowEffectsAuthoring'

describe('Show Effect authoring UI', () => {
  beforeEach(() => useShowPreviewOverrideStore.setState(showPreviewOverrideInitialState))

  it('searches the compact registry, reveals hover guidance without rebuilding the Stage, and applies once', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-effects', 'Effects', 1)
    const clip = show.cells[0]
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(<ShowEffectPalette clip={clip} stageDimensions={2} onApply={onApply} onClose={onClose} />)

    expect(screen.getAllByRole('button', { name: /Add .* Effect/ })).toHaveLength(19)
    await user.type(screen.getByRole('searchbox', { name: 'Search Effects' }), 'ripple')
    const ripple = screen.getByRole('button', { name: 'Add Ripple Effect' })
    expect(screen.getAllByRole('button', { name: /Add .* Effect/ })).toHaveLength(1)

    fireEvent.pointerEnter(ripple)
    expect(screen.getByText('Bend the source coordinates before the Pattern renders.')).toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 120))
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    fireEvent.pointerLeave(ripple)

    await user.click(ripple)
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ripple' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
  })

  it('closes on Escape without touching the Stage preview seam', () => {
    const show = createDefaultShow('show-effects', 'Effects', 1)
    const onClose = vi.fn()
    render(<ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={onClose} />)
    fireEvent.focus(screen.getByRole('button', { name: 'Add Ripple Effect' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('never replaces the Stage preview while the pointer traverses Effects', async () => {
    const show = createDefaultShow('show-effects-hover', 'Effects hover', 1)
    render(<ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={vi.fn()} />)

    const ripple = screen.getByRole('button', { name: 'Add Ripple Effect' })
    const swirl = screen.getByRole('button', { name: 'Add Swirl Effect' })
    fireEvent.pointerEnter(ripple)
    fireEvent.pointerLeave(ripple)
    fireEvent.pointerEnter(swirl)

    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    await new Promise((resolve) => window.setTimeout(resolve, 120))
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    expect(within(screen.getByRole('contentinfo')).getByText('Bend the source coordinates before the Pattern renders.')).toBeInTheDocument()
  })

  it('renders a complete CSS-local Effect motion vocabulary for hover and focus (#474)', () => {
    const show = createDefaultShow('show-effects-motion', 'Effect motion', 1)
    render(<ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={vi.fn()} />)

    const expectedMotion: Record<string, string> = {
      opacity: 'fade',
      brightness: 'brightness',
      hue: 'cycle',
      saturation: 'saturation',
      contrast: 'contrast',
      invert: 'invert',
      threshold: 'threshold',
      posterize: 'steps',
      'color-map': 'cycle',
      translate: 'translate',
      rotate: 'rotate',
      scale: 'scale',
      shear: 'shear',
      wrap: 'wrap',
      ripple: 'ripple',
      swirl: 'rotate',
      bulge: 'scale',
      pixelate: 'steps',
      kaleidoscope: 'rotate',
    }

    for (const [variantId, motion] of Object.entries(expectedMotion)) {
      const glyph = document.querySelector<SVGElement>(`[data-effect-mnemonic="${variantId}"]`)
      expect(glyph, variantId).not.toBeNull()
      expect(glyph).toHaveAttribute('data-effect-motion', motion)
      expect(glyph?.querySelector('[data-effect-motion-part]')).not.toBeNull()
      expect(glyph).toHaveClass('show-effect-mnemonic')
    }

    expect(document.querySelectorAll('[data-effect-mnemonic]')).toHaveLength(19)
    expect(document.querySelectorAll('.show-effect-choice')).toHaveLength(19)

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Add Translate Effect' }))
    fireEvent.focus(screen.getByRole('button', { name: 'Add Ripple Effect' }))
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
  })

  it('edits, duplicates, removes, and reorders only inside visible compiler stages', async () => {
    const user = userEvent.setup()
    const effects: ShowClipEffect[] = [
      { id: 'move', kind: 'translate', x: 0.2, y: 0 },
      { id: 'ripple', kind: 'ripple', amount: 0.1, frequency: 8, phase: 0, centerX: 0.5, centerY: 0.5 },
      { id: 'turn', kind: 'rotate', turns: 0.1 },
    ]
    const onChange = vi.fn()
    render(<ShowEffectStack effects={effects} onChange={onChange} onAdd={vi.fn()} />)

    expect(screen.getByText('Cost: 1 Pattern render')).toBeInTheDocument()
    expect(screen.getAllByTestId('show-effect-stage')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Edit Translate Effect' }))
    const translate = screen.getByTestId('show-effect-move')
    fireEvent.change(within(translate).getByRole('spinbutton', { name: 'X' }), { target: { value: '0.35' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(within(translate).getByRole('spinbutton', { name: 'X' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'move', x: 0.35 }),
    ]))

    await user.click(screen.getByRole('button', { name: 'Move Rotate Effect earlier' }))
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'turn' }),
    ]))
    expect(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0].map((effect: ShowClipEffect) => effect.id))
      .toEqual(['turn', 'ripple', 'move'])

    await user.click(screen.getByRole('button', { name: 'Duplicate Translate Effect' }))
    expect(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0]).toContainEqual(expect.objectContaining({ id: 'move-2' }))
    await user.click(screen.getByRole('button', { name: 'Remove Translate Effect' }))
    expect(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0].map((effect: ShowClipEffect) => effect.id)).not.toContain('move')
  })
})
