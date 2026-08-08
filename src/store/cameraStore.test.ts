import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ORBIT } from '@/engine/camera'
import { cameraInitialState, useCameraStore } from './cameraStore'

describe('camera store viewport zoom', () => {
  beforeEach(() => {
    useCameraStore.setState(cameraInitialState)
  })

  it('keeps zoom ephemeral, clamped, and part of Reset View', () => {
    const store = useCameraStore.getState()
    store.setCamera({ azimuth: 1.2, elevation: -0.4, roll: 0 })
    store.setAutoOrbit(false)
    store.setZoom(9)

    expect(useCameraStore.getState()).toMatchObject({ zoom: 2, autoOrbit: false })

    useCameraStore.getState().resetView()

    expect(useCameraStore.getState()).toMatchObject({
      camera: DEFAULT_ORBIT,
      zoom: 1,
      autoOrbit: true,
    })
  })
})
