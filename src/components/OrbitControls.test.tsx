import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { cameraInitialState, useCameraStore } from '@/store/cameraStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { OrbitControls } from './OrbitControls'

describe('OrbitControls', () => {
  beforeEach(() => {
    useCameraStore.setState(cameraInitialState)
    useMapStore.setState(mapInitialState)
  })

  it('offers the agreed vertical zoom range and Reset View sequence', () => {
    const canvasRef = createRef<HTMLCanvasElement>()
    render(
      <div>
        <canvas ref={canvasRef} />
        <OrbitControls canvasRef={canvasRef} viewKey="pattern:cube" />
      </div>,
    )

    const zoom = screen.getByRole('slider', { name: '3D view zoom' })
    expect(zoom).toHaveAttribute('aria-orientation', 'vertical')
    expect(zoom).toHaveAttribute('min', '0.5')
    expect(zoom).toHaveAttribute('max', '2')
    expect(zoom).toHaveAttribute('step', '0.05')
    expect(zoom).toHaveAttribute('aria-valuetext', '1×')

    fireEvent.change(zoom, { target: { value: '2.25' } })
    expect(useCameraStore.getState().zoom).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(useCameraStore.getState()).toMatchObject({ zoom: 1, autoOrbit: true })
  })

  it('zooms coarsely when the wheel moves over the 3D canvas', () => {
    useMapStore.setState({ activeShapeId: 'pole', activePixelCount: 144 })
    useCameraStore.getState().setPoleCols(12)
    const canvasRef = createRef<HTMLCanvasElement>()
    render(
      <div>
        <canvas ref={canvasRef} />
        <OrbitControls canvasRef={canvasRef} viewKey="pattern:cube" />
      </div>,
    )

    expect(fireEvent.wheel(canvasRef.current!, { deltaY: -100 })).toBe(false)
    expect(useCameraStore.getState().zoom).toBe(1.25)
    expect(useCameraStore.getState().poleCols).toBe(12)

    expect(fireEvent.wheel(canvasRef.current!, { deltaY: 100 })).toBe(false)
    expect(useCameraStore.getState().zoom).toBe(1)
    expect(useCameraStore.getState().poleCols).toBe(12)

    expect(fireEvent.wheel(canvasRef.current!, { deltaY: 0 })).toBe(true)
    expect(useCameraStore.getState().zoom).toBe(1)
  })

  it('keeps Pole wrap density in the same vertical tool rail', () => {
    useMapStore.setState({ activeShapeId: 'pole', activePixelCount: 144 })
    const canvasRef = createRef<HTMLCanvasElement>()
    render(
      <div>
        <canvas ref={canvasRef} />
        <OrbitControls canvasRef={canvasRef} viewKey="pattern:pole" />
      </div>,
    )

    expect(screen.getByRole('slider', { name: 'Pole wrap density' })).toHaveAttribute(
      'aria-orientation',
      'vertical',
    )
  })

  it('returns to automatic fit when the displayed 3D geometry changes', () => {
    const canvasRef = createRef<HTMLCanvasElement>()
    const { rerender } = render(
      <div>
        <canvas ref={canvasRef} />
        <OrbitControls canvasRef={canvasRef} viewKey="map:cube" />
      </div>,
    )
    act(() => useCameraStore.getState().setZoom(2))

    rerender(
      <div>
        <canvas ref={canvasRef} />
        <OrbitControls canvasRef={canvasRef} viewKey="map:cube" />
      </div>,
    )
    expect(useCameraStore.getState().zoom).toBe(2)

    rerender(
      <div>
        <canvas ref={canvasRef} />
        <OrbitControls canvasRef={canvasRef} viewKey="map:star-shell" />
      </div>,
    )
    expect(useCameraStore.getState().zoom).toBe(1)
  })
})
