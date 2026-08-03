import { describeShowRenderTargetArena } from './showRenderTargetArena'
import { planShowRenderTargetCaches } from './showRenderTargetPlanner'
import { buildShowVmResourceLedger } from './showVmResourceLedger'

describe('Show render-target cache planner (#517)', () => {
  it.each([
    'show',
    'scene',
    'transition',
    'frame',
    'placement-epoch',
    'property-epoch',
  ] as const)('accepts a profitable exact %s lifetime', (kind) => {
    const plan = planShowRenderTargetCaches([{
      id: `${kind}-field`,
      kind: 'scalar-field',
      lifetime: { kind, start: 0, end: 1, key: `${kind}-0` },
      invalidatedBy: [`${kind}-exit`],
      exactness: 'exact',
      setupCost: 0,
      perFrameSavings: 1,
      expectedReuseCount: 2,
    }])

    expect(plan.assignments).toHaveLength(1)
    expect(plan.assignments[0].lifetime.kind).toBe(kind)
  })

  it('reuses the same physical planes for non-overlapping role lifetimes', () => {
    const plan = planShowRenderTargetCaches([
      {
        id: 'scene-0-sample-xy',
        kind: 'sample-xy',
        lifetime: { kind: 'scene', start: 0, end: 10_000, key: 'scene-0' },
        invalidatedBy: ['scene-exit'],
        exactness: 'exact',
        setupCost: 2_000,
        perFrameSavings: 8_000,
        expectedReuseCount: 30,
      },
      {
        id: 'transition-0-snapshot',
        kind: 'rgb-snapshot',
        lifetime: { kind: 'transition', start: 10_000, end: 12_000, key: 'boundary-0' },
        invalidatedBy: ['transition-exit', 'show-loop'],
        exactness: 'authored-snapshot',
        authorSelected: true,
        required: true,
        setupCost: 4_000,
        perFrameSavings: 4_000,
        expectedReuseCount: 10,
        replayCost: 1_000,
      },
    ])

    expect(plan.assignments.map(({ candidateId, role, planes }) => ({ candidateId, role, planes }))).toEqual([
      { candidateId: 'scene-0-sample-xy', role: 'sample-xy', planes: [0, 1] },
      { candidateId: 'transition-0-snapshot', role: 'stage-rgb', planes: [0, 1, 2] },
    ])
    expect(plan.peakPlaneCount).toBe(3)
    expect(plan.totalEstimatedSavedWork).toBe(264_000)
  })

  it('coallocates overlapping intervals of one materialized cache (#676)', () => {
    const candidate = (id: string, start: number, end: number) => ({
      id,
      kind: 'rgb-snapshot' as const,
      materializationKey: 'freeze:continuous-placement',
      lifetime: { kind: 'scene' as const, start, end, key: id },
      invalidatedBy: ['clip-exit'],
      exactness: 'authored-snapshot' as const,
      authorSelected: true,
      required: true,
      setupCost: 4_000,
      perFrameSavings: 4_000,
      expectedReuseCount: 10,
      replayCost: 1_000,
    })
    const plan = planShowRenderTargetCaches([
      candidate('freeze:scene-0', 0, 1_000),
      candidate('freeze:scene-1', 500, 1_500),
    ])

    expect(plan.assignments.map(({ candidateId, planes }) => ({ candidateId, planes }))).toEqual([
      { candidateId: 'freeze:scene-0', planes: [0, 1, 2] },
      { candidateId: 'freeze:scene-1', planes: [0, 1, 2] },
    ])
    expect(plan.peakPlaneCount).toBe(3)
  })

  it('lets a hard-required capture displace an overlapping degradable snapshot (#693)', () => {
    const snapshot = {
      id: 'transition:routed:0:snapshot-live',
      kind: 'rgb-snapshot' as const,
      degradable: true,
      lifetime: { kind: 'transition' as const, start: 500, end: 1_000, key: 'boundary-0' },
      invalidatedBy: ['transition-exit', 'show-loop'],
      exactness: 'authored-snapshot' as const,
      authorSelected: true,
      required: true,
      setupCost: 4_000,
      perFrameSavings: 400_000,
      expectedReuseCount: 100,
      replayCost: 1_000,
    }
    const capture = {
      id: 'refresh:routed:0:0:held',
      kind: 'rgb-snapshot' as const,
      materializationKey: 'strobe:held',
      lifetime: { kind: 'scene' as const, start: 0, end: 1_000, key: 'refresh-scene-0' },
      invalidatedBy: ['refresh-cadence', 'clip-exit'],
      exactness: 'authored-snapshot' as const,
      authorSelected: true,
      required: true,
      setupCost: 4_000,
      perFrameSavings: 4_000,
      expectedReuseCount: 10,
      replayCost: 1_000,
    }
    const plan = planShowRenderTargetCaches([snapshot, capture])

    expect(plan.assignments.map(({ candidateId }) => candidateId)).toEqual([capture.id])
    expect(plan.decisions.find((decision) => decision.candidateId === snapshot.id)).toMatchObject({
      status: 'rejected',
      reason: 'insufficient-overlap-capacity',
      conflictsWith: [capture.id],
    })
  })

  it('partitions overlapping planes and explains a candidate that cannot fit', () => {
    const plan = planShowRenderTargetCaches([
      {
        id: 'scene-sample-xy',
        kind: 'sample-xy',
        lifetime: { kind: 'scene', start: 0, end: 10_000, key: 'scene-0' },
        invalidatedBy: ['scene-exit'],
        exactness: 'exact',
        setupCost: 0,
        perFrameSavings: 100,
        expectedReuseCount: 10,
      },
      {
        id: 'scene-mask',
        kind: 'scalar-field',
        lifetime: { kind: 'property-epoch', start: 0, end: 10_000, key: 'mask-0' },
        invalidatedBy: ['property-change'],
        exactness: 'exact',
        setupCost: 0,
        perFrameSavings: 80,
        expectedReuseCount: 10,
      },
      {
        id: 'shared-pattern-rgb',
        kind: 'shared-pattern-output',
        lifetime: { kind: 'frame', start: 0, end: 10_000, key: 'placement-pair' },
        invalidatedBy: ['frame-end'],
        exactness: 'exact',
        setupCost: 0,
        perFrameSavings: 50,
        expectedReuseCount: 10,
      },
    ])

    expect(plan.assignments.map(({ candidateId, planes }) => ({ candidateId, planes }))).toEqual([
      { candidateId: 'scene-sample-xy', planes: [0, 1] },
      { candidateId: 'scene-mask', planes: [2] },
    ])
    expect(plan.decisions).toContainEqual(expect.objectContaining({
      candidateId: 'shared-pattern-rgb',
      status: 'rejected',
      reason: 'insufficient-overlap-capacity',
      conflictsWith: ['scene-mask', 'scene-sample-xy'],
    }))
  })

  it.each([
    ['two-plane plus one-plane overlap', ['sample-xy', 'scalar-field'], [[0, 1], [2]]],
    ['three scalar fields overlap', ['scalar-field', 'scalar-field', 'scalar-field'], [[0], [1], [2]]],
    ['three-plane then two-plane do not overlap', ['rgb-snapshot', 'sample-xy'], [[0, 1, 2], [0, 1]]],
  ] as const)('keeps every selected %s assignment legal', (_name, kinds, expectedPlanes) => {
    const candidates = kinds.map((kind, index) => ({
      id: `candidate-${index}`,
      kind,
      lifetime: {
        kind: 'scene' as const,
        start: kind === 'sample-xy' && kinds[0] === 'rgb-snapshot' ? 1_000 : 0,
        end: kind === 'rgb-snapshot' ? 1_000 : 2_000,
        key: `lifetime-${index}`,
      },
      invalidatedBy: ['scene-exit'],
      exactness: kind === 'rgb-snapshot' ? 'authored-snapshot' as const : 'exact' as const,
      authorSelected: kind === 'rgb-snapshot' ? true : undefined,
      required: kind === 'rgb-snapshot' ? true : undefined,
      setupCost: 0,
      perFrameSavings: kinds.length - index,
      expectedReuseCount: 10,
    }))

    const plan = planShowRenderTargetCaches(candidates)

    expect(plan.assignments.map((assignment) => assignment.planes)).toEqual(expectedPlanes)
    for (const [index, assignment] of plan.assignments.entries()) {
      for (const other of plan.assignments.slice(index + 1)) {
        const overlaps = assignment.lifetime.start < other.lifetime.end
          && other.lifetime.start < assignment.lifetime.end
        if (!overlaps) continue
        expect(assignment.planes.some((plane) => other.planes.includes(plane))).toBe(false)
      }
    }
  })

  it('never schedules approximate behavior that the author did not select', () => {
    const plan = planShowRenderTargetCaches([
      {
        id: 'unrequested-decimation',
        kind: 'shared-pattern-output',
        lifetime: { kind: 'frame', start: 0, end: 1, key: 'frame-0' },
        invalidatedBy: ['frame-end'],
        exactness: 'authored-approximate',
        setupCost: 0,
        perFrameSavings: 1_000_000,
        expectedReuseCount: 1,
      },
      {
        id: 'exact-frame-reuse',
        kind: 'shared-pattern-output',
        lifetime: { kind: 'frame', start: 0, end: 1, key: 'frame-0' },
        invalidatedBy: ['frame-end'],
        exactness: 'exact',
        setupCost: 10,
        perFrameSavings: 100,
        expectedReuseCount: 1,
      },
    ])

    expect(plan.assignments.map((assignment) => assignment.candidateId)).toEqual(['exact-frame-reuse'])
    expect(plan.decisions).toContainEqual(expect.objectContaining({
      candidateId: 'unrequested-decimation',
      status: 'rejected',
      reason: 'approximation-not-authored',
    }))
  })

  it('allows an explicitly authored required approximation to own an overlapping lifetime', () => {
    const plan = planShowRenderTargetCaches([
      {
        id: 'exact-frame-reuse',
        kind: 'shared-pattern-output',
        lifetime: { kind: 'frame', start: 0, end: 1, key: 'frame-0' },
        invalidatedBy: ['frame-end'],
        exactness: 'exact',
        setupCost: 0,
        perFrameSavings: 10_000,
        expectedReuseCount: 1,
      },
      {
        id: 'authored-decimation',
        kind: 'shared-pattern-output',
        lifetime: { kind: 'frame', start: 0, end: 1, key: 'frame-0' },
        invalidatedBy: ['frame-end'],
        exactness: 'authored-approximate',
        authorSelected: true,
        required: true,
        setupCost: 0,
        perFrameSavings: 1,
        expectedReuseCount: 1,
      },
    ])

    expect(plan.assignments.map((assignment) => assignment.candidateId)).toEqual(['authored-decimation'])
    expect(plan.decisions).toContainEqual(expect.objectContaining({
      candidateId: 'exact-frame-reuse',
      reason: 'insufficient-overlap-capacity',
    }))
  })

  it('declines an unprofitable optional cache but preserves a required authored policy', () => {
    const plan = planShowRenderTargetCaches([
      {
        id: 'costlier-than-recompute',
        kind: 'scalar-field',
        lifetime: { kind: 'property-epoch', start: 0, end: 1_000, key: 'field-0' },
        invalidatedBy: ['property-change'],
        exactness: 'exact',
        setupCost: 1_000,
        perFrameSavings: 10,
        expectedReuseCount: 2,
      },
      {
        id: 'authored-freeze',
        kind: 'rgb-snapshot',
        lifetime: { kind: 'transition', start: 1_000, end: 2_000, key: 'boundary-0' },
        invalidatedBy: ['transition-exit'],
        exactness: 'authored-snapshot',
        authorSelected: true,
        required: true,
        setupCost: 1_000,
        perFrameSavings: 10,
        expectedReuseCount: 2,
      },
    ])

    expect(plan.assignments.map((assignment) => assignment.candidateId)).toEqual(['authored-freeze'])
    expect(plan.decisions).toContainEqual(expect.objectContaining({
      candidateId: 'costlier-than-recompute',
      reason: 'non-profitable',
      status: 'rejected',
    }))
  })

  it('uses stable candidate ids to break ties and reports explicit conflicts', () => {
    const candidates = [
      {
        id: 'beta-field',
        kind: 'scalar-field' as const,
        lifetime: { kind: 'scene' as const, start: 0, end: 1_000, key: 'scene-0' },
        invalidatedBy: ['scene-exit'],
        exactness: 'exact' as const,
        setupCost: 0,
        perFrameSavings: 100,
        expectedReuseCount: 10,
        conflictsWith: ['alpha-field'],
      },
      {
        id: 'alpha-field',
        kind: 'scalar-field' as const,
        lifetime: { kind: 'scene' as const, start: 0, end: 1_000, key: 'scene-0' },
        invalidatedBy: ['scene-exit'],
        exactness: 'exact' as const,
        setupCost: 0,
        perFrameSavings: 100,
        expectedReuseCount: 10,
      },
    ]

    const forward = planShowRenderTargetCaches(candidates)
    const reversed = planShowRenderTargetCaches([...candidates].reverse())

    expect(forward.assignments.map((assignment) => assignment.candidateId)).toEqual(['alpha-field'])
    expect(reversed.assignments.map((assignment) => assignment.candidateId)).toEqual(['alpha-field'])
    expect(forward.decisions).toContainEqual(expect.objectContaining({
      candidateId: 'beta-field',
      reason: 'explicit-conflict',
      conflictsWith: ['alpha-field'],
    }))
  })

  it('consumes the fixed arena and complete VM ledger without allocating another array', () => {
    const resources = buildShowVmResourceLedger({ pixelCount: 2_000, members: [] })
    const plan = planShowRenderTargetCaches([{
      id: 'authored-freeze',
      kind: 'rgb-snapshot',
      lifetime: { kind: 'transition', start: 0, end: 1_000, key: 'boundary-0' },
      invalidatedBy: ['transition-exit'],
      exactness: 'authored-snapshot',
      authorSelected: true,
      required: true,
      setupCost: 2_000,
      perFrameSavings: 2_000,
      expectedReuseCount: 10,
    }], {
      arena: describeShowRenderTargetArena(2_000, false),
      resources,
    })

    expect(plan.assignments).toEqual([])
    expect(plan.decisions[0]).toEqual(expect.objectContaining({
      candidateId: 'authored-freeze',
      reason: 'arena-unavailable',
    }))
    expect(plan.resources).toEqual({
      arenaWords: 6_012,
      additionalArrayWords: 0,
      totalVmWords: 6_012,
      remainingVmWords: 4_228,
      blockerCount: 0,
    })
  })

  it('lets a required Transition snapshot suspend an overlapping previous-RGB Effect', () => {
    const plan = planShowRenderTargetCaches([
      {
        id: 'effect:trails',
        kind: 'previous-rgb',
        lifetime: { kind: 'show', start: 0, end: 10_000, key: 'show-feedback' },
        invalidatedBy: ['scene-entry', 'show-loop', 'semantic-change'],
        exactness: 'authored-approximate',
        authorSelected: true,
        required: true,
        setupCost: 0,
        perFrameSavings: 0,
        expectedReuseCount: 1,
      },
      {
        id: 'transition:0:snapshot-live',
        kind: 'rgb-snapshot',
        lifetime: { kind: 'transition', start: 4_000, end: 5_000, key: 'boundary-0' },
        invalidatedBy: ['transition-exit', 'show-loop'],
        exactness: 'authored-snapshot',
        authorSelected: true,
        required: true,
        setupCost: 100,
        perFrameSavings: 100,
        expectedReuseCount: 10,
      },
    ], {
      arena: describeShowRenderTargetArena(2_000),
      resources: buildShowVmResourceLedger({ pixelCount: 2_000, members: [] }),
    })

    expect(plan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        candidateId: 'effect:trails',
        role: 'previous-rgb',
        planes: [0, 1, 2],
      }),
      expect.objectContaining({
        candidateId: 'transition:0:snapshot-live',
        role: 'stage-rgb',
        planes: [0, 1, 2],
      }),
    ]))
    expect(plan.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        candidateId: 'effect:trails',
        status: 'selected',
        reason: 'selected',
      }),
    ]))
    expect(plan.resources?.additionalArrayWords).toBe(0)
  })

  it.each([
    ['Freeze', 'rgb-snapshot', 'freeze:scene-0'],
    ['Refresh', 'rgb-snapshot', 'rolling-refresh:scene-0'],
    ['shared Pattern output', 'shared-pattern-output', 'pattern-output:scene-0'],
    ['scalar field', 'scalar-field', 'scalar-field:scene-0'],
  ] as const)('discloses an overlapping %s conflict with previous-RGB', (_label, kind, candidateId) => {
    const plan = planShowRenderTargetCaches([
      {
        id: 'effect:trails',
        kind: 'previous-rgb',
        lifetime: { kind: 'scene', start: 0, end: 5_000, key: 'scene-0' },
        invalidatedBy: ['scene-exit'],
        exactness: 'authored-approximate',
        authorSelected: true,
        required: true,
        setupCost: 0,
        perFrameSavings: 0,
        expectedReuseCount: 1,
      },
      {
        id: candidateId,
        kind,
        lifetime: { kind: 'scene', start: 0, end: 5_000, key: 'scene-0' },
        invalidatedBy: ['scene-exit'],
        exactness: kind === 'rgb-snapshot' ? 'authored-snapshot' : 'exact',
        authorSelected: kind === 'rgb-snapshot' ? true : undefined,
        required: true,
        setupCost: 0,
        perFrameSavings: 100,
        expectedReuseCount: 10,
      },
    ])

    expect(plan.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        candidateId: 'effect:trails',
        status: 'rejected',
        reason: 'insufficient-overlap-capacity',
        conflictsWith: [candidateId],
      }),
    ]))
  })
})
