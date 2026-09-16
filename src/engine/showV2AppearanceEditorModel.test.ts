import { expect, it, vi } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { buildShowV2AppearanceEditorModel, createShowV2AppearanceTarget, appearancePatchFromDirtyFields, appearanceRemovalPatch,
  SHOW_V2_APPEARANCE_COMPONENT_FIELDS, SHOW_V2_APPEARANCE_REMOVALS, type ShowV2AppearanceDirtyFields } from './showV2AppearanceEditorModel'
import { editShowClipAppearanceV2 } from './showClipAppearanceEditsV2'

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
  expect(appearancePatchFromDirtyFields({ brightness: '.5' }, model!.fields)).toEqual({ view: { brightness: .5 } })
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
  const fields = buildShowV2AppearanceEditorModel(record, clip.id, 'whole-clip')!.fields
  expect(appearancePatchFromDirtyFields({ opacity: '' }, fields).opacity).toBeNaN()
  expect(createShowV2AppearanceTarget(record, clip.id, 'selected-time', '200', allocate).status).toBe('refused')
  expect(allocate).toHaveBeenCalledTimes(1)
})

it.each(['shadowR','shadowG','shadowB','highlightR','highlightG','highlightB'] as const)('compares exact authored %s before lossy hex display', channel => {
 const prefix=channel.startsWith('shadow')?'shadow':'highlight'
 const {record,clip}=fixture()
 for(const [index,key] of clip.appearance.keys.entries())key.value.effects=[{id:'map',kind:'color-map',amount:1,shadowR:.1,shadowG:.2,shadowB:.3,highlightR:.1,highlightG:.2,highlightB:.3,...{[channel]:index ? (channel.endsWith('R') ? .101 : channel.endsWith('G') ? .201 : .301) : (channel.endsWith('R') ? .1 : channel.endsWith('G') ? .2 : .3)}}]
 const model=buildShowV2AppearanceEditorModel(record,clip.id,'whole-clip')
 expect(model?.effects[0].parameters.find(p=>p.descriptor.id===`${prefix}Color`)?.value).toEqual({kind:'mixed'})
 const selected=buildShowV2AppearanceEditorModel(record,clip.id,'selected-time',400)
 expect(selected?.effects[0].parameters.find(p=>p.descriptor.id===`${prefix}Color`)?.value.kind).toBe('uniform')
 expect(clip.appearance.keys[1].value.effects?.[0]).toHaveProperty(channel,channel.endsWith('R') ? .101 : channel.endsWith('G') ? .201 : .301)
})

it('reads absent and mixed optional components without substituting defaults', () => {
  const { record, clip } = fixture()
  clip.appearance.keys[0].value.transform = { positionX: .1, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
  clip.appearance.keys[0].value.aperture = { enabled: true, x: 0, y: 0, width: .8, height: 1, aperture: 'star', starPoints: 5 }
  clip.appearance.keys[0].value.presentation = { mode: 'strobe', cadenceMs: 120 }
  clip.appearance.keys[1].value.presentation = { mode: 'strobe', cadenceMs: 120 }
  clip.appearance.keys[0].value.blink = { rateHz: 2, duty: .5, phase: .1 }
  const whole = buildShowV2AppearanceEditorModel(record, clip.id, 'whole-clip')!.fields
  expect(whole['transform.positionX']).toEqual({ kind: 'mixed' })
  expect(whole['aperture.aperture']).toEqual({ kind: 'mixed' })
  expect(whole['aperture.ringWidth']).toEqual({ kind: 'uniform', value: undefined })
  expect(whole['presentation.mode']).toEqual({ kind: 'uniform', value: 'strobe' })
  expect(whole['presentation.cadenceMs']).toEqual({ kind: 'uniform', value: 120 })
  const first = buildShowV2AppearanceEditorModel(record, clip.id, 'selected-time', 0)!.fields
  expect(first['aperture.starPoints']).toEqual({ kind: 'uniform', value: 5 })
  expect(first['blink.duty']).toEqual({ kind: 'uniform', value: .5 })
  expect(buildShowV2AppearanceEditorModel(record, clip.id, 'selected-time', 400)!.fields['blink.duty']).toEqual({ kind: 'uniform', value: undefined })
})

it('patches only dirty optional fields and completes closed components from uniform authored members', () => {
  const { record, clip } = fixture()
  for (const key of clip.appearance.keys) { key.value.presentation = { mode: 'strobe', cadenceMs: 120 }; key.value.blink = { rateHz: 2, duty: .5, phase: .1 } }
  const fields = buildShowV2AppearanceEditorModel(record, clip.id, 'whole-clip')!.fields
  expect(appearancePatchFromDirtyFields({ 'transform.scaleX': '.8', 'aperture.enabled': 'true', 'aperture.aperture': 'ring' }, fields))
    .toEqual({ transform: { scaleX: .8 }, aperture: { enabled: true, aperture: 'ring' } })
  expect(appearancePatchFromDirtyFields({ 'blink.duty': '.25' }, fields)).toEqual({ blink: { rateHz: 2, duty: .25, phase: .1 } })
  expect(appearancePatchFromDirtyFields({ 'presentation.cadenceMs': '200' }, fields)).toEqual({ presentation: { mode: 'strobe', cadenceMs: 200 } })
  expect(appearancePatchFromDirtyFields({ 'presentation.mode': 'freeze' }, fields)).toEqual({ presentation: { mode: 'freeze' } })
  expect(appearancePatchFromDirtyFields({ 'aperture.width': '' }, fields).aperture!.width).toBeNaN()
  expect(appearancePatchFromDirtyFields({}, fields)).toEqual({})
})

it('leaves an incomplete closed component for the pure owner to refuse rather than inventing a member', () => {
  const { record, clip } = fixture()
  clip.appearance.keys[0].value.blink = { rateHz: 2, duty: .5, phase: .1 }
  const fields = buildShowV2AppearanceEditorModel(record, clip.id, 'whole-clip')!.fields
  const patch = appearancePatchFromDirtyFields({ 'blink.duty': '.25' }, fields)
  expect(patch.blink!.rateHz).toBeNaN()
  const result = editShowClipAppearanceV2(record, { kind: 'appearance', clipId: clip.id, scope: 'whole-clip', patch })
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  const absent = appearancePatchFromDirtyFields({ 'presentation.cadenceMs': '200' }, fields)
  expect(editShowClipAppearanceV2(record, { kind: 'appearance', clipId: clip.id, scope: 'whole-clip', patch: absent }).status).toBe('refused')
})

it('builds one explicit component or nested Aperture removal and refuses unknown targets', () => {
  expect(appearanceRemovalPatch('transform')).toEqual({ transform: null })
  expect(appearanceRemovalPatch('presentation')).toEqual({ presentation: null })
  expect(appearanceRemovalPatch('aperture.feather')).toEqual({ aperture: { feather: null } })
  expect(appearanceRemovalPatch('aperture.invert')).toEqual({ aperture: { invert: null } })
  expect(appearanceRemovalPatch('opacity')).toBeNull()
  expect(appearanceRemovalPatch('aperture.width')).toBeNull()
  expect(SHOW_V2_APPEARANCE_REMOVALS).toHaveLength(16)
  expect(new Set(SHOW_V2_APPEARANCE_COMPONENT_FIELDS.map(item => item.label)).size).toBe(SHOW_V2_APPEARANCE_COMPONENT_FIELDS.length)
})

it('applies every optional component field the pure owner supports through the model patch', () => {
  const { record, clip } = fixture()
  const fields = buildShowV2AppearanceEditorModel(record, clip.id, 'whole-clip')!.fields
  const drafts: ShowV2AppearanceDirtyFields = { 'aperture.enabled': 'true', 'aperture.invert': 'true', 'aperture.aperture': 'star', 'aperture.edge': 'dither',
    'aperture.starPoints': '6', 'aperture.starInner': '.4', 'aperture.feather': '.2', 'aperture.rotation': '.1',
    'aperture.x': '.1', 'aperture.y': '.2', 'aperture.width': '.8', 'aperture.height': '.9',
    'transform.positionX': '.1', 'transform.positionY': '.2', 'transform.rotation': '.3', 'transform.scaleX': '.8', 'transform.scaleY': '1.2',
    'presentation.mode': 'strobe', 'presentation.cadenceMs': '120', 'blink.rateHz': '2', 'blink.duty': '.5', 'blink.phase': '.1' }
  const result = editShowClipAppearanceV2(record, { kind: 'appearance', clipId: clip.id, scope: 'whole-clip', patch: appearancePatchFromDirtyFields(drafts, fields) })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const value = result.record.composition.clips.find(candidate => candidate.id === clip.id)!.appearance.keys[0].value
  expect(value.transform).toEqual({ positionX: .1, positionY: .2, rotation: .3, scaleX: .8, scaleY: 1.2 })
  expect(value.aperture).toEqual({ enabled: true, invert: true, aperture: 'star', edge: 'dither', starPoints: 6, starInner: .4, feather: .2, rotation: .1, x: .1, y: .2, width: .8, height: .9 })
  expect(value.presentation).toEqual({ mode: 'strobe', cadenceMs: 120 })
  expect(value.blink).toEqual({ rateHz: 2, duty: .5, phase: .1 })
  const removed = editShowClipAppearanceV2(result.record, { kind: 'appearance', clipId: clip.id, scope: 'whole-clip', patch: appearanceRemovalPatch('aperture.starInner')! })
  expect(removed.status).toBe('changed')
  expect(removed.record.composition.clips.find(candidate => candidate.id === clip.id)!.appearance.keys[0].value.aperture).not.toHaveProperty('starInner')
})
