import { mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { compileShow, type ShowRecipe } from '../../src/engine/showCompiler'

const mandelbrotSource = await readFile(
  new URL('./fixtures/issue540/Mandelbrot2D.js', import.meta.url),
  'utf8',
)

const matrixSize = 32
const frameCount = 60
const frameDeltaMs = 1_000 / 15
const border = 2
const gap = 3
const panelSize = matrixSize + border * 2
const frameWidth = panelSize * 4 + gap * 3
const frameHeight = panelSize
const outputPath = process.env.ISSUE535_VISUAL_PATH
  ?? '/tmp/pxlblz-captures/issue535-refresh-visual.webp'

const variants = [
  { policy: 'live' as const, border: [255, 255, 255] as const },
  { policy: 'refresh' as const, refreshIntervalMs: 1_000, border: [255, 196, 48] as const },
  { policy: 'rolling-refresh' as const, rollingRefreshSlices: 4, border: [0, 230, 255] as const },
  { policy: 'rolling-refresh' as const, rollingRefreshSlices: 8, border: [255, 64, 210] as const },
]

const mapPoints = Array.from({ length: matrixSize * matrixSize }, (_, index) => ({
  sample: [
    (index % matrixSize) / (matrixSize - 1),
    Math.floor(index / matrixSize) / (matrixSize - 1),
  ],
}))

const runtimes = variants.map((variant) => {
  const artifact = compileShow(recipe(variant), {})
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 2,
  }, {
    mapPoints,
    randomSeed: 535,
    fidelity: 'fast',
  })
})

const animation = Buffer.alloc(frameWidth * frameHeight * frameCount * 4)
for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
  variants.forEach((variant, panelIndex) => {
    const result = runtimes[panelIndex].advanceLive(frameDeltaMs)
    const panelX = panelIndex * (panelSize + gap)
    drawPanel(animation, frameIndex, panelX, result.frame, variant.border)
  })
}

await mkdir('/tmp/pxlblz-captures', { recursive: true })
await sharp(animation, {
  raw: {
    width: frameWidth,
    height: frameHeight * frameCount,
    pageHeight: frameHeight,
    channels: 4,
  },
  animated: true,
})
  .resize({ width: frameWidth * 6, kernel: 'nearest' })
  .webp({ quality: 92, effort: 4, loop: 0, delay: Math.round(frameDeltaMs) })
  .toFile(outputPath)

console.log(outputPath)

function recipe(variant: (typeof variants)[number]): ShowRecipe {
  const pixelCount = matrixSize * matrixSize
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: pixelCount - 1 }] }]
  return {
    masterPixelCount: pixelCount,
    clips: [{
      id: 'mandelbrot',
      source: mandelbrotSource,
      ...(variant.policy === 'live' ? {} : { evaluationPolicy: variant.policy }),
      ...('refreshIntervalMs' in variant ? { refreshIntervalMs: variant.refreshIntervalMs } : {}),
      ...('rollingRefreshSlices' in variant ? { rollingRefreshSlices: variant.rollingRefreshSlices } : {}),
    }],
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: {
      scenes: [0, 1].map(() => ({
        holdMs: 8_000,
        placements: [{ placementId: 'mandelbrot', zoneName: 'main', clipId: 'mandelbrot', stackOrder: 0 }],
      })),
    },
    loopDurationMs: 16_000,
  }
}

function drawPanel(
  destination: Buffer,
  frameIndex: number,
  panelX: number,
  source: Float64Array,
  borderColor: readonly [number, number, number],
): void {
  for (let y = 0; y < panelSize; y += 1) {
    for (let x = 0; x < panelSize; x += 1) {
      const isBorder = x < border || y < border || x >= panelSize - border || y >= panelSize - border
      const targetPixel = frameIndex * frameWidth * frameHeight + y * frameWidth + panelX + x
      const target = targetPixel * 4
      if (isBorder) {
        destination[target] = borderColor[0]
        destination[target + 1] = borderColor[1]
        destination[target + 2] = borderColor[2]
      } else {
        const sourcePixel = (y - border) * matrixSize + x - border
        destination[target] = channel(source[sourcePixel * 3])
        destination[target + 1] = channel(source[sourcePixel * 3 + 1])
        destination[target + 2] = channel(source[sourcePixel * 3 + 2])
      }
      destination[target + 3] = 255
    }
  }
}

function channel(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
}
