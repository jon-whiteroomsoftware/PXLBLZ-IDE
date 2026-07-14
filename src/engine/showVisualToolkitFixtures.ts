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
    ...([
      ['black', '#000000'],
      ['white', '#ffffff'],
      ['custom', '#7c3aed'],
    ] as const).map(([name, color]): ShowToolkitFixtureRecipe => ({
      ...shared,
      id: `fade-color-${name}`,
      familyId: 'fade',
      variantId: 'through-color',
      recipe: {
        clips: clips(),
        routeTransition: {
          kind: 'fade-color',
          startMs: 1000,
          durationMs: 1000,
          easing: { curve: 'sine', direction: 'in-out' },
          color,
        },
      },
      persistedRecord: persistedRecord(`fade-color-${name}`, {
        kind: 'fade-color',
        durationMs: 1000,
        easing: { curve: 'sine', direction: 'in-out' },
        color,
      }),
    })),
    {
      ...shared,
      id: 'wipe-linear',
      familyId: 'wipe',
      variantId: 'linear',
      recipe: { clips: clips(), routeTransition: { kind: 'wipe', startMs: 1000, durationMs: 1000, feather: 0 } },
      persistedRecord: persistedRecord('wipe-linear', { kind: 'wipe', durationMs: 1000, feather: 0 }),
    },
    ...([
      ['east', 0],
      ['south-east', 0.125],
      ['south', 0.25],
      ['south-west', 0.375],
      ['west', 0.5],
      ['north-west', 0.625],
      ['north', 0.75],
      ['north-east', 0.875],
    ] as const).map(([name, direction]): ShowToolkitFixtureRecipe => ({
      ...shared,
      id: `wipe-direction-${name}`,
      familyId: 'wipe',
      variantId: 'linear',
      recipe: {
        clips: clips(),
        routeTransition: {
          kind: 'wipe', startMs: 1000, durationMs: 1000,
          direction, feather: 0, edgePolicy: 'hard',
        },
      },
      persistedRecord: directionalWipeRecord(`wipe-direction-${name}`, direction, 0, 'hard'),
    })),
    ...([
      ['dither', 'dither'],
      ['blend', 'blend'],
    ] as const).map(([name, edgePolicy]): ShowToolkitFixtureRecipe => ({
      ...shared,
      id: `wipe-arbitrary-${name}`,
      familyId: 'wipe',
      variantId: 'linear',
      recipe: {
        clips: clips(),
        routeTransition: {
          kind: 'wipe', startMs: 1000, durationMs: 1000,
          direction: 0.173, feather: 0.14, edgePolicy,
        },
      },
      persistedRecord: directionalWipeRecord(`wipe-arbitrary-${name}`, 0.173, 0.14, edgePolicy),
    })),
    ...([
      ['split-center-out', { wipeVariant: 'split', wipeMode: 'center-out', orientation: 'vertical' }],
      ['split-center-in', { wipeVariant: 'split', wipeMode: 'center-in', orientation: 'horizontal' }],
      ['barn-doors', { wipeVariant: 'barn-doors', wipeMode: 'center-out', centerX: 0.4, centerY: 0.6 }],
      ['blinds-horizontal', { wipeVariant: 'blinds', orientation: 'horizontal', count: 6, phase: 0.125 }],
      ['blinds-vertical', { wipeVariant: 'blinds', orientation: 'vertical', count: 8, phase: 0 }],
      ['clock', { wipeVariant: 'clock', centerX: 0.5, centerY: 0.5, phase: 0.125, clockwise: true }],
      ['checker', { wipeVariant: 'checker', count: 8 }],
      ['grid', { wipeVariant: 'grid', count: 6 }],
    ] as const).map(([name, settings]): ShowToolkitFixtureRecipe => ({
      ...shared,
      id: `wipe-${name}`,
      familyId: 'wipe',
      variantId: settings.wipeVariant,
      recipe: {
        clips: clips(),
        routeTransition: {
          kind: 'wipe', startMs: 1000, durationMs: 1000,
          feather: 0.08, edgePolicy: 'dither', ...settings,
        },
      },
      persistedRecord: spatialWipeRecord(`wipe-${name}`, settings),
    })),
    {
      ...shared,
      id: 'dissolve-pixel',
      familyId: 'dissolve',
      variantId: 'pixel',
      recipe: { clips: clips(), routeTransition: { kind: 'dither', startMs: 1000, durationMs: 1000 } },
      persistedRecord: persistedRecord('dissolve-pixel', { kind: 'dither', durationMs: 1000 }),
    },
    {
      ...shared,
      id: 'dissolve-pixel-seeded',
      familyId: 'dissolve',
      variantId: 'pixel',
      recipe: {
        clips: clips(),
        routeTransition: {
          kind: 'dither', startMs: 1000, durationMs: 1000,
          dissolveVariant: 'pixel', seed: 23, edgePolicy: 'dither',
        },
      },
      persistedRecord: persistedRecord('dissolve-pixel-seeded', {
        kind: 'dither', durationMs: 1000,
        dissolveVariant: 'pixel', seed: 23, edgePolicy: 'dither',
      }),
    },
    ...([8, 32] as const).map((blockSize): ShowToolkitFixtureRecipe => ({
      ...shared,
      id: `dissolve-block-${blockSize}`,
      familyId: 'dissolve',
      variantId: 'block',
      recipe: {
        clips: clips(),
        routeTransition: {
          kind: 'dither', startMs: 1000, durationMs: 1000,
          dissolveVariant: 'block', seed: 47, blockSize, edgePolicy: 'dither',
        },
      },
      persistedRecord: persistedRecord(`dissolve-block-${blockSize}`, {
        kind: 'dither', durationMs: 1000,
        dissolveVariant: 'block', seed: 47, blockSize, edgePolicy: 'dither',
      }),
    })),
    ...([
      ['coherent-noise-4', 'coherent-noise', 4, 0, 'hard'],
      ['coherent-noise-9', 'coherent-noise', 9, 0, 'hard'],
      ['soft-threshold-dither', 'soft-threshold', 6, 0.18, 'dither'],
      ['soft-threshold-blend', 'soft-threshold', 6, 0.24, 'blend'],
    ] as const).map(([name, dissolveVariant, scale, softness, edgePolicy]): ShowToolkitFixtureRecipe => ({
      ...shared,
      id: `dissolve-${name}`,
      familyId: 'dissolve',
      variantId: dissolveVariant,
      recipe: {
        clips: clips(),
        routeTransition: {
          kind: 'dither', startMs: 1000, durationMs: 1000,
          dissolveVariant, seed: 53, scale, softness, edgePolicy,
        },
      },
      persistedRecord: {
        ...persistedRecord(`dissolve-${name}`, {
          kind: 'dither', durationMs: 1000,
          dissolveVariant, seed: 53, scale, softness, edgePolicy,
        }),
        stageMapId: 'fixture-stage-2d',
      },
    })),
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
    ...(['grow-incoming', 'shrink-outgoing'] as const).flatMap((revealMode) => (
      (['circle', 'box'] as const).map((shape): ShowToolkitFixtureRecipe => ({
        ...shared,
        id: `shape-reveal-${shape}-${revealMode}`,
        familyId: 'shape-reveal',
        variantId: shape,
        persistedRecord: persistedRecord(`shape-reveal-${shape}-${revealMode}`, {
          kind: 'portal', durationMs: 1000,
          centerX: 0.5, centerY: 0.5, feather: 0.08,
          revealMode, invert: revealMode === 'shrink-outgoing',
          edgePolicy: 'dither', featherPolicy: 'dither',
          shape, scale: 1,
          ...(shape === 'box' ? { aspect: 1.6, rotation: 0.125 } : {}),
        }),
        recipe: {
          clips: clips(),
          routeTransition: {
            kind: 'portal', startMs: 1000, durationMs: 1000,
            centerX: 0.5, centerY: 0.5, feather: 0.08,
            revealMode, invert: revealMode === 'shrink-outgoing',
            edgePolicy: 'dither', featherPolicy: 'dither',
            shape, scale: 1,
            ...(shape === 'box' ? { aspect: 1.6, rotation: 0.125 } : {}),
          },
        },
      }))
    )),
    ...(['grow-incoming', 'shrink-outgoing'] as const).flatMap((revealMode) => (
      (['ellipse', 'rounded-box', 'cross', 'heart', 'star', 'crescent', 'cat-head', 'cat-side-profile', 'bastet'] as const)
        .map((shape): ShowToolkitFixtureRecipe => {
          const shapeSettings = catalogueShapeSettings(shape)
          return {
            ...shared,
            id: `shape-reveal-${shape}-${revealMode}`,
            familyId: 'shape-reveal',
            variantId: shape,
            persistedRecord: persistedRecord(`shape-reveal-${shape}-${revealMode}`, {
              kind: 'portal', durationMs: 1000,
              centerX: 0.5, centerY: 0.5, feather: 0.05,
              revealMode, invert: revealMode === 'shrink-outgoing',
              edgePolicy: 'dither', featherPolicy: 'dither',
              shape, scale: 0.9, ...shapeSettings,
            }),
            recipe: {
              clips: clips(),
              routeTransition: {
                kind: 'portal', startMs: 1000, durationMs: 1000,
                centerX: 0.5, centerY: 0.5, feather: 0.05,
                revealMode, invert: revealMode === 'shrink-outgoing',
                edgePolicy: 'dither', featherPolicy: 'dither',
                shape, scale: 0.9, ...shapeSettings,
              },
            },
          }
        })
    )),
    ...(['grow-incoming', 'shrink-outgoing'] as const).flatMap((revealMode) => (
      ([3, 4, 5, 6, 7, 8] as const).map((polygonSides): ShowToolkitFixtureRecipe => ({
        ...shared,
        id: `shape-reveal-polygon-${polygonSides}-${revealMode}`,
        familyId: 'shape-reveal',
        variantId: 'polygon',
        persistedRecord: persistedRecord(`shape-reveal-polygon-${polygonSides}-${revealMode}`, {
          kind: 'portal', durationMs: 1000,
          centerX: 0.5, centerY: 0.5, feather: 0.05,
          revealMode, invert: revealMode === 'shrink-outgoing',
          edgePolicy: 'dither', featherPolicy: 'dither',
          shape: 'polygon', scale: 0.9, polygonSides, rotation: 0.05, aspect: 1,
        }),
        recipe: {
          clips: clips(),
          routeTransition: {
            kind: 'portal', startMs: 1000, durationMs: 1000,
            centerX: 0.5, centerY: 0.5, feather: 0.05,
            revealMode, invert: revealMode === 'shrink-outgoing',
            edgePolicy: 'dither', featherPolicy: 'dither',
            shape: 'polygon', scale: 0.9, polygonSides, rotation: 0.05, aspect: 1,
          },
        },
      }))
    )),
    ...(['cover', 'reveal', 'push', 'content-grow', 'content-shrink'] as const).map((motionVariant): ShowToolkitFixtureRecipe => ({
      ...shared,
      id: `motion-${motionVariant}`,
      familyId: 'motion',
      variantId: motionVariant,
      recipe: {
        clips: clips(),
        routeTransition: {
          kind: 'motion', motionVariant, startMs: 1000, durationMs: 1000,
          direction: 0.125, anchorX: 0.25, anchorY: 0.75, contentScale: 0.2,
          addressPolicy: motionVariant === 'push' ? 'wrap' : 'clip',
          edgePolicy: motionVariant === 'push' ? 'blend' : 'hard',
        },
      },
      persistedRecord: {
        ...persistedRecord(`motion-${motionVariant}`, {
          kind: 'motion', durationMs: 1000, motionVariant,
          direction: 0.125, anchorX: 0.25, anchorY: 0.75, contentScale: 0.2,
          addressPolicy: motionVariant === 'push' ? 'wrap' : 'clip',
          edgePolicy: motionVariant === 'push' ? 'blend' : 'hard',
        }),
        stageMapId: 'fixture-stage-2d',
      },
    })),
  ]
}

function catalogueShapeSettings(
  shape: 'ellipse' | 'rounded-box' | 'cross' | 'heart' | 'star' | 'crescent' | 'cat-head' | 'cat-side-profile' | 'bastet',
): Partial<Pick<
  ShowBoundaryTransition,
  'aspect' | 'rotation' | 'cornerRadius' | 'crossWidth' | 'starPoints' | 'starInner' | 'crescentOffset'
>> {
  if (shape === 'ellipse') return { aspect: 1.6, rotation: 0.08 }
  if (shape === 'rounded-box') return { aspect: 1.4, rotation: 0.08, cornerRadius: 0.35 }
  if (shape === 'cross') return { aspect: 1.2, rotation: 0.125, crossWidth: 0.3 }
  if (shape === 'star') return { aspect: 1, rotation: 0.05, starPoints: 5, starInner: 0.45 }
  if (shape === 'crescent') return { aspect: 1.1, rotation: 0.08, crescentOffset: 0.45 }
  if (shape === 'cat-side-profile') return { aspect: 1.6, rotation: 0 }
  if (shape === 'bastet') return { aspect: 0.65, rotation: 0 }
  return { aspect: 1, rotation: 0 }
}

function directionalWipeRecord(
  id: string,
  direction: number,
  feather: number,
  edgePolicy: 'hard' | 'dither' | 'blend',
): ShowRecord {
  return {
    ...persistedRecord(id, { kind: 'wipe', durationMs: 1000, direction, feather, edgePolicy }),
    stageMapId: 'fixture-stage-2d',
  }
}

function spatialWipeRecord(
  id: string,
  settings: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId' | 'kind' | 'durationMs'>>,
): ShowRecord {
  return {
    ...persistedRecord(id, {
      kind: 'wipe', durationMs: 1000, feather: 0.08, edgePolicy: 'dither', ...settings,
    }),
    stageMapId: 'fixture-stage-2d',
  }
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
