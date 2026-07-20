import type { ControllerZone } from './controllerProfile'
import { installationCoverageBlockingMessage, validateInstallationCoverage } from './showInstallationCoverage'
import { portableCompatibilityBlockingMessage, validatePortableShowCompatibility } from './showPortableCompatibility'
import type { PatternRecord, ShowCell, ShowPatternRef, ShowRecord } from './personalContentRecords'
import { compileShow, type GeneratedShowArtifact } from './showCompiler'
import { showRecordToCompileRecipe } from './showModel'
import { DEMO_AUTHORS, DEMOS } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import { SHOW_MAX_OUTPUT_PIXELS } from './showVmResourceLedger'
import { extractPatternAuthors, normalizePatternAuthors, PXLBLZ_AUTHOR, type ShowArtifactAttribution, type ShowPatternAttribution } from './patternAttribution'

export interface CompiledShowState {
  artifact: GeneratedShowArtifact | null
  error: string | null
  artifactBlocker?: string
}

interface ShowCompilationOptions {
  stageDimension?: 1 | 2 | 3
  targetPixelCount?: number
  /** Test/benchmark counterfactual; production compilation leaves this enabled. */
  exactSpecializations?: boolean
  /** Test/benchmark counterfactual for issue #513. */
  frameInvariantHoisting?: boolean
  /** Test/benchmark counterfactual for issue #513. */
  renderKernelSpecialization?: boolean
  /** Test/benchmark physical-arena counterfactual for issue #515. */
  renderTargetArenaEmission?: boolean
  /** Test/benchmark representation control for issue #525. */
  motionTransitionSharing?: 'auto' | 'none' | 'structure' | 'exact'
  showScoreSharing?: 'auto' | 'none' | 'force'
  patternSlotSharing?: 'auto' | 'none' | 'force'
  /** Test/benchmark hardware-gated coordinate-field candidate for issue #528. */
  coordinateFieldCaching?: boolean
  /** Wave-2 (#554) benchmark counterfactuals; production leaves them enabled. */
  directColorSinks?: boolean
  colorCoefficientHoisting?: boolean
  capturePrologueSimplification?: boolean
  pixelCountWriteHoisting?: boolean
  hsvCaptureChainSpecialization?: boolean
  inlineCallHoisting?: boolean
  placementPrologueHoisting?: boolean
  functionValuedSinkRebinding?: boolean
  packedRoutingRepricing?: boolean
  helperCallInlining?: boolean
}

export function compileShowForPreview(
  show: ShowRecord,
  userPatterns: PatternRecord[],
  controllerZones: ControllerZone[] | undefined,
  libraries: Record<string, string>,
  options: ShowCompilationOptions = {},
): CompiledShowState {
  try {
    const byCellId = Object.fromEntries(
      show.cells.map((cell) => [cell.id, sourceForShowCell(cell, userPatterns)]),
    )
    const byPatternInstanceId = Object.fromEntries(
      (show.composition?.patternInstances ?? []).map((instance) => [
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
    const artifact = compileShow(recipe, { ...LIBRARIES, ...libraries }, {
        exactSpecializations: options.exactSpecializations,
        frameInvariantHoisting: options.frameInvariantHoisting,
        renderKernelSpecialization: options.renderKernelSpecialization,
        renderTargetArenaEmission: options.renderTargetArenaEmission,
        motionTransitionSharing: options.motionTransitionSharing,
        showScoreSharing: options.showScoreSharing,
        patternSlotSharing: options.patternSlotSharing,
        coordinateFieldCaching: options.coordinateFieldCaching,
        directColorSinks: options.directColorSinks,
        colorCoefficientHoisting: options.colorCoefficientHoisting,
        capturePrologueSimplification: options.capturePrologueSimplification,
        pixelCountWriteHoisting: options.pixelCountWriteHoisting,
        hsvCaptureChainSpecialization: options.hsvCaptureChainSpecialization,
        inlineCallHoisting: options.inlineCallHoisting,
        placementPrologueHoisting: options.placementPrologueHoisting,
        functionValuedSinkRebinding: options.functionValuedSinkRebinding,
        packedRoutingRepricing: options.packedRoutingRepricing,
        helperCallInlining: options.helperCallInlining,
      })
    return {
      artifact: {
        ...artifact,
        attribution: buildShowArtifactAttribution(show, userPatterns),
      },
      error: null,
    }
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
      ...(show.composition?.patternInstances ?? []).map((instance) => ({
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
