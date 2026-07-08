import {
  buildZonePreviewStrips,
  filterPixelsForSolo,
  selectControllerPreviewZones,
  type PixelColor,
} from '@/engine/zonePreview'
import type { ControllerProfile } from '@/engine/controllerProfile'

const pixels: PixelColor[] = [
  [1, 0, 0],
  [0.9, 0, 0],
  [0, 1, 0],
  [0, 0.9, 0],
  [0, 0, 1],
  [0, 0, 0.9],
  [1, 1, 0],
  [0.9, 0.9, 0],
]

describe('zone preview', () => {
  it('builds one preview strip per zone with clamped pixel ranges', () => {
    const strips = buildZonePreviewStrips(pixels, [
      { id: 'left', name: 'Left wing', ranges: [{ start: -3, end: 1 }] },
      { id: 'right', name: 'Right wing', ranges: [{ start: 6, end: 12 }] },
    ])

    expect(strips).toEqual([
      {
        id: 'left',
        name: 'Left wing',
        color: '#38bdf8',
        pixelCount: 2,
        samples: [
          [1, 0, 0],
          [0.9, 0, 0],
        ],
      },
      {
        id: 'right',
        name: 'Right wing',
        color: '#f97316',
        pixelCount: 2,
        samples: [
          [1, 1, 0],
          [0.9, 0.9, 0],
        ],
      },
    ])
  })

  it('flattens multi-range zones into one contiguous strip', () => {
    const [strip] = buildZonePreviewStrips(pixels, [
      {
        id: 'checker',
        name: 'Checker',
        ranges: [
          { start: 0, end: 1 },
          { start: 6, end: 7 },
        ],
      },
    ])

    expect(strip.pixelCount).toBe(4)
    expect(strip.samples).toEqual([
      [1, 0, 0],
      [0.9, 0, 0],
      [1, 1, 0],
      [0.9, 0.9, 0],
    ])
  })

  it('samples long strips without losing the real pixel count', () => {
    const longPixels = Array.from({ length: 12 }, (_, index): PixelColor => [
      index / 12,
      0,
      0,
    ])

    const [strip] = buildZonePreviewStrips(
      longPixels,
      [{ id: 'all', name: 'All', ranges: [{ start: 0, end: 11 }] }],
      { maxSamples: 4 },
    )

    expect(strip.pixelCount).toBe(12)
    expect(strip.samples).toEqual([
      [0, 0, 0],
      [3 / 12, 0, 0],
      [6 / 12, 0, 0],
      [9 / 12, 0, 0],
    ])
  })

  it('isolates solo zones without changing the preview pixel count', () => {
    expect(filterPixelsForSolo(pixels, [
      {
        id: 'split',
        name: 'Split',
        ranges: [
          { start: 0, end: 1 },
          { start: 6, end: 7 },
        ],
      },
    ], 'split')).toEqual([
      [1, 0, 0],
      [0.9, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0],
      [0.9, 0.9, 0],
    ])
  })

  it('leaves pixels alone when no solo zone is active or the zone is missing', () => {
    const zones = [{ id: 'zone-a', name: 'Zone A', ranges: [{ start: 0, end: 1 }] }]

    expect(filterPixelsForSolo(pixels, zones, null)).toBe(pixels)
    expect(filterPixelsForSolo(pixels, zones, 'missing')).toBe(pixels)
  })
})

function profile(seed: Partial<ControllerProfile>): ControllerProfile {
  return {
    id: seed.id ?? 'profile-1',
    name: seed.name ?? 'Controller',
    board: { kind: 'pixelblaze-v3-standard' },
    inputs: [],
    globalTransforms: [],
    patternBindings: [],
    zones: seed.zones ?? [{ id: 'zone-1', name: 'Zone 1', ranges: [{ start: 0, end: 3 }] }],
    updatedAt: seed.updatedAt ?? 0,
    ...(seed.deviceId ? { deviceId: seed.deviceId } : {}),
    ...(seed.lastSeenIp ? { lastSeenIp: seed.lastSeenIp } : {}),
  }
}

describe('selectControllerPreviewZones', () => {
  it('prefers the active live controller device id', () => {
    const zones = selectControllerPreviewZones(
      [
        profile({ id: 'offline', deviceId: 'old-device' }),
        profile({ id: 'active', deviceId: 'device-1', zones: [{ id: 'live', name: 'Live', ranges: [{ start: 4, end: 7 }] }] }),
      ],
      {
        activeIp: '10.0.0.2',
        controllers: {
          '10.0.0.2': { ip: '10.0.0.2', phase: 'live', deviceId: 'device-1' },
        },
      },
    )

    expect(zones.map((zone) => zone.id)).toEqual(['live'])
  })

  it('falls back to an active controller IP when the device id is not known', () => {
    const zones = selectControllerPreviewZones(
      [profile({ id: 'active', lastSeenIp: '10.0.0.2' })],
      {
        activeIp: '10.0.0.2',
        controllers: {
          '10.0.0.2': { ip: '10.0.0.2', phase: 'live' },
        },
      },
    )

    expect(zones).toHaveLength(1)
  })

  it('uses the only zoned profile when no live controller is active', () => {
    const zones = selectControllerPreviewZones(
      [
        profile({ id: 'empty', zones: [] }),
        profile({ id: 'zoned', zones: [{ id: 'only', name: 'Only', ranges: [{ start: 2, end: 5 }] }] }),
      ],
      { activeIp: null, controllers: {} },
    )

    expect(zones.map((zone) => zone.id)).toEqual(['only'])
  })

  it('returns no zones when multiple offline profiles could apply', () => {
    const zones = selectControllerPreviewZones(
      [profile({ id: 'a' }), profile({ id: 'b' })],
      { activeIp: null, controllers: {} },
    )

    expect(zones).toEqual([])
  })
})
