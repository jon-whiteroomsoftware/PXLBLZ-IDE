import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import * as admission from '@/store/showV2PreparedEditAdmission'
import { ShowV2RoutePilot } from './ShowV2RoutePilot'
vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: () => <div data-testid="prepared-stage" /> }))
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState); usePatternStore.setState(patternInitialState); useMapStore.setState(mapInitialState); useLibraryStore.setState(libraryInitialState); useControllerProfileStore.setState(controllerProfileInitialState) })
afterEach(() => { resetPersonalContentProvider(); vi.restoreAllMocks() })
let index = 0
function setup() {
  const c = convertShowRecordV1ToV2(convertibleV1Show()); if (c.status !== 'converted') throw Error('fixture')
  const record = c.record; record.id = `appearance-completion-${++index}`; record.composition.transitions = []
  record.composition.clips = record.composition.clips.slice(0, 1)
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  usePatternStore.setState({ userPatterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'provider-A', replaceShowV2: write })
  const view = render(<ShowV2RoutePilot showId={record.id} />)
  fireEvent.click(screen.getByRole('button', { name: / · .* · 0–1000 ms/ }))
  fireEvent.change(screen.getByLabelText('Appearance scope'), { target: { value: 'whole-clip' } })
  fireEvent.change(screen.getByLabelText('Clip opacity'), { target: { value: '.5' } })
  return { record, write, view }
}
it('retained parent appearance callback refuses provider A→B before invocation; fresh capture saves once', async () => {
  const { record, write, view } = setup(), secondWrite = vi.fn(async () => {})
  const owner = vi.spyOn(admission, 'admitShowV2PilotAppearanceEdit')
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'provider-B', replaceShowV2: secondWrite })
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' }))
  await waitFor(() => expect(owner).toHaveBeenCalledTimes(1))
  expect(await owner.mock.results[0].value).toMatchObject({ status: 'refused', code: 'stale-edit' })
  expect(write).not.toHaveBeenCalled(); expect(secondWrite).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record); expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  view.rerender(<ShowV2RoutePilot showId={record.id} />)
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' }))
  expect(await screen.findByText('Appearance saved.')).toBeInTheDocument(); expect(secondWrite).toHaveBeenCalledTimes(1)
})
it('keeps one pending save and restores authored fields/history after owned failure', async () => {
  const { record, write } = setup(); let reject!: (error: Error) => void
  const pending = new Promise<void>((_resolve, fail) => { reject = fail }); write.mockImplementation(() => pending)
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1)); expect(screen.getByRole('button', { name: 'Apply appearance' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' })); expect(write).toHaveBeenCalledTimes(1)
  await act(async () => { reject(Error('offline')); await pending.catch(() => {}) })
  expect(await screen.findByText('Save failed: offline')).toBeInTheDocument()
  expect(screen.getByLabelText('Clip opacity')).toHaveValue(String(record.composition.clips[0].appearance.keys[0].value.opacity))
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
it.each(['Pattern', 'Map', 'Library', 'profile', 'provider', 'route', 'unmount'] as const)('obsolete save completion after %s cannot publish saved feedback', async partition => {
  const { record, write, view } = setup(); let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve }); write.mockImplementation(() => pending)
  fireEvent.click(screen.getByRole('button', { name: 'Apply appearance' })); await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  act(() => {
    if (partition === 'Pattern') usePatternStore.setState({ userPatterns: [...usePatternStore.getState().userPatterns] })
    if (partition === 'Map') useMapStore.setState({ userMaps: [] })
    if (partition === 'Library') useLibraryStore.setState({ userLibraries: [] })
    if (partition === 'profile') useControllerProfileStore.setState({ profiles: [] })
    if (partition === 'provider') setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'provider-B' })
    if (partition === 'route') { useShowStore.setState({ showV2Pilots: { ...useShowStore.getState().showV2Pilots, other: { ...record, id: 'other' } } }); view.rerender(<ShowV2RoutePilot showId="other" />) }
    if (partition === 'unmount') view.unmount()
  })
  await act(async () => { release(); await pending })
  expect(screen.queryByText('Appearance saved.')).not.toBeInTheDocument()
})
