import { useMemo, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { recoveryFixture } from '@/test/showV2RecoveryFixture'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { ShowV2LayerEditor } from './ShowV2LayerEditor'
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())
function setup(invalid = false) {
  const { record, dependencies } = recoveryFixture(false); record.id = invalid ? 'invalid-layer-recovery' : 'visible-layer-recovery'
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record } })
  function Harness() {
    const current = useShowStore(state => state.showV2Pilots[record.id])
    const capture = useMemo(() => {
      const captured = captureShowStageEditV2(current, dependencies)
      return invalid ? { ...captured, inputCapture: { status: 'invalid' as const, message: 'Invalid trusted context' } } : captured
    }, [current])
    const [status, setStatus] = useState('')
    return <><output aria-label="Preparation">{capture.prepared.status}</output><ShowV2LayerEditor capture={capture} isCurrentCapture={() => useShowStore.getState().showV2Pilots[record.id] === current} isCurrentCompletion={receipt => useShowStore.getState().showV2Pilots[record.id] === receipt.record} onStatus={setStatus} /><output>{status}</output></>
  }
  render(<Harness />)
  const overlay = record.composition.layers.find(layer => layer.rank !== 0)!
  fireEvent.change(screen.getByLabelText('Layer Zone'), { target: { value: overlay.zoneId } })
  fireEvent.change(screen.getByLabelText('Selected Layer'), { target: { value: overlay.id } })
  return { record, write }
}
it('existing remove-Layer control recovers qualified refused context with one native admission/save', async () => {
  const { record, write } = setup()
  expect(screen.getByLabelText('Preparation')).toHaveTextContent('refused')
  expect(screen.getByRole('button', { name: /^Remove Layer$/ })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: /^Remove Layer$/ }))
  expect(await screen.findByText('Layer saved.')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Preparation')).toHaveTextContent('ready'))
  expect(write).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Selected Layer')).toHaveValue('')
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
})
it('assets without qualified structural/domain/context admission cannot enable recovery controls', () => {
  const { record, write } = setup(true)
  expect(screen.getByRole('button', { name: /^Remove Layer$/ })).toBeDisabled()
  expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})
