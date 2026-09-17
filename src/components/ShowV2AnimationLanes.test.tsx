// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ShowEditorV2ReadOnly } from './ShowEditorV2ReadOnly'
import { restrictShowPropertyTrackV2 } from '@/engine/showPropertyTrackTimeMappingV2'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { propertyEditGroupRecord } from '@/test/showV2PropertyEditsFixture'
import { transitionV1Show } from '@/test/showV2TracerFixture'
import { validateShowRecordV2, type ShowPropertyTrackV2, type ShowRecordV2 } from '@/engine/showCompositionV2'
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

const SOURCE: ShowPropertyTrackV2 = {
  id: 'brightness',
  target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
  activeStartMs: 0,
  activeDurationMs: 1000,
  keyframes: [
    { id: 'left', timeMs: 0, value: 0, easing: { curve: 'quadratic', direction: 'in' } },
    { id: 'right', timeMs: 1000, value: 1, easing: { curve: 'linear' } },
  ],
}

let serial = 0

const VOICE = 'export var elapsed=0;var gain=.4;export function sliderGain(v){gain=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(gain,0,y)}'

function seed(): { record: ShowRecordV2; writes: ShowRecordV2[] } {
  const record = propertyEditGroupRecord()
  record.id = `lanes-${++serial}`
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'voice' }
  record.composition.patternInstances[0].patternName = 'Voice'
  record.composition.groupDefinitions[0].patternInstances[0].pattern = { kind: 'user', id: 'voice' }
  record.composition.groupDefinitions[0].patternInstances[0].patternName = 'Voice'
  usePatternStore.setState({
    userPatterns: [{ id: 'voice', name: 'Voice', src: VOICE, controls: {}, updatedAt: 1 }],
    patternsLoaded: true,
  })
  // One Show track restricted to its interior, so the lane must resolve a
  // retained descriptor rather than two endpoints.
  record.composition.propertyTracks = [restrictShowPropertyTrackV2([SOURCE], SOURCE, 250, 750)!]
  expect(validateShowRecordV2(record)).toEqual([])
  const writes: ShowRecordV2[] = []
  setPersonalContentProvider({
    ...getPersonalContentProvider(),
    id: `lanes-provider-${serial}`,
    replaceShowV2: async (_id: string, next: ShowRecordV2) => { writes.push(structuredClone(next)) },
  })
  useShowStore.setState({
    showV2Pilots: { [record.id]: record },
    showV2Histories: { [record.id]: { past: [], future: [] } },
    showsLoaded: true,
  })
  return { record, writes }
}

/** A converted crossfade Show: one Transition contributing over [400, 600). */
function seedCrossfade(): { record: ShowRecordV2; writes: ShowRecordV2[] } {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  record.id = `lanes-crossfade-${++serial}`
  const writes: ShowRecordV2[] = []
  setPersonalContentProvider({
    ...getPersonalContentProvider(),
    id: `lanes-provider-${serial}`,
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
  usePatternStore.setState({ ...patternInitialState, patternsLoaded: true })
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

it('draws a Property lane whose retained key is marked and whose curve is not a straight line', () => {
  const { record } = seed()
  render(<ShowEditorV2ReadOnly showId={record.id} />)

  const lanes = screen.getByTestId('show-v2-animation-lanes')
  const lane = within(lanes).getByRole('button', { name: /Clip clip view brightness/ })
  expect(lane).toHaveAttribute('data-show-lane-retained-keys', '1')
  const points = lanes.querySelector('polyline')!.getAttribute('points')!.split(' ')
    .map((pair) => Number(pair.split(',')[1]))
  // A two-point re-normalization draws a straight line: every interior sample
  // would sit on the chord between the endpoints. The retained ease-in does not.
  const chordAt = (index: number) => points[0] + (points[points.length - 1] - points[0]) * (index / (points.length - 1))
  expect(points.some((value, index) => Math.abs(value - chordAt(index)) > 0.01)).toBe(true)
})

it('selects a Property track from its lane and shows it in the Show inspector', async () => {
  const { record } = seed()
  render(<ShowEditorV2ReadOnly showId={record.id} />)

  fireEvent.click(within(screen.getByTestId('show-v2-animation-lanes'))
    .getByRole('button', { name: /Clip clip view brightness/ }))

  const inspector = screen.getByTestId('show-inspector-v2')
  await waitFor(() => expect(within(inspector).getByLabelText('Property track')).toHaveValue('brightness'))
  expect(within(inspector).getByLabelText('Property owner')).toHaveValue('show')
})

it('draws each Group occurrence with its local children and selects it for the Group actions', async () => {
  const { record } = seed()
  render(<ShowEditorV2ReadOnly showId={record.id} />)

  const occurrences = within(screen.getByTestId('show-v2-animation-lanes'))
    .getAllByRole('button', { name: /^Group Definition in Zone/ })
  expect(occurrences).toHaveLength(2)
  expect(occurrences[0]).toHaveAttribute('data-show-group-children', '1')

  fireEvent.click(occurrences[0])
  const panel = screen.getByTestId('show-clip-inspector-v2')
  await waitFor(() => expect(panel).toHaveTextContent('This Clip belongs to a Group occurrence.'))
})

it('holds the whole side panel in one scroll container, so its last control is reachable', () => {
  const { record } = seed()
  render(<ShowEditorV2ReadOnly showId={record.id} />)

  const panel = screen.getByTestId('show-editor-v2-side-panel')
  expect(panel.className).toContain('overflow-y-auto')
  expect(panel.className).toContain('overflow-x-hidden')
  // The last section in the panel is the Show inspector's status line; the
  // Clip inspector's own controls sit above it inside the same scroller.
  expect(panel).toContainElement(screen.getByTestId('show-clip-inspector-v2'))
  expect(panel).toContainElement(screen.getByTestId('show-inspector-v2-status'))
})

it('refuses an Insert Time strictly inside a Transition and writes nothing', async () => {
  const { record, writes } = seedCrossfade()
  render(<ShowEditorV2ReadOnly showId={record.id} />)
  const inspector = screen.getByTestId('show-inspector-v2')

  const commit = (label: string, value: string) => {
    const field = within(inspector).getByLabelText(label)
    fireEvent.change(field, { target: { value } })
    fireEvent.keyDown(field, { key: 'Enter' })
  }
  // The crossfade contributes over [400, 600); 500 is strictly inside it.
  commit('Insert Time at (ms)', '500')
  commit('Insert Time duration (ms)', '250')
  fireEvent.click(within(inspector).getByRole('button', { name: 'Insert Time' }))

  await waitFor(() => expect(screen.getByTestId('show-inspector-v2-status'))
    .toHaveTextContent('strictly inside visual Transition "transition-crossfade"'))
  expect(writes).toHaveLength(0)
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

it('inserts time at zero through the Show inspector without adding a Group hold', async () => {
  const { record, writes } = seed()
  render(<ShowEditorV2ReadOnly showId={record.id} />)
  const inspector = screen.getByTestId('show-inspector-v2')

  const commit = (label: string, value: string) => {
    const field = within(inspector).getByLabelText(label)
    fireEvent.change(field, { target: { value } })
    fireEvent.keyDown(field, { key: 'Enter' })
  }
  commit('Insert Time at (ms)', '0')
  commit('Insert Time duration (ms)', '500')
  fireEvent.click(within(inspector).getByRole('button', { name: 'Insert Time' }))

  await waitFor(() => expect(
    [writes.length, screen.getByTestId('show-inspector-v2-status').textContent],
  ).toEqual([1, 'Insert Time saved.']))
  const adopted = useShowStore.getState().showV2Pilots[record.id]
  expect(adopted.composition.showEndMs).toBe(record.composition.showEndMs + 500)
  // An insertion at zero extends the first Layout occurrence and never adds a hold.
  expect(adopted.composition.layoutOccurrences[0].startMs).toBe(0)
  expect(adopted.composition.groupOccurrences[0].holds)
    .toEqual(record.composition.groupOccurrences[0].holds)
})
