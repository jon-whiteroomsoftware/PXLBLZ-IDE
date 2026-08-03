import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NEUTRAL_SHOW_CLIP_TRANSFORM } from '@/engine/showClipTransform'
import { DEFAULT_SHOW_CLIP_VIEWPORT } from '@/engine/showClipViewport'
import { contentRectFromTransform } from '@/engine/showClipPlacementPad'
import { ShowClipPlacementPad } from './ShowClipPlacementPad'
import type { ShowClipTransform, ShowClipViewport } from '@/engine/personalContentRecords'

function setup(
  transform: Partial<ShowClipTransform> = {},
  viewport: Partial<ShowClipViewport> = {},
  readOnly = false,
) {
  const onChange = vi.fn()
  render(
    <ShowClipPlacementPad
      transform={{ ...NEUTRAL_SHOW_CLIP_TRANSFORM, ...transform }}
      viewport={{ ...DEFAULT_SHOW_CLIP_VIEWPORT, ...viewport }}
      readOnly={readOnly}
      onChange={onChange}
    />,
  )
  return onChange
}

describe('aperture enablement', () => {
  it('opens the aperture on what the clip already covers', () => {
    const onChange = setup({ positionY: -0.25, scaleY: 0.5 })
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    expect(onChange).toHaveBeenCalledWith({ viewport: expect.objectContaining({ enabled: true, height: 0.5, y: 0 }) })
  })

  it('disables without discarding the authored rectangle', () => {
    const onChange = setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    expect(onChange).toHaveBeenCalledWith({ viewport: expect.objectContaining({ enabled: false, x: 0.25, width: 0.5 }) })
  })
})

describe('editing focus', () => {
  it('offers the two rectangles in one compact focus control', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Content' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Aperture' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows content handles and hides aperture handles while content has focus', () => {
    setup({}, { enabled: true, width: 0.5 })
    expect(screen.getByLabelText('Resize content nw')).toBeInTheDocument()
    expect(screen.queryByLabelText('Resize aperture nw')).not.toBeInTheDocument()
  })

  it('swaps which rectangle owns the handles', () => {
    setup({}, { enabled: true, width: 0.5 })
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    expect(screen.getByLabelText('Resize aperture nw')).toBeInTheDocument()
    expect(screen.queryByLabelText('Resize content nw')).not.toBeInTheDocument()
  })

  it('swaps the trailing actions with focus', () => {
    setup({}, { enabled: true, width: 0.5 })
    expect(screen.getByRole('button', { name: 'Fit' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    expect(screen.getByRole('button', { name: 'Frame' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fit' })).not.toBeInTheDocument()
  })

  it('keeps rotation with the content, since the aperture cannot turn', () => {
    setup({}, { enabled: true, width: 0.5 })
    expect(screen.getByLabelText('Rotate content')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    expect(screen.queryByLabelText('Rotate content')).not.toBeInTheDocument()
  })

  it('enables a missing aperture when its focus segment is activated', () => {
    const onChange = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    expect(onChange).toHaveBeenCalledWith({
      viewport: expect.objectContaining({ enabled: true, width: 1, height: 1 }),
    })
  })

  it('honors controlled Aperture focus for a retained disabled rectangle (#650 review)', () => {
    const onChange = vi.fn()
    render(
      <ShowClipPlacementPad
        transform={{ ...NEUTRAL_SHOW_CLIP_TRANSFORM }}
        viewport={{ ...DEFAULT_SHOW_CLIP_VIEWPORT, enabled: false, x: 0.1, width: 0.8 }}
        focus="aperture"
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('button', { name: 'Content' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Aperture' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Aperture (off)')).toBeInTheDocument()
    const pad = screen.getByRole('application', {
      name: 'Placement pad. Arrow keys nudge the aperture rectangle.',
    })
    expect(screen.getByRole('button', { name: 'Frame' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fit' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.keyDown(pad, { key: 'ArrowRight', shiftKey: false })
    expect(onChange).toHaveBeenCalledWith({
      viewport: expect.objectContaining({ enabled: true, x: 0.11, width: 0.8 }),
    })
  })
})

describe('control bar actions', () => {
  it('fits the content to the aperture', () => {
    const onChange = setup({}, { enabled: true, x: 0.25, y: 0, width: 0.5, height: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))
    expect(onChange).toHaveBeenCalledWith({ transform: expect.objectContaining({ scaleX: 0.5, scaleY: 0.5 }) })
  })

  it('frames the aperture onto the content without touching it', () => {
    const onChange = setup({ positionX: -0.25, scaleX: 0.5, scaleY: 0.5 }, { enabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    fireEvent.click(screen.getByRole('button', { name: 'Frame' }))
    const patch = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(patch.viewport).toMatchObject({ x: 0, width: 0.5 })
    expect(patch.transform).toBeUndefined()
  })

  it('anchors the content inside the target rect', () => {
    const onChange = setup({ scaleX: 0.5, scaleY: 0.5 })
    fireEvent.click(screen.getByLabelText('Anchor column 3 row 3'))
    expect(onChange).toHaveBeenCalledWith({ transform: expect.objectContaining({ positionX: 0.25, positionY: 0.25 }) })
  })

  it.each([
    ['ArrowRight', false, 0.01],
    ['ArrowDown', true, 0.1],
  ])('nudges the aperture off the grid with %s', (key, shiftKey, delta) => {
    const onChange = setup({}, {
      enabled: true,
      x: 1 / 3,
      y: 1 / 3,
      width: 1 / 3,
      height: 1 / 3,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    fireEvent.keyDown(screen.getByRole('application', { name: /Placement pad/ }), { key, shiftKey })

    expect(onChange).toHaveBeenCalledWith({
      viewport: expect.objectContaining({
        x: key === 'ArrowRight' ? 1 / 3 + delta : 1 / 3,
        y: key === 'ArrowDown' ? 1 / 3 + delta : 1 / 3,
      }),
    })
  })
})

describe('read-only', () => {
  it('keeps rectangle focus inspectable while disabling mutations and dropping handles', () => {
    setup({}, { enabled: true, width: 0.5 }, true)
    expect(screen.getByRole('button', { name: 'Aperture' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Grid' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fit' })).toBeDisabled()
    expect(screen.queryByLabelText('Resize content nw')).not.toBeInTheDocument()
  })
})

describe('gesture feedback (#617)', () => {
  it('keeps the square surface responsive instead of fixing its rendered size', () => {
    const { container } = render(
      <ShowClipPlacementPad
        transform={{ ...NEUTRAL_SHOW_CLIP_TRANSFORM }}
        viewport={{ ...DEFAULT_SHOW_CLIP_VIEWPORT, enabled: true, width: 0.5 }}
        onChange={vi.fn()}
      />,
    )
    const pad = screen.getByRole('application', { name: /Placement pad/ })
    expect(pad).toHaveAttribute('viewBox', '0 0 384 384')
    expect(pad).not.toHaveAttribute('width')
    expect(pad).toHaveClass('aspect-square', 'w-full')
    expect(container.querySelector('[data-placement-help]')).toHaveAttribute('title')
  })

  it('replaces the continuous zoom slider with one-commit stepper actions', () => {
    const onChange = vi.fn()
    render(
      <ShowClipPlacementPad
        transform={{ ...NEUTRAL_SHOW_CLIP_TRANSFORM }}
        viewport={{ ...DEFAULT_SHOW_CLIP_VIEWPORT }}
        onChange={onChange}
      />,
    )
    expect(screen.queryByRole('slider', { name: 'Zoom' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      transform: expect.objectContaining({ scaleX: 1.1, scaleY: 1.1 }),
    })
  })

  it('keeps anchor and zoom controls in flow so they cannot cover resize handles', () => {
    setup()
    const footer = screen.getByTestId('placement-pad-footer')
    expect(footer).toContainElement(screen.getByRole('group', { name: 'Anchor' }))
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Zoom in' }))
    expect(footer).not.toHaveClass('absolute')
    expect(screen.getByLabelText('Resize content sw')).toBeInTheDocument()
  })

  it.each([156, 228])('preserves exact edge magnets at a %dpx rendered size', (size) => {
    const onChange = vi.fn()
    render(
      <ShowClipPlacementPad
        transform={{
          ...NEUTRAL_SHOW_CLIP_TRANSFORM,
          positionX: -0.1,
          positionY: -0.2,
          scaleX: 0.6,
          scaleY: 0.4,
        }}
        viewport={{
          ...DEFAULT_SHOW_CLIP_VIEWPORT,
          enabled: true,
          x: 0.2,
          y: 0.2,
          width: 0.6,
          height: 0.4,
        }}
        onChange={onChange}
      />,
    )
    const pad = screen.getByRole('application', { name: /Placement pad/ })
    vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: size, bottom: size, width: size, height: size,
      toJSON: () => ({}),
    })
    // Everything is within the Zone, so placementPadView is [-0.35, 1.35].
    const px = (unit: number) => (unit + 0.35) / 1.7 * size
    const content = screen.getByLabelText('Move content')
    fireEvent.pointerDown(content, { pointerId: 7, clientX: px(0.4), clientY: px(0.3) })
    fireEvent.pointerMove(content, { pointerId: 7, clientX: px(0.49), clientY: px(0.39) })
    fireEvent.pointerUp(content, { pointerId: 7, clientX: px(0.49), clientY: px(0.39) })

    const patch = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0]
    expect(contentRectFromTransform(patch.transform)).toEqual({
      left: 0.2,
      top: 0.2,
      width: 0.6,
      height: 0.4,
    })
  })
})

describe('shaped aperture silhouette (#591)', () => {
  it('draws the inscribed ellipse and quiets the frame outline', () => {
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ellipse' })
    const ellipse = screen.getByTestId('placement-pad-aperture-ellipse')
    expect(ellipse.getAttribute('d')).toContain(' a')
  })

  it('draws each catalogue silhouette from the shared hole path (#678)', () => {
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'diamond' })
    expect(screen.getByTestId('placement-pad-aperture-diamond').getAttribute('d')).toContain('L')
  })

  it('draws the ring as an annulus with an inner hole (#678)', () => {
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ring', ringWidth: 0.5 })
    const ring = screen.getByTestId('placement-pad-aperture-ring')
    // Two closed subpaths: outer and inner boundary.
    expect(ring.getAttribute('d')?.match(/Z/g)).toHaveLength(2)
  })

  it('rounds the box silhouette corners (#678)', () => {
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'rounded-box' })
    expect(screen.getByTestId('placement-pad-aperture-rounded-box').getAttribute('d')).toContain('A')
  })

  it('does not draw an ellipse for the rectangle default', () => {
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    expect(screen.queryByTestId('placement-pad-aperture-ellipse')).toBeNull()
  })

  it('punches the scrim hole with the ellipse silhouette', () => {
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ellipse' })
    const scrim = document.querySelector('path[fill-rule="evenodd"]')
    expect(scrim?.getAttribute('d')).toContain(' a')
  })

  it('samples gauge silhouettes from the shared engine metric (#690)', () => {
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'star' })
    const star = screen.getByTestId('placement-pad-aperture-star')
    expect(star.getAttribute('d')?.match(/L/g)!.length).toBeGreaterThan(40)
    cleanup()
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'cloud' })
    expect(screen.getByTestId('placement-pad-aperture-cloud')).toBeInTheDocument()
  })

  it('cuts the crescent from its two circular arcs (#690)', () => {
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'crescent' })
    const crescent = screen.getByTestId('placement-pad-aperture-crescent')
    expect(crescent.getAttribute('d')?.match(/Z/g)).toHaveLength(1)
  })

  it('rotates the silhouette and keeps the frame axis-aligned (#690)', () => {
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'diamond', rotation: 0.1 })
    const straightTip = screen.getByTestId('placement-pad-aperture-diamond').getAttribute('d')
    cleanup()
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'diamond' })
    expect(screen.getByTestId('placement-pad-aperture-diamond').getAttribute('d')).not.toBe(straightTip)
  })

  it('scrims the silhouette itself when the aperture cuts out (#690)', () => {
    setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ellipse', invert: true })
    const scrim = document.querySelector('path[fill-rule="evenodd"]')
    expect(scrim?.getAttribute('d')?.startsWith('M0,0H384')).toBe(false)
  })
})
