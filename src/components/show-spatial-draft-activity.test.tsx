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

it('distinguishes source tuples containing colons when replacing a dirty selector', () => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const first = fixture()
  first.id = 'a:b'
  first.routingLayouts[0].id = 'c'
  const second = structuredClone(first)
  second.id = 'a'
  second.routingLayouts[0].id = 'b:c'
  const view = (show: typeof first) => <FieldActivityContext.Provider value={scope}><ShowZoneSpatialSelector
    show={show} zone={show.zones[0]} layoutId={show.routingLayouts[0].id} mapName="Plane" points={points}
    onCommit={vi.fn()} onCancel={vi.fn()} /></FieldActivityContext.Provider>
  const mounted = render(view(first))
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(active).toBe(1)
  mounted.rerender(view(second))
  expect(screen.getByText('Indexes 0-1')).toBeInTheDocument()
  expect(active).toBe(0)
})
