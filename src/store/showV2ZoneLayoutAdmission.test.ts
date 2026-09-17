import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as stage from '../engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { commandFixtureV2 } from '../engine/showCommandsV2/fixtures'
import { validateShowRecordV2, type ShowRecordV2 } from '../engine/showCompositionV2'
import { createShowV2WithOutputContract } from '../engine/showCreationV2'
import { createInstallationShowOutputContract } from '../engine/showOutputContract'
import { showInitialState, useShowStore } from './showStore'
import {
  admitShowV2PilotLayoutDefinitionEdit,
  admitShowV2PilotZoneEdit,
} from './showV2PreparedEditAdmission'

/**
 * Adoption for the Zone and Zone Layout definition owners (#1039): one accepted
 * edit is one prepared candidate, one history entry and one save; a malformed
 * intent never reaches preparation; an owner refusal and a true no-op write
 * nothing and keep the open record identity; Undo restores the preimage.
 */
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

function setup() {
  const record = commandFixtureV2()
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  record.composition.layers.push({ id: 'right-base', zoneId: 'right', name: 'Base', rank: 0 })
  record.composition.clips.push({
    ...structuredClone(record.composition.clips[0]),
    id: 'clip-right',
    zoneId: 'right',
    layerId: 'right-base',
    startMs: 0,
    durationMs: 10_000,
    appearance: { keys: [{ ...structuredClone(record.composition.clips[0].appearance.keys[0]), id: 'clip-right:key', timeMs: 0 }] },
  })
  record.zoneLayouts[1].logical = { kind: 'stripes', axis: 'y', zoneIds: ['left', 'right'] }
  expect(validateShowRecordV2(record)).toEqual([])
  const dependencies = {
    patterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(1,0,0)}', controls: {}, updatedAt: 1 }],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'zone-test', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const context = () => {
    const current = useShowStore.getState().showV2Pilots[record.id]
    const provider = getPersonalContentProvider()
    return {
      showId: record.id,
      baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
      capture: { record: current, dependencies, prepared: stage.prepareShowStageV2(current, dependencies) },
      isCurrent: () => getPersonalContentProvider() === provider,
      onAdopted: vi.fn(),
    }
  }
  return { record, context, write, saved: () => saved, dependencies }
}

function noEffects(result: object): void {
  for (const [key, value] of Object.entries(result)) {
    if (key.startsWith('affected') || key === 'removedIds') expect(value, key).toEqual([])
  }
}

it('adds a Zone with one preparation, one history entry and one save, then Undo restores it', async () => {
  const { record, context, write, saved, dependencies } = setup()
  const before = structuredClone(record)
  const captured = context()
  const prepare = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    const outcome = await admitShowV2PilotZoneEdit({
      ...captured,
      intent: { kind: 'add', zone: { id: 'spare', name: 'Spare', nominalPixelCount: 8, color: '#22c55e' } },
    })
    expect(outcome).toMatchObject({
      status: 'applied',
      settlement: 'saved',
      affectedZoneIds: ['spare'],
      affectedLayoutDefinitionIds: ['both', 'left-only'],
      removedIds: [],
    })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(record).toEqual(before)
    expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([before])
    expect(saved().zones.map(zone => zone.id)).toEqual(['left', 'right', 'spare'])
    // Every definition routes the new Zone, so the saved record still prepares.
    expect(stage.prepareShowStageV2(saved(), dependencies).status).toBe('ready')
  } finally { prepare.mockRestore() }

  expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true)
  // The store stamps its own `updatedAt`; everything the edit wrote is restored.
  const { updatedAt: _undone, ...restored } = useShowStore.getState().showV2Pilots[record.id]
  const { updatedAt: _original, ...preimage } = before
  expect(restored).toEqual(preimage)
  expect(saved().zones.map(zone => zone.id)).toEqual(['left', 'right'])
  expect(await useShowStore.getState().redoShowV2Pilot(record.id)).toBe(true)
  expect(saved().zones.map(zone => zone.id)).toEqual(['left', 'right', 'spare'])
})

/**
 * The fresh Show is the case #1063 unblocked: two Clips joined by a Crossfade,
 * sampling `independent`. Until the continuous-flat route carried a participant
 * Transition in a multi-Zone Show, this admission refused the edit outright
 * because the resulting record could no longer prepare.
 */
it('adds a Zone to a fresh Show and keeps it preparing', async () => {
  const record = createShowV2WithOutputContract('fresh', 'Fresh Show', createInstallationShowOutputContract({ outputMapId: null, pixelCount: 60 }), 1)
  const dependencies: stage.ShowPreparedStageDependenciesV2 = { patterns: [], maps: [], libraries: [], profiles: [], stageMap: null }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'fresh-zone-test', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  expect(stage.prepareShowStageV2(record, dependencies).status).toBe('ready')

  const outcome = await admitShowV2PilotZoneEdit({
    showId: record.id,
    baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
    capture: stage.captureShowStageEditV2(record, dependencies),
    isCurrent: () => true,
    onAdopted: vi.fn(),
    intent: { kind: 'add', zone: { id: 'zone-2', name: 'zone-2', nominalPixelCount: 60, color: '#22d3ee' } },
  })

  expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved', affectedZoneIds: ['zone-2'] })
  expect(write).toHaveBeenCalledTimes(1)
  expect(saved.zones.map(zone => zone.id)).toEqual(['zone-1', 'zone-2'])
  const prepared = stage.prepareShowStageV2(saved, dependencies)
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(prepared.bundle.provenance.route).toBe('continuous-flat')
})

it('removes a Zone with its Layers, Clips and tracks in one save', async () => {
  const { context, write, saved } = setup()
  const outcome = await admitShowV2PilotZoneEdit({ ...context(), intent: { kind: 'remove', zoneId: 'left' } })
  expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved', affectedZoneIds: ['left'], affectedLayerIds: ['base', 'over'] })
  expect(write).toHaveBeenCalledTimes(1)
  expect(saved().zones.map(zone => zone.id)).toEqual(['right'])
  expect(saved().composition.clips.map(clip => clip.id)).toEqual(['clip-right'])
  expect(saved().composition.propertyTracks).toEqual([])
})

const malformedZoneIntents = [
  null, {}, [], { kind: 'unknown' }, { kind: 'add' }, { kind: 'add', zone: null },
  { kind: 'add', zone: { id: 'spare', name: 'Spare', nominalPixelCount: 8 }, extra: 1 },
  { kind: 'add', zone: { id: 'spare', name: 'Spare', nominalPixelCount: 0 } },
  { kind: 'add', zone: { id: 'spare', name: 'Spare', nominalPixelCount: 8, rank: 2 } },
  { kind: 'add', zone: { id: ' ', name: 'Spare', nominalPixelCount: 8 } },
  { kind: 'remove' }, { kind: 'remove', zoneId: '' }, { kind: 'remove', zoneId: 'left', hidden: true },
  { kind: 'remove', zoneId: 'left', clipRemovals: null },
  { kind: 'remove', zoneId: 'left', clipRemovals: [{ clipId: 'clip-a' }] },
  { kind: 'remove', zoneId: 'left', clipRemovals: [{ clipId: 'clip-a', propertyRampProjections: [{ transitionId: 't' }] }] },
]
it.each(malformedZoneIntents.map((intent, index) => ({ intent, index })))(
  'refuses malformed runtime Zone intent $index before preparation or adoption',
  async ({ intent }) => {
    const { record, context, write } = setup()
    const captured = context()
    const prepare = vi.spyOn(stage, 'prepareShowStageV2')
    try {
      const outcome = await admitShowV2PilotZoneEdit({ ...captured, intent: intent as never })
      expect(outcome).toMatchObject({ status: 'refused', source: 'owner', code: 'invalid-request' })
      noEffects(outcome)
      expect(prepare).not.toHaveBeenCalled()
      expect(write).not.toHaveBeenCalled()
      expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
      expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
    } finally { prepare.mockRestore() }
  },
)

it('keeps an owner refusal and a true no-op free of history, save and identity change', async () => {
  const { record, context, write } = setup()
  const refused = await admitShowV2PilotZoneEdit({
    ...context(),
    intent: { kind: 'add', zone: { id: 'spare', name: 'Left', nominalPixelCount: 8 } },
  })
  expect(refused).toMatchObject({ status: 'refused', source: 'owner', code: 'duplicate-name' })
  noEffects(refused)
  const unchanged = await admitShowV2PilotLayoutDefinitionEdit({
    ...context(),
    intent: { kind: 'rename', layoutId: 'both', name: 'Both' },
  })
  expect(unchanged.status).toBe('unchanged')
  noEffects(unchanged)
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

it('adds a Zone Layout definition and writes its routing operator in one save each', async () => {
  const { record, context, write, saved } = setup()
  const added = await admitShowV2PilotLayoutDefinitionEdit({
    ...context(),
    intent: { kind: 'add', layoutId: 'wide', name: 'Wide stripes' },
  })
  expect(added).toMatchObject({ status: 'applied', settlement: 'saved', affectedLayoutDefinitionIds: ['wide'] })
  expect(saved().zoneLayouts.map(layout => layout.id)).toEqual(['both', 'left-only', 'wide'])

  const routed = await admitShowV2PilotLayoutDefinitionEdit({
    ...context(),
    intent: { kind: 'set-routing', layoutId: 'wide', logical: { kind: 'stripes', axis: 'y', zoneIds: ['right', 'left'] } },
  })
  expect(routed).toMatchObject({ status: 'applied', settlement: 'saved', affectedLayoutDefinitionIds: ['wide'] })
  expect(saved().zoneLayouts[2].logical).toEqual({ kind: 'stripes', axis: 'y', zoneIds: ['right', 'left'] })
  expect(write).toHaveBeenCalledTimes(2)
  expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(2)
})

const malformedDefinitionIntents = [
  null, {}, [], { kind: 'add' }, { kind: 'add', layoutId: 'wide' }, { kind: 'add', layoutId: 'wide', name: ' ' },
  { kind: 'add', layoutId: 'wide', name: 'Wide', sourceLayoutId: 'both' },
  { kind: 'duplicate', layoutId: 'wide', name: 'Wide' },
  { kind: 'rename', layoutId: 'both' }, { kind: 'remove', layoutId: 'both', hidden: true },
  { kind: 'set-routing', layoutId: 'both' },
  { kind: 'set-routing', layoutId: 'both', logical: { kind: 'single' } },
  { kind: 'set-routing', layoutId: 'both', logical: { kind: '', zoneIds: ['left'] } },
  { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'left' },
  { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'left', ranges: [{ start: 0 }] },
  { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'left', ranges: [{ start: -1, end: 4 }] },
  { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'left', ranges: [{ start: 0, end: 1.5 }] },
]
it.each(malformedDefinitionIntents.map((intent, index) => ({ intent, index })))(
  'refuses malformed runtime Zone Layout intent $index before preparation or adoption',
  async ({ intent }) => {
    const { record, context, write } = setup()
    const captured = context()
    const prepare = vi.spyOn(stage, 'prepareShowStageV2')
    try {
      const outcome = await admitShowV2PilotLayoutDefinitionEdit({ ...captured, intent: intent as never })
      expect(outcome).toMatchObject({ status: 'refused', source: 'owner', code: 'invalid-request' })
      noEffects(outcome)
      expect(prepare).not.toHaveBeenCalled()
      expect(write).not.toHaveBeenCalled()
      expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
    } finally { prepare.mockRestore() }
  },
)

it('refuses a stale Zone edit against a moved revision', async () => {
  const { record, context, write } = setup()
  const captured = context()
  await useShowStore.getState().updateShowV2Pilot(record.id, { ...structuredClone(record), name: 'Moved' })
  write.mockClear()
  const outcome = await admitShowV2PilotZoneEdit({
    ...captured,
    intent: { kind: 'add', zone: { id: 'spare', name: 'Spare', nominalPixelCount: 8 } },
  })
  expect(outcome).toMatchObject({ status: 'refused', source: 'admission', code: 'stale-edit' })
  noEffects(outcome)
  expect(write).not.toHaveBeenCalled()
})
