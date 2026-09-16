import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { showV2TransitionEditorFixture } from '@/test/showV2TransitionEditorFixture'
import { buildShowV2TransitionEditorModel } from '@/engine/showV2TransitionEditorModel'
import { ShowV2TransitionEditor, type ShowV2TransitionSubmission } from './ShowV2TransitionEditor'

const { record: sample } = showV2TransitionEditorFixture()
const overlayJunction = buildShowV2TransitionEditorModel(sample, 2).junctions.find(junction => junction.scope === 'participant')!
const junctionKey = overlayJunction.key

function setup(
  submit = vi.fn(async (_request: ShowV2TransitionSubmission) => ({ status: 'unchanged' as const })),
  current = () => true,
) {
  const { record, dependencies } = showV2TransitionEditorFixture()
  const status = vi.fn()
  render(<ShowV2TransitionEditor capture={captureShowStageEditV2(record, dependencies)} submitTransitionEdit={submit} isCurrentCapture={current} isCurrentCompletion={() => true} onStatus={status} />)
  return { record, submit, status }
}

it('derives the overlay Cut junction from exact adjacency', () => {
  expect(overlayJunction).toMatchObject({ atMs: 3000, fromClipIds: ['verse-a'], toClipIds: ['verse-b'], zoneId: 'zone' })
})

it('lists exact adjacency junctions and every non-Cut kind', () => {
  setup()
  const junctions = [...screen.getByLabelText<HTMLSelectElement>('Cut junction').options].map(option => option.value)
  expect(junctions).toContain(junctionKey)
  const kinds = [...screen.getByLabelText<HTMLSelectElement>('Transition kind').options].map(option => option.value)
  expect(kinds).not.toContain('transition:blend:cut')
  expect(kinds).toEqual(expect.arrayContaining(['transition:blend:crossfade', 'transition:fade:through-color', 'transition:motion:cover']))
})

it('submits one explicit Insert with a fresh identity and the chosen kind, policy and duration', async () => {
  const { submit } = setup()
  fireEvent.change(screen.getByLabelText('Cut junction'), { target: { value: junctionKey } })
  fireEvent.change(screen.getByLabelText('Transition kind'), { target: { value: 'transition:blend:crossfade' } })
  fireEvent.change(screen.getByLabelText('Crossfade policy'), { target: { value: 'snapshot-live' } })
  fireEvent.change(screen.getByLabelText('New Transition duration'), { target: { value: '1500' } })
  fireEvent.keyDown(screen.getByLabelText('New Transition duration'), { key: 'Enter' })

  fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))

  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  const intent = submit.mock.calls[0][0].intent
  if (intent.kind !== 'insert') throw Error('insert')
  expect(intent.transition).toMatchObject({ kind: 'crossfade', crossfadePolicy: 'snapshot-live', durationMs: 1500, propertyRamps: [] })
  expect(intent.transition.participants).toEqual([{ id: `${intent.transition.id}:participant:1`, zoneId: 'zone', layerId: overlayJunction.layerId, fromClipId: 'verse-a', toClipId: 'verse-b' }])
})

it('keeps Insert, settings and Reset unavailable until their own selection exists', async () => {
  const { submit } = setup()
  expect(screen.getByRole('button', { name: 'Insert Transition' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Apply settings' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Reset to Cut' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Cut junction'), { target: { value: junctionKey } })
  expect(screen.getByRole('button', { name: 'Insert Transition' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Reset to Cut' })).toBeDisabled()
  await waitFor(() => expect(submit).not.toHaveBeenCalled())
})

it('reports a refused plan without submitting anything', async () => {
  const { submit, status } = setup()
  fireEvent.change(screen.getByLabelText('Cut junction'), { target: { value: junctionKey } })
  fireEvent.change(screen.getByLabelText('New Transition duration'), { target: { value: '1500.5' } })
  fireEvent.keyDown(screen.getByLabelText('New Transition duration'), { key: 'Enter' })

  fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))

  await waitFor(() => expect(status).toHaveBeenCalledWith('A Transition requires a positive whole-millisecond duration.'))
  expect(submit).not.toHaveBeenCalled()
})

it('guards repeated submissions and suppresses obsolete feedback', async () => {
  let done!: (value: { status: 'unchanged' }) => void
  let current = true
  const submit = vi.fn((_request: ShowV2TransitionSubmission) => new Promise<{ status: 'unchanged' }>(resolve => { done = resolve }))
  const { status } = setup(submit, () => current)
  fireEvent.change(screen.getByLabelText('Cut junction'), { target: { value: junctionKey } })
  fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))
  fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))
  expect(submit).toHaveBeenCalledTimes(1)
  current = false
  done({ status: 'unchanged' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Insert Transition' })).toBeEnabled())
  expect(status).not.toHaveBeenCalled()
})

it('hands a stale capture report to admission instead of adopting locally', async () => {
  const { submit, status } = setup(undefined, () => false)
  fireEvent.change(screen.getByLabelText('Cut junction'), { target: { value: junctionKey } })
  fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  expect(submit.mock.calls[0][0].isCurrent()).toBe(false)
  expect(status).not.toHaveBeenCalled()
})

import { useMemo, useState } from 'react'
import { afterEach, beforeEach } from 'vitest'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { admitShowV2PilotTransitionEdit } from '@/store/showV2PreparedEditAdmission'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())
let actualId = 0

function actualHarness() {
  const { record, dependencies } = showV2TransitionEditorFixture()
  record.id = `transition-component-${++actualId}`
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'transition-component-provider', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  function Harness() {
    const current = useShowStore(state => state.showV2Pilots[record.id])
    const [status, setStatus] = useState('')
    const capture = useMemo(() => captureShowStageEditV2(current, dependencies), [current])
    return <>
      <ShowV2TransitionEditor capture={capture}
        submitTransitionEdit={request => admitShowV2PilotTransitionEdit({ showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0, capture, ...request })}
        isCurrentCapture={() => useShowStore.getState().showV2Pilots[record.id] === current}
        isCurrentCompletion={(receipt, phase) => phase === 'saved' ? useShowStore.getState().showV2Pilots[record.id] === receipt.record : useShowStore.getState().showV2SaveFailure?.record === receipt.record}
        onStatus={setStatus} />
      <output>{status}</output>
    </>
  }
  render(<Harness />)
  return { record, write }
}

it('real parent callback adopts the Insert, selects it and then resets it back to a Cut', async () => {
  const { record, write } = actualHarness()
  fireEvent.change(screen.getByLabelText('Cut junction'), { target: { value: junctionKey } })
  fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))

  expect(await screen.findByText('Transition saved.')).toBeInTheDocument()
  const inserted = useShowStore.getState().showV2Pilots[record.id]
  expect(inserted.composition.transitions).toHaveLength(1)
  expect(screen.getByLabelText<HTMLSelectElement>('Transition')).toHaveValue(inserted.composition.transitions[0].id)
  expect(screen.getByLabelText('Cut junction')).toHaveValue('')
  expect(inserted.composition.clips.find(clip => clip.id === 'verse-b')?.startMs).toBe(4000)

  fireEvent.click(screen.getByRole('button', { name: 'Reset to Cut' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  const reset = useShowStore.getState().showV2Pilots[record.id]
  expect(reset.composition.transitions).toEqual([])
  expect(reset.composition.clips.find(clip => clip.id === 'verse-b')?.startMs).toBe(3000)
  await waitFor(() => expect(screen.getByLabelText('Transition')).toHaveValue(''))
})

it('real current failed save keeps history, record and drafts for retry', async () => {
  const { record, write } = actualHarness()
  write.mockRejectedValueOnce(Error('offline'))
  fireEvent.change(screen.getByLabelText('Cut junction'), { target: { value: junctionKey } })
  fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))

  expect(await screen.findByText('Save failed: offline')).toBeInTheDocument()
  expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  expect(screen.getByLabelText('Cut junction')).toHaveValue(junctionKey)

  fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  expect(await screen.findByText('Transition saved.')).toBeInTheDocument()
})
