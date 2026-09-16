import { expect, it } from 'vitest'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { buildShowV2LayerEditorModel, createShowV2LayerAtTopIntent } from './showV2LayerEditorModel'
import { reorderShowV2LayerIntent } from './showV2LayerEditorModel'
import { layerReferences } from './showLayersV2'

it('keeps empty named Layers visible and creates explicit top rank without normalizing sparse ranks', () => {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw Error('fixture')
  const record = converted.record
  const zoneId = record.zones[0].id
  record.composition.layers = [{ id: 'bottom', zoneId, name: 'Bottom', rank: 3 }, { id: 'empty', zoneId, name: 'Empty', rank: 8 }]
  record.composition.clips = []; record.composition.transitions = []
  const before = structuredClone(record)
  expect(buildShowV2LayerEditorModel(record).layers.map(layer => [layer.id, layer.name, layer.references.length])).toEqual([['bottom', 'Bottom', 0], ['empty', 'Empty', 0]])
  expect(createShowV2LayerAtTopIntent(record, zoneId, 'Top', () => 'fresh')).toEqual({ status: 'ready', intent: { kind: 'add', layer: { id: 'fresh', zoneId, name: 'Top', rank: 9 } } })
  expect(record).toEqual(before)
})

it('orders Zone Layers by rank and submits complete adjacent stacking order without touching other Zones', () => {
  const c = convertShowRecordV1ToV2(convertibleV1Show()); if (c.status !== 'converted') throw Error('fixture')
  const record = c.record, zoneId = record.zones[0].id
  record.composition.layers = [{ id: 'top', zoneId, name: 'Top', rank: 9 }, { id: 'other', zoneId: 'other-zone', name: 'Other', rank: 0 }, { id: 'bottom', zoneId, name: 'Bottom', rank: 3 }]
  expect(reorderShowV2LayerIntent(record, 'bottom', 'up')).toEqual({ kind: 'reorder', zoneId, layerIds: ['top', 'bottom'] })
  expect(reorderShowV2LayerIntent(record, 'top', 'down')).toEqual({ kind: 'reorder', zoneId, layerIds: ['top', 'bottom'] })
  expect(reorderShowV2LayerIntent(record, 'bottom', 'down')).toBeNull(); expect(reorderShowV2LayerIntent(record, 'missing', 'up')).toBeNull()
})
it.each(['collision', 'blank', 'overflow', 'no-zone', 'no-name', 'empty-zone'])('checks top Layer allocation partition%s once without retry', partition => {
  const c = convertShowRecordV1ToV2(convertibleV1Show()); if (c.status !== 'converted') throw Error('fixture')
  const record = c.record, zoneId = record.zones[0].id
  if (partition === 'overflow') record.composition.layers[0].rank = Number.MAX_SAFE_INTEGER
  if (partition === 'empty-zone') record.composition.layers = []
  let calls = 0
  const result = createShowV2LayerAtTopIntent(record, partition === 'no-zone' ? 'absent' : zoneId, partition === 'no-name' ? ' ' : 'Named', () => { calls++; return partition === 'collision' ? record.composition.layers[0].id : partition === 'blank' ? ' ' : 'fresh' })
  expect(result.status).toBe(partition === 'empty-zone' ? 'ready' : 'refused')
  expect(calls).toBe(['overflow', 'no-zone', 'no-name'].includes(partition) ? 0 : 1)
  if (result.status === 'ready') expect(result.intent.layer.rank).toBe(0)
})
it('projects the same complete authored reference namespace as removal, retaining unused Group slots and tuple identities', () => {
  const c = convertShowRecordV1ToV2(convertibleV1Show()); if (c.status !== 'converted') throw Error('fixture')
  const record = c.record, id = record.composition.layers[0].id
  record.composition.groupOccurrences = [{ id: 'a:b', definitionId: 'unneeded-for-projection', layoutOccurrenceId: 'layout', zoneId: 'zone', startMs: 0, translationX: 0, translationY: 0, holds: [], layerBindings: [{ definitionLayerId: 'c', layerId: id }] }, { id: 'a', definitionId: 'unneeded-for-projection', layoutOccurrenceId: 'layout', zoneId: 'zone', startMs: 0, translationX: 0, translationY: 0, holds: [], layerBindings: [{ definitionLayerId: 'b:c', layerId: id }] }]
  const refs = buildShowV2LayerEditorModel(record).layers.find(layer => layer.id === id)!.references
  expect(refs).toEqual(layerReferences(record, id)); expect(new Set(refs.map(ref => ref.key)).size).toBe(3)
  expect(refs.filter(ref => ref.kind === 'group-layer-binding')).toMatchObject([{ groupOccurrenceId: 'a:b', definitionLayerId: 'c' }, { groupOccurrenceId: 'a', definitionLayerId: 'b:c' }])
  refs[0].key = 'mutated'; expect(layerReferences(record, id)[0].key).not.toBe('mutated')
})
