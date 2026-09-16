import type { ShowRecordV2, ShowClipAppearanceValueV2 } from './showCompositionV2'
import type { ShowClipEffect } from './personalContentRecords'
import type { ShowClipAppearanceEditIntentV2, ShowClipAppearancePatchV2 } from './showClipAppearanceEditsV2'
import { showClipEffectParameters, showClipEffectParameterValue, showClipEffectStage } from './showEffectAuthoring'

export type ShowV2AppearanceScope = 'whole-clip' | 'selected-time'
export type ShowV2AuthoredValue<T> = { kind: 'uniform'; value: T } | { kind: 'mixed' }
export type ShowV2AppearanceField = 'opacity' | 'brightness' | 'phase' | 'mirror'
export type ShowV2AppearanceDirtyFields = Partial<Record<ShowV2AppearanceField, string>>
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
  return { clipId, fields: { opacity: authored(values.map(value => value.opacity)),
    brightness: authored(values.map(value => value.view.brightness)), phase: authored(values.map(value => value.view.phase)),
    mirror: authored(values.map(value => value.view.mirror)) }, effects }
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

export function appearancePatchFromDirtyFields(dirty: ShowV2AppearanceDirtyFields): ShowClipAppearancePatchV2 {
  const patch: ShowClipAppearancePatchV2 = {}
  const number = (value: string): number => value.trim() ? Number(value) : NaN
  if (dirty.opacity !== undefined) patch.opacity = number(dirty.opacity)
  if (dirty.brightness !== undefined) patch.view = { ...patch.view, brightness: number(dirty.brightness) }
  if (dirty.phase !== undefined) patch.view = { ...patch.view, phase: number(dirty.phase) }
  if (dirty.mirror !== undefined) patch.view = { ...patch.view, mirror: dirty.mirror === 'true' ? true : dirty.mirror === 'false' ? false : undefined }
  return patch
}

export function showV2AppearanceEffectTargets(effects: readonly { effect: ShowClipEffect; stage: string }[], effectId: string) {
  const source = effects.find(candidate => candidate.effect.id === effectId)
  return source ? effects.filter(candidate => candidate.effect.id !== effectId && candidate.stage === source.stage) : []
}
