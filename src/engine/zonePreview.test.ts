import {
  applyShowStageMask,
  buildShowStageProjection,
  buildShowLogicalStageProjection,
  showLogicalAspectAdvisory,
  buildShowStageStrips,
  buildShowStripsLayout,
  buildZonePreviewStrips,
  filterPixelsForSolo,
  selectControllerPreviewZones,
  type PixelColor,
} from '@/engine/zonePreview'
import type { ControllerProfile } from '@/engine/controllerProfile'
import type { ShowZone } from '@/engine/personalContentRecords'

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

describe('show stage projection', () => {
  it.each([
    { columns: 32, rows: 32 },
    { columns: 128, rows: 12 },
  ])('preserves normalized left/right boundaries at $columns x $rows (#436)', ({ columns, rows }) => {
    const mapPoints = Array.from({ length: columns * rows }, (_, index) => ({
      sample: [(index % columns) / (columns - 1), Math.floor(index / columns) / (rows - 1)],
    }))
    const projection = buildShowLogicalStageProjection(showZones, mapPoints, {
      kind: 'stripes',
      axis: 'x',
      zoneIds: ['arch', 'wash'],
    })

    expect(projection.unstagedPixelCount).toBe(0)
    expect(projection.zones.map((zone) => zone.pixelCount)).toEqual([
      columns / 2 * rows,
      columns / 2 * rows,
    ])
    expect(projection.pixelZoneIds[columns / 2 - 1]).toBe('arch')
    expect(projection.pixelZoneIds[columns / 2]).toBe('wash')
  })

  it('discloses a narrow coordinate axis used by a logical grid (#436)', () => {
    const mapPoints = [
      { sample: [0, 0] },
      { sample: [1, 0] },
      { sample: [0, 0.5] },
      { sample: [1, 0.5] },
    ]
    expect(showLogicalAspectAdvisory(mapPoints, {
      kind: 'grid',
      columns: 2,
      rows: 2,
      zoneIds: ['nw', 'ne', 'sw', 'se'],
    })).toBe(
      'Reference map preserves about a 2.0:1 aspect. Y boundaries use its 0.00-0.50 normalized coordinate range, so some position-based zones may be narrow or empty.',
    )
  })

  const showZones: ShowZone[] = [
    { id: 'arch', name: 'arch-left', nominalPixelCount: 3, color: '#38bdf8' },
    { id: 'wash', name: 'rock-wash', nominalPixelCount: 2, color: '#f97316' },
  ]

  it('maps controller-origin zones onto real multi-ranges and reports unstaged pixels', () => {
    const projection = buildShowStageProjection(showZones, 8, {
      controllerZones: [
        { id: 'arch-real', name: 'arch-left', ranges: [{ start: 0, end: 1 }, { start: 6, end: 7 }] },
        { id: 'wash-real', name: 'rock-wash', ranges: [{ start: 3, end: 3 }] },
      ],
    })

    expect(projection.pixelZoneIds).toEqual([
      'arch',
      'arch',
      null,
      'wash',
      null,
      null,
      'arch',
      'arch',
    ])
    expect(projection.unstagedPixelCount).toBe(3)
    expect(projection.zones).toEqual([
      expect.objectContaining({ id: 'arch', pixelCount: 4, offStage: false }),
      expect.objectContaining({ id: 'wash', pixelCount: 1, offStage: false }),
    ])
  })

  it('places freestyle zones into consecutive nominal ranges', () => {
    const projection = buildShowStageProjection(showZones, 6)

    expect(projection.pixelZoneIds).toEqual(['arch', 'arch', 'arch', 'wash', 'wash', null])
    expect(projection.unstagedPixelCount).toBe(1)
  })

  it('warns when a zone has no pixels on the selected stage', () => {
    const projection = buildShowStageProjection(showZones, 3, {
      controllerZones: [
        { id: 'arch-real', name: 'arch-left', ranges: [{ start: 20, end: 29 }] },
      ],
    })

    expect(projection.zones.find((zone) => zone.id === 'arch')).toMatchObject({
      pixelCount: 10,
      offStage: true,
    })
  })

  it('masks unstaged and non-solo pixels without moving geometry', () => {
    const projection = buildShowStageProjection(showZones, 5)

    expect(applyShowStageMask(pixels.slice(0, 5), projection, 'wash')).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0.9, 0],
      [0, 0, 1],
    ])

    expect(applyShowStageMask(pixels.slice(0, 6), buildShowStageProjection(showZones, 6), null)[5]).toEqual([
      0.055,
      0.055,
      0.06,
    ])
  })

  it('builds flattened strip layouts even when controller ranges are non-contiguous', () => {
    const layout = buildShowStripsLayout(showZones, {
      controllerZones: [
        { id: 'arch-real', name: 'arch-left', ranges: [{ start: 0, end: 1 }, { start: 6, end: 7 }] },
        { id: 'wash-real', name: 'rock-wash', ranges: [{ start: 3, end: 3 }] },
      ],
    })

    expect(layout.mapPoints).toHaveLength(5)
    expect(layout.projection.pixelZoneIds).toEqual(['arch', 'arch', 'arch', 'arch', 'wash'])

    const strips = buildShowStageStrips(pixels.slice(0, 5), showZones, {
      controllerZones: [
        { id: 'arch-real', name: 'arch-left', ranges: [{ start: 0, end: 1 }, { start: 6, end: 7 }] },
        { id: 'wash-real', name: 'rock-wash', ranges: [{ start: 3, end: 3 }] },
      ],
    })
    expect(strips.map((strip) => [strip.id, strip.pixelCount])).toEqual([
      ['arch', 4],
      ['wash', 1],
    ])
  })
})
