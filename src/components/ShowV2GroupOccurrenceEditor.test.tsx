import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useMemo, useState } from 'react'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { admitShowV2PilotGroupOccurrenceEdit } from '@/store/showV2PreparedEditAdmission'
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { showV2GroupOccurrenceEditorFixture } from '@/test/showV2GroupOccurrenceEditorFixture'
import { ShowV2GroupOccurrenceEditor, type ShowV2GroupOccurrenceSubmission } from './ShowV2GroupOccurrenceEditor'

it('selects the persisted occurrence, displays held timing, and sends complete explicit placement only', async () => {
  const { record, dependencies } = showV2GroupOccurrenceEditorFixture(true), occurrence = record.composition.groupOccurrences[0]
  const submit = vi.fn(async (_request: ShowV2GroupOccurrenceSubmission) => ({ status: 'unchanged' as const }))
  const status = vi.fn()
  render(<ShowV2GroupOccurrenceEditor capture={captureShowStageEditV2(record, dependencies)} submitGroupOccurrenceEdit={submit} isCurrentCapture={() => true} isCurrentCompletion={() => true} onStatus={status} />)
  fireEvent.change(screen.getByLabelText('Group occurrence'), { target: { value: occurrence.id } })
  expect(screen.getByText(/^2000–8000 ms/)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Group start (ms)'), { target: { value: '9000' } }); fireEvent.keyDown(screen.getByLabelText('Group start (ms)'), { key: 'Enter' })
  fireEvent.change(screen.getByLabelText('Group translation X'), { target: { value: '0.2' } }); fireEvent.keyDown(screen.getByLabelText('Group translation X'), { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: 'Move Group' }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  expect(submit.mock.calls[0][0].intent).toMatchObject({ kind: 'move-occurrence', occurrenceId: occurrence.id, startMs: 9000, translationX: 0.2, translationY: 0, zoneId: occurrence.zoneId, layerBindings: occurrence.layerBindings, layoutOccurrenceId: record.composition.layoutOccurrences[0].id })
  expect(status).toHaveBeenCalledWith('Group is unchanged.')
})

it.each([
  ['Duplicate Group', 'duplicate-occurrence'], ['Make Group Unique', 'make-unique'], ['Ungroup', 'ungroup-occurrence'], ['Delete Group', 'delete-occurrence'],
] as const)('sends only the explicit selected occurrence action %s', async (label, kind) => {
  const { record, dependencies } = showV2GroupOccurrenceEditorFixture(true), occurrence = record.composition.groupOccurrences[0]
  const submit = vi.fn(async (_request: ShowV2GroupOccurrenceSubmission) => ({ status: 'unchanged' as const }))
  render(<ShowV2GroupOccurrenceEditor capture={captureShowStageEditV2(record, dependencies)} submitGroupOccurrenceEdit={submit} isCurrentCapture={() => true} isCurrentCompletion={() => true} onStatus={() => {}} />)
  fireEvent.change(screen.getByLabelText('Group occurrence'), { target: { value: occurrence.id } })
  if (kind === 'duplicate-occurrence') { fireEvent.change(screen.getByLabelText('Group start (ms)'), { target: { value: '18000' } }); fireEvent.keyDown(screen.getByLabelText('Group start (ms)'), { key: 'Enter' }) }
  fireEvent.click(screen.getByRole('button', { name: label }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  expect(submit.mock.calls[0][0].intent).toMatchObject({ kind, occurrenceId: occurrence.id })
  expect(screen.getByLabelText('Group occurrence')).toHaveValue(occurrence.id)
})
it('keeps explicit placement through save failure and permits a guarded retry', async () => {
  const { record, dependencies } = showV2GroupOccurrenceEditorFixture(), occurrence = record.composition.groupOccurrences[0]
  const submit = vi.fn(async (_request: ShowV2GroupOccurrenceSubmission) => ({ status: 'unchanged' as const })).mockRejectedValueOnce(Error('offline'))
  const status = vi.fn()
  render(<ShowV2GroupOccurrenceEditor capture={captureShowStageEditV2(record, dependencies)} submitGroupOccurrenceEdit={submit} isCurrentCapture={() => true} isCurrentCompletion={() => true} onStatus={status} />)
  fireEvent.change(screen.getByLabelText('Group occurrence'), { target: { value: occurrence.id } })
  fireEvent.change(screen.getByLabelText('Group start (ms)'), { target: { value: '9000' } }); fireEvent.keyDown(screen.getByLabelText('Group start (ms)'), { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: 'Move Group' }))
  await waitFor(() => expect(status).toHaveBeenCalledWith('Save failed: offline'))
  expect(screen.getByLabelText('Group start (ms)')).toHaveValue('9000')
  fireEvent.click(screen.getByRole('button', { name: 'Move Group' }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
  expect(submit.mock.calls[1][0].intent).toMatchObject({ startMs: 9000 })
})
it('guards pending actions and suppresses obsolete completion feedback', async () => {
  const { record, dependencies } = showV2GroupOccurrenceEditorFixture(), occurrence = record.composition.groupOccurrences[0]
  let resolve!: (value: { status: 'unchanged' }) => void
  const submit = vi.fn((_request: ShowV2GroupOccurrenceSubmission) => new Promise<{ status: 'unchanged' }>(done => { resolve = done }))
  const status = vi.fn(); let current = true
  render(<ShowV2GroupOccurrenceEditor capture={captureShowStageEditV2(record, dependencies)} submitGroupOccurrenceEdit={submit} isCurrentCapture={() => current} isCurrentCompletion={() => false} onStatus={status} />)
  fireEvent.change(screen.getByLabelText('Group occurrence'), { target: { value: occurrence.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Delete Group' })); fireEvent.click(screen.getByRole('button', { name: 'Delete Group' }))
  expect(submit).toHaveBeenCalledTimes(1)
  current = false; resolve({ status: 'unchanged' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Group' })).toBeEnabled())
  expect(status).not.toHaveBeenCalled()
})

let actualFixtureId = 0
function actualHarness(onlyGroup = false) {
  const { record, dependencies } = showV2GroupOccurrenceEditorFixture(!onlyGroup, onlyGroup)
  record.id = `group-occurrence-component-${++actualFixtureId}`
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'group-occurrence-component', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  function Harness() {
    const current = useShowStore(state => state.showV2Pilots[record.id]), [status, setStatus] = useState('')
    const capture = useMemo(() => captureShowStageEditV2(current, dependencies), [current])
    return <><ShowV2GroupOccurrenceEditor capture={capture} submitGroupOccurrenceEdit={request => admitShowV2PilotGroupOccurrenceEdit({ showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0, capture, ...request })}
      isCurrentCapture={() => useShowStore.getState().showV2Pilots[record.id] === current}
      isCurrentCompletion={(receipt, phase) => phase === 'saved' ? useShowStore.getState().showV2Pilots[record.id] === receipt.record : useShowStore.getState().showV2SaveFailure?.record === receipt.record} onStatus={setStatus} /><output>{status}</output></>
  }
  render(<Harness />); return { record, write }
}
it('real parent callback/admission preserves own capture replacement selection and linked shared authority', async () => {
  const { record, write } = actualHarness(), occurrence = record.composition.groupOccurrences[0]
  fireEvent.change(screen.getByLabelText('Group occurrence'), { target: { value: occurrence.id } })
  fireEvent.change(screen.getByLabelText('Group start (ms)'), { target: { value: '18000' } }); fireEvent.keyDown(screen.getByLabelText('Group start (ms)'), { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate Group' }))
  expect(await screen.findByText('Group saved.')).toBeInTheDocument()
  const duplicate = useShowStore.getState().showV2Pilots[record.id].composition.groupOccurrences[2]
  expect(screen.getByLabelText('Group occurrence')).toHaveValue(duplicate.id)
  fireEvent.click(screen.getByRole('button', { name: 'Make Group Unique' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  expect(screen.getByLabelText('Group occurrence')).toHaveValue(duplicate.id)
  const current = useShowStore.getState().showV2Pilots[record.id]
  expect(current.composition.patternInstances).toEqual(record.composition.patternInstances)
  expect(current.composition.propertyTracks).toEqual(record.composition.propertyTracks)
  expect(current.composition.groupOccurrences[0]).toEqual(occurrence)
  expect(Object.values(current.composition.groupOccurrences[2].instanceBindings!)).toEqual(['instance'])
})
it('real current failed save rolls back cloned record/history while preserving placement draft for retry', async () => {
  const { record, write } = actualHarness(), occurrence = record.composition.groupOccurrences[0]
  write.mockRejectedValueOnce(Error('offline'))
  fireEvent.change(screen.getByLabelText('Group occurrence'), { target: { value: occurrence.id } })
  fireEvent.change(screen.getByLabelText('Group start (ms)'), { target: { value: '18000' } }); fireEvent.keyDown(screen.getByLabelText('Group start (ms)'), { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: 'Move Group' }))
  expect(await screen.findByText('Save failed: offline')).toBeInTheDocument()
  expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  expect(screen.getByLabelText('Group start (ms)')).toHaveValue('18000')
  fireEvent.click(screen.getByRole('button', { name: 'Move Group' }))
  expect(await screen.findByText('Group saved.')).toBeInTheDocument(); expect(write).toHaveBeenCalledTimes(2)
  expect(useShowStore.getState().showV2Pilots[record.id].composition.groupOccurrences[0].startMs).toBe(18000)
})
it('real final-content Delete clears selected shell and retains saveable validated empty content', async () => {
  const { record, write } = actualHarness(true), occurrence = record.composition.groupOccurrences[0]
  fireEvent.change(screen.getByLabelText('Group occurrence'), { target: { value: occurrence.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Delete Group' }))
  expect(await screen.findByText('Group saved.')).toBeInTheDocument(); expect(write).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Group occurrence')).toHaveValue('')
  expect(useShowStore.getState().showV2Pilots[record.id].composition.groupOccurrences).toEqual([])
})
