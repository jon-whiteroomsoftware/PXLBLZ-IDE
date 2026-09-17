import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import * as admission from '@/store/showV2PreparedEditAdmission'
import { ShowEditorV2Route } from './ShowEditorV2Route'
vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: () => <div data-testid="prepared-stage" /> }))
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState); usePatternStore.setState(patternInitialState); useMapStore.setState(mapInitialState); useLibraryStore.setState(libraryInitialState); useControllerProfileStore.setState(controllerProfileInitialState) })
afterEach(() => { resetPersonalContentProvider(); vi.restoreAllMocks() })
let index = 0
function setup() {
  const c = convertShowRecordV1ToV2(convertibleV1Show()); if (c.status !== 'converted') throw Error('fixture')
  const record = c.record; record.id = `layer-completion-${++index}`; record.composition.transitions = []; record.composition.clips = record.composition.clips.slice(0, 1)
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  usePatternStore.setState({ userPatterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'provider-A', replaceShowV2: write })
  const view = render(<ShowEditorV2Route showId={record.id} />)
  return { record, write, view }
}
function addDraft(zoneId: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add Layer' }))
  fireEvent.change(screen.getByLabelText('New Layer Zone'), { target: { value: zoneId } })
  fireEvent.change(screen.getByLabelText('New Layer name'), { target: { value: 'Accent' } })
}
it.each(['Layer', 'Marker'] as const)('retained parent %s callback refuses providerA→B even with identical record/assets; fresh capture works', async editor => {
  const { record, write, view } = setup(); const secondWrite = vi.fn(async () => {})
  const layerOwner = vi.spyOn(admission, 'admitShowV2PilotLayerEdit'), markerOwner = vi.spyOn(admission, 'admitShowV2PilotMarkerEdit')
  if (editor === 'Layer') addDraft(record.zones[0].id)
  const submit = screen.getByRole('button', { name: editor === 'Layer' ? 'Add Layer at top' : 'Add Marker' })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'provider-B', replaceShowV2: secondWrite })
  fireEvent.click(submit)
  const owner = editor === 'Layer' ? layerOwner : markerOwner
  await waitFor(() => expect(owner).toHaveBeenCalledTimes(1))
  expect(await owner.mock.results[0].value).toMatchObject({ status: 'refused', code: 'stale-edit' })
  expect(write).not.toHaveBeenCalled(); expect(secondWrite).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record); expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  view.rerender(<ShowEditorV2Route showId={record.id} />)
  fireEvent.click(screen.getByRole('button', { name: editor === 'Layer' ? 'Add Layer at top' : 'Add Marker' }))
  await waitFor(() => expect(secondWrite).toHaveBeenCalledTimes(1))
  expect(await screen.findByText(`${editor} saved.`)).toBeInTheDocument()
  expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
})
function selectLayer(record: ReturnType<typeof setup>['record']) {
  const layer = record.composition.layers[0]
  fireEvent.change(screen.getByLabelText('Layer Zone'), { target: { value: layer.zoneId } }); fireEvent.change(screen.getByLabelText('Selected Layer'), { target: { value: layer.id } })
  return layer
}
it('keeps operation pending through own recapture and restores selected current name on owned save rollback', async () => {
  const { record, write } = setup(); let reject!: (error: Error) => void
  const pending = new Promise<void>((_resolve, fail) => { reject = fail }); write.mockImplementation(() => pending)
  const layer = selectLayer(record)
  fireEvent.change(screen.getByLabelText('Layer name'), { target: { value: 'Changed' } }); fireEvent.click(screen.getByRole('button', { name: 'Rename Layer' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1)); expect(screen.getByRole('button', { name: 'Rename Layer' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Rename Layer' })); expect(write).toHaveBeenCalledTimes(1)
  await act(async () => { reject(Error('offline')); await pending.catch(() => {}) })
  expect(await screen.findByText('Save failed: offline')).toBeInTheDocument(); expect(screen.getByLabelText('Layer name')).toHaveValue(layer.name)
  expect(screen.getByLabelText('Selected Layer')).toHaveValue(layer.id); expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  expect(useShowStore.getState().showV2Pilots[record.id].composition).toEqual(record.composition)
})
it.each(['record', 'revision', 'Pattern', 'Map', 'Library', 'profile', 'provider', 'route', 'unmount'] as const)('suppresses obsolete Layer save feedback after%s replacement', async partition => {
  const { record, write, view } = setup(); let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve }); write.mockImplementation(() => pending)
  addDraft('zone'); fireEvent.click(screen.getByRole('button', { name: 'Add Layer at top' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  act(() => {
    switch (partition) {
      case 'record': useShowStore.setState({ showV2Pilots: { [record.id]: { ...useShowStore.getState().showV2Pilots[record.id], name: 'External' } } }); break
      case 'revision': useShowStore.setState({ showRevisions: { [record.id]: 2 } }); break
      case 'Pattern': usePatternStore.setState({ userPatterns: [...usePatternStore.getState().userPatterns] }); break
      case 'Map': useMapStore.setState({ userMaps: [] }); break
      case 'Library': useLibraryStore.setState({ userLibraries: [] }); break
      case 'profile': useControllerProfileStore.setState({ profiles: [] }); break
      case 'provider': setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'external' }); break
      case 'route': view.rerender(<ShowEditorV2Route showId="external" />); break
      case 'unmount': view.unmount(); break
    }
  })
  await act(async () => { release(); await pending })
  expect(screen.queryByText('Layer saved.')).not.toBeInTheDocument()
  if (partition !== 'route' && partition !== 'unmount') expect(screen.getByLabelText('Selected Layer')).toHaveValue('')
})
