// The preview compile surface must forward every Transpiler option without a
// hand-maintained whitelist: the wave-2 program shipped a bug when a new
// counterfactual was silently dropped by the field-by-field pass-through.
// These tests pin round-tripping through compileShowForArtifact for options
// added at different times, so a forwarding regression fails loudly.
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'
import { compileShowForArtifact } from './showPreviewArtifact'

const installationShow = STOCK_SHOWS.find((entry) => entry.id === 'stock-show-205-installation-composition')!.show

function artifactBytes(options: Record<string, unknown>): number {
  const result = compileShowForArtifact(installationShow, [], undefined, {}, {
    stageDimension: 2,
    ...options,
  })
  if (!result.artifact) throw new Error(result.error ?? 'compile failed')
  return result.artifact.summary.artifactBytes
}

describe('preview compile option forwarding', () => {
  it('forwards benchmark counterfactuals from every wave without a whitelist entry', () => {
    const production = artifactBytes({})
    // One early option (#512), one mid-wave (#558), one late (#571): each is
    // measured to change this fixture when disabled, proving it reached
    // compileShow rather than being dropped on the preview surface.
    expect(artifactBytes({ exactSpecializations: false })).not.toBe(production)
    expect(artifactBytes({ colorCoefficientHoisting: false })).not.toBe(production)
    expect(artifactBytes({ placementPrologueHoisting: false })).not.toBe(production)
  }, 20_000)

  it('keeps the preview-owned options working alongside forwarded ones', () => {
    const result = compileShowForArtifact(installationShow, [], undefined, {}, {
      stageDimension: 2,
      helperCallInlining: false,
    })
    expect(result.artifact).toBeTruthy()
  })
})
