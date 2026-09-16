import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import native from '../../e2e/fixtures/showV2PreparedStage.json'
import { parseProvisionalShowRecordV2 } from '@/engine/showCompositionV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { ShowV2RoutePilot } from './ShowV2RoutePilot'

vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: () => <div data-testid="prepared-stage-mock" /> }))
beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useLibraryStore.setState(libraryInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
})
let fixtureIndex = 0
function open() {
  const opened = parseProvisionalShowRecordV2(JSON.stringify(native))
  if (opened.status !== 'opened') throw new Error('Fixture refused')
  const record = opened.record
  record.id = `prepared-marker-completion-${++fixtureIndex}`
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  usePatternStore.setState({ userPatterns: [{ id: 'prepared-stage-pattern', name: 'Stage Voice', src: 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}', controls: {}, updatedAt: 1 }] })
  useMapStore.setState({ userMaps: [{ id: 'prepared-stage-map', name: 'Stage Grid', dim: 2, generator: 'custom', params: {}, points: [[0, 0], [1, 1]], updatedAt: 1 }] })
  let release!: () => void
  let reject!: (error: Error) => void
  const pending = new Promise<void>((resolve, fail) => { release = resolve; reject = fail })
  const write = vi.fn(() => pending)
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'marker-completion', replaceShowV2: write })
  return { record, write, pending, release, reject }
}
it('keeps normal saved status and newly added Marker selection after its own adopted capture replaces the preimage', async () => {
  const { record, write, pending, release } = open()
  render(<ShowV2RoutePilot showId={record.id} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Marker' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(useShowStore.getState().showV2Pilots[record.id]).not.toBe(record)
  await act(async () => { release(); await pending })
  expect(await screen.findByText('Marker saved.')).toBeInTheDocument()
  expect(screen.getByLabelText('Marker', { exact: true })).toHaveValue('marker:1')
  expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
})


it('suppresses obsolete saved status and selection after an external replacement while its own save awaits', async () => {
  const { record, write, pending, release } = open()
  render(<ShowV2RoutePilot showId={record.id} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Marker' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  const adopted = useShowStore.getState().showV2Pilots[record.id]
  const added = adopted.composition.markers.find(marker => marker.id === 'marker:1')!
  const external = { ...adopted, name: 'External', composition: { ...adopted.composition, markers: [{ id: 'external', name: 'External guide', timeMs: 0 }, added] } }
  act(() => { useShowStore.setState({ showV2Pilots: { [record.id]: external }, showRevisions: { [record.id]: 2 } }) })
  expect(screen.getByLabelText('Marker', { exact: true })).toHaveValue('external')
  await act(async () => { release(); await pending })
  expect(screen.queryByText('Marker saved.')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Marker', { exact: true })).toHaveValue('external')
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(external)
})

it('keeps current own-rollback save failure feedback and restores the original Marker draft', async () => {
  const { record, write, pending, reject } = open()
  render(<ShowV2RoutePilot showId={record.id} />)
  const name = screen.getByLabelText('Marker name')
  fireEvent.change(name, { target: { value: 'Unsaved' } })
  fireEvent.keyDown(name, { key: 'Enter' })
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  const rejected = useShowStore.getState().showV2Pilots[record.id]
  await act(async () => { reject(new Error('offline')); await pending.catch(() => {}) })
  expect(await screen.findByText('Save failed: offline')).toBeInTheDocument()
  expect(screen.getByLabelText('Marker name')).toHaveValue('Opening')
  expect(useShowStore.getState().showV2SaveFailure?.record).toBe(rejected)
  expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record)
})

it.each(['Pattern', 'Map/dimension', 'Library', 'profile', 'provider', 'navigation', 'unmount', 'revision'] as const)('retires Marker completion after %s replacement', async partition => {
  const { record, write, pending, release } = open()
  const view = render(<ShowV2RoutePilot showId={record.id} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Marker' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  act(() => {
    switch (partition) {
      case 'Pattern': usePatternStore.setState({ userPatterns: [] }); break
      case 'Map/dimension': useMapStore.setState({ userMaps: [{ id: 'prepared-stage-map', name: 'Depth', dim: 3, generator: 'custom', params: {}, points: [[0, 0, 0], [1, 1, 1]], updatedAt: 2 }] }); break
      case 'Library': useLibraryStore.setState({ userLibraries: [] }); break
      case 'profile': useControllerProfileStore.setState({ profiles: [] }); break
      case 'provider': setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'external' }); break
      case 'navigation': {
        const next = { ...record, id: 'other', name: 'Other' }
        useShowStore.setState({ showV2Pilots: { ...useShowStore.getState().showV2Pilots, [next.id]: next } })
        view.rerender(<ShowV2RoutePilot showId={next.id} />)
        break
      }
      case 'unmount': view.unmount(); break
      case 'revision': useShowStore.setState({ showRevisions: { [record.id]: 2 } }); break
    }
  })
  await act(async () => { release(); await pending })
  expect(screen.queryByText('Marker saved.')).not.toBeInTheDocument()
})
