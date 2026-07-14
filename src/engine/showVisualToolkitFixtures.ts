import { compileShow, type ShowRecipe } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import {
  createDefaultShow,
  normalizeShowTransitionState,
  updateShowBoundaryTransition,
  updateShowCellEffects,
  updateShowCellPattern,
} from './showModel'
import type { ShowBoundaryTransition, ShowClipEffect, ShowRecord } from './personalContentRecords'
import {
  resolveShowToolkitParameters,
  type ShowToolkitKind,
  type ShowToolkitParameterValue,
} from './showVisualToolkit'

export interface ShowToolkitFixtureRecipe {
  id: string
  familyId: string
  variantId: string
  recipe: ShowRecipe
  progressSamples: number[]
  capturePixelCount: number
  stageDimension: 1 | 2 | 3
  persistedRecord: ShowRecord
}

export interface ShowToolkitFixtureCapture {
  fixtureId: string
  generatedCode: string
  frames: Array<{
    progress: number
    checksum: string
    representativePixels: [number, number, number][]
  }>
}

const PROGRESS_SAMPLES = [0, 0.25, 0.5, 0.75, 1]
const OUTGOING_SOURCE = 'export function render2D(index, x, y) { rgb(0, x, y) }'
const INCOMING_SOURCE = 'export function render2D(index, x, y) { rgb(1 - x, 0, 1 - y) }'

function clips(): ShowRecipe['clips'] {
  return [
    { id: 'outgoing', source: OUTGOING_SOURCE },
    { id: 'incoming', source: INCOMING_SOURCE },
  ]
}

function persistedRecord(
  fixtureId: string,
  changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>,
): ShowRecord {
  const record = updateShowBoundaryTransition(
    createDefaultShow(`fixture-${fixtureId}`, fixtureId, 443),
    'transition-scene-1',
    changes,
  )
  return { ...record, updatedAt: 443 }
}

export function createShowToolkitFixtureRecipes(): ShowToolkitFixtureRecipe[] {
  const shared = { progressSamples: [...PROGRESS_SAMPLES], capturePixelCount: 256, stageDimension: 2 as const }
  return [
    {
      ...shared,
      id: 'blend-cut',
      familyId: 'blend',
      variantId: 'cut',
      recipe: { clips: clips(), cut: { startMs: 1000 } },
      persistedRecord: persistedRecord('blend-cut', { kind: 'cut', durationMs: 0 }),
    },
    {
      ...shared,
      id: 'blend-crossfade',
      familyId: 'blend',
      variantId: 'crossfade',
      recipe: { clips: clips(), crossfade: { startMs: 1000, durationMs: 1000 } },
      persistedRecord: persistedRecord('blend-crossfade', { kind: 'crossfade', durationMs: 1000 }),
    },
    {
      ...shared,
      id: 'wipe-linear',
      familyId: 'wipe',
      variantId: 'linear',
      recipe: { clips: clips(), routeTransition: { kind: 'wipe', startMs: 1000, durationMs: 1000, feather: 0 } },
      persistedRecord: persistedRecord('wipe-linear', { kind: 'wipe', durationMs: 1000, feather: 0 }),
    },
    {
      ...shared,
      id: 'dissolve-pixel',
      familyId: 'dissolve',
      variantId: 'pixel',
      recipe: { clips: clips(), routeTransition: { kind: 'dither', startMs: 1000, durationMs: 1000 } },
      persistedRecord: persistedRecord('dissolve-pixel', { kind: 'dither', durationMs: 1000 }),
    },
    ...(['circle', 'diamond', 'ring'] as const).map((shape): ShowToolkitFixtureRecipe => ({
      ...shared,
      id: `shape-reveal-${shape}`,
      familyId: 'shape-reveal',
      variantId: shape,
      persistedRecord: persistedRecord(`shape-reveal-${shape}`, {
        kind: 'portal',
        durationMs: 1000,
        centerX: 0.5,
        centerY: 0.5,
        feather: 0.08,
        featherPolicy: 'dither',
        shape,
        scale: 1,
        ...(shape === 'diamond' ? { rotation: 0.125, spin: 0.5 } : {}),
        ...(shape === 'ring' ? { ringWidth: 0.12 } : {}),
      }),
      recipe: {
        clips: clips(),
        routeTransition: {
          kind: 'portal',
          startMs: 1000,
          durationMs: 1000,
          centerX: 0.5,
          centerY: 0.5,
          feather: 0.08,
          featherPolicy: 'dither',
          shape,
          scale: 1,
          ...(shape === 'diamond' ? { rotation: 0.125, spin: 0.5 } : {}),
          ...(shape === 'ring' ? { ringWidth: 0.12 } : {}),
        },
      },
    })),
  ]
}

export function createShowEffectToolkitFixtureRecipes(): ShowToolkitFixtureRecipe[] {
  const shared = { progressSamples: [...PROGRESS_SAMPLES], capturePixelCount: 256, stageDimension: 2 as const }
  const opacity = [{ id: 'fade', kind: 'opacity' as const, opacity: 0.5 }]
  const affineWrap: ShowClipEffect[] = [
    { id: 'move', kind: 'translate', x: 0.35, y: -0.2 },
    { id: 'turn', kind: 'rotate', turns: 0.125 },
    { id: 'size', kind: 'scale', x: 1.4, y: 0.8 },
    { id: 'slant', kind: 'shear', x: 0.2, y: 0 },
    { id: 'wrap', kind: 'wrap' },
  ]
  const animatedTarget: ShowClipEffect[] = [
    { id: 'move', kind: 'translate', x: 0.4, y: 0 },
    { id: 'fade', kind: 'opacity', opacity: 0.4 },
  ]
  return [
    {
      ...shared,
      id: 'effect-opacity',
      familyId: 'output',
      variantId: 'opacity',
      recipe: { clips: [{ id: 'outgoing', source: OUTGOING_SOURCE, effects: opacity }] },
      persistedRecord: persistedEffectRecord('effect-opacity', opacity),
    },
    {
      ...shared,
      id: 'effect-affine-wrap',
      familyId: 'affine',
      variantId: 'wrap',
      recipe: { clips: [{ id: 'outgoing', source: OUTGOING_SOURCE, effects: affineWrap }] },
      persistedRecord: persistedEffectRecord('effect-affine-wrap', affineWrap),
    },
    {
      ...shared,
      id: 'effect-animated',
      familyId: 'affine',
      variantId: 'translate',
      recipe: {
        clips: [{ id: 'outgoing', source: OUTGOING_SOURCE, effects: animatedTarget }],
        adaptationRamp: {
          startMs: 1000,
          durationMs: 1000,
          from: {},
          to: {},
          effectRamps: {
            move: { x: { from: 0, to: 0.4, durationMs: 1000, easing: { curve: 'cubic', direction: 'in-out' } } },
            fade: { opacity: { from: 1, to: 0.4, durationMs: 1000, easing: { curve: 'sine', direction: 'in-out' } } },
          },
        },
      },
      persistedRecord: persistedAnimatedEffectRecord('effect-animated', animatedTarget),
    },
  ]
}

function persistedEffectRecord(id: string, effects: ShowClipEffect[]): ShowRecord {
  const record = updateShowCellEffects(createDefaultShow(`fixture-${id}`, id, 444), 'cell-1', effects)
  return { ...normalizeShowTransitionState(record), updatedAt: 444 }
}

function persistedAnimatedEffectRecord(id: string, targetEffects: ShowClipEffect[]): ShowRecord {
  let record = createDefaultShow(`fixture-${id}`, id, 444)
  record = updateShowCellPattern(record, 'cell-2', {
    pattern: record.cells[0].pattern,
    patternName: record.cells[0].patternName,
  })
  record = updateShowCellEffects(record, 'cell-1', [
    { id: 'move', kind: 'translate', x: 0, y: 0 },
    { id: 'fade', kind: 'opacity', opacity: 1 },
  ])
  record = updateShowCellEffects(record, 'cell-2', targetEffects)
  record = updateShowBoundaryTransition(record, 'transition-scene-1', {
    propertyTransitions: {
      effects: {
        move: { x: { fromByCellId: { 'cell-2': 0 }, durationMs: 1000, easing: { curve: 'cubic', direction: 'in-out' } } },
        fade: { opacity: { fromByCellId: { 'cell-2': 1 }, durationMs: 1000, easing: { curve: 'sine', direction: 'in-out' } } },
      },
    },
  })
  return { ...record, updatedAt: 444 }
}

export function captureShowToolkitFixture(fixture: ShowToolkitFixtureRecipe): ShowToolkitFixtureCapture {
  const artifact = compileShow(fixture.recipe, {})
  const side = Math.round(Math.sqrt(fixture.capturePixelCount))
  if (side * side !== fixture.capturePixelCount) {
    throw new Error(`Fixture ${fixture.id} capturePixelCount must form a square 2D map.`)
  }
  const mapPoints = Array.from({ length: fixture.capturePixelCount }, (_, index) => ({
    sample: [(index % side) / Math.max(1, side - 1), Math.floor(index / side) / Math.max(1, side - 1)],
  }))
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints, randomSeed: 443 })
  const representativeIndexes = [0, Math.floor(fixture.capturePixelCount / 2), fixture.capturePixelCount - 1]
  return {
    fixtureId: fixture.id,
    generatedCode: artifact.code,
    frames: fixture.progressSamples.map((progress) => {
      const frame = runtime.advanceTo(1000 + progress * 1000, { stepMs: 50 })
      return {
        progress,
        checksum: frame.checksum,
        representativePixels: representativeIndexes.map((index) => frame.pixels[index]),
      }
    }),
  }
}

export function roundTripShowToolkitFixtureRecord(fixture: ShowToolkitFixtureRecipe): ShowRecord {
  return normalizeShowTransitionState(JSON.parse(JSON.stringify(fixture.persistedRecord)) as ShowRecord)
}

export function createShowToolkitParameterSweep(
  kind: ShowToolkitKind,
  familyId: string,
  variantId: string,
): Array<Record<string, ShowToolkitParameterValue>> {
  const parameters = resolveShowToolkitParameters(kind, familyId, variantId, {})
  const defaults = Object.fromEntries(parameters.map((parameter) => [parameter.id, parameter.defaultValue]))
  const candidates: Array<Record<string, ShowToolkitParameterValue>> = [defaults]
  for (const parameter of parameters) {
    if (parameter.kind === 'number') {
      for (const value of [parameter.min, parameter.defaultValue, parameter.max]) {
        if (typeof value === 'number') candidates.push({ ...defaults, [parameter.id]: value })
      }
    } else if (parameter.kind === 'enum') {
      for (const option of parameter.options ?? []) candidates.push({ ...defaults, [parameter.id]: option.value })
    } else if (parameter.kind === 'boolean') {
      candidates.push({ ...defaults, [parameter.id]: false }, { ...defaults, [parameter.id]: true })
    }
  }
  const unique = new Map(candidates.map((candidate) => [JSON.stringify(candidate), candidate]))
  return [...unique.values()]
}
