import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { compileShowForArtifact, resolveShowCompilationControllerZones } from '../engine/showPreviewArtifact'
import { compileLibraries } from '../engine/libraries'
import { LIBRARIES } from '../pixelblaze/libs'
import { STOCK_MAPS } from '../store/mapStore'
import type { ShowRecord } from '../engine/personalContentRecords'
import { resolveV1ArtifactCompilationInputs } from './showSourceGaugeRebuildInputs'

/**
 * Regression for the first #1065 gauge probe run, which exited before collecting any visual
 * evidence: the in-page rebuild called `compileShowForArtifact` with `{}`, so the Stage dimension
 * was missing and Portable 2D compatibility refused the artifact.
 *
 * These cases run the real compiler against the committed `fresh` fixture, with no browser, so the
 * same omission cannot reach a browser run again.
 */

const manifest = JSON.parse(
  await readFile(new URL('../../e2e/fixtures/showEditorEquivalence.json', import.meta.url), 'utf8'),
) as { corpus: { key: string; source: ShowRecord }[] }
const fresh = manifest.corpus.find(entry => entry.key === 'fresh')!.source

function compile(options: { stageDimension?: number; targetPixelCount?: number }) {
  return compileShowForArtifact(
    fresh,
    [],
    resolveShowCompilationControllerZones(fresh),
    compileLibraries(LIBRARIES, []),
    options as Parameters<typeof compileShowForArtifact>[4],
  )
}

describe('the v1 artifact compilation inputs the probe must supply', () => {
  it('derives the Stage dimension from the record\'s own saved map', () => {
    const inputs = resolveV1ArtifactCompilationInputs({
      show: fresh,
      maps: [...STOCK_MAPS],
      profiles: [],
      hasActiveController: false,
    })
    expect(inputs.stageMapId).toBe('plane')
    expect(inputs.stageMapResolved).toBe(true)
    expect(inputs.stageDimension).toBe(2)
    expect(inputs.outputContractKind).toBe('portable-2d')
  })

  it('offers no target pixel count for this bounded fixture, and says why', () => {
    const inputs = resolveV1ArtifactCompilationInputs({
      show: fresh,
      maps: [...STOCK_MAPS],
      profiles: [],
      hasActiveController: false,
    })
    // A portable-2D contract takes no target profile, and nothing is connected.
    expect(inputs.targetPixelCount).toBeUndefined()
  })

  it('takes the live Controller profile count when one is attached', () => {
    const inputs = resolveV1ArtifactCompilationInputs({
      show: fresh,
      maps: [...STOCK_MAPS],
      profiles: [{ id: 'live', lastKnownPixelCount: 256 }],
      hasActiveController: true,
      liveControllerProfile: { id: 'live', lastKnownPixelCount: 256 },
    })
    expect(inputs.targetPixelCount).toBe(256)
  })

  it('reports an unresolvable saved map rather than defaulting a dimension', () => {
    const inputs = resolveV1ArtifactCompilationInputs({
      show: { ...fresh, stageMapId: 'not-a-map' },
      maps: [...STOCK_MAPS],
      profiles: [],
      hasActiveController: false,
    })
    expect(inputs.stageMapResolved).toBe(false)
    expect(inputs.stageDimension).toBeUndefined()
  })
})

describe('the real compiler against the committed fresh fixture', () => {
  it('reproduces the Portable 2D refusal when the Stage dimension is omitted', () => {
    const compiled = compile({})
    expect(compiled.artifact).toBeNull()
    expect(compiled.error).toMatch(/Portable 2D compatibility failed/)
  })

  it('produces an artifact with the derived inputs, without relaxing compatibility', () => {
    const inputs = resolveV1ArtifactCompilationInputs({
      show: fresh,
      maps: [...STOCK_MAPS],
      profiles: [],
      hasActiveController: false,
    })
    const compiled = compile({ stageDimension: inputs.stageDimension, targetPixelCount: inputs.targetPixelCount })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact).not.toBeNull()
    expect(compiled.artifact!.code.length).toBeGreaterThan(0)
  })
})
