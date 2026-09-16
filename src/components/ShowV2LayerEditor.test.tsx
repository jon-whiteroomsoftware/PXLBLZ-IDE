import { useMemo, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { prepareShowStageV2 } from '@/engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { ShowV2LayerEditor } from './ShowV2LayerEditor'
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())
function setup() {
  const c = convertShowRecordV1ToV2(convertibleV1Show()); if (c.status !== 'converted') throw Error('fixture')
  const record = c.record; record.composition.transitions = []; record.composition.clips = record.composition.clips.slice(0, 1)
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  const dependencies = { patterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }], maps: [], libraries: [], profiles: [], stageMap: null }
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'layer-editor', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  function Harness() {
    const current = useShowStore(state => state.showV2Pilots[record.id]); const [status, setStatus] = useState('')
    const capture = useMemo(() => ({ record: current, dependencies, prepared: prepareShowStageV2(current, dependencies) }), [current])
    return <><ShowV2LayerEditor capture={capture} isCurrentCapture={() => useShowStore.getState().showV2Pilots[record.id] === current} isCurrentCompletion={(receipt, phase) => phase === 'saved' ? useShowStore.getState().showV2Pilots[record.id] === receipt.record : useShowStore.getState().showV2SaveFailure?.record === receipt.record} onStatus={setStatus} /><output>{status}</output></>
  }
  render(<Harness />); return { record, write }
}
it('adds a named top Layer through explicit Zone/name, while draft/cancel/selection write nothing', async () => {
  const { record, write } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Add Layer' }))
  fireEvent.change(screen.getByLabelText('New Layer Zone'), { target: { value: record.zones[0].id } })
  fireEvent.change(screen.getByLabelText('New Layer name'), { target: { value: 'Accent' } })
  expect(write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Add Layer at top' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(await screen.findByText('Layer saved.')).toBeInTheDocument()
  expect(useShowStore.getState().showV2Pilots[record.id].composition.layers.find(layer => layer.name === 'Accent')).toMatchObject({ name: 'Accent', rank: Math.max(...record.composition.layers.filter(layer => layer.zoneId === record.zones[0].id).map(layer => layer.rank)) + 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Add Layer' })); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(write).toHaveBeenCalledTimes(1)
})
it('requires an unselected destination for each ordinary reference and clears removed Layer selection after one save', async () => {
  const { record, write } = setup(), source = record.composition.clips[0].layerId, target = record.composition.layers.find(layer => layer.id !== source)!.id
  fireEvent.change(screen.getByLabelText('Layer Zone'), { target: { value: 'zone' } }); fireEvent.change(screen.getByLabelText('Selected Layer'), { target: { value: source } })
  expect(write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Layer' }))
  const destination = screen.getByLabelText(`Destination for Clip ${record.composition.clips[0].id}`)
  expect(destination).toHaveValue(''); expect(screen.getByRole('button', { name: 'Reassign and remove' })).toBeDisabled(); expect(write).not.toHaveBeenCalled()
  fireEvent.change(destination, { target: { value: target } }); fireEvent.click(screen.getByRole('button', { name: 'Reassign and remove' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1)); expect(await screen.findByText('Layer saved.')).toBeInTheDocument()
  expect(screen.getByLabelText('Selected Layer')).toHaveValue('')
  const current = useShowStore.getState().showV2Pilots[record.id]
  expect(current.composition.layers.some(layer => layer.id === source)).toBe(false); expect(current.composition.clips[0]).toEqual({ ...record.composition.clips[0], layerId: target })
})
it('retains empty named Layer selection and unchanged name with zero history/save', async () => {
  const { record, write } = setup(); const empty = record.composition.layers.find(layer => layer.id !== record.composition.clips[0].layerId)!
  fireEvent.change(screen.getByLabelText('Layer Zone'), { target: { value: 'zone' } }); fireEvent.change(screen.getByLabelText('Selected Layer'), { target: { value: empty.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Rename Layer' }))
  expect(await screen.findByText('Layer is unchanged.')).toBeInTheDocument(); expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
