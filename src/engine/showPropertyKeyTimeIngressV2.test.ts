import { expect, it } from 'vitest'
import { propertyEditGroupRecord, propertyEditRecord, propertyEditTrack } from '../test/showV2PropertyEditsFixture'
import { editShowPropertyV2, type ShowPropertyEditIntentV2, type ShowPropertyTrackOwnerV2 } from './showPropertyEditsV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
const malformed = [500n, '500', null, {}, [], true, NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, undefined]
function fixture(scope: 'show' | 'group'): { record: ShowRecordV2; owner: ShowPropertyTrackOwnerV2 } {
  const record = scope === 'show' ? propertyEditRecord() : propertyEditGroupRecord()
  const track = propertyEditTrack(scope === 'show' ? undefined : { kind: 'clip-view', clipId: 'child', property: 'brightness' })
  track.keyframes[0].timeMs = 100; track.keyframes[1].timeMs = scope === 'show' ? 900 : 300
  if (scope === 'show') record.composition.propertyTracks = [track]
  else { track.activeDurationMs = 400; record.composition.groupDefinitions[0].propertyTracks = [track] }
  return { record, owner: scope === 'show' ? { kind: 'show' } : { kind: 'group-definition', definitionId: 'definition' } }
}
it.each((['show', 'group'] as const).flatMap(scope => (['add', 'update'] as const).flatMap(operation => malformed.map((timeMs, index) => ({ scope, operation, timeMs, index })))))('refuses malformed time class$index before $operation arithmetic in $scope owner', ({ scope, operation, timeMs }) => {
  const { record, owner } = fixture(scope); const before = structuredClone(record)
  const intent = operation === 'add' ? { kind: 'add-key', trackId: 'animation', key: { id: 'new', timeMs, value: 0.5, easing: { curve: 'linear' } } } : { kind: 'update-key', trackId: 'animation', keyId: 'left', patch: { timeMs } }
  const result = editShowPropertyV2(record, owner, intent as ShowPropertyEditIntentV2)
  expect(result.status).toBe('refused'); if (result.status !== 'refused') throw Error('Refusal')
  expect(result.code).toBe('invalid-intent'); expect(result.record).toBe(record); expect(record).toEqual(before)
  for (const [name, values] of Object.entries(result)) if (name.startsWith('affected') || name === 'removedIds' || name === 'discardedControlTargets') expect(values).toEqual([])
})
it.each(['show', 'group'] as const)('accepts exact safe zero/end times without rounding; native reopen and equal setter no-op (%s)', scope => {
  const { record, owner } = fixture(scope); const end = scope === 'show' ? 1000 : 400
  const first = editShowPropertyV2(record, owner, { kind: 'add-key', trackId: 'animation', key: { id: 'zero', timeMs: 0, value: 0.25, easing: { curve: 'linear' } } }); expect(first.status).toBe('changed')
  const last = editShowPropertyV2(first.record, owner, { kind: 'add-key', trackId: 'animation', key: { id: 'end', timeMs: end, value: 0.75, easing: { curve: 'linear' } } }); expect(last.status).toBe('changed')
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(last.record)); expect(opened.status).toBe('opened')
  const equal = editShowPropertyV2(last.record, owner, { kind: 'update-key', trackId: 'animation', keyId: 'zero', patch: { timeMs: 0 } }); expect(equal.status).toBe('unchanged'); expect(equal.record).toBe(last.record); expect(equal.affectedPropertyKeyIds).toEqual([])
  const moved = editShowPropertyV2(last.record, owner, { kind: 'update-key', trackId: 'animation', keyId: 'left', patch: { timeMs: 125 } }); expect(moved.status).toBe('changed'); expect(moved.affectedPropertyKeyIds).toEqual(['left'])
})
