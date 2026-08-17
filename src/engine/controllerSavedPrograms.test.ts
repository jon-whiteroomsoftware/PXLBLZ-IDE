import {
  controllerSavedProgramFeatures,
  describeControllerSavedPrograms,
  describeProfileFreshness,
  resolveControllerSavedPatternStatuses,
  sortControllerSavedPrograms,
  summarizeControllerSavedPatternStatuses,
} from './controllerSavedPrograms'
import { controllerProfileArtifactSignature } from './controllerProfilePassRecipe'
import { defaultControllerProfile } from '@/store/controllerProfileStore'

const profile = defaultControllerProfile({ id: 'ctrl-profile', now: 1 })

function signature(bindingKey: string, mapDim: 1 | 2 | 3 | null = 2) {
  return controllerProfileArtifactSignature(profile, bindingKey, { mapDim })
}

function pushRecord(transforms: string[], profileSignature?: string, sourceHash?: string) {
  return {
    transforms,
    artifactHash: 'hash',
    stampedAt: '2026-07-09T00:00:00.000Z',
    name: 'Saved pattern',
    ...(profileSignature === undefined ? {} : { profileSignature }),
    ...(sourceHash === undefined ? {} : { sourceHash }),
  }
}

describe('controllerSavedProgramFeatures', () => {
  const signatureWith = (input: {
    transforms?: Array<Record<string, unknown>>
    inputs?: Array<Record<string, unknown>>
    bindings?: Array<Record<string, unknown>>
    version?: number
  }) => JSON.stringify({
    version: input.version ?? 1,
    transforms: input.transforms ?? [],
    inputs: input.inputs ?? [],
    bindings: input.bindings ?? [],
  })

  it('does not claim features without durable evidence or from an unrecognized signature', () => {
    expect(controllerSavedProgramFeatures(undefined)).toEqual({
      powerCap: false,
      hardwareBrightness: false,
      controlBinding: false,
      variableBinding: false,
    })
    expect(controllerSavedProgramFeatures(pushRecord([], '{not json'))).toEqual({
      powerCap: false,
      hardwareBrightness: false,
      controlBinding: false,
      variableBinding: false,
    })
    expect(controllerSavedProgramFeatures(pushRecord([], signatureWith({
      version: 2,
      transforms: [{ type: 'power-cap', mixinId: 'builtin:power-cap', maxDuty: 0.4 }],
    })))).toEqual({
      powerCap: false,
      hardwareBrightness: false,
      controlBinding: false,
      variableBinding: false,
    })
  })

  it('derives power and brightness from legacy transforms or a recognized signature', () => {
    expect(controllerSavedProgramFeatures(pushRecord(['power-cap', 'hardware-brightness']))).toMatchObject({
      powerCap: true,
      hardwareBrightness: true,
    })
    expect(controllerSavedProgramFeatures(pushRecord([], signatureWith({
      transforms: [
        { type: 'power-cap', mixinId: 'builtin:power-cap', maxDuty: 0.4 },
        {
          type: 'hardware-brightness',
          mixinId: 'builtin:hardware-brightness',
          inputId: 'pot-1',
          mode: 'multiply-output',
        },
      ],
      inputs: [{
        id: 'pot-1',
        name: 'Brightness',
        pin: 33,
        signal: 'analog',
        smoothing: 0.2,
        fallback: 0.5,
        invert: false,
      }],
    })))).toMatchObject({ powerCap: true, hardwareBrightness: true })
  })

  it('does not claim signature brightness when a same-input binding suppresses its emission', () => {
    expect(controllerSavedProgramFeatures(pushRecord([], signatureWith({
      transforms: [{
        type: 'hardware-brightness',
        mixinId: 'builtin:hardware-brightness',
        inputId: 'pot-1',
        mode: 'multiply-output',
      }],
      inputs: [{
        id: 'pot-1',
        name: 'Brightness',
        pin: 33,
        signal: 'analog',
        smoothing: 0.2,
        fallback: 0.5,
        invert: false,
      }],
      bindings: [{
        id: 'binding-1',
        patternId: 'pat-1',
        inputId: 'pot-1',
        target: { kind: 'call-function', name: 'setSpeed' },
      }],
    })))).toMatchObject({ hardwareBrightness: false, controlBinding: true })
  })

  it.each([
    ['call-exported-slider', true, false],
    ['call-function', true, false],
    ['assign-variable', false, true],
  ] as const)('derives %s binding evidence', (kind, controlBinding, variableBinding) => {
    const target = kind === 'assign-variable'
      ? { kind, name: 'speed', min: 0, max: 4 }
      : { kind, name: kind === 'call-function' ? 'setSpeed' : 'sliderSpeed' }
    expect(controllerSavedProgramFeatures(pushRecord([], signatureWith({
      bindings: [{ id: 'binding-1', patternId: 'pat-1', inputId: 'pot-1', target }],
    })))).toMatchObject({ controlBinding, variableBinding })
  })

  it('reports control and variable bindings independently when both are present', () => {
    expect(controllerSavedProgramFeatures(pushRecord([], signatureWith({
      bindings: [
        {
          id: 'binding-1',
          patternId: 'pat-1',
          inputId: 'pot-1',
          target: { kind: 'call-function', name: 'setSpeed' },
        },
        {
          id: 'binding-2',
          patternId: 'pat-1',
          inputId: 'pot-2',
          target: { kind: 'assign-variable', name: 'speed', min: 0, max: 4 },
        },
      ],
    })))).toMatchObject({ controlBinding: true, variableBinding: true })
  })
})

describe('describeProfileFreshness', () => {
  it('marks a push record current only when its normalized full profile signature matches', () => {
    expect(describeProfileFreshness(
      pushRecord(['power-cap'], signature('pat-1')),
      signature('pat-1'),
    )).toBe('current')
  })

  it('marks a recognized signature stale when any code-affecting profile fact changed', () => {
    expect(describeProfileFreshness(
      pushRecord([], signature('pat-1', 2)),
      signature('pat-1', 3),
    )).toBe('stale')
  })

  it('marks a saved Pattern stale when its Studio source changed (#804)', () => {
    expect(describeProfileFreshness(
      pushRecord([], signature('pat-1'), 'saved-source'),
      signature('pat-1'),
      'edited-source',
    )).toBe('stale')
    expect(describeProfileFreshness(
      pushRecord([], signature('pat-1'), 'saved-source'),
      signature('pat-1'),
      'saved-source',
    )).toBe('current')
  })

  it('does not claim freshness without a recognized durable signature', () => {
    expect(describeProfileFreshness(undefined, signature('pat-1'))).toBe('unmanaged')
    expect(describeProfileFreshness(pushRecord([]), signature('pat-1'))).toBe('unmanaged')
    expect(describeProfileFreshness(
      pushRecord([], 'not-json'),
      signature('pat-1'),
    )).toBe('unmanaged')
    expect(describeProfileFreshness(
      pushRecord([], JSON.stringify({ version: 99, transforms: [], inputs: [], bindings: [] })),
      signature('pat-1'),
    )).toBe('unmanaged')
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
          'pat-1': pushRecord(['power-cap'], signature('pat-1')),
          'demo:AuroraSphere': pushRecord([], signature('demo:AuroraSphere', 3)),
        },
      },
      profile,
      mapDim: 2,
    })

    const alphabetical = sortControllerSavedPrograms(view, {
      field: 'pattern',
      direction: 'ascending',
    })

    expect(alphabetical.owned).toEqual([
      {
        kind: 'owned',
        programId: 'DEV2',
        bindingKey: 'demo:AuroraSphere',
        name: 'AuroraSphere',
        deviceName: 'Aurora on device',
        routeId: 'AuroraSphere',
        studioPatternMissing: false,
        sourceKind: 'pattern',
        profileFeatures: {
          powerCap: false,
          hardwareBrightness: false,
          controlBinding: false,
          variableBinding: false,
        },
        freshness: 'stale',
      },
      {
        kind: 'owned',
        programId: 'ORPHAN1',
        bindingKey: 'pat-deleted',
        name: 'Deleted Studio pattern',
        deviceName: 'Deleted Studio pattern',
        routeId: null,
        studioPatternMissing: true,
        sourceKind: 'pattern',
        profileFeatures: {
          powerCap: false,
          hardwareBrightness: false,
          controlBinding: false,
          variableBinding: false,
        },
        freshness: 'unmanaged',
      },
      {
        kind: 'owned',
        programId: 'DEV1',
        bindingKey: 'pat-1',
        name: 'Twinkle',
        deviceName: 'Device copy of Twinkle',
        routeId: 'pat-1',
        studioPatternMissing: false,
        sourceKind: 'pattern',
        profileFeatures: {
          powerCap: true,
          hardwareBrightness: false,
          controlBinding: false,
          variableBinding: false,
        },
        freshness: 'current',
      },
    ])
    expect(alphabetical.foreign).toEqual([
      {
        kind: 'foreign',
        programId: 'FOREIGN1',
        bindingKey: null,
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
      profile,
      mapDim: 2,
    })

    expect(view.owned.map((row) => row.programId)).toEqual(['B2', 'B1'])
    expect(view.foreign.map((row) => row.programId)).toEqual(['F2', 'F1'])
  })

  it('sorts each inventory by Pattern in both directions without mutating source order', () => {
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

    const ascending = sortControllerSavedPrograms(view, {
      field: 'pattern',
      direction: 'ascending',
    })
    const descending = sortControllerSavedPrograms(view, {
      field: 'pattern',
      direction: 'descending',
    })

    expect(ascending.owned.map((row) => row.programId)).toEqual(['B1', 'B2'])
    expect(ascending.foreign.map((row) => row.programId)).toEqual(['F1', 'F2'])
    expect(descending.owned.map((row) => row.programId)).toEqual(['B2', 'B1'])
    expect(descending.foreign.map((row) => row.programId)).toEqual(['F2', 'F1'])
    expect(view.owned.map((row) => row.programId)).toEqual(['B2', 'B1'])
    expect(view.foreign.map((row) => row.programId)).toEqual(['F2', 'F1'])
  })

  it('sorts by effective Status in both directions', () => {
    const view = {
      owned: [
        { ...savedProgramRow('B2', 'Mike'), freshness: 'unmanaged' as const },
        { ...savedProgramRow('C3', 'Alpha'), freshness: 'stale' as const },
        savedProgramRow('A1', 'Zulu'),
      ],
      foreign: [savedProgramRow('F2', 'Apple', 'foreign'), savedProgramRow('F1', 'Zebra', 'foreign')],
    }
    const statuses = { B2: 'updating', A1: 'failed', C3: 'queued' } as const

    expect(sortControllerSavedPrograms(view, {
      field: 'status',
      direction: 'ascending',
    }, statuses).owned.map((row) => row.programId)).toEqual(['A1', 'C3', 'B2'])
    expect(sortControllerSavedPrograms(view, {
      field: 'status',
      direction: 'descending',
    }, statuses).owned.map((row) => row.programId)).toEqual(['B2', 'C3', 'A1'])
    expect(view.owned.map((row) => row.programId)).toEqual(['B2', 'C3', 'A1'])
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
            profileSignature: signature('show:show-1'),
            showOutputContract: {
              version: 1,
              kind: 'installation',
              pixelCount: 256,
              outputMap: { kind: 'stock', id: 'plane', name: 'Square', fingerprint: '11111111' },
            },
          },
        },
      },
      profile,
      mapDim: 2,
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
      profile,
      mapDim: 2,
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
    bindingKey: kind === 'owned' ? programId : null,
    name,
    deviceName: name,
    routeId: null,
    studioPatternMissing: false,
    sourceKind: 'pattern' as const,
    freshness: kind === 'owned' ? 'current' as const : 'unmanaged' as const,
  }
}

describe('resolveControllerSavedPatternStatuses (#874)', () => {
  const owned = [
    savedProgramRow('A1', 'Alpha'),
    { ...savedProgramRow('B2', 'Bravo'), freshness: 'stale' as const },
    { ...savedProgramRow('C3', 'Charlie'), freshness: 'unmanaged' as const },
  ]

  it('lets fresh row freshness supersede a completed "current" reconciliation snapshot', () => {
    // Right after a code-affecting profile edit the reconciliation snapshot still
    // says current while every row already compares stale; the rows win.
    expect(resolveControllerSavedPatternStatuses(owned, [
      { programId: 'A1', state: 'current' },
      { programId: 'B2', state: 'current' },
    ])).toEqual({ A1: 'current', B2: 'stale', C3: 'unmanaged' })
  })

  it('lets live reconciliation work states supersede row freshness', () => {
    expect(resolveControllerSavedPatternStatuses(owned, [
      { programId: 'A1', state: 'updating' },
      { programId: 'B2', state: 'queued' },
      { programId: 'C3', state: 'failed' },
    ])).toEqual({ A1: 'updating', B2: 'queued', C3: 'failed' })
  })

  it('keeps reconciliation programs that have no inventory row yet', () => {
    expect(resolveControllerSavedPatternStatuses([], [
      { programId: 'A1', state: 'current' },
      { programId: 'B2', state: 'queued' },
    ])).toEqual({ A1: 'current', B2: 'queued' })
  })
})

describe('summarizeControllerSavedPatternStatuses (#874)', () => {
  it('counts every resolved status so the summary can never disagree with the rows', () => {
    expect(summarizeControllerSavedPatternStatuses({
      A1: 'current',
      B2: 'stale',
      C3: 'stale',
      D4: 'updating',
      E5: 'queued',
      F6: 'failed',
      G7: 'unmanaged',
    })).toEqual({
      current: 1,
      stale: 2,
      updating: 1,
      queued: 1,
      failed: 1,
      unmanaged: 1,
      total: 7,
    })
  })

  it('reports an empty summary as all zeros', () => {
    expect(summarizeControllerSavedPatternStatuses({})).toEqual({
      current: 0,
      stale: 0,
      updating: 0,
      queued: 0,
      failed: 0,
      unmanaged: 0,
      total: 0,
    })
  })
})
