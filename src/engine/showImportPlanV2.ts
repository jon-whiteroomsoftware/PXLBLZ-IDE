import { artifactHash } from './artifactStamp'
import { inspectPatternLibraryReferences } from './bundle'
import { rewriteLibraryNamespaces } from './libraryNamespaceRewrite'
import { nextLibraryCloneName, builtinNamespaceNames } from './libraries'
import { mapFingerprintForPoints } from './mapFingerprint'
import { STOCK_MAP_SPECS } from './maps'
import { newPersonalContentId } from './personalContentMetadata'
import type { LibraryRecord, MapRecord, PatternRecord, ShowPatternRef } from './personalContentRecords'
import type { ShowRecordV2 } from './showCompositionV2'
import { validateShowRecordV2 } from './showCompositionV2'
import type { ShowFileBundleV2 } from './showFileBundle'
import { ShowImportPlanError } from './showImportPlan'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'

export interface ShowImportLibraryV2 {
  patterns: readonly PatternRecord[]
  maps: readonly MapRecord[]
  libraries: readonly LibraryRecord[]
  showNames: readonly string[]
}

interface Item { id: string; name: string }
interface Copy extends Item { targetId: string; targetName: string }

export interface ShowImportPlanV2 {
  bundle: ShowFileBundleV2
  show: Item
  patterns: { builtIn: Item[]; reused: Item[]; added: Item[]; copied: Copy[] }
  maps: { reused: Item[]; added: Item[]; copied: Copy[] }
  libraries: { reused: Item[]; added: Item[]; copied: Copy[] }
  libraryNamespaceRemap: Record<string, string>
  now: number
}

export interface AppliedShowImportV2 {
  show: ShowRecordV2
  newPatterns: PatternRecord[]
  newMaps: MapRecord[]
  newLibraries: LibraryRecord[]
}

export function planShowImportV2(
  bundle: ShowFileBundleV2,
  library: ShowImportLibraryV2,
  options: { createId?: () => string; now?: number } = {},
): ShowImportPlanV2 {
  const createId = options.createId ?? newPersonalContentId
  const show = { id: createId(), name: uniqueName(bundle.show.name, library.showNames) }
  const libraries = planLibraries(bundle, library, createId)
  const remap = new Map(libraries.copied.map(item => [item.name, item.targetName]))
  const patterns = planPatterns(bundle, library, createId, remap)
  const maps = planMaps(bundle, library, createId)
  validateDependencies(bundle, remap)
  return {
    bundle: structuredClone(bundle), show, patterns, maps, libraries,
    libraryNamespaceRemap: Object.fromEntries(remap),
    now: options.now ?? Date.now(),
  }
}

export function applyShowImportPlanV2(plan: ShowImportPlanV2): AppliedShowImportV2 {
  const remap = new Map(Object.entries(plan.libraryNamespaceRemap))
  const patternCopy = new Map(plan.patterns.copied.map(item => [item.id, item]))
  const mapCopy = new Map(plan.maps.copied.map(item => [item.id, item]))
  const rewriteInstance = <T extends { pattern: ShowPatternRef; patternName: string }>(instance: T): T => {
    if (instance.pattern.kind !== 'user') return structuredClone(instance)
    const copy = patternCopy.get(instance.pattern.id)
    return copy ? { ...structuredClone(instance), pattern: { kind: 'user', id: copy.targetId }, patternName: copy.targetName } : structuredClone(instance)
  }
  const source = structuredClone(plan.bundle.show)
  const rewriteMap = (id: string | null | undefined) => id ? mapCopy.get(id)?.targetId ?? id : id
  const show: ShowRecordV2 = {
    ...source,
    id: plan.show.id,
    name: plan.show.name,
    stageMapId: rewriteMap(source.stageMapId),
    outputContract: source.outputContract.kind === 'installation'
      ? { ...source.outputContract, outputMapId: rewriteMap(source.outputContract.outputMapId) ?? null }
      : { ...source.outputContract, referenceMapId: rewriteMap(source.outputContract.referenceMapId) ?? null },
    composition: {
      ...source.composition,
      patternInstances: source.composition.patternInstances.map(rewriteInstance),
      groupDefinitions: source.composition.groupDefinitions.map(definition => ({
        ...definition,
        patternInstances: definition.patternInstances.map(rewriteInstance),
      })),
    },
    importMetadata: {
      kind: 'show-file',
      originalShowId: plan.bundle.provenance.originalShowId,
      appVersion: plan.bundle.provenance.appVersion,
      exportedAt: plan.bundle.provenance.exportedAt,
      importedAt: plan.now,
    },
    updatedAt: plan.now,
  }
  const issue = validateShowRecordV2(show)[0]
  if (issue) throw new ShowImportPlanError('invalid_show', `The imported Show is invalid at ${issue.path}: ${issue.message}`)
  const patternById = new Map(plan.bundle.patterns.map(item => [item.id, item]))
  const newPatterns = [
    ...plan.patterns.added.map(item => ({ ...structuredClone(patternById.get(item.id)!), src: rewriteLibraryNamespaces(patternById.get(item.id)!.src, remap), updatedAt: plan.now })),
    ...plan.patterns.copied.map(item => ({ ...structuredClone(patternById.get(item.id)!), id: item.targetId, name: item.targetName, src: rewriteLibraryNamespaces(patternById.get(item.id)!.src, remap), updatedAt: plan.now })),
  ]
  const mapById = new Map(plan.bundle.maps.map(item => [item.id, item]))
  const newMaps = [
    ...plan.maps.added.map(item => ({ ...structuredClone(mapById.get(item.id)!), updatedAt: plan.now })),
    ...plan.maps.copied.map(item => ({ ...structuredClone(mapById.get(item.id)!), id: item.targetId, name: item.targetName, updatedAt: plan.now })),
  ]
  const libraryById = new Map(plan.bundle.libraries.map(item => [item.id, item]))
  const newLibraries = [
    ...plan.libraries.added.map(item => ({ ...structuredClone(libraryById.get(item.id)!), src: rewriteLibraryNamespaces(libraryById.get(item.id)!.src, remap), updatedAt: plan.now })),
    ...plan.libraries.copied.map(item => ({ ...structuredClone(libraryById.get(item.id)!), id: item.targetId, name: item.targetName, src: rewriteLibraryNamespaces(libraryById.get(item.id)!.src, remap), updatedAt: plan.now })),
  ]
  return { show, newPatterns, newMaps, newLibraries }
}

function references(show: ShowRecordV2): Array<{ kind: ShowPatternRef['kind']; id: string; name: string }> {
  const seen = new Set<string>()
  return [...show.composition.patternInstances, ...show.composition.groupDefinitions.flatMap(item => item.patternInstances)].flatMap(instance => {
    const key = `${instance.pattern.kind}:${instance.pattern.id}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ kind: instance.pattern.kind, id: instance.pattern.id, name: instance.patternName }]
  })
}

function planPatterns(bundle: ShowFileBundleV2, library: ShowImportLibraryV2, createId: () => string, remap: ReadonlyMap<string, string>): ShowImportPlanV2['patterns'] {
  const plan: ShowImportPlanV2['patterns'] = { builtIn: [], reused: [], added: [], copied: [] }
  const bundled = new Map(bundle.patterns.map(item => [item.id, item]))
  const existing = new Map(library.patterns.map(item => [item.id, item]))
  for (const reference of references(bundle.show)) {
    if (reference.kind === 'stock') {
      const id = resolveStockPatternId(reference.id)
      if (!Object.prototype.hasOwnProperty.call(DEMOS, id)) throw new ShowImportPlanError('unknown_stock_pattern', `The imported Show needs unknown built-in Pattern "${reference.id}".`, reference.id)
      plan.builtIn.push({ id, name: reference.name })
      continue
    }
    const item = bundled.get(reference.id)
    if (!item) throw new ShowImportPlanError('missing_bundled_pattern', `The imported Show is missing Pattern "${reference.id}".`, reference.id)
    const rewritten = rewriteLibraryNamespaces(item.src, remap)
    const current = existing.get(item.id)
    if (!current) plan.added.push({ id: item.id, name: item.name })
    else if (artifactHash(current.src) === artifactHash(rewritten)) plan.reused.push({ id: item.id, name: item.name })
    else plan.copied.push({ id: item.id, name: item.name, targetId: createId(), targetName: uniqueName(`${item.name} (${bundle.show.name})`, [...library.patterns.map(value => value.name), ...plan.copied.map(value => value.targetName)]) })
  }
  return plan
}

function planMaps(bundle: ShowFileBundleV2, library: ShowImportLibraryV2, createId: () => string): ShowImportPlanV2['maps'] {
  const plan: ShowImportPlanV2['maps'] = { reused: [], added: [], copied: [] }
  const bundled = new Map(bundle.maps.map(item => [item.id, item]))
  const existing = new Map(library.maps.map(item => [item.id, item]))
  const stock = new Set(STOCK_MAP_SPECS.map(item => item.id))
  for (const id of referencedMapIds(bundle.show)) {
    if (stock.has(id)) continue
    const item = bundled.get(id)
    if (!item) throw new ShowImportPlanError('missing_bundled_map', `The imported Show is missing Map "${id}".`, id)
    const current = existing.get(id)
    if (!current) plan.added.push({ id: item.id, name: item.name })
    else if (mapFingerprint(current) === mapFingerprint(item)) plan.reused.push({ id: item.id, name: item.name })
    else plan.copied.push({ id: item.id, name: item.name, targetId: createId(), targetName: uniqueName(`${item.name} (${bundle.show.name})`, [...library.maps.map(value => value.name), ...plan.copied.map(value => value.targetName)]) })
  }
  return plan
}

function planLibraries(bundle: ShowFileBundleV2, library: ShowImportLibraryV2, createId: () => string): ShowImportPlanV2['libraries'] {
  const plan: ShowImportPlanV2['libraries'] = { reused: [], added: [], copied: [] }
  const byName = new Map(library.libraries.map(item => [item.name, item]))
  const byId = new Map(library.libraries.map(item => [item.id, item]))
  const bundledById = new Map(bundle.libraries.map(item => [item.id, item]))
  const reservedNames = [
    ...library.libraries.map(item => item.name),
    ...bundle.libraries.map(item => item.name),
  ]
  const copy = (item: LibraryRecord) => {
    const targetName = nextLibraryCloneName(item.name, {
      stockNames: Object.keys(LIBRARIES),
      builtinNames: builtinNamespaceNames(),
      userNames: [...reservedNames, ...plan.copied.map(value => value.targetName)],
    })
    plan.copied.push({ id: item.id, name: item.name, targetId: createId(), targetName })
  }
  for (const item of bundle.libraries) {
    const named = byName.get(item.name)
    const identified = byId.get(item.id)
    if (!named && !identified) plan.added.push({ id: item.id, name: item.name })
    else if (named && named.id === item.id && artifactHash(named.src) === artifactHash(item.src)) plan.reused.push({ id: item.id, name: item.name })
    else copy(item)
  }
  let changed = true
  while (changed) {
    changed = false
    const remap = new Map(plan.copied.map(item => [item.name, item.targetName]))
    for (let index = 0; index < plan.reused.length;) {
      const reused = plan.reused[index]
      const source = bundledById.get(reused.id)!
      if (artifactHash(rewriteLibraryNamespaces(source.src, remap)) === artifactHash(source.src)) {
        index += 1
        continue
      }
      plan.reused.splice(index, 1)
      copy(source)
      changed = true
    }
  }
  return plan
}

function validateDependencies(bundle: ShowFileBundleV2, remap: ReadonlyMap<string, string>): void {
  const bundled = new Set(bundle.libraries.map(item => item.name))
  const stock = new Set(Object.keys(LIBRARIES))
  const sources = [...bundle.patterns.map(item => item.src), ...bundle.libraries.map(item => item.src)]
  for (const source of sources) {
    const inspection = inspectPatternLibraryReferences(source)
    if (inspection.unsupportedCalls) throw new ShowImportPlanError('invalid_show', 'A bundled source has unsupported Library references.')
    for (const { namespace } of inspection.references) {
      if (!stock.has(namespace) && !bundled.has(namespace) && !remap.has(namespace)) {
        throw new ShowImportPlanError('invalid_show', `The imported Show is missing Library "${namespace}".`)
      }
    }
  }
}

function referencedMapIds(show: ShowRecordV2): string[] {
  const ids = new Set<string>()
  if (show.stageMapId) ids.add(show.stageMapId)
  const id = show.outputContract.kind === 'installation' ? show.outputContract.outputMapId : show.outputContract.referenceMapId
  if (id) ids.add(id)
  return [...ids]
}

function uniqueName(base: string, existing: readonly string[]): string {
  const names = new Set(existing.map(name => name.toLocaleLowerCase()))
  if (!names.has(base.toLocaleLowerCase())) return base
  let suffix = 2
  while (names.has(`${base} (${suffix})`.toLocaleLowerCase())) suffix += 1
  return `${base} (${suffix})`
}

function mapFingerprint(map: MapRecord): string {
  return artifactHash(JSON.stringify({ dim: map.dim, generator: map.generator, params: Object.fromEntries(Object.entries(map.params).sort(([a], [b]) => a.localeCompare(b))), source: map.source ?? null, gridDims: map.gridDims ?? null, points: map.points?.length ? mapFingerprintForPoints(map.points) : null }))
}
