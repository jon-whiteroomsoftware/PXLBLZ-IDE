import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDefaultShow } from '@/engine/showModel'
import { compileShow } from '@/engine/showCompiler'
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

    expect(screen.getAllByRole('button', { name: /Add .* Effect/ })).toHaveLength(23)
    await user.type(screen.getByRole('searchbox', { name: 'Search Effects' }), 'ripple')
    const ripple = screen.getByRole('button', { name: 'Add Ripple Effect' })
    expect(screen.getAllByRole('button', { name: /Add .* Effect/ })).toHaveLength(1)

    fireEvent.pointerEnter(ripple)
    expect(screen.getByText('Bend the source coordinates before the Pattern renders.')).toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 120))
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    fireEvent.pointerLeave(ripple)

    await user.click(ripple)
    expect(onApply).toHaveBeenCalledWith({
      target: 'effect-stack',
      effect: expect.objectContaining({ kind: 'ripple' }),
    })
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

  it('offers horizontal Mirror through the Effect palette without creating a stack Effect (#543)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-mirror-effect', 'Mirror Effect', 1)
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(<ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={onApply} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Add Mirror Effect' }))

    expect(onApply).toHaveBeenCalledWith({ target: 'placement-mirror', mirror: true })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('edits a chroma-key target as color alongside tolerance and softness (#527)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const effects: ShowClipEffect[] = [{
      id: 'green-key', kind: 'chroma-key', color: '#00ff00', tolerance: 0.05, softness: 0.05,
    }]
    render(<ShowEffectStack effects={effects} onChange={onChange} onAdd={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Edit Chroma key Effect' }))
    const color = screen.getByRole('textbox', { name: 'Target color exact value' })
    expect(screen.getByLabelText('Target color picker')).toHaveValue('#00ff00')
    await user.clear(color)
    await user.type(color, '#ff00aa')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'green-key', kind: 'chroma-key', color: '#ff00aa', tolerance: 0.05, softness: 0.05 },
    ])
    expect(screen.getByRole('textbox', { name: 'Tolerance exact percentage' })).toHaveValue('5%')
    expect(screen.getByRole('textbox', { name: 'Softness exact percentage' })).toHaveValue('5%')
  })

  it('edits Color Map as exactly Shadow Color and Highlight Color (#609)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const effects: ShowClipEffect[] = [{
      id: 'map', kind: 'color-map', amount: 1,
      shadowR: 0, shadowG: 0, shadowB: 0,
      highlightR: 1, highlightG: 1, highlightB: 1,
    }]
    render(<ShowEffectStack effects={effects} onChange={onChange} onPreview={onPreview} onPreviewEnd={onPreviewEnd} onAdd={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Edit Color map Effect' }))
    expect(screen.getByRole('textbox', { name: 'Shadow Color exact value' })).toHaveValue('#000000')
    expect(screen.getByRole('textbox', { name: 'Highlight Color exact value' })).toHaveValue('#ffffff')
    for (const channel of ['Shadow red', 'Shadow green', 'Shadow blue', 'Highlight red', 'Highlight green', 'Highlight blue']) {
      expect(screen.queryByRole('spinbutton', { name: channel })).not.toBeInTheDocument()
    }

    const shadowPicker = screen.getByLabelText('Shadow Color picker')
    fireEvent.input(shadowPicker, { target: { value: '#abcdef' } })
    expect(onPreview).toHaveBeenCalledWith([{
      ...effects[0],
      shadowR: 0xab / 255,
      shadowG: 0xcd / 255,
      shadowB: 0xef / 255,
    }])
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(shadowPicker, { target: { value: '#abcdef' } })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
    onChange.mockClear()

    const highlight = screen.getByRole('textbox', { name: 'Highlight Color exact value' })
    await user.clear(highlight)
    await user.type(highlight, '#123456')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith([{
      ...effects[0],
      highlightR: 0x12 / 255,
      highlightG: 0x34 / 255,
      highlightB: 0x56 / 255,
    }])
  })

  it('edits every Vignette geometry control (#539)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const effects: ShowClipEffect[] = [{
      id: 'edge', kind: 'vignette', amount: 1, radius: 0.35, softness: 0.35,
      centerX: 0.5, centerY: 0.5, aspect: 1,
    }]
    render(<ShowEffectStack effects={effects} onChange={onChange} onAdd={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Edit Vignette Effect' }))
    expect(screen.getByRole('textbox', { name: 'Amount exact percentage' })).toHaveValue('100%')
    expect(screen.getByRole('textbox', { name: 'Softness exact percentage' })).toHaveValue('35%')
    for (const label of ['Radius', 'Center X', 'Center Y', 'Aspect']) {
      expect(screen.getByRole('spinbutton', { name: label })).toBeVisible()
    }
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Radius' }), { target: { value: '0.48' } })
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Radius' }))
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'edge', kind: 'vignette', radius: 0.48 }),
    ])
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
      'luma-key': 'threshold',
      'chroma-key': 'threshold',
      posterize: 'steps',
      vignette: 'scale',
      'color-map': 'cycle',
      mirror: 'mirror',
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

    expect(document.querySelectorAll('[data-effect-mnemonic]')).toHaveLength(23)
    expect(document.querySelectorAll('.show-effect-choice')).toHaveLength(23)

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

  it('labels advanced generated-source pressure as a source-size proxy (#502)', () => {
    const compiledCost = compileShow({
      clips: [{ id: 'only', source: 'export function render(index) { rgb(1, 0, 0) }' }],
    }, {}).summary.cost

    render(<ShowEffectStack effects={[]} compiledCost={compiledCost} onChange={vi.fn()} onAdd={vi.fn()} />)

    expect(screen.getByText('Generated UTF-8 source')).toBeInTheDocument()
    expect(screen.getByText(/source-size proxy/i)).toHaveTextContent('% source-size proxy')
  })
})
