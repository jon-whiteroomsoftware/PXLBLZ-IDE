// Exact Show compiler specialization regression for issue #512.
// Run with: npm run issue512

import { performance } from 'node:perf_hooks'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { nativeDimension } from '../../src/engine/loadPattern'
import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import { compileShowForPreview } from '../../src/engine/showPreviewArtifact'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'
import { SOURCE_STOCK_MAPS } from '../../src/pixelblaze/stock/maps/stockCatalogue'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'

const fixture = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-redline-installation')
if (!fixture) throw new Error('Redline Installation fixture is missing.')
const map = SOURCE_STOCK_MAPS.find((candidate) => candidate.id === 'redline-stage-2d')
if (!map) throw new Error('Redline Stage map is missing.')

const compile = (exactSpecializations: boolean) => {
  const compiled = compileShowForPreview(
    fixture.show,
    [],
    installationPhysicalZones(fixture.show),
    {},
    { stageDimension: 2, exactSpecializations },
  )
  if (!compiled.artifact) throw new Error(compiled.error ?? 'Redline Show did not compile.')
  return compiled.artifact
}

export const selectedArtifact = compile(true)
export const counterfactualArtifact = compile(false)
const selected = selectedArtifact
const counterfactual = counterfactualArtifact
const mapPoints = map.resolve(2_000)
const scoreTimesMs = [0, 7_500, 15_000, 22_500, 30_000, 37_500, 45_000, 52_500, 59_500]

function runtime(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, {
    mapPoints,
    randomSeed: 512,
    fidelity,
  })
}

function scoreChecksums(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  return scoreTimesMs.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
}

function meanFrameMs(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  const replay = runtime(artifact, fidelity)
  replay.advanceTo(30_000, { stepMs: 250 })
  const samples: number[] = []
  for (let index = 0; index < 24; index += 1) {
    const started = performance.now()
    replay.advanceLive(1000 / 60)
    samples.push(performance.now() - started)
  }
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

const equivalence = (['fast', 'fidelity'] as const).map((fidelity) => {
  const selectedChecksums = scoreChecksums(selected, fidelity)
  const counterfactualChecksums = scoreChecksums(counterfactual, fidelity)
  return {
    fidelity,
    selectedChecksums,
    counterfactualChecksums,
    matches: selectedChecksums.every((checksum, index) => checksum === counterfactualChecksums[index]),
  }
})

export const report = {
  fixture: fixture.id,
  pixelCount: mapPoints.length,
  scoreTimesMs,
  selected: {
    sourceBytes: selected.summary.artifactBytes,
    expandedSourceBytes: selected.summary.expandedArtifactBytes,
    routing: selected.summary.specializations.routing,
    capture: selected.summary.specializations.capture,
    fastMeanFrameMs: meanFrameMs(selected, 'fast'),
    preciseMeanFrameMs: meanFrameMs(selected, 'fidelity'),
  },
  counterfactual: {
    sourceBytes: counterfactual.summary.artifactBytes,
    expandedSourceBytes: counterfactual.summary.expandedArtifactBytes,
    fastMeanFrameMs: meanFrameMs(counterfactual, 'fast'),
    preciseMeanFrameMs: meanFrameMs(counterfactual, 'fidelity'),
  },
  equivalence,
}

if (process.env.ISSUE512_REPORT || !process.env.VITEST) console.log(JSON.stringify(report, null, 2))
