import { fireEvent, render, screen } from '@testing-library/react'
import { createShowWithOutputContract } from '@/engine/showModel'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { updateShowPhysicalZoneSelection } from '@/engine/showSpatialSelection'
import { ShowZoneSpatialSelector } from './ShowZoneSpatialSelector'
import { createFieldActivityScope, FieldActivityContext } from './ui/field-activity'

const points = [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }, { x: 0.7, y: 0.7 }, { x: 0.9, y: 0.9 }]
function fixture() {
  return updateShowPhysicalZoneSelection(createShowWithOutputContract('spatial', 'Spatial',
    createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 4 }), 1), 'layout-1', 'zone-1', [0, 1])
}
function setup(onCommit = vi.fn(), onCancel = vi.fn()) {
  const scope = createFieldActivityScope()
  let active = 0
  const bind = () => scope.bind(() => { active++; return () => { active-- } })
  const show = fixture()
  const view = (source = show) => <FieldActivityContext.Provider value={scope}><ShowZoneSpatialSelector show={source}
    zone={source.zones[0]} layoutId="layout-1" mapName="Plane" points={points} onCommit={onCommit} onCancel={onCancel} /></FieldActivityContext.Provider>
  const mounted = render(view())
  const surface = screen.getByRole('img')
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect)
  return { ...mounted, view, show, scope, bind, surface, active: () => active }
}

it('keeps a clean open selector synchronized with the authoritative indexes before Save', () => {
  const commit = vi.fn()
  const test = setup(commit)
  test.bind()
  fireEvent.focus(test.surface)
  expect(test.active()).toBe(0)
  test.rerender(test.view(updateShowPhysicalZoneSelection(test.show, 'layout-1', 'zone-1', [2, 3])))
  expect(screen.getByText('Indexes 2-3')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save physical zone' }))
  expect(commit).toHaveBeenCalledWith([2, 3])
  expect(test.active()).toBe(0)
})

it('owns the live rectangle synchronously and retains the changed indexes after pointerup', () => {
  const test = setup()
  test.bind()
  fireEvent.pointerDown(test.surface, { pointerId: 7, clientX: 60, clientY: 60 })
  expect(test.active()).toBe(1)
  fireEvent.pointerUp(test.surface, { pointerId: 7, clientX: 100, clientY: 100 })
  expect(screen.getByText('Indexes 2-3')).toBeInTheDocument()
  expect(test.active()).toBe(1)
})

it.each(['pointerCancel', 'lostPointerCapture'] as const)('ends only its own rectangle on %s and retains a previous dirty selection', ending => {
  const test = setup()
  test.bind()
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(screen.getByText('Indexes none')).toBeInTheDocument()
  expect(test.active()).toBe(1)
  fireEvent.pointerDown(test.surface, { pointerId: 7, clientX: 60, clientY: 60 })
  fireEvent.pointerDown(test.surface, { pointerId: 8, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(test.surface, { pointerId: 8, clientX: 100, clientY: 100 })
  fireEvent[ending](test.surface, { pointerId: 8 })
  expect(test.surface.querySelector('rect[stroke="#fbbf24"]')).toBeInTheDocument()
  fireEvent[ending](test.surface, { pointerId: 7 })
  expect(test.surface.querySelector('rect[stroke="#fbbf24"]')).not.toBeInTheDocument()
  fireEvent.pointerUp(test.surface, { pointerId: 7, clientX: 100, clientY: 100 })
  expect(screen.getByText('Indexes none')).toBeInTheDocument()
  expect(test.active()).toBe(1)
  fireEvent.keyDown(test.surface, { key: 'Escape' })
  expect(test.active()).toBe(0)
  expect(screen.getByText('Indexes 0-1')).toBeInTheDocument()
})

it('returns to clean only at the current authoritative selection and retains a dirty draft across source updates', () => {
  const test = setup()
  test.bind()
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  test.rerender(test.view(updateShowPhysicalZoneSelection(test.show, 'layout-1', 'zone-1', [2, 3])))
  expect(screen.getByText('Indexes none')).toBeInTheDocument()
  expect(test.active()).toBe(1)
  fireEvent.pointerDown(test.surface, { pointerId: 1, clientX: 0, clientY: 0 })
  fireEvent.pointerUp(test.surface, { pointerId: 1, clientX: 50, clientY: 50 })
  expect(test.active()).toBe(1)
  fireEvent.pointerDown(test.surface, { pointerId: 2, clientX: 60, clientY: 60 })
  fireEvent.pointerUp(test.surface, { pointerId: 2, clientX: 100, clientY: 100 })
  expect(test.active()).toBe(0)
})

it('binds retained activity on activation/replacement and leaves overlapping controls owned', () => {
  const test = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  const unbind = test.bind()
  expect(test.active()).toBe(1)
  const other = test.scope.register(() => true)
  expect(test.active()).toBe(2)
  unbind()
  expect(test.active()).toBe(0)
  test.bind()
  expect(test.active()).toBe(2)
  test.unmount()
  expect(test.active()).toBe(1)
  fireEvent.pointerUp(test.surface, { pointerId: 7, clientX: 100, clientY: 100 })
  expect(test.active()).toBe(1)
  other.dispose()
  expect(test.active()).toBe(0)
})

it('retires the rectangle and draft on source identity replacement without late selection', () => {
  const test = setup()
  test.bind()
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  fireEvent.pointerDown(test.surface, { pointerId: 7, clientX: 60, clientY: 60 })
  test.rerender(test.view({ ...test.show, id: 'replacement' }))
  expect(test.active()).toBe(0)
  fireEvent.pointerUp(test.surface, { pointerId: 7, clientX: 100, clientY: 100 })
  expect(screen.getByText('Indexes 0-1')).toBeInTheDocument()
})

it.each(['rejected', 'throwing'] as const)('retains actual dirty state after a %s Save callback', mode => {
  const intercept = (event: ErrorEvent) => event.preventDefault()
  window.addEventListener('error', intercept)
  try {
    const commit = vi.fn(() => { expect(test.active()).toBe(1); if (mode === 'throwing') throw new Error('save failed') })
    const test = setup(commit)
    test.bind()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save physical zone' }))
    expect(commit).toHaveBeenCalledWith([])
    expect(screen.getByText('Indexes none')).toBeInTheDocument()
    expect(test.active()).toBe(1)
  } finally { window.removeEventListener('error', intercept) }
})

import { act } from '@testing-library/react'
import { afterEach } from 'vitest'
import { showInitialState, useShowStore } from '@/store/showStore'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
const state = () => useShowStore.getState()
const snapshot = () => structuredClone({ shows: state().shows, histories: state().showHistories, failure: state().showSaveFailure })
let sessionToRetire: string | undefined
afterEach(() => { if (sessionToRetire) state().retireShowEditSession(sessionToRetire); sessionToRetire = undefined; resetPersonalContentProvider() })

it.each(['clean', 'cancel', 'save', 'retire'] as const)('settles the spatial draft with complete Show/history/provider preservation: %s', async mode => {
  useShowStore.setState(showInitialState)
  const show = fixture()
  const writes = vi.fn(async () => {})
  setPersonalContentProvider({ listShows: async () => [show], updateShow: writes } as unknown as PersonalContentProvider)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  sessionToRetire = session
  const scope = createFieldActivityScope()
  scope.bind(() => {
    const token = state().acquireShowEditActivity(session, show.id, 'dirty-field')!
    return () => { state().releaseShowEditActivity(token) }
  })
  const request = state().beginShowEdit(session, { operationId: 'physical', payloadKey: 'physical', referenceContext: '', targets: [] }).request
  const before = snapshot()
  function Editor() {
    const current = useShowStore(s => s.shows[0])
    return <FieldActivityContext.Provider value={scope}><ShowZoneSpatialSelector show={current} zone={current.zones[0]}
      layoutId="layout-1" mapName="Plane" points={points} onCancel={() => {}} onCommit={indexes => {
        void state().updateShow(show.id, updateShowPhysicalZoneSelection(current, 'layout-1', 'zone-1', indexes))
      }} /></FieldActivityContext.Provider>
  }
  const mounted = render(<Editor />)
  const surface = screen.getByRole('img')
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect)
  if (mode !== 'clean') {
    fireEvent.pointerDown(surface, { pointerId: 7, clientX: 60, clientY: 60 })
    fireEvent.pointerUp(surface, { pointerId: 7, clientX: 100, clientY: 100 })
  }
  const candidate = updateShowPhysicalZoneSelection({ ...show, name: 'Agent' }, 'layout-1', 'zone-1', [1, 2])
  act(() => { expect(state().deliverShowEditCandidate(request, candidate, () => true).status).toBe(mode === 'clean' ? 'applied' : 'waiting') })
  const applied = state().shows[0]
  if (mode !== 'clean') {
    expect(snapshot()).toEqual(before)
    expect(writes).not.toHaveBeenCalled()
    if (mode === 'retire') { act(() => state().retireShowEditSession(session)); mounted.unmount() }
    else fireEvent.click(screen.getByRole('button', { name: mode === 'save' ? 'Save physical zone' : 'Zone properties' }))
  } else {
    expect(screen.getByText('Indexes 1-2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save physical zone' }))
  }
  await act(async () => {})
  if (mode === 'retire') { expect(snapshot()).toEqual(before); expect(writes).not.toHaveBeenCalled(); return }
  expect(state().readShowEditCandidate(session, 'physical')).toMatchObject(mode === 'save' ? { status: 'refused', reason: 'revision-conflict' } : { status: 'applied' })
  const current = state().shows[0]
  const expected = mode === 'save' ? updateShowPhysicalZoneSelection(show, 'layout-1', 'zone-1', [2, 3]) : candidate
  expect(current).toEqual({ ...expected, updatedAt: current.updatedAt })
  expect(state().showHistories[show.id]).toEqual({ past: mode === 'clean' ? [show, applied] : [show], future: [] })
  expect(writes).toHaveBeenCalledTimes(mode === 'clean' ? 2 : 1)
  const { id, ...persisted } = current
  expect(writes).toHaveBeenCalledWith(id, { ...persisted, composition: current.composition ?? null })
  mounted.unmount()
})


it('retires a live rectangle on unmount and ignores detached late terminal events', () => {
  const commit = vi.fn()
  const test = setup(commit)
  test.bind()
  fireEvent.pointerDown(test.surface, { pointerId: 7, clientX: 60, clientY: 60 })
  expect(test.active()).toBe(1)
  test.unmount()
  expect(test.active()).toBe(0)
  fireEvent.pointerUp(test.surface, { pointerId: 7, clientX: 100, clientY: 100 })
  fireEvent.keyDown(test.surface, { key: 'Enter' })
  expect(commit).not.toHaveBeenCalled()
  expect(test.active()).toBe(0)
})
