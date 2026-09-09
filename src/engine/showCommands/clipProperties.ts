import type { ShowClipInspectorOwner, ShowClipInspectorPatch } from '../showClipInspectorModel'
import { projectShowClipInspector, updateShowClipInspector } from '../showClipInspectorModel'
import { declaredPatternSliderNames } from '../showPatternControls'
import { commandComposition, refuseShowCommand, type ShowCommandContext, type ShowCommandDescriptor, type ShowCommandOutcome } from './registry'
import { resolveCommandClip } from './support'
import type { ShowRecord } from '../personalContentRecords'

function applyClipProperty(record: ShowRecord, input: Record<string, unknown>, command: string, context?: ShowCommandContext): ShowCommandOutcome {
  const ranges: Record<string, number> = command === 'set_clip_view' ? { phase: 1, brightness: 1 } : command === 'set_clip_time' ? { time_scale: 4, time_offset_ms: 60000 } : { value: 1 }
  for (const [field, max] of Object.entries(ranges)) {
    const value = input[field]
    if (typeof value === 'number' && (value < 0 || value > max)) return refuseShowCommand({ code: 'invalid-argument', message: `${field} must be within the supported range 0–${max}.` })
  }
  const composition = commandComposition(record)
  if (!composition.ok) return composition
  const resolved = resolveCommandClip(record, composition.composition, input.clip_id as string)
  if (!resolved.ok) return resolved
  const { clip } = resolved.context
  const owner: ShowClipInspectorOwner = clip.kind === 'main'
    ? { kind: 'scene-main', sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.startPlacementId }
    : { kind: 'scene-overlay', sceneId: clip.sceneId, zoneId: clip.zoneId, layerId: clip.layerId!, placementId: clip.startPlacementId }
  const current = projectShowClipInspector(record, owner)
  if (!current) return refuseShowCommand({ code: 'missing-owner', message: `Clip ${clip.id} has no inspector owner.` })
  let patch: ShowClipInspectorPatch
  let names: ReadonlySet<string> = new Set()
  let satisfied: boolean
  if (command === 'set_clip_control_target') {
    const name = input.export_name as string
    const value = input.value as number | null
    if (value !== null) {
      try {
        const source = context?.source(current.pattern)
        if (source === undefined) return refuseShowCommand({ code: 'unknown-control', message: `Pattern metadata for "${current.pattern.id}" is unavailable; supply its source before editing controls.` })
        names = declaredPatternSliderNames(source)
      } catch {
        return refuseShowCommand({ code: 'unknown-control', message: 'Pattern metadata cannot be inspected.' })
      }
      if (!names.has(name)) return refuseShowCommand({ code: 'unknown-control', message: `${current.patternName} has no control export "${name}" available as a slider. Its slider exports: ${[...names].join(', ') || 'none'}.`, remedy: names.size ? 'Use one of the listed export names exactly; do not guess an identifier.' : 'This Pattern exposes no slider controls; tell the user.', candidates: [...names] })
    }
    const controls = { ...current.simulation.controlTargets }
    satisfied = value === null ? !(name in controls) : controls[name] === value
    if (value === null) delete controls[name]
    else controls[name] = value
    patch = { simulation: { controlTargets: controls } }
  } else if (command === 'set_clip_view') {
    const view = Object.fromEntries(['mirror', 'phase', 'brightness'].filter(key => input[key] !== undefined).map(key => [key, input[key]]))
    if (!Object.keys(view).length) return refuseShowCommand({ code: 'invalid-argument', message: 'Give mirror, phase or brightness.' })
    patch = { view }
    satisfied = Object.entries(view).every(([key, value]) => current.view[key as keyof typeof current.view] === value)
  } else if (command === 'set_clip_time') {
    const simulation = {
      ...(input.time_scale !== undefined ? { timeScale: input.time_scale as number } : {}),
      ...(input.time_offset_ms !== undefined ? { timeOffsetMs: Math.round(input.time_offset_ms as number) } : {}),
    }
    if (!Object.keys(simulation).length) return refuseShowCommand({ code: 'invalid-argument', message: 'Give time_scale or time_offset_ms.' })
    patch = { simulation }
    satisfied = Object.entries(simulation).every(([key, value]) => current.simulation[key as 'timeScale' | 'timeOffsetMs'] === value)
  } else {
    patch = { evaluationPolicy: input.policy as 'live' | 'freeze-at-entry' | 'rolling-refresh' }
    satisfied = current.evaluationPolicy === input.policy
  }
  if (satisfied) return { ok: true, record, changes: [] }
  const next = updateShowClipInspector(record, owner, patch, names)
  if (next === record) return refuseShowCommand({ code: 'engine-refused', message: `The Clip inspector refused ${command} for ${clip.id}.` })
  return { ok: true, record: next, changes: [{ command, targetId: clip.id, description: `Clip ${clip.id} properties updated.`, details: { instanceId: clip.instanceId, ...(patch.simulation?.timeOffsetMs !== undefined ? { timeOffsetMs: patch.simulation.timeOffsetMs } : {}) } }] }
}

const clipId = { kind: 'string' as const, description: 'Resolved logical Clip id' }
const descriptors: Omit<ShowCommandDescriptor, 'apply'>[] = [
  { name: 'set_clip_view', description: 'Set placement-local mirror, phase or brightness, retaining omitted fields. Give at least one field; out-of-range phase or brightness refuses (supported 0–1).', touches: ['/composition/scenes/*/zones/*/main/*/view', '/composition/scenes/*/zones/*/overlays/*/placements/*/view', '/updatedAt'], fields: { clip_id: clipId, mirror: { kind: 'boolean', optional: true, description: 'Reflect the Pattern domain' }, phase: { kind: 'number', optional: true, description: 'Domain offset, 0–1' }, brightness: { kind: 'number', optional: true, description: 'Output scale, 0–1' } } },
  { name: 'set_clip_control_target', description: 'Set or clear an exported slider target on the shared Pattern instance. Exact Pattern source must declare the slider when setting; null clears. Existing dependency admission still applies. Every linked Clip is affected.', touches: ['/composition/patternInstances/*/controlTargets', '/composition/scenes/*/propertyTracks', '/updatedAt'], fields: { clip_id: clipId, export_name: { kind: 'string', description: 'Actual exported slider name' }, value: { kind: 'number', nullable: true, description: 'Target from 0–1, or null to clear' } } },
  { name: 'set_clip_time', description: 'Set time_scale or time_offset_ms on the shared Pattern instance. Every linked Clip is affected; make the Clip Pattern independent first for a Clip-only edit. Out-of-range values refuse; offsets in 0–60000 ms round to milliseconds.', touches: ['/composition/patternInstances/*/time', '/updatedAt'], fields: { clip_id: clipId, time_scale: { kind: 'number', optional: true, description: 'Animation speed multiplier, 0–4' }, time_offset_ms: { kind: 'number', optional: true, description: 'Pattern offset, 0–60000 milliseconds, rounded to milliseconds' } } },
  { name: 'set_clip_evaluation', description: 'Set the shared Pattern instance evaluation policy. Every linked Clip is affected; this is not playback restart.', touches: ['/composition/patternInstances/*/evaluationPolicy', '/updatedAt'], fields: { clip_id: clipId, policy: { kind: 'string', enum: ['live', 'freeze-at-entry', 'rolling-refresh'], description: 'Pattern evaluation policy' } } },
]
export const SHOW_CLIP_PROPERTY_COMMANDS: ShowCommandDescriptor[] = descriptors.map(descriptor => ({ ...descriptor, apply: (record, input, context) => applyClipProperty(record, input, descriptor.name, context) }))
