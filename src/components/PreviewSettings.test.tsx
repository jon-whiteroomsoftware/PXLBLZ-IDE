import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreviewSettings } from './PreviewSettings'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
})

describe('PreviewSettings', () => {
  it('renders a gear button', () => {
    render(<PreviewSettings />)
    expect(screen.getByRole('button', { name: /preview settings/i })).toBeInTheDocument()
  })

  it('settings panel is hidden by default', () => {
    render(<PreviewSettings />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking gear opens the settings panel', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clicking gear again closes the panel', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking outside dismisses the panel', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <PreviewSettings />
        <button>outside</button>
      </div>
    )
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /outside/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('settings panel shows Display section heading', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    expect(screen.getByText('Display')).toBeInTheDocument()
  })

  it('brightness slider updates the store', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    const slider = screen.getByRole('slider', { name: /brightness/i })
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(usePreviewStore.getState().brightness).toBe(0.5)
  })

  it('diffusion slider updates the store', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    const slider = screen.getByRole('slider', { name: /diffusion/i })
    fireEvent.change(slider, { target: { value: '0.3' } })
    expect(usePreviewStore.getState().diffusion).toBe(0.3)
  })

  it('light size slider updates the store', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    const slider = screen.getByRole('slider', { name: /light size/i })
    fireEvent.change(slider, { target: { value: '0.8' } })
    expect(usePreviewStore.getState().lightSize).toBe(0.8)
  })

  it('renderer toggle shows both Fast and Precise options', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    const group = screen.getByRole('radiogroup', { name: /renderer/i })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Fast' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Precise' })).toBeInTheDocument()
  })

  it('renderer toggle reflects and updates the store fidelity mode', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    // Default on load is the fast (float64) renderer
    expect(screen.getByRole('radio', { name: 'Fast' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: 'Precise' }))
    expect(usePreviewStore.getState().fidelity).toBe('fidelity')
    expect(screen.getByRole('radio', { name: 'Precise' })).toHaveAttribute('aria-checked', 'true')
  })

  it('pixel count input shows the dimension default when no pattern count is set', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    // displayDim defaults to 2 → 1024 (the 32×32 plane default).
    expect(screen.getByRole('spinbutton', { name: /pixel count/i })).toHaveValue(1024)
  })

  it('clicking OK commits the pixel count to the map store', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    await user.clear(screen.getByRole('spinbutton', { name: /pixel count/i }))
    await user.type(screen.getByRole('spinbutton', { name: /pixel count/i }), '256')
    await user.click(screen.getByRole('button', { name: /ok/i }))
    expect(useMapStore.getState().activePixelCount).toBe(256)
  })

  it('pressing Enter in the pixel count input commits it', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    await user.clear(screen.getByRole('spinbutton', { name: /pixel count/i }))
    await user.type(screen.getByRole('spinbutton', { name: /pixel count/i }), '300{Enter}')
    expect(useMapStore.getState().activePixelCount).toBe(300)
  })

  it('clamps an oversized pixel count to the freeze guard on commit', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    await user.clear(screen.getByRole('spinbutton', { name: /pixel count/i }))
    await user.type(screen.getByRole('spinbutton', { name: /pixel count/i }), '999999')
    await user.click(screen.getByRole('button', { name: /ok/i }))
    expect(useMapStore.getState().activePixelCount).toBe(65536)
    expect(screen.getByRole('spinbutton', { name: /pixel count/i })).toHaveValue(65536)
  })
})
