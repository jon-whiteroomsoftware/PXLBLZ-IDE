import { describe, it, expect, vi } from 'vitest'
import { runShowStageCaptureSequence, type ShowStageCaptureRuntime } from './showStageCapture'

// A replay runtime stand-in that tracks virtual time and records every call,
// so ordering (pause → reset → pre-roll → capture/advance) is observable.
function makeRuntime(calls: string[], initialMs = 0): ShowStageCaptureRuntime<string> {
  let elapsed = initialMs
  return {
    getElapsedMs: () => elapsed,
    renderCurrentFrame: () => {
      calls.push(`present:${elapsed}`)
      return `frame@${elapsed}`
    },
    advanceLive: (deltaMs) => {
      elapsed += deltaMs
      calls.push(`live:${deltaMs}`)
      return `frame@${elapsed}`
    },
    advanceTo: (targetMs, advance) => {
      calls.push(`to:${targetMs}:step${advance.stepMs}:present${advance.presentTargetFrame ?? true}`)
      elapsed = targetMs
      return `frame@${elapsed}`
    },
  }
}

function makeDeps(initialMs = 0) {
  const calls: string[] = []
  const runtime = makeRuntime(calls, initialMs)
  const deps = {
    pause: vi.fn(() => { calls.push('pause') }),
    resetToStart: vi.fn(async () => { calls.push('reset'); return runtime }),
    paint: vi.fn((frame: string) => { calls.push(`paint:${frame}`) }),
    requestCapture: vi.fn((name: string) => {
      calls.push(`request:${name}`)
      return Promise.resolve({ ok: true })
    }),
  }
  return { calls, deps }
}

describe('runShowStageCaptureSequence', () => {
  it('pauses, resets to t=0, then presents frame 0 unadvanced and advances live per frame', async () => {
    const { calls, deps } = makeDeps()
    const result = await runShowStageCaptureSequence(deps, { frames: 3, fps: 50, prefix: 'show' })
    expect(calls).toEqual([
      'pause', 'reset',
      'request:show-00000.png', 'present:0', 'paint:frame@0',
      'request:show-00001.png', 'live:20', 'paint:frame@20',
      'request:show-00002.png', 'live:20', 'paint:frame@40',
    ])
    expect(result.frames).toBe(3)
    expect(result.startMs).toBe(0)
  })

  it('pre-rolls headless to startMs with advanceTo and no presented frame, so frame 0 sits at startMs', async () => {
    const { calls, deps } = makeDeps()
    const result = await runShowStageCaptureSequence(deps, { frames: 2, fps: 50, startMs: 50 })
    expect(calls).toEqual([
      'pause', 'reset',
      'to:20:step20:presentfalse', 'to:40:step20:presentfalse', 'to:50:step10:presentfalse',
      'request:frame-00000.png', 'present:50', 'paint:frame@50',
      'request:frame-00001.png', 'live:20', 'paint:frame@70',
    ])
    expect(result.startMs).toBe(50)
    expect(deps.paint).toHaveBeenCalledTimes(2)
  })

  it('advances a driven orbit on every pre-roll step and before every frame, and re-arms it afterwards', async () => {
    const { calls, deps } = makeDeps()
    const orbit = {
      driven: true,
      advance: vi.fn((deltaMs: number) => { calls.push(`orbit:${deltaMs}`) }),
      end: vi.fn(() => { calls.push('orbit:end') }),
    }
    await runShowStageCaptureSequence({ ...deps, beginOrbit: () => orbit }, { frames: 2, fps: 50, startMs: 40 })
    expect(calls).toEqual([
      'pause', 'reset',
      'to:20:step20:presentfalse', 'orbit:20', 'to:40:step20:presentfalse', 'orbit:20',
      'orbit:0', 'request:frame-00000.png', 'present:40', 'paint:frame@40',
      'orbit:20', 'request:frame-00001.png', 'live:20', 'paint:frame@60',
      'orbit:end',
    ])
  })

  it('re-arms the orbit even when the sequence throws', async () => {
    const { deps } = makeDeps()
    const orbit = { driven: true, advance: vi.fn(), end: vi.fn() }
    await expect(runShowStageCaptureSequence({ ...deps, beginOrbit: () => orbit }, { frames: 0, fps: 50 })).rejects.toThrow()
    expect(orbit.end).toHaveBeenCalledTimes(1)
  })

  it('refuses to record when the reset did not land the runtime at t=0', async () => {
    const { deps } = makeDeps(1234)
    await expect(runShowStageCaptureSequence(deps, { frames: 1, fps: 30 })).rejects.toThrow(/t=0/)
    expect(deps.requestCapture).not.toHaveBeenCalled()
  })

  it('propagates a failed reset without touching the sink', async () => {
    const { deps } = makeDeps()
    deps.resetToStart.mockRejectedValueOnce(new Error('seek cancelled'))
    await expect(runShowStageCaptureSequence(deps, { frames: 1, fps: 30 })).rejects.toThrow('seek cancelled')
    expect(deps.requestCapture).not.toHaveBeenCalled()
  })
})
