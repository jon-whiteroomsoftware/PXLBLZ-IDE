import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS_V2 } from '@/pixelblaze/stock/showsV2'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'
import { convertForTest } from '@/test/showEditorV2Harness'
import { buildShowCompositionFreezeCases } from './showCompositionFreeze'
import type { ShowRecordV2 } from './showCompositionV2'
import { createShowWithOutputContract } from './showModel'
import { createInstallationShowOutputContract } from './showOutputContract'
import { installationCoverageBlockingMessage } from './showInstallationCoverage'
import { validateInstallationCoverageV2 } from './showInstallationCoverageV2'
import { captureShowStageEditV2, type ShowPreparedStageDependenciesV2 } from './showPreparedStageV2'
import { portableTargetPixelBlocker } from './showPreviewArtifact'
import type { PatternRecord } from './personalContentRecords'
import {
  compileShowV2ForDelivery,
  exportShowV2ForDelivery,
  prepareShowV2ControllerDelivery,
  prepareShowV2ForController,
  type ShowV2ControllerTarget,
} from './showV2ControllerDelivery'

// The editor's `preparedV2Dependencies` shape with no personal content: stock
// Patterns, libraries and maps resolve inside preparation.
function dependenciesFor(record: ShowRecordV2, patterns: PatternRecord[] = []): ShowPreparedStageDependenciesV2 {
  return { patterns, libraries: [], maps: [], profiles: [], stageMap: resolveShowV2StageMap(record.stageMapId, []) }
}

function controllerFor(pixelCount: number | undefined): ShowV2ControllerTarget {
  return { mapDim: 2, firmwareVersion: '3.67', compatibility: { pixelCount } }
}

// The "known-invalid Installation Controller target" of ShowEditor.test.tsx
// (#437): the Show needs 8 pixels and the Controller reports 7.
function measuredWallShow(): ShowRecordV2 {
  return convertForTest(createShowWithOutputContract(
    'show-fixed',
    'Measured wall Show',
    createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
    1000,
  ))
}

describe('prepareShowV2ControllerDelivery (#1129)', () => {
  it('delivers every ready stock Show with the source the step functions chain to', () => {
    let delivered = 0
    for (const record of STOCK_SHOWS_V2) {
      const dependencies = dependenciesFor(record)
      const capture = captureShowStageEditV2(record, dependencies)
      if (capture.prepared.status !== 'ready') continue
      const pixelCount = capture.prepared.bundle.presentation.pixelCount
      const controller = controllerFor(pixelCount)
      const result = prepareShowV2ControllerDelivery({ record, dependencies, targetPixelCount: pixelCount, controller })
      expect(result, record.id).toMatchObject({ status: 'ready' })
      if (result.status !== 'ready') continue
      const compiled = compileShowV2ForDelivery({ record, prepared: capture.prepared, targetPixelCount: pixelCount })
      const byHand = prepareShowV2ForController(compiled, exportShowV2ForDelivery(record, compiled, []), controller)
      expect(result.source, record.id).toBe(byHand.value?.source)
      expect(result.artifactStamp, record.id).toMatchObject({ kind: 'show', id: record.id, name: record.name })
      delivered += 1
    }
    expect(delivered).toBeGreaterThan(0)
    // Compiles the whole stock catalogue; the default 5 s times out under full-suite load.
  }, 20_000)

  it('refuses a Portable Show whose target Controller exceeds the output ceiling (#514)', () => {
    const record = STOCK_SHOWS_V2.find(candidate => candidate.outputContract.kind === 'portable-2d')!
    const expected = portableTargetPixelBlocker(record.outputContract.kind, 2_001)
    expect(expected).toBeDefined()
    expect(prepareShowV2ControllerDelivery({
      record,
      dependencies: dependenciesFor(record),
      targetPixelCount: 2_001,
      controller: controllerFor(2_001),
    })).toEqual({ status: 'refused', stage: 'blocked', message: expected })
  })

  it('refuses an Installation Show whose Zone Layout leaves output pixels uncovered', () => {
    const record = measuredWallShow()
    const layout = record.zoneLayouts.find(candidate => !candidate.logical)!
    layout.zones = [{ ...layout.zones[0], ranges: [{ start: 0, end: 3 }] }]
    const expected = installationCoverageBlockingMessage(validateInstallationCoverageV2(record))
    expect(expected).toBeTruthy()
    expect(prepareShowV2ControllerDelivery({
      record,
      dependencies: dependenciesFor(record),
      targetPixelCount: 8,
      controller: controllerFor(8),
    })).toEqual({ status: 'refused', stage: 'blocked', message: expected })
  })

  it('refuses a renderer-pressure-blocked Show at the pressure stage (#849)', () => {
    const [, fixture] = buildShowCompositionFreezeCases()
    const show = structuredClone(fixture.show)
    for (const scene of show.composition.scenes) {
      for (const zone of scene.zones) {
        const sourceLayer = zone.overlays[0]
        zone.overlays.push({
          ...structuredClone(sourceLayer),
          id: `${sourceLayer.id}-extra`,
          placements: sourceLayer.placements.map((placement) => ({ ...placement, id: `${placement.id}-extra` })),
        })
      }
    }
    const record = convertForTest(show, Object.fromEntries(fixture.patterns.map(pattern => [pattern.id, pattern.src])))
    expect(prepareShowV2ControllerDelivery({
      record,
      dependencies: dependenciesFor(record, fixture.patterns),
      targetPixelCount: undefined,
      controller: controllerFor(undefined),
    })).toEqual({ status: 'refused', stage: 'pressure', message: 'Peak: 6 Patterns per pixel (limit 4).' })
  })

  it('refuses a Controller the prepared artifact blocks, with its warnings (#437)', () => {
    const record = measuredWallShow()
    const dependencies = dependenciesFor(record)
    const controller = controllerFor(7)
    const capture = captureShowStageEditV2(record, dependencies)
    const compiled = compileShowV2ForDelivery({ record, prepared: capture.prepared, targetPixelCount: 7 })
    const prepared = prepareShowV2ForController(compiled, exportShowV2ForDelivery(record, compiled, []), controller)
    expect(prepared.value?.blocked).toBe(true)
    const expected = prepared.value!.warnings.map(warning => warning.message).join(' ')
    expect(expected).toContain('This Installation Show requires 8 pixels; the Controller reports 7.')
    expect(prepareShowV2ControllerDelivery({ record, dependencies, targetPixelCount: 7, controller }))
      .toEqual({ status: 'refused', stage: 'prepare', message: expected })
  })
})

describe('prepareShowV2ForController (#1129)', () => {
  it('returns a blocked prepared artifact to the editor rather than an error (#437)', () => {
    const record = measuredWallShow()
    const capture = captureShowStageEditV2(record, dependenciesFor(record))
    const compiled = compileShowV2ForDelivery({ record, prepared: capture.prepared, targetPixelCount: 7 })
    expect(prepareShowV2ForController(compiled, exportShowV2ForDelivery(record, compiled, []), controllerFor(7)))
      .toMatchObject({ value: { blocked: true }, error: null })
  })
})
