import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { Preview } from './Preview'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useControlStore, controlInitialState } from '@/store/controlStore'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { bundleWithPasses } from '@/engine/passEngine'
import { slowMoTunables, type SlowMoSettings } from '@/engine/slowMo'
import { createRenderLoop, type RenderLoopConfig } from '@/engine/renderLoop'
import { loadPattern } from '@/engine/loadPattern'
import { createShim, createFxShim } from '@/engine/shim'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import { bundle } from '@/engine/bundle'

const { paint } = vi.hoisted(() => ({ paint: vi.fn() }))
vi.mock('@/engine/renderer', () => ({ createRenderer: () => ({
  set2DPositions() {}, set3DPositions() {}, setCamera() {}, setZoom() {},
  setSolidity() {}, setDiffusion() {}, resize2D() {}, resize3D() {}, paint,
}) }))
vi.mock('@/engine/renderLoop', async () => {
  const actual = await vi.importActual<typeof import('@/engine/renderLoop')>('@/engine/renderLoop')
  return { ...actual, createRenderLoop: vi.fn(actual.createRenderLoop) }
})
vi.mock('@/engine/loadPattern', async () => {
  const actual = await vi.importActual<typeof import('@/engine/loadPattern')>('@/engine/loadPattern')
  return { ...actual, loadPattern: vi.fn(actual.loadPattern) }
})
const source = 'export function render(index) { rgb(1, 0, 0) }'
const settings: SlowMoSettings = { rate: 0.25, stepMs: 16, inBetween: 'hold', stagger: { shape: 'sweep', width: 0 }, persistence: null }
const originalUrl = location.href
function last<T>(values: T[]): T { return values[values.length - 1] }
const config = (): RenderLoopConfig => last(vi.mocked(createRenderLoop).mock.calls)[0]
const loop = () => last(vi.mocked(createRenderLoop).mock.results).value as ReturnType<typeof createRenderLoop>
function tick(delta: number) { act(() => loop().tickFrame(delta)) }
function pixels() { return last(paint.mock.calls)[0] as number[][] }
function finite() { expect(pixels().flat().every(Number.isFinite)).toBe(true) }
beforeEach(() => {
  vi.clearAllMocks()
  history.replaceState(null, '', `${location.pathname}?slowmo=1`)
  usePreviewStore.setState({ ...previewInitialState, isRunning: false, slowMo: settings })
  useMapStore.setState(mapInitialState)
  useEditorStore.setState({ ...editorInitialState, previewSource: source })
  usePatternStore.setState(patternInitialState)
  useControlStore.setState(controlInitialState)
  usePanelPreferencesStore.setState({ expanded: { 'pattern:preview': true, 'pattern:pixelblaze': true } })
})
afterEach(() => { cleanup(); history.replaceState(null, '', originalUrl) })

describe.each(['fast', 'fidelity'] as const)('slow-mo execution %s', fidelity => {
  beforeEach(() => usePreviewStore.setState({ fidelity }))
  it.each(['absent', 'off', 'off-draft'])('loads the complete stock baseline artifact with slow-mo %s', mode => {
    for (const [name, stockSource] of Object.entries(DEMOS)) {
      vi.clearAllMocks()
      history.replaceState(null, '', mode === 'absent' ? location.pathname : `${location.pathname}?slowmo=1`)
      usePreviewStore.setState({ ...previewInitialState, fidelity, isRunning: false, slowMo: mode === 'off' ? null : settings })
      if (mode === 'off-draft') usePreviewStore.getState().setSlowMoDraft({
        rate: 1 / 32, stepMs: 32, inBetween: 'off',
        stagger: { shape: 'scatter', width: 0.9 },
        persistence: { enabled: true, attackMs: 5000, decayMs: 10000 },
      })
      useMapStore.setState(mapInitialState)
      useEditorStore.setState({ ...editorInitialState, previewSource: stockSource })
      usePatternStore.setState(patternInitialState)
      useControlStore.setState(controlInitialState)
      const base = bundle(stockSource, LIBRARIES)
      const view = render(<Preview showDeck={false} pixelCountCap={16} />)
      expect(vi.mocked(loadPattern).mock.calls.length, `${name}: actual load`).toBeGreaterThan(0)
      expect(last(vi.mocked(loadPattern).mock.calls)[0], `${name}: complete ${fidelity} artifact`).toBe(fidelity === 'fast' ? base.code : base.fxCode)
      expect(vi.mocked(loadPattern).mock.results.every(result => result.type === 'return'), `${name}: execution load`).toBe(true)
      const error = view.container.querySelector('.text-red-400')
      expect(error, `${name}: ${error?.textContent ?? 'no preview error'}`).toBeNull()
      expect(paint, `${name}: initial frame`).toHaveBeenCalled()
      if (mode === 'absent') expect(usePreviewStore.getState().slowMoArtifact, name).toBeNull()
      else expect(usePreviewStore.getState().slowMoArtifact?.code, name).toBe(base.code)
      view.unmount()
    }
  })
  it.each(['absent', 'off', 'clock'])('preserves the complete baseline artifact: %s', mode => {
    if (mode === 'absent') {
      history.replaceState(null, '', location.pathname)
      usePreviewStore.setState({ slowMo: { inBetween: 'future' } as unknown as SlowMoSettings })
    } else usePreviewStore.setState({ slowMo: mode === 'off' ? null : { ...settings, inBetween: 'clock' } })
    usePreviewStore.setState({ speed: 2 })
    render(<Preview showDeck={false} />)
    act(() => usePreviewStore.getState().setSpeed(2))
    const base = bundleWithPasses(source, {}, [])
    expect(last(vi.mocked(loadPattern).mock.calls)[0]).toBe(fidelity === 'fast' ? base.code : base.fxCode)
    expect(config().getSpeed()).toBe(mode === 'clock' ? 0.5 : 2)
    tick(16); finite()
    if (mode === 'absent') expect(usePreviewStore.getState().slowMoArtifact).toBeNull()
  })
  it('uses the resolved capped count and publishes the artifact', () => {
    useMapStore.setState({ activePixelCount: 1000 })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    expect(config().pixelCount).toBe(16)
    expect(usePreviewStore.getState().slowMoArtifact?.arrayWords).toBe(120)
    tick(16); finite()
  })
  it('keeps execution and elapsed time through live tunables, and projects current initializers', () => {
    render(<Preview showDeck={false} pixelCountCap={16} />)
    tick(64)
    const running = loop()
    const handle = config().handle
    const setter = vi.spyOn(handle, 'setRuntimeVar')
    const elapsed = config().clock.getTime()
    let current = settings
    const changes: Partial<SlowMoSettings>[] = [
      { rate: 1 / 16 }, { stepMs: 32 }, { inBetween: 'blend' }, { inBetween: 'eased' },
      ...(['sweep', 'radial', 'scatter'] as const).map(shape => ({ stagger: { shape, width: 0.5 } })),
      ...[0, 0.5, 0.9].map(width => ({ stagger: { shape: 'scatter' as const, width } })),
    ]
    for (const change of changes) {
      current = { ...current, ...change }
      const before = config().clock.getTime()
      setter.mockClear()
      act(() => usePreviewStore.getState().setSlowMo(current))
      expect(loop()).toBe(running)
      expect(config().handle).toBe(handle)
      expect(config().clock.getTime()).toBe(before)
      expect(config().clock.getTime()).toBeGreaterThanOrEqual(elapsed)
      for (const [name, value] of Object.entries(slowMoTunables(current))) expect(setter).toHaveBeenCalledWith(name, config().shim.encodeScalar(value))
      expect(usePreviewStore.getState().slowMoArtifact?.code).toBe(bundleWithPasses(source, {}, [{ kind: 'slowmo', settings: current, pixelCount: 16 }]).code)
      tick(16); finite()
    }
    const copied = bundleWithPasses(usePreviewStore.getState().slowMoArtifact!.code, {}, [])
    const shim = (fidelity === 'fast' ? createShim : createFxShim)({
      pixelCount: 16, mapPoints: config().mapPoints, dimensions: 1, getVirtualTime: () => 0,
    })
    const reopened = loadPattern(fidelity === 'fast' ? copied.code : copied.fxCode, copied.metadata, shim.builtins)
    reopened.beforeRender(shim.encodeScalar(0))
    reopened.render(shim.encodeScalar(0))
    expect(shim.capturedPixel()).toEqual([1, 0, 0])
  })
  it.each(['blend', 'clock'] as const)('runs %s persistence, preserves live clocks and reopens current Copy pixels', inBetween => {
    const fixture = 'export var patternMs = 0, patternClock = 0; export function beforeRender(d) { patternMs += d; patternClock = time(1) } export function render(i) { rgb(1,0,0) }'
    useEditorStore.setState({ previewSource: fixture })
    let current: SlowMoSettings = { ...settings, inBetween, persistence: { attackMs: 5000, decayMs: 2000 } }
    usePreviewStore.setState({ slowMo: current, speed: 2 })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    act(() => usePreviewStore.getState().setSpeed(2))
    const expected = bundleWithPasses(fixture, {}, [{ kind: 'slowmo', settings: current, pixelCount: 16 }])
    expect(last(vi.mocked(loadPattern).mock.calls)[0]).toBe(fidelity === 'fast' ? expected.code : expected.fxCode)
    expect(usePreviewStore.getState().slowMoArtifact?.code).toBe(expected.code)
    expect(usePreviewStore.getState().slowMoArtifact?.arrayWords).toBe(inBetween === 'blend' ? 180 : 60)
    expect(config().getSpeed()).toBe(inBetween === 'clock' ? 0.5 : 2)
    const tolerance = fidelity === 'fast' ? 2 ** -10 : 2 ** -8
    expect(pixels()[0]).toEqual([0, 0, 0])
    tick(16); finite()
    // Clock scales delta by Speed × rate; the wrapper divides by rate for display-time persistence.
    expect(Math.abs(pixels()[0][0] - (1 - Math.exp(-32 / 5000)))).toBeLessThanOrEqual(tolerance)
    expect(pixels()[0][0]).toBeGreaterThan(0)
    tick(64)
    const running = loop()
    const handle = config().handle
    const clock = config().clock
    const setter = vi.spyOn(handle, 'setRuntimeVar')
    const before = clock.getTime()
    const authoredBefore = handle.getExports()
    expect(before).toBeGreaterThan(0)
    expect(authoredBefore.patternMs).toBeGreaterThan(0)
    expect(authoredBefore.patternClock).toBeGreaterThan(0)
    for (const persistence of [
      { attackMs: 0, decayMs: 2000 }, { attackMs: 5000, decayMs: 2000 },
      { attackMs: 5000, decayMs: 0 }, { attackMs: 5000, decayMs: 10000 },
      { attackMs: 1500, decayMs: 2000 },
    ]) {
      current = { ...current, persistence }
      setter.mockClear()
      act(() => usePreviewStore.getState().setSlowMo(current))
      expect(loop()).toBe(running)
      expect(config().handle).toBe(handle)
      expect(config().clock).toBe(clock)
      expect(clock.getTime()).toBe(before)
      expect(handle.getExports()).toEqual(authoredBefore)
      for (const [name, value] of Object.entries(slowMoTunables(current))) {
        expect(setter).toHaveBeenCalledWith(name, config().shim.encodeScalar(value))
      }
      const expectedCurrent = bundleWithPasses(fixture, {}, [{ kind: 'slowmo', settings: current, pixelCount: 16 }])
      const copy = usePreviewStore.getState().slowMoArtifact!.code
      expect(copy).toBe(expectedCurrent.code)
      const copied = bundle(copy, {})
      const prepare = (artifact: typeof copied) => {
        let time = 0
        const shim = (fidelity === 'fast' ? createShim : createFxShim)({
          pixelCount: 16, mapPoints: config().mapPoints, dimensions: 1, getVirtualTime: () => time,
        })
        const reopened = loadPattern(fidelity === 'fast' ? artifact.code : artifact.fxCode, artifact.metadata, shim.builtins)
        return (delta: number) => {
          const scaled = delta * config().getSpeed()
          time += scaled
          reopened.beforeRender(shim.encodeScalar(scaled))
          return Array.from({ length: 16 }, (_, i) => {
            reopened.render(shim.encodeScalar(i))
            return [...shim.capturedPixel()]
          })
        }
      }
      const reopened = prepare(copied)
      const independent = prepare(expectedCurrent)
      for (const delta of [0, 16, 64]) {
        const actualPixels = reopened(delta)
        const expectedPixels = independent(delta)
        actualPixels.forEach((pixel, i) => pixel.forEach((value, c) => {
          expect(Number.isFinite(value)).toBe(true)
          expect(Math.abs(value - expectedPixels[i][c])).toBeLessThanOrEqual(tolerance)
        }))
        if (delta === 16 && persistence.attackMs > 0) {
          expect(actualPixels[0][0]).toBeGreaterThan(0)
          expect(Math.abs(actualPixels[0][0] - (1 - Math.exp(-32 / persistence.attackMs)))).toBeLessThanOrEqual(tolerance)
        }
      }
    }
    tick(16); finite()
    expect(clock.getTime()).toBeGreaterThan(before)
  })

  it('ignores stale Clock persistence completely when the flag is absent', () => {
    history.replaceState(null, '', location.pathname)
    usePreviewStore.setState({ slowMo: { ...settings, inBetween: 'clock', persistence: { attackMs: 1500, decayMs: 2000 } }, speed: 2 })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    act(() => usePreviewStore.getState().setSpeed(2))
    const baseline = bundle(source, {})
    expect(last(vi.mocked(loadPattern).mock.calls)[0]).toBe(fidelity === 'fast' ? baseline.code : baseline.fxCode)
    expect(usePreviewStore.getState().slowMoArtifact).toBeNull()
    expect(config().getSpeed()).toBe(2)
    tick(16); finite()
    expect(pixels()[0]).toEqual([1, 0, 0])
  })

  it('re-primes every persistence structure transition after positive elapsed time', () => {
    render(<Preview showDeck={false} pixelCountCap={16} />)
    for (const [inBetween, persistence] of [
      ['blend', { attackMs: 1500, decayMs: 2000 }], ['blend', null],
      ['clock', null], ['clock', { attackMs: 1500, decayMs: 2000 }],
      ['clock', null], ['clock', { attackMs: 1500, decayMs: 2000 }],
      ['blend', { attackMs: 1500, decayMs: 2000 }], ['clock', { attackMs: 1500, decayMs: 2000 }],
    ] as const) {
      tick(64)
      expect(config().clock.getTime()).toBeGreaterThan(0)
      const previous = loop()
      const handle = config().handle
      act(() => usePreviewStore.getState().setSlowMo({ ...settings, inBetween, persistence }))
      expect(loop()).not.toBe(previous)
      expect(config().handle).not.toBe(handle)
      expect(config().clock.getTime()).toBe(0)
      finite()
    }
  })

  it.each([['blend', 1134], ['clock', 3410]] as const)('declines %s persistence over budget without changing baseline bytes or execution', (inBetween, count) => {
    useMapStore.setState({ activePixelCount: count })
    usePreviewStore.setState({ slowMo: { ...settings, inBetween, persistence: { attackMs: 1500, decayMs: 2000 } } })
    render(<Preview />)
    act(() => useMapStore.setState({ activePixelCount: count }))
    const base = bundle(source, {})
    expect(last(vi.mocked(loadPattern).mock.calls)[0]).toBe(fidelity === 'fast' ? base.code : base.fxCode)
    expect(usePreviewStore.getState().slowMoArtifact?.code).toBe(base.code)
    const declined = usePreviewStore.getState().slowMoArtifact?.declined
    expect(declined?.reason).toBe('array-budget')
    expect(screen.getByText(declined!.message)).toBeInTheDocument()
    const before = config().clock.getTime()
    tick(16); finite()
    expect(config().clock.getTime()).toBe(before + 16 * config().getSpeed())
    expect(pixels()[0]).toEqual([1, 0, 0])
  })
  it('paints the RGB hold, linear, and smoothstep equations without reloading', () => {
    useEditorStore.setState({ previewSource: 'var frame = -1; export function beforeRender(delta) { frame += 1 } export function render(i) { rgb(frame % 2 == 0, 0, frame % 2 != 0) }' })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    const running = loop()
    tick(64) // A=red, B=blue, fraction=0
    tick(16) // fraction=1/4
    expect(pixels()[0]).toEqual([1, 0, 0])
    act(() => usePreviewStore.getState().setSlowMo({ ...settings, inBetween: 'blend' }))
    expect(pixels()[0]).toEqual([0.75, 0, 0.25])
    act(() => usePreviewStore.getState().setSlowMo({ ...settings, inBetween: 'eased' }))
    expect(pixels()[0]).toEqual([0.84375, 0, 0.15625])
    expect(loop()).toBe(running)
  })
  it('paints live stagger windows at the current fraction without reloading', () => {
    useEditorStore.setState({ previewSource: 'var frame = -1; export function beforeRender(delta) { frame += 1 } export function render(i) { rgb(frame % 2 == 0, 0, frame % 2 != 0) }' })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    tick(64)
    tick(32)
    const running = loop()
    const handle = config().handle
    const clock = config().clock.getTime()
    const tolerance = fidelity === 'fast' ? 2 ** -10 : 2 ** -8
    const pixel = (index: number, expected: number[]) => {
      pixels()[index].forEach((value, channel) => expect(Math.abs(value - expected[channel])).toBeLessThanOrEqual(tolerance))
    }
    const change = (shape: SlowMoSettings['stagger']['shape'], width: number) => {
      act(() => usePreviewStore.getState().setSlowMo({ ...settings, inBetween: 'blend', stagger: { shape, width } }))
      expect(loop()).toBe(running)
      expect(config().handle).toBe(handle)
      expect(config().clock.getTime()).toBe(clock)
    }
    change('sweep', 0.5)
    pixel(0, [0, 0, 1]); pixel(15, [0.9375, 0, 0.0625])
    change('radial', 0.5)
    pixel(0, [1, 0, 0]); pixel(8, [0, 0, 1])
    change('scatter', 0.5)
    pixel(0, [0, 0, 1]); pixel(1, [0.6180267333984375, 0, 0.3819732666015625])
    change('scatter', 0)
    for (let i = 0; i < 16; i++) pixel(i, [0.5, 0, 0.5])
  })
  it('clears Copy when parsing or execution fails and on unmount', () => {
    const view = render(<Preview showDeck={false} pixelCountCap={16} />)
    expect(usePreviewStore.getState().slowMoArtifact).not.toBeNull()
    const lastWorking = usePreviewStore.getState().slowMoArtifact
    const running = loop()
    act(() => useEditorStore.setState({ source: 'export function render( {', compileStatus: 'broken' }))
    expect(usePreviewStore.getState().slowMoArtifact).toBe(lastWorking)
    expect(loop()).toBe(running)
    act(() => useEditorStore.setState({ previewSource: 'export function render( {' }))
    expect(usePreviewStore.getState().slowMoArtifact).toBeNull()
    act(() => useEditorStore.setState({ previewSource: source }))
    expect(usePreviewStore.getState().slowMoArtifact).not.toBeNull()
    act(() => config().onError!(new Error('execution failed')))
    expect(usePreviewStore.getState().slowMoArtifact).toBeNull()
    act(() => useEditorStore.setState({ previewSource: source + '\n' }))
    view.unmount()
    expect(usePreviewStore.getState().slowMoArtifact).toBeNull()
  })
  it('re-primes structural changes, identical-byte Pattern switches, and source edits', () => {
    const view = render(<Preview showDeck={false} pixelCountCap={16} />)
    let previous = loop()
    for (const inBetween of ['clock', 'blend'] as const) {
      act(() => usePreviewStore.getState().setSlowMo({ ...settings, inBetween }))
      expect(loop()).not.toBe(previous); previous = loop()
    }
    act(() => usePatternStore.setState({ activePatternId: 'another-personal-pattern' }))
    expect(loop()).not.toBe(previous)
    act(() => useEditorStore.setState({ previewSource: 'export function render(index) { rgb(0, 0, 1) }' }))
    tick(0)
    expect(pixels()[0]).toEqual([0, 0, 1])
    act(() => useEditorStore.setState({ previewSource: '' }))
    expect(usePreviewStore.getState().slowMoArtifact).toBeNull()
    view.unmount()
    expect(usePreviewStore.getState().slowMoArtifact).toBeNull()
  })
  it.each([
    ['palette-output', 'var p = [0,1,0,0,1,0,0,1]; setPalette(p); export function render(i) { paint(0.2) }', 16],
    ['no-renderer', 'export var value = 1', 16],
    ['shadowed-builtin', 'var time = 1; export function render(i) { rgb(1,0,0) }', 16],
    ['reserved-prefix', 'var __pxlblz_slowmo_authored = 1; export function render(i) { rgb(1,0,0) }', 16],
    ['array-budget', source, 1703],
  ] as const)('shows %s while executing the complete unwrapped artifact', (reason, fixture, count) => {
    useEditorStore.setState({ previewSource: fixture })
    useMapStore.setState({ activePixelCount: count })
    render(<Preview />)
    act(() => useMapStore.setState({ activePixelCount: count }))
    const base = bundleWithPasses(fixture, {}, [])
    expect(last(vi.mocked(loadPattern).mock.calls)[0]).toBe(fidelity === 'fast' ? base.code : base.fxCode)
    const declined = usePreviewStore.getState().slowMoArtifact?.declined
    expect(declined?.reason).toBe(reason)
    expect(screen.getByText(declined!.message)).toBeInTheDocument()
    const elapsed = config().clock.getTime()
    tick(16); finite()
    expect(config().clock.getTime()).toBe(elapsed + 16)
    if (reason === 'no-renderer') expect(pixels()[0]).toEqual([0, 0, 0])
    if (reason === 'shadowed-builtin' || reason === 'reserved-prefix' || reason === 'array-budget') expect(pixels()[0]).toEqual([1, 0, 0])
  })
})
