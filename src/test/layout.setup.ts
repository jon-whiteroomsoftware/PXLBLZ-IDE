import { beforeAll } from 'vitest'
import '../index.css'

const LAYOUT_FONT_PROBES = [
  { descriptor: '400 1rem "Geist Variable"', sample: 'Pixelblaze sans metrics' },
  { descriptor: '400 1rem "IBM Plex Mono"', sample: 'Pixelblaze mono metrics' },
] as const

beforeAll(async () => {
  if (!document.fonts) {
    throw new Error('Layout tests require the browser FontFaceSet API.')
  }
  const loaded = await Promise.all(LAYOUT_FONT_PROBES.map(({ descriptor, sample }) => (
    document.fonts.load(descriptor, sample)
  )))
  for (const [index, faces] of loaded.entries()) {
    if (faces.length === 0 || faces.some((face) => face.status !== 'loaded')) {
      throw new Error(`Layout test font did not load: ${LAYOUT_FONT_PROBES[index].descriptor}`)
    }
  }
  await document.fonts.ready
  for (const { descriptor, sample } of LAYOUT_FONT_PROBES) {
    if (!document.fonts.check(descriptor, sample)) {
      throw new Error(`Layout test font is not ready: ${descriptor}`)
    }
  }
  document.documentElement.dataset.layoutFontsReady = LAYOUT_FONT_PROBES
    .map(({ descriptor }) => descriptor)
    .join('|')
})
