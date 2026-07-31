import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDefaultShow } from '@/engine/showModel'
import type { ShowClipEffect } from '@/engine/personalContentRecords'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { ShowEffectPalette, ShowEffectStack } from './ShowEffectsAuthoring'

describe('Show Effect authoring UI', () => {
  beforeEach(() => useShowPreviewOverrideStore.setState(showPreviewOverrideInitialState))

  it('keeps Effect parameters visible without disclosure controls (#644)', () => {
    const effects: ShowClipEffect[] = [{
      id: 'edge', kind: 'vignette', amount: 1, radius: 0.35, softness: 0.35,
      centerX: 0.5, centerY: 0.5, aspect: 1,
    }]
    render(<ShowEffectStack effects={effects} onChange={vi.fn()} onAdd={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Amount exact percentage' })).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Radius' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Edit Vignette Effect' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions for Vignette Effect' }))
      .toHaveAttribute('data-show-effect-id', 'edge')
    expect(screen.getByRole('button', { name: 'Drag Vignette Effect to reorder' })).toHaveAttribute('tabindex', '-1')
    const row = screen.getByTestId('show-effect-edge')
    expect(within(row).getByText('amt').parentElement).toHaveAttribute('title', 'Amount')
    expect(screen.queryByText('rendered pixels')).not.toBeInTheDocument()
    expect(screen.getByTitle('rendered pixels')).toHaveTextContent('Color & output')
  })

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

  it('renders as a bounded two-column takeover grouped by compiler stage (#659)', () => {
    const show = createDefaultShow('show-effects-layout', 'Effects layout', 1)
    render(<ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={vi.fn()} />)

    expect(screen.queryByRole('dialog', { name: 'Add Effect' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Add Effect' })).toHaveClass('min-h-0', 'flex-1')
    expect(screen.getAllByRole('group', { name: /Effects$/ }).map((group) => group.getAttribute('aria-label')))
      .toEqual(['Transform Effects', 'Distort Effects', 'Address Effects', 'Color & output Effects'])
    screen.getAllByTestId('show-effect-stage-grid')
      .forEach((grid) => expect(grid).toHaveClass('grid-cols-2'))
  })

  it('keeps choice rows stable while guidance and presets use one shared strip (#659)', () => {
    const show = createDefaultShow('show-effects-detail-strip', 'Effects detail strip', 1)
    render(<ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={vi.fn()} />)

    const bulge = screen.getByRole('button', { name: 'Add Bulge / Pinch Effect' })
    fireEvent.pointerEnter(bulge)

    const detail = screen.getByTestId('show-effect-choice-detail')
    expect(detail).toHaveTextContent('Bend the source coordinates before the Pattern renders.')
    expect(detail).toContainElement(screen.getByRole('button', { name: 'Pinch' }))
    expect(bulge).toHaveAttribute('aria-controls', detail.id)
    expect(bulge.parentElement).not.toContainElement(detail)
  })

  it.each([
    ['flip', 'Mirror'],
    ['address', 'Wrap'],
    ['segments', 'Kaleidoscope'],
    ['pinch', 'Bulge / Pinch'],
  ])('searches alias, stage, parameter, and preset vocabulary through %s', async (query, label) => {
    const user = userEvent.setup()
    const show = createDefaultShow(`show-effects-search-${query}`, 'Effects search', 1)
    render(<ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={vi.fn()} />)

    const search = screen.getByRole('searchbox', { name: 'Search Effects' })
    expect(search).toHaveFocus()
    await user.type(search, query)
    expect(screen.getByRole('button', { name: `Add ${label} Effect` })).toBeVisible()
  })

  it('closes an expanded row before Escape closes the chooser', async () => {
    const show = createDefaultShow('show-effects', 'Effects', 1)
    const onClose = vi.fn()
    render(<ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={onClose} />)
    const bulge = screen.getByRole('button', { name: 'Add Bulge / Pinch Effect' })
    fireEvent.pointerEnter(bulge)
    expect(screen.getByText('Bend the source coordinates before the Pattern renders.')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search Effects' }), { key: 'Escape' })
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('Bend the source coordinates before the Pattern renders.')).not.toBeInTheDocument()
    await vi.waitFor(() => expect(bulge).toHaveFocus())
    expect(bulge).toHaveAttribute('aria-expanded', 'false')

    fireEvent.keyDown(bulge, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('leaves Escape handling outside the takeover to the focused control', () => {
    const show = createDefaultShow('show-effects-scope', 'Effects scope', 1)
    const outsideKeyDown = vi.fn()
    const onClose = vi.fn()
    render(
      <>
        <input aria-label="Outside field" onKeyDown={outsideKeyDown} />
        <ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={onClose} />
      </>,
    )

    const outside = screen.getByRole('textbox', { name: 'Outside field' })
    fireEvent.keyDown(outside, { key: 'Escape' })

    expect(outsideKeyDown).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps Escape and row focus scoped to the active takeover instance', async () => {
    const show = createDefaultShow('show-effects-panels', 'Effects panels', 1)
    const closePinned = vi.fn()
    const closeTransient = vi.fn()
    render(
      <>
        <ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={closePinned} />
        <ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={closeTransient} />
      </>,
    )
    const palettes = screen.getAllByRole('region', { name: 'Add Effect' })
    const transientSearch = within(palettes[1]).getByRole('searchbox', { name: 'Search Effects' })
    const transientBulge = within(palettes[1]).getByRole('button', { name: 'Add Bulge / Pinch Effect' })
    fireEvent.pointerEnter(transientBulge)

    fireEvent.keyDown(transientSearch, { key: 'Escape' })
    expect(closePinned).not.toHaveBeenCalled()
    expect(closeTransient).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(transientBulge).toHaveFocus())

    fireEvent.keyDown(transientBulge, { key: 'Escape' })
    expect(closePinned).not.toHaveBeenCalled()
    expect(closeTransient).toHaveBeenCalledOnce()
  })

  it('offers Back as the explicit non-keyboard close path', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-effects-back', 'Effects back', 1)
    const onClose = vi.fn()
    render(<ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Back to Effects' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('expands presets in place and applies the chosen preset', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-effects-presets', 'Effects presets', 1)
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(<ShowEffectPalette clip={show.cells[0]} stageDimensions={2} onApply={onApply} onClose={onClose} />)

    act(() => screen.getByRole('button', { name: 'Add Bulge / Pinch Effect' }).focus())
    await user.click(screen.getByRole('button', { name: 'Pinch' }))

    expect(onApply).toHaveBeenCalledWith({
      target: 'effect-stack',
      effect: expect.objectContaining({ kind: 'bulge', amount: -0.65 }),
    })
    expect(onClose).toHaveBeenCalledOnce()
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

    const color = screen.getByRole('textbox', { name: 'Target color exact value' })
    expect(screen.getByLabelText('Target color picker')).toHaveValue('#00ff00')
    await user.clear(color)
    await user.type(color, '#ff00aa')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'green-key', kind: 'chroma-key', color: '#ff00aa', tolerance: 0.05, softness: 0.05 },
    ])
    expect(screen.getByRole('textbox', { name: 'Tolerance exact percentage' })).toHaveValue('5')
    expect(screen.getByRole('textbox', { name: 'Softness exact percentage' })).toHaveValue('5')
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

    expect(screen.getByRole('textbox', { name: 'Amount exact percentage' })).toHaveValue('100')
    expect(screen.getByRole('textbox', { name: 'Softness exact percentage' })).toHaveValue('35')
    expect(screen.getByRole('textbox', { name: 'Aspect exact ratio' })).toHaveValue('1:1')
    for (const label of ['Radius', 'Center X', 'Center Y']) {
      expect(screen.getByRole('spinbutton', { name: label })).toBeVisible()
    }
    const aspect = screen.getByRole('textbox', { name: 'Aspect exact ratio' })
    await user.clear(aspect)
    await user.type(aspect, '16:9')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'edge', kind: 'vignette', aspect: 16 / 9 }),
    ])
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Radius' }), { target: { value: '0.48' } })
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Radius' }))
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'edge', kind: 'vignette', radius: 0.48 }),
    ])
  })

  it('authors Transform Effect scales as multipliers without converting stored values (#610)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const effects: ShowClipEffect[] = [{ id: 'size', kind: 'scale', x: 1, y: 0.75 }]
    render(<ShowEffectStack effects={effects} onChange={onChange} onAdd={vi.fn()} />)

    const xScale = screen.getByRole('textbox', { name: 'X scale exact multiplier' })
    expect(xScale).toHaveValue('1')
    expect(screen.getByRole('textbox', { name: 'Y scale exact multiplier' })).toHaveValue('0.75')
    await user.clear(xScale)
    await user.type(xScale, '1.5x')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith([
      { id: 'size', kind: 'scale', x: 1.5, y: 0.75 },
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
    expect(within(screen.getByRole('region', { name: 'Add Effect' })).getByText('Bend the source coordinates before the Pattern renders.')).toBeInTheDocument()
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
    expect(screen.getByText('single-source · parameter')).toBeInTheDocument()
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

    expect(screen.getAllByTestId('show-effect-stage')).toHaveLength(2)
    const translate = screen.getByTestId('show-effect-move')
    fireEvent.change(within(translate).getByRole('spinbutton', { name: 'X' }), { target: { value: '0.35' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(within(translate).getByRole('spinbutton', { name: 'X' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'move', x: 0.35 }),
    ]))

    const rotateTrigger = screen.getByRole('button', { name: 'More actions for Rotate Effect' })
    await user.click(rotateTrigger)
    const rotateMenu = screen.getByRole('menu', { name: 'Actions for Rotate Effect' })
    expect(within(rotateMenu).getByRole('menuitem', { name: 'Move Rotate Effect later' })).toBeDisabled()
    await user.click(within(rotateMenu).getByRole('menuitem', { name: 'Move Rotate Effect earlier' }))
    await waitFor(() => expect(rotateTrigger).toHaveFocus())
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'turn' }),
    ]))
    expect(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0].map((effect: ShowClipEffect) => effect.id))
      .toEqual(['turn', 'ripple', 'move'])

    await user.click(screen.getByRole('button', { name: 'More actions for Translate Effect' }))
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate Translate Effect' }))
    expect(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0]).toContainEqual(expect.objectContaining({ id: 'move-2' }))
    await user.click(screen.getByRole('button', { name: 'More actions for Translate Effect' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove Translate Effect' }))
    expect(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0].map((effect: ShowClipEffect) => effect.id)).not.toContain('move')
  })

  it('supports keyboard menu navigation and restores focus to the Effect row (#644)', async () => {
    const user = userEvent.setup()
    const effects: ShowClipEffect[] = [
      { id: 'move', kind: 'translate', x: 0.2, y: 0 },
      { id: 'turn', kind: 'rotate', turns: 0.1 },
    ]
    render(<ShowEffectStack effects={effects} onChange={vi.fn()} onAdd={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'More actions for Rotate Effect' })
    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Move Rotate Effect earlier' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Duplicate Rotate Effect' })).toHaveFocus()
    const escapedParent = vi.fn()
    document.addEventListener('keydown', escapedParent)
    await user.keyboard('{Escape}')
    document.removeEventListener('keydown', escapedParent)
    expect(escapedParent).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('opens the always-visible action menu from a touch pointer (#644)', () => {
    render(<ShowEffectStack
      effects={[{ id: 'fade', kind: 'opacity', opacity: 0.5 }]}
      onChange={vi.fn()}
      onAdd={vi.fn()}
    />)

    const trigger = screen.getByRole('button', { name: 'More actions for Opacity Effect' })
    fireEvent.pointerDown(trigger, { pointerType: 'touch' })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu', { name: 'Actions for Opacity Effect' }))
      .toHaveAttribute('data-show-detail-owned-portal', 'true')
  })

  it('drags within one compiler stage and rejects a cross-stage drop (#644)', () => {
    const effects: ShowClipEffect[] = [
      { id: 'move', kind: 'translate', x: 0.2, y: 0 },
      { id: 'ripple', kind: 'ripple', amount: 0.1, frequency: 8, phase: 0, centerX: 0.5, centerY: 0.5 },
      { id: 'turn', kind: 'rotate', turns: 0.1 },
    ]
    const onChange = vi.fn()
    render(<ShowEffectStack effects={effects} onChange={onChange} onAdd={vi.fn()} />)
    const data = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
    }
    const turnRow = screen.getByTestId('show-effect-turn')

    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag Translate Effect to reorder' }), { dataTransfer })
    fireEvent.dragOver(turnRow, { dataTransfer })
    fireEvent.drop(turnRow, { dataTransfer })
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'turn' }),
      expect.objectContaining({ id: 'ripple' }),
      expect.objectContaining({ id: 'move' }),
    ])

    onChange.mockClear()
    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag Rotate Effect to reorder' }), { dataTransfer })
    fireEvent.dragOver(screen.getByTestId('show-effect-move'), { dataTransfer })
    fireEvent.drop(screen.getByTestId('show-effect-move'), { dataTransfer })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag Ripple Effect to reorder' }), { dataTransfer })
    fireEvent.dragOver(turnRow, { dataTransfer })
    fireEvent.drop(turnRow, { dataTransfer })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps Show-wide cost surfaces out of the Clip Effect stack (#643)', () => {
    render(<ShowEffectStack
      effects={[
        { id: 'move', kind: 'translate', x: 0.2, y: 0 },
        { id: 'ripple', kind: 'ripple', amount: 0.1, frequency: 8, phase: 0, centerX: 0.5, centerY: 0.5 },
      ]}
      mirror
      onChange={vi.fn()}
      onAdd={vi.fn()}
    />)

    const stack = screen.getByRole('region', { name: 'Clip Effects' })
    expect(within(stack).queryByText(/Cost:/i)).not.toBeInTheDocument()
    expect(within(stack).queryByText('Advanced compiled cost')).not.toBeInTheDocument()
    expect(within(stack).queryByText(/single-source/i)).not.toBeInTheDocument()
    expect(within(stack).queryByText(/parameter/i)).not.toBeInTheDocument()
  })
})
