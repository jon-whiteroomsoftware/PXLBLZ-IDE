import { useMemo, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { commandFixtureV2 } from '@/engine/showCommandsV2/fixtures'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { prepareShowStageV2 } from '@/engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { ShowV2ZoneLayoutEditor } from './ShowV2ZoneLayoutEditor'

/**
 * The Zone Layouts section (#1039). The oracle is the adopted record in the
 * store plus the save and history the admission performed, never the
 * component's own state.
 */
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

function setup(installation = false) {
  const record = commandFixtureV2()
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  record.zoneLayouts[1].logical = { kind: 'stripes', axis: 'y', zoneIds: ['left', 'right'] }
  if (installation) {
    record.outputContract = createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 16 })
    record.zoneLayouts[1] = {
      id: 'left-only',
      name: 'Left only',
      zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 7 }] }, { zoneId: 'right', ranges: [] }],
    }
  }
  const dependencies = {
    patterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'zone-layout-editor', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  function Harness() {
    const current = useShowStore(state => state.showV2Pilots[record.id])
    const [status, setStatus] = useState('')
    const capture = useMemo(() => ({ record: current, dependencies, prepared: prepareShowStageV2(current, dependencies) }), [current])
    return (
      <>
        <ShowV2ZoneLayoutEditor
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
  return { record, write, current: () => useShowStore.getState().showV2Pilots[record.id] }
}

it('lists every definition with its routing mode and timeline use', () => {
  setup()
  const options = [...screen.getByLabelText<HTMLSelectElement>('Zone Layout').options].map(option => option.textContent)
  expect(options).toEqual(['Both · Moving split X · 2 on the timeline', 'Left only · Top / bottom stripes'])
  expect(screen.getByLabelText('Routing mode')).toHaveValue('split-x')
})

it('adds a definition under a fresh identity and selects it', async () => {
  const { write, current } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Add Zone Layout' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(current().zoneLayouts).toHaveLength(3)
  expect(current().zoneLayouts[2].name).toBe('Zone Layout')
  await waitFor(() => expect(screen.getByLabelText('Zone Layout')).toHaveValue(current().zoneLayouts[2].id))
  // The new definition seeds the Portable operator the first one carries.
  expect(current().zoneLayouts[2].logical).toEqual({ kind: 'split', axis: 'x', zoneIds: ['left', 'right'] })
})

it('duplicates the selected definition under a name that steps aside', async () => {
  const { write, current } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate Zone Layout' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(current().zoneLayouts[2]).toMatchObject({ name: 'Both 2', logical: { kind: 'split', axis: 'x' } })
})

it('renames a definition and reports the duplicate-name refusal without writing', async () => {
  const { record, write, current } = setup()
  fireEvent.change(screen.getByLabelText('Zone Layout name'), { target: { value: 'Across' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rename Zone Layout' }))
  await waitFor(() => expect(current().zoneLayouts[0].name).toBe('Across'))
  expect(write).toHaveBeenCalledTimes(1)

  fireEvent.change(screen.getByLabelText('Zone Layout name'), { target: { value: 'Left only' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rename Zone Layout' }))
  await waitFor(() => expect(screen.getByText(/is already named "Left only"/)).toBeInTheDocument())
  expect(write).toHaveBeenCalledTimes(1)
  expect(useShowStore.getState().showV2Pilots[record.id].zoneLayouts[0].name).toBe('Across')
})

it('writes the routing mode, its parameters and its member Zones', async () => {
  const { write, current } = setup()
  fireEvent.change(screen.getByLabelText('Routing mode'), { target: { value: 'rings' } })
  await waitFor(() => expect(current().zoneLayouts[0].logical).toEqual({ kind: 'rings', rings: 5, zoneIds: ['left', 'right'] }))

  const rings = await screen.findByRole('textbox', { name: 'Ring count' })
  fireEvent.change(rings, { target: { value: '9' } })
  fireEvent.keyDown(rings, { key: 'Enter' })
  await waitFor(() => expect(current().zoneLayouts[0].logical).toMatchObject({ rings: 9 }))

  // Rings takes one Zone and upward, so the member list can grow and shrink.
  // Every Clip in the fixture is on Left and both occurrences use this
  // definition, so Left has to stay a member throughout.
  fireEvent.change(screen.getByLabelText('Routing Zone 2'), { target: { value: 'left' } })
  await waitFor(() => expect(current().zoneLayouts[0].logical).toMatchObject({ zoneIds: ['left', 'left'] }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove routing Zone' }))
  await waitFor(() => expect(current().zoneLayouts[0].logical).toMatchObject({ zoneIds: ['left'] }))
  fireEvent.click(screen.getByRole('button', { name: 'Add routing Zone' }))
  await waitFor(() => expect(current().zoneLayouts[0].logical).toMatchObject({ zoneIds: ['left', 'left'] }))
  expect(write).toHaveBeenCalledTimes(5)
})

it('refuses an operator that would leave a Clip unrouted, and writes nothing', async () => {
  const { record, write } = setup()
  // Every Clip in the fixture lives on Left, and both occurrences use this
  // definition, so handing both halves of the split to Right cannot be
  // accepted: the Clips would play on a Zone this routing does not provide.
  fireEvent.change(screen.getByLabelText('Routing Zone 1'), { target: { value: 'right' } })
  await waitFor(() => expect(screen.getByText(/does not provide it/)).toBeInTheDocument())
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})

it('removes an unused definition after one confirmation and keeps the last one', async () => {
  const { write, current } = setup()
  fireEvent.change(screen.getByLabelText('Zone Layout'), { target: { value: 'left-only' } })
  fireEvent.click(screen.getByRole('button', { name: 'Remove Zone Layout' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove Left only?' }))
  await waitFor(() => expect(current().zoneLayouts.map(layout => layout.id)).toEqual(['both']))
  expect(write).toHaveBeenCalledTimes(1)
  // One definition left: the control is gone rather than refusing on click.
  expect(screen.queryByRole('button', { name: 'Remove Zone Layout' })).toBeNull()
})

it('reports the refusal when a Layout occurrence still names the definition', async () => {
  const { record, write } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Zone Layout' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove Both?' }))
  await waitFor(() => expect(screen.getByText(/still use Zone Layout "both"/)).toBeInTheDocument())
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})

it('writes physical LED ranges and shows Installation coverage', async () => {
  const { write, current } = setup(true)
  fireEvent.change(screen.getByLabelText('Zone Layout'), { target: { value: 'left-only' } })
  expect(screen.getByLabelText('Routing mode')).toHaveValue('physical')
  expect(screen.getByTestId('show-v2-zone-layout-coverage'))
    .toHaveTextContent('8 of 16 pixels assigned · 8 missing · 0 overlapping · 0 out of range')

  const ranges = screen.getByLabelText('Right pixel ranges')
  fireEvent.change(ranges, { target: { value: '8-15' } })
  fireEvent.keyDown(ranges, { key: 'Enter' })
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(current().zoneLayouts[1].zones).toEqual([
    { zoneId: 'left', ranges: [{ start: 0, end: 7 }] },
    { zoneId: 'right', ranges: [{ start: 8, end: 15 }] },
  ])
  await waitFor(() => expect(screen.getByTestId('show-v2-zone-layout-coverage')).toHaveTextContent('16 of 16 pixels assigned'))
})
