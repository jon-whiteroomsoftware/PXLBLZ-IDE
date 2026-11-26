import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { SlowMoLab } from './SlowMoLab'
import { Preview } from './Preview'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useControlStore, controlInitialState } from '@/store/controlStore'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { createRenderLoop, type RenderLoopConfig } from '@/engine/renderLoop'

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
const last = <T,>(values: T[]): T => values[values.length - 1]
const config = (): RenderLoopConfig => last(vi.mocked(createRenderLoop).mock.calls)[0]
const loop = () => last(vi.mocked(createRenderLoop).mock.results).value as ReturnType<typeof createRenderLoop>
beforeEach(() => {
  vi.clearAllMocks()
  usePreviewStore.setState({ ...previewInitialState, isRunning: false })
  useMapStore.setState(mapInitialState)
  useEditorStore.setState({ ...editorInitialState, previewSource: `export var receivedMs=0, speed=0.5
export function sliderSpeed(v){speed=v} export function beforeRender(d){receivedMs+=d}
export function render(i){rgb(receivedMs/4096,speed,0)}` })
  usePatternStore.setState({
    ...patternInitialState,
    activePatternId: 'p1',
    userPatterns: [{ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1, settings: { slowMo: 0.5, dreamy: 0.2 } }],
  })
  useControlStore.setState(controlInitialState)
  usePanelPreferencesStore.setState({ expanded: { 'pattern:preview': true, 'pattern:pixelblaze': true } })
})
afterEach(() => cleanup())

it('T1/T7 exposes a native Slow-mo amount slider with the off / 1/<n>× readout', () => {
  const onSlowMoChange = vi.fn()
  render(<SlowMoLab slowMo={0} dreamy={0} onSlowMoChange={onSlowMoChange} onDreamyChange={vi.fn()} declined={null} expanded onExpandedChange={vi.fn()} />)
  const slowMo = screen.getByRole('slider', { name: 'Slow-mo' })
  expect(slowMo).toHaveAttribute('min', '0')
  expect(slowMo).toHaveAttribute('max', '1')
  expect(slowMo).toHaveAttribute('step', '0.001')
  expect(slowMo).toHaveValue('0')
  expect(slowMo).toHaveAttribute('aria-valuetext', 'off')
  fireEvent.change(slowMo, { target: { value: '0.25' } })
  expect(onSlowMoChange).toHaveBeenLastCalledWith(0.25)
})

it.each(['fast', 'fidelity'] as const)('T2/T7 live Preview %s retains handle, clock and authored controls while active', fidelity => {
  usePreviewStore.setState({ fidelity })
  render(<Preview showDeck={false} pixelCountCap={3} />)
  const handle = config().handle, running = loop()
  act(() => running.tickFrame(64))
  expect(useEditorStore.getState().controls.map(c => c.exportName)).toContain('sliderSpeed')
  expect(useEditorStore.getState().controls.map(c => c.exportName)).not.toContain(slider)
  for (const amount of [0, 1, 0.5, 0.25]) {
    const time = config().clock.getTime()
    act(() => usePreviewStore.getState().setSlowMo(amount))
    expect(loop()).toBe(running)
    expect(config().handle).toBe(handle)
    expect(config().clock.getTime()).toBe(time)
    const before = config().shim.decodeScalar(handle.getExports().receivedMs as number)
    act(() => running.tickFrame(16))
    const after = config().shim.decodeScalar(handle.getExports().receivedMs as number)
    expect(after).toBeGreaterThanOrEqual(before)
    if (amount === 0) expect(after - before).toBe(16)
    expect(usePreviewStore.getState().elapsed).toBe(after)
  }
})
