import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDefaultShow } from '@/engine/showModel'
import type { ShowClipEffect } from '@/engine/personalContentRecords'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { ShowEffectPalette, ShowEffectStack } from './ShowEffectsAuthoring'

describe('Show Effect authoring UI', () => {
  beforeEach(() => useShowPreviewOverrideStore.setState(showPreviewOverrideInitialState))

  it('searches the compact registry, previews in the existing Stage seam, and applies once', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-effects', 'Effects', 1)
    const clip = show.cells[0]
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(<ShowEffectPalette show={show} clip={clip} stageDimensions={2} onApply={onApply} onClose={onClose} />)

    expect(screen.getAllByRole('button', { name: /Add .* Effect/ })).toHaveLength(19)
    await user.type(screen.getByRole('searchbox', { name: 'Search Effects' }), 'ripple')
    const ripple = screen.getByRole('button', { name: 'Add Ripple Effect' })
    expect(screen.getAllByRole('button', { name: /Add .* Effect/ })).toHaveLength(1)

    fireEvent.pointerEnter(ripple)
    await waitFor(() => expect(useShowPreviewOverrideStore.getState().show?.cells[0].effects?.[0]).toMatchObject({ kind: 'ripple' }))
    fireEvent.pointerLeave(ripple)
    await waitFor(() => expect(useShowPreviewOverrideStore.getState().show).toBeNull())

    await user.click(ripple)
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ripple' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
  })

  it('clears candidate preview and closes on Escape', async () => {
    const show = createDefaultShow('show-effects', 'Effects', 1)
    render(<ShowEffectPalette show={show} clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={vi.fn()} />)
    fireEvent.focus(screen.getByRole('button', { name: 'Add Ripple Effect' }))
    await waitFor(() => expect(useShowPreviewOverrideStore.getState().show).not.toBeNull())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
  })

  it('coalesces rapid pointer travel before replacing the Stage preview', async () => {
    const show = createDefaultShow('show-effects-hover', 'Effects hover', 1)
    const previewKinds: Array<string | null> = []
    const unsubscribe = useShowPreviewOverrideStore.subscribe((state) => {
      previewKinds.push(state.show?.cells[0].effects?.[0]?.kind ?? null)
    })
    render(<ShowEffectPalette show={show} clip={show.cells[0]} stageDimensions={2} onApply={vi.fn()} onClose={vi.fn()} />)

    const ripple = screen.getByRole('button', { name: 'Add Ripple Effect' })
    const swirl = screen.getByRole('button', { name: 'Add Swirl Effect' })
    fireEvent.pointerEnter(ripple)
    fireEvent.pointerLeave(ripple)
    fireEvent.pointerEnter(swirl)

    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    await waitFor(() => expect(useShowPreviewOverrideStore.getState().show?.cells[0].effects?.[0]?.kind).toBe('swirl'))
    expect(previewKinds).toEqual(['swirl'])
    unsubscribe()
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

    expect(screen.getAllByTestId('show-effect-stage')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Edit Translate Effect' }))
    const translate = screen.getByTestId('show-effect-move')
    fireEvent.change(within(translate).getByRole('spinbutton', { name: 'X' }), { target: { value: '0.35' } })
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
