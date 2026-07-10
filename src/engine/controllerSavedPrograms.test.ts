import { describeControllerSavedPrograms } from './controllerSavedPrograms'

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
    })

    expect(view.owned).toEqual([
      {
        kind: 'owned',
        programId: 'DEV1',
        name: 'Twinkle',
        deviceName: 'Device copy of Twinkle',
        routeId: 'pat-1',
        studioPatternMissing: false,
      },
      {
        kind: 'owned',
        programId: 'DEV2',
        name: 'AuroraSphere',
        deviceName: 'Aurora on device',
        routeId: 'AuroraSphere',
        studioPatternMissing: false,
      },
      {
        kind: 'owned',
        programId: 'ORPHAN1',
        name: 'Deleted Studio pattern',
        deviceName: 'Deleted Studio pattern',
        routeId: null,
        studioPatternMissing: true,
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
    })

    expect(view.owned.map((row) => row.programId)).toEqual(['B2', 'B1'])
    expect(view.foreign).toMatchObject([{ programId: 'F1', name: 'Unnamed program' }])
  })
})
