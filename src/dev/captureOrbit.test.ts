import { describe, it, expect, vi } from 'vitest'
import { beginCaptureOrbit } from './captureOrbit'
import { advanceAutoOrbit, type OrbitCamera } from '@/engine/camera'

const DEFAULT: OrbitCamera = { azimuth: 0.4, elevation: 0.3, roll: 0 }

function makeDeps(overrides: { is3D?: boolean; autoOrbit?: boolean } = {}) {
  const calls: string[] = []
  const state = { autoOrbit: overrides.autoOrbit ?? true, camera: { ...DEFAULT, azimuth: 2.2 } }
  const deps = {
    is3D: overrides.is3D ?? true,
    getState: () => state,
    setAutoOrbit: vi.fn((autoOrbit: boolean) => { state.autoOrbit = autoOrbit; calls.push(`arm:${autoOrbit}`) }),
    resetView: vi.fn(() => { state.camera = { ...DEFAULT }; state.autoOrbit = true; calls.push('reset') }),
    applyCamera: vi.fn((camera: OrbitCamera) => { calls.push(`cam:${camera.azimuth.toFixed(4)}`) }),
    commitCamera: vi.fn((camera: OrbitCamera) => { state.camera = camera; calls.push(`commit:${camera.azimuth.toFixed(4)}`) }),
  }
  return { calls, state, deps }
}

describe('beginCaptureOrbit', () => {
  it('resets the view, disarms the wall-clock drive, applies each virtual delta outside the store, then commits once', () => {
    const { calls, deps } = makeDeps()
    const orbit = beginCaptureOrbit(deps)
    expect(orbit.driven).toBe(true)
    orbit.advance(0)
    orbit.advance(20)
    orbit.advance(20)
    orbit.end()
    const step1 = advanceAutoOrbit(DEFAULT, 20)
    const step2 = advanceAutoOrbit(step1, 20)
    expect(calls).toEqual([
      'reset', 'arm:false',
      `cam:${step1.azimuth.toFixed(4)}`, `cam:${step2.azimuth.toFixed(4)}`,
      `commit:${step2.azimuth.toFixed(4)}`, 'arm:true',
    ])
    // No store camera write between begin and end.
    expect(deps.commitCamera).toHaveBeenCalledTimes(1)
  })

  it('accumulates the same azimuth for one long step as for its parts (pre-roll equivalence)', () => {
    const a = makeDeps()
    const b = makeDeps()
    const orbitA = beginCaptureOrbit(a.deps)
    const orbitB = beginCaptureOrbit(b.deps)
    orbitA.advance(1000)
    for (let i = 0; i < 50; i += 1) orbitB.advance(20)
    orbitA.end()
    orbitB.end()
    expect(b.state.camera.azimuth).toBeCloseTo(a.state.camera.azimuth, 9)
  })

  it('leaves a 2D layout untouched', () => {
    const { calls, deps } = makeDeps({ is3D: false })
    const orbit = beginCaptureOrbit(deps)
    orbit.advance(20)
    orbit.end()
    expect(orbit.driven).toBe(false)
    expect(calls).toEqual([])
  })

  it('holds a disarmed 3D camera where the user left it', () => {
    const { calls, deps, state } = makeDeps({ autoOrbit: false })
    const orbit = beginCaptureOrbit(deps)
    orbit.advance(20)
    orbit.end()
    expect(orbit.driven).toBe(false)
    expect(calls).toEqual([])
    expect(state.camera.azimuth).toBe(2.2)
    expect(state.autoOrbit).toBe(false)
  })
})
