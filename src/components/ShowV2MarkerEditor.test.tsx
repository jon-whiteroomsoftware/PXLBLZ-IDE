import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { transitionV1Show } from '@/test/showV2TracerFixture'
import { setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { ShowV2MarkerEditor } from './ShowV2MarkerEditor'

beforeEach(() => {
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useLibraryStore.setState(libraryInitialState)
})
it('adds/selects and commits dormant equal-time Marker fields through one write per changed operation', async () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error('Conversion failed')
  const record = converted.record
  record.composition.markers = [{ id: 'intro', timeMs: 0, name: 'Intro' }]
  const replaceShowV2 = vi.fn(async () => {})
  setPersonalContentProvider({ id: 'marker-editor-test', replaceShowV2 } as unknown as PersonalContentProvider)
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const outcome = vi.fn()
  function Harness() {
    const current = useShowStore(state => state.showV2Pilots[record.id])
    return <ShowV2MarkerEditor record={current} onStatus={outcome} />
  }
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Marker' }))
  await waitFor(() => expect(replaceShowV2).toHaveBeenCalledTimes(1))
  expect(screen.getAllByRole('option')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('Marker time'), { target: { value: '9000' } })
  fireEvent.keyDown(screen.getByLabelText('Marker time'), { key: 'Enter' })
  await waitFor(() => expect(replaceShowV2).toHaveBeenCalledTimes(2))
  fireEvent.change(screen.getByLabelText('Marker time'), { target: { value: '0.5' } })
  fireEvent.keyDown(screen.getByLabelText('Marker time'), { key: 'Enter' })
  await waitFor(() => expect(outcome).toHaveBeenLastCalledWith('Marker time must be nonnegative safe integer milliseconds.'))
  expect(screen.getByLabelText('Marker time')).toHaveValue('9000')
  expect(replaceShowV2).toHaveBeenCalledTimes(2)
  fireEvent.change(screen.getByLabelText('Marker time'), { target: { value: '-1' } })
  fireEvent.keyDown(screen.getByLabelText('Marker time'), { key: 'Enter' })
  await waitFor(() => expect(screen.getByLabelText('Marker time')).toHaveValue('9000'))
  expect(replaceShowV2).toHaveBeenCalledTimes(2)
  fireEvent.change(screen.getByLabelText('Marker name'), { target: { value: 'Outro' } })
  fireEvent.keyDown(screen.getByLabelText('Marker name'), { key: 'Enter' })
  await waitFor(() => expect(replaceShowV2).toHaveBeenCalledTimes(3))
  fireEvent.change(screen.getByLabelText('Marker color'), { target: { value: '#ffaa00' } })
  fireEvent.keyDown(screen.getByLabelText('Marker color'), { key: 'Enter' })
  await waitFor(() => expect(replaceShowV2).toHaveBeenCalledTimes(4))
  const added = useShowStore.getState().showV2Pilots[record.id].composition.markers.find(marker => marker.id !== 'intro')!
  expect(added).toMatchObject({ timeMs: 9000, name: 'Outro', color: '#ffaa00' })
  expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(4)
  fireEvent.change(screen.getByLabelText('Marker color'), { target: { value: '' } })
  fireEvent.keyDown(screen.getByLabelText('Marker color'), { key: 'Enter' })
  await waitFor(() => expect(replaceShowV2).toHaveBeenCalledTimes(5))
  expect(useShowStore.getState().showV2Pilots[record.id].composition.markers.find(marker => marker.id === added.id)).not.toHaveProperty('color')
  fireEvent.change(screen.getByLabelText('Marker name'), { target: { value: '' } })
  fireEvent.keyDown(screen.getByLabelText('Marker name'), { key: 'Enter' })
  await waitFor(() => expect(replaceShowV2).toHaveBeenCalledTimes(6))
  expect(useShowStore.getState().showV2Pilots[record.id].composition.markers.find(marker => marker.id === added.id)).not.toHaveProperty('name')
  fireEvent.change(screen.getByLabelText('Marker'), { target: { value: 'intro' } })
  expect(screen.getByLabelText('Marker name')).toHaveValue('Intro')
  fireEvent.change(screen.getByLabelText('Marker'), { target: { value: added.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Remove Marker' }))
  await waitFor(() => expect(replaceShowV2).toHaveBeenCalledTimes(7))
  expect(useShowStore.getState().showV2Pilots[record.id].composition.markers).toEqual([{ id: 'intro', timeMs: 0, name: 'Intro' }])
})
