import type { ControllerZone } from './controllerProfile'
import {
  installationCoverageBlockingMessage,
  installationPhysicalZones,
  validateInstallationCoverage,
} from './showInstallationCoverage'
import { portableCompatibilityBlockingMessage, validatePortableShowCompatibility } from './showPortableCompatibility'
import type { PatternRecord, ShowCell, ShowPatternRef, ShowRecord } from './personalContentRecords'
import { compileShow, type GeneratedShowArtifact, type ShowCompileOptions } from './showCompiler'
import { showRecordToCompileRecipe } from './showModel'
import { DEMO_AUTHORS, DEMOS } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import { SHOW_MAX_OUTPUT_PIXELS } from './showVmResourceLedger'
import { extractPatternAuthors, normalizePatternAuthors, PXLBLZ_AUTHOR, type ShowArtifactAttribution, type ShowPatternAttribution } from './patternAttribution'
import { projectShowGroupRuntimePatternInstances } from './showGroupModel'

export interface CompiledShowState {
  artifact: GeneratedShowArtifact | null
  error: string | null
  artifactBlocker?: string
}

/** The preview surface owns only Stage/target context; every Transpiler
 * option flows through unlisted, so a new compile option never needs a
 * forwarding edit here (a hand-maintained whitelist once silently dropped a
 * wave-2 counterfactual). */
interface ShowCompilationOptions extends ShowCompileOptions {
  stageDimension?: 1 | 2 | 3
  targetPixelCount?: number
}

const SHOW_PREVIEW_COMPILE_CACHE_LIMIT = 8
const showPreviewCompileCache = new Map<string, CompiledShowState>()

/** The zones a Show compiles over come from the Show itself: an Installation
 * physical Zone Layout supplies ranges, and every other contract routes
 * logically or nominally. Controller profiles stopped carrying zones in #775;
 * the recipe builder already shadowed any caller-provided zones with
 * Show-owned data for every loadable contract (see the #775 shadowing
 * fixtures in showPreviewArtifact.test.ts), so this collapse changes no
 * compiled artifact. */
export function resolveShowCompilationControllerZones(
  show: ShowRecord,
): ControllerZone[] | undefined {
  return installationPhysicalZones(show)
}

export function compileShowForPreview(
  show: ShowRecord,
  userPatterns: PatternRecord[],
  controllerZones: ControllerZone[] | undefined,
  libraries: Record<string, string>,
  options: ShowCompilationOptions = {},
): CompiledShowState {
  try {
    const compositionInstances = show.composition
      ? [
          ...show.composition.patternInstances,
          ...projectShowGroupRuntimePatternInstances(show.composition),
        ]
      : []
    const byCellId = Object.fromEntries(
      show.cells.map((cell) => [cell.id, sourceForShowCell(cell, userPatterns)]),
    )
    const byPatternInstanceId = Object.fromEntries(
      compositionInstances.map((instance) => [
        instance.id,
        sourceForShowPatternRef(instance.pattern, userPatterns),
      ]),
    )
    const recipe = showRecordToCompileRecipe(show, {
      byCellId,
      byPatternInstanceId,
      controllerZones,
      stageDimension: options.stageDimension,
    })
    const { stageDimension: _stageDimension, targetPixelCount: _targetPixelCount, ...compileOptions } = options
    const attribution = buildShowArtifactAttribution(show, userPatterns)
    const libraryOverrides = Object.fromEntries(
      Object.entries(libraries).filter(([name, source]) => LIBRARIES[name] !== source),
    )
    const cacheKey = showCompilationIdentity({
      recipe,
      libraryOverrides,
      compileOptions,
      attribution,
    })
    const cached = showPreviewCompileCache.get(cacheKey)
    if (cached) {
      showPreviewCompileCache.delete(cacheKey)
      showPreviewCompileCache.set(cacheKey, cached)
      return cached
    }
    const artifact = compileShow(recipe, { ...LIBRARIES, ...libraryOverrides }, compileOptions)
    const compiled = {
      artifact: {
        ...artifact,
        attribution,
      },
      error: null,
    } satisfies CompiledShowState
    showPreviewCompileCache.set(cacheKey, compiled)
    if (showPreviewCompileCache.size > SHOW_PREVIEW_COMPILE_CACHE_LIMIT) {
      showPreviewCompileCache.delete(showPreviewCompileCache.keys().next().value!)
    }
    return compiled
  } catch (error) {
    return { artifact: null, error: error instanceof Error ? error.message : 'Show compile failed' }
  }
}

export function compileShowForArtifact(
  show: ShowRecord,
  userPatterns: PatternRecord[],
  controllerZones: ControllerZone[] | undefined,
  libraries: Record<string, string>,
  options: ShowCompilationOptions = {},
): CompiledShowState {
  const coverageError = installationCoverageBlockingMessage(validateInstallationCoverage(show))
  if (coverageError) return { artifact: null, error: coverageError }
  const portableError = portableCompatibilityBlockingMessage(validatePortableShowCompatibility(
    show,
    [
      ...show.cells.map((cell) => ({
        cellId: cell.id,
        patternName: cell.patternName,
        source: sourceForShowCell(cell, userPatterns),
      })),
      ...(show.composition
        ? [
            ...show.composition.patternInstances,
            ...projectShowGroupRuntimePatternInstances(show.composition),
          ]
        : []).map((instance) => ({
        cellId: instance.id,
        patternName: instance.patternName,
        source: sourceForShowPatternRef(instance.pattern, userPatterns),
      })),
    ],
    options.stageDimension,
  ))
  if (portableError) return { artifact: null, error: portableError }
  const compiled = compileShowForPreview(show, userPatterns, controllerZones, libraries, options)
  if (show.outputContract?.kind === 'portable-2d' && (options.targetPixelCount ?? 0) > SHOW_MAX_OUTPUT_PIXELS) {
    const targetPixelCount = Math.floor(options.targetPixelCount!)
    return {
      ...compiled,
      artifactBlocker: `Target Controller reports ${targetPixelCount.toLocaleString('en-US')} pixels; compiled Shows support at most ${SHOW_MAX_OUTPUT_PIXELS.toLocaleString('en-US')}. Reduce the Controller pixel count before Run or Save.`,
    }
  }
  const resourceBlocker = compiled.artifact?.summary.resources.blockers[0]
  return resourceBlocker
    ? { ...compiled, artifactBlocker: resourceBlocker.message }
    : compiled
}

export function sourceForShowCell(cell: ShowCell, userPatterns: PatternRecord[]): string {
  return sourceForShowPatternRef(cell.pattern, userPatterns)
}

export function sourceForShowPatternRef(pattern: ShowPatternRef, userPatterns: PatternRecord[]): string {
  if (pattern.kind === 'stock') return DEMOS[pattern.id] ?? DEMOS.TestPattern1D
  return userPatterns.find((candidate) => candidate.id === pattern.id)?.src ?? DEMOS.TestPattern1D
}

export function buildShowArtifactAttribution(
  show: ShowRecord,
  userPatterns: readonly PatternRecord[],
): ShowArtifactAttribution {
  const patterns = new Map<string, ShowPatternAttribution>()
  const add = (ref: ShowPatternRef, name: string) => {
    const key = `${ref.kind}:${ref.id}`
    if (patterns.has(key)) return
    const authors = authorsForShowPatternRef(ref, userPatterns)
    patterns.set(key, { kind: ref.kind, id: ref.id, name, authors })
  }
  for (const cell of show.cells) add(cell.pattern, cell.patternName)
  for (const instance of show.composition?.patternInstances ?? []) add(instance.pattern, instance.patternName)
  for (const definition of show.composition?.groupDefinitions ?? []) {
    for (const instance of definition.patternInstances) add(instance.pattern, instance.patternName)
  }
  return {
    by: [PXLBLZ_AUTHOR],
    patterns: [...patterns.values()],
  }
}

function authorsForShowPatternRef(
  pattern: ShowPatternRef,
  userPatterns: readonly PatternRecord[],
): string[] {
  if (pattern.kind === 'stock') {
    return normalizePatternAuthors(DEMO_AUTHORS[pattern.id] ?? extractPatternAuthors(DEMOS[pattern.id] ?? ''))
  }
  const record = userPatterns.find((candidate) => candidate.id === pattern.id)
  if (!record) return []
  const structured = normalizePatternAuthors(record.authors)
  return structured.length > 0 ? structured : extractPatternAuthors(record.src)
}

function showCompilationIdentity(value: unknown): string {
  return JSON.stringify(value)
}
