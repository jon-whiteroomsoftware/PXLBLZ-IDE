import type { ShowControllerCompatibilityContext } from './showControllerArtifact'
import { addShowZone, createShowWithOutputContract } from './showModel'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from './showOutputContract'
import type { PatternRecord, ShowCompositionV1, ShowRecord } from './personalContentRecords'
import { compileShowForArtifact } from './showPreviewArtifact'

const PATTERNS: PatternRecord[] = [
  {
    id: 'freeze-red',
    name: 'Freeze red field',
    src: 'var t = 0\nexport function beforeRender(delta) { t += delta / 1000 }\nexport function render2D(index, x, y) { rgb(0.3 + 0.2 * sin(t + x), y * 0.2, 0.05) }',
    controls: {},
    updatedAt: 492,
  },
  {
    id: 'freeze-blue',
    name: 'Freeze blue field',
    src: 'var t = 0\nexport function beforeRender(delta) { t += delta / 800 }\nexport function render2D(index, x, y) { rgb(0.05, x * 0.2, 0.3 + 0.2 * sin(t + y)) }',
    controls: {},
    updatedAt: 492,
  },
  {
    id: 'freeze-white',
    name: 'Freeze white pulse',
    src: 'var pulse = 0\nexport function beforeRender(delta) { pulse += delta / 600 }\nexport function render2D(index, x, y) { var v = 0.2 + 0.1 * sin(pulse + x + y); rgb(v, v, v) }',
    controls: {},
    updatedAt: 492,
  },
]

export interface ShowCompositionFreezeCase {
  id: string
  show: ShowRecord & { composition: ShowCompositionV1 }
  patterns: PatternRecord[]
  mapPoints: Array<{ sample: number[] }>
  sampleTimesMs: number[]
  controller: ShowControllerCompatibilityContext
}

export interface ShowCompositionFreezeMeasurement {
  fixtureCount: number
  maxArtifact: { fixtureId: string; artifactBytes: number; budgetBytes: number; budgetRatio: number }
  maxWorstInstantRenderersPerPixel: { fixtureId: string; value: number }
  overBudgetFixtureIds: string[]
  /** Populated only by the representative-device gate. */
  representativeHardwareFps: number | null
}

export function buildShowCompositionFreezeCases(): ShowCompositionFreezeCase[] {
  return [portableCompositionCase(), installationCompositionCase()]
}

export function measureShowCompositionFreeze(): ShowCompositionFreezeMeasurement {
  const fixtures = buildShowCompositionFreezeCases()
  let maxArtifact = { fixtureId: '', artifactBytes: 0, budgetBytes: 0, budgetRatio: 0 }
  let maxWorstInstantRenderersPerPixel = { fixtureId: '', value: 0 }
  const overBudgetFixtureIds: string[] = []
  for (const fixture of fixtures) {
    const compiled = compileShowForArtifact(
      fixture.show,
      fixture.patterns,
      undefined,
      {},
      { stageDimension: 2 },
    )
    if (!compiled.artifact) throw new Error(`${fixture.id}: ${compiled.error ?? 'Show composition did not compile'}`)
    const summary = compiled.artifact.summary
    if (summary.artifactBytes > maxArtifact.artifactBytes) {
      maxArtifact = {
        fixtureId: fixture.id,
        artifactBytes: summary.artifactBytes,
        budgetBytes: summary.measuredDeviceBudgetBytes,
        budgetRatio: summary.artifactBudgetRatio,
      }
    }
    if (summary.worstInstantRenderersPerPixel > maxWorstInstantRenderersPerPixel.value) {
      maxWorstInstantRenderersPerPixel = {
        fixtureId: fixture.id,
        value: summary.worstInstantRenderersPerPixel,
      }
    }
    if (summary.artifactBytes >= summary.measuredDeviceBudgetBytes) overBudgetFixtureIds.push(fixture.id)
  }
  return {
    fixtureCount: fixtures.length,
    maxArtifact,
    maxWorstInstantRenderersPerPixel,
    overBudgetFixtureIds,
    representativeHardwareFps: null,
  }
}

function portableCompositionCase(): ShowCompositionFreezeCase {
  const show = createShowWithOutputContract(
    'freeze-portable',
    'Portable local composition freeze',
    createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 64 }),
    492,
  )
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('portable-red', 'freeze-red', 'Freeze red field'),
      instance('portable-blue', 'freeze-blue', 'Freeze blue field'),
      instance('portable-white', 'freeze-white', 'Freeze white pulse'),
      instance('portable-red-restart', 'freeze-red', 'Freeze red field'),
    ],
    scenes: [
      {
        sceneId: 'scene-1',
        propertyTracks: [
          track('speed-track', { kind: 'instance-time-scale', instanceId: 'portable-red' }, 0.5, 1.5),
          track('brightness-track', { kind: 'placement-view', placementId: 'portable-main-a', property: 'brightness' }, 0.4, 1),
          track('rotation-track', {
            kind: 'placement-effect',
            placementId: 'portable-main-a',
            effectId: 'portable-turn',
            effectKind: 'rotate',
            parameterId: 'turns',
          }, 0, 1),
          track('opacity-track', { kind: 'placement-opacity', placementId: 'portable-overlay' }, 0.15, 0.75),
        ],
        zones: [{
          zoneId: 'zone-1',
          main: [
            placement('portable-main-a', 'portable-red', 0, 15_000, {
              effects: [{ id: 'portable-turn', kind: 'rotate', turns: 0 }],
            }),
            placement('portable-main-b', 'portable-blue', 15_000, 15_000),
          ],
          overlays: [{
            id: 'portable-atmosphere',
            name: 'Atmosphere',
            placements: [{
              ...placement('portable-overlay', 'portable-white', 5_000, 20_000),
              opacity: 0.5,
            }],
          }],
        }],
      },
      {
        sceneId: 'scene-2',
        zones: [{
          zoneId: 'zone-1',
          main: [
            placement('portable-continue', 'portable-red', 0, 15_000),
            placement('portable-restart', 'portable-red-restart', 15_000, 15_000),
          ],
          overlays: [],
        }],
      },
    ],
  }
  return {
    id: 'portable-local-composition',
    show: { ...show, composition },
    patterns: PATTERNS,
    mapPoints: squareMapPoints(8),
    sampleTimesMs: [0, 5_000, 14_999, 15_000, 29_500, 30_000, 31_000, 45_000, 59_999],
    controller: { pixelCount: 64, map: { id: 'plane', name: 'Square', mapClass: 'surface' } },
  }
}

function installationCompositionCase(): ShowCompositionFreezeCase {
  const base = createShowWithOutputContract(
    'freeze-installation',
    'Installation routed composition freeze',
    createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 64 }),
    492,
  )
  const show = addShowZone(base, { name: 'right', nominalPixelCount: 32 })
  show.zones = show.zones.map((zone) => ({ ...zone, nominalPixelCount: 32 }))
  show.routingLayouts = [{
    id: 'layout-1',
    name: 'Left and right',
    zones: [
      { zoneId: 'zone-1', ranges: [{ start: 0, end: 31 }] },
      { zoneId: 'zone-2', ranges: [{ start: 32, end: 63 }] },
    ],
  }]
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('install-red', 'freeze-red', 'Freeze red field'),
      instance('install-blue', 'freeze-blue', 'Freeze blue field'),
      instance('install-white', 'freeze-white', 'Freeze white pulse'),
    ],
    scenes: ['scene-1', 'scene-2'].map((sceneId, sceneIndex) => ({
      sceneId,
      zones: ['zone-1', 'zone-2'].map((zoneId, zoneIndex) => {
        const mainInstance = (sceneIndex + zoneIndex) % 2 === 0 ? 'install-red' : 'install-blue'
        const overlayInstance = mainInstance === 'install-red' ? 'install-blue' : 'install-white'
        return {
          zoneId,
          main: [placement(`${sceneId}-${zoneId}-main`, mainInstance, 0, 30_000)],
          overlays: [{
            id: `${sceneId}-${zoneId}-layer`,
            name: 'Glow',
            placements: [{
              ...placement(`${sceneId}-${zoneId}-overlay`, overlayInstance, 0, 30_000),
              opacity: 0.35,
            }],
          }],
        }
      }),
    })),
  }
  return {
    id: 'installation-routed-composition',
    show: { ...show, composition },
    patterns: PATTERNS,
    mapPoints: squareMapPoints(8),
    sampleTimesMs: [0, 10_000, 29_000, 30_000, 31_000, 45_000, 59_999],
    controller: { pixelCount: 64, map: { id: 'plane', name: 'Square', mapClass: 'surface' } },
  }
}

function instance(id: string, patternId: string, patternName: string): ShowCompositionV1['patternInstances'][number] {
  return {
    id,
    pattern: { kind: 'user', id: patternId },
    patternName,
    time: { timeScale: 1, timeOffsetMs: 0 },
  }
}

function placement(
  id: string,
  instanceId: string,
  startMs: number,
  durationMs: number,
  extra: Partial<ShowCompositionV1['scenes'][number]['zones'][number]['main'][number]> = {},
): ShowCompositionV1['scenes'][number]['zones'][number]['main'][number] {
  return {
    id,
    instanceId,
    startMs,
    durationMs,
    view: { mirror: false, phase: 0, brightness: 1 },
    ...extra,
  }
}

function track(
  id: string,
  target: NonNullable<ShowCompositionV1['scenes'][number]['propertyTracks']>[number]['target'],
  from: number,
  to: number,
): NonNullable<ShowCompositionV1['scenes'][number]['propertyTracks']>[number] {
  return {
    id,
    target,
    keyframes: [
      { id: `${id}-start`, timeMs: 0, value: from, easing: { curve: 'linear' } },
      { id: `${id}-end`, timeMs: 30_000, value: to, easing: { curve: 'linear' } },
    ],
  }
}

function squareMapPoints(side: number): Array<{ sample: number[] }> {
  return Array.from({ length: side * side }, (_, index) => ({
    sample: [index % side / (side - 1), Math.floor(index / side) / (side - 1)],
  }))
}
