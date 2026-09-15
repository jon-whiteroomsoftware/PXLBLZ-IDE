import { STOCK_MAP_SPECS } from './maps'
import type { LibraryRecord, MapRecord, PatternRecord, ShowPatternRef, ShowRecord } from './personalContentRecords'
import { cloneValidShowRecordV2, isShowRecordV2, type ShowDocument } from './showDocument'
import type { ShowRecordV2 } from './showCompositionV2'
import { epeFilenameStem } from './showEpeExport'
import { buildShowArtifactAttribution } from './showPreviewArtifact'
import {
  normalizeShowComposition,
  validateShowComposition,
  validateShowCompositionTimelineMetadata,
} from './showCompositionModel'
import {
  normalizeShowEntryState,
  normalizeShowRoutingState,
  normalizeShowTransitionState,
} from './showModel'
import { requireShowOutputContract } from './showOutputContract'
import { normalizeShowOutputEffects } from './showPreviousRgbFeedback'
import { inspectPatternLibraryReferences } from './bundle'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'

export interface ShowFileBundleV1 {
  version: 1
  show: ShowRecord
  patterns: PatternRecord[]
  maps: MapRecord[]
  provenance: {
    appVersion: string
    exportedAt: string
    originalShowId: string
  }
}

export interface ShowFileBundleV2 {
  version: 2
  show: ShowRecordV2
  patterns: PatternRecord[]
  maps: MapRecord[]
  libraries: LibraryRecord[]
  provenance: ShowFileBundleV1['provenance']
}

export type ShowFileBundle = ShowFileBundleV1 | ShowFileBundleV2

export interface ShowFileBundleLibrary {
  patterns: readonly PatternRecord[]
  maps: readonly MapRecord[]
  libraries?: readonly LibraryRecord[]
}

export interface BuildShowFileBundleOptions {
  appVersion: string
  exportedAt?: Date | string
}

export type ShowFileBundleErrorCode =
  | 'missing_user_pattern'
  | 'missing_custom_map'
  | 'missing_user_library'
  | 'unsupported_library_reference'
  | 'invalid_file'
  | 'unsupported_version'

export class ShowFileBundleError extends Error {
  constructor(
    readonly code: ShowFileBundleErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ShowFileBundleError'
  }
}

export function buildShowFileBundle(
  show: ShowRecord,
  library: ShowFileBundleLibrary,
  options: BuildShowFileBundleOptions,
): { filename: string; bundle: ShowFileBundleV1 }
export function buildShowFileBundle(
  show: ShowRecordV2,
  library: ShowFileBundleLibrary,
  options: BuildShowFileBundleOptions,
): { filename: string; bundle: ShowFileBundleV2 }
export function buildShowFileBundle(
  show: ShowDocument,
  library: ShowFileBundleLibrary,
  options: BuildShowFileBundleOptions,
): { filename: string; bundle: ShowFileBundle } {
  const patternById = new Map(library.patterns.map((pattern) => [pattern.id, pattern]))
  const references = isShowRecordV2(show)
    ? showPatternReferencesV2(show)
    : buildShowArtifactAttribution(show, library.patterns).patterns
  const patterns = references.flatMap((reference) => {
    if (reference.kind !== 'user') return []
    const pattern = patternById.get(reference.id)
    if (!pattern) {
      throw new ShowFileBundleError(
        'missing_user_pattern',
        `Show "${show.name}" references user Pattern "${reference.id}", which is not in the library.`,
      )
    }
    return [clone(pattern)]
  })

  const stockMapIds = new Set(STOCK_MAP_SPECS.map((map) => map.id))
  const mapById = new Map(library.maps.map((map) => [map.id, map]))
  const mapIds = referencedMapIds(show)
  const maps = mapIds.flatMap((id) => {
    if (stockMapIds.has(id)) return []
    const map = mapById.get(id)
    if (!map) {
      throw new ShowFileBundleError(
        'missing_custom_map',
        `Show "${show.name}" references custom Map "${id}", which is not in the library.`,
      )
    }
    return [clone(map)]
  })
  const libraries = isShowRecordV2(show)
    ? collectReferencedLibraries(show, references, patterns, library.libraries ?? [])
    : []

  const exportedAt = options.exportedAt instanceof Date
    ? options.exportedAt.toISOString()
    : options.exportedAt ?? new Date().toISOString()
  return {
    filename: `${epeFilenameStem(show.name.trim() || 'Untitled Show')}.pxlshow`,
    bundle: isShowRecordV2(show)
      ? {
          version: 2,
          show: clone(show),
          patterns,
          maps,
          libraries,
          provenance: {
            appVersion: options.appVersion,
            exportedAt,
            originalShowId: show.id,
          },
        }
      : {
          version: 1,
          show: clone(show),
          patterns,
          maps,
          provenance: {
            appVersion: options.appVersion,
            exportedAt,
            originalShowId: show.id,
          },
        },
  }
}

function collectReferencedLibraries(
  show: ShowRecordV2,
  references: ReturnType<typeof showPatternReferencesV2>,
  embeddedPatterns: readonly PatternRecord[],
  availableLibraries: readonly LibraryRecord[],
): LibraryRecord[] {
  const userPatternById = new Map(embeddedPatterns.map(pattern => [pattern.id, pattern]))
  const userLibraryByName = new Map(availableLibraries.map(item => [item.name, item]))
  const stockLibraryNames = new Set(Object.keys(LIBRARIES))
  const pendingSources = references.map(reference => {
    if (reference.kind === 'user') return userPatternById.get(reference.id)?.src ?? ''
    return DEMOS[resolveStockPatternId(reference.id)] ?? ''
  })
  const selected = new Map<string, LibraryRecord>()
  while (pendingSources.length > 0) {
    const source = pendingSources.shift()!
    const inspection = inspectPatternLibraryReferences(source)
    if (inspection.unsupportedCalls) {
      throw new ShowFileBundleError(
        'unsupported_library_reference',
        `Show "${show.name}" contains a source form whose Library dependencies cannot be inventoried safely.`,
      )
    }
    for (const namespace of new Set(inspection.references.map(reference => reference.namespace))) {
      if (stockLibraryNames.has(namespace) || selected.has(namespace)) continue
      const dependency = userLibraryByName.get(namespace)
      if (!dependency) {
        throw new ShowFileBundleError(
          'missing_user_library',
          `Show "${show.name}" needs user Library "${namespace}", which is not in the library.`,
        )
      }
      selected.set(namespace, clone(dependency))
      pendingSources.push(dependency.src)
    }
  }
  return [...selected.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function serializeShowFileBundle(bundle: ShowFileBundle): Promise<Uint8Array> {
  const input = new Blob([JSON.stringify(bundle)]).stream()
  const compressed = input.pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(compressed).arrayBuffer())
}

export interface ParseShowFileBundleOptions {
  /** Internal authoring qualification only; product import callers keep normalization. */
  preserveAuthoringPhysicalRanges?: boolean
  /** #1044 opt-in route pilot only; production import remains v1 until #1039. */
  acceptV2?: boolean
}

export function parseShowFileBundle(bytes: Uint8Array, options?: ParseShowFileBundleOptions & { acceptV2?: false }): Promise<ShowFileBundleV1>
export function parseShowFileBundle(bytes: Uint8Array, options: ParseShowFileBundleOptions & { acceptV2: true }): Promise<ShowFileBundle>
export async function parseShowFileBundle(bytes: Uint8Array, options: ParseShowFileBundleOptions = {}): Promise<ShowFileBundle> {
  let payload = bytes
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      const input = new Blob([Uint8Array.from(bytes)]).stream()
      const decompressed = input.pipeThrough(new DecompressionStream('gzip'))
      payload = new Uint8Array(await new Response(decompressed).arrayBuffer())
    } catch {
      throw new ShowFileBundleError('invalid_file', 'This Show file is truncated or corrupt.')
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(payload))
  } catch {
    throw new ShowFileBundleError('invalid_file', 'This is not a valid Show file.')
  }
  if (!isRecord(parsed) || !Number.isInteger(parsed.version)) {
    throw new ShowFileBundleError('invalid_file', 'This Show file is missing a format version.')
  }
  if (parsed.version !== 1 && (parsed.version !== 2 || !options.acceptV2)) {
    throw new ShowFileBundleError(
      'unsupported_version',
      `This Show file uses format version ${String(parsed.version)}. Update PXLBLZ to import it.`,
    )
  }
  if (parsed.version === 2) return validateParsedBundleV2(parsed)
  return validateParsedBundle(parsed, options)
}

function referencedMapIds(show: ShowDocument): string[] {
  const ids = new Set<string>()
  if (show.stageMapId) ids.add(show.stageMapId)
  const contractMapId = show.outputContract.kind === 'installation'
    ? show.outputContract.outputMapId
    : show.outputContract.referenceMapId
  if (contractMapId) ids.add(contractMapId)
  return [...ids]
}

function showPatternReferencesV2(show: ShowRecordV2): Array<{ kind: ShowPatternRef['kind']; id: string; name: string }> {
  const seen = new Set<string>()
  return [
    ...show.composition.patternInstances,
    ...show.composition.groupDefinitions.flatMap(definition => definition.patternInstances),
  ].flatMap(instance => {
    const key = `${instance.pattern.kind}:${instance.pattern.id}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ kind: instance.pattern.kind, id: instance.pattern.id, name: instance.patternName }]
  })
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateParsedBundle(value: Record<string, unknown>, options: ParseShowFileBundleOptions): ShowFileBundleV1 {
  const show = normalizeParsedShow(value.show, options)
  if (!Array.isArray(value.patterns) || !value.patterns.every(isPatternRecord)) {
    invalid('This Show file has an invalid embedded Pattern list.')
  }
  if (!Array.isArray(value.maps) || !value.maps.every(isMapRecord)) {
    invalid('This Show file has an invalid embedded Map list.')
  }
  const provenance = value.provenance
  if (
    !isRecord(provenance)
    || !isNonEmptyString(provenance.appVersion)
    || !isNonEmptyString(provenance.exportedAt)
    || !isNonEmptyString(provenance.originalShowId)
    || Number.isNaN(Date.parse(provenance.exportedAt))
  ) {
    invalid('This Show file has invalid export provenance.')
  }
  return {
    version: 1,
    show,
    patterns: clone(value.patterns),
    maps: clone(value.maps),
    provenance: {
      appVersion: provenance.appVersion,
      exportedAt: provenance.exportedAt,
      originalShowId: provenance.originalShowId,
    },
  }
}

function validateParsedBundleV2(value: Record<string, unknown>): ShowFileBundleV2 {
  let show: ShowRecordV2
  try {
    show = cloneValidShowRecordV2(value.show)
  } catch {
    invalid('This Show file has an invalid version-2 Show record.')
  }
  if (!Array.isArray(value.patterns) || !value.patterns.every(isPatternRecord)) {
    invalid('This Show file has an invalid embedded Pattern list.')
  }
  if (!Array.isArray(value.maps) || !value.maps.every(isMapRecord)) {
    invalid('This Show file has an invalid embedded Map list.')
  }
  if (!Array.isArray(value.libraries) || !value.libraries.every(isLibraryRecord)) {
    invalid('This Show file has an invalid embedded Library list.')
  }
  const provenance = validProvenance(value.provenance)
  return {
    version: 2,
    show: show!,
    patterns: clone(value.patterns),
    maps: clone(value.maps),
    libraries: clone(value.libraries),
    provenance,
  }
}

function validProvenance(value: unknown): ShowFileBundleV1['provenance'] {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.appVersion)
    || !isNonEmptyString(value.exportedAt)
    || !isNonEmptyString(value.originalShowId)
    || Number.isNaN(Date.parse(value.exportedAt))
  ) invalid('This Show file has invalid export provenance.')
  return {
    appVersion: value.appVersion as string,
    exportedAt: value.exportedAt as string,
    originalShowId: value.originalShowId as string,
  }
}

/** Preserve only endpoint pairs and their authored order. Everything else still
 * passes through the ordinary importer and its composition/owner checks. */
function preservePhysicalRanges(value: Record<string, unknown>, show: ShowRecord): ShowRecord {
  const knownZones = new Set(show.zones.map(zone => zone.id))
  const layouts = new Map<string, Map<string, Array<{ start: number; end: number }>>>()
  const seenLayouts = new Set<string>()
  for (const layout of value.routingLayouts as unknown[]) {
    if (!isRecord(layout) || !isNonEmptyString(layout.id) || seenLayouts.has(layout.id)) invalid('This Show file has invalid physical Layout identities.')
    seenLayouts.add(layout.id)
    if (layout.logical !== undefined) continue
    if (!Array.isArray(layout.zones)) invalid('This Show file has invalid physical routing Zones.')
    const rangesByZone = new Map<string, Array<{ start: number; end: number }>>()
    for (const zone of layout.zones) {
      if (!isRecord(zone) || typeof zone.zoneId !== 'string' || !knownZones.has(zone.zoneId) || rangesByZone.has(zone.zoneId) || !Array.isArray(zone.ranges)) invalid('This Show file has invalid physical Zone identities.')
      const ranges = zone.ranges.map(range => {
        if (!isRecord(range) || Object.keys(range).some(key => key !== 'start' && key !== 'end') || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)) invalid('This Show file has invalid physical range endpoints.')
        return { start: range.start as number, end: range.end as number }
      })
      rangesByZone.set(zone.zoneId, ranges)
    }
    layouts.set(layout.id, rangesByZone)
  }
  return { ...show, routingLayouts: show.routingLayouts.map(layout => ({
    ...layout,
    zones: layout.zones.map(zone => ({ ...zone, ranges: layouts.get(layout.id)?.get(zone.zoneId) ?? zone.ranges })),
  })) }
}

function normalizeParsedShow(value: unknown, options: ParseShowFileBundleOptions): ShowRecord {
  if (!isRecord(value)) invalid('This Show file is missing a valid Show record.')
  if (
    !isNonEmptyString(value.id)
    || typeof value.name !== 'string'
    || !Number.isFinite(value.updatedAt)
    || !isShowSceneArray(value.scenes)
    || !isShowZoneArray(value.zones)
    || !Array.isArray(value.routingLayouts)
    || !Array.isArray(value.transitions)
  ) {
    invalid('This Show file has an invalid Show record.')
  }
  if (!isShowCellArray(value.cells)) {
    invalid('This Show file has an invalid flat Show cell list.')
  }
  if (!showCellsReferenceExistingOwners(value.cells, value.scenes, value.zones)) {
    invalid('This Show file has an invalid flat Show cell list.')
  }
  try {
    let show = normalizeShowEntryState(normalizeShowTransitionState(normalizeShowRoutingState({
      ...clone(value),
      outputContract: requireShowOutputContract(value.outputContract, value.id),
      ...(Array.isArray(value.outputEffects)
        ? { outputEffects: normalizeShowOutputEffects(value.outputEffects) }
        : {}),
    } as unknown as ShowRecord)))
    if (options.preserveAuthoringPhysicalRanges) show = preservePhysicalRanges(value, show)
    if (value.composition === undefined || value.composition === null) {
      const { composition: _composition, ...flat } = show
      return flat
    }
    if (!isCompositionV1Envelope(value.composition)) invalid('This Show file has an invalid version-1 Show composition.')
    if (validateShowCompositionTimelineMetadata(value.composition).length > 0) {
      invalid('This Show file has invalid Show timeline metadata.')
    }
    const composition = normalizeShowComposition(show, value.composition)
    if (validateShowComposition(show, composition).length > 0) {
      invalid('This Show file has an invalid Show composition.')
    }
    return { ...show, composition }
  } catch (cause) {
    if (cause instanceof ShowFileBundleError) throw cause
    invalid('This Show file has an invalid Show record.')
  }
}

function isPatternRecord(value: unknown): value is PatternRecord {
  if (!isRecord(value)) return false
  return isNonEmptyString(value.id)
    && typeof value.name === 'string'
    && typeof value.src === 'string'
    && isRecord(value.controls)
    && Object.values(value.controls).every((control) => (
      typeof control === 'number' && Number.isFinite(control)
      || Array.isArray(control) && control.every((item) => typeof item === 'number' && Number.isFinite(item))
    ))
    && (value.authors === undefined || Array.isArray(value.authors) && value.authors.every((author) => typeof author === 'string'))
    && Number.isFinite(value.updatedAt)
}

function isLibraryRecord(value: unknown): value is LibraryRecord {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.name)
    && typeof value.src === 'string'
    && Number.isFinite(value.updatedAt)
}

function isMapRecord(value: unknown): value is MapRecord {
  if (!isRecord(value)) return false
  return isNonEmptyString(value.id)
    && typeof value.name === 'string'
    && (value.dim === 1 || value.dim === 2 || value.dim === 3)
    && isNonEmptyString(value.generator)
    && isRecord(value.params)
    && Object.values(value.params).every((parameter) => typeof parameter === 'number' && Number.isFinite(parameter))
    && (value.source === undefined || typeof value.source === 'string')
    && (value.generator !== 'custom' || value.points !== undefined)
    && (value.points === undefined || isMapPoints(value.points, value.dim))
    && Number.isFinite(value.updatedAt)
}

function isMapPoints(value: unknown, dim: 1 | 2 | 3): value is number[][] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((point) => (
      Array.isArray(point)
      && point.length === dim
      && point.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    ))
}

function isCompositionV1Envelope(value: unknown): value is NonNullable<ShowRecord['composition']> {
  return isRecord(value)
    && value.version === 1
    && Array.isArray(value.patternInstances)
    && Array.isArray(value.scenes)
}

function isShowSceneArray(value: unknown): value is ShowRecord['scenes'] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((scene) => (
      isRecord(scene)
      && isNonEmptyString(scene.id)
      && typeof scene.name === 'string'
      && Number.isInteger(scene.durationMs)
      && Number(scene.durationMs) > 0
    ))
}

function isShowZoneArray(value: unknown): value is ShowRecord['zones'] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((zone) => (
      isRecord(zone)
      && isNonEmptyString(zone.id)
      && typeof zone.name === 'string'
      && Number.isInteger(zone.nominalPixelCount)
      && Number(zone.nominalPixelCount) > 0
      && (zone.color === undefined || typeof zone.color === 'string')
      && (zone.icon === undefined || typeof zone.icon === 'string')
    ))
}

function isShowCellArray(value: unknown): value is ShowRecord['cells'] {
  return Array.isArray(value)
    && value.every((cell) => (
      isRecord(cell)
      && isNonEmptyString(cell.id)
      && isNonEmptyString(cell.zoneId)
      && isNonEmptyString(cell.sceneId)
      && Number.isInteger(cell.sceneSpan)
      && Number(cell.sceneSpan) > 0
      && (
        cell.zoneSpan === undefined
        || Number.isInteger(cell.zoneSpan) && Number(cell.zoneSpan) > 0
      )
      && (cell.zoneMode === undefined || cell.zoneMode === 'span' || cell.zoneMode === 'repeat')
      && isShowPatternRef(cell.pattern)
      && typeof cell.patternName === 'string'
      && isShowCellAdaptations(cell.adaptations)
      && (cell.restartOnEntry === undefined || typeof cell.restartOnEntry === 'boolean')
      && (
        cell.evaluationPolicy === undefined
        || cell.evaluationPolicy === 'live'
        || cell.evaluationPolicy === 'freeze-at-entry'
        || cell.evaluationPolicy === 'rolling-refresh'
      )
      && (cell.presentation === undefined || isShowCellPresentation(cell.presentation))
      && (cell.blink === undefined || isShowCellBlink(cell.blink))
      && (cell.controlTargets === undefined || isFiniteNumberRecord(cell.controlTargets))
      && (cell.transform === undefined || isShowCellTransform(cell.transform))
      && (cell.viewport === undefined || isShowCellViewport(cell.viewport))
      && (cell.effects === undefined || isShowCellEffects(cell.effects))
    ))
}

function showCellsReferenceExistingOwners(
  cells: ShowRecord['cells'],
  scenes: ShowRecord['scenes'],
  zones: ShowRecord['zones'],
): boolean {
  const sceneIds = new Set(scenes.map((scene) => scene.id))
  const zoneIds = new Set(zones.map((zone) => zone.id))
  return cells.every((cell) => sceneIds.has(cell.sceneId) && zoneIds.has(cell.zoneId))
}

function isShowPatternRef(value: unknown): boolean {
  return isRecord(value)
    && (value.kind === 'user' || value.kind === 'stock')
    && isNonEmptyString(value.id)
}

function isShowCellAdaptations(value: unknown): boolean {
  return isRecord(value)
    && typeof value.mirror === 'boolean'
    && Number.isFinite(value.phase)
    && Number.isFinite(value.brightness)
    && Number.isFinite(value.timeScale)
    && (value.timeOffsetMs === undefined || Number.isFinite(value.timeOffsetMs))
    && (
      value.lightShutter === undefined
      || (
        isRecord(value.lightShutter)
        && Number.isFinite(value.lightShutter.rateHz)
        && Number.isFinite(value.lightShutter.duty)
        && Number.isFinite(value.lightShutter.phase)
        && (value.lightShutter.clockBehavior === 'continue' || value.lightShutter.clockBehavior === 'freeze')
      )
    )
    && (
      value.steppedClock === undefined
      || isRecord(value.steppedClock) && Number.isFinite(value.steppedClock.stepMs)
    )
}

function isShowCellPresentation(value: unknown): boolean {
  if (!isRecord(value)) return false
  return value.mode === 'live'
    || value.mode === 'freeze'
    || value.mode === 'strobe' && Number.isFinite(value.cadenceMs)
}

function isShowCellBlink(value: unknown): boolean {
  return isRecord(value)
    && Number.isFinite(value.rateHz)
    && Number.isFinite(value.duty)
    && Number.isFinite(value.phase)
}

function isFiniteNumberRecord(value: unknown): boolean {
  return isRecord(value)
    && Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item))
}

function isShowCellTransform(value: unknown): boolean {
  return isRecord(value)
    && ['positionX', 'positionY', 'rotation', 'scaleX', 'scaleY']
      .every((key) => Number.isFinite(value[key]))
}

const SHOW_VIEWPORT_APERTURES = new Set([
  'rectangle', 'ellipse', 'diamond', 'ring', 'rounded-box', 'cross', 'heart',
  'star', 'crescent', 'polygon', 'cloud', 'cat-head', 'cat-side-profile', 'bastet',
])
const SHOW_VIEWPORT_EDGES = new Set(['hard', 'soft', 'dither'])
const SHOW_VIEWPORT_NUMERIC_FIELDS = [
  'feather', 'rotation', 'ringWidth', 'cornerRadius', 'crossWidth', 'starPoints',
  'starInner', 'crescentOffset', 'polygonSides',
]

function isShowCellViewport(value: unknown): boolean {
  return isRecord(value)
    && typeof value.enabled === 'boolean'
    && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key]))
    && (value.aperture === undefined || typeof value.aperture === 'string' && SHOW_VIEWPORT_APERTURES.has(value.aperture))
    && (value.edge === undefined || typeof value.edge === 'string' && SHOW_VIEWPORT_EDGES.has(value.edge))
    && SHOW_VIEWPORT_NUMERIC_FIELDS.every((key) => value[key] === undefined || Number.isFinite(value[key]))
    && (value.invert === undefined || typeof value.invert === 'boolean')
}

const SHOW_EFFECT_NUMBER_FIELDS: Record<string, string[]> = {
  opacity: ['opacity'],
  brightness: ['brightness'],
  hue: ['turns'],
  saturation: ['saturation'],
  contrast: ['contrast'],
  invert: ['amount'],
  threshold: ['threshold', 'amount'],
  'luma-key': ['target', 'tolerance', 'softness'],
  'chroma-key': ['tolerance', 'softness'],
  posterize: ['levels', 'amount'],
  vignette: ['amount', 'radius', 'softness', 'centerX', 'centerY', 'aspect'],
  'color-map': ['amount', 'shadowR', 'shadowG', 'shadowB', 'highlightR', 'highlightG', 'highlightB'],
  translate: ['x', 'y'],
  rotate: ['turns'],
  scale: ['x', 'y'],
  shear: ['x', 'y'],
  ripple: ['amount', 'frequency', 'phase', 'centerX', 'centerY'],
  swirl: ['amount', 'radius', 'centerX', 'centerY'],
  bulge: ['amount', 'radius', 'centerX', 'centerY'],
  pixelate: ['amount', 'columns', 'rows'],
  kaleidoscope: ['amount', 'segments', 'rotation', 'centerX', 'centerY'],
  wrap: [],
}

function isShowCellEffects(value: unknown): boolean {
  return Array.isArray(value) && value.every((effect) => {
    if (!isRecord(effect) || !isNonEmptyString(effect.id) || typeof effect.kind !== 'string') return false
    if (!Object.prototype.hasOwnProperty.call(SHOW_EFFECT_NUMBER_FIELDS, effect.kind)) return false
    const numberFields = SHOW_EFFECT_NUMBER_FIELDS[effect.kind]
    if (!Array.isArray(numberFields) || !numberFields.every((key) => Number.isFinite(effect[key]))) return false
    return effect.kind !== 'chroma-key' || typeof effect.color === 'string'
  })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function invalid(message: string): never {
  throw new ShowFileBundleError('invalid_file', message)
}
