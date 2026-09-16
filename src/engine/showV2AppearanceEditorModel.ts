import type { ShowRecordV2, ShowClipAppearanceValueV2 } from './showCompositionV2'
import type { ShowClipEffect, ShowClipPresentation } from './personalContentRecords'
import type { ShowClipAppearanceEditIntentV2, ShowClipAppearancePatchV2 } from './showClipAppearanceEditsV2'
import { showClipEffectParameters, showClipEffectParameterValue, showClipEffectStage } from './showEffectAuthoring'
import { SHOW_CLIP_APERTURE_SHAPES } from './showClipViewport'

export type ShowV2AppearanceScope = 'whole-clip' | 'selected-time'
export type ShowV2AuthoredValue<T> = { kind: 'uniform'; value: T } | { kind: 'mixed' }
export type ShowV2AppearanceComponent = 'transform' | 'aperture' | 'presentation' | 'blink'
export type ShowV2AppearanceField = 'opacity' | 'brightness' | 'phase' | 'mirror' | ShowV2AppearanceComponentFieldId
export type ShowV2AppearanceDirtyFields = Partial<Record<ShowV2AppearanceField, string>>
export type ShowV2AppearanceAuthoredValue = ShowV2AuthoredValue<string | number | boolean | undefined>
export type ShowV2AppearanceFieldValues = Record<ShowV2AppearanceField, ShowV2AppearanceAuthoredValue>

type ComponentFieldControl = { control: 'number' } | { control: 'boolean' } | { control: 'select'; options: readonly string[] }
export type ShowV2AppearanceComponentField = ComponentFieldControl & {
  id: ShowV2AppearanceComponentFieldId
  component: ShowV2AppearanceComponent
  property: string
  label: string
}
type ShowV2AppearanceComponentFieldId =
  | `transform.${'positionX' | 'positionY' | 'rotation' | 'scaleX' | 'scaleY'}`
  | `aperture.${'enabled' | 'x' | 'y' | 'width' | 'height' | 'aperture' | 'edge' | 'feather' | 'rotation' | 'invert'
    | 'ringWidth' | 'cornerRadius' | 'crossWidth' | 'starPoints' | 'starInner' | 'crescentOffset' | 'polygonSides'}`
  | `presentation.${'mode' | 'cadenceMs'}`
  | `blink.${'rateHz' | 'duty' | 'phase'}`

function field(id: ShowV2AppearanceComponentFieldId, label: string, control: ComponentFieldControl = { control: 'number' }): ShowV2AppearanceComponentField {
  const [component, property] = id.split('.') as [ShowV2AppearanceComponent, string]
  return { id, component, property, label, ...control }
}
/** Every optional held component the pure owner patches, in authoring order. */
export const SHOW_V2_APPEARANCE_COMPONENT_FIELDS: readonly ShowV2AppearanceComponentField[] = [
  field('transform.positionX', 'Transform position X'), field('transform.positionY', 'Transform position Y'),
  field('transform.rotation', 'Transform rotation'), field('transform.scaleX', 'Transform scale X'), field('transform.scaleY', 'Transform scale Y'),
  field('aperture.enabled', 'Aperture enabled', { control: 'boolean' }),
  field('aperture.x', 'Aperture x'), field('aperture.y', 'Aperture y'), field('aperture.width', 'Aperture width'), field('aperture.height', 'Aperture height'),
  field('aperture.aperture', 'Aperture shape', { control: 'select', options: SHOW_CLIP_APERTURE_SHAPES }),
  field('aperture.edge', 'Aperture edge', { control: 'select', options: ['hard', 'soft', 'dither'] }),
  field('aperture.feather', 'Aperture feather'), field('aperture.rotation', 'Aperture rotation'),
  field('aperture.invert', 'Aperture invert', { control: 'boolean' }),
  field('aperture.ringWidth', 'Aperture ring width'), field('aperture.cornerRadius', 'Aperture corner radius'),
  field('aperture.crossWidth', 'Aperture cross width'), field('aperture.starPoints', 'Aperture star points'),
  field('aperture.starInner', 'Aperture star inner'), field('aperture.crescentOffset', 'Aperture crescent offset'),
  field('aperture.polygonSides', 'Aperture polygon sides'),
  field('presentation.mode', 'Presentation mode', { control: 'select', options: ['live', 'freeze', 'strobe'] }),
  field('presentation.cadenceMs', 'Presentation cadence'),
  field('blink.rateHz', 'Blink rate'), field('blink.duty', 'Blink duty'), field('blink.phase', 'Blink phase'),
]
/** Explicit component and nested Aperture removals the pure owner accepts as null. */
export const SHOW_V2_APPEARANCE_REMOVALS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'transform', label: 'Transform' }, { id: 'aperture', label: 'Aperture' },
  { id: 'presentation', label: 'Presentation' }, { id: 'blink', label: 'Blink' },
  ...(['aperture', 'edge', 'feather', 'rotation', 'invert', 'ringWidth', 'cornerRadius', 'crossWidth', 'starPoints', 'starInner', 'crescentOffset', 'polygonSides'] as const)
    .map(property => ({ id: `aperture.${property}`, label: SHOW_V2_APPEARANCE_COMPONENT_FIELDS.find(item => item.id === `aperture.${property}`)!.label })),
]
type AppearanceTarget = Pick<Extract<ShowClipAppearanceEditIntentV2, { scope: 'whole-clip' }>, 'clipId' | 'scope'>
  | Pick<Extract<ShowClipAppearanceEditIntentV2, { scope: 'selected-time' }>, 'clipId' | 'scope' | 'atMs' | 'keyIdentity'>

function authored<T>(values: readonly T[]): ShowV2AuthoredValue<T> {
  return values.every(value => value === values[0]) ? { kind: 'uniform', value: values[0] } : { kind: 'mixed' }
}
/** RGB display conversion is lossy; compare persisted channel tuples first. */
function authoredEffectParameter(effects: readonly ShowClipEffect[], parameterId: string): ShowV2AuthoredValue<ReturnType<typeof showClipEffectParameterValue>> {
  const first = effects[0]
  if (first.kind === 'color-map' && (parameterId === 'shadowColor' || parameterId === 'highlightColor')) {
    const channels = (effect: ShowClipEffect) => effect.kind !== 'color-map' ? []
      : parameterId === 'shadowColor' ? [effect.shadowR, effect.shadowG, effect.shadowB] : [effect.highlightR, effect.highlightG, effect.highlightB]
    const tuple = channels(first)
    if (!effects.every(effect => channels(effect).every((value, index) => value === tuple[index]))) return { kind: 'mixed' }
    return { kind: 'uniform', value: showClipEffectParameterValue(first, parameterId) }
  }
  return authored(effects.map(effect => showClipEffectParameterValue(effect, parameterId)))
}
/** Read authored held values only; no animation evaluation or first-span fallback. */
export function buildShowV2AppearanceEditorModel(record: ShowRecordV2, clipId: string, scope: ShowV2AppearanceScope, atMs?: number) {
  const clip = record.composition.clips.find(clip => clip.id === clipId)
  if (!clip) return null
  let values: ShowClipAppearanceValueV2[] = clip.appearance.keys.map(key => key.value)
  if (scope === 'selected-time') {
    if (!Number.isSafeInteger(atMs) || atMs! < clip.startMs || atMs! >= clip.startMs + clip.durationMs) return null
    const held = [...clip.appearance.keys].reverse().find(key => key.timeMs <= atMs!)
    if (!held) return null
    values = [held.value]
  }
  const effects = (values[0].effects ?? []).flatMap(effect => {
    const matches = values.map(value => value.effects?.find(candidate => candidate.id === effect.id && candidate.kind === effect.kind))
    if (matches.some(match => !match)) return []
    return [{ effect: structuredClone(effect), stage: showClipEffectStage(effect),
      parameters: showClipEffectParameters(effect).map(descriptor => ({ descriptor,
        value: authoredEffectParameter(matches as ShowClipEffect[], descriptor.id) })) }]
  })
  const fields = { opacity: authored(values.map(value => value.opacity)),
    brightness: authored(values.map(value => value.view.brightness)), phase: authored(values.map(value => value.view.phase)),
    mirror: authored(values.map(value => value.view.mirror)),
    ...Object.fromEntries(SHOW_V2_APPEARANCE_COMPONENT_FIELDS.map(item => [item.id, authored(values.map(value => readAppearanceField(value, item)))])),
  } as ShowV2AppearanceFieldValues
  return { clipId, fields, effects }
}

/** Absent optional components read as absent; nothing substitutes a default. */
function readAppearanceField(value: ShowClipAppearanceValueV2, item: ShowV2AppearanceComponentField): string | number | boolean | undefined {
  if (item.component === 'presentation') {
    if (!value.presentation) return undefined
    return item.property === 'mode' ? value.presentation.mode : value.presentation.mode === 'strobe' ? value.presentation.cadenceMs : undefined
  }
  const owner = item.component === 'transform' ? value.transform : item.component === 'aperture' ? value.aperture : value.blink
  return owner ? (owner as unknown as Record<string, string | number | boolean | undefined>)[item.property] : undefined
}

/** Call once at submission; existing keys retain identity without allocation. */
export function createShowV2AppearanceTarget(record: ShowRecordV2, clipId: string, scope: ShowV2AppearanceScope | '', time: string, allocate: () => string):
  { status: 'ready'; target: AppearanceTarget } | { status: 'refused'; message: string } {
  const clip = record.composition.clips.find(clip => clip.id === clipId)
  if (!clip || !['whole-clip', 'selected-time'].includes(scope)) return { status: 'refused', message: 'Choose an ordinary Clip and appearance scope.' }
  if (scope === 'whole-clip') return { status: 'ready', target: { clipId, scope } }
  const atMs = time.trim() ? Number(time) : NaN
  if (!Number.isSafeInteger(atMs) || atMs < clip.startMs || atMs >= clip.startMs + clip.durationMs) return { status: 'refused', message: 'Select an integer time inside the Clip bar, before its end.' }
  const existing = clip.appearance.keys.find(key => key.timeMs === atMs)
  const appearanceKeyId = existing?.id ?? allocate()
  if (typeof appearanceKeyId !== 'string' || !appearanceKeyId.trim() || !existing && clip.appearance.keys.some(key => key.id === appearanceKeyId)) return { status: 'refused', message: 'Fresh appearance key identity conflicts.' }
  return { status: 'ready', target: { clipId, scope: 'selected-time', atMs,
    keyIdentity: { kind: existing ? 'retain' : 'insert', appearanceKeyId } } }
}

/**
 * Only independently dirty fields enter the patch, without clamping. The two
 * closed discriminated components (`presentation`, `blink`) must be complete,
 * so an undirtied member falls back to its uniform authored value; a mixed or
 * absent one stays absent and the pure owner refuses the incomplete request.
 */
export function appearancePatchFromDirtyFields(dirty: ShowV2AppearanceDirtyFields, fields: ShowV2AppearanceFieldValues): ShowClipAppearancePatchV2 {
  const patch: ShowClipAppearancePatchV2 = {}
  const number = (value: string): number => value.trim() ? Number(value) : NaN
  const uniform = (id: ShowV2AppearanceField) => fields[id]?.kind === 'uniform' ? (fields[id] as { value: unknown }).value : undefined
  const member = (id: ShowV2AppearanceField): number => {
    if (dirty[id] !== undefined) return number(dirty[id]!)
    const value = uniform(id)
    return typeof value === 'number' ? value : NaN
  }
  if (dirty.opacity !== undefined) patch.opacity = number(dirty.opacity)
  if (dirty.brightness !== undefined) patch.view = { ...patch.view, brightness: number(dirty.brightness) }
  if (dirty.phase !== undefined) patch.view = { ...patch.view, phase: number(dirty.phase) }
  if (dirty.mirror !== undefined) patch.view = { ...patch.view, mirror: dirty.mirror === 'true' ? true : dirty.mirror === 'false' ? false : undefined }
  for (const item of SHOW_V2_APPEARANCE_COMPONENT_FIELDS) {
    const draft = dirty[item.id]
    if (draft === undefined || item.component === 'presentation' || item.component === 'blink') continue
    const value = item.control === 'boolean' ? draft === 'true' ? true : draft === 'false' ? false : undefined
      : item.control === 'select' ? draft : number(draft)
    if (item.component === 'transform') patch.transform = { ...patch.transform, [item.property]: value as number }
    else patch.aperture = { ...patch.aperture, [item.property]: value } as ShowClipAppearancePatchV2['aperture']
  }
  if (dirty['presentation.mode'] !== undefined || dirty['presentation.cadenceMs'] !== undefined) {
    const mode = (dirty['presentation.mode'] ?? uniform('presentation.mode')) as ShowClipPresentation['mode']
    patch.presentation = mode === 'strobe' ? { mode, cadenceMs: member('presentation.cadenceMs') } : { mode } as ShowClipPresentation
  }
  if ((['blink.rateHz', 'blink.duty', 'blink.phase'] as const).some(id => dirty[id] !== undefined)) {
    patch.blink = { rateHz: member('blink.rateHz'), duty: member('blink.duty'), phase: member('blink.phase') }
  }
  return patch
}

/** One explicit component or nested Aperture removal; nothing else is patched. */
export function appearanceRemovalPatch(target: string): ShowClipAppearancePatchV2 | null {
  if (!SHOW_V2_APPEARANCE_REMOVALS.some(item => item.id === target)) return null
  const [component, property] = target.split('.')
  if (property === undefined) return { [component]: null } as ShowClipAppearancePatchV2
  return { aperture: { [property]: null } } as ShowClipAppearancePatchV2
}

export function showV2AppearanceEffectTargets(effects: readonly { effect: ShowClipEffect; stage: string }[], effectId: string) {
  const source = effects.find(candidate => candidate.effect.id === effectId)
  return source ? effects.filter(candidate => candidate.effect.id !== effectId && candidate.stage === source.stage) : []
}
