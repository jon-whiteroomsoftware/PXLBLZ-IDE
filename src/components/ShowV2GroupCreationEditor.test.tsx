import { useMemo, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { showV2GroupEditorFixture } from '@/test/showV2GroupEditorFixture'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { ShowV2GroupCreationEditor } from './ShowV2GroupCreationEditor'
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())
let fixtureId = 0
function setup(pair = false) {
  const { record, dependencies } = showV2GroupEditorFixture(pair)
  record.id = `group-component-${++fixtureId}`
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'group-editor-test', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  function Harness() {
    const current = useShowStore(state => state.showV2Pilots[record.id]); const [status, setStatus] = useState('')
    const capture = useMemo(() => captureShowStageEditV2(current, dependencies), [current])
    return <><ShowV2GroupCreationEditor capture={capture} isCurrentCapture={() => useShowStore.getState().showV2Pilots[record.id] === current}
      isCurrentCompletion={(receipt, phase) => phase === 'saved' ? useShowStore.getState().showV2Pilots[record.id] === receipt.record : useShowStore.getState().showV2SaveFailure?.record === receipt.record} onStatus={setStatus} /><output>{status}</output></>
  }
  render(<Harness />); return { record, write }
}
it('explicitly selects/names/creates, with no draft writes and one shared runtime/history/save', async () => {
  const { record, write } = setup()
  fireEvent.click(screen.getByRole('checkbox', { name: /Voice.*2000.*3000/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Voice.*3000.*6000/ }))
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Verse' } })
  expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
  expect(await screen.findByText('Group saved.')).toBeInTheDocument()
  expect(write).toHaveBeenCalledTimes(1); expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
  const current = useShowStore.getState().showV2Pilots[record.id]
  expect(current.composition.patternInstances).toEqual(record.composition.patternInstances)
  expect(current.composition.groupDefinitions[0].name).toBe('Verse')
  expect(Object.values(current.composition.groupOccurrences[0].instanceBindings!)).toEqual(['instance'])
  expect(screen.getByRole('button', { name: 'Create Group' })).toBeDisabled()
})
it('keeps refused partial-chain selection/name until the user explicitly selects the complete pair and Transition', async () => {
  const { record, write } = setup(true)
  const first = screen.getByRole('checkbox', { name: /Voice.*2000.*3000/ })
  fireEvent.click(first); fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Verse' } })
  const transition = screen.getByRole('checkbox', { name: /crossfade.*verse-transition/i })
  expect(transition).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
  await waitFor(() => expect(screen.getByText(/Explicitly select every attached internal Transition/)).toBeInTheDocument())
  expect(first).toBeChecked(); expect(screen.getByLabelText('Group name')).toHaveValue('Verse'); expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  fireEvent.click(screen.getByRole('checkbox', { name: /Voice.*4000.*7000/ })); fireEvent.click(transition)
  fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
  expect(await screen.findByText('Group saved.')).toBeInTheDocument(); expect(write).toHaveBeenCalledTimes(1)
})

it('retains selected drafts through current save rollback and permits one explicit retry', async () => {
  const { record, write } = setup(); write.mockRejectedValueOnce(Error('Storage unavailable'))
  fireEvent.click(screen.getByRole('checkbox', { name: /Voice.*2000.*3000/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Voice.*3000.*6000/ }))
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Verse' } }); fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
  expect(await screen.findByText('Save failed: Storage unavailable')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /Voice.*2000.*3000/ })).toBeChecked(); expect(screen.getByRole('checkbox', { name: /Voice.*3000.*6000/ })).toBeChecked()
  expect(screen.getByLabelText('Group name')).toHaveValue('Verse'); expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
  expect(await screen.findByText('Group saved.')).toBeInTheDocument(); expect(write).toHaveBeenCalledTimes(2)
  expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
})
it('one pending operation prevents duplicate writes and suppresses saved feedback after external replacement', async () => {
  const { record, write } = setup(); let resolve: () => void = () => {}
  write.mockImplementationOnce(() => new Promise<void>(done => { resolve = done }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Voice.*2000.*3000/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Voice.*3000.*6000/ }))
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Verse' } }); fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Create Group' })); expect(write).toHaveBeenCalledTimes(1)
  await act(async () => {
    const current = useShowStore.getState().showV2Pilots[record.id]
    useShowStore.setState({ showV2Pilots: { [record.id]: { ...current, name: 'External replacement' } } }); resolve()
  })
  await waitFor(() => expect(screen.getByLabelText('Group name')).not.toBeDisabled())
  expect(screen.queryByText('Group saved.')).not.toBeInTheDocument(); expect(write).toHaveBeenCalledTimes(1)
})
