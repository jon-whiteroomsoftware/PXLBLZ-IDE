// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ShowEditorV2Route } from './ShowEditorV2Route'
import { deriveShowRestartEventsV2 } from '@/engine/showPropertyAnimationV2'
import { insertShowTimeV2 } from '@/engine/showTimelineV2'
import { SEQUENCE_DEPENDENCIES, showV2EditorSequenceRecord } from '@/test/showV2EditorSequenceFixture'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import {
  getPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { resetControllerProvider } from '@/engine/controllerProviderRegistry'

vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: () => null }))

let serial = 0

function seed(): { record: ShowRecordV2; writes: ShowRecordV2[] } {
  const record = showV2EditorSequenceRecord()
  record.id = `editor-v2-sequences-${++serial}`
  const writes: ShowRecordV2[] = []
  usePatternStore.setState({ userPatterns: [...SEQUENCE_DEPENDENCIES.patterns], patternsLoaded: true })
  setPersonalContentProvider({
    ...getPersonalContentProvider(),
    id: `sequence-provider-${serial}`,
    replaceShowV2: async (_id: string, next: ShowRecordV2) => { writes.push(structuredClone(next)) },
  })
  useShowStore.setState({
    showV2Pilots: { [record.id]: record },
    showV2Histories: { [record.id]: { past: [], future: [] } },
    showsLoaded: true,
  })
  return { record, writes }
}

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useLibraryStore.setState(libraryInitialState)
  useMapStore.setState(mapInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  usePreviewStore.setState(previewInitialState)
  useShowTransportStore.setState(showTransportInitialState)
  useControllerStore.setState(controllerInitialState)
  resetControllerProvider()
})

afterEach(() => {
  cleanup()
  resetControllerProvider()
})

function commit(scope: HTMLElement, label: string, value: string): void {
  const field = within(scope).getByLabelText(label)
  fireEvent.change(field, { target: { value } })
  fireEvent.keyDown(field, { key: 'Enter' })
}

it('INSERT and GROUP-HOLD: inserting mid-Show through the route holds the crossing Group occurrence', async () => {
  const { record, writes } = seed()
  render(<ShowEditorV2Route showId={record.id} />)
  const inspector = screen.getByTestId('show-inspector-v2')

  commit(inspector, 'Insert Time at (ms)', '5000')
  commit(inspector, 'Insert Time duration (ms)', '2000')
  fireEvent.click(within(inspector).getByRole('button', { name: 'Insert Time' }))
  await waitFor(() => expect(writes).toHaveLength(1))

  const adopted = useShowStore.getState().showV2Pilots[record.id]
  // The route adopts exactly what the pure owner returns for the same request.
  const owned = insertShowTimeV2(record, { atMs: 5000, durationMs: 2000 })
  expect(owned.status).toBe('changed')
  if (owned.status !== 'changed') return
  expect({ ...adopted, updatedAt: 0 }).toEqual({ ...owned.record, updatedAt: 0 })

  // §7: the crossing occurrence holds at the mapped local time; the later one
  // only moves; definition and runtime identities are untouched.
  expect(adopted.composition.groupOccurrences[0].holds)
    .toEqual([{ id: 'occurrence-0:hold:5000', localTimeMs: 5000, durationMs: 2000 }])
  expect(adopted.composition.groupOccurrences[1])
    .toEqual({ ...record.composition.groupOccurrences[1], startMs: 22000 })
  expect(adopted.composition.groupDefinitions).toEqual(record.composition.groupDefinitions)
  expect(adopted.composition.patternInstances).toEqual(record.composition.patternInstances)
  // Show End, the crossing Clip and the dormant Marker all follow §7's mapping.
  expect(adopted.composition.showEndMs).toBe(32000)
  expect(adopted.composition.clips.find(clip => clip.id === 'bed')!.durationMs).toBe(14000)
  expect(adopted.composition.markers.find(marker => marker.id === 'dormant')!.timeMs).toBe(42000)
  expect(adopted.composition.markers.find(marker => marker.id === 'opening')!.timeMs).toBe(1000)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])

  // The delivered `.pxlshow`/`.epe` proof for this same sequence runs in
  // `showV2EditorSequenceArtifacts.test.ts`, which needs the node environment.
})

it('LAYOUT-END: shortening past authored content is refused exactly, and extending stretches coverage', async () => {
  const { record, writes } = seed()
  render(<ShowEditorV2Route showId={record.id} />)
  const inspector = screen.getByTestId('show-inspector-v2')
  const status = screen.getByTestId('show-inspector-v2-status')

  // A new end inside the last Clip's contribution is invalid; nothing is cut.
  commit(inspector, 'Show End', '15000')
  await waitFor(() => expect(status.textContent).not.toBe(''))
  expect(writes).toHaveLength(0)
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])

  // Extending stretches the final Layout coverage and leaves content alone.
  commit(inspector, 'Show End', '36000')
  await waitFor(() => expect(writes).toHaveLength(1))
  const adopted = useShowStore.getState().showV2Pilots[record.id]
  expect(adopted.composition.showEndMs).toBe(36000)
  expect(adopted.composition.layoutOccurrences.map(occurrence => [occurrence.startMs, occurrence.durationMs]))
    .toEqual([[0, 20000], [20000, 16000]])
  expect(adopted.composition.clips).toEqual(record.composition.clips)
  expect(adopted.composition.markers).toEqual(record.composition.markers)
})

it('RESTART: the entry policy toggled on the route resets the shared runtime at first contribution', async () => {
  const { record, writes } = seed()
  render(<ShowEditorV2Route showId={record.id} />)
  const panel = screen.getByTestId('show-clip-inspector-v2')

  fireEvent.change(within(panel).getByLabelText('Selected Clip'), { target: { value: 'reprise' } })
  fireEvent.change(await within(panel).findByLabelText('Clip entry policy'), { target: { value: 'restart' } })
  await waitFor(() => expect(writes).toHaveLength(1))

  const adopted = useShowStore.getState().showV2Pilots[record.id]
  expect(adopted.composition.clips.find(clip => clip.id === 'reprise')!.entryPolicy).toBe('restart')
  const derived = deriveShowRestartEventsV2(adopted)
  expect(derived.status).toBe('derived')
  if (derived.status !== 'derived') return
  expect(derived.events.map(event => [event.instanceId, event.atMs])).toEqual([['instance', 12000]])

  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
})

it('CURVE: trimming a Clip restricts its instance curve and keeps the source coefficients', async () => {
  const { record, writes } = seed()
  render(<ShowEditorV2Route showId={record.id} />)
  const panel = screen.getByTestId('show-clip-inspector-v2')

  fireEvent.change(within(panel).getByLabelText('Selected Clip'), { target: { value: 'curve-clip' } })
  // Trim the sole user of `solo` to [1000, 3000): its instance-control track is
  // restricted, and section 6 keeps the original curve's coefficients.
  commit(panel, 'Clip start', '1000')
  await waitFor(() => expect(writes).toHaveLength(1))
  commit(panel, 'Clip end', '3000')
  await waitFor(() => expect(writes).toHaveLength(2))

  const adopted = useShowStore.getState().showV2Pilots[record.id]
  const track = adopted.composition.propertyTracks.find(candidate => candidate.id === 'solo-gain')!
  expect([track.activeStartMs, track.activeDurationMs]).toEqual([1000, 2000])
  expect(track.keyframes[0].curveSegment).toBeDefined()

  // Restriction keeps the original coefficients rather than two endpoints: the
  // retained key's descriptor still spans the authored 4000 ms source curve.
  expect(track.keyframes[0].curveSegment!.sourceDurationMs).toBe(4000)
  expect(track.keyframes[0].curveSegment!.elapsedOffsetMs).toBe(0)
  // The retained interval is 2000 ms, so a descriptor rewritten to span only
  // the retained endpoints would report 2000 here and lose the original curve.
  expect(track.activeDurationMs).toBe(2000)
})
