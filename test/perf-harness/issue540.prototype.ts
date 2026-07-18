import { prepareFastReplay, createFastReplayRuntime } from '../../src/engine/fastReplay'
import { countShowPersistentGlobals, PIXELBLAZE_ARRAY_HEADER_WORDS } from '../../src/engine/showVmResourceLedger'
import { performance } from 'node:perf_hooks'

export interface Issue540FieldControls {
  speed: number
  blobCount: number
  palette: number
  threshold: number
}

export const ISSUE540_FIELD_DECLARATION = {
  id: 'metaball-density',
  output: 'scalar',
  coordinateDomain: 'normalized-map-2d',
  lifetime: 'frame',
  exactness: 'exact',
  renderPurity: 'pure',
  fieldControls: ['blobCount', 'speed'],
  shadingControls: ['palette', 'threshold'],
} as const

export function compareIssue540FieldConsumers(
  left: Issue540FieldControls,
  right: Issue540FieldControls,
) {
  const changedFieldControls = ISSUE540_FIELD_DECLARATION.fieldControls
    .filter((name) => left[name] !== right[name])
  const changedShadingControls = ISSUE540_FIELD_DECLARATION.shadingControls
    .filter((name) => left[name] !== right[name])
  return {
    compatible: changedFieldControls.length === 0,
    changedFieldControls,
    changedShadingControls,
  }
}

const replayTimesMs = [0, 250, 750]

export function buildIssue540PrototypeCase(consumerCount: number, pixelCount: number) {
  if (consumerCount !== 2 && consumerCount !== 5) throw new Error('Issue #540 prototype supports two or five consumers.')
  const { direct: directSource, shared: sharedSource } = buildIssue540PrototypeSources(consumerCount, pixelCount)
  const directPrepared = prepareFastReplay(directSource, {})
  const sharedPrepared = prepareFastReplay(sharedSource, {})
  const directFast = replayChecksums(directPrepared, pixelCount, 'fast')
  const sharedFast = replayChecksums(sharedPrepared, pixelCount, 'fast')
  const directPrecise = replayChecksums(directPrepared, pixelCount, 'fidelity')
  const sharedPrecise = replayChecksums(sharedPrepared, pixelCount, 'fidelity')

  return {
    consumerCount,
    pixelCount,
    declaration: ISSUE540_FIELD_DECLARATION,
    direct: describeArtifact(directSource, directPrepared.code, consumerCount, consumerCount, 0),
    shared: describeArtifact(
      sharedSource,
      sharedPrepared.code,
      consumerCount,
      1,
      pixelCount + PIXELBLAZE_ARRAY_HEADER_WORDS,
    ),
    parity: {
      fast: directFast.every((checksum, index) => checksum === sharedFast[index]),
      precise: directPrecise.every((checksum, index) => checksum === sharedPrecise[index]),
    },
    software: softwareComparison(directPrepared, sharedPrepared, pixelCount),
    checksums: {
      directFast,
      sharedFast,
      directPrecise,
      sharedPrecise,
    },
    sources: { direct: directSource, shared: sharedSource },
  }
}

export function buildIssue540PrototypeSources(consumerCount: number, pixelCount: number) {
  if (consumerCount !== 2 && consumerCount !== 5) throw new Error('Issue #540 prototype supports two or five consumers.')
  return {
    direct: buildSource(consumerCount, pixelCount, false),
    shared: buildSource(consumerCount, pixelCount, true),
  }
}

function softwareComparison(
  direct: ReturnType<typeof prepareFastReplay>,
  shared: ReturnType<typeof prepareFastReplay>,
  pixelCount: number,
) {
  return {
    runtime: 'Preview JavaScript; directional evidence only, not a Controller proxy',
    fast: benchmarkPair(direct, shared, pixelCount, 'fast'),
    precise: benchmarkPair(direct, shared, pixelCount, 'fidelity'),
  }
}

function benchmarkPair(
  direct: ReturnType<typeof prepareFastReplay>,
  shared: ReturnType<typeof prepareFastReplay>,
  pixelCount: number,
  fidelity: 'fast' | 'fidelity',
) {
  const directMedianMsPerFrame = benchmarkReplay(direct, pixelCount, fidelity)
  const sharedMedianMsPerFrame = benchmarkReplay(shared, pixelCount, fidelity)
  return {
    directMedianMsPerFrame,
    sharedMedianMsPerFrame,
    medianChangePercent: (sharedMedianMsPerFrame / directMedianMsPerFrame - 1) * 100,
  }
}

function benchmarkReplay(
  prepared: ReturnType<typeof prepareFastReplay>,
  pixelCount: number,
  fidelity: 'fast' | 'fidelity',
): number {
  const samples: number[] = []
  for (let run = 0; run < 7; run += 1) {
    const runtime = createFastReplayRuntime(prepared, {
      mapPoints: issue540MapPoints(pixelCount),
      randomSeed: 540,
      fidelity,
    })
    for (let warmup = 0; warmup < 10; warmup += 1) runtime.advanceLive(16.6667)
    const started = performance.now()
    for (let frame = 0; frame < 60; frame += 1) runtime.advanceLive(16.6667)
    samples.push((performance.now() - started) / 60)
  }
  samples.sort((left, right) => left - right)
  return samples[Math.floor(samples.length / 2)]
}

function describeArtifact(
  source: string,
  expandedSource: string,
  rendererCount: number,
  producerCount: number,
  vmWords: number,
) {
  return {
    sourceBytes: new TextEncoder().encode(source).length,
    expandedSourceBytes: new TextEncoder().encode(expandedSource).length,
    persistentGlobals: countShowPersistentGlobals(expandedSource),
    vmWords,
    rendererCount,
    producerCount,
  }
}

function replayChecksums(
  prepared: ReturnType<typeof prepareFastReplay>,
  pixelCount: number,
  fidelity: 'fast' | 'fidelity',
): string[] {
  const runtime = createFastReplayRuntime(prepared, {
    mapPoints: issue540MapPoints(pixelCount),
    randomSeed: 540,
    fidelity,
  })
  return replayTimesMs.map((timeMs) => runtime.advanceTo(timeMs, { stepMs: 50 }).checksum)
}

function issue540MapPoints(pixelCount: number) {
  const side = Math.ceil(Math.sqrt(pixelCount))
  return Array.from({ length: pixelCount }, (_, index) => ({
    sample: [
      (index % side) / Math.max(side - 1, 1),
      Math.floor(index / side) / Math.max(side - 1, 1),
    ],
  }))
}

function buildSource(consumerCount: number, pixelCount: number, shared: boolean): string {
  const producerReads = Array.from({ length: consumerCount }, (_, index) => {
    const fieldExpression = shared ? '__pxlblz_issue540_field[index]' : 'metaballField(x, y)'
    const threshold = (0.86 + index * 0.09).toFixed(3)
    const red = (0.25 + ((index * 37) % 71) / 100).toFixed(3)
    const green = (0.18 + ((index * 53 + 17) % 67) / 100).toFixed(3)
    const blue = (0.22 + ((index * 29 + 31) % 73) / 100).toFixed(3)
    return `
  var f${index} = ${fieldExpression}
  var skin${index} = clamp((f${index} - ${threshold}) * 0.72, 0, 1)
  var rim${index} = clamp(1 - abs(f${index} - ${threshold}) * 1.8, 0, 1)
  var value${index} = clamp(skin${index} * skin${index} + rim${index} * 0.55, 0, 1)
  outR = outR + value${index} * ${red}
  outG = outG + value${index} * ${green}
  outB = outB + value${index} * ${blue}`
  }).join('')
  const capture = shared
    ? `
  var produced = metaballField(x, y)
  __pxlblz_issue540_field[index] = produced`
    : ''
  const fieldPlane = shared ? `var __pxlblz_issue540_field = array(${pixelCount})\n` : ''

  return `// Issue #540 diagnostic: ${shared ? 'shared scalar producer plus capture/replay' : 'direct repeated producer'}.
${fieldPlane}var t = 0
var ax0 = 0.5, ay0 = 0.5, ax1 = 0.5, ay1 = 0.5
var ax2 = 0.5, ay2 = 0.5, ax3 = 0.5, ay3 = 0.5

export function beforeRender(delta) {
  t = t + delta * 0.00058
  ax0 = 0.50 + 0.28 * cos(t * 0.61)
  ay0 = 0.50 + 0.22 * sin(t * 0.79)
  ax1 = 0.50 + 0.31 * cos(t * -0.43 + 1.8)
  ay1 = 0.50 + 0.25 * sin(t * 0.52 + 2.6)
  ax2 = 0.50 + 0.18 * cos(t * 0.97 + 4.1)
  ay2 = 0.50 + 0.32 * sin(t * -0.69 + 0.4)
  ax3 = 0.50 + 0.34 * cos(t * 0.37 + 3.0)
  ay3 = 0.50 + 0.17 * sin(t * 1.10 + 1.2)
}

function blob(x, y, cx, cy, radius) {
  var dx = x - cx
  var dy = y - cy
  return radius / (0.045 + dx * dx + dy * dy)
}

function metaballField(x, y) {
  return blob(x, y, ax0, ay0, 0.080)
    + blob(x, y, ax1, ay1, 0.070)
    + blob(x, y, ax2, ay2, 0.065)
    + blob(x, y, ax3, ay3, 0.060)
}

export function render2D(index, x, y) {${capture}
  var outR = 0, outG = 0, outB = 0${producerReads}
  rgb(clamp(outR / ${consumerCount}, 0, 1), clamp(outG / ${consumerCount}, 0, 1), clamp(outB / ${consumerCount}, 0, 1))
}
`
}

export const issue540PrototypeReport = [2, 5].map((consumerCount) => {
  const result = buildIssue540PrototypeCase(consumerCount, 256)
  const { sources: _sources, checksums: _checksums, ...report } = result
  return report
})

if (process.env.ISSUE540_PROTOTYPE_REPORT) console.log(JSON.stringify(issue540PrototypeReport, null, 2))
