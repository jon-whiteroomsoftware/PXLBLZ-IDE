import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useControlStore, controlInitialState } from '@/store/controlStore'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { PreviewDeck } from './PreviewDeck'

function resetStores() {
  usePreviewStore.setState(previewInitialState)
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  useControlStore.setState(controlInitialState)
  usePanelPreferencesStore.setState({ expanded: {} })
}

beforeEach(() => {
  resetStores()
  usePreviewStore.setState({
    isRunning: false,
    elapsed: 1000,
    slowMo: 0.5,
    dreamy: 1,
  })
  useEditorStore.setState({ layoutLabel: '16×16' })
  usePanelPreferencesStore.setState({ expanded: { 'pattern:preview': true } })
})

afterEach(() => {
  cleanup()
  resetStores()
  document.body.replaceChildren()
})

function overlaps(a: DOMRect, b: DOMRect) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

function expectInside(control: DOMRect, panel: DOMRect) {
  expect(control.width).toBeGreaterThan(0)
  expect(control.height).toBeGreaterThan(0)
  expect(control.left).toBeGreaterThanOrEqual(panel.left - 1)
  expect(control.right).toBeLessThanOrEqual(panel.right + 1)
}

describe('Wrappers in the production preview grid', () => {
  it.each([460, 375])('collapses to one header and keeps expanded sliders in one row at %ipx', width => {
    const host = document.createElement('div')
    host.style.width = `${width}px`
    document.body.appendChild(host)
    const view = render(<PreviewDeck />, { container: host })
    for (const expanded of [false, true]) {
      act(() => usePanelPreferencesStore.setState({ expanded: { 'pattern:wrappers': expanded } }))
      view.rerender(<PreviewDeck />)
      const section = screen.getByRole('region', { name: 'Wrappers' })
      const panel = section.getBoundingClientRect()
      const sliders = section.querySelectorAll<HTMLElement>('[data-deck="slider"]')
      expect(sliders).toHaveLength(expanded ? 2 : 0)
      if (expanded) {
        const [slowMo, dreamy] = [...sliders].map(el => el.getBoundingClientRect())
        expect(Math.abs(slowMo.top - dreamy.top)).toBeLessThanOrEqual(1)
        expect(overlaps(slowMo, dreamy)).toBe(false)
      } else {
        const header = section.querySelector('[data-deck="section-header"]')!.getBoundingClientRect()
        expect(panel.height).toBe(header.height + 1)
        expect(section.querySelector('.panel-section-body')).toHaveAttribute('hidden')
      }
      for (const control of section.querySelectorAll<HTMLElement>('input, button')) {
        expectInside(control.getBoundingClientRect(), panel)
        control.focus()
        expect(document.activeElement).toBe(control)
      }
    }
  })
})
