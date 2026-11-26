import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { Preview } from './Preview'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useShowTransportStore } from '@/store/showTransportStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useControlStore, controlInitialState } from '@/store/controlStore'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { bundleWithPasses } from '@/engine/passEngine'
import { slowMoSettingsFromAmounts, slowMoTunables } from '@/engine/slowMo'
import { createRenderLoop, type RenderLoopConfig } from '@/engine/renderLoop'
import { loadPattern } from '@/engine/loadPattern'
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
function last<T>(values: T[]): T { return values[values.length - 1] }
const config = (): RenderLoopConfig => last(vi.mocked(createRenderLoop).mock.calls)[0]
const loop = () => last(vi.mocked(createRenderLoop).mock.results).value as ReturnType<typeof createRenderLoop>
function tick(delta: number) { act(() => loop().tickFrame(delta)) }
function pixels() { return last(paint.mock.calls)[0] as number[][] }
function finite() { expect(pixels().flat().every(Number.isFinite)).toBe(true) }

function seedActivePattern(settings?: { slowMo?: number; dreamy?: number; pixelCount?: number }) {
  usePatternStore.setState({
    ...patternInitialState,
    activePatternId: 'p1',
    userPatterns: [{ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1, settings }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  usePreviewStore.setState({ ...previewInitialState, isRunning: false })
  useMapStore.setState(mapInitialState)
  useEditorStore.setState({ ...editorInitialState, previewSource: source })
  seedActivePattern({ slowMo: 0.5 })
  useControlStore.setState(controlInitialState)
  usePanelPreferencesStore.setState({ expanded: { 'pattern:preview': true, 'pattern:pixelblaze': true } })
})
afterEach(() => cleanup())

describe.each(['fast', 'fidelity'] as const)('slow-mo execution %s', fidelity => {
  beforeEach(() => usePreviewStore.setState({ fidelity }))

  it('loads byte-identical complete stock baseline artifacts at default values', () => {
    for (const [name, stockSource] of Object.entries(DEMOS)) {
      vi.clearAllMocks()
      usePreviewStore.setState({ ...previewInitialState, fidelity, isRunning: false })
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
      expect(usePreviewStore.getState().slowMoDeclined, name).toBeNull()
      view.unmount()
    }
  })

  it('wraps with the capped count when active and returns to byte-identical unwrapped when reset to defaults', () => {
    seedActivePattern({ slowMo: 0.5, pixelCount: 1000 })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    expect(config().pixelCount).toBe(16)
    const expected = bundleWithPasses(source, {}, [{ kind: 'slowmo', settings: slowMoSettingsFromAmounts(0.5, 0), pixelCount: 16 }])
    expect(last(vi.mocked(loadPattern).mock.calls)[0]).toBe(fidelity === 'fast' ? expected.code : expected.fxCode)
    tick(16); finite()

    act(() => usePreviewStore.getState().setSlowMo(0))
    const base = bundle(source, {})
    expect(last(vi.mocked(loadPattern).mock.calls)[0]).toBe(fidelity === 'fast' ? base.code : base.fxCode)
  })

  it('reports the time the Pattern experienced through live speed, bypass and catch-up', () => {
    useEditorStore.setState({ previewSource: 'export var patternMs=0; export function beforeRender(d){patternMs+=d} export function render(i){rgb(1,0,0)}' })
    seedActivePattern({ slowMo: 0.5, dreamy: 1 })
    render(<Preview showDeck={false} pixelCountCap={3} />)
    const running = loop(), handle = config().handle
    let previous = 0
    for (const [amount, delta] of [[0.5, 64], [1, 256], [0, 64], [0.05, 64], [0.07, 64], [0.5, 4096], [0.5, 0]]) {
      act(() => {
        usePreviewStore.getState().setSlowMo(amount)
        usePreviewStore.getState().setDreamy(1)
      })
      tick(delta)
      const experienced = config().shim.decodeScalar(handle.getExports().patternMs as number)
      expect(usePreviewStore.getState().elapsed).toBeCloseTo(experienced, 6)
      if (amount === 0.5 && delta === 64) expect(experienced).toBe(16)
      if (delta === 4096) expect(experienced - previous).toBe(64)
      expect(loop()).toBe(running)
      previous = experienced
    }
    act(() => useEditorStore.setState({ previewSource: 'export function render(i){rgb(0,1,0)}' }))
    expect(usePreviewStore.getState().elapsed).toBe(0)
  })

  it('reports ordinary Pattern time at default values', () => {
    seedActivePattern()
    render(<Preview showDeck={false} pixelCountCap={3} />)
    tick(64)
    expect(usePreviewStore.getState().elapsed).toBe(64)
    tick(0)
    expect(usePreviewStore.getState().elapsed).toBe(64)
  })

  it('keeps execution and elapsed time while either slider remains active', () => {
    const fixture = 'export var patternMs=0; export function beforeRender(d){patternMs+=d} export function render(i){rgb(patternMs/4096,0,0)}'
    useEditorStore.setState({ previewSource: fixture })
    seedActivePattern({ slowMo: 0.5, dreamy: 0.5 })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    tick(64)
    const running = loop(), handle = config().handle
    const setter = vi.spyOn(handle, 'setRuntimeVar')
    for (const [slowMo, dreamy] of [
      [1, 0], [0, 1], [0.5, 0.5], [0.25, 0], [0.25, 1],
    ] as const) {
      const before = config().clock.getTime()
      const patternMs = config().shim.decodeScalar(handle.getExports().patternMs as number)
      setter.mockClear()
      act(() => {
        usePreviewStore.getState().setSlowMo(slowMo)
        usePreviewStore.getState().setDreamy(dreamy)
      })
      expect(loop()).toBe(running)
      expect(config().handle).toBe(handle)
      expect(config().clock.getTime()).toBe(before)
      expect(config().shim.decodeScalar(handle.getExports().patternMs as number)).toBe(patternMs)
      for (const [name, value] of Object.entries(slowMoTunables(slowMoSettingsFromAmounts(slowMo, dreamy)))) {
        expect(setter).toHaveBeenCalledWith(name, config().shim.encodeScalar(value))
      }
      tick(16); finite()
      expect(config().shim.decodeScalar(handle.getExports().patternMs as number)).toBeGreaterThanOrEqual(patternMs)
    }
  })

  it('changes the actual decay response live while preserving bypass and clock', () => {
    seedActivePattern({ slowMo: 0, dreamy: 0.001 })
    useEditorStore.setState({ previewSource: 'export var red=1; export function render(i){rgb(red,0,0)}' })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    const running = loop(), handle = config().handle
    tick(16)
    expect(pixels()[0]).toEqual([1, 0, 0])
    act(() => usePreviewStore.getState().setDreamy(1))
    act(() => { handle.setRuntimeVar('red', config().shim.encodeScalar(0)) })
    tick(16)
    expect(pixels()[0][0]).toBeGreaterThan(0.99)
    act(() => usePreviewStore.getState().setDreamy(0.001))
    tick(16)
    expect(pixels()[0]).toEqual([0, 0, 0])
    expect(loop()).toBe(running)
    expect(config().handle).toBe(handle)
  })

  it('uses unscaled frame delta independently of the Show playback rate', () => {
    useShowTransportStore.getState().setPlaybackRate(3)
    render(<Preview showDeck={false} pixelCountCap={16} />)
    expect(config().getSpeed()).toBe(1)
    act(() => {
      usePreviewStore.getState().setSlowMo(1)
      usePreviewStore.getState().setDreamy(1)
    })
    expect(config().getSpeed()).toBe(1)
    useShowTransportStore.getState().setPlaybackRate(1)
  })

  it('clears the decline when parsing or execution fails, on reset to default, and on unmount', () => {
    const declinedSource = 'var time=1; export function render(i){rgb(1,0,0)}'
    useEditorStore.setState({ previewSource: declinedSource })
    const view = render(<Preview showDeck={false} pixelCountCap={16} />)
    expect(usePreviewStore.getState().slowMoDeclined).not.toBeNull()
    const lastWorking = usePreviewStore.getState().slowMoDeclined
    const running = loop()
    act(() => useEditorStore.setState({ source: 'export function render( {', compileStatus: 'broken' }))
    expect(usePreviewStore.getState().slowMoDeclined).toBe(lastWorking)
    expect(loop()).toBe(running)
    act(() => useEditorStore.setState({ previewSource: 'export function render( {' }))
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
    act(() => useEditorStore.setState({ previewSource: declinedSource }))
    expect(usePreviewStore.getState().slowMoDeclined).not.toBeNull()
    act(() => config().onError!(new Error('execution failed')))
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
    act(() => useEditorStore.setState({ previewSource: declinedSource + '\n' }))
    expect(usePreviewStore.getState().slowMoDeclined).not.toBeNull()
    act(() => usePreviewStore.getState().setSlowMo(0))
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
    act(() => usePreviewStore.getState().setSlowMo(0.5))
    expect(usePreviewStore.getState().slowMoDeclined).not.toBeNull()
    view.unmount()
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
  })

  it('re-primes identical-byte Pattern switches and source edits', () => {
    const view = render(<Preview showDeck={false} pixelCountCap={16} />)
    const previous = loop()
    act(() => usePatternStore.setState({
      activePatternId: 'another-personal-pattern',
      userPatterns: [
        ...usePatternStore.getState().userPatterns,
        { id: 'another-personal-pattern', name: 'P2', src: '', controls: {}, updatedAt: 2, settings: { slowMo: 0.5 } },
      ],
    }))
    expect(loop()).not.toBe(previous)
    act(() => useEditorStore.setState({ previewSource: 'export function render(index) { rgb(0, 0, 1) }' }))
    tick(0)
    expect(pixels()[0]).toEqual([0, 0, 1])
    act(() => useEditorStore.setState({ previewSource: '' }))
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
    view.unmount()
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
  })

  it('runs wrapped palette capture without a refusal', () => {
    const fixture = 'var p = [0,1,0,0,1,0,0,1]; setPalette(p); export function render(i) { paint(0.2) }'
    useEditorStore.setState({ previewSource: fixture })
    seedActivePattern({ slowMo: 0.5, pixelCount: 16 })
    render(<Preview pixelCountCap={16} />)

    const base = bundleWithPasses(fixture, {}, [])
    const wrapped = bundleWithPasses(fixture, {}, [{ kind: 'slowmo', settings: slowMoSettingsFromAmounts(0.5, 0), pixelCount: 16 }])
    const artifact = last(vi.mocked(loadPattern).mock.calls)[0]
    expect(artifact).not.toBe(fidelity === 'fast' ? base.code : base.fxCode)
    expect(artifact).toBe(fidelity === 'fast' ? wrapped.code : wrapped.fxCode)
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()

    tick(16)
    expect(pixels()).toHaveLength(16)
    for (const [r, g, b] of pixels()) {
      expect(r).toBeCloseTo(0.8, 4)
      expect(g).toBe(0)
      expect(b).toBeCloseTo(0.2, 4)
    }
  })

  it.each([
    ['no-renderer', 'export var value = 1', 16],
    ['shadowed-builtin', 'var time = 1; export function render(i) { rgb(1,0,0) }', 16],
    ['reserved-prefix', 'var __pxlblz_slowmo_authored = 1; export function render(i) { rgb(1,0,0) }', 16],
    ['array-budget', source, 1134],
  ] as const)('shows %s while executing the complete unwrapped artifact when active', (reason, fixture, count) => {
    useEditorStore.setState({ previewSource: fixture })
    seedActivePattern({ slowMo: 0.5, pixelCount: count })
    render(<Preview />)
    const base = bundleWithPasses(fixture, {}, [])
    expect(last(vi.mocked(loadPattern).mock.calls)[0]).toBe(fidelity === 'fast' ? base.code : base.fxCode)
    const declined = usePreviewStore.getState().slowMoDeclined
    expect(declined?.reason).toBe(reason)
    expect(screen.getByText(declined!.message)).toBeInTheDocument()
    const elapsed = config().clock.getTime()
    tick(16); finite()
    expect(config().clock.getTime()).toBe(elapsed + 16)
    expect(usePreviewStore.getState().elapsed).toBe(elapsed + 16)
    if (reason === 'no-renderer') expect(pixels()[0]).toEqual([0, 0, 0])
    if (reason === 'shadowed-builtin' || reason === 'reserved-prefix' || reason === 'array-budget') expect(pixels()[0]).toEqual([1, 0, 0])
  })
})
