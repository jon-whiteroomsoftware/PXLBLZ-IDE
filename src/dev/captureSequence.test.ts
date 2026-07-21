import { describe, it, expect, vi } from 'vitest'
import { runCaptureSequence, sequenceFrameName } from './captureSequence'

// Deps whose capture resolves immediately, recording the interleaving of
// request/tick calls so ordering (request BEFORE the paint that fulfils it)
// is observable.
function makeDeps() {
  const calls: string[] = []
  return {
    calls,
    deps: {
      requestCapture: vi.fn((name: string): Promise<unknown> => {
        calls.push(`request:${name}`)
        return Promise.resolve({ ok: true, path: `/tmp/${name}` })
      }),
      tickFrame: vi.fn((deltaMs: number) => {
        calls.push(`tick:${deltaMs}`)
      }),
    },
  }
}

describe('sequenceFrameName', () => {
  it('zero-pads the frame index to five digits', () => {
    expect(sequenceFrameName('clip', 0)).toBe('clip-00000.png')
    expect(sequenceFrameName('clip', 12345)).toBe('clip-12345.png')
  })
})

describe('runCaptureSequence', () => {
  it('captures the requested frame count with sequential names', async () => {
    const { deps } = makeDeps()
    const result = await runCaptureSequence(deps, { frames: 3, fps: 60, prefix: 'demo' })
    expect(result.frames).toBe(3)
    expect(result.names).toEqual(['demo-00000.png', 'demo-00001.png', 'demo-00002.png'])
    expect(result.failures).toEqual([])
  })

  it('ticks 0 for the first frame then exactly 1000/fps, registering each capture before its tick', async () => {
    const { deps, calls } = makeDeps()
    await runCaptureSequence(deps, { frames: 3, fps: 50 })
    expect(calls).toEqual([
      'request:frame-00000.png', 'tick:0',
      'request:frame-00001.png', 'tick:20',
      'request:frame-00002.png', 'tick:20',
    ])
  })

  it('waits for each frame to save before requesting the next', async () => {
    const resolvers: ((r: unknown) => void)[] = []
    const requestCapture = vi.fn(
      () => new Promise((resolve) => { resolvers.push(resolve) }),
    )
    const deps = { requestCapture, tickFrame: vi.fn() }
    const done = runCaptureSequence(deps, { frames: 2, fps: 60 })
    await Promise.resolve()
    expect(requestCapture).toHaveBeenCalledTimes(1)
    resolvers[0]({ ok: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(requestCapture).toHaveBeenCalledTimes(2)
    resolvers[1]({ ok: true })
    await done
  })

  it('collects per-frame sink failures without aborting the sequence', async () => {
    const { deps } = makeDeps()
    deps.requestCapture.mockResolvedValueOnce({ ok: false, error: 'disk full' })
    const result = await runCaptureSequence(deps, { frames: 2, fps: 60 })
    expect(result.frames).toBe(2)
    expect(result.failures).toEqual([{ name: 'frame-00000.png', error: 'disk full' }])
  })

  it('invokes onBeforeFrame with the frame delta ahead of each capture', async () => {
    const { deps, calls } = makeDeps()
    const onBeforeFrame = vi.fn((deltaMs: number) => { calls.push(`before:${deltaMs}`) })
    await runCaptureSequence({ ...deps, onBeforeFrame }, { frames: 2, fps: 50 })
    expect(calls).toEqual([
      'before:0', 'request:frame-00000.png', 'tick:0',
      'before:20', 'request:frame-00001.png', 'tick:20',
    ])
  })

  it('reports progress after each saved frame', async () => {
    const { deps } = makeDeps()
    const onProgress = vi.fn()
    await runCaptureSequence(deps, { frames: 2, fps: 60, onProgress })
    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]])
  })

  it('rejects a non-positive or fractional frame count and a non-positive fps', async () => {
    const { deps } = makeDeps()
    await expect(runCaptureSequence(deps, { frames: 0, fps: 60 })).rejects.toThrow()
    await expect(runCaptureSequence(deps, { frames: 1.5, fps: 60 })).rejects.toThrow()
    await expect(runCaptureSequence(deps, { frames: 1, fps: 0 })).rejects.toThrow()
  })
})
