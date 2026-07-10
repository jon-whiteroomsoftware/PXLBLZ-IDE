import type { RecoveredSavedProgram } from './controllerSavedProgramRead'
import {
  createSavedProgramPatternRecord,
  decideSavedProgramImport,
  type SavedProgramImportDecision,
} from './savedProgramImport'

function recovered(
  changes: Partial<RecoveredSavedProgram> = {},
): RecoveredSavedProgram {
  return {
    programId: 'DEVICE_01',
    deviceName: 'Aurora on device',
    sourceCode: 'export function render(index) {}',
    stamp: null,
    ...changes,
  }
}

describe('decideSavedProgramImport', () => {
  it('opens the surviving Studio pattern identified by an IDE artifact stamp', () => {
    const decision = decideSavedProgramImport({
      recovered: recovered({
        stamp: {
          version: 1,
          kind: 'pattern',
          id: 'pat-1',
          name: 'Aurora Drift',
          hash: 'abc12345',
          stamped: '2026-07-09T00:00:00.000Z',
          transforms: ['power-cap'],
        },
      }),
      studioPatterns: [{ id: 'pat-1', name: 'Aurora Drift' }],
    })

    expect(decision).toEqual({
      kind: 'open-existing',
      patternId: 'pat-1',
      name: 'Aurora Drift',
    })
  })

  it('opens a surviving built-in demo through its route id', () => {
    const decision = decideSavedProgramImport({
      recovered: recovered({
        stamp: {
          version: 1,
          kind: 'pattern',
          id: 'demo:AuroraSphere',
          name: 'AuroraSphere',
          hash: 'abc12345',
          stamped: '2026-07-09T00:00:00.000Z',
          transforms: [],
        },
      }),
      studioPatterns: [{ id: 'demo:AuroraSphere', routeId: 'AuroraSphere', name: 'AuroraSphere' }],
    })

    expect(decision).toEqual({
      kind: 'open-existing',
      patternId: 'AuroraSphere',
      name: 'AuroraSphere',
    })
  })

  it('restores a deleted IDE-owned pattern from its recovered id, name, and source', () => {
    const decision = decideSavedProgramImport({
      recovered: recovered({
        sourceCode: 'export function render(index) { rgb(1, 0, 0) }',
        stamp: {
          version: 1,
          kind: 'pattern',
          id: 'pat-deleted',
          name: 'Recovered Ember',
          hash: 'abc12345',
          stamped: '2026-07-09T00:00:00.000Z',
          transforms: [],
        },
      }),
      studioPatterns: [{ id: 'pat-other', name: 'Other pattern' }],
    })

    expect(decision).toEqual({
      kind: 'create',
      ownership: 'ide-owned',
      patternId: 'pat-deleted',
      name: 'Recovered Ember',
      sourceCode: 'export function render(index) { rgb(1, 0, 0) }',
      fieldSources: { id: 'recovered', name: 'recovered', source: 'recovered' },
    })
  })

  it('imports foreign source under a new id and marks a conflict-adjusted name inferred', () => {
    const decision = decideSavedProgramImport({
      recovered: recovered(),
      studioPatterns: [{ id: 'pat-other', name: 'Aurora on device' }],
    })

    expect(decision).toEqual({
      kind: 'create',
      ownership: 'foreign',
      patternId: null,
      name: 'Aurora on device 1',
      sourceCode: 'export function render(index) {}',
      fieldSources: { id: 'new', name: 'inferred', source: 'recovered' },
    })
  })

  it('explains why sourceless and Show artifacts cannot import as Patterns', () => {
    expect(decideSavedProgramImport({
      recovered: recovered({ sourceCode: null, deviceName: 'Compiled only' }),
      studioPatterns: [],
    })).toEqual({
      kind: 'unavailable',
      name: 'Compiled only',
      reason: 'This saved program has no source code to import.',
    })

    expect(decideSavedProgramImport({
      recovered: recovered({
        stamp: {
          version: 1,
          kind: 'show',
          id: 'show-1',
          name: 'Stage loop',
          hash: 'abc12345',
          stamped: '2026-07-09T00:00:00.000Z',
          transforms: [],
        },
      }),
      studioPatterns: [],
    })).toEqual({
      kind: 'unavailable',
      name: 'Stage loop',
      reason: 'This saved artifact is a Show, not a Pattern.',
    })
  })

  it('builds a Pattern record with a recovered id or a new foreign id', () => {
    const restored: Extract<SavedProgramImportDecision, { kind: 'create' }> = {
      kind: 'create',
      ownership: 'ide-owned',
      patternId: 'pat-restored',
      name: 'Restored',
      sourceCode: 'export function render(index) {}',
      fieldSources: { id: 'recovered', name: 'recovered', source: 'recovered' },
    }
    const foreign = { ...restored, ownership: 'foreign' as const, patternId: null }

    expect(createSavedProgramPatternRecord(restored, 'new-id', 42)).toEqual({
      id: 'pat-restored',
      name: 'Restored',
      src: 'export function render(index) {}',
      controls: {},
      updatedAt: 42,
    })
    expect(createSavedProgramPatternRecord(foreign, 'new-id', 42).id).toBe('new-id')
  })
})
