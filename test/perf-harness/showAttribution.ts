import { bundle, type BundleMetadata } from '../../src/engine/bundle'
import { nativeDimension } from '../../src/engine/loadPattern'
import {
  compileShow,
  type GeneratedShowArtifact,
  type ShowCompileOptions,
  type ShowRecipe,
} from '../../src/engine/showCompiler'
import { countShowPersistentGlobals } from '../../src/engine/showVmResourceLedger'

export type ShowAttributionArtifactKind =
  | 'trivial-output'
  | 'constant-members'
  | 'capture-elided'
  | 'full'

export interface ShowAttributionArtifact {
  kind: ShowAttributionArtifactKind
  code: string
  expandedCode: string
  fxCode: string
  metadata: BundleMetadata
  sourceBytes: number
  expandedSourceBytes: number
  vmWords: number
  persistentGlobals: number
  exactBoundary: 'none' | 'constant-members'
}

export interface BuildShowAttributionArtifactsInput {
  recipe: ShowRecipe
  libraries: Record<string, string>
  compileOptions?: ShowCompileOptions
  captureElision?: {
    eligible: boolean
    reason: string
  }
}

export interface ShowAttributionArtifacts {
  trivialOutput: ShowAttributionArtifact
  constantMembers: ShowAttributionArtifact
  captureElided: ShowAttributionArtifact | null
  captureElisionReason: string
  full: ShowAttributionArtifact
  production: GeneratedShowArtifact
}

const CONSTANT_RGB = [0.125, 0.25, 0.5] as const

export function buildShowAttributionArtifacts(
  input: BuildShowAttributionArtifactsInput,
): ShowAttributionArtifacts {
  const production = compileShow(input.recipe, input.libraries, input.compileOptions)
  const constantRecipe: ShowRecipe = {
    ...input.recipe,
    clips: input.recipe.clips.map((clip) => ({
      ...clip,
      source: constantMemberSource(clip.source, input.libraries),
    })),
  }
  const constantProduction = compileShow(constantRecipe, input.libraries, input.compileOptions)
  const constantMembers = fromGenerated('constant-members', constantProduction)
  const captureElisionReason = input.captureElision?.reason
    ?? 'Capture elision requires one render-pure member per output pixel and no capture-dependent Effects or composition.'
  const captureElided = input.captureElision?.eligible
    ? buildCaptureElidedArtifact(constantProduction)
    : null

  return {
    trivialOutput: buildTrivialOutputArtifact(),
    constantMembers,
    captureElided,
    captureElisionReason,
    full: fromGenerated('full', production),
    production,
  }
}

function constantMemberSource(source: string, libraries: Record<string, string>): string {
  const compiled = bundle(source, libraries)
  const dimension = nativeDimension(compiled.metadata.renderFns)
  const controls = compiled.metadata.controls.map((control) => (
    `export function ${control.exportName}(value) {}`
  ))
  const render = dimension === 3
    ? `export function render3D(index, x, y, z) { rgb(${CONSTANT_RGB.join(', ')}) }`
    : dimension === 2
      ? `export function render2D(index, x, y) { rgb(${CONSTANT_RGB.join(', ')}) }`
      : `export function render(index) { rgb(${CONSTANT_RGB.join(', ')}) }`
  return [...controls, render].join('\n')
}

function buildTrivialOutputArtifact(): ShowAttributionArtifact {
  const source = `export function render(index) { rgb(${CONSTANT_RGB.join(', ')}) }`
  const compiled = bundle(source, {})
  return {
    kind: 'trivial-output',
    code: compiled.code,
    expandedCode: compiled.code,
    fxCode: compiled.fxCode,
    metadata: compiled.metadata,
    sourceBytes: byteLength(compiled.code),
    expandedSourceBytes: byteLength(compiled.code),
    vmWords: 0,
    persistentGlobals: countShowPersistentGlobals(compiled.code),
    exactBoundary: 'none',
  }
}

function buildCaptureElidedArtifact(constant: GeneratedShowArtifact): ShowAttributionArtifact {
  const captureNames = new Set<string>()
  let source = constant.expandedCode.replace(
    /function (__pxlblz_show_c\d+)_rgb\(r, g, b\) \{[^{}]*\}/g,
    (_match, prefix: string) => {
      captureNames.add(prefix)
      return `function ${prefix}_rgb(r, g, b) { rgb(r, g, b) }`
    },
  )
  let emitCount = 0
  source = source.replace(
    /function (__pxlblz_show_c\d+)_emit\(\) \{ rgb\([^{}]*\) \}/g,
    (_match, prefix: string) => {
      if (!captureNames.has(prefix)) return _match
      emitCount += 1
      return `function ${prefix}_emit() { }`
    },
  )
  if (captureNames.size === 0 || emitCount !== captureNames.size) {
    throw new Error(
      `Capture-elision diagnostic expected matched rgb/emit wrappers; found ${captureNames.size}/${emitCount}.`,
    )
  }
  const compiled = bundle(source, {})
  return {
    kind: 'capture-elided',
    code: compiled.code,
    expandedCode: compiled.code,
    fxCode: compiled.fxCode,
    metadata: compiled.metadata,
    sourceBytes: byteLength(compiled.code),
    expandedSourceBytes: byteLength(compiled.code),
    vmWords: constant.summary.resources.totalWords,
    persistentGlobals: countShowPersistentGlobals(compiled.code),
    exactBoundary: 'constant-members',
  }
}

function fromGenerated(
  kind: 'constant-members' | 'full',
  artifact: GeneratedShowArtifact,
): ShowAttributionArtifact {
  return {
    kind,
    code: artifact.code,
    expandedCode: artifact.expandedCode,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    sourceBytes: artifact.summary.artifactBytes,
    expandedSourceBytes: artifact.summary.expandedArtifactBytes,
    vmWords: artifact.summary.resources.totalWords,
    persistentGlobals: artifact.summary.resources.persistentGlobals,
    exactBoundary: 'none',
  }
}

export interface ShowAttributionFpsMeasurement {
  meanFps: number
  medianFps: number
}

export interface ShowAttributionMeasurements {
  trivialOutput: ShowAttributionFpsMeasurement
  constantMembers: ShowAttributionFpsMeasurement
  captureElided?: ShowAttributionFpsMeasurement
  full: ShowAttributionFpsMeasurement
}

interface ShowFrameAttribution {
  outputFloorMs: number
  routingCompositionMs: number | null
  captureReplayMs: number | null
  unresolvedShowOverheadMs: number
  patternEvaluationMs: number
  fullFrameMs: number
}

export function attributeShowFrameTime(measurements: ShowAttributionMeasurements) {
  const mean = attributeOne(
    measurements.trivialOutput.meanFps,
    measurements.constantMembers.meanFps,
    measurements.full.meanFps,
    measurements.captureElided?.meanFps,
  )
  const median = attributeOne(
    measurements.trivialOutput.medianFps,
    measurements.constantMembers.medianFps,
    measurements.full.medianFps,
    measurements.captureElided?.medianFps,
  )
  const order = measurements.captureElided
    ? [
        ['trivial-output', 'capture-elided', median.routingCompositionMs!],
        ['capture-elided', 'constant-members', median.captureReplayMs!],
        ['constant-members', 'full', median.patternEvaluationMs],
      ] as const
    : [
        ['trivial-output', 'constant-members', median.unresolvedShowOverheadMs],
        ['constant-members', 'full', median.patternEvaluationMs],
      ] as const
  return {
    mean,
    median,
    pairwiseMedianMs: order.map(([from, to, deltaMs]) => ({ from, to, deltaMs })),
  }
}

function attributeOne(
  trivialFps: number,
  constantFps: number,
  fullFps: number,
  captureElidedFps?: number,
): ShowFrameAttribution {
  const outputFloorMs = frameMs(trivialFps)
  const constantMs = frameMs(constantFps)
  const fullFrameMs = frameMs(fullFps)
  const patternEvaluationMs = roundMs(fullFrameMs - constantMs)
  if (captureElidedFps == null) {
    return {
      outputFloorMs,
      routingCompositionMs: null,
      captureReplayMs: null,
      unresolvedShowOverheadMs: roundMs(constantMs - outputFloorMs),
      patternEvaluationMs,
      fullFrameMs,
    }
  }
  const captureElidedMs = frameMs(captureElidedFps)
  return {
    outputFloorMs,
    routingCompositionMs: roundMs(captureElidedMs - outputFloorMs),
    captureReplayMs: roundMs(constantMs - captureElidedMs),
    unresolvedShowOverheadMs: 0,
    patternEvaluationMs,
    fullFrameMs,
  }
}

function frameMs(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Attribution FPS must be a positive finite number.')
  return roundMs(1_000 / fps)
}

function roundMs(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function byteLength(source: string): number {
  return new TextEncoder().encode(source).length
}
