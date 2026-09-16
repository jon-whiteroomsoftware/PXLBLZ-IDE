import { expect, it, vi } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { buildShowV2AppearanceEditorModel, createShowV2AppearanceTarget, appearancePatchFromDirtyFields } from './showV2AppearanceEditorModel'

function fixture() {
  const c = convertShowRecordV1ToV2(convertibleV1Show()); if (c.status !== 'converted') throw Error('fixture')
  const clip = c.record.composition.clips[0]
  const first = clip.appearance.keys[0]
  clip.appearance.keys = [0, 400].map((timeMs, index) => ({ id: `key-${index}`, timeMs,
    value: { ...structuredClone(first.value), opacity: index ? .8 : .2,
      view: { mirror: Boolean(index), brightness: index ? .7 : .3, phase: .1 },
      effects: [{ id: 'hue', kind: 'hue' as const, turns: index ? .4 : .2 }] } }))
  return { record: c.record, clip }
}
it('reports mixed authored values and submits only independently dirty fields', () => {
  const { record, clip } = fixture(), before = structuredClone(record)
  const model = buildShowV2AppearanceEditorModel(record, clip.id, 'whole-clip')
  expect(model?.fields.opacity).toEqual({ kind: 'mixed' })
  expect(model?.fields.mirror).toEqual({ kind: 'mixed' })
  expect(model?.fields.phase).toEqual({ kind: 'uniform', value: .1 })
  expect(model?.effects[0].parameters[0].value).toEqual({ kind: 'mixed' })
  expect(appearancePatchFromDirtyFields({ brightness: '.5' })).toEqual({ view: { brightness: .5 } })
  expect(record).toEqual(before)
})
it('retains exact existing keys and allocates one fresh interior key at submission only', () => {
  const { record, clip } = fixture(), allocate = vi.fn(() => 'fresh')
  expect(createShowV2AppearanceTarget(record, clip.id, 'whole-clip', '', allocate)).toEqual({ status: 'ready', target: { clipId: clip.id, scope: 'whole-clip' } })
  expect(createShowV2AppearanceTarget(record, clip.id, 'selected-time', '400', allocate)).toEqual({ status: 'ready', target: { clipId: clip.id, scope: 'selected-time', atMs: 400, keyIdentity: { kind: 'retain', appearanceKeyId: 'key-1' } } })
  expect(allocate).not.toHaveBeenCalled()
  expect(createShowV2AppearanceTarget(record, clip.id, 'selected-time', '200', allocate)).toMatchObject({ status: 'ready', target: { keyIdentity: { kind: 'insert', appearanceKeyId: 'fresh' } } })
  expect(allocate).toHaveBeenCalledTimes(1)
  expect(buildShowV2AppearanceEditorModel(record, clip.id, 'selected-time', 200)?.fields.opacity).toEqual({ kind: 'uniform', value: .2 })
})
it.each(['', '-1', '1000', '1001', '.5', 'NaN'])('refuses out-of-bar or malformed explicit time %s without allocation', at => {
  const { record, clip } = fixture(), allocate = vi.fn()
  expect(createShowV2AppearanceTarget(record, clip.id, 'selected-time', at, allocate).status).toBe('refused')
  expect(allocate).not.toHaveBeenCalled()
})
it('requires exact common Effect identity/kind across whole scope and exposes span-local selected values', () => {
  const { record, clip } = fixture()
  clip.appearance.keys[1].value.effects = [{ id: 'other', kind: 'hue', turns: .9 }]
  expect(buildShowV2AppearanceEditorModel(record, clip.id, 'whole-clip')?.effects).toEqual([])
  expect(buildShowV2AppearanceEditorModel(record, clip.id, 'selected-time', 400)?.effects[0].effect.id).toBe('other')
})
it('does not coerce empty drafts to zero and refuses colliding fresh key without retry', () => {
  const { record, clip } = fixture(), allocate = vi.fn(() => 'key-0')
  expect(appearancePatchFromDirtyFields({ opacity: '' }).opacity).toBeNaN()
  expect(createShowV2AppearanceTarget(record, clip.id, 'selected-time', '200', allocate).status).toBe('refused')
  expect(allocate).toHaveBeenCalledTimes(1)
})
