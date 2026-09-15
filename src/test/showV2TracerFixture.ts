import type {
  ShowCrossfadePolicy,
  ShowLayerTransition,
  ShowRecord,
  ShowTransitionKind,
} from '../engine/personalContentRecords'

export function convertibleV1Show(): ShowRecord {
  return {
    id: 'convertible',
    name: 'Convertible',
    scenes: [{ id: 'scene-a', name: 'Opening', durationMs: 1_000 }],
    zones: [{ id: 'zone', name: 'Main', nominalPixelCount: 16 }],
    cells: [],
    routingLayouts: [{ id: 'layout', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } }],
    transitions: [],
    outputContract: {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 16,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
    composition: {
      version: 1,
      executionModel: 'deterministic-loop',
      durationMs: 1_000,
      patternInstances: [{
        id: 'instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId: 'scene-a',
        zones: [{
          zoneId: 'zone',
          main: [{
            id: 'clip', instanceId: 'instance', startMs: 0, durationMs: 1_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [{ id: 'empty-overlay', name: 'Atmosphere', placements: [] }],
        }],
      }],
    },
    updatedAt: 1,
  }
}

export function continuingV1Show(): ShowRecord {
  const show = convertibleV1Show()
  show.id = 'continuing'
  show.name = 'Continuing across Scenes'
  show.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 500 },
    { id: 'scene-b', name: 'Closing', durationMs: 500 },
  ]
  show.composition!.scenes = [
    {
      sceneId: 'scene-a',
      zones: [{
        zoneId: 'zone', overlays: [],
        main: [{ id: 'clip', instanceId: 'instance', startMs: 0, durationMs: 500, view: { mirror: false, phase: 0, brightness: 1 } }],
      }],
    },
    {
      sceneId: 'scene-b',
      zones: [{
        zoneId: 'zone', overlays: [],
        main: [{ id: 'clip--span-scene-b', logicalClipId: 'clip', instanceId: 'instance', startMs: 0, durationMs: 500, view: { mirror: false, phase: 0, brightness: 1 } }],
      }],
    },
  ]
  return show
}

export function flatV1Show(restartSecond = false): ShowRecord {
  const show = convertibleV1Show()
  show.id = restartSecond ? 'flat-restart' : 'flat-continue'
  show.name = restartSecond ? 'Flat restart' : 'Flat continue'
  show.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 500 },
    { id: 'scene-b', name: 'Closing', durationMs: 500 },
  ]
  show.cells = restartSecond ? [
    {
      id: 'cell-a', zoneId: 'zone', sceneId: 'scene-a', sceneSpan: 1,
      pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Diagnostic',
      adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
    },
    {
      id: 'cell-b', zoneId: 'zone', sceneId: 'scene-b', sceneSpan: 1,
      pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Diagnostic',
      adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
      ...(restartSecond ? { restartOnEntry: true } : {}),
    },
  ] : [{
    id: 'cell-a', zoneId: 'zone', sceneId: 'scene-a', sceneSpan: 2,
    pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Diagnostic',
    adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
  }]
  delete show.composition
  return show
}

export function transitionV1Show(
  kind: Exclude<ShowTransitionKind, 'cut'>,
  crossfadePolicy: ShowCrossfadePolicy = 'snapshot-live',
): ShowRecord {
  const show = convertibleV1Show()
  show.stageMapId = 'plane'
  show.composition!.patternInstances = [
    {
      id: 'out-instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Outgoing',
      time: { timeScale: 1, timeOffsetMs: 0 },
    },
    {
      id: 'in-instance', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Incoming',
      time: { timeScale: 1, timeOffsetMs: 0 },
    },
  ]
  show.composition!.scenes[0].zones[0].main = [
    {
      id: 'out', instanceId: 'out-instance', startMs: 0, durationMs: 400,
      view: { mirror: false, phase: 0, brightness: 1 },
    },
    {
      id: 'in', instanceId: 'in-instance', startMs: 600, durationMs: 400,
      view: { mirror: false, phase: 0, brightness: 1 },
    },
  ]
  const settings = transitionSettings(kind, crossfadePolicy)
  show.composition!.transitions = [{
    id: `transition-${kind}`,
    fromPlacementId: 'out',
    toPlacementId: 'in',
    kind,
    durationMs: 200,
    easing: { curve: 'sine', direction: 'in-out' },
    ...settings,
  }]
  return show
}

function transitionSettings(
  kind: Exclude<ShowTransitionKind, 'cut'>,
  crossfadePolicy: ShowCrossfadePolicy,
): Partial<ShowLayerTransition> {
  if (kind === 'crossfade') return { crossfadePolicy }
  if (kind === 'fade-color') return { color: '#204060' }
  if (kind === 'wipe') return { wipeVariant: 'linear', feather: 0.15 }
  if (kind === 'dither') return { dissolveVariant: 'pixel', seed: 17 }
  if (kind === 'portal') return {
    centerX: 0.5,
    centerY: 0.5,
    featherPolicy: 'blend',
    shape: 'circle',
    scale: 1,
    revealMode: 'grow-incoming',
  }
  return {
    motionVariant: 'push',
    direction: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    contentScale: 1,
    addressPolicy: 'clip',
  }
}
