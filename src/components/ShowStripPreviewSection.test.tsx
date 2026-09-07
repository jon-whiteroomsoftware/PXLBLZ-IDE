import userEvent from '@testing-library/user-event'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ShowStripPreviewSection } from './ShowStripPreviewSection'
import { ShowStripSection } from './ShowStripSection'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'

beforeEach(() => {
  usePanelPreferencesStore.setState({ expanded: {} })
  usePreviewStore.setState({ ...previewInitialState, lightSize: 0.85, diffusion: 0.75, fps: 28.4, isRunning: false })
})

describe('Show strip Preview controls (#968)', () => {
  it('keeps existing controls live and reports those same values when folded', () => {
    render(<ShowStripPreviewSection />)
    const toggle = screen.getByRole('button', { name: 'Preview' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('slider', { name: /brightness/i })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Light size' }), { target: { value: '0.7' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Diffusion' }), { target: { value: '0.6' } })
    expect(usePreviewStore.getState()).toMatchObject({ lightSize: 0.7, lightSizeSticky: 0.7, diffusion: 0.6, diffusionSticky: 0.6 })
    fireEvent.click(toggle)
    const summary = screen.getByTestId('deck-section-summary')
    expect(summary).toHaveTextContent('0.70')
    expect(summary).toHaveTextContent('60%')
    expect(summary).toHaveTextContent('Fast')
    expect(summary).toHaveTextContent('28.4')
    expect(within(summary).queryByRole('slider')).not.toBeInTheDocument()
    expect(usePanelPreferencesStore.getState().expanded['show-strip:preview']).toBe(false)
    expect(usePanelPreferencesStore.getState().expanded['pattern:preview']).toBeUndefined()
  })
  it('keeps an open renderer menu option Space local', async () => {
    const user = userEvent.setup()
    render(<ShowStripPreviewSection />)
    await user.click(screen.getByRole('button', { name: 'Renderer' }))
    screen.getByRole('option', { name: 'Precise' }).focus()
    await user.keyboard(' ')
    expect(usePreviewStore.getState().fidelity).toBe('fidelity')
    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
  it('marks only disclosure chrome for the existing playback owner', () => {
    render(<ShowStripSection label="Preview"><input aria-label="Native text" /></ShowStripSection>)
    const toggle = screen.getByRole('button', { name: 'Preview' })
    expect(toggle).toHaveAttribute('data-studio-space-preview', 'true')
    const text = screen.getByRole('textbox')
    expect(text.closest('[data-studio-space-preview]')).toBeNull()
    expect(fireEvent.keyDown(text, { key: ' ', code: 'Space' })).toBe(true)
    expect(usePreviewStore.getState().isRunning).toBe(false)
  })
})
