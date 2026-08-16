import { describe, expect, it, vi } from 'vitest'
import type { BindingStore } from './controllerBinding'
import type { ControllerPushRecords } from './controllerPushRecord'
import { removeManagedControllerSavedProgramMetadata } from './controllerSavedProgramDeletion'

function pushRecord(name: string) {
  return {
    transforms: [],
    artifactHash: `${name}-hash`,
    stampedAt: '2026-08-16T00:00:00.000Z',
    name,
  }
}

function metadataFixture(options: { failBindings?: boolean } = {}) {
  let bindings: BindingStore = {
    'controller-a': { 'pattern-a': 'PROGRAM-A', 'pattern-sibling': 'PROGRAM-SIBLING' },
    'controller-b': { 'pattern-a': 'PROGRAM-B' },
  }
  let pushRecords: ControllerPushRecords = {
    'controller-a': {
      'pattern-a': pushRecord('Pattern A'),
      'pattern-sibling': pushRecord('Sibling'),
    },
    'controller-b': { 'pattern-a': pushRecord('Pattern B') },
  }
  const setControllerBindings = vi.fn(async (next: BindingStore) => {
    if (options.failBindings) throw new Error('binding write failed')
    bindings = next
  })
  const setPushRecords = vi.fn(async (next: ControllerPushRecords) => {
    pushRecords = next
  })
  return {
    deps: {
      getControllerBindings: async () => bindings,
      setControllerBindings,
      getPushRecords: async () => pushRecords,
      setPushRecords,
    },
    read: () => ({ bindings, pushRecords }),
    setControllerBindings,
    setPushRecords,
  }
}

describe('removeManagedControllerSavedProgramMetadata', () => {
  it('removes exactly one Controller binding and push record while preserving siblings', async () => {
    const fixture = metadataFixture()

    await expect(removeManagedControllerSavedProgramMetadata({
      controllerId: 'controller-a',
      bindingKey: 'pattern-a',
      programId: 'PROGRAM-A',
    }, fixture.deps)).resolves.toEqual({ removed: true, bindingKey: 'pattern-a' })

    expect(fixture.read()).toEqual({
      bindings: {
        'controller-a': { 'pattern-sibling': 'PROGRAM-SIBLING' },
        'controller-b': { 'pattern-a': 'PROGRAM-B' },
      },
      pushRecords: {
        'controller-a': { 'pattern-sibling': pushRecord('Sibling') },
        'controller-b': { 'pattern-a': pushRecord('Pattern B') },
      },
    })
  })

  it('does no metadata work for a foreign or no-longer-matching row', async () => {
    const fixture = metadataFixture()
    const before = fixture.read()

    await expect(removeManagedControllerSavedProgramMetadata({
      controllerId: 'controller-a',
      bindingKey: null,
      programId: 'FOREIGN',
    }, fixture.deps)).resolves.toEqual({ removed: false })
    await expect(removeManagedControllerSavedProgramMetadata({
      controllerId: 'controller-a',
      bindingKey: 'pattern-a',
      programId: 'DIFFERENT-PROGRAM',
    }, fixture.deps)).resolves.toEqual({ removed: false })

    expect(fixture.read()).toEqual(before)
    expect(fixture.setControllerBindings).not.toHaveBeenCalled()
    expect(fixture.setPushRecords).not.toHaveBeenCalled()
  })

  it('restores the push records when the binding write fails', async () => {
    const fixture = metadataFixture({ failBindings: true })
    const before = structuredClone(fixture.read())

    await expect(removeManagedControllerSavedProgramMetadata({
      controllerId: 'controller-a',
      bindingKey: 'pattern-a',
      programId: 'PROGRAM-A',
    }, fixture.deps)).rejects.toThrow('binding write failed')

    expect(fixture.read()).toEqual(before)
    expect(fixture.setPushRecords).toHaveBeenCalledTimes(2)
  })
})
