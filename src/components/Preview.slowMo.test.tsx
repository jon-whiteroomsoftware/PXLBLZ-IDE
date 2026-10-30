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
import { slowMoTunables, type SlowMoSettings } from '@/engine/slowMo'
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
const settings: SlowMoSettings = { position: 0.5, dreamy: 0 }
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
  it('loads byte-identical complete stock baseline artifacts with the flag absent', () => {
    for (const [name, stockSource] of Object.entries(DEMOS)) {
      vi.clearAllMocks()
      history.replaceState(null, '', location.pathname)
      usePreviewStore.setState({ ...previewInitialState, fidelity, isRunning: false, slowMo: settings })
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

  it('always wraps under the flag, including null state, with the capped count', () => {
    usePreviewStore.setState({ slowMo: null })
    useMapStore.setState({ activePixelCount: 1000 })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    expect(config().pixelCount).toBe(16)
    const expected = bundleWithPasses(source, {}, [{ kind: 'slowmo', settings: { position: 1, dreamy: 0 }, pixelCount: 16 }])
    expect(last(vi.mocked(loadPattern).mock.calls)[0]).toBe(fidelity === 'fast' ? expected.code : expected.fxCode)
    tick(16); finite()
  })
  it('reports the time the Pattern experienced through live speed, bypass and catch-up', () => {
    useEditorStore.setState({ previewSource: 'export var patternMs=0; export function beforeRender(d){patternMs+=d} export function render(i){rgb(1,0,0)}' })
    render(<Preview showDeck={false} pixelCountCap={3} />)
    const running = loop(), handle = config().handle
    let previous = 0
    for (const [position, delta] of [[0.5,64], [0,256], [1,64], [0.95,64], [0.93,64], [0.5,4096], [0.5,0]]) {
      act(() => usePreviewStore.getState().setSlowMo({ position, dreamy: 1 }))
      tick(delta)
      const experienced = config().shim.decodeScalar(handle.getExports().patternMs as number)
      expect(usePreviewStore.getState().elapsed).toBeCloseTo(experienced, 6)
      if (position === 0.5 && delta === 64) expect(experienced).toBe(16)
      if (delta === 4096) expect(experienced - previous).toBe(64)
      expect(loop()).toBe(running)
      previous = experienced
    }
    act(() => useEditorStore.setState({ previewSource: 'export function render(i){rgb(0,1,0)}' }))
    expect(usePreviewStore.getState().elapsed).toBe(0)
  })
  it('reports ordinary Pattern time with the flag off', () => {
    history.replaceState(null, '', location.pathname)
    render(<Preview showDeck={false} pixelCountCap={3} />)
    tick(64)
    expect(usePreviewStore.getState().elapsed).toBe(64)
    tick(0)
    expect(usePreviewStore.getState().elapsed).toBe(64)
  })
  it('keeps execution and elapsed time through both live sliders', () => {
    const fixture = 'export var patternMs=0; export function beforeRender(d){patternMs+=d} export function render(i){rgb(patternMs/4096,0,0)}'
    useEditorStore.setState({ previewSource: fixture })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    tick(64)
    const running = loop(), handle = config().handle
    const setter = vi.spyOn(handle, 'setRuntimeVar')
    for (const current of [
      { position: 0, dreamy: 0 }, { position: 1, dreamy: 0 },
      { position: 1, dreamy: 1 }, { position: 0.5, dreamy: 0.5 },
      { position: 0.75, dreamy: 0 }, { position: 0.75, dreamy: 1 },
    ]) {
      const before = config().clock.getTime()
      const patternMs = config().shim.decodeScalar(handle.getExports().patternMs as number)
      setter.mockClear()
      act(() => usePreviewStore.getState().setSlowMo(current))
      expect(loop()).toBe(running)
      expect(config().handle).toBe(handle)
      expect(config().clock.getTime()).toBe(before)
      expect(config().shim.decodeScalar(handle.getExports().patternMs as number)).toBe(patternMs)
      for (const [name, value] of Object.entries(slowMoTunables(current))) expect(setter).toHaveBeenCalledWith(name, config().shim.encodeScalar(value))
      tick(16); finite()
      expect(config().shim.decodeScalar(handle.getExports().patternMs as number)).toBeGreaterThanOrEqual(patternMs)
    }
  })
  it('changes the actual decay response live while preserving bypass and clock', () => {
    usePreviewStore.setState({ slowMo: { position: 1, dreamy: 0 } })
    useEditorStore.setState({ previewSource: 'export var red=1; export function render(i){rgb(red,0,0)}' })
    render(<Preview showDeck={false} pixelCountCap={16} />)
    const running = loop(), handle = config().handle
    tick(16)
    expect(pixels()[0]).toEqual([1,0,0])
    act(() => usePreviewStore.getState().setSlowMo({ position: 1, dreamy: 1 }))
    act(() => { handle.setRuntimeVar('red', config().shim.encodeScalar(0)) })
    tick(16)
    expect(pixels()[0][0]).toBeGreaterThan(0.99)
    act(() => usePreviewStore.getState().setSlowMo({ position: 1, dreamy: 0 }))
    tick(16)
    expect(pixels()[0]).toEqual([0,0,0])
    expect(loop()).toBe(running)
    expect(config().handle).toBe(handle)
  })
  it('uses unscaled frame delta independently of the Show playback rate', () => {
    useShowTransportStore.getState().setPlaybackRate(3)
    render(<Preview showDeck={false} pixelCountCap={16} />)
    expect(config().getSpeed()).toBe(1)
    act(() => usePreviewStore.getState().setSlowMo({ position: 0, dreamy: 1 }))
    expect(config().getSpeed()).toBe(1)
    useShowTransportStore.getState().setPlaybackRate(1)
  })
  it('clears the decline when parsing or execution fails and on unmount', () => {
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
    view.unmount()
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
  })

  it('re-primes identical-byte Pattern switches and source edits', () => {
    const view = render(<Preview showDeck={false} pixelCountCap={16} />)
    const previous = loop()
    act(() => usePatternStore.setState({ activePatternId: 'another-personal-pattern' }))
    expect(loop()).not.toBe(previous)
    act(() => useEditorStore.setState({ previewSource: 'export function render(index) { rgb(0, 0, 1) }' }))
    tick(0)
    expect(pixels()[0]).toEqual([0, 0, 1])
    act(() => useEditorStore.setState({ previewSource: '' }))
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
    view.unmount()
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
  })
  it.each([
    ['palette-output', 'var p = [0,1,0,0,1,0,0,1]; setPalette(p); export function render(i) { paint(0.2) }', 16],
    ['no-renderer', 'export var value = 1', 16],
    ['shadowed-builtin', 'var time = 1; export function render(i) { rgb(1,0,0) }', 16],
    ['reserved-prefix', 'var __pxlblz_slowmo_authored = 1; export function render(i) { rgb(1,0,0) }', 16],
    ['array-budget', source, 1134],
  ] as const)('shows %s while executing the complete unwrapped artifact', (reason, fixture, count) => {
    useEditorStore.setState({ previewSource: fixture })
    useMapStore.setState({ activePixelCount: count })
    render(<Preview />)
    act(() => useMapStore.setState({ activePixelCount: count }))
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
