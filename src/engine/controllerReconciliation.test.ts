import { vi } from 'vitest'
import {
  executeControllerReconciliation,
  planControllerReconciliation,
  type ControllerReconciliationJob,
} from './controllerReconciliation'

function pushRecord(profileSignature?: string) {
  return {
    transforms: ['power-cap'],
    artifactHash: 'artifact-hash',
    stampedAt: '2026-07-13T12:00:00.000Z',
    name: 'Managed Pattern',
    ...(profileSignature ? { profileSignature } : {}),
  }
}

describe('planControllerReconciliation', () => {
  it('strictly excludes foreign and unmanaged programs from reconciliation jobs', () => {
    const plan = planControllerReconciliation({
      controllerId: 'ctrl-A',
      programs: [
        { id: 'MANAGED1', name: 'Managed Pattern' },
        { id: 'NO_RECORD', name: 'Bound without a push record' },
        { id: 'NO_SOURCE', name: 'Bound without regenerable source' },
        { id: 'FOREIGN1', name: 'Someone else\'s Pattern' },
      ],
      bindings: {
        'ctrl-A': {
          'pat-managed': 'MANAGED1',
          'pat-unmanaged': 'NO_RECORD',
          'pat-missing': 'NO_SOURCE',
        },
      },
      pushRecords: {
        'ctrl-A': {
          'pat-managed': pushRecord('old-signature'),
          'pat-missing': pushRecord('old-signature'),
        },
      },
      artifacts: [
        {
          bindingKey: 'pat-managed',
          name: 'Managed Pattern',
          source: 'export function render(index) { hsv(index, 1, 1) }',
          profileSignature: 'new-signature',
        },
        {
          bindingKey: 'pat-unmanaged',
          name: 'Bound without a push record',
          source: 'export function render(index) { rgb(1, 0, 0) }',
          profileSignature: 'new-signature',
        },
      ],
    })

    expect(plan.jobs.map((job) => job.programId)).toEqual(['MANAGED1'])
    expect(plan.jobs[0]).toMatchObject({
      bindingKey: 'pat-managed',
      state: 'queued',
    })
    expect(plan.unmanaged).toEqual([
      { programId: 'NO_RECORD', bindingKey: 'pat-unmanaged', reason: 'missing-push-record' },
      { programId: 'NO_SOURCE', bindingKey: 'pat-missing', reason: 'missing-source' },
      { programId: 'FOREIGN1', reason: 'foreign' },
    ])
  })

  it('queues only managed artifacts whose generated-code signature is stale', () => {
    const plan = planControllerReconciliation({
      controllerId: 'ctrl-A',
      programs: [
        { id: 'CURRENT1', name: 'Current Pattern' },
        { id: 'STALE1', name: 'Stale Pattern' },
        { id: 'LEGACY1', name: 'Legacy managed Pattern' },
      ],
      bindings: {
        'ctrl-A': {
          'pat-current': 'CURRENT1',
          'pat-stale': 'STALE1',
          'pat-legacy': 'LEGACY1',
        },
      },
      pushRecords: {
        'ctrl-A': {
          'pat-current': pushRecord('desired-signature'),
          'pat-stale': pushRecord('old-signature'),
          'pat-legacy': pushRecord(),
        },
      },
      artifacts: ['pat-current', 'pat-stale', 'pat-legacy'].map((bindingKey) => ({
        bindingKey,
        name: bindingKey,
        source: 'export function render(index) { hsv(index, 1, 1) }',
        profileSignature: 'desired-signature',
      })),
    })

    expect(plan.current.map((artifact) => artifact.programId)).toEqual(['CURRENT1'])
    expect(plan.jobs.map((job) => job.programId)).toEqual(['STALE1', 'LEGACY1'])
    expect(plan.managedCount).toBe(3)
  })
})

describe('executeControllerReconciliation', () => {
  it('writes jobs serially, updates the active managed program last, and activates only that program', async () => {
    const jobs: ControllerReconciliationJob[] = ['A', 'ACTIVE', 'B'].map((programId) => ({
      programId,
      bindingKey: `pat-${programId}`,
      name: programId,
      source: 'export function render(index) { hsv(index, 1, 1) }',
      profileSignature: 'desired-signature',
      state: 'queued',
    }))
    const calls: Array<{ programId: string; activate: boolean }> = []
    const overwrite = vi.fn(async (job: ControllerReconciliationJob, activate: boolean) => {
      calls.push({ programId: job.programId, activate })
    })

    const result = await executeControllerReconciliation({
      jobs,
      activeProgramId: 'ACTIVE',
      overwrite,
    })

    expect(calls).toEqual([
      { programId: 'A', activate: false },
      { programId: 'B', activate: false },
      { programId: 'ACTIVE', activate: true },
    ])
    expect(result.failed).toEqual([])
    expect(result.completed.map((job) => job.programId)).toEqual(['A', 'B', 'ACTIVE'])
  })

  it('stops before the next write when reconciliation is disabled or superseded', async () => {
    const jobs: ControllerReconciliationJob[] = ['A', 'B', 'C'].map((programId) => ({
      programId,
      bindingKey: `pat-${programId}`,
      name: programId,
      source: 'export function render(index) { hsv(index, 1, 1) }',
      profileSignature: 'desired-signature',
      state: 'queued',
    }))
    let mayContinue = true
    const overwrite = vi.fn(async () => { mayContinue = false })

    const result = await executeControllerReconciliation({
      jobs,
      overwrite,
      shouldContinue: async () => mayContinue,
    })

    expect(overwrite).toHaveBeenCalledTimes(1)
    expect(result.completed.map((job) => job.programId)).toEqual(['A'])
    expect(result.stopped).toBe(true)
  })
})
