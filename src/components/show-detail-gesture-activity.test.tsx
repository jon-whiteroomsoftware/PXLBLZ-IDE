import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ShowClipPlacementPad } from './ShowClipPlacementPad'
import { NEUTRAL_SHOW_CLIP_TRANSFORM } from '@/engine/showClipTransform'
import { DEFAULT_SHOW_CLIP_VIEWPORT } from '@/engine/showClipViewport'
import { createFieldActivityScope, FieldActivityContext } from './ui/field-activity'

it.each(['pointerUp', 'pointerCancel'] as const)('owns placement before movement and through %s authoring', ending => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const onChange = vi.fn(() => { expect(active).toBe(1) })
  const previewEnd = vi.fn(() => { expect(active).toBe(1) })
  render(<FieldActivityContext.Provider value={scope}><ShowClipPlacementPad
    transform={NEUTRAL_SHOW_CLIP_TRANSFORM} viewport={DEFAULT_SHOW_CLIP_VIEWPORT}
    onChange={onChange} onPreview={vi.fn()} onPreviewEnd={previewEnd}
  /></FieldActivityContext.Provider>)
  const target = screen.getByLabelText('Move content')
  const pad = screen.getByRole('application')
  vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 384, height: 384 } as DOMRect)
  fireEvent.pointerDown(target, { pointerId: 7, clientX: 192, clientY: 192 })
  expect(active).toBe(1)
  fireEvent.pointerMove(target, { pointerId: 8, clientX: 240, clientY: 220 })
  fireEvent[ending](target, { pointerId: 8 })
  expect(active).toBe(1)
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.pointerMove(target, { pointerId: 7, clientX: 240, clientY: 220 })
  fireEvent[ending](target, { pointerId: 7 })
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(previewEnd).toHaveBeenCalledTimes(1)
  expect(active).toBe(0)
})

import { ShowPropertySparkline } from './ShowPropertySparkline'
import { projectShowPropertyLane } from '@/engine/showPropertyLaneProjection'

it.each(['pointerUp', 'pointerCancel', 'lostPointerCapture'] as const)('owns Property Beat movement until %s without batching authored moves', ending => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const move = vi.fn(() => { expect(active).toBe(1) })
  const projection = projectShowPropertyLane({ durationMs: 1000, constraint: { min: 0, max: 1 }, defaultValue: 1, segments: [],
    beats: [{ id: 'beat', timeMs: 0, value: 0.2, kind: 'authored' }] })
  render(<FieldActivityContext.Provider value={scope}><ShowPropertySparkline ariaLabel="Property" projection={projection}
    onSelectBeat={vi.fn()} onMoveBeat={move} /></FieldActivityContext.Provider>)
  const beat = screen.getByRole('button')
  beat.setPointerCapture = vi.fn()
  beat.hasPointerCapture = vi.fn(() => true)
  beat.releasePointerCapture = vi.fn()
  fireEvent.pointerDown(beat, { pointerId: 7, button: 0 })
  expect(active).toBe(1)
  fireEvent.pointerMove(beat, { pointerId: 8, clientY: 10 })
  fireEvent[ending](beat, { pointerId: 8 })
  expect(active).toBe(1)
  expect(move).not.toHaveBeenCalled()
  fireEvent.pointerMove(beat, { pointerId: 7, clientY: 10 })
  fireEvent.pointerMove(beat, { pointerId: 7, clientY: 20 })
  expect(move).toHaveBeenCalledTimes(2)
  fireEvent[ending](beat, { pointerId: 7 })
  expect(active).toBe(0)
  fireEvent.pointerMove(beat, { pointerId: 7, clientY: 30 })
  expect(move).toHaveBeenCalledTimes(2)
})

import { ShowEffectStack } from './ShowEffectsAuthoring'
import type { ShowClipEffect } from '@/engine/personalContentRecords'

const effects: ShowClipEffect[] = [
  { id: 'move', kind: 'translate', x: 0.2, y: 0 },
  { id: 'turn', kind: 'rotate', turns: 0.1 },
  { id: 'hue', kind: 'hue', turns: 0.1 },
]
const transfer = () => {
  const data = new Map<string, string>()
  return { effectAllowed: 'move', dropEffect: 'move',
    setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) ?? '' }
}
it.each(['commit', 'same', 'foreign-stage', 'dragend'] as const)('owns native Effect reorder through %s', ending => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const change = vi.fn(() => { expect(active).toBe(1) })
  render(<FieldActivityContext.Provider value={scope}><ShowEffectStack effects={effects} onChange={change} onAdd={vi.fn()} /></FieldActivityContext.Provider>)
  const source = screen.getByRole('button', { name: 'Drag Translate Effect to reorder' })
  const dataTransfer = transfer()
  fireEvent.dragStart(source, { dataTransfer })
  expect(active).toBe(1)
  if (ending === 'dragend') fireEvent.dragEnd(source, { dataTransfer })
  else fireEvent.drop(screen.getByTestId(`show-effect-${ending === 'commit' ? 'turn' : ending === 'same' ? 'move' : 'hue'}`), { dataTransfer })
  expect(active).toBe(0)
  expect(change).toHaveBeenCalledTimes(ending === 'commit' ? 1 : 0)
  fireEvent.dragEnd(source, { dataTransfer })
  expect(active).toBe(0)
})

it.each(['removed', 'disabled'] as const)('retires a Property Beat gesture when its target is %s', mode => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const move = vi.fn()
  const projection = projectShowPropertyLane({ durationMs: 1000, constraint: { min: 0, max: 1 }, defaultValue: 1, segments: [],
    beats: [{ id: 'beat', timeMs: 0, value: 0.2, kind: 'authored' }] })
  const view = (enabled: boolean) => <FieldActivityContext.Provider value={scope}><ShowPropertySparkline ariaLabel="Property"
    projection={enabled || mode === 'disabled' ? projection : { ...projection, beats: [] }} onSelectBeat={vi.fn()}
    onMoveBeat={enabled ? move : undefined} /></FieldActivityContext.Provider>
  const mounted = render(view(true))
  const beat = screen.getByRole('button')
  beat.hasPointerCapture = () => true
  fireEvent.pointerDown(beat, { pointerId: 7, button: 0 })
  expect(active).toBe(1)
  mounted.rerender(view(false))
  expect(active).toBe(0)
  mounted.rerender(view(true))
  fireEvent.pointerMove(screen.getByRole('button'), { pointerId: 7, clientY: 20 })
  expect(move).not.toHaveBeenCalled()
})

it('retires a removed Effect source while its stack survives', () => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const change = vi.fn()
  const view = (items: ShowClipEffect[]) => <FieldActivityContext.Provider value={scope}><ShowEffectStack effects={items} onChange={change} onAdd={vi.fn()} /></FieldActivityContext.Provider>
  const mounted = render(view(effects))
  const dataTransfer = transfer()
  fireEvent.dragStart(screen.getByRole('button', { name: 'Drag Translate Effect to reorder' }), { dataTransfer })
  expect(active).toBe(1)
  mounted.rerender(view(effects.slice(1)))
  expect(active).toBe(0)
  fireEvent.drop(screen.getByTestId('show-effect-turn'), { dataTransfer })
  expect(change).not.toHaveBeenCalled()
})

import { act } from '@testing-library/react'
it.each([['placement', false], ['effect', false], ['placement', true], ['effect', true]] as const)('holds %s through asynchronous authored settlement (reject=%s) and ignores duplicate terminal events', async (family, reject) => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  let settle!: () => void
  const saving = new Promise<void>((resolve, fail) => { settle = reject ? () => fail(new Error('Synthetic save rejection')) : resolve })
  const change = vi.fn(() => saving)
  const preview = vi.fn()
  render(<FieldActivityContext.Provider value={scope}>{family === 'placement'
    ? <ShowClipPlacementPad transform={NEUTRAL_SHOW_CLIP_TRANSFORM} viewport={DEFAULT_SHOW_CLIP_VIEWPORT} focus="aperture" onPreview={preview} onChange={change} />
    : <ShowEffectStack effects={effects} onChange={change} onAdd={vi.fn()} />}</FieldActivityContext.Provider>)
  if (family === 'placement') {
    const target = screen.getByLabelText('Move aperture')
    vi.spyOn(screen.getByRole('application'), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 384, height: 384 } as DOMRect)
    fireEvent.pointerDown(target, { pointerId: 7, clientX: 192, clientY: 192 })
    fireEvent.pointerMove(target, { pointerId: 7, clientX: 240, clientY: 220 })
    const previewCount = preview.mock.calls.length
    fireEvent.pointerUp(target, { pointerId: 7 })
    fireEvent.lostPointerCapture(target, { pointerId: 7 })
    fireEvent.pointerUp(target, { pointerId: 7 })
    fireEvent.pointerDown(screen.getByRole('application'), { pointerId: 8, clientX: 20, clientY: 20 })
    expect(preview).toHaveBeenCalledTimes(previewCount)
  } else {
    const dataTransfer = transfer()
    const source = screen.getByRole('button', { name: 'Drag Translate Effect to reorder' })
    fireEvent.dragStart(source, { dataTransfer })
    fireEvent.drop(screen.getByTestId('show-effect-turn'), { dataTransfer })
    fireEvent.dragEnd(source, { dataTransfer })
  }
  expect(change).toHaveBeenCalledTimes(1)
  expect(active).toBe(1)
  await act(async () => { settle(); await saving.catch(() => {}) })
  expect(active).toBe(0)
})

import { afterEach } from 'vitest'
import { createDefaultShow } from '@/engine/showModel'
import { showInitialState, useShowStore } from '@/store/showStore'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
const state = () => useShowStore.getState()
const snapshot = () => structuredClone({ shows: state().shows, histories: state().showHistories, failure: state().showSaveFailure })
let sessionToRetire: string | undefined
afterEach(() => { if (sessionToRetire) state().retireShowEditSession(sessionToRetire); sessionToRetire = undefined; resetPersonalContentProvider() })

it.each(['before-move', 'preview-cancel', 'manual-up', 'manual-cancel'] as const)('settles placement candidate from complete records/history/provider writes: %s', async mode => {
  useShowStore.setState(showInitialState)
  const show = createDefaultShow(`placement-${mode}`, 'Original')
  const writes = vi.fn(async () => {})
  setPersonalContentProvider({ listShows: async () => [show], updateShow: writes } as unknown as PersonalContentProvider)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  sessionToRetire = session
  const scope = createFieldActivityScope()
  scope.bind(() => {
    const token = state().acquireShowEditActivity(session, show.id, 'drag')!
    return () => { state().releaseShowEditActivity(token) }
  })
  const request = state().beginShowEdit(session, { operationId: 'rename', payloadKey: 'rename', referenceContext: '', targets: [] }).request
  const before = snapshot()
  const mounted = render(<FieldActivityContext.Provider value={scope}><ShowClipPlacementPad
    transform={NEUTRAL_SHOW_CLIP_TRANSFORM} viewport={DEFAULT_SHOW_CLIP_VIEWPORT}
    onPreview={vi.fn()} onChange={patch => state().updateShow(show.id, { ...show, cells: show.cells.map((cell, index) => index ? cell : { ...cell, ...patch }) })}
  /></FieldActivityContext.Provider>)
  const target = screen.getByLabelText('Move content')
  vi.spyOn(screen.getByRole('application'), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 384, height: 384 } as DOMRect)
  fireEvent.pointerDown(target, { pointerId: 7, clientX: 192, clientY: 192 })
  if (mode !== 'before-move') fireEvent.pointerMove(target, { pointerId: 7, clientX: 250, clientY: 250 })
  act(() => { expect(state().deliverShowEditCandidate(request, { ...show, name: 'Agent' }, () => true).status).toBe('waiting') })
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
  if (mode === 'preview-cancel') fireEvent.lostPointerCapture(target, { pointerId: 7 })
  else fireEvent[mode === 'manual-cancel' ? 'pointerCancel' : 'pointerUp'](target, { pointerId: 7 })
  await act(async () => {})
  const manual = mode.startsWith('manual')
  expect(state().readShowEditCandidate(session, 'rename')).toMatchObject(manual ? { status: 'refused', reason: 'revision-conflict' } : { status: 'applied' })
  expect(writes).toHaveBeenCalledTimes(1)
  expect(state().showHistories[show.id]).toEqual({ past: [show], future: [] })
  const current = state().shows[0]
  if (manual) {
    expect(current.cells[0].transform).not.toEqual(show.cells[0].transform)
    expect(current).toEqual({ ...show, cells: [{ ...show.cells[0], transform: current.cells[0].transform }, ...show.cells.slice(1)], updatedAt: current.updatedAt })
  } else expect(current).toEqual({ ...show, name: 'Agent', updatedAt: current.updatedAt })
  const { id, ...persisted } = current
  expect(writes).toHaveBeenCalledWith(id, { ...persisted, composition: current.composition ?? null })
  const done = snapshot()
  fireEvent.pointerUp(target, { pointerId: 7 })
  expect(snapshot()).toEqual(done)
  mounted.unmount()
})

it('ignores a retired local Effect payload after source reappearance and preserves external fallback', () => {
  const change = vi.fn()
  const mounted = render(<ShowEffectStack effects={effects} onChange={change} onAdd={vi.fn()} />)
  const dataTransfer = transfer()
  fireEvent.dragStart(screen.getByRole('button', { name: 'Drag Translate Effect to reorder' }), { dataTransfer })
  mounted.rerender(<ShowEffectStack effects={effects.slice(1)} onChange={change} onAdd={vi.fn()} />)
  mounted.rerender(<ShowEffectStack effects={effects} onChange={change} onAdd={vi.fn()} />)
  fireEvent.drop(screen.getByTestId('show-effect-turn'), { dataTransfer })
  expect(change).not.toHaveBeenCalled()
  const external = transfer()
  external.setData('application/x-pxlblz-effect', 'move')
  fireEvent.drop(screen.getByTestId('show-effect-turn'), { dataTransfer: external })
  expect(change).toHaveBeenCalledTimes(1)
})

it.each(['lost', 'unmount', 'readonly'] as const)('discards placement preview on %s without authoring or late revival', mode => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const change = vi.fn()
  const end = vi.fn()
  const view = (readOnly = false) => <FieldActivityContext.Provider value={scope}><ShowClipPlacementPad
    transform={NEUTRAL_SHOW_CLIP_TRANSFORM} viewport={DEFAULT_SHOW_CLIP_VIEWPORT} readOnly={readOnly}
    onChange={change} onPreviewEnd={end} /></FieldActivityContext.Provider>
  const mounted = render(view())
  const target = screen.getByLabelText('Move content')
  vi.spyOn(screen.getByRole('application'), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 384, height: 384 } as DOMRect)
  fireEvent.pointerDown(target, { pointerId: 7, clientX: 192, clientY: 192 })
  fireEvent.pointerMove(target, { pointerId: 7, clientX: 250, clientY: 250 })
  if (mode === 'unmount') mounted.unmount()
  else if (mode === 'readonly') mounted.rerender(view(true))
  else fireEvent.lostPointerCapture(target, { pointerId: 7 })
  expect(active).toBe(0)
  expect(end).toHaveBeenCalledTimes(1)
  expect(change).not.toHaveBeenCalled()
  fireEvent.pointerUp(target, { pointerId: 7 })
  expect(change).not.toHaveBeenCalled()
})

it('binds surviving overlapping controls on session activation/replacement and releases each owner independently', () => {
  const scope = createFieldActivityScope()
  const mounted = render(<FieldActivityContext.Provider value={scope}>
    <ShowClipPlacementPad transform={NEUTRAL_SHOW_CLIP_TRANSFORM} viewport={DEFAULT_SHOW_CLIP_VIEWPORT} onChange={vi.fn()} />
    <ShowEffectStack effects={effects} onChange={vi.fn()} onAdd={vi.fn()} />
  </FieldActivityContext.Provider>)
  fireEvent.pointerDown(screen.getByLabelText('Move content'), { pointerId: 7 })
  const source = screen.getByRole('button', { name: 'Drag Translate Effect to reorder' })
  fireEvent.dragStart(source, { dataTransfer: transfer() })
  let active = 0
  const acquire = () => { active++; return () => { active-- } }
  const oldUnbind = scope.bind(acquire)
  expect(active).toBe(2)
  scope.bind(() => acquire())
  expect(active).toBe(2)
  oldUnbind()
  expect(active).toBe(2)
  fireEvent.pointerUp(screen.getByLabelText('Move content'), { pointerId: 7 })
  expect(active).toBe(1)
  mounted.unmount()
  expect(active).toBe(0)
  fireEvent.dragEnd(source)
  expect(active).toBe(0)
})

it.each(['placement', 'property', 'effect'] as const)('keeps actual retained state when a %s callback throws', family => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const failure = new Error('Synthetic authored callback failure')
  const change = vi.fn(() => { expect(active).toBe(1); throw failure })
  const errors: unknown[] = []
  const handleError = (event: ErrorEvent) => { errors.push(event.error); event.preventDefault() }
  window.addEventListener('error', handleError)
  const projection = projectShowPropertyLane({ durationMs: 1000, constraint: { min: 0, max: 1 }, defaultValue: 1, segments: [],
    beats: [{ id: 'beat', timeMs: 0, value: 0.2, kind: 'authored' }] })
  const previewEnd = vi.fn()
  try {
    render(<FieldActivityContext.Provider value={scope}>{family === 'placement'
      ? <ShowClipPlacementPad transform={NEUTRAL_SHOW_CLIP_TRANSFORM} viewport={DEFAULT_SHOW_CLIP_VIEWPORT} onChange={change} onPreviewEnd={previewEnd} />
      : family === 'effect' ? <ShowEffectStack effects={effects} onChange={change} onAdd={vi.fn()} />
      : <ShowPropertySparkline ariaLabel="Property" projection={projection} onSelectBeat={vi.fn()} onMoveBeat={change} />}</FieldActivityContext.Provider>)
    if (family === 'effect') {
      const dataTransfer = transfer()
      fireEvent.dragStart(screen.getByRole('button', { name: 'Drag Translate Effect to reorder' }), { dataTransfer })
      fireEvent.drop(screen.getByTestId('show-effect-turn'), { dataTransfer })
      expect(active).toBe(0)
    } else {
      const target = family === 'placement' ? screen.getByLabelText('Move content') : screen.getByRole('button')
      target.hasPointerCapture = () => true
      if (family === 'placement') vi.spyOn(screen.getByRole('application'), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 384, height: 384 } as DOMRect)
      fireEvent.pointerDown(target, { pointerId: 7, button: 0, clientX: 192, clientY: 192 })
      fireEvent.pointerMove(target, { pointerId: 7, clientX: 250, clientY: 250 })
      if (family === 'property') expect(active).toBe(1)
      fireEvent.pointerUp(target, { pointerId: 7 })
      expect(active).toBe(0)
      if (family === 'placement') expect(previewEnd).toHaveBeenCalledTimes(1)
    }
    expect(change).toHaveBeenCalledTimes(1)
    expect(errors).toEqual([failure])
  } finally { window.removeEventListener('error', handleError) }
})
