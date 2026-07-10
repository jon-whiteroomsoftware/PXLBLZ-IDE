import {
  describeControllerSavedPrograms,
  describeTransformFreshness,
  enabledControllerTransformIds,
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

    expect(view.owned).toEqual([
      {
        kind: 'owned',
        programId: 'DEV1',
        name: 'Twinkle',
        deviceName: 'Device copy of Twinkle',
        routeId: 'pat-1',
        studioPatternMissing: false,
        freshness: 'current',
      },
      {
        kind: 'owned',
        programId: 'DEV2',
        name: 'AuroraSphere',
        deviceName: 'Aurora on device',
        routeId: 'AuroraSphere',
        studioPatternMissing: false,
        freshness: 'stale',
      },
      {
        kind: 'owned',
        programId: 'ORPHAN1',
        name: 'Deleted Studio pattern',
        deviceName: 'Deleted Studio pattern',
        routeId: null,
        studioPatternMissing: true,
        freshness: 'unmanaged',
      },
    ])
    expect(view.foreign).toEqual([
      {
        kind: 'foreign',
        programId: 'FOREIGN1',
        name: 'sound bar kit',
        deviceName: 'sound bar kit',
        routeId: null,
        studioPatternMissing: false,
        freshness: 'unmanaged',
      },
    ])
  })

  it('uses only bindings for the requested Controller and keeps device order within groups', () => {
    const view = describeControllerSavedPrograms({
      controllerId: 'ctrl-B',
      programs: [
        { id: 'F1', name: '' },
        { id: 'B2', name: 'Second' },
        { id: 'B1', name: 'First' },
      ],
      bindings: {
        'ctrl-A': { 'pat-a': 'F1' },
        'ctrl-B': { 'pat-1': 'B1', 'pat-2': 'B2' },
      },
      studioPatterns: [
        { bindingKey: 'pat-1', routeId: 'pat-1', name: 'One' },
        { bindingKey: 'pat-2', routeId: 'pat-2', name: 'Two' },
      ],
      pushRecords: {},
      enabledTransforms: [],
    })

    expect(view.owned.map((row) => row.programId)).toEqual(['B2', 'B1'])
    expect(view.foreign).toMatchObject([{ programId: 'F1', name: 'Unnamed program' }])
  })
})
