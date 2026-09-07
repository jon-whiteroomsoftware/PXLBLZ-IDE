import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { Preview } from './Preview'
import { PreviewDeck } from './PreviewDeck'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { useControlStore } from '@/store/controlStore'

beforeEach(() => {
  localStorage.clear()
  usePanelPreferencesStore.setState({ expanded: {}, overlays: {} })
  useEditorStore.setState({ ...editorInitialState, patternVars: ['speed'], controls: [{ kind: 'slider', exportName: 'sliderSpeed', label: 'Speed' }] })
  usePreviewStore.setState({ ...previewInitialState, watchValues: { speed: 0.2 } })
  useMapStore.setState(mapInitialState)
  useControlStore.setState({ controlValues: { sliderSpeed: 0.2 } })
})

it('uses tier defaults, sibling map/overlay actions and a stable preview canvas across folds', () => {
  const { container } = render(<Preview />)
  const canvas = container.querySelector('canvas')
  for (const name of ['Pixelblaze', 'Preview', 'Variables']) expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('button', { name: 'Controls' })).toHaveAttribute('aria-expanded', 'true')
  const title = screen.getByTestId('pattern-preview-title')
  expect(within(title).getByRole('slider', { name: 'Brightness' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Map' }).closest('button')?.parentElement?.closest('button')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Variables on canvas' }))
  expect(screen.getByRole('button', { name: 'Variables' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByTestId('variables-canvas-readout')).toHaveTextContent('speed0.20')
  fireEvent.click(screen.getByRole('button', { name: 'Variables' }))
  expect(screen.queryByTestId('variables-canvas-readout')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(container.querySelector('canvas')).toBe(canvas)
})

it('restores section preferences after store hydration and isolates Studio modes', async () => {
  const first = render(<PreviewDeck />)
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  first.unmount()
  // Simulate a fresh store instance reading the saved preference payload.
  const saved = localStorage.getItem('pxlblz-panel-preferences')!
  usePanelPreferencesStore.setState({ expanded: {}, overlays: {} })
  localStorage.setItem('pxlblz-panel-preferences', saved)
  await act(() => usePanelPreferencesStore.persist.rehydrate())
  render(<PreviewDeck />)
  expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-expanded', 'true')
  act(() => useEditorStore.setState({ editorFlavor: 'map' }))
  expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-expanded', 'false')
  act(() => useEditorStore.setState({ editorFlavor: 'pattern' }))
  expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-expanded', 'true')
})

it('keeps non-slider and exact-time controls operable in the new grid', () => {
  useEditorStore.setState({ controls: [
    { kind: 'toggle', exportName: 'toggleEnabled', label: 'Enabled' },
    { kind: 'rgbPicker', exportName: 'rgbPickerColor', label: 'Color' },
    { kind: 'slider', exportName: 'sliderInterval', label: 'Interval', secondsPresentation: { scale: 10, minSeconds: 0.1 } },
  ] })
  useControlStore.setState({ controlValues: { toggleEnabled: 0, rgbPickerColor: [1, 0, 0], sliderInterval: 0.2 } })
  const { container } = render(<PreviewDeck />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'enabled' }))
  expect(useControlStore.getState().controlValues.toggleEnabled).toBe(1)
  fireEvent.change(container.querySelector('input[type="color"]')!, { target: { value: '#00ff00' } })
  expect(useControlStore.getState().controlValues.rgbPickerColor).toEqual([0, 1, 0])
  const interval = screen.getByRole('textbox', { name: /interval/i })
  fireEvent.change(interval, { target: { value: '2.37' } })
  fireEvent.keyDown(interval, { key: 'Enter' })
  expect(useControlStore.getState().controlValues.sliderInterval).toBeCloseTo(0.237)
})

it('closes a section-owned portaled menu when its section folds', () => {
  usePanelPreferencesStore.setState({ expanded: { 'pattern:pixelblaze': true } })
  render(<PreviewDeck />)
  fireEvent.click(screen.getByRole('button', { name: 'Map' }))
  expect(screen.getByRole('listbox', { name: 'Map' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pixelblaze' }))
  expect(screen.queryByRole('listbox', { name: 'Map' })).not.toBeInTheDocument()
})
