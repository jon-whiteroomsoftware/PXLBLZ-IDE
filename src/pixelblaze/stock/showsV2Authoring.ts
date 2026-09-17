// Native v2 stock authoring vocabulary (#1040).
//
// The stock catalogue is authored twice during the Scene retirement: the pinned
// legacy v1 builder in `shows.ts` still feeds production and the parity harness,
// and this module owns the native v2 authoring the catalogue moves to at #1039.
// Nothing here calls the v1 converter; a native Show is assembled from explicit
// Clips, Layers, Transition relationships, Layout occurrences, independent
// animation and Markers, exactly as the v2 record model defines them.
//
// The identity conventions below deliberately match the ones v1 conversion
// derives (`layer:<zone>:main`, `layout-occurrence:<n>`, `scene-marker:<scene>`,
// `<clip>:appearance:1`). Keeping them lets the native/converted comparison in
// `scripts/show-v2-native-parity.ts` compare records directly instead of through
// an identity remap, and keeps compiled member identity stable across cutover.
import type {
  ShowClipBlink,
  ShowClipEffect,
  ShowClipPresentation,
  ShowClipTransform,
  ShowClipViewport,
  ShowOutputContract,
  ShowPatternInstance,
  ShowPlacementView,
  ShowRoutingDirection,
  ShowRoutingLayout,
  ShowStructuredEasing,
  ShowZone,
} from '@/engine/personalContentRecords'
import type {
  ShowClipAppearanceValueV2,
  ShowClipV2,
  ShowGroupClipV2,
  ShowGroupDefinitionV2,
  ShowGroupLayerV2,
  ShowGroupOccurrenceV2,
  ShowLayerV2,
  ShowLayoutOccurrenceV2,
  ShowMarkerV2,
  ShowPropertyKeyframeV2,
  ShowPropertyTargetV2,
  ShowPropertyTrackV2,
  ShowRecordV2,
  ShowTransitionV2,
} from '@/engine/showCompositionV2'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
} from '@/engine/showOutputContract'

/** Shared with the pinned legacy catalogue so both sides stamp one vintage. */
export const STOCK_SHOW_UPDATED_AT = 364
/** 44 x 44: the largest complete square under SHOW_MAX_OUTPUT_PIXELS (2,000). */
export const PORTABLE_REFERENCE_PIXELS = 1_936
/** Foundation lessons share one Show-wide pace instead of per-Clip knob work. */
export const LESSON_TIME_SCALE = 0.32

export const SINE_IN_OUT: ShowStructuredEasing = { curve: 'sine', direction: 'in-out' }
export const SINE_OUT: ShowStructuredEasing = { curve: 'sine', direction: 'out' }
export const CUBIC_IN_OUT: ShowStructuredEasing = { curve: 'cubic', direction: 'in-out' }
export const CUBIC_IN: ShowStructuredEasing = { curve: 'cubic', direction: 'in' }
export const CUBIC_OUT: ShowStructuredEasing = { curve: 'cubic', direction: 'out' }
export const LINEAR: ShowStructuredEasing = { curve: 'linear' }
export const QUADRATIC_IN: ShowStructuredEasing = { curve: 'quadratic', direction: 'in' }

const ZONE_COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#22c55e']

export const NEUTRAL_VIEW: ShowPlacementView = { mirror: false, phase: 0, brightness: 1 }

/** Zones sized by an even split of one portable output. */
export function logicalZones(names: readonly string[], pixelCount: number): ShowZone[] {
  const base = Math.floor(pixelCount / names.length)
  return names.map((name, index) => ({
    id: `zone-${index + 1}`,
    name,
    nominalPixelCount: index === names.length - 1 ? pixelCount - base * index : base,
    color: ZONE_COLORS[index % ZONE_COLORS.length],
  }))
}

/** Zones sized by the physical surfaces of an installation Stage. */
export function physicalZones(names: readonly string[], counts: readonly number[]): ShowZone[] {
  return names.map((name, index) => ({
    id: `zone-${index + 1}`,
    name,
    nominalPixelCount: counts[index],
    color: ZONE_COLORS[index % ZONE_COLORS.length],
  }))
}

export function singleLayout(zones: readonly ShowZone[], id = 'layout-main', name = 'Main'): ShowRoutingLayout {
  return { id, name, zones: [], logical: { kind: 'single', zoneIds: [zones[0].id] } }
}

export function splitLayout(id: string, name: string, zones: readonly ShowZone[], axis: 'x' | 'y'): ShowRoutingLayout {
  return { id, name, zones: [], logical: { kind: 'split', zoneIds: [zones[0].id, zones[1].id], axis } }
}

export function logicalLayout(id: string, name: string, logical: ShowRoutingLayout['logical']): ShowRoutingLayout {
  return { id, name, zones: [], logical }
}

export function physicalLayout(
  id: string,
  name: string,
  zones: readonly ShowZone[],
  ranges: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  logical?: ShowRoutingLayout['logical'],
): ShowRoutingLayout {
  return {
    id,
    name,
    zones: zones.map((zone, index) => ({
      zoneId: zone.id,
      ranges: ranges[index].map(([start, end]) => ({ start, end })),
    })),
    ...(logical ? { logical } : {}),
  }
}

export function portableOutputContract(pixelCount = PORTABLE_REFERENCE_PIXELS): ShowOutputContract {
  return createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: pixelCount })
}

export function installationOutputContract(mapId: string, pixelCount: number): ShowOutputContract {
  return createInstallationShowOutputContract({ outputMapId: mapId, pixelCount })
}

export function instance(
  id: string,
  pattern: string,
  timeScale: number,
  controlTargets?: Record<string, number>,
): ShowPatternInstance {
  return {
    id,
    pattern: { kind: 'stock', id: pattern },
    patternName: pattern,
    time: { timeScale, timeOffsetMs: 0 },
    ...(controlTargets ? { controlTargets } : {}),
  }
}

/** A Pattern instance whose clock advances in visible steps rather than smoothly. */
export function steppedInstance(
  id: string,
  pattern: string,
  timeScale: number,
  stepMs: number,
): ShowPatternInstance {
  const base = instance(id, pattern, timeScale)
  return { ...base, time: { ...base.time, steppedClock: { stepMs } } }
}

/**
 * A Pattern instance whose clock starts at an authored offset. Only the
 * Coronal Mass Ejection remix uses one: its flare lands on a calibrated
 * Pattern-clock phase rather than at the Show's time zero.
 */
export function offsetInstance(
  id: string,
  pattern: string,
  timeScale: number,
  timeOffsetMs: number,
  controlTargets?: Record<string, number>,
): ShowPatternInstance {
  return {
    id,
    pattern: { kind: 'stock', id: pattern },
    patternName: pattern,
    time: { timeScale, timeOffsetMs },
    ...(controlTargets ? { controlTargets } : {}),
  }
}

/** The bottom Layer every Zone owns for its whole Show. */
export function mainLayer(zoneId: string, name = 'Main'): ShowLayerV2 {
  return { id: `layer:${zoneId}:main`, zoneId, name, rank: 0 }
}

/** An explicit Layer above the Zone's Main Layer; `index` is one-based. */
export function overlayLayer(zoneId: string, index: number, name: string): ShowLayerV2 {
  return { id: `layer:${zoneId}:overlay:${index}`, zoneId, name, rank: index }
}

export function mainLayerId(zoneId: string): string {
  return `layer:${zoneId}:main`
}

export function overlayLayerId(zoneId: string, index: number): string {
  return `layer:${zoneId}:overlay:${index}`
}

/** Held appearance a Clip owns from its start, beyond the neutral defaults. */
export interface ClipAppearanceInput {
  opacity?: number
  view?: Partial<ShowPlacementView>
  presentation?: ShowClipPresentation
  blink?: ShowClipBlink
  transform?: ShowClipTransform
  aperture?: ShowClipViewport
  effects?: ShowClipEffect[]
}

/**
 * One Clip with one held appearance key at its nominal start. Stock
 * choreography never authored a second key, so a Clip's appearance is complete
 * from entry; adding one later is an ordinary v2 edit, not a builder concern.
 */
export function clip(
  id: string,
  instanceId: string,
  zoneId: string,
  layerId: string,
  startMs: number,
  durationMs: number,
  appearance: ClipAppearanceInput = {},
): ShowClipV2 {
  const value: ShowClipAppearanceValueV2 = {
    opacity: appearance.opacity ?? 1,
    view: { ...NEUTRAL_VIEW, ...appearance.view },
    ...(appearance.presentation ? { presentation: appearance.presentation } : {}),
    ...(appearance.blink ? { blink: appearance.blink } : {}),
    ...(appearance.transform ? { transform: appearance.transform } : {}),
    ...(appearance.aperture ? { aperture: appearance.aperture } : {}),
    effects: appearance.effects ?? [],
  }
  return {
    id,
    instanceId,
    zoneId,
    layerId,
    startMs,
    durationMs,
    entryPolicy: 'continue',
    // Stock Zones sample the whole Stage span rather than one Zone's own frame.
    zoneSampleMode: 'span',
    appearance: { keys: [{ id: `${id}:appearance:1`, timeMs: startMs, value }] },
  }
}

/** A Layer Transition joining two Clips on one Zone and Layer. */
export function layerTransition(
  id: string,
  kind: ShowTransitionV2['kind'],
  zoneId: string,
  layerId: string,
  fromClipId: string,
  toClipId: string,
  durationMs: number,
  easing: ShowStructuredEasing,
  settings: Partial<Omit<ShowTransitionV2, 'id' | 'kind' | 'durationMs' | 'easing' | 'participants' | 'propertyRamps' | 'wholeOutput'>> = {},
): ShowTransitionV2 {
  return {
    id,
    kind,
    durationMs,
    easing,
    ...settings,
    participants: [{ id: `${id}:participant:1`, zoneId, layerId, fromClipId, toClipId }],
    propertyRamps: [],
  }
}

/**
 * A whole-output Transition: one global window with explicit, possibly unequal
 * contributor sets. Stock boundaries that exchange more than one Layer pair, or
 * that carry a scalar ramp, own the whole output rather than pretending to be a
 * pairwise junction.
 */
export function wholeOutputTransition(
  id: string,
  kind: ShowTransitionV2['kind'],
  startMs: number,
  fromClipIds: readonly string[],
  toClipIds: readonly string[],
  durationMs: number,
  easing: ShowStructuredEasing,
  settings: Partial<Omit<ShowTransitionV2, 'id' | 'kind' | 'durationMs' | 'easing' | 'participants' | 'propertyRamps' | 'wholeOutput'>> = {},
  propertyRamps: ShowTransitionV2['propertyRamps'] = [],
): ShowTransitionV2 {
  return {
    id,
    kind,
    durationMs,
    easing,
    ...settings,
    wholeOutput: { startMs, fromClipIds: [...fromClipIds], toClipIds: [...toClipIds] },
    participants: [],
    propertyRamps,
  }
}

/** One Layout occurrence; `index` is its one-based position in the coverage. */
export function occurrence(
  index: number,
  layoutId: string,
  startMs: number,
  durationMs: number,
  parameters: ShowLayoutOccurrenceV2['parameters'] = {},
  incomingTransfer?: ShowLayoutOccurrenceV2['incomingTransfer'],
): ShowLayoutOccurrenceV2 {
  return {
    id: `layout-occurrence:${index}`,
    layoutId,
    startMs,
    durationMs,
    parameters,
    ...(incomingTransfer ? { incomingTransfer } : {}),
  }
}

/** A timed routing transfer into the occurrence that owns it. */
export function transfer(
  id: string,
  fromOccurrenceIndex: number,
  durationMs: number,
  direction: ShowRoutingDirection = 'forward',
  easing?: ShowStructuredEasing,
): NonNullable<ShowLayoutOccurrenceV2['incomingTransfer']> {
  return {
    id,
    fromOccurrenceId: `layout-occurrence:${fromOccurrenceIndex}`,
    durationMs,
    direction,
    ...(easing ? { easing } : {}),
  }
}

export function propertyKey(
  id: string,
  timeMs: number,
  value: number,
  easing: ShowStructuredEasing = SINE_IN_OUT,
): ShowPropertyKeyframeV2 {
  return { id, timeMs, value, easing }
}

/** A globally timed animation track with its own explicit activation window. */
export function propertyTrack(
  id: string,
  target: ShowPropertyTargetV2,
  activeStartMs: number,
  activeDurationMs: number,
  keyframes: ShowPropertyKeyframeV2[],
): ShowPropertyTrackV2 {
  return { id, target, activeStartMs, activeDurationMs, keyframes }
}

/** A narrative chapter Marker; the Gallery, reading card and Live read these. */
export function chapter(id: string, timeMs: number, name: string, color?: string): ShowMarkerV2 {
  return { id, timeMs, name, ...(color ? { color } : {}), role: 'chapter' }
}

/** A general-purpose Marker; it never projects as a chapter. */
export function marker(id: string, timeMs: number, name: string, color?: string): ShowMarkerV2 {
  return { id, timeMs, name, ...(color ? { color } : {}) }
}

export interface NativeShowV2Input {
  id: string
  name: string
  zones: ShowZone[]
  zoneLayouts: ShowRoutingLayout[]
  stageMapId: string
  outputContract: ShowOutputContract
  executionModel: 'continuous' | 'deterministic-loop'
  showEndMs: number
  repeatScale?: number
  patternInstances: ShowPatternInstance[]
  layers: ShowLayerV2[]
  clips: ShowClipV2[]
  transitions?: ShowTransitionV2[]
  layoutOccurrences: ShowLayoutOccurrenceV2[]
  propertyTracks?: ShowPropertyTrackV2[]
  markers?: ShowMarkerV2[]
  groupDefinitions?: ShowGroupDefinitionV2[]
  groupOccurrences?: ShowGroupOccurrenceV2[]
}

/** A Clip inside a Group definition; its times are definition-local. */
export function groupClip(
  id: string,
  instanceId: string,
  layerId: string,
  startMs: number,
  durationMs: number,
  appearance: ClipAppearanceInput = {},
): ShowGroupClipV2 {
  const { zoneId: _zoneId, ...rest } = clip(id, instanceId, 'group', layerId, startMs, durationMs, appearance)
  return rest
}

/** A Layer slot inside a Group definition; occurrences bind it to a real Layer. */
export function groupLayer(definitionId: string, rank: number, name = `Layer ${rank}`): ShowGroupLayerV2 {
  return { id: `${definitionId}:layer:${rank}`, name, rank }
}

/**
 * Assemble one native v2 stock record. Collections are stored in the canonical
 * order the record model validates against; the builder never normalizes,
 * repairs or infers content, so an authoring mistake surfaces as a validation
 * or compile refusal rather than a quietly different Show.
 */
export function nativeShowV2(input: NativeShowV2Input): ShowRecordV2 {
  return {
    version: 2,
    id: input.id,
    name: input.name,
    zones: input.zones,
    zoneLayouts: input.zoneLayouts,
    stageMapId: input.stageMapId,
    outputContract: input.outputContract,
    composition: {
      version: 2,
      executionModel: input.executionModel,
      showEndMs: input.showEndMs,
      sampleRemap: { repeatScale: input.repeatScale ?? 1 },
      patternInstances: input.patternInstances,
      layers: input.layers,
      clips: input.clips,
      transitions: input.transitions ?? [],
      layoutOccurrences: input.layoutOccurrences,
      propertyTracks: input.propertyTracks ?? [],
      markers: [...(input.markers ?? [])].sort(
        (left, right) => left.timeMs - right.timeMs || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      ),
      groupDefinitions: input.groupDefinitions ?? [],
      groupOccurrences: input.groupOccurrences ?? [],
    },
    updatedAt: STOCK_SHOW_UPDATED_AT,
  }
}
