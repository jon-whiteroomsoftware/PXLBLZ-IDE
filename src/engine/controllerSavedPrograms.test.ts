import {
  describeControllerSavedPrograms,
  describeTransformFreshness,
  enabledControllerTransformIds,
  sortControllerSavedPrograms,
} from './controllerSavedPrograms'

function pushRecord(transforms: string[]) {
  return {
    transforms,
    artifactHash: 'hash',
    stampedAt: '2026-07-09T00:00:00.000Z',
    name: 'Saved pattern',
  }
}

describe('describeTransformFreshness', () => {
  it('marks a push record current when its transforms match the enabled profile transforms', () => {
    expect(describeTransformFreshness(
      {
        transforms: ['power-cap', 'hardware-brightness'],
        artifactHash: 'hash',
        stampedAt: '2026-07-09T00:00:00.000Z',
        name: 'Aurora',
      },
      ['hardware-brightness', 'power-cap'],
    )).toBe('current')
  })

  it('marks a push record stale when the enabled transform set changed', () => {
    expect(describeTransformFreshness(pushRecord([]), ['power-cap'])).toBe('stale')
    expect(describeTransformFreshness(pushRecord(['power-cap']), [])).toBe('stale')
  })

  it('marks a saved program without a push record unmanaged', () => {
    expect(describeTransformFreshness(undefined, ['power-cap'])).toBe('unmanaged')
  })

  it('derives enabled transform ids from profile state', () => {
    expect(enabledControllerTransformIds([
      { id: 'hardware-brightness', enabled: false },
      { id: 'power-cap', enabled: true },
    ])).toEqual(['power-cap'])
  })
})

describe('describeControllerSavedPrograms', () => {
  it('groups binding-owned programs first and resolves Studio names and routes', () => {
    const view = describeControllerSavedPrograms({
      controllerId: 'ctrl-A',
      programs: [
        { id: 'DEV1', name: 'Device copy of Twinkle' },
        { id: 'FOREIGN1', name: 'sound bar kit' },
        { id: 'DEV2', name: 'Aurora on device' },
        { id: 'ORPHAN1', name: 'Deleted Studio pattern' },
      ],
      bindings: {
        'ctrl-A': {
          'pat-1': 'DEV1',
          'demo:AuroraSphere': 'DEV2',
          'pat-deleted': 'ORPHAN1',
        },
      },
      studioPatterns: [
        { bindingKey: 'pat-1', routeId: 'pat-1', name: 'Twinkle' },
        {
          bindingKey: 'demo:AuroraSphere',
          routeId: 'AuroraSphere',
          name: 'AuroraSphere',
        },
      ],
      pushRecords: {
        'ctrl-A': {
          'pat-1': pushRecord(['power-cap']),
          'demo:AuroraSphere': pushRecord([]),
        },
      },
      enabledTransforms: ['power-cap'],
    })

    const alphabetical = sortControllerSavedPrograms(view, 'alphabetical')

    expect(alphabetical.owned).toEqual([
      {
        kind: 'owned',
        programId: 'DEV2',
        name: 'AuroraSphere',
        deviceName: 'Aurora on device',
        routeId: 'AuroraSphere',
        studioPatternMissing: false,
        sourceKind: 'pattern',
        freshness: 'stale',
      },
      {
        kind: 'owned',
        programId: 'ORPHAN1',
        name: 'Deleted Studio pattern',
        deviceName: 'Deleted Studio pattern',
        routeId: null,
        studioPatternMissing: true,
        sourceKind: 'pattern',
        freshness: 'unmanaged',
      },
      {
        kind: 'owned',
        programId: 'DEV1',
        name: 'Twinkle',
        deviceName: 'Device copy of Twinkle',
        routeId: 'pat-1',
        studioPatternMissing: false,
        sourceKind: 'pattern',
        freshness: 'current',
      },
    ])
    expect(alphabetical.foreign).toEqual([
      {
        kind: 'foreign',
        programId: 'FOREIGN1',
        name: 'sound bar kit',
        deviceName: 'sound bar kit',
        routeId: null,
        studioPatternMissing: false,
        sourceKind: 'pattern',
        freshness: 'unmanaged',
      },
    ])
  })

  it('uses only bindings for the requested Controller and preserves device order', () => {
    const view = describeControllerSavedPrograms({
      controllerId: 'ctrl-B',
      programs: [
        { id: 'F2', name: 'zebra' },
        { id: 'B2', name: 'Device second' },
        { id: 'F1', name: 'apple' },
        { id: 'B1', name: 'Device first' },
      ],
      bindings: {
        'ctrl-A': { 'pat-a': 'F1' },
        'ctrl-B': { 'pat-1': 'B1', 'pat-2': 'B2' },
      },
      studioPatterns: [
        { bindingKey: 'pat-1', routeId: 'pat-1', name: 'alpha' },
        { bindingKey: 'pat-2', routeId: 'pat-2', name: 'Beta' },
      ],
      pushRecords: {},
      enabledTransforms: [],
    })

    expect(view.owned.map((row) => row.programId)).toEqual(['B2', 'B1'])
    expect(view.foreign.map((row) => row.programId)).toEqual(['F2', 'F1'])
  })

  it('can present saved programs alphabetically without losing device order', () => {
    const view = {
      owned: [
        savedProgramRow('B2', 'Beta'),
        savedProgramRow('B1', 'alpha'),
      ],
      foreign: [
        savedProgramRow('F2', 'zebra', 'foreign'),
        savedProgramRow('F1', 'Apple', 'foreign'),
      ],
    }

    const alphabetical = sortControllerSavedPrograms(view, 'alphabetical')

    expect(alphabetical.owned.map((row) => row.programId)).toEqual(['B1', 'B2'])
    expect(alphabetical.foreign.map((row) => row.programId)).toEqual(['F1', 'F2'])
    expect(view.owned.map((row) => row.programId)).toEqual(['B2', 'B1'])
  })

  it('carries decisive Show output facts from the saved push record (#437)', () => {
    const view = describeControllerSavedPrograms({
      controllerId: 'ctrl-A',
      programs: [{ id: 'SHOW1', name: 'Measured wall Show' }],
      bindings: { 'ctrl-A': { 'show:show-1': 'SHOW1' } },
      studioPatterns: [{ bindingKey: 'show:show-1', routeId: 'show-1', name: 'Measured wall Show' }],
      pushRecords: {
        'ctrl-A': {
          'show:show-1': {
            ...pushRecord(['show']),
            showOutputContract: {
              version: 1,
              kind: 'installation',
              pixelCount: 256,
              outputMap: { kind: 'stock', id: 'plane', name: 'Square', fingerprint: '11111111' },
            },
          },
        },
      },
      enabledTransforms: ['show'],
    })

    expect(view.owned[0].showOutputContract).toMatchObject({
      kind: 'installation',
      pixelCount: 256,
      outputMap: { name: 'Square', fingerprint: '11111111' },
    })
    expect(view.owned[0].sourceKind).toBe('show')
  })

  it('marks show-bound rows as Show sources and everything else as pattern sources', () => {
    const view = describeControllerSavedPrograms({
      controllerId: 'ctrl-A',
      programs: [
        { id: 'P1', name: 'Twinkle' },
        { id: 'D1', name: 'AuroraSphere' },
        { id: 'S1', name: 'Wall Show' },
        { id: 'F1', name: 'sound bar kit' },
      ],
      bindings: { 'ctrl-A': { 'pat-1': 'P1', 'demo:AuroraSphere': 'D1', 'show:show-1': 'S1' } },
      studioPatterns: [
        { bindingKey: 'pat-1', routeId: 'pat-1', name: 'Twinkle' },
        { bindingKey: 'demo:AuroraSphere', routeId: 'AuroraSphere', name: 'AuroraSphere' },
      ],
      pushRecords: {},
      enabledTransforms: [],
    })

    expect(view.owned.map((row) => [row.name, row.sourceKind])).toEqual([
      ['Twinkle', 'pattern'],
      ['AuroraSphere', 'pattern'],
      ['Wall Show', 'show'],
    ])
    expect(view.foreign[0].sourceKind).toBe('pattern')
  })
})

function savedProgramRow(
  programId: string,
  name: string,
  kind: 'owned' | 'foreign' = 'owned',
) {
  return {
    kind,
    programId,
    name,
    deviceName: name,
    routeId: null,
    studioPatternMissing: false,
    sourceKind: 'pattern' as const,
    freshness: kind === 'owned' ? 'current' as const : 'unmanaged' as const,
  }
}
