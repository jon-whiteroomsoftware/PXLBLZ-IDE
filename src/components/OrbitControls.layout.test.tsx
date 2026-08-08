import { createRef } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cameraInitialState, useCameraStore } from '@/store/cameraStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { OrbitControls } from './OrbitControls'

beforeEach(() => {
  useCameraStore.setState(cameraInitialState)
  useMapStore.setState(mapInitialState)
})

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

function renderControls(pole: boolean) {
  if (pole) useMapStore.setState({ activeShapeId: 'pole', activePixelCount: 144 })
  const canvasRef = createRef<HTMLCanvasElement>()
  render(
    <div data-testid="viewport" className="relative h-[320px] w-[320px] bg-black">
      <canvas ref={canvasRef} />
      <OrbitControls canvasRef={canvasRef} viewKey={pole ? 'pattern:pole' : 'map:cube'} />
    </div>,
  )
}

describe('3D viewport control rail layout', () => {
  it('stacks navigation and zoom vertically inside the top-right corner', () => {
    renderControls(false)

    const viewport = screen.getByTestId('viewport').getBoundingClientRect()
    const play = screen.getByRole('button', { name: 'Pause auto-orbit' }).getBoundingClientRect()
    const reset = screen.getByRole('button', { name: 'Reset view' }).getBoundingClientRect()
    const zoom = screen.getByTestId('3d-view-zoom-control').getBoundingClientRect()
    const zoomSlider = screen.getByRole('slider', { name: '3D view zoom' }).getBoundingClientRect()

    expect(reset.top).toBeGreaterThanOrEqual(play.bottom)
    expect(zoom.top).toBeGreaterThanOrEqual(reset.bottom)
    expect(Math.abs(play.left - reset.left)).toBeLessThan(1)
    expect(Math.abs(reset.left - zoom.left)).toBeLessThan(1)
    expect(zoomSlider.height).toBeGreaterThanOrEqual(zoomSlider.width * 2)
    expect(zoomSlider.height).toBeLessThanOrEqual(36)
    expect(zoom.right).toBeLessThanOrEqual(viewport.right)
    expect(zoom.bottom).toBeLessThanOrEqual(viewport.bottom)
  })

  it('keeps Pole density below zoom without escaping a square preview', () => {
    renderControls(true)

    const viewport = screen.getByTestId('viewport').getBoundingClientRect()
    const zoom = screen.getByTestId('3d-view-zoom-control').getBoundingClientRect()
    const pole = screen.getByTestId('pole-wrap-density-control').getBoundingClientRect()
    const poleSlider = screen.getByRole('slider', { name: 'Pole wrap density' }).getBoundingClientRect()

    expect(pole.top).toBeGreaterThanOrEqual(zoom.bottom)
    expect(Math.abs(pole.left - zoom.left)).toBeLessThan(1)
    expect(poleSlider.height).toBeGreaterThan(poleSlider.width * 2)
    expect(pole.bottom).toBeLessThanOrEqual(viewport.bottom)
  })
})
