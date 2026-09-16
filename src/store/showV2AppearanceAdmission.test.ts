import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { prepareShowStageV2 } from '../engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotAppearanceEdit } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import type { ShowClipAppearanceEditIntentV2 } from '../engine/showClipAppearanceEditsV2'
import * as appearanceOwner from '../engine/showClipAppearanceEditsV2'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())
function setup() {
  const c = convertShowRecordV1ToV2(convertibleV1Show()); if (c.status !== 'converted') throw Error('fixture')
  const record = c.record; record.composition.transitions = []; record.composition.clips = record.composition.clips.slice(0, 1)
  record.composition.clips[0].appearance.keys[0].value.effects = []
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  const dependencies = { patterns: [{ id: 'voice', name: 'Voice', src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(x,y,elapsed/2000)}', controls: {}, updatedAt: 1 }], maps: [], libraries: [], profiles: [], stageMap: null }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'appearance', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const context = () => {
    const current = useShowStore.getState().showV2Pilots[record.id], provider = getPersonalContentProvider()
    return { showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
      capture: { record: current, dependencies, prepared: prepareShowStageV2(current, dependencies) },
      isCurrent: () => getPersonalContentProvider() === provider, onAdopted: vi.fn() }
  }
  return { record, write, context, saved: () => saved }
}
const collectionNames = ['affectedClipIds', 'affectedInstanceIds', 'affectedTransitionIds', 'affectedTrackIds',
  'affectedLayoutDefinitionIds', 'affectedLayoutOccurrenceIds', 'affectedGroupDefinitionIds', 'affectedGroupOccurrenceIds',
  'affectedLayerIds', 'affectedMarkerIds', 'affectedAppearanceKeyIds', 'affectedPropertyKeyIds', 'removedIds', 'discardedControlTargets']
function emptyEffects(result: object) {
  for (const name of collectionNames) expect(result).toHaveProperty(name, [])
}
it('adopts a complete held-key edit once with exactly fourteen affected collections and one history/save', async () => {
  const { record, context, write, saved } = setup(), clip = record.composition.clips[0], before = structuredClone(record)
  const result = await admitShowV2PilotAppearanceEdit({ ...context(), intent: { kind: 'appearance', clipId: clip.id,
    scope: 'selected-time', atMs: 200, keyIdentity: { kind: 'insert', appearanceKeyId: 'new-key' }, patch: { view: { brightness: .5 } } } })
  expect(result).toMatchObject({ status: 'applied', settlement: 'saved', affectedClipIds: [clip.id], affectedAppearanceKeyIds: ['new-key'] })
  expect(Object.keys(result).filter(key => key.startsWith('affected') || ['removedIds', 'discardedControlTargets'].includes(key))).toEqual(collectionNames)
  expect(write).toHaveBeenCalledTimes(1); expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([before])
  const expected = structuredClone(clip.appearance.keys[0]); expected.id = 'new-key'; expected.timeMs = 200; expected.value.view.brightness = .5
  expect(saved().composition.clips[0].appearance.keys).toEqual([clip.appearance.keys[0], expected])
  expect(record).toEqual(before)
})
it.each([null, {}, [], { kind: 'remove-effect', clipId: 'clip', scope: 'whole-clip' },
  { kind: 'appearance', clipId: 'clip', scope: 'implicit', patch: {} },
  { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: {}, extra: true },
  { kind: 'appearance', clipId: 'clip', scope: 'selected-time', atMs: 200, keyIdentity: { kind: 'insert', appearanceKeyId: 'new', extra: true }, patch: {} },
  { kind: 'duplicate-effect', clipId: 'clip', scope: 'whole-clip', effectId: '', effectKind: 'hue', newEffectId: 'new' },
  { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { opacity: NaN } },
  { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { opacity: 2 } },
].map((intent, index) => ({ intent, index })))('refuses malformed runtime intent $index atomically', async ({ intent }) => {
  const { record, context, write } = setup(), before = structuredClone(record)
  const result = await admitShowV2PilotAppearanceEdit({ ...context(), intent: intent as never })
  expect(result.status).toBe('refused'); emptyEffects(result)
  expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([]); expect(record).toEqual(before)
})
it('retains true no-op identity without writes/history or an inserted redundant key', async () => {
  const { record, context, write } = setup(), clip = record.composition.clips[0]
  const result = await admitShowV2PilotAppearanceEdit({ ...context(), intent: { kind: 'appearance', clipId: clip.id,
    scope: 'selected-time', atMs: 200, keyIdentity: { kind: 'insert', appearanceKeyId: 'unused' }, patch: { opacity: clip.appearance.keys[0].value.opacity } } })
  expect(result.status).toBe('unchanged'); emptyEffects(result)
  expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})

it('rejects a non-authorized operation shape before typed owner dispatch, while numeric descriptor checks stay in the owner', async () => {
  const { context, write } = setup(), owner = vi.spyOn(appearanceOwner, 'editShowClipAppearanceV2')
  try {
    const unknown = await admitShowV2PilotAppearanceEdit({ ...context(), intent: { kind: 'remove-effect', clipId: 'clip', scope: 'whole-clip', effectId: 'hue' } as never })
    expect(unknown.status).toBe('refused'); expect(owner).not.toHaveBeenCalled()
    const numeric = await admitShowV2PilotAppearanceEdit({ ...context(), intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { opacity: NaN } } })
    expect(numeric.status).toBe('refused'); expect(owner).toHaveBeenCalledTimes(1); expect(write).not.toHaveBeenCalled()
  } finally { owner.mockRestore() }
})
it.each(['record', 'revision', 'provider', 'lifetime'] as const)('refuses stale %s capture without side effects', async partition => {
  const { record, context, write } = setup(), capture = context()
  if (partition === 'record') useShowStore.setState({ showV2Pilots: { [record.id]: structuredClone(record) } })
  if (partition === 'revision') useShowStore.setState({ showRevisions: { [record.id]: 1 } })
  if (partition === 'provider') setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'other' })
  if (partition === 'lifetime') capture.isCurrent = () => false
  const result = await admitShowV2PilotAppearanceEdit({ ...capture, intent: { kind: 'appearance', clipId: 'clip', scope: 'whole-clip', patch: { opacity: .5 } } })
  expect(result).toMatchObject({ status: 'refused', code: 'stale-edit' }); emptyEffects(result); expect(write).not.toHaveBeenCalled()
})
it('delegates each Effect operation once and refuses unsupported held opposite-order output before adoption', async () => {
  const { record, context, write, saved } = setup(), clipId = record.composition.clips[0].id
  const submit = (fields: object) => admitShowV2PilotAppearanceEdit({ ...context(), intent: { clipId, scope: 'whole-clip', ...fields } as ShowClipAppearanceEditIntentV2 })
  expect((await submit({ kind: 'add-effect', effect: { id: 'hue', kind: 'hue', turns: .1 } })).status).toBe('applied')
  expect((await submit({ kind: 'update-effect', effectId: 'hue', effectKind: 'hue', parameter: 'turns', value: .2 })).status).toBe('applied')
  expect((await submit({ kind: 'duplicate-effect', effectId: 'hue', effectKind: 'hue', newEffectId: 'hue-copy' })).status).toBe('applied')
  expect((await submit({ kind: 'reorder-effect', effectId: 'hue-copy', effectKind: 'hue', targetEffectId: 'hue', targetEffectKind: 'hue', edge: 'before' })).status).toBe('applied')
  expect(write).toHaveBeenCalledTimes(4)
  expect(saved().composition.clips[0].appearance.keys[0].value.effects?.map(effect => effect.id)).toEqual(['hue-copy', 'hue'])
  const current = useShowStore.getState().showV2Pilots[record.id]
  current.composition.clips[0].appearance.keys[0].value.effects = [{ id: 'hue', kind: 'hue', turns: .2 }, { id: 'invert', kind: 'invert', amount: .4 }]
  const captured = context(); expect(captured.capture.prepared.status).toBe('ready')
  const outcome = await admitShowV2PilotAppearanceEdit({ ...captured, intent: { kind: 'reorder-effect', clipId,
    scope: 'selected-time', atMs: 200, keyIdentity: { kind: 'insert', appearanceKeyId: 'opposite-key' }, effectId: 'invert', effectKind: 'invert', targetEffectId: 'hue', targetEffectKind: 'hue', edge: 'before' } })
  expect(outcome).toMatchObject({ status: 'refused', source: 'admission', code: 'unsupported-pilot-record' }); emptyEffects(outcome)
  expect(write).toHaveBeenCalledTimes(4); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(current)
})
