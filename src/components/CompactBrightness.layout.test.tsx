import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ShowStripPreviewSection } from './ShowStripPreviewSection'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { usePreviewStore } from '@/store/previewStore'
import './ShowStripPanel.css'

afterEach(cleanup)
for (const width of [200, 464]) it(`keeps Show brightness within ${width}px controls when folded and expanded`, () => {
  usePanelPreferencesStore.setState({ expanded: {} })
  usePreviewStore.setState({ brightness: 1 })
  const { container } = render(<div className="show-strip-sections" style={{ width }}><ShowStripPreviewSection /></div>)
  const bounds = container.firstElementChild!.getBoundingClientRect()
  for (let i = 0; i < 2; i++) {
    const slider = screen.getByRole('slider', { name: 'Show preview brightness' })
    const readout = slider.parentElement!.querySelector('span')!
    expect(getComputedStyle(readout).display).not.toBe('none')
    expect(readout).toHaveTextContent('100%')
    expect(readout.scrollWidth).toBeLessThanOrEqual(readout.clientWidth)
    expect(slider.getBoundingClientRect().width).toBeGreaterThanOrEqual(52)
    expect(readout.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right)
    expect(slider.getBoundingClientRect().left).toBeGreaterThanOrEqual(bounds.left)
    const overflow = Array.from(container.querySelectorAll<HTMLElement>('*')).filter(e => !e.closest('[data-deck="section-summary"]') && e.scrollWidth > e.clientWidth + 1)
    expect(overflow.map(e => e.className)).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  }
})
