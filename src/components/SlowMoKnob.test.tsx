import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { SlowMoLab } from './SlowMoLab'
import { Preview } from './Preview'
import { createSlowMoDraft } from '@/engine/slowMoDraft'
import type { SlowMoSettings } from '@/engine/slowMo'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useControlStore, controlInitialState } from '@/store/controlStore'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { createRenderLoop, type RenderLoopConfig } from '@/engine/renderLoop'
import { loadPattern } from '@/engine/loadPattern'
import { bundle } from '@/engine/bundle'
import { createShim, createFxShim } from '@/engine/shim'

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
const slider = 'slider__pxlblz_slowmo_speed'
const settings: SlowMoSettings = { position: 0.5, dreamy: 0 }
const originalUrl = location.href
const last = <T,>(values: T[]): T => values[values.length - 1]
const config = (): RenderLoopConfig => last(vi.mocked(createRenderLoop).mock.calls)[0]
const loop = () => last(vi.mocked(createRenderLoop).mock.results).value as ReturnType<typeof createRenderLoop>
beforeEach(() => {
  vi.clearAllMocks()
  history.replaceState(null, '', `${location.pathname}?slowmo=1`)
  usePreviewStore.setState({ ...previewInitialState, isRunning: false, slowMo: settings })
  useMapStore.setState(mapInitialState)
  useEditorStore.setState({ ...editorInitialState, previewSource: `export var receivedMs=0, speed=0.5
export function sliderSpeed(v){speed=v} export function beforeRender(d){receivedMs+=d}
export function render(i){rgb(receivedMs/4096,speed,0)}` })
  usePatternStore.setState(patternInitialState)
  useControlStore.setState(controlInitialState)
  usePanelPreferencesStore.setState({ expanded: { 'pattern:preview': true, 'pattern:pixelblaze': true } })
})
afterEach(() => { cleanup(); history.replaceState(null, '', originalUrl) })

it('T1/T7 exposes a native position slider with the logarithmic readout', () => {
  const onChange = vi.fn()
  render(<SlowMoLab draft={createSlowMoDraft()} onChange={onChange} declined={null} expanded onExpandedChange={vi.fn()} />)
  const speed = screen.getByRole('slider', { name: 'Slow-mo speed' })
  expect(speed).toHaveAttribute('min', '0')
  expect(speed).toHaveAttribute('max', '1')
  expect(speed).toHaveAttribute('step', '0.001')
  expect(speed).toHaveValue('1')
  fireEvent.change(speed, { target: { value: '0.75' } })
  expect(onChange).toHaveBeenLastCalledWith({ position: 0.75, dreamy: 0 })
})

it.each(['fast', 'fidelity'] as const)('T2/T7 live Preview %s retains handle/clock and reopens current Copy source', fidelity => {
  usePreviewStore.setState({ fidelity })
  render(<Preview showDeck={false} pixelCountCap={3} />)
  const handle = config().handle, running = loop()
  act(() => running.tickFrame(64))
  expect(useEditorStore.getState().controls.map(c => c.exportName)).toContain('sliderSpeed')
  expect(useEditorStore.getState().controls.map(c => c.exportName)).not.toContain(slider)
  for (const position of [1, 0, 0.5, 0.75]) {
    const time = config().clock.getTime()
    act(() => usePreviewStore.getState().setSlowMo({ ...settings, position }))
    expect(loop()).toBe(running)
    expect(config().handle).toBe(handle)
    expect(config().clock.getTime()).toBe(time)
    const before = config().shim.decodeScalar(handle.getExports().receivedMs as number)
    act(() => running.tickFrame(16))
    const after = config().shim.decodeScalar(handle.getExports().receivedMs as number)
    expect(after).toBeGreaterThanOrEqual(before)
    if (position === 1) expect(after - before).toBe(16)
    const copied = bundle(usePreviewStore.getState().slowMoArtifact!.code, {})
    expect(copied.metadata.controls.filter(c => c.exportName === slider)).toHaveLength(1)
    const shim = (fidelity === 'fast' ? createShim : createFxShim)({ pixelCount: 3, mapPoints: config().mapPoints, dimensions: 1, getVirtualTime: () => 0 })
    const reopened = loadPattern(fidelity === 'fast' ? copied.code : copied.fxCode, copied.metadata, shim.builtins)
    for (const delta of [0, 64]) {
      reopened.beforeRender(shim.encodeScalar(delta))
      for (let index = 0; index < 3; index++) reopened.render(shim.encodeScalar(index))
    }
    const expected = position === 1 ? 64 : Math.floor(64 * 2 ** (-4 * (1 - position)) / 16) * 16
    expect(shim.decodeScalar(reopened.getExports().receivedMs as number)).toBe(expected)
  }
})
