import { describe, expect, it } from 'vitest'
import { projectAgentControllerProfiles, projectAgentPatterns } from './agentDiscovery'
import { declaredPatternSliderNames } from './showPatternControls'

describe('agent Pattern discovery', () => {
  const patterns = [
    {
      kind: 'stock' as const,
      id: 'shared-id',
      name: 'Stock Aurora',
      source: `
        export function sliderSpeed(value) {}
        export function toggleMirror(value) {}
        export function hsvPickerTint(h, s, v) {}
        export function render(index) { Shared.paint(index) }
      `,
    },
    {
      kind: 'user' as const,
      id: 'shared-id',
      name: 'Personal Aurora',
      source: 'export function rgbPickerColor(r, g, b) {}\nexport function render(index) { rgb(r, g, b) }',
    },
  ]
  const libraries = { Shared: 'function paint(index) { rgb(index, 0, 0) }' }

  it('keeps stock and personal identities distinct and reports authored control metadata without source or invented defaults', () => {
    const result = projectAgentPatterns(patterns, libraries)

    expect(result).toEqual([
      {
        kind: 'stock', id: 'shared-id', name: 'Stock Aurora',
        exported_controls: [
          { export_name: 'sliderSpeed', kind: 'slider', min: 0, max: 1 },
          { export_name: 'toggleMirror', kind: 'toggle' },
          { export_name: 'hsvPickerTint', kind: 'hsvPicker' },
        ],
      },
      {
        kind: 'user', id: 'shared-id', name: 'Personal Aurora',
        exported_controls: [{ export_name: 'rgbPickerColor', kind: 'rgbPicker' }],
      },
    ])
    expect(JSON.stringify(result)).not.toContain('source')
    expect(JSON.stringify(result)).not.toContain('default')
    expect(new Set(result?.[0].exported_controls.filter(control => control.kind === 'slider').map(control => control.export_name)))
      .toEqual(declaredPatternSliderNames(patterns[0].source))
  })

  it.each([
    [{}, ['stock:shared-id', 'user:shared-id']],
    [{ kind: 'user' as const }, ['user:shared-id']],
    [{ kind: 'stock' as const }, ['stock:shared-id']],
    [{ query: 'personal' }, ['user:shared-id']],
    [{ query: 'SHARED-ID' }, ['stock:shared-id', 'user:shared-id']],
    [{ query: 'absent' }, []],
  ])('applies the supported filter partition %#', (filter, expected) => {
    const result = projectAgentPatterns(patterns, libraries, filter)
    expect(result?.map(pattern => `${pattern.kind}:${pattern.id}`)).toEqual(expected)
  })

  it('returns unavailable instead of inventing an empty export set for invalid source or an unknown dependency', () => {
    expect(projectAgentPatterns([{ ...patterns[0], source: 'export function sliderBroken(' }], libraries)).toBeUndefined()
    expect(projectAgentPatterns([{ ...patterns[0], source: 'export function render(index) { Missing.paint(index) }' }], libraries)).toBeUndefined()
  })
})

describe('agent Controller-profile discovery', () => {
  it('projects only durable identity, name, and a known last-observed pixel count', () => {
    const profiles = [
      {
        id: 'profile-known', name: 'Stage left', lastKnownPixelCount: 256,
        lastKnownInstalledMap: { state: 'present', hash: 'stale-observation', dimension: 2, observedAt: 1 },
        mapFingerprints: [{ hash: 'push-history', mapId: 'map-one', mapName: 'Old map', devicePixelCount: 256, pushedAt: 1 }],
      },
      { id: 'profile-unknown', name: 'Stage right' },
    ]
    const result = projectAgentControllerProfiles(profiles)

    expect(result).toEqual([
      { id: 'profile-known', name: 'Stage left', pixel_count: 256 },
      { id: 'profile-unknown', name: 'Stage right' },
    ])
    expect(JSON.stringify(result)).not.toContain('map')
    expect(result).not.toContainEqual(expect.objectContaining({ id: 'fake-profile' }))
  })
})
