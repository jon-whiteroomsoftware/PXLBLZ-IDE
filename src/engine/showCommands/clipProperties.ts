import type { ShowClipInspectorOwner, ShowClipInspectorPatch } from '../showClipInspectorModel'
import { projectShowClipInspector, projectShowClipInspectorSegments, updateShowClipInspector } from '../showClipInspectorModel'
import { declaredPatternSliderNames } from '../showPatternControls'
import { compactShowClipTransform } from '../showClipTransform'
import { compactShowClipViewport, SHOW_CLIP_APERTURE_SHAPES } from '../showClipViewport'
import { commandComposition, refuseShowCommand, type ShowCommandContext, type ShowCommandDescriptor, type ShowCommandOutcome } from './registry'
import { resolveCommandClip } from './support'
import type { ShowPropertyAnimationTarget, ShowRecord } from '../personalContentRecords'

interface ChangedPlacementReceipt {
  sceneId: string
  placementId: string
}

function affectedPlacementAnimations(
  record: ShowRecord,
  changedPlacements: readonly ChangedPlacementReceipt[],
  accepts: (target: ShowPropertyAnimationTarget) => string | null,
) {
  const changed = new Set(changedPlacements.map(item => `${item.sceneId}:${item.placementId}`))
  return (record.composition?.scenes ?? []).flatMap(scene => (
    (scene.propertyTracks ?? []).flatMap(track => {
      if (!('placementId' in track.target) || !changed.has(`${scene.sceneId}:${track.target.placementId}`)) return []
      const property = accepts(track.target)
      return property === null ? [] : [{ sceneId: scene.sceneId, placementId: track.target.placementId, trackId: track.id, property }]
    })
  ))
}

function applyClipProperty(record: ShowRecord, input: Record<string, unknown>, command: string, context?: ShowCommandContext): ShowCommandOutcome {
  const ranges: Record<string, { min: number; max: number }> = command === 'set_clip_view'
    ? { phase: { min: 0, max: 1 }, brightness: { min: 0, max: 1 } }
    : command === 'set_clip_time'
      ? { time_scale: { min: 0, max: 4 }, time_offset_ms: { min: 0, max: 60000 } }
      : command === 'set_clip_opacity'
        ? { opacity: { min: 0, max: 1 } }
        : command === 'set_clip_aperture'
          ? {
              x: { min: -4, max: 4 },
              y: { min: -4, max: 4 },
              width: { min: 0.01, max: 8 },
              height: { min: 0.01, max: 8 },
              feather: { min: 0.001, max: 1 },
              rotation: { min: -1, max: 1 },
              ring_width: { min: 0.05, max: 1 },
              corner_radius: { min: 0.05, max: 1 },
              cross_width: { min: 0.1, max: 0.9 },
              star_points: { min: 3, max: 12 },
              star_inner: { min: 0.2, max: 0.8 },
              crescent_offset: { min: 0.15, max: 0.8 },
              polygon_sides: { min: 3, max: 8 },
            }
        : command === 'set_clip_transform'
          ? {
              position_x: { min: -4, max: 4 },
              position_y: { min: -4, max: 4 },
              rotation: { min: -8, max: 8 },
              scale_x: { min: 0.01, max: 8 },
              scale_y: { min: 0.01, max: 8 },
            }
          : { value: { min: 0, max: 1 } }
  for (const [field, { min, max }] of Object.entries(ranges)) {
    const value = input[field]
    if (typeof value === 'number' && (value < min || value > max)) return refuseShowCommand({ code: 'invalid-argument', message: `${field} must be within the supported range ${min}–${max}.` })
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
  const segments = projectShowClipInspectorSegments(record, owner)
  if (segments.length === 0) return refuseShowCommand({ code: 'missing-owner', message: `Clip ${clip.id} has no inspector placements.` })
  let patch: ShowClipInspectorPatch
  let names: ReadonlySet<string> = new Set()
  let satisfied: boolean
  if (command === 'set_clip_aperture') {
    const publicToStored = {
      enabled: 'enabled',
      x: 'x',
      y: 'y',
      width: 'width',
      height: 'height',
      aperture: 'aperture',
      edge: 'edge',
      feather: 'feather',
      rotation: 'rotation',
      invert: 'invert',
      ring_width: 'ringWidth',
      corner_radius: 'cornerRadius',
      cross_width: 'crossWidth',
      star_points: 'starPoints',
      star_inner: 'starInner',
      crescent_offset: 'crescentOffset',
      polygon_sides: 'polygonSides',
    } as const
    const requested = Object.fromEntries(Object.keys(publicToStored)
      .filter(field => input[field] !== undefined)
      .map(field => [field, input[field]]))
    if (Object.keys(requested).length === 0) return refuseShowCommand({ code: 'invalid-argument', message: 'Give at least one Aperture frame or style field.' })
    const shapeFields = {
      ring_width: 'ring',
      corner_radius: 'rounded-box',
      cross_width: 'cross',
      star_points: 'star',
      star_inner: 'star',
      crescent_offset: 'crescent',
      polygon_sides: 'polygon',
    } as const
    for (const [field, requiredShape] of Object.entries(shapeFields)) {
      if (input[field] === undefined) continue
      const incompatible = segments.find(segment => (
        (input.aperture as string | undefined) ?? segment.viewport.aperture ?? 'rectangle'
      ) !== requiredShape)
      if (incompatible) {
        return refuseShowCommand({
          code: 'invalid-argument',
          message: `${field} belongs to the ${requiredShape} Aperture; placement ${incompatible.placementId} would use ${(input.aperture as string | undefined) ?? incompatible.viewport.aperture ?? 'rectangle'}.`,
        })
      }
    }
    const viewport = Object.fromEntries(Object.entries(publicToStored)
      .filter(([field]) => input[field] !== undefined)
      .map(([field, stored]) => {
        const value = input[field]
        if (field === 'aperture' && value === 'rectangle') return [stored, undefined]
        return [stored, value === null ? undefined : value]
      }))
    const changedPlacements = segments.flatMap(segment => {
      const before = compactShowClipViewport(segment.viewport)
      const after = compactShowClipViewport({ ...segment.viewport, ...viewport })
      if (JSON.stringify(before) === JSON.stringify(after)) return []
      const properties = Object.fromEntries(Object.keys({ ...before, ...after })
        .filter(property => JSON.stringify(before?.[property as keyof typeof before]) !== JSON.stringify(after?.[property as keyof typeof after]))
        .map(property => [property, {
          before: before?.[property as keyof typeof before] ?? null,
          after: after?.[property as keyof typeof after] ?? null,
        }]))
      return [{ sceneId: segment.sceneId, placementId: segment.placementId, properties }]
    })
    if (changedPlacements.length === 0) return { ok: true, record, changes: [] }
    const animatedProperties = affectedPlacementAnimations(record, changedPlacements, target => (
      target.kind === 'placement-viewport'
      && Object.entries(publicToStored).some(([field, stored]) => (
        stored === target.property && Object.prototype.hasOwnProperty.call(requested, field)
      ))
        ? target.property
        : null
    ))
    const next = updateShowClipInspector(record, owner, { viewport }, names)
    if (next === record) return refuseShowCommand({ code: 'engine-refused', message: `The Clip inspector refused ${command} for ${clip.id}.` })
    return {
      ok: true,
      record: next,
      changes: [{
        command,
        targetId: clip.id,
        description: `Clip ${clip.id} Aperture updated.`,
        details: { patch: requested, changedPlacements, animatedProperties },
      }],
    }
  } else if (command === 'set_clip_opacity') {
    const opacity = input.opacity as number
    const changedPlacements = segments
      .filter(segment => segment.opacity !== opacity)
      .map(segment => ({
        sceneId: segment.sceneId,
        placementId: segment.placementId,
        properties: { opacity: { before: segment.opacity, after: opacity } },
      }))
    if (changedPlacements.length === 0) return { ok: true, record, changes: [] }
    const animatedProperties = affectedPlacementAnimations(record, changedPlacements, target => (
      target.kind === 'placement-opacity' ? 'opacity' : null
    ))
    const next = updateShowClipInspector(record, owner, { local: { opacity } }, names)
    if (next === record) return refuseShowCommand({ code: 'engine-refused', message: `The Clip inspector refused ${command} for ${clip.id}.` })
    return {
      ok: true,
      record: next,
      changes: [{
        command,
        targetId: clip.id,
        description: `Clip ${clip.id} opacity updated.`,
        details: { patch: { opacity }, changedPlacements, animatedProperties },
      }],
    }
  } else if (command === 'set_clip_transform') {
    const publicToStored = {
      position_x: 'positionX',
      position_y: 'positionY',
      rotation: 'rotation',
      scale_x: 'scaleX',
      scale_y: 'scaleY',
    } as const
    const requested = Object.fromEntries(Object.keys(publicToStored)
      .filter(field => input[field] !== undefined)
      .map(field => [field, input[field]]))
    if (Object.keys(requested).length === 0) return refuseShowCommand({ code: 'invalid-argument', message: 'Give position_x, position_y, rotation, scale_x or scale_y.' })
    const transform = Object.fromEntries(Object.entries(publicToStored)
      .filter(([field]) => input[field] !== undefined)
      .map(([field, stored]) => [stored, input[field]]))
    const changedPlacements = segments.flatMap(segment => {
      const after = { ...segment.transform, ...transform }
      const properties = Object.fromEntries(Object.values(publicToStored)
        .filter(property => Object.prototype.hasOwnProperty.call(transform, property)
          && segment.transform[property] !== after[property])
        .map(property => [property, { before: segment.transform[property], after: after[property] }]))
      if (Object.keys(properties).length === 0
        || JSON.stringify(compactShowClipTransform(after)) === JSON.stringify(compactShowClipTransform(segment.transform))) return []
      return [{ sceneId: segment.sceneId, placementId: segment.placementId, properties }]
    })
    if (changedPlacements.length === 0) return { ok: true, record, changes: [] }
    const requestedStoredProperties = new Set(Object.entries(publicToStored)
      .filter(([field]) => input[field] !== undefined)
      .map(([, stored]) => stored))
    const animatedProperties = affectedPlacementAnimations(record, changedPlacements, target => (
      target.kind === 'placement-transform' && requestedStoredProperties.has(target.property)
        ? target.property
        : null
    ))
    const next = updateShowClipInspector(record, owner, { transform }, names)
    if (next === record) return refuseShowCommand({ code: 'engine-refused', message: `The Clip inspector refused ${command} for ${clip.id}.` })
    return {
      ok: true,
      record: next,
      changes: [{
        command,
        targetId: clip.id,
        description: `Clip ${clip.id} Content Transform updated.`,
        details: { patch: requested, changedPlacements, animatedProperties },
      }],
    }
  } else if (command === 'set_clip_control_target') {
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
  { name: 'set_clip_aperture', description: 'Patch the static normalized Aperture frame, silhouette, edge, and shape parameters on every Scene segment of one logical Clip. Omitted fields retain each segment independently; nullable overrides clear to their automatic defaults.', touches: ['/composition/scenes/*/zones/*/main/*/viewport', '/composition/scenes/*/zones/*/overlays/*/placements/*/viewport', '/updatedAt'], fields: { clip_id: clipId, enabled: { kind: 'boolean', optional: true, description: 'Enable or disable clipping without discarding authored style' }, x: { kind: 'number', optional: true, description: 'Frame minimum X, -4–4 normalized Zone units' }, y: { kind: 'number', optional: true, description: 'Frame minimum Y, -4–4 normalized Zone units' }, width: { kind: 'number', optional: true, description: 'Frame width, 0.01–8 normalized Zone units' }, height: { kind: 'number', optional: true, description: 'Frame height, 0.01–8 normalized Zone units' }, aperture: { kind: 'string', enum: SHOW_CLIP_APERTURE_SHAPES, optional: true, description: 'Aperture silhouette; rectangle is the compact default' }, edge: { kind: 'string', enum: ['hard', 'soft', 'dither'], nullable: true, optional: true, description: 'Edge treatment, or null for the Soft effective default' }, feather: { kind: 'number', nullable: true, optional: true, description: 'Soft-band width, 0.001–1, or null for automatic density width' }, rotation: { kind: 'number', optional: true, description: 'Silhouette rotation, -1–1 turns' }, invert: { kind: 'boolean', optional: true, description: 'Invert the silhouette mask' }, ring_width: { kind: 'number', nullable: true, optional: true, description: 'Ring thickness, 0.05–1, or null for default 0.25' }, corner_radius: { kind: 'number', nullable: true, optional: true, description: 'Rounded-box corner radius, 0.05–1, or null for default 0.25' }, cross_width: { kind: 'number', nullable: true, optional: true, description: 'Cross arm width, 0.1–0.9, or null for default 0.32' }, star_points: { kind: 'integer', nullable: true, optional: true, description: 'Star points, integer 3–12, or null for default 5' }, star_inner: { kind: 'number', nullable: true, optional: true, description: 'Star inner radius, 0.2–0.8, or null for default 0.45' }, crescent_offset: { kind: 'number', nullable: true, optional: true, description: 'Crescent offset, 0.15–0.8, or null for default 0.45' }, polygon_sides: { kind: 'integer', nullable: true, optional: true, description: 'Polygon sides, integer 3–8, or null for default 6' } } },
  { name: 'set_clip_opacity', description: 'Set static placement opacity from 0–1 on every Scene segment of one logical Clip. This does not add an animation track or Opacity Effect.', touches: ['/composition/scenes/*/zones/*/main/*/opacity', '/composition/scenes/*/zones/*/overlays/*/placements/*/opacity', '/updatedAt'], fields: { clip_id: clipId, opacity: { kind: 'number', description: 'Static Clip opacity, 0–1' } } },
  { name: 'set_clip_transform', description: 'Patch the static 2D Content Transform on every Scene segment of one logical Clip. Values use normalized position, turns, and scale; omitted fields retain each segment independently.', touches: ['/composition/scenes/*/zones/*/main/*/transform', '/composition/scenes/*/zones/*/overlays/*/placements/*/transform', '/updatedAt'], fields: { clip_id: clipId, position_x: { kind: 'number', optional: true, description: 'Horizontal Content position, -4–4 normalized units' }, position_y: { kind: 'number', optional: true, description: 'Vertical Content position, -4–4 normalized units' }, rotation: { kind: 'number', optional: true, description: 'Content rotation, -8–8 turns' }, scale_x: { kind: 'number', optional: true, description: 'Horizontal Content scale, 0.01–8' }, scale_y: { kind: 'number', optional: true, description: 'Vertical Content scale, 0.01–8' } } },
  { name: 'set_clip_view', description: 'Set placement-local mirror, phase or brightness, retaining omitted fields. Give at least one field; out-of-range phase or brightness refuses (supported 0–1).', touches: ['/composition/scenes/*/zones/*/main/*/view', '/composition/scenes/*/zones/*/overlays/*/placements/*/view', '/updatedAt'], fields: { clip_id: clipId, mirror: { kind: 'boolean', optional: true, description: 'Reflect the Pattern domain' }, phase: { kind: 'number', optional: true, description: 'Domain offset, 0–1' }, brightness: { kind: 'number', optional: true, description: 'Output scale, 0–1' } } },
  { name: 'set_clip_control_target', description: 'Set or clear an exported slider target on the shared Pattern instance. Exact Pattern source must declare the slider when setting; null clears. Existing dependency admission still applies. Every linked Clip is affected.', touches: ['/composition/patternInstances/*/controlTargets', '/composition/scenes/*/propertyTracks', '/updatedAt'], fields: { clip_id: clipId, export_name: { kind: 'string', description: 'Actual exported slider name' }, value: { kind: 'number', nullable: true, description: 'Target from 0–1, or null to clear' } } },
  { name: 'set_clip_time', description: 'Set time_scale or time_offset_ms on the shared Pattern instance. Every linked Clip is affected; make the Clip Pattern independent first for a Clip-only edit. Out-of-range values refuse; offsets in 0–60000 ms round to milliseconds.', touches: ['/composition/patternInstances/*/time', '/updatedAt'], fields: { clip_id: clipId, time_scale: { kind: 'number', optional: true, description: 'Animation speed multiplier, 0–4' }, time_offset_ms: { kind: 'number', optional: true, description: 'Pattern offset, 0–60000 milliseconds, rounded to milliseconds' } } },
  { name: 'set_clip_evaluation', description: 'Set the shared Pattern instance evaluation policy. Every linked Clip is affected; this is not playback restart.', touches: ['/composition/patternInstances/*/evaluationPolicy', '/updatedAt'], fields: { clip_id: clipId, policy: { kind: 'string', enum: ['live', 'freeze-at-entry', 'rolling-refresh'], description: 'Pattern evaluation policy' } } },
]
export const SHOW_CLIP_PROPERTY_COMMANDS: ShowCommandDescriptor[] = descriptors.map(descriptor => ({ ...descriptor, apply: (record, input, context) => applyClipProperty(record, input, descriptor.name, context) }))
