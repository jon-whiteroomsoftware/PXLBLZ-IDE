import { compileLibraries } from './libraries'
import { LIBRARIES } from '../pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { groupRuntimeBindings, effectiveShowClipsV2 } from './showGroupsV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from './showCompiler'
import { prepareShowV2ForCompile, type ShowV2CompileProvenance } from './showCompositionLoweringV2'
import type { LibraryRecord, MapRecord, PatternRecord } from './personalContentRecords'
import type { ControllerProfile } from './controllerProfile'
import { applyNormalizeMode, type MapPoint, type PixelMap } from './maps'
import { buildShowStripsLayout, buildShowLogicalStageProjection, buildShowStageProjection, showLogicalAspectAdvisory, type ShowStageProjection } from './zonePreview'
import { installationPhysicalZones, validateInstallationCoverage, type InstallationCoverage } from './showInstallationCoverage'

export interface ShowPreparedStageDependenciesV2 {
  patterns: readonly PatternRecord[]
  libraries: readonly LibraryRecord[]
  maps: readonly MapRecord[]
  profiles: readonly ControllerProfile[]
  stageMap: PixelMap | null
}
export interface ShowPreparedStageAssetPayloadV2 {
  readonly patterns: readonly PatternRecord[]
  readonly maps: readonly MapRecord[]
  readonly libraries: readonly LibraryRecord[]
  readonly profiles: readonly ControllerProfile[]
}
export interface ShowPreparedStageLayoutV2 {
  kind: 'strips' | 'map'
  mapPoints: MapPoint[]
  sampleDimension?: 2 | 3
  draw: { kind: '2d'; positions: [number, number][] } | { kind: '3d'; positions: [number, number, number][] }
  projection: ShowStageProjection
  label: string
  note: string | null
}
export interface ShowPreparedStageBundleV2 {
  readonly record: ShowRecordV2
  readonly identity: { readonly record: ShowRecordV2; readonly dependencies: ShowPreparedStageDependenciesV2 }
  readonly assets: ShowPreparedStageAssetPayloadV2
  readonly digest: string
  readonly libraries: Record<string, string>
  readonly recipe: ShowRecipe
  readonly provenance: ShowV2CompileProvenance
  readonly artifact: GeneratedShowArtifact
  readonly presentation: {
    readonly layout: ShowPreparedStageLayoutV2
    readonly stageMap: { id: string; name: string; dim: 2 | 3 } | null
    readonly stageIdentityRole: string
    readonly installationCoverage: InstallationCoverage | null
    readonly durationMs: number
    readonly stageDimension: 2 | 3
    readonly pixelCount: number
  }
}
export type ShowPreparedStageResultV2 =
  | { status: 'ready'; bundle: ShowPreparedStageBundleV2 }
  | { status: 'empty'; record: ShowRecordV2 }
  | { status: 'refused'; message: string }

/** All semantic data is captured once; original references identify the admission snapshot only. */
export function prepareShowStageV2(record: ShowRecordV2, dependencies: ShowPreparedStageDependenciesV2): ShowPreparedStageResultV2 {
  try {
    const snapshot = freezeCaptured(structuredClone(record))
    const assets = freezeCaptured(structuredClone({ patterns: dependencies.patterns, maps: dependencies.maps, libraries: dependencies.libraries, profiles: dependencies.profiles }))
    const invalid = validateShowRecordV2(snapshot)[0]
    if (invalid) return { status: 'refused', message: `${invalid.path}: ${invalid.message}` }
    if (effectiveShowClipsV2(snapshot).length === 0) return { status: 'empty', record: snapshot }
    const map = dependencies.stageMap
    if (map && (map.id !== snapshot.stageMapId || (map.dim !== 2 && map.dim !== 3))) return { status: 'refused', message: 'Stage map identity or dimension does not match the captured Show.' }
    const stageDimension = map?.dim === 3 ? 3 : 2
    const sources: Record<string, string> = {}
    const instances = [...snapshot.composition.patternInstances, ...groupRuntimeBindings(snapshot).map(binding => ({ ...binding.instance, id: binding.runtimeId }))]
    for (const instance of instances) {
      const ref = instance.pattern
      const source = ref.kind === 'stock'
        ? Object.prototype.hasOwnProperty.call(DEMOS, resolveStockPatternId(ref.id)) ? DEMOS[resolveStockPatternId(ref.id)] : undefined
        : assets.patterns.find(pattern => pattern.id === ref.id)?.src
      if (source !== undefined) sources[instance.id] = source
    }
    const libraries = compileLibraries(LIBRARIES, assets.libraries)
    const prepared = prepareShowV2ForCompile(snapshot, { byCellId: {}, byPatternInstanceId: sources, stageDimension }, { libraries })
    if (prepared.status !== 'ready') return { status: 'refused', message: prepared.issues.map(issue => `${issue.path}: ${issue.message}`).join('; ') }
    const artifact = compileShow(prepared.recipe, libraries)
    const occurrence = snapshot.composition.layoutOccurrences.find(candidate => candidate.startMs === 0)!
    const activeLayout = snapshot.zoneLayouts.find(layout => layout.id === occurrence.layoutId)!
    const routingLayouts = [activeLayout, ...snapshot.zoneLayouts.filter(layout => layout !== activeLayout)]
    const presentationInput = { zones: snapshot.zones, outputContract: snapshot.outputContract, routingLayouts }
    const physical = installationPhysicalZones(presentationInput, activeLayout.id)
    let layout: ShowPreparedStageLayoutV2
    if (!map) {
      const strips = buildShowStripsLayout(snapshot.zones)
      layout = { kind: 'strips', mapPoints: strips.mapPoints, draw: { kind: '2d', positions: strips.positions }, projection: strips.projection, label: 'Zone strips - generic', note: snapshot.stageMapId ? 'The saved stage map is gone, so this show is previewing as generic strips.' : null }
    } else {
      const profile = assets.profiles.find(candidate => candidate.id === snapshot.targetControllerProfileId) ?? assets.profiles[0]
      const zoneTotal = snapshot.zones.reduce((total, zone) => total + Math.max(0, Math.floor(zone.nominalPixelCount)), 0)
      const pixelCount = snapshot.outputContract.kind === 'installation' ? snapshot.outputContract.pixelCount : snapshot.outputContract.referencePixelCount
      const count = Math.max(1, pixelCount ?? map.bakedCount ?? profile?.lastKnownPixelCount ?? (zoneTotal || (stageDimension === 3 ? 512 : 1024)))
      const resolved = applyNormalizeMode(map.resolve(count), 'contain')
      const mapPoints: MapPoint[] = resolved.map(point => {
        const raw = point.pos ?? point.sample
        const pos: [number, number] | [number, number, number] = stageDimension === 3 ? [raw[0] ?? 0.5, raw[1] ?? 0.5, raw[2] ?? 0.5] : [raw[0] ?? 0.5, raw[1] ?? 0.5]
        return { sample: [...pos], pos }
      })
      const logical = snapshot.outputContract.kind === 'portable-2d' ? activeLayout.logical : undefined
      const projection = logical
        ? buildShowLogicalStageProjection(snapshot.zones, mapPoints, logical, { splitPosition: prepared.recipe.routingPropertyRamps?.splitPosition.initial ?? occurrence.parameters.splitPosition ?? 0.5 })
        : buildShowStageProjection(snapshot.zones, mapPoints.length, { controllerZones: physical })
      const draw: ShowPreparedStageLayoutV2['draw'] = stageDimension === 3
        ? { kind: '3d', positions: mapPoints.map(point => [point.pos![0], point.pos![1], point.pos![2] ?? 0.5]) }
        : { kind: '2d', positions: mapPoints.map(point => [point.pos![0], point.pos![1]]) }
      layout = { kind: 'map', mapPoints, sampleDimension: stageDimension, draw, projection, label: map.name, note: logical ? showLogicalAspectAdvisory(mapPoints, logical) : null }
    }
    return { status: 'ready', bundle: {
      record: snapshot, identity: { record, dependencies }, assets, digest: showStageRecordDigestV2(snapshot), libraries, recipe: prepared.recipe, provenance: prepared.provenance, artifact,
      presentation: { layout, stageMap: map ? { id: map.id, name: map.name, dim: stageDimension } : null, stageIdentityRole: snapshot.outputContract.kind === 'installation' ? 'Output map' : 'Reference map', installationCoverage: validateInstallationCoverage(presentationInput), durationMs: snapshot.composition.showEndMs, stageDimension, pixelCount: layout.mapPoints.length },
    } }
  } catch (error) {
    return { status: 'refused', message: error instanceof Error ? error.message : String(error) }
  }
}

export function showStageRecordDigestV2(record: ShowRecordV2): string {
  const { updatedAt: _stamp, name: _name, ...semantic } = record
  const text = JSON.stringify(semantic)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0
  return hash.toString(16).padStart(8, '0')
}

/** Owned data-only snapshots; identity references and map resolver closures stay outside. */
function freezeCaptured<T>(value: T, seen = new WeakSet<object>()): T {
  if (value !== null && typeof value === 'object' && !seen.has(value)) {
    seen.add(value)
    for (const child of Object.values(value)) freezeCaptured(child, seen)
    Object.freeze(value)
  }
  return value
}
