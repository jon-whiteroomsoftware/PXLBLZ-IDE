// Dev-only deterministic 3D auto-orbit for frame-sequence capture (#879).
//
// In the running app the turntable advances on its own wall-clock rAF,
// decoupled from the pattern's virtual clock. A capture sequence steps the
// pattern deterministically but would leave the camera drifting in real time,
// so a t=0 render and a --start render disagree on the camera angle. This
// helper takes the orbit over for the capture: while armed it disarms the
// wall-clock drive, resets to the canonical view, and advances the camera by
// exactly the same virtual delta as every pattern step (pre-roll included).
// Frame K therefore sees azimuth = default + speed * (startMs + K * delta).

import { advanceAutoOrbit, type OrbitCamera } from '@/engine/camera'

export interface CaptureOrbitDeps {
  /** Whether the active layout orbits at all (3D). */
  is3D: boolean
  getState(): { autoOrbit: boolean; camera: OrbitCamera }
  setAutoOrbit(autoOrbit: boolean): void
  /** Restore the canonical view (camera, zoom) that opening a 3D layout uses. */
  resetView(): void
  /** Apply a camera for the next paint without going through the store —
   * store writes wake the paused-repaint subscribers, which would insert extra
   * Pattern renders between capture steps. */
  applyCamera(camera: OrbitCamera): void
  /** Write the final camera to the store once the capture has finished, so
   * the visible view state agrees with the last frame. */
  commitCamera(camera: OrbitCamera): void
}

export interface CaptureOrbit {
  /** True when the capture drives the orbit; false when it is held still. */
  driven: boolean
  advance(deltaMs: number): void
  /** Commit the final camera and re-arm the wall-clock drive; call from a
   * finally block. */
  end(): void
}

export function beginCaptureOrbit(deps: CaptureOrbitDeps): CaptureOrbit {
  const armed = deps.is3D && deps.getState().autoOrbit
  if (!armed) {
    // A 2D layout has no orbit; a disarmed 3D orbit is a held camera the user
    // chose — respect it and leave every store field untouched.
    return { driven: false, advance: () => undefined, end: () => undefined }
  }
  // Reset first (it re-arms auto-orbit), then disarm so the wall-clock rAF
  // stops advancing for the duration of the capture. Both are store writes
  // that happen once, before any pattern step, so a t=0 and a --start capture
  // see the same operations from here on.
  deps.resetView()
  deps.setAutoOrbit(false)
  let camera = deps.getState().camera
  return {
    driven: true,
    advance(deltaMs) {
      if (deltaMs <= 0) return
      camera = advanceAutoOrbit(camera, deltaMs)
      deps.applyCamera(camera)
    },
    end() {
      deps.commitCamera(camera)
      deps.setAutoOrbit(true)
    },
  }
}
