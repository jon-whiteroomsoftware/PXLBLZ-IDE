import { useMemo, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { commandFixtureV2 } from '@/engine/showCommandsV2/fixtures'
import { prepareShowStageV2 } from '@/engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { ShowV2ShowPropertiesEditor } from './ShowV2ShowPropertiesEditor'

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  useMapStore.setState(mapInitialState)
})
afterEach(() => resetPersonalContentProvider())

function setup(installation = false) {
  // Two routed Zones, so the duplicate-name refusal has a name to collide with.
  const record = commandFixtureV2()
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  record.stageMapId = 'plane'
  record.outputContract = installation
    ? { version: 1, kind: 'installation', outputMapId: 'plane', pixelCount: 300, resolution: 'fixed' }
    : { version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 1024, compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' } }
  const dependencies = {
    patterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'show-properties-editor', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  function Harness() {
    const current = useShowStore(state => state.showV2Pilots[record.id])
    const [status, setStatus] = useState('')
    const capture = useMemo(() => ({ record: current, dependencies, prepared: prepareShowStageV2(current, dependencies) }), [current])
    return (
      <>
        <ShowV2ShowPropertiesEditor
          capture={capture}
          isCurrentCapture={() => useShowStore.getState().showV2Pilots[record.id] === current}
          isCurrentCompletion={(receipt, phase) => phase === 'saved'
            ? useShowStore.getState().showV2Pilots[record.id] === receipt.record
            : useShowStore.getState().showV2SaveFailure?.record === receipt.record}
          onStatus={setStatus}
        />
        <output>{status}</output>
      </>
    )
  }
  render(<Harness />)
  return { record, write }
}

it('shows the output summary the v1 editor titles the same way', () => {
  setup()
  expect(screen.getByTitle('Show output summary')).toHaveTextContent('Portable · 1024 px reference · Square')
})

it('changes the Portable reference map through one accepted edit', async () => {
  const { record, write } = setup()
  fireEvent.change(screen.getByLabelText('Reference map'), { target: { value: 'wide' } })
  expect(write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Apply output contract' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  const current = useShowStore.getState().showV2Pilots[record.id]
  expect(current.outputContract).toMatchObject({ kind: 'portable-2d', referenceMapId: 'wide', referencePixelCount: 1024 })
  expect(current.stageMapId).toBe('wide')
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
})

it('switches a Portable contract to Installation, keeping the chosen map and count', async () => {
  const { record, write } = setup()
  fireEvent.change(screen.getByLabelText('Output contract'), { target: { value: 'installation' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply output contract' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(useShowStore.getState().showV2Pilots[record.id].outputContract)
    .toMatchObject({ kind: 'installation', outputMapId: 'plane', pixelCount: 1024 })
  expect(screen.getByTitle('Show output summary')).toHaveTextContent('Installation · 1024 px fixed · Square')
})

it('offers a Portable contract only 2D maps', () => {
  setup()
  const options = [...screen.getByLabelText<HTMLSelectElement>('Reference map').options].map(option => option.value)
  expect(options).toContain('plane')
  expect(options).not.toContain('cube')
})

it('names the Output map when the contract is an Installation', () => {
  setup(true)
  expect(screen.getByLabelText('Output map')).toHaveValue('plane')
  expect(screen.queryByLabelText('Reference map')).not.toBeInTheDocument()
})

it('sets the Stage map without touching the output contract', async () => {
  const { record, write } = setup()
  fireEvent.change(screen.getByLabelText('Stage map'), { target: { value: 'cube' } })
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  const current = useShowStore.getState().showV2Pilots[record.id]
  expect(current.stageMapId).toBe('cube')
  expect(current.outputContract).toEqual(record.outputContract)
})

it('renames a Zone and refuses a duplicate name without writing', async () => {
  const { record, write } = setup()
  const zone = record.zones[0]
  const other = record.zones[1]
  fireEvent.change(screen.getByLabelText('Zone'), { target: { value: zone.id } })
  const name = screen.getByLabelText('Zone name')
  fireEvent.change(name, { target: { value: 'Stage left' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rename Zone' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(useShowStore.getState().showV2Pilots[record.id].zones[0]).toMatchObject({ name: 'Stage left' })

  fireEvent.change(screen.getByLabelText('Zone name'), { target: { value: other.name } })
  fireEvent.click(screen.getByRole('button', { name: 'Rename Zone' }))
  expect(await screen.findByText(new RegExp(`already named "${other.name}"`))).toBeInTheDocument()
  expect(write).toHaveBeenCalledTimes(1)
})

it('enables Trails at the default retention and turns them off again', async () => {
  const { record, write } = setup()
  fireEvent.click(screen.getByLabelText('Enable Trails'))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(useShowStore.getState().showV2Pilots[record.id].outputEffects)
    .toEqual([{ id: 'trails', kind: 'trails', retention: 15 / 16 }])
  fireEvent.click(screen.getByLabelText('Enable Trails'))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  expect(useShowStore.getState().showV2Pilots[record.id].outputEffects).toEqual([])
})

it('keeps an already-satisfied request a true no-op with no save', async () => {
  const { record, write } = setup()
  fireEvent.change(screen.getByLabelText('Zone'), { target: { value: record.zones[0].id } })
  fireEvent.click(screen.getByRole('button', { name: 'Rename Zone' }))
  expect(await screen.findByText('Show properties are unchanged.')).toBeInTheDocument()
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
