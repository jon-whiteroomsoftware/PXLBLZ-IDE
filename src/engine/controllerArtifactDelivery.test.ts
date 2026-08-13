import { defaultControllerProfile } from '@/store/controllerProfileStore'
import { prepareControllerArtifactDelivery } from './controllerArtifactDelivery'

describe('Controller artifact delivery derivatives (#849)', () => {
  const source = 'export function render(index) { hsv(index, 1, 1) }'

  it('adds only active Controller profile transforms', () => {
    const profile = defaultControllerProfile({ id: 'bench', now: 1 })
    expect(prepareControllerArtifactDelivery({
      source,
      profile,
      artifactId: 'show:quadrille',
    })).toMatchObject({ source, transformIds: [] })

    profile.globalTransforms = profile.globalTransforms.map((transform) => (
      transform.type === 'power-cap' ? { ...transform, enabled: true, maxDuty: 0.25 } : transform
    ))
    const transformed = prepareControllerArtifactDelivery({
      source,
      profile,
      artifactId: 'show:quadrille',
    })
    expect(transformed.source).toContain('__px_cappedHsv')
    expect(transformed.transformIds).toEqual(['power-cap'])
    expect(new TextEncoder().encode(transformed.source).length).toBeGreaterThan(
      new TextEncoder().encode(source).length,
    )
  })
})
