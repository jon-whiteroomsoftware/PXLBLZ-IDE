import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useControlStore, controlInitialState } from '@/store/controlStore'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { PreviewViewportSection } from './PreviewDeck'

const originalUrl = location.href

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
  history.replaceState(null, '', `${location.pathname}?slowmo=1`)
  usePreviewStore.setState({
    isRunning: false,
    slowMo: {
      rate: 0.25, stepMs: 16, inBetween: 'blend',
      stagger: { shape: 'sweep', width: 0 }, persistence: null,
    },
    slowMoArtifact: { code: 'fixture', arrayWords: 1560 },
    elapsed: 1000,
  })
  useEditorStore.setState({ layoutLabel: '16×16' })
  usePanelPreferencesStore.setState({ expanded: { 'pattern:preview': true } })
})

afterEach(() => {
  cleanup()
  resetStores()
  history.replaceState(null, '', originalUrl)
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

describe('Slow-mo lab in the production preview grid', () => {
  it.each([460, 375])('fills the section without overlapping controls at %ipx', (width) => {
    const host = document.createElement('div')
    host.style.width = `${width}px`
    host.style.height = '900px'
    host.style.overflow = 'hidden'
    document.body.appendChild(host)

    render(
      <div className="pattern-panel-container">
        <div className="pattern-panel">
          <PreviewViewportSection mode="pattern" profile="pattern" />
        </div>
      </div>,
      { container: host },
    )

    const lab = screen.getByRole('region', { name: 'Slow-mo lab' }).getBoundingClientRect()
    const body = host.querySelector<HTMLElement>('.panel-section-body')!
    const panel = body.getBoundingClientRect()
    const renderer = screen.getByRole('button', { name: 'Renderer' }).getBoundingClientRect()
    const speed = screen.getByRole('button', { name: 'Speed' }).getBoundingClientRect()
    const elapsed = screen.getByText('elapsed', { exact: true }).closest('[data-deck="cell"]')!.getBoundingClientRect()

    expect(Math.abs(lab.left - panel.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(lab.right - panel.right)).toBeLessThanOrEqual(1)
    expect(lab.top).toBeGreaterThanOrEqual(Math.max(renderer.bottom, speed.bottom))
    expect(lab.bottom).toBeLessThanOrEqual(elapsed.top)
    expect(overlaps(renderer, speed)).toBe(false)

    const cells = body.querySelectorAll<HTMLElement>('[data-deck="cell"], [data-deck="slider"]')
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      const label = cell.firstElementChild!.getBoundingClientRect()
      const value = cell.lastElementChild!.getBoundingClientRect()
      expectInside(value, panel)
      expect(overlaps(label, value), cell.textContent ?? '').toBe(false)
      // Select triggers can overflow their wrapper even when the wrapper fits.
      for (const control of cell.querySelectorAll<HTMLElement>('button, input')) {
        const bounds = control.getBoundingClientRect()
        expectInside(bounds, panel)
        expect(overlaps(label, bounds), control.getAttribute('aria-label') ?? '').toBe(false)
      }
    }

    for (const name of ['Renderer', 'Speed', 'Slow-mo rate', 'Slow-mo step', 'Slow-mo method']) {
      const control = screen.getByRole('button', { name })
      expect(control).toBeEnabled()
      expect(control.getBoundingClientRect().bottom).toBeLessThanOrEqual(host.getBoundingClientRect().bottom)
      control.focus()
      expect(document.activeElement).toBe(control)
    }
    for (const name of ['Light size', 'Diffusion']) {
      const control = screen.getByRole('slider', { name })
      expect(control).toBeEnabled()
      control.focus()
      expect(document.activeElement).toBe(control)
    }
  })
})
