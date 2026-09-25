import { describe, expect, it } from 'vitest'
import { showClipInspectorCapabilities } from './showClipInspectorModel'

describe('shared Clip inspector owner model (#498)', () => {
  it('describes structural and local capabilities without leaking storage shapes', () => {
    expect(showClipInspectorCapabilities('global')).toMatchObject({
      structural: true,
      localTiming: false,
      layerAssignment: false,
      placementOpacity: false,
      propertyAnimation: 'boundary-ramp',
    })
    expect(showClipInspectorCapabilities('scene-main')).toMatchObject({
      structural: false,
      localTiming: true,
      layerAssignment: false,
      placementOpacity: true,
      propertyAnimation: 'local-keyframes',
    })
    expect(showClipInspectorCapabilities('scene-overlay')).toMatchObject({
      structural: false,
      localTiming: true,
      layerAssignment: true,
      placementOpacity: true,
      propertyAnimation: 'local-keyframes',
    })
  })
})
