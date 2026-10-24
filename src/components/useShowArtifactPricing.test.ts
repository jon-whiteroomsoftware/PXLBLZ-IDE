// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as pricing from '@/engine/showArtifactPricing'
import { useShowArtifactPricing } from './useShowArtifactPricing'

afterEach(() => vi.restoreAllMocks())

const context = { controllerId: 'A', liveEpoch: 1 }
const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)
const initial: Parameters<typeof useShowArtifactPricing>[0] = {
  source: '// banner A', estimatedBytes: 123, context,
  measurement: { ...context, sourceSha256: hashA, byteLength: 60_000 },
}

function deferred() {
  let resolve!: (hash: string) => void
  let reject!: (error: Error) => void
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

it('invalidates a resolved full source immediately, even for a same-length banner/profile/library edit', async () => {
  const hash = vi.spyOn(pricing, 'sha256CompleteCompileInput').mockResolvedValue(hashA)
  const renders: Array<ReturnType<typeof pricing.priceShowArtifact>> = []
  const hook = renderHook((props: typeof initial) => {
    const result = useShowArtifactPricing(props)
    renders.push(result)
    return result
  }, { initialProps: initial })
  await act(async () => {})
  expect(hook.result.current).toMatchObject({ kind: 'exact', bytes: 60_000, budgetRatio: 60_000 / 54_707 })
  for (const source of ['// banner B', '// profileB', '// libraryB']) {
    const pending = deferred()
    hash.mockReturnValueOnce(pending.promise)
    renders.length = 0
    hook.rerender({ ...initial, source })
    expect(renders.every((result) => result.kind === 'estimate')).toBe(true)
    expect(hook.result.current).toMatchObject({ kind: 'estimate', bytes: 123 })
    await act(async () => pending.resolve(hashB))
    expect(hook.result.current.kind).toBe('estimate')
    hook.rerender({ ...initial, source, measurement: { ...initial.measurement!, sourceSha256: hashB } })
    expect(hook.result.current.kind).toBe('exact')
  }
})

it('cancels late A completion and adopts B only against the B measurement', async () => {
  const a = deferred()
  const b = deferred()
  vi.spyOn(pricing, 'sha256CompleteCompileInput').mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  const hook = renderHook(useShowArtifactPricing, { initialProps: initial })
  hook.rerender({ ...initial, source: '// banner B' })
  await act(async () => a.resolve(hashA))
  expect(hook.result.current.kind).toBe('estimate')
  await act(async () => b.resolve(hashB))
  expect(hook.result.current.kind).toBe('estimate')
  hook.rerender({ ...initial, source: '// banner B', measurement: { ...initial.measurement!, sourceSha256: hashB } })
  expect(hook.result.current.kind).toBe('exact')
})

it('keeps errors and absent sources estimated without surfacing an error', async () => {
  vi.spyOn(pricing, 'sha256CompleteCompileInput').mockRejectedValue(new Error('crypto unavailable'))
  const hook = renderHook((props: Parameters<typeof useShowArtifactPricing>[0]) => useShowArtifactPricing(props), { initialProps: initial })
  await act(async () => {})
  expect(hook.result.current).toMatchObject({ kind: 'estimate', bytes: 123 })
  hook.rerender({ ...initial, source: null, estimatedBytes: 0 })
  expect(hook.result.current).toMatchObject({ kind: 'estimate', bytes: 0 })
})

it('invalidates missing live context, reconnects and switches, and recovers only with a current record', async () => {
  vi.spyOn(pricing, 'sha256CompleteCompileInput').mockResolvedValue(hashA)
  const hook = renderHook((props: Parameters<typeof useShowArtifactPricing>[0]) => useShowArtifactPricing(props), { initialProps: initial })
  await act(async () => {})
  expect(hook.result.current.kind).toBe('exact')
  for (const next of [null, { ...context, liveEpoch: 2 }, { ...context, controllerId: 'B' }]) {
    hook.rerender({ ...initial, context: next })
    expect(hook.result.current.kind).toBe('estimate')
    await act(async () => {})
    expect(hook.result.current.kind).toBe('estimate')
  }
  hook.rerender({ ...initial, context })
  await act(async () => {})
  expect(hook.result.current.kind).toBe('exact')
})
