import { describe, expect, it } from 'vitest'

const runVisual = process.env.ISSUE520_VISUAL === '1'

describe('five-Pattern acceptance Show visual review (#520)', () => {
  it.skipIf(!runVisual)('writes representative scene and transition captures', async () => {
    const sharp = (await import('sharp')).default
    const { createFastReplayRuntime } = await import('../../src/engine/fastReplay')
    const { acceptanceArtifacts, issue520MapPoints } = await import('./issue520')
    const frames = [
      { label: 'Scene 1 - 0.25s', artifact: acceptanceArtifacts.selected, timeMs: 250 },
      { label: 'Snapshot/live - 3.5s', artifact: acceptanceArtifacts.selected, timeMs: 3_500 },
      { label: 'Live/live - 3.5s', artifact: acceptanceArtifacts.live, timeMs: 3_500 },
      { label: 'Scene 2 - 7.1s', artifact: acceptanceArtifacts.selected, timeMs: 7_100 },
      { label: 'Scalar dissolve - 17s', artifact: acceptanceArtifacts.selected, timeMs: 17_000 },
      { label: 'Final scene - 35.5s', artifact: acceptanceArtifacts.selected, timeMs: 35_500 },
    ]
    const tileWidth = 500
    const imageHeight = 400
    const labelHeight = 44
    const tileHeight = imageHeight + labelHeight

    const tiles = await Promise.all(frames.map(async (item) => {
      const runtime = createFastReplayRuntime({
        code: item.artifact.code,
        fxCode: item.artifact.fxCode,
        metadata: item.artifact.metadata,
        dimension: 2,
      }, { mapPoints: issue520MapPoints, randomSeed: 520, fidelity: 'fast' })
      const frame = runtime.advanceTo(item.timeMs, { stepMs: 50 }).frame
      const rgb = Buffer.alloc(issue520MapPoints.length * 3)
      for (let index = 0; index < frame.length; index += 1) {
        rgb[index] = Math.round(Math.max(0, Math.min(1, Number.isFinite(frame[index]) ? frame[index] : 0)) * 255)
      }
      const image = await sharp(rgb, { raw: { width: 50, height: 40, channels: 3 } })
        .resize(tileWidth, imageHeight, { kernel: 'nearest' })
        .png()
        .toBuffer()
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101319"/><text x="18" y="29" fill="#f2f4f8" font-family="Arial, sans-serif" font-size="19">${item.label}</text></svg>`)
      return sharp({ create: { width: tileWidth, height: tileHeight, channels: 3, background: '#101319' } })
        .composite([{ input: image, top: 0, left: 0 }, { input: label, top: imageHeight, left: 0 }])
        .png()
        .toBuffer()
    }))

    const outputPath = '/tmp/pxlblz-issue520-contact-sheet.png'
    const result = await sharp({ create: { width: tileWidth * 2, height: tileHeight * 3, channels: 3, background: '#080a0e' } })
      .composite(tiles.map((input, index) => ({
        input,
        left: (index % 2) * tileWidth,
        top: Math.floor(index / 2) * tileHeight,
      })))
      .png()
      .toFile(outputPath)
    console.log(outputPath)
    expect(result.width).toBe(1_000)
    expect(result.height).toBe(1_332)
  }, 60_000)
})
