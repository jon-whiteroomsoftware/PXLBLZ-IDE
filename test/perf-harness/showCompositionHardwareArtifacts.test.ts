import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildShowCompositionFreezeCases } from '../../src/engine/showCompositionFreeze'
import { createInstallationShowOutputContract } from '../../src/engine/showOutputContract'
import { compileShowForArtifact } from '../../src/engine/showPreviewArtifact'

const OUTPUT_DIR = process.env.PXLBLZ_HARDWARE_OUT

describe('Scene-composition hardware artifacts (#492)', () => {
  it.skipIf(!OUTPUT_DIR)('writes the frozen production fixtures for reversible hardware review', () => {
    mkdirSync(OUTPUT_DIR!, { recursive: true })

    for (const fixture of buildShowCompositionFreezeCases()) {
      const show = structuredClone(fixture.show)
      if (fixture.id === 'installation-routed-composition') {
        show.outputContract = createInstallationShowOutputContract({
          outputMapId: 'plane',
          pixelCount: 256,
        })
        show.zones = show.zones.map((zone) => ({ ...zone, nominalPixelCount: 128 }))
        show.routingLayouts = show.routingLayouts.map((layout) => ({
          ...layout,
          zones: layout.zones.map((zone, index) => ({
            ...zone,
            ranges: [{
              start: index === 0 ? 0 : 128,
              end: index === 0 ? 127 : 255,
            }],
          })),
        }))
      }

      const compiled = compileShowForArtifact(
        show,
        fixture.patterns,
        undefined,
        {},
        { stageDimension: 2 },
      )
      expect(compiled.error, fixture.id).toBeNull()
      expect(compiled.artifact, fixture.id).not.toBeNull()
      if (fixture.id === 'installation-routed-composition') {
        expect(compiled.artifact?.summary).toMatchObject({
          steadyStateRenderersPerPixel: 2,
          worstInstantRenderersPerPixel: 4,
        })
      }

      writeFileSync(join(OUTPUT_DIR!, `${fixture.id}.json`), JSON.stringify({
        probe: fixture.id,
        code: compiled.artifact!.code,
        summary: compiled.artifact!.summary,
        sampleTimesMs: fixture.sampleTimesMs,
      }, null, 2))
    }
  }, 15_000)
})
