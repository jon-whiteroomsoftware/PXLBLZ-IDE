import { describe, expect, it } from 'vitest'
import { parseEpe } from './epeImport'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import {
  buildShowV2RouteArtifacts,
  buildShowV2RouteSummary,
  describeShowArtifactPatternsV2,
} from './showV2RouteDelivery'
import { showV2GroupEditorFixture } from '@/test/showV2GroupEditorFixture'

function prepared() {
  const { record, dependencies } = showV2GroupEditorFixture()
  const capture = captureShowStageEditV2(record, dependencies)
  if (capture.prepared.status !== 'ready') throw new Error(JSON.stringify(capture.prepared))
  return { record, bundle: capture.prepared.bundle }
}

describe('the v2 route delivery model', () => {
  it('exports one .epe that reopens with the compiled Show and measures it', () => {
    const { bundle } = prepared()
    const result = buildShowV2RouteArtifacts(bundle, { exportedAt: '2026-09-17T00:00:00.000Z' })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    const { artifacts } = result

    expect(artifacts.epe.filename).toMatch(/\.epe$/)
    expect(parseEpe(artifacts.epe.text).src).toContain(bundle.artifact.code)
    // The gauge measures the bytes the export actually carries, against the
    // artifact's own measured device budget.
    expect(artifacts.deliveredBytes).toBe(new TextEncoder().encode(artifacts.epe.source).length)
    expect(artifacts.budgetBytes).toBe(bundle.artifact.summary.measuredDeviceBudgetBytes)
    expect(artifacts.vmWords.used).toBe(bundle.artifact.summary.resources.totalWords)
    expect(artifacts.structure.transitionCount).toBe(bundle.artifact.summary.transitionCount)
    expect(artifacts.model.rows.length).toBeGreaterThan(0)
    expect(artifacts.inventory.totalBytes).toBeGreaterThan(0)
  })

  it('refuses an empty Show rather than describing bytes nothing can deliver', () => {
    const { record, bundle } = prepared()
    const emptied = { ...record, composition: { ...record.composition, clips: [], transitions: [] } }
    const result = buildShowV2RouteArtifacts({ ...bundle, record: emptied })
    expect(result).toEqual({ status: 'refused', message: 'Add content to the Show before exporting.' })
  })

  it('counts every effective Clip use of an instance, Group uses included', () => {
    const { record, bundle } = prepared()
    const result = buildShowV2RouteArtifacts(bundle)
    if (result.status !== 'ready') throw new Error(result.message)
    const patterns = describeShowArtifactPatternsV2(record, result.artifacts.inventory)
    const voice = patterns.find((pattern) => pattern.name === 'Voice')
    expect(voice).toBeDefined()
    // The fixture places three Clips over one shared runtime.
    expect(voice!.logicalInstanceCount).toBe(1)
    expect(voice!.authoredReferenceCount).toBe(3)
  })

  it('summarizes the record without reading a Scene', () => {
    const { record } = prepared()
    expect(buildShowV2RouteSummary(record)).toEqual({
      name: record.name,
      recordVersion: 2,
      showEndMs: 30_000,
      zoneCount: record.zones.length,
      layerCount: record.composition.layers.length,
      clipCount: 3,
      effectiveClipCount: 3,
      patternInstanceCount: 1,
      transitionCount: 0,
      layoutOccurrenceCount: 1,
      markerCount: record.composition.markers.length,
      groupOccurrenceCount: 0,
    })
  })
})
