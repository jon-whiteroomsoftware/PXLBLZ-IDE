import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
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
