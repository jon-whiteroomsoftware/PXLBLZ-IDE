import { createShowClipEffect, showClipEffectParameters, updateShowClipEffectParameter } from '../showEffectAuthoring'
import {
  projectShowClipInspector,
  updateShowClipInspector,
  type ShowClipInspectorOwner,
  type ShowClipInspectorPatch,
} from '../showClipInspectorModel'
import { SHOW_CLIP_APERTURE_SHAPES } from '../showClipViewport'
import { newPersonalContentId } from '../personalContentMetadata'
import type {
  ShowClipBlink,
  ShowClipEffect,
  ShowClipPresentation,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowClipViewport,
  ShowPatternInstance,
  ShowRecord,
} from '../personalContentRecords'
import { declaredPatternSliderNames } from '../showPatternControls'
import {
  addShowOverlayLayerAcrossTimeline,
  arrangeShowClipsFinalState,
  createShowClipGlobalSpan,
  resolveShowClipOverlayLayerSpan,
} from '../showTimelineClipAuthoring'
import { projectShowUnifiedTimeline, type ShowUnifiedTimelineClipProjection } from '../showUnifiedTimelineProjection'
import { buildShowToolkitPresentationCatalogue } from '../showVisualToolkitPresentation'
import {
  commandComposition,
  refuseShowCommand,
  withComposition,
  type ShowCommandContext,
  type ShowCommandDescriptor,
  type ShowCommandField,
  type ShowCommandIssue,
  type ShowCommandOutcome,
} from './registry'

export const SHOW_AUTHORING_SCHEMA_VERSION = 1
export const SHOW_AUTHORING_MAX_BATCH_ITEMS = 128

type JsonObject = Record<string, unknown>
type PublicPattern = { kind: 'stock' | 'user'; id: string }
type PublicEffect = { id?: string; kind: ShowClipEffect['kind']; parameters?: Record<string, number | string> }
type ClipProperties = JsonObject & {
  opacity?: number
  view?: JsonObject
  transform?: JsonObject
  aperture?: JsonObject
  effects?: PublicEffect[]
  presentation?: JsonObject
  blink?: JsonObject | null
  time?: JsonObject
  evaluation_policy?: string
  controls?: Record<string, number | null>
}
type ClipSpec = { zone_id: string; layer: 'main' | number; start_ms: number; duration_ms: number; pattern: PublicPattern; properties?: ClipProperties }
type ClipPatch = { clip_id: string; zone_id?: string; layer?: 'main' | number; start_ms?: number; duration_ms?: number; properties?: ClipProperties }

const field = (kind: ShowCommandField['kind'], description: string, extra: JsonObject = {}): ShowCommandField => ({ kind, description, ...extra } as ShowCommandField)
const optional = (value: ShowCommandField): ShowCommandField => ({ ...value, optional: true })
const number = (description: string, minimum?: number, maximum?: number): ShowCommandField => field('number', description, { minimum, maximum })
const integer = (description: string, minimum = 0): ShowCommandField => field('integer', description, { safeInteger: true, minimum })
const object = (description: string, properties: Record<string, ShowCommandField>, allowEmpty = false): ShowCommandField => field('object', description, { properties, allowEmpty })

const patternField = object('Pattern reference', {
  kind: field('string', 'Pattern source kind', { enum: ['stock', 'user'] }),
  id: field('string', 'Exact stock or personal Pattern id'),
})

const viewField = optional(object('Placement view patch', {
  mirror: optional(field('boolean', 'Reflect the Pattern domain')),
  phase: optional(number('Domain offset', 0, 1)),
  brightness: optional(number('Output scale', 0, 1)),
}))

const transformField = optional(object('Placement Content Transform patch', {
  position_x: optional(number('Horizontal position', -4, 4)),
  position_y: optional(number('Vertical position', -4, 4)),
  rotation: optional(number('Rotation in turns', -8, 8)),
  scale_x: optional(number('Horizontal scale', 0.01, 8)),
  scale_y: optional(number('Vertical scale', 0.01, 8)),
}))

const nullableNumber = (description: string, minimum: number, maximum: number) => ({ ...number(description, minimum, maximum), nullable: true })
const apertureField = optional(object('Placement Aperture patch', {
  enabled: optional(field('boolean', 'Enable clipping')),
  x: optional(number('Frame minimum X', -4, 4)),
  y: optional(number('Frame minimum Y', -4, 4)),
  width: optional(number('Frame width', 0.01, 8)),
  height: optional(number('Frame height', 0.01, 8)),
  aperture: optional({ ...field('string', 'Aperture shape', { enum: SHOW_CLIP_APERTURE_SHAPES }), nullable: true }),
  edge: optional({ ...field('string', 'Edge treatment', { enum: ['hard', 'soft', 'dither'] }), nullable: true }),
  feather: optional(nullableNumber('Soft edge width', 0.001, 1)),
  rotation: optional(number('Aperture rotation', -1, 1)),
  invert: optional(field('boolean', 'Invert the silhouette')),
  ring_width: optional(nullableNumber('Ring thickness', 0.05, 1)),
  corner_radius: optional(nullableNumber('Rounded-box radius', 0.05, 1)),
  cross_width: optional(nullableNumber('Cross arm width', 0.1, 0.9)),
  star_points: optional({ ...integer('Star points', 3), maximum: 12, nullable: true }),
  star_inner: optional(nullableNumber('Star inner radius', 0.2, 0.8)),
  crescent_offset: optional(nullableNumber('Crescent offset', 0.15, 0.8)),
  polygon_sides: optional({ ...integer('Polygon sides', 3), maximum: 8, nullable: true }),
}))

const SHOW_VISUAL_TOOLKIT_PRESENTATION = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
const effectItems = SHOW_VISUAL_TOOLKIT_PRESENTATION
  .filter(item => item.kind === 'effect' && item.authoringTarget === 'effect-stack')
  .map(item => {
    const prototype = createShowClipEffect(item, 'schema')
    const parameters = Object.fromEntries(showClipEffectParameters(prototype).map(parameter => [
      parameter.id,
      optional(parameter.kind === 'color'
        ? field('string', parameter.label)
        : number(parameter.label, parameter.min, parameter.max)),
    ]))
    return object(`${item.label} Effect`, {
      id: optional(field('string', 'Existing stable Effect id when preserving animation ownership')),
      kind: field('string', 'Effect kind', { enum: [prototype.kind] }),
      ...(Object.keys(parameters).length ? { parameters: optional(object('Effect parameters', parameters, true)) } : {}),
    })
  })
const effectsField = optional(field('array', 'Complete ordered replacement Effect stack', {
  items: field('union', 'One supported Effect', { variants: effectItems }),
  maxItems: SHOW_AUTHORING_MAX_BATCH_ITEMS,
}))

const presentationField = optional(object('Placement presentation patch', {
  mode: optional(field('string', 'Presentation mode', { enum: ['live', 'freeze', 'strobe'] })),
  cadence_ms: optional({ ...integer('Strobe cadence', 16), maximum: 60_000 }),
}))
const blinkField = optional({ ...object('Placement blink gate', {
  rate_hz: optional(number('Blink rate', 0.01, 60)),
  duty: optional(number('Visible fraction', 0, 1)),
  phase: optional(number('Blink phase', 0, 1)),
}), nullable: true })
const timeField = optional(object('Shared Pattern-instance time patch', {
  time_scale: optional(number('Animation speed', 0, 4)),
  time_offset_ms: optional(number('Animation offset', 0, 60_000)),
  light_shutter: optional({ ...object('Shared light shutter', {
    rate_hz: optional(number('Shutter rate', 0.01, 60)),
    duty: optional(number('Shutter duty', 0, 1)),
    phase: optional(number('Shutter phase', 0, 1)),
    clock_behavior: optional(field('string', 'Clock behavior', { enum: ['continue', 'freeze'] })),
  }), nullable: true }),
  stepped_clock: optional({ ...object('Shared stepped clock', { step_ms: integer('Step duration', 1) }), nullable: true }),
}))
const controlsField = optional(field('record', 'Shared slider targets; null clears one target', {
  values: { ...number('Slider target or null to clear', 0, 1), nullable: true },
}))

export const SHOW_CLIP_PROPERTIES_FIELD: ShowCommandField = object('Clip property patch', {
  opacity: optional(number('Static placement opacity', 0, 1)),
  view: viewField,
  transform: transformField,
  aperture: apertureField,
  effects: effectsField,
  presentation: presentationField,
  blink: blinkField,
  time: timeField,
  evaluation_policy: optional(field('string', 'Shared evaluation policy', { enum: ['live', 'freeze-at-entry', 'rolling-refresh'] })),
  controls: controlsField,
})

const clipFields = (nested: boolean): Record<string, ShowCommandField> => ({
  ...(nested ? {} : {
    zone_id: field('string', 'Destination Zone id'),
    layer: field('layer', 'Destination Layer; main or zero-based overlay index'),
  }),
  start_ms: integer('Exact global start time'),
  duration_ms: integer('Exact duration', 1),
  pattern: patternField,
  properties: optional(SHOW_CLIP_PROPERTIES_FIELD),
})
export const SHOW_CLIP_SPEC_FIELD = object('One Clip specification', clipFields(false))
export const SHOW_LAYER_SPEC_FIELD = object('One overlay Layer specification', {
  zone_id: field('string', 'Zone receiving the Layer'),
  clips: field('array', 'Clips created inside this new Layer', {
    items: object('One nested Clip specification', clipFields(true)),
    maxItems: SHOW_AUTHORING_MAX_BATCH_ITEMS,
  }),
})
export const SHOW_CLIP_PATCH_FIELD = object('One Clip update', {
  clip_id: field('string', 'Existing logical Clip id'),
  zone_id: optional(field('string', 'Final Zone id')),
  layer: optional(field('layer', 'Final Layer')),
  start_ms: optional(integer('Final exact global start time')),
  duration_ms: optional(integer('Final exact duration', 1)),
  properties: optional(SHOW_CLIP_PROPERTIES_FIELD),
})

function ownerForClip(clip: ShowUnifiedTimelineClipProjection): ShowClipInspectorOwner {
  return clip.kind === 'main'
    ? { kind: 'scene-main', sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.startPlacementId }
    : { kind: 'scene-overlay', sceneId: clip.sceneId, zoneId: clip.zoneId, layerId: clip.layerId!, placementId: clip.startPlacementId }
}

function projectedClips(record: ShowRecord): ShowUnifiedTimelineClipProjection[] {
  return record.composition
    ? projectShowUnifiedTimeline(record, record.composition).zones.flatMap(zone => zone.layers.flatMap(layer => layer.clips))
    : []
}

function logicalPlacements(record: ShowRecord, clipId: string): JsonObject[] {
  return (record.composition?.scenes.flatMap(scene => scene.zones.flatMap(zone => [
    ...zone.main,
    ...zone.overlays.flatMap(layer => layer.placements),
  ].filter(placement => (placement.logicalClipId ?? placement.id) === clipId))) ?? []) as unknown as JsonObject[]
}

function readClipPath(record: ShowRecord, clipId: string, path: string): unknown {
  const clip = projectedClips(record).find(candidate => candidate.id === clipId)
  if (!clip) return undefined
  if (path === 'start_ms') return clip.startMs
  if (path === 'duration_ms') return clip.durationMs
  if (path === 'zone_id') return clip.zoneId
  if (path === 'layer') return clip.kind === 'main' ? 'main' : clip.layerIndex
  const inspector = projectShowClipInspector(record, ownerForClip(clip))
  if (!inspector) return undefined
  const [root, leaf, nestedLeaf] = path.split('.')
  if (root === 'time') {
    if (leaf === 'time_scale') return inspector.simulation.timeScale
    if (leaf === 'time_offset_ms') return inspector.simulation.timeOffsetMs
    if (leaf === 'light_shutter') {
      if (!nestedLeaf) return inspector.simulation.lightShutter ?? null
      const stored = ({ rate_hz: 'rateHz', clock_behavior: 'clockBehavior', duty: 'duty', phase: 'phase' } as Record<string, string>)[nestedLeaf]
      return (inspector.simulation.lightShutter as unknown as JsonObject | undefined)?.[stored] ?? null
    }
    if (leaf === 'stepped_clock') {
      if (!nestedLeaf) return inspector.simulation.steppedClock ?? null
      return nestedLeaf === 'step_ms' ? inspector.simulation.steppedClock?.stepMs ?? null : undefined
    }
  }
  if (root === 'controls') return inspector.simulation.controlTargets?.[leaf] ?? null
  if (root === 'evaluation_policy') return inspector.evaluationPolicy
  const placements = logicalPlacements(record, clipId)
  if (root === 'opacity') return placements.map(placement => placement.opacity ?? 1)
  if (root === 'effects') return placements.map(placement => placement.effects ?? [])
  if (root === 'presentation') return placements.map(placement => {
    const presentation = placement.presentation as JsonObject | undefined
    if (!leaf) return presentation ?? { mode: 'live' }
    return leaf === 'cadence_ms' ? presentation?.cadenceMs ?? null : presentation?.mode ?? 'live'
  })
  if (root === 'blink') return placements.map(placement => {
    const blink = placement.blink as JsonObject | undefined
    if (!leaf) return blink ?? null
    const stored = leaf === 'rate_hz' ? 'rateHz' : leaf
    return blink?.[stored] ?? null
  })
  if (root === 'view') return placements.map(placement => (placement.view as JsonObject)[leaf])
  if (root === 'transform') {
    const stored = ({ position_x: 'positionX', position_y: 'positionY', rotation: 'rotation', scale_x: 'scaleX', scale_y: 'scaleY' } as Record<string, string>)[leaf]
    const defaults: JsonObject = { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
    return placements.map(placement => (placement.transform as JsonObject | undefined)?.[stored] ?? defaults[stored])
  }
  if (root === 'aperture') {
    const stored = ({ ring_width: 'ringWidth', corner_radius: 'cornerRadius', cross_width: 'crossWidth', star_points: 'starPoints', star_inner: 'starInner', crescent_offset: 'crescentOffset', polygon_sides: 'polygonSides' } as Record<string, string>)[leaf] ?? leaf
    const defaults: JsonObject = { enabled: false, x: 0, y: 0, width: 1, height: 1, rotation: 0, invert: false }
    return placements.map(placement => (placement.viewport as JsonObject | undefined)?.[stored] ?? defaults[stored] ?? null)
  }
  return undefined
}

function requestedPaths(update: ClipPatch): string[] {
  const paths = ['start_ms', 'duration_ms', 'zone_id', 'layer'].filter(name => (update as JsonObject)[name] !== undefined)
  const properties = update.properties
  if (!properties) return paths
  const addLeaves = (root: string, value: unknown) => {
    if (root === 'effects' || value === null || typeof value !== 'object' || Array.isArray(value)) { paths.push(root); return }
    for (const [leaf, nested] of Object.entries(value as JsonObject)) addLeaves(`${root}.${leaf}`, nested)
  }
  for (const [root, value] of Object.entries(properties)) addLeaves(root, value)
  return paths
}

function normalizedSharedLeaves(properties: ClipProperties): Array<{ path: string; value: unknown }> {
  const leaves: Array<{ path: string; value: unknown }> = []
  const time = properties.time
  if (time) {
    if (time.time_scale !== undefined) leaves.push({ path: 'time.time_scale', value: time.time_scale })
    if (time.time_offset_ms !== undefined) leaves.push({ path: 'time.time_offset_ms', value: Math.round(time.time_offset_ms as number) })
    if (Object.prototype.hasOwnProperty.call(time, 'light_shutter')) {
      if (time.light_shutter === null) leaves.push({ path: 'time.light_shutter', value: null })
      else for (const [name, value] of Object.entries(time.light_shutter as JsonObject)) leaves.push({ path: `time.light_shutter.${name}`, value })
    }
    if (Object.prototype.hasOwnProperty.call(time, 'stepped_clock')) {
      if (time.stepped_clock === null) leaves.push({ path: 'time.stepped_clock', value: null })
      else leaves.push({ path: 'time.stepped_clock.step_ms', value: Math.round((time.stepped_clock as JsonObject).step_ms as number) })
    }
  }
  if (properties.evaluation_policy !== undefined) leaves.push({ path: 'evaluation_policy', value: properties.evaluation_policy })
  for (const [name, value] of Object.entries(properties.controls ?? {})) leaves.push({ path: `controls.${name}`, value })
  return leaves
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value)
}

function validateSharedConflicts(
  record: ShowRecord,
  updates: ClipPatch[],
  inputIndices = updates.map((_, index) => index),
): ShowCommandIssue[] {
  const clips = new Map(projectedClips(record).map(clip => [clip.id, clip]))
  const byInstance = new Map<string, Array<{ index: number; path: string; value: unknown }>>()
  updates.forEach((update, updateIndex) => {
    const index = inputIndices[updateIndex]
    const clip = clips.get(update.clip_id)
    if (!clip || !update.properties) return
    const claims = byInstance.get(clip.instanceId) ?? []
    for (const leaf of normalizedSharedLeaves(update.properties)) {
      claims.push({ index, path: leaf.path, value: leaf.value })
    }
    byInstance.set(clip.instanceId, claims)
  })
  return [...byInstance.values()].flatMap(claims => {
    const conflicting = new Set<number>()
    for (let left = 0; left < claims.length; left += 1) {
      for (let right = left + 1; right < claims.length; right += 1) {
        const a = claims[left]
        const b = claims[right]
        const exactConflict = a.path === b.path && canonical(a.value) !== canonical(b.value)
        const clearConflict = (a.value === null && b.path.startsWith(`${a.path}.`))
          || (b.value === null && a.path.startsWith(`${b.path}.`))
        if (exactConflict || clearConflict) { conflicting.add(left); conflicting.add(right) }
      }
    }
    return [...conflicting].map(claimIndex => {
      const claim = claims[claimIndex]
      return {
        code: 'shared-instance-conflict',
        path: `$.updates[${claim.index}].properties.${claim.path}`,
        message: `Linked Clips request conflicting values for shared instance field ${claim.path}.`,
      }
    })
  })
}

function effectPatch(
  record: ShowRecord,
  clip: ShowUnifiedTimelineClipProjection,
  specs: PublicEffect[],
  path: string,
): { effects: ShowClipEffect[] } | { issues: ShowCommandIssue[] } {
  const current = projectShowClipInspector(record, ownerForClip(clip))?.effects ?? []
  const explicit = new Set<string>()
  const animated = new Set(record.composition!.scenes.flatMap(scene => (scene.propertyTracks ?? []).flatMap(track => (
    track.target.kind === 'placement-effect' && (clip.segmentIds ?? [clip.startPlacementId]).includes(track.target.placementId)
      ? [track.target.effectId]
      : []
  ))))
  const used = new Set<string>()
  const effects: ShowClipEffect[] = []
  for (const [index, spec] of specs.entries()) {
    let id = spec.id
    if (id) {
      if (explicit.has(id)) return { issues: [{ code: 'duplicate-effect-id', path: `${path}[${index}].id`, message: `Effect id ${id} appears more than once.` }] }
      explicit.add(id)
      const existing = current.find(effect => effect.id === id)
      if (!existing) return { issues: [{ code: 'unknown-effect', path: `${path}[${index}].id`, message: `Effect id ${id} does not belong to Clip ${clip.id}.` }] }
      if (existing.kind !== spec.kind) return { issues: [{ code: 'effect-kind-mismatch', path: `${path}[${index}].kind`, message: `Effect ${id} is ${existing.kind}, not ${spec.kind}.` }] }
    } else {
      const sameKind = current.filter(effect => effect.kind === spec.kind && !used.has(effect.id))
      if (sameKind.length > 1 && sameKind.some(effect => animated.has(effect.id))) {
        return { issues: [{ code: 'ambiguous-effect-identity', path: `${path}[${index}]`, message: `Give existing Effect ids to preserve animation ownership for the ${spec.kind} Effects.` }] }
      }
      const sameIndex = current[index]
      if (sameIndex?.kind === spec.kind && !used.has(sameIndex.id)) id = sameIndex.id
      else {
        const candidates = sameKind
        if (candidates.length === 1) id = candidates[0].id
        else if (candidates.some(effect => animated.has(effect.id))) {
          return { issues: [{ code: 'ambiguous-effect-identity', path: `${path}[${index}]`, message: `Give the existing Effect id to preserve animation ownership for reordered ${spec.kind} Effects.` }] }
        } else id = newPersonalContentId()
      }
    }
    used.add(id)
    const item = SHOW_VISUAL_TOOLKIT_PRESENTATION.find(candidate => candidate.kind === 'effect' && candidate.authoringTarget === 'effect-stack' && candidate.variantId === spec.kind)
    if (!item) return { issues: [{ code: 'invalid-effect', path: `${path}[${index}].kind`, message: `Unsupported Effect kind ${spec.kind}.` }] }
    let effect = current.find(candidate => candidate.id === id) ?? createShowClipEffect(item, id)
    for (const [parameter, value] of Object.entries(spec.parameters ?? {})) effect = updateShowClipEffectParameter(effect, parameter, value)
    effects.push(effect)
  }
  const orphan = [...animated].find(id => !effects.some(effect => effect.id === id))
  if (orphan) return { issues: [{ code: 'animated-effect-removed', path, message: `Effect ${orphan} owns animation and cannot be removed by replacement.` }] }
  return { effects }
}

function propertyPatch(
  record: ShowRecord,
  clip: ShowUnifiedTimelineClipProjection,
  properties: ClipProperties,
  context: ShowCommandContext | undefined,
  path: string,
): { patch: ShowClipInspectorPatch; names: ReadonlySet<string>; changedPaths: string[] } | { issues: ShowCommandIssue[] } {
  const current = projectShowClipInspector(record, ownerForClip(clip))
  if (!current) return { issues: [{ code: 'missing-owner', path, message: `Clip ${clip.id} has no property owner.` }] }
  const patch: ShowClipInspectorPatch = {}
  const changedPaths: string[] = []
  let names: ReadonlySet<string> = new Set(Object.keys(current.simulation.controlTargets ?? {}))
  if (properties.opacity !== undefined) { patch.local = { opacity: properties.opacity }; changedPaths.push('opacity') }
  if (properties.view) { patch.view = properties.view; changedPaths.push(...Object.keys(properties.view).map(key => `view.${key}`)) }
  if (properties.transform) {
    const map = { position_x: 'positionX', position_y: 'positionY', rotation: 'rotation', scale_x: 'scaleX', scale_y: 'scaleY' } as const
    patch.transform = Object.fromEntries(Object.entries(properties.transform).map(([key, value]) => [map[key as keyof typeof map], value]))
    changedPaths.push(...Object.keys(properties.transform).map(key => `transform.${key}`))
  }
  if (properties.aperture) {
    const map = { ring_width: 'ringWidth', corner_radius: 'cornerRadius', cross_width: 'crossWidth', star_points: 'starPoints', star_inner: 'starInner', crescent_offset: 'crescentOffset', polygon_sides: 'polygonSides' } as const
    patch.viewport = Object.fromEntries(Object.entries(properties.aperture).map(([key, value]) => [map[key as keyof typeof map] ?? key, value === null ? undefined : value])) as Partial<ShowClipViewport>
    changedPaths.push(...Object.keys(properties.aperture).map(key => `aperture.${key}`))
  }
  if (properties.presentation) {
    changedPaths.push(...Object.keys(properties.presentation).map(key => `presentation.${key}`))
  }
  if (properties.blink !== undefined) {
    changedPaths.push(...(properties.blink === null ? ['blink'] : Object.keys(properties.blink).map(key => `blink.${key}`)))
  }
  if (properties.time) {
    patch.simulation = {
      ...(properties.time.time_scale !== undefined ? { timeScale: properties.time.time_scale as number } : {}),
      ...(properties.time.time_offset_ms !== undefined ? { timeOffsetMs: Math.round(properties.time.time_offset_ms as number) } : {}),
      ...(Object.prototype.hasOwnProperty.call(properties.time, 'light_shutter') ? {
        lightShutter: properties.time.light_shutter === null ? undefined : (() => {
          const prior = current.simulation.lightShutter || { rateHz: 8, duty: 0.5, phase: 0, clockBehavior: 'continue' as const }
          const requested = properties.time!.light_shutter as JsonObject
          return {
            rateHz: (requested.rate_hz ?? prior.rateHz) as number,
            duty: (requested.duty ?? prior.duty) as number,
            phase: (requested.phase ?? prior.phase) as number,
            clockBehavior: (requested.clock_behavior ?? prior.clockBehavior) as 'continue' | 'freeze',
          }
        })(),
      } : {}),
      ...(Object.prototype.hasOwnProperty.call(properties.time, 'stepped_clock') ? {
        steppedClock: properties.time.stepped_clock === null ? undefined : { stepMs: Math.round((properties.time.stepped_clock as JsonObject).step_ms as number) },
      } : {}),
    }
    changedPaths.push(...normalizedSharedLeaves({ time: properties.time }).map(leaf => leaf.path))
  }
  if (properties.evaluation_policy !== undefined) { patch.evaluationPolicy = properties.evaluation_policy as 'live' | 'freeze-at-entry' | 'rolling-refresh'; changedPaths.push('evaluation_policy') }
  if (properties.controls) {
    if (Object.values(properties.controls).some(value => value !== null)) {
      try {
        const source = context?.source(current.pattern)
        names = declaredPatternSliderNames(source)
      } catch {
        return { issues: [{ code: 'unknown-control', path: `${path}.controls`, message: 'Pattern metadata cannot be inspected.' }] }
      }
    }
    const controls = { ...(current.simulation.controlTargets ?? {}) }
    for (const [name, value] of Object.entries(properties.controls)) {
      if (value === null) delete controls[name]
      else {
        if (!names.has(name)) return { issues: [{ code: 'unknown-control', path: `${path}.controls.${name}`, message: `${current.patternName} has no slider export ${name}.`, candidates: [...names] }] }
        controls[name] = value
      }
      changedPaths.push(`controls.${name}`)
    }
    patch.simulation = { ...patch.simulation, controlTargets: controls }
  }
  if (properties.effects) {
    const result = effectPatch(record, clip, properties.effects, `${path}.effects`)
    if ('issues' in result) return result
    patch.effects = result.effects
    changedPaths.push('effects')
  }
  return { patch, names, changedPaths }
}

function patchSegmentSettings(record: ShowRecord, clipId: string, properties: ClipProperties): ShowRecord {
  if (!record.composition || (!properties.presentation && properties.blink === undefined)) return record
  const update = <T extends ShowMainPlacement | ShowOverlayPlacement>(placement: T): T => {
    if ((placement.logicalClipId ?? placement.id) !== clipId) return placement
    let next: ShowMainPlacement | ShowOverlayPlacement = { ...placement }
    if (properties.presentation) {
      const request = properties.presentation
      const current = placement.presentation ?? { mode: 'live' as const }
      const mode = (request.mode ?? current.mode) as ShowClipPresentation['mode']
      let presentation: ShowClipPresentation | undefined
      if (mode === 'strobe') {
        presentation = {
          mode,
          cadenceMs: Math.round((request.cadence_ms ?? (current.mode === 'strobe' ? current.cadenceMs : 1_000)) as number),
        }
      } else if (mode === 'freeze') presentation = { mode }
      const { presentation: _prior, ...withoutPresentation } = next
      next = presentation ? { ...withoutPresentation, presentation } : withoutPresentation
    }
    if (properties.blink !== undefined) {
      const { blink: _prior, ...withoutBlink } = next
      if (properties.blink === null) next = withoutBlink
      else {
        const prior: ShowClipBlink = placement.blink ?? { rateHz: 2, duty: 0.5, phase: 0 }
        next = { ...withoutBlink, blink: {
          rateHz: (properties.blink.rate_hz ?? prior.rateHz) as number,
          duty: (properties.blink.duty ?? prior.duty) as number,
          phase: (properties.blink.phase ?? prior.phase) as number,
        } }
      }
    }
    return next as T
  }
  return {
    ...record,
    composition: {
      ...record.composition,
      scenes: record.composition.scenes.map(scene => ({
        ...scene,
        zones: scene.zones.map(zone => ({
          ...zone,
          main: zone.main.map(update),
          overlays: zone.overlays.map(layer => ({ ...layer, placements: layer.placements.map(update) })),
        })),
      })),
    },
  }
}

function applyProperties(
  record: ShowRecord,
  clipId: string,
  properties: ClipProperties,
  context: ShowCommandContext | undefined,
  path: string,
): { record: ShowRecord; changedPaths: string[] } | { issues: ShowCommandIssue[] } {
  const clip = projectedClips(record).find(candidate => candidate.id === clipId)
  if (!clip) return { issues: [{ code: 'unknown-clip', path, message: `Clip ${clipId} does not exist.` }] }
  const result = propertyPatch(record, clip, properties, context, path)
  if ('issues' in result) return result
  const next = patchSegmentSettings(
    updateShowClipInspector(record, ownerForClip(clip), result.patch, result.names),
    clipId,
    properties,
  )
  const changedPaths = result.changedPaths.filter(changedPath => (
    canonical(readClipPath(record, clipId, changedPath)) !== canonical(readClipPath(next, clipId, changedPath))
  ))
  // Preserve byte-for-byte identity when an explicit neutral value has the
  // same public meaning as an omitted default (for example opacity 1 or []).
  return changedPaths.length ? { record: next, changedPaths } : { record, changedPaths: [] }
}

function versionIssue(input: JsonObject): ShowCommandIssue[] {
  return input.schema_version === SHOW_AUTHORING_SCHEMA_VERSION ? [] : [{ code: 'unsupported-schema-version', path: '$.schema_version', message: `schema_version must be ${SHOW_AUTHORING_SCHEMA_VERSION}.` }]
}

function patternIssue(pattern: PublicPattern, context: ShowCommandContext | undefined, path: string): ShowCommandIssue[] {
  try {
    if (context?.source(pattern) !== undefined) return []
  } catch {
    // The caller-facing result is the same whether lookup failed or returned no source.
  }
  return [{ code: 'unknown-pattern', path, message: `Pattern ${pattern.kind}:${pattern.id} is unavailable. Use an exact Pattern id from the current catalogue.`, candidates: [] }]
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
}

function patternValue(value: unknown): PublicPattern | null {
  const pattern = objectValue(value)
  return pattern && (pattern.kind === 'stock' || pattern.kind === 'user') && typeof pattern.id === 'string'
    ? pattern as PublicPattern
    : null
}

function controlReferenceIssues(
  pattern: PublicPattern,
  properties: unknown,
  context: ShowCommandContext | undefined,
  path: string,
): ShowCommandIssue[] {
  const controls = objectValue(objectValue(properties)?.controls)
  const requested = Object.entries(controls ?? {}).filter(([, value]) => value !== null)
  if (!requested.length) return []
  let names: ReadonlySet<string>
  try {
    names = declaredPatternSliderNames(context?.source(pattern))
  } catch {
    return [{ code: 'unknown-control', path: `${path}.controls`, message: 'Pattern metadata cannot be inspected.' }]
  }
  return requested.flatMap(([name]) => names.has(name) ? [] : [{
    code: 'unknown-control',
    path: `${path}.controls.${name}`,
    message: `${pattern.id} has no slider export ${name}.`,
    candidates: [...names],
  }])
}

function layerReferenceIssues(
  record: ShowRecord,
  zoneId: string,
  layer: unknown,
  startMs: unknown,
  durationMs: unknown,
  path: string,
): ShowCommandIssue[] {
  if (layer === 'main' || typeof layer !== 'number' || !record.composition) return []
  if (!validExactInterval(startMs, durationMs)) return []
  const resolution = resolveShowClipOverlayLayerSpan(record, record.composition, {
    zoneId,
    layerIndex: layer,
    globalStartMs: startMs,
    durationMs: durationMs as number,
  })
  if (resolution.status === 'accepted') return []
  return [{
    code: resolution.code === 'group-owned-layer' ? 'unsupported-topology' : resolution.code,
    path,
    message: resolution.reason,
    candidates: resolution.candidates.map(String),
  }]
}

function validExactInterval(start: unknown, duration: unknown): start is number {
  return Number.isSafeInteger(start) && Number.isSafeInteger(duration) && (start as number) >= 0 && (duration as number) > 0
}

function createClipsPreflight(record: ShowRecord, input: JsonObject, context?: ShowCommandContext): ShowCommandIssue[] {
  const specs = Array.isArray(input.clips) ? input.clips : []
  const duration = record.composition ? projectShowUnifiedTimeline(record, record.composition).durationMs : null
  return specs.flatMap((raw, inputIndex) => {
    const spec = objectValue(raw)
    if (!spec) return []
    const pattern = patternValue(spec.pattern)
    const zoneId = typeof spec.zone_id === 'string' ? spec.zone_id : null
    const zoneExists = zoneId !== null && record.zones.some(zone => zone.id === zoneId)
    return [
      ...(pattern ? patternIssue(pattern, context, `$.clips[${inputIndex}].pattern`) : []),
      ...(zoneId !== null && !zoneExists ? [{ code: 'unknown-zone', path: `$.clips[${inputIndex}].zone_id`, message: `Zone ${zoneId} does not exist.`, candidates: record.zones.map(zone => zone.id) }] : []),
      ...(zoneExists ? layerReferenceIssues(record, zoneId!, spec.layer, spec.start_ms, spec.duration_ms, `$.clips[${inputIndex}].layer`) : []),
      ...(duration !== null && validExactInterval(spec.start_ms, spec.duration_ms) && spec.start_ms + (spec.duration_ms as number) > duration
        ? [{ code: 'out-of-bounds', path: `$.clips[${inputIndex}].duration_ms`, message: `The exact Clip span must remain inside Show End ${duration} ms.` }]
        : []),
      ...(pattern ? controlReferenceIssues(pattern, spec.properties, context, `$.clips[${inputIndex}].properties`) : []),
    ]
  })
}

function createLayersPreflight(record: ShowRecord, input: JsonObject, context?: ShowCommandContext): ShowCommandIssue[] {
  const specs = Array.isArray(input.layers) ? input.layers : []
  const duration = record.composition ? projectShowUnifiedTimeline(record, record.composition).durationMs : null
  return specs.flatMap((raw, inputIndex) => {
    const spec = objectValue(raw)
    if (!spec) return []
    const zoneId = typeof spec.zone_id === 'string' ? spec.zone_id : null
    const clips = Array.isArray(spec.clips) ? spec.clips : []
    return [
      ...(zoneId !== null && !record.zones.some(zone => zone.id === zoneId) ? [{ code: 'unknown-zone', path: `$.layers[${inputIndex}].zone_id`, message: `Zone ${zoneId} does not exist.`, candidates: record.zones.map(zone => zone.id) }] : []),
      ...clips.flatMap((rawClip, clipIndex) => {
        const clip = objectValue(rawClip)
        if (!clip) return []
        const pattern = patternValue(clip.pattern)
        return [
          ...(pattern ? patternIssue(pattern, context, `$.layers[${inputIndex}].clips[${clipIndex}].pattern`) : []),
          ...(duration !== null && validExactInterval(clip.start_ms, clip.duration_ms) && clip.start_ms + (clip.duration_ms as number) > duration
            ? [{ code: 'out-of-bounds', path: `$.layers[${inputIndex}].clips[${clipIndex}].duration_ms`, message: `The exact Clip span must remain inside Show End ${duration} ms.` }]
            : []),
          ...(pattern ? controlReferenceIssues(pattern, clip.properties, context, `$.layers[${inputIndex}].clips[${clipIndex}].properties`) : []),
        ]
      }),
    ]
  })
}

function sharedPatchShapeIsUsable(properties: unknown): properties is ClipProperties {
  const value = objectValue(properties)
  if (!value) return false
  const time = value.time === undefined ? null : objectValue(value.time)
  if (value.time !== undefined && !time) return false
  if (time?.light_shutter !== undefined && time.light_shutter !== null && !objectValue(time.light_shutter)) return false
  if (time?.stepped_clock !== undefined && time.stepped_clock !== null && !objectValue(time.stepped_clock)) return false
  if (value.controls !== undefined && !objectValue(value.controls)) return false
  return true
}

function updateClipsPreflight(record: ShowRecord, input: JsonObject, context?: ShowCommandContext): ShowCommandIssue[] {
  const rawUpdates = Array.isArray(input.updates) ? input.updates : []
  const updates = rawUpdates.flatMap((raw, inputIndex) => {
    const value = objectValue(raw)
    return value && typeof value.clip_id === 'string' ? [{ value, inputIndex }] : []
  })
  const clips = new Map(projectedClips(record).map(clip => [clip.id, clip]))
  const typed = updates.filter(update => sharedPatchShapeIsUsable(update.value.properties))
  const duplicateIssues: ShowCommandIssue[] = []
  const seen = new Set<string>()
  for (const { value, inputIndex } of updates) {
    const clipId = value.clip_id as string
    if (seen.has(clipId)) duplicateIssues.push({ code: 'duplicate-target', path: `$.updates[${inputIndex}].clip_id`, message: `Clip ${clipId} appears more than once.` })
    seen.add(clipId)
  }
  return [
    ...duplicateIssues,
    ...updates.flatMap(({ value, inputIndex }) => Object.keys(value).length === 1
      ? [{ code: 'empty-patch', path: `$.updates[${inputIndex}]`, message: 'Each update must contain at least one changed field.' }]
      : []),
    ...validateSharedConflicts(record, typed.map(entry => entry.value) as unknown as ClipPatch[], typed.map(entry => entry.inputIndex)),
    ...updates.flatMap(({ value, inputIndex }) => clips.has(value.clip_id as string) ? [] : [{ code: 'unknown-clip', path: `$.updates[${inputIndex}].clip_id`, message: `Clip ${value.clip_id} does not exist.`, candidates: [...clips.keys()] }]),
    ...updates.flatMap(({ value, inputIndex }) => {
      const clip = clips.get(value.clip_id as string)
      if (!clip) return []
      if (clip.groupOccurrenceId) return [{
        code: 'group-owned',
        path: `$.updates[${inputIndex}].clip_id`,
        message: `Clip ${clip.id} is owned by Group occurrence ${clip.groupOccurrenceId}.`,
      }]
      const zoneId = typeof value.zone_id === 'string' ? value.zone_id : clip.zoneId
      if (!record.zones.some(zone => zone.id === zoneId)) return [{ code: 'unknown-zone', path: `$.updates[${inputIndex}].zone_id`, message: `Zone ${zoneId} does not exist.`, candidates: record.zones.map(zone => zone.id) }]
      const layer = value.layer ?? (clip.kind === 'main' ? 'main' : clip.layerIndex)
      const startMs = value.start_ms ?? clip.startMs
      const durationMs = value.duration_ms ?? clip.durationMs
      return layerReferenceIssues(record, zoneId, layer, startMs, durationMs, `$.updates[${inputIndex}].layer`)
    }),
    ...updates.flatMap(({ value, inputIndex }) => {
      const clip = clips.get(value.clip_id as string)
      const instance = record.composition?.patternInstances.find(candidate => candidate.id === clip?.instanceId)
      return instance ? controlReferenceIssues(instance.pattern, value.properties, context, `$.updates[${inputIndex}].properties`) : []
    }),
  ]
}

function createClipsOutcome(record: ShowRecord, input: JsonObject, context?: ShowCommandContext): ShowCommandOutcome {
  const versions = versionIssue(input)
  if (versions.length) return { ok: false, issues: versions }
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const specs = input.clips as ClipSpec[]
  const referenceIssues = createClipsPreflight(record, input, context)
  if (referenceIssues.length) return { ok: false, issues: referenceIssues }
  let working: ShowRecord = { ...record, composition: resolved.composition }
  const results: JsonObject[] = []
  for (const [inputIndex, spec] of specs.entries()) {
    const instance: ShowPatternInstance = {
      id: newPersonalContentId(), pattern: spec.pattern, patternName: spec.pattern.id,
      time: { timeScale: 1, timeOffsetMs: 0 },
    }
    const clipId = newPersonalContentId()
    const next = createShowClipGlobalSpan(working, working.composition!, {
      instance, placementId: clipId, zoneId: spec.zone_id, layer: spec.layer,
      globalStartMs: spec.start_ms, durationMs: spec.duration_ms,
    })
    if (next === working.composition) return refuseShowCommand({ code: 'occupied', path: `$.clips[${inputIndex}].start_ms`, message: 'The exact requested Clip span is unavailable.' })
    working = { ...working, composition: next }
    if (spec.properties) {
      const propertyResult = applyProperties(working, clipId, spec.properties, context, `$.clips[${inputIndex}].properties`)
      if ('issues' in propertyResult) return { ok: false, issues: propertyResult.issues }
      working = propertyResult.record
    }
    results.push({ inputIndex, clipId, instanceId: instance.id, zoneId: spec.zone_id, layer: spec.layer, startMs: spec.start_ms, durationMs: spec.duration_ms })
  }
  return {
    ok: true,
    record: withComposition(record, working.composition!),
    changes: [{ command: 'create_clips', targetId: results[0].clipId as string, description: `Created ${results.length} Clip${results.length === 1 ? '' : 's'}.`, details: { results } }],
  }
}

function createLayersOutcome(record: ShowRecord, input: JsonObject, context?: ShowCommandContext): ShowCommandOutcome {
  const versions = versionIssue(input)
  if (versions.length) return { ok: false, issues: versions }
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const specs = input.layers as Array<{ zone_id: string; clips: Omit<ClipSpec, 'zone_id' | 'layer'>[] }>
  const referenceIssues = createLayersPreflight(record, input, context)
  if (referenceIssues.length) return { ok: false, issues: referenceIssues }
  let working: ShowRecord = { ...record, composition: resolved.composition }
  const layers: JsonObject[] = Array(specs.length)
  for (let inputIndex = specs.length - 1; inputIndex >= 0; inputIndex -= 1) {
    const spec = specs[inputIndex]
    const layerIdsBySceneId = Object.fromEntries(working.composition!.scenes.map(scene => [scene.sceneId, newPersonalContentId()]))
    const next = addShowOverlayLayerAcrossTimeline(working, working.composition!, {
      zoneId: spec.zone_id,
      layers: working.composition!.scenes.map(scene => ({ sceneId: scene.sceneId, layerId: layerIdsBySceneId[scene.sceneId] })),
    })
    if (next === working.composition) return refuseShowCommand({ code: 'missing-zone', path: `$.layers[${inputIndex}].zone_id`, message: `Zone ${spec.zone_id} cannot receive an overlay Layer.` })
    working = { ...working, composition: next }
    layers[inputIndex] = { inputIndex, zoneId: spec.zone_id, layerIdsBySceneId, clipResults: [] }
  }
  let clipCount = 0
  for (const [inputIndex, spec] of specs.entries()) {
    const layerIndex = specs.slice(0, inputIndex).filter(candidate => candidate.zone_id === spec.zone_id).length
    for (const [clipIndex, nested] of spec.clips.entries()) {
      const instance: ShowPatternInstance = { id: newPersonalContentId(), pattern: nested.pattern, patternName: nested.pattern.id, time: { timeScale: 1, timeOffsetMs: 0 } }
      const clipId = newPersonalContentId()
      const next = createShowClipGlobalSpan(working, working.composition!, {
        instance, placementId: clipId, zoneId: spec.zone_id, layer: layerIndex,
        globalStartMs: nested.start_ms, durationMs: nested.duration_ms,
      })
      if (next === working.composition) return refuseShowCommand({ code: 'occupied', path: `$.layers[${inputIndex}].clips[${clipIndex}].start_ms`, message: 'The exact requested Clip span is unavailable.' })
      working = { ...working, composition: next }
      if (nested.properties) {
        const propertyResult = applyProperties(working, clipId, nested.properties, context, `$.layers[${inputIndex}].clips[${clipIndex}].properties`)
        if ('issues' in propertyResult) return { ok: false, issues: propertyResult.issues }
        working = propertyResult.record
      }
      ;(layers[inputIndex].clipResults as JsonObject[]).push({ inputIndex: clipIndex, clipId, instanceId: instance.id, startMs: nested.start_ms, durationMs: nested.duration_ms })
      clipCount += 1
    }
  }
  return {
    ok: true,
    record: withComposition(record, working.composition!),
    changes: [{ command: 'create_layers', targetId: Object.values(layers[0].layerIdsBySceneId as Record<string, string>)[0], description: `Created ${layers.length} Layer${layers.length === 1 ? '' : 's'} with ${clipCount} Clip${clipCount === 1 ? '' : 's'}.`, details: { layers } }],
  }
}

function updateClipsOutcome(record: ShowRecord, input: JsonObject, context?: ShowCommandContext): ShowCommandOutcome {
  const versions = versionIssue(input)
  if (versions.length) return { ok: false, issues: versions }
  const updates = input.updates as ClipPatch[]
  const preliminaryIssues = updateClipsPreflight(record, input, context)
  if (preliminaryIssues.length) return { ok: false, issues: preliminaryIssues }
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const beforeClips = new Map(projectedClips(record).map(clip => [clip.id, clip]))
  let working: ShowRecord = { ...record, composition: resolved.composition }
  const arrangementRequests = updates.flatMap((update, inputIndex) => {
    const before = beforeClips.get(update.clip_id)!
    const changesArrangement = update.start_ms !== undefined || update.duration_ms !== undefined || update.zone_id !== undefined || update.layer !== undefined
    const request = {
      inputIndex,
      clipId: update.clip_id,
      zoneId: update.zone_id ?? before.zoneId,
      layer: update.layer ?? (before.kind === 'main' ? 'main' : before.layerIndex),
      globalStartMs: update.start_ms ?? before.startMs,
      durationMs: update.duration_ms ?? before.durationMs,
    }
    const same = request.zoneId === before.zoneId
      && request.layer === (before.kind === 'main' ? 'main' : before.layerIndex)
      && request.globalStartMs === before.startMs
      && request.durationMs === before.durationMs
    return changesArrangement && !same ? [request] : []
  })
  if (arrangementRequests.length) {
    const arranged = arrangeShowClipsFinalState(record, resolved.composition, arrangementRequests)
    if (arranged.status === 'refused') return refuseShowCommand({ code: arranged.code, path: `$.updates[${arranged.inputIndex}].${arranged.field}`, message: arranged.reason })
    working = { ...working, composition: arranged.composition }
  }
  for (const [inputIndex, update] of updates.entries()) {
    if (update.properties) {
      const propertyResult = applyProperties(working, update.clip_id, update.properties, context, `$.updates[${inputIndex}].properties`)
      if ('issues' in propertyResult) return { ok: false, issues: propertyResult.issues }
      working = propertyResult.record
    }
  }
  if (JSON.stringify(working.composition) === JSON.stringify(resolved.composition)) return { ok: true, record, changes: [] }
  const changedByInput = updates.map(update => requestedPaths(update).filter(path => (
    canonical(readClipPath(record, update.clip_id, path)) !== canonical(readClipPath(working, update.clip_id, path))
  )))
  const directClipIds = updates.flatMap((update, index) => changedByInput[index].length ? [update.clip_id] : [])
  const changedInstanceIds = new Set(updates.flatMap((update, index) => (
    normalizedSharedLeaves(update.properties ?? {}).some(leaf => changedByInput[index].includes(leaf.path)) ? [beforeClips.get(update.clip_id)!.instanceId] : []
  )))
  const linkedClipIds = projectedClips(record).filter(clip => changedInstanceIds.has(clip.instanceId) && !directClipIds.includes(clip.id)).map(clip => clip.id)
  const changedPaths = [...new Set(changedByInput.flat())].sort()
  const finalClips = new Map(projectedClips(working).map(clip => [clip.id, clip]))
  const results = updates.map((update, inputIndex) => {
    const final = finalClips.get(update.clip_id)!
    return { inputIndex, clipId: update.clip_id, status: changedByInput[inputIndex].length ? 'changed' : 'no-op', changedPaths: changedByInput[inputIndex], zoneId: final.zoneId, layer: final.kind === 'main' ? 'main' : final.layerIndex, startMs: final.startMs, durationMs: final.durationMs, instanceId: final.instanceId }
  })
  const linked = linkedClipIds.length ? `; ${linkedClipIds.length} linked Clip${linkedClipIds.length === 1 ? '' : 's'} also affected` : ''
  const labels: Record<string, string> = { 'view.brightness': 'brightness', 'time.time_scale': 'speed', start_ms: 'start time', duration_ms: 'duration', opacity: 'opacity', effects: 'Effects' }
  const summary = changedPaths.length === 1
    ? `Updated ${labels[changedPaths[0]] ?? changedPaths[0]} on ${directClipIds.length} Clip${directClipIds.length === 1 ? '' : 's'}${linked}.`
    : `Updated ${changedPaths.length} properties across ${directClipIds.length} Clip${directClipIds.length === 1 ? '' : 's'}${linked}.`
  return {
    ok: true,
    record: withComposition(record, working.composition!),
    changes: [{ command: 'update_clips', targetId: directClipIds[0], description: summary, details: { directClipIds, linkedClipIds, changedInstanceIds: [...changedInstanceIds], changedPaths, results } }],
  }
}

const version: ShowCommandField = {
  ...integer('Authoring schema version', SHOW_AUTHORING_SCHEMA_VERSION),
  maximum: SHOW_AUTHORING_SCHEMA_VERSION,
  issueCode: 'unsupported-schema-version',
}
export const SHOW_BULK_AUTHORING_COMMANDS: ShowCommandDescriptor[] = [
  {
    name: 'create_clips',
    description: `Create 1–${SHOW_AUTHORING_MAX_BATCH_ITEMS} exactly configured Clips atomically. Times are global whole milliseconds; spans never clamp, ripple, extend the Show, or enter Transition windows.`,
    touches: ['/composition/patternInstances', '/composition/scenes/*/zones/*/main', '/composition/scenes/*/zones/*/overlays/*/placements', '/composition/executionModel', '/updatedAt'],
    fields: { schema_version: version, clips: field('array', 'Clip specifications', { items: SHOW_CLIP_SPEC_FIELD, minItems: 1, maxItems: SHOW_AUTHORING_MAX_BATCH_ITEMS }) },
    preflight: createClipsPreflight,
    apply: createClipsOutcome,
  },
  {
    name: 'create_layers',
    description: `Create 1–${SHOW_AUTHORING_MAX_BATCH_ITEMS} overlay Layers atomically, optionally with exactly configured Clips. Array order is final front-to-back order and index 0 is topmost.`,
    touches: ['/composition/patternInstances', '/composition/scenes/*/zones/*/overlays', '/composition/executionModel', '/updatedAt'],
    fields: { schema_version: version, layers: field('array', 'Layer specifications', { items: SHOW_LAYER_SPEC_FIELD, minItems: 1, maxItems: SHOW_AUTHORING_MAX_BATCH_ITEMS }) },
    preflight: createLayersPreflight,
    apply: createLayersOutcome,
  },
  {
    name: 'update_clips',
    description: `Patch 1–${SHOW_AUTHORING_MAX_BATCH_ITEMS} existing logical Clips atomically. Placement changes validate only the final arrangement, so swaps and rotations are supported; omitted nested properties are retained.`,
    touches: ['/composition/patternInstances/*', '/composition/scenes/*/zones/*/main/*', '/composition/scenes/*/zones/*/overlays/*/placements/*', '/composition/scenes/*/propertyTracks', '/updatedAt'],
    fields: { schema_version: version, updates: field('array', 'Clip patches', { items: SHOW_CLIP_PATCH_FIELD, minItems: 1, maxItems: SHOW_AUTHORING_MAX_BATCH_ITEMS }) },
    preflight: updateClipsPreflight,
    apply: updateClipsOutcome,
  },
]
