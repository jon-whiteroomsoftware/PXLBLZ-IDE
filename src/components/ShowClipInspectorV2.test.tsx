// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { ShowClipInspectorV2 } from './ShowClipInspectorV2'
import { useShowV2EditCapture } from './useShowV2EditCapture'
import { applyShowCommandV2 } from '../engine/showCommandsV2/registry'
import { editShowClipV2 } from '../engine/showClipsV2'
import { createShowV2IndependentIntent } from '../engine/showV2ClipSharingEditorModel'
import { captureShowStageEditV2 as captureForIntent } from '../engine/showPreparedStageV2'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { showInitialState, useShowStore } from '../store/showStore'
import { patternInitialState, usePatternStore } from '../store/patternStore'
import { mapInitialState, useMapStore } from '../store/mapStore'
import { libraryInitialState, useLibraryStore } from '../store/libraryStore'
import {
  getPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '../engine/personalContentProvider'
import { captureShowStageEditV2 } from '../engine/showPreparedStageV2'
import { buildShowEpeExportV2 } from '../engine/showEpeExportV2'
import { parseEpe } from '../engine/epeImport'
import { buildDeliveredShowSourceInventory } from '../engine/showSourceInventory'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from '../engine/showCompositionV2'

vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: () => null }))
const minted = vi.hoisted(() => ({ count: 0 }))
vi.mock('@/engine/personalContentMetadata', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/engine/personalContentMetadata')>(),
  newPersonalContentId: () => `minted-${++minted.count}`,
}))

const VOICE = 'export var elapsed=0;var gain=.4;var lost=.2;export function sliderGain(v){gain=v}export function sliderLost(v){lost=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(gain,lost,y)}'
const OTHER = 'export var elapsed=0;var gain=.4;export function sliderGain(v){gain=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(0,gain,y)}'

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useLibraryStore.setState(libraryInitialState)
  minted.count = 0
})

let serial = 0
function seed(): { record: ShowRecordV2; writes: ShowRecordV2[] } {
  const record = propertyEditGroupRecord()
  record.id = `inspector-${++serial}`
  // A Clip shorter than Show End leaves room for the move and resize partitions.
  record.composition.clips[0].durationMs = 200
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'voice' }
  record.composition.patternInstances[0].patternName = 'Voice'
  record.composition.patternInstances[0].controlTargets = { sliderGain: 0.4, sliderLost: 0.2 }
  record.composition.propertyTracks = [{
    id: 'lost',
    target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLost' },
    activeStartMs: 0,
    activeDurationMs: 400,
    keyframes: [
      { id: 'lost-a', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
      { id: 'lost-b', timeMs: 400, value: 0.3, easing: { curve: 'linear' } },
    ],
  }]
  usePatternStore.setState({
    userPatterns: [
      { id: 'voice', name: 'Voice', src: VOICE, controls: {}, updatedAt: 1 },
      { id: 'other', name: 'Other', src: OTHER, controls: {}, updatedAt: 1 },
    ],
  })
  const writes: ShowRecordV2[] = []
  setPersonalContentProvider({
    ...getPersonalContentProvider(),
    id: `inspector-provider-${serial}`,
    replaceShowV2: async (_id: string, next: ShowRecordV2) => { writes.push(structuredClone(next)) },
  })
  useShowStore.setState({
    showV2Pilots: { [record.id]: record },
    showV2Histories: { [record.id]: { past: [], future: [] } },
  })
  return { record, writes }
}

function Harness({ showId }: { showId: string }) {
  return <ShowClipInspectorV2 showId={showId} binding={useShowV2EditCapture(showId)} />
}

async function selectClip(clipId = 'clip') {
  const select = await screen.findByLabelText('Selected Clip')
  const { fireEvent } = await import('@testing-library/react')
  fireEvent.change(select, { target: { value: clipId } })
  return select
}

/** The editor number fields commit on Enter, so a draft never adopts by itself. */
async function commitNumber(label: string, value: string) {
  const { fireEvent } = await import('@testing-library/react')
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.keyDown(screen.getByLabelText(label), { key: 'Enter' })
}

it('inspector independence adopts exactly what the sharing owner returns', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const inspector = seed()
  const preimage = structuredClone(inspector.record)
  render(<Harness showId={inspector.record.id} />)
  await selectClip()
  fireEvent.click(await screen.findByRole('button', { name: 'Make Pattern Independent' }))
  await waitFor(() => expect(inspector.writes).toHaveLength(1))
  const throughInspector = useShowStore.getState().showV2Pilots[inspector.record.id]

  // The oracle is the pure owner on the same preimage with the same minted
  // identities: the inspector plans one intent and adopts what it returns.
  minted.count = 0
  const capture = captureForIntent(preimage, {
    patterns: usePatternStore.getState().userPatterns, maps: [], libraries: [], profiles: [], stageMap: null,
  })
  const plan = createShowV2IndependentIntent(capture, 'clip', () => `minted-${++minted.count}`)
  expect(plan.status).toBe('ready')
  if (plan.status !== 'ready') return
  const owned = editShowClipV2(preimage, plan.intent)
  expect(owned.status).toBe('changed')
  if (owned.status !== 'changed') return
  expect({ ...throughInspector, updatedAt: 0 }).toEqual({ ...owned.record, updatedAt: 0 })

  // Independence copies the shared instance's eligible tracks to the fresh
  // runtime; the Group Clip uses keep the original one.
  expect(throughInspector.composition.patternInstances).toHaveLength(2)
  expect(throughInspector.composition.clips[0].instanceId).not.toBe('instance')
  expect(throughInspector.composition.propertyTracks
    .filter(track => 'instanceId' in track.target && track.target.instanceId === throughInspector.composition.clips[0].instanceId))
    .toHaveLength(1)
  expect(throughInspector.composition.groupOccurrences).toEqual(inspector.record.composition.groupOccurrences)
  expect(useShowStore.getState().showV2Histories[inspector.record.id].past).toEqual([inspector.record])
})

it('replacing a Pattern that drops an animated control confirms first, and cancelling adopts nothing', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const { record, writes } = seed()
  render(<Harness showId={record.id} />)
  await selectClip()
  const replace = screen.getByRole('region', { name: 'Replace Pattern' })
  fireEvent.focus(within(replace).getByRole('combobox', { name: 'Replacement Pattern' }))
  fireEvent.change(within(replace).getByRole('combobox', { name: 'Replacement Pattern' }), { target: { value: 'Other' } })
  fireEvent.click(within(replace).getByRole('option', { name: 'Other' }))
  fireEvent.click(within(replace).getByRole('button', { name: 'Replace Pattern' }))

  const confirmation = await screen.findByRole('group', { name: 'Confirm Clip animation loss' })
  expect(confirmation).toHaveTextContent('Replacement drops 1 incompatible control: sliderLost on instance. Its animation is removed.')
  expect(writes).toHaveLength(0)

  fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel Pattern replacement' }))
  await screen.findByText('Pattern replacement cancelled.')
  expect(writes).toHaveLength(0)
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])

  fireEvent.click(within(replace).getByRole('button', { name: 'Replace Pattern' }))
  fireEvent.click(within(await screen.findByRole('group', { name: 'Confirm Clip animation loss' }))
    .getByRole('button', { name: 'Confirm Pattern replacement' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  const changed = useShowStore.getState().showV2Pilots[record.id]
  expect(changed.composition.clips[0].instanceId).not.toBe('instance')
  expect(changed.composition.propertyTracks.map(track => track.id)).toEqual(['lost'])
})

it('replacing a shared Clip leaves the other users\' instance and compiled member unchanged', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const { record, writes } = seed()
  const before = compiledMember(record)
  render(<Harness showId={record.id} />)
  await selectClip()
  const replace = screen.getByRole('region', { name: 'Replace Pattern' })
  fireEvent.focus(within(replace).getByRole('combobox', { name: 'Replacement Pattern' }))
  fireEvent.change(within(replace).getByRole('combobox', { name: 'Replacement Pattern' }), { target: { value: 'Other' } })
  fireEvent.click(within(replace).getByRole('option', { name: 'Other' }))
  fireEvent.click(within(replace).getByRole('button', { name: 'Replace Pattern' }))
  fireEvent.click(within(await screen.findByRole('group', { name: 'Confirm Clip animation loss' }))
    .getByRole('button', { name: 'Confirm Pattern replacement' }))
  await waitFor(() => expect(writes).toHaveLength(1))

  const changed = useShowStore.getState().showV2Pilots[record.id]
  expect(changed.composition.patternInstances[0]).toEqual(record.composition.patternInstances[0])
  expect(changed.composition.groupDefinitions).toEqual(record.composition.groupDefinitions)
  const reopened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(writes[0]))
  expect(reopened.status).toBe('opened')
  expect(compiledMember(writes[0])).toBe(before)
})

it('refused inspector edits leave the record, history and provider untouched', async () => {
  const { record, writes } = seed()
  render(<Harness showId={record.id} />)
  await selectClip()
  // Milliseconds are exact safe integers; a fractional start is refused whole.
  await commitNumber('Clip start', '100.5')
  expect(await screen.findByText(/safe integer milliseconds/)).toBeInTheDocument()
  expect(writes).toHaveLength(0)
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

it('moving and resizing a Clip adopt one history entry each through the temporal owner', async () => {
  const { record, writes } = seed()
  render(<Harness showId={record.id} />)
  await selectClip()
  await commitNumber('Clip start', '100')
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(useShowStore.getState().showV2Pilots[record.id].composition.clips[0].startMs).toBe(100)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])

  const moved = useShowStore.getState().showV2Pilots[record.id]
  await commitNumber('Clip duration', '300')
  await waitFor(() => expect(writes).toHaveLength(2))
  const resized = useShowStore.getState().showV2Pilots[record.id].composition.clips[0]
  expect([resized.startMs, resized.durationMs]).toEqual([100, 300])
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record, moved])
})

it('an appearance edit writes only the dirty field and leaves held Effects and view values alone', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const { record, writes } = seed()
  const authored = structuredClone(record.composition.clips[0].appearance.keys[0].value)
  render(<Harness showId={record.id} />)
  await selectClip()
  const appearance = screen.getByRole('region', { name: 'Clip appearance' })
  fireEvent.change(within(appearance).getByLabelText('Appearance scope'), { target: { value: 'whole-clip' } })
  fireEvent.change(within(appearance).getByLabelText('Clip opacity'), { target: { value: '0.5' } })
  fireEvent.click(within(appearance).getByRole('button', { name: 'Apply appearance' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  const held = useShowStore.getState().showV2Pilots[record.id].composition.clips[0].appearance.keys[0].value
  expect(held.opacity).toBe(0.5)
  expect(held.view).toEqual(authored.view)
  expect(held.effects).toEqual(authored.effects)
})

it('a Group occurrence selection is inspected through its Group, never edited as an ordinary Clip', async () => {
  const { record } = seed()
  function GroupHarness() {
    return (
      <ShowClipInspectorV2
        showId={record.id}
        binding={useShowV2EditCapture(record.id)}
        selection={{ kind: 'group', occurrenceId: 'occ-1' }}
      />
    )
  }
  render(<GroupHarness />)
  const panel = await screen.findByTestId('show-clip-inspector-v2')
  expect(panel).toHaveAttribute('data-show-selection-key', 'clip:occ-1:child')
  expect(panel).toHaveTextContent('This Clip belongs to a Group occurrence. Edit it through the Group.')
  expect(within(panel).queryByRole('region', { name: 'Replace Pattern' })).toBeNull()
  expect(within(panel).queryByLabelText('Clip start')).toBeNull()
  // The instance panel still counts every effective use, Group Clip uses included.
  expect(within(panel).getByRole('group', { name: 'Pattern instance' })).toHaveTextContent('Shared by 3 Clips')
  expect(within(panel).getAllByRole('listitem')).toHaveLength(3)
})

it('offers no Pattern instance write a Group-child selection cannot adopt', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const { record, writes } = seed()
  function GroupHarness() {
    return (
      <ShowClipInspectorV2
        showId={record.id}
        binding={useShowV2EditCapture(record.id)}
        selection={{ kind: 'group', occurrenceId: 'occ-1' }}
      />
    )
  }
  render(<GroupHarness />)
  const panel = await screen.findByTestId('show-clip-inspector-v2')

  // Every instance write names an ordinary Clip id. This selection resolves a
  // materialized Group Clip use, which those owners refuse, so the shared
  // runtime's values are reported here and edited through the Group.
  const values = within(panel).getByTestId('show-clip-instance-values')
  expect(values).toHaveTextContent('Edit this Pattern instance through its Group.')
  const fields = [...values.querySelectorAll<HTMLElement>('input, select, button')]
  expect(fields.length).toBeGreaterThan(0)
  for (const field of fields) expect(field).toBeDisabled()
  expect(within(panel).queryByLabelText('Stutter Pattern clock')).toBeNull()
  expect(within(panel).queryByRole('button', { name: 'Make Pattern Independent' })).toBeNull()
  expect(within(panel).queryByRole('button', { name: 'Rejoin Shared Pattern' })).toBeNull()

  // Nothing the panel still offers reaches a refusing owner.
  for (const control of within(panel).getAllByRole('button')) fireEvent.click(control)
  expect(writes).toHaveLength(0)
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

it('the entry policy control writes through the same owner update_clips uses', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const { record, writes } = seed()
  render(<Harness showId={record.id} />)
  await selectClip()
  expect(screen.getByLabelText('Clip entry policy')).toHaveValue('continue')

  fireEvent.change(screen.getByLabelText('Clip entry policy'), { target: { value: 'restart' } })
  await waitFor(() => expect(writes).toHaveLength(1))
  const adopted = useShowStore.getState().showV2Pilots[record.id]
  expect(adopted.composition.clips[0].entryPolicy).toBe('restart')
  // One authored flag, one history entry, nothing else moved.
  expect({ ...adopted, composition: { ...adopted.composition, clips: record.composition.clips } })
    .toEqual({ ...record, updatedAt: adopted.updatedAt })
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])

  const viaCommand = applyShowCommandV2(structuredClone(record), 'update_clips', {
    updates: [{ clip_id: 'clip', entry_policy: 'restart' }],
  })
  expect(viaCommand.status).toBe('changed')
  if (viaCommand.status !== 'changed') return
  expect({ ...adopted, updatedAt: 0 }).toEqual({ ...viaCommand.record, updatedAt: 0 })
})

it('re-selecting the authored entry policy is a no-op that writes nothing', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const { record, writes } = seed()
  render(<Harness showId={record.id} />)
  await selectClip()
  fireEvent.change(screen.getByLabelText('Clip entry policy'), { target: { value: 'continue' } })

  expect(await screen.findByText('Entry policy is unchanged.')).toBeInTheDocument()
  expect(writes).toHaveLength(0)
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

it('Pattern instance values write through the shared owner and every Clip use sees them', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const { record, writes } = seed()
  render(<Harness showId={record.id} />)
  await selectClip()
  // The panel warns that the write is shared before it is made.
  expect(screen.getByTestId('show-clip-instance-values'))
    .toHaveTextContent('These values affect all 3 Clip uses of this Pattern instance.')
  // Only the Pattern's declared sliders are offered, never the record's own map.
  expect(screen.getByLabelText('sliderGain')).toBeInTheDocument()
  expect(screen.queryByLabelText('sliderUndeclared')).toBeNull()

  await commitNumber('Animation speed', '0.5')
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(useShowStore.getState().showV2Pilots[record.id].composition.patternInstances[0].time.timeScale).toBe(0.5)

  fireEvent.click(screen.getByLabelText('Stutter Pattern clock'))
  await waitFor(() => expect(writes).toHaveLength(2))
  const stuttered = useShowStore.getState().showV2Pilots[record.id]
  expect(stuttered.composition.patternInstances[0].time.steppedClock).toEqual({ stepMs: 250 })

  const viaCommand = applyShowCommandV2(structuredClone(record), 'update_clips', {
    updates: [{ clip_id: 'clip', instance_properties: { time_scale: 0.5 } }],
  })
  expect(viaCommand.status).toBe('changed')
  if (viaCommand.status !== 'changed') return
  expect(writes[0].composition.patternInstances).toEqual(viaCommand.record.composition.patternInstances)
})

function compiledMember(record: ShowRecordV2): string {
  const capture = captureShowStageEditV2(record, {
    patterns: usePatternStore.getState().userPatterns,
    maps: [],
    libraries: [],
    profiles: [],
    stageMap: null,
  })
  if (capture.prepared.status !== 'ready') throw Error(`prepare: ${JSON.stringify(capture.prepared)}`)
  const artifact = capture.prepared.bundle.artifact
  const exported = buildShowEpeExportV2(record, artifact.code, { stampedAt: '2026-09-16T00:00:00Z' })
  if (exported.status !== 'exported') throw Error(exported.message)
  const epe = parseEpe(exported.text)
  const inventory = buildDeliveredShowSourceInventory(artifact.summary.sourceInventory, artifact.code, epe.src)
  const bytes = new TextEncoder().encode(epe.src)
  const member = inventory.chunks
    .filter(chunk => chunk.ownerId === 'instance' && chunk.patternPart === 'compiled-pattern')
    .map(chunk => new TextDecoder().decode(bytes.slice(chunk.startByte, chunk.endByte)))
    .join('')
  const aliases = new Map<string, string>()
  return member.replace(/\b__pxlblz_[A-Za-z0-9_$]+\b/g, name => {
    if (!aliases.has(name)) aliases.set(name, `private_${aliases.size}`)
    return aliases.get(name)!
  })
}
