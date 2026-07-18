import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'
import { createFastReplayRuntime, prepareFastReplay } from '../../src/engine/fastReplay'
import { emitShowRenderTargetArenaSource } from '../../src/engine/showRenderTargetArena'

const matrixSize = 32
const pixelCount = matrixSize * matrixSize
const frameCount = 75
const frameDeltaMs = 1_000 / 15
const border = 2
const gap = 3
const panelSize = matrixSize + border * 2
const frameWidth = panelSize * 4 + gap * 3
const frameHeight = panelSize
const outputPath = process.env.ISSUE537_VISUAL_PATH
  ?? '/tmp/pxlblz-captures/issue537-trails-visual.webp'

const variants = [
  { label: 'Live', retention: 0, resetEveryFrames: 0, border: [255, 255, 255] as const },
  { label: 'Short trails', retention: 0.75, resetEveryFrames: 0, border: [255, 190, 48] as const },
  { label: 'Long trails', retention: 0.9375, resetEveryFrames: 0, border: [0, 230, 255] as const },
  { label: 'Clear at boundary', retention: 0.9375, resetEveryFrames: 30, border: [255, 64, 210] as const },
]

const mapPoints = Array.from({ length: pixelCount }, (_, index) => ({
  sample: [
    (index % matrixSize) / (matrixSize - 1),
    Math.floor(index / matrixSize) / (matrixSize - 1),
  ],
}))
const runtimes = variants.map((variant) => createFastReplayRuntime(
  prepareFastReplay(visualSource(variant.retention, variant.resetEveryFrames), {}),
  { mapPoints, randomSeed: 537, fidelity: 'fast' },
))

const animation = Buffer.alloc(frameWidth * frameHeight * frameCount * 4)
for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
  variants.forEach((variant, panelIndex) => {
    const result = runtimes[panelIndex].advanceLive(frameDeltaMs)
    drawPanel(
      animation,
      frameIndex,
      panelIndex * (panelSize + gap),
      result.frame,
      variant.border,
    )
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

console.log(JSON.stringify({ outputPath, variants }, null, 2))

function visualSource(retention: number, resetEveryFrames: number): string {
  const feedback = retention > 0
  return `${emitShowRenderTargetArenaSource(pixelCount)}
var frame = 0
var ready = 0

export function beforeRender(delta) {
  frame = frame + 1
  ${resetEveryFrames > 0 ? `if (frame > 1 && (frame - 1) % ${resetEveryFrames} == 0) ready = 0` : ''}
}

export function render2D(index, x, y) {
  var t = frame / 15
  var x1 = 0.5 + 0.31 * sin(t * 1.7)
  var y1 = 0.5 + 0.29 * sin(t * 2.3 + 1.1)
  var x2 = 0.5 + 0.33 * sin(t * 1.1 + 2.2)
  var y2 = 0.5 + 0.27 * sin(t * 1.9 + 3.4)
  var x3 = 0.5 + 0.25 * sin(t * 2.7 + 4.1)
  var y3 = 0.5 + 0.34 * sin(t * 1.3 + 0.7)
  var d1 = sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1))
  var d2 = sqrt((x - x2) * (x - x2) + (y - y2) * (y - y2))
  var d3 = sqrt((x - x3) * (x - x3) + (y - y3) * (y - y3))
  var a = max(0, 1 - d1 * 13)
  var b = max(0, 1 - d2 * 14)
  var c = max(0, 1 - d3 * 15)
  a = a * a
  b = b * b
  c = c * c
  var r = max(a, c * 0.9)
  var g = max(a * 0.18, b * 0.9)
  var blue = max(b, c)
  ${feedback ? `if (ready) {
    r = max(r, __pxlblz_show_rt_plane_0[index] * ${retention})
    g = max(g, __pxlblz_show_rt_plane_1[index] * ${retention})
    blue = max(blue, __pxlblz_show_rt_plane_2[index] * ${retention})
  }
  __pxlblz_show_rt_plane_0[index] = r
  __pxlblz_show_rt_plane_1[index] = g
  __pxlblz_show_rt_plane_2[index] = blue
  if (index == pixelCount - 1) ready = 1` : ''}
  rgb(r, g, blue)
}`
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
