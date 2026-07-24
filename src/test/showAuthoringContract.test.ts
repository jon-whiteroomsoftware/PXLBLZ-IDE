import { describe, expect, it, vi } from 'vitest'
import { createDefaultShow } from '@/engine/showModel'
import type {
  ShowCompositionV1,
  ShowPatternInstance,
} from '@/engine/personalContentRecords'
import type { ShowUnifiedTimelineProjection } from '@/engine/showUnifiedTimelineProjection'
import {
  expectAcceptedShowAuthoringEdit,
  expectRefusedShowAuthoringEdit,
} from './showAuthoringContract'

const instance: ShowPatternInstance = {
  id: 'instance-contract',
  pattern: { kind: 'user', id: 'pattern-contract' },
  patternName: 'Contract Pattern',
  time: { timeScale: 1, timeOffsetMs: 0 },
}

function compositionWithClip(
  show: ReturnType<typeof createDefaultShow>,
): ShowCompositionV1 {
  return {
    version: 1,
    patternInstances: [structuredClone(instance)],
    scenes: show.scenes.map((scene, index) => ({
      sceneId: scene.id,
      zones: show.zones.map((zone) => ({
        zoneId: zone.id,
        main: index === 0
          ? [{
              id: 'placement-contract',
              instanceId: instance.id,
              startMs: 1_000,
              durationMs: 4_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            }]
          : [],
        overlays: [],
      })),
    })),
  }
}

function acceptedOracles(
  expectedStartMs: number,
  expectedPatternName = instance.patternName,
) {
  return {
    assertProjection: vi.fn((projection: ShowUnifiedTimelineProjection) => {
      expect(projection.zones[0].layers[0].clips[0].startMs).toBe(expectedStartMs)
    }),
    assertReferences: vi.fn((result: ShowCompositionV1) => {
      expect(result.patternInstances[0].patternName).toBe(expectedPatternName)
      expect(result.scenes[0].zones[0].main[0].instanceId).toBe(instance.id)
    }),
  }
}

describe('Show authoring edit contract harness (#595)', () => {
  it('accepts a valid edit after running projection and reference oracles', () => {
    const show = createDefaultShow('show-contract-accepted', 'Contract accepted', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => {
      const result = structuredClone(input)
      result.scenes[0].zones[0].main[0].startMs = 2_000
      return result
    })
    const oracles = acceptedOracles(2_000)

    const result = expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit,
      ...oracles,
    })

    expect(result.scenes[0].zones[0].main[0].startMs).toBe(2_000)
    expect(edit).toHaveBeenCalledOnce()
    expect(oracles.assertProjection).toHaveBeenCalledOnce()
    expect(oracles.assertReferences).toHaveBeenCalledOnce()
  })

  it('detects mutation of the Show that supplies the authoring timeline', () => {
    const show = createDefaultShow('show-contract-show-mutation', 'Contract Show mutation', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => {
      show.scenes[0].durationMs += 1
      return structuredClone(input)
    })

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit,
      ...acceptedOracles(1_000),
    })).toThrow()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('detects input mutation even when an edit returns a distinct valid result', () => {
    const show = createDefaultShow('show-contract-mutation', 'Contract mutation', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => {
      input.patternInstances[0].patternName = 'Mutated input'
      return structuredClone(input)
    })

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit,
      ...acceptedOracles(1_000, 'Mutated input'),
    })).toThrow()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('requires an accepted edit to return a distinct composition', () => {
    const show = createDefaultShow('show-contract-distinct', 'Contract distinct', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => input)

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit,
      ...acceptedOracles(1_000),
    })).toThrow()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('detects structurally invalid accepted output', () => {
    const show = createDefaultShow('show-contract-invalid', 'Contract invalid', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => {
      const result = structuredClone(input)
      result.scenes[0].zones[0].main[0].durationMs = 0
      return result
    })

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit,
      ...acceptedOracles(1_000),
    })).toThrow()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('detects an orphaned durable reference', () => {
    const show = createDefaultShow('show-contract-orphan', 'Contract orphan', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => {
      const result = structuredClone(input)
      result.scenes[0].zones[0].main[0].instanceId = 'missing-instance'
      return result
    })

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit,
      ...acceptedOracles(1_000),
    })).toThrow()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('runs the operation-specific unified projection oracle', () => {
    const show = createDefaultShow('show-contract-projection', 'Contract projection', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => {
      const result = structuredClone(input)
      result.scenes[0].zones[0].main[0].startMs = 2_000
      return result
    })
    const assertProjection = vi.fn((projection: ShowUnifiedTimelineProjection) => {
      expect(projection.zones[0].layers[0].clips[0].startMs).toBe(3_000)
    })

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit,
      assertProjection,
      assertReferences: acceptedOracles(2_000).assertReferences,
    })).toThrow()
    expect(edit).toHaveBeenCalledOnce()
    expect(assertProjection).toHaveBeenCalledOnce()
  })

  it('runs the operation-specific durable-reference oracle', () => {
    const show = createDefaultShow('show-contract-references', 'Contract references', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => structuredClone(input))
    const assertReferences = vi.fn((result: ShowCompositionV1) => {
      expect(result.patternInstances[0].id).toBe('missing-instance')
    })

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit,
      assertProjection: acceptedOracles(1_000).assertProjection,
      assertReferences,
    })).toThrow()
    expect(edit).toHaveBeenCalledOnce()
    expect(assertReferences).toHaveBeenCalledOnce()
  })

  it('accepts a refused edit only when it returns the unchanged composition', () => {
    const show = createDefaultShow('show-contract-refused', 'Contract refused', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => input)

    const result = expectRefusedShowAuthoringEdit({
      show,
      composition,
      edit,
    })

    expect(result).toBe(composition)
    expect(edit).toHaveBeenCalledOnce()
  })

  it('detects a refused edit that returns a distinct composition', () => {
    const show = createDefaultShow('show-contract-refused-copy', 'Contract refused copy', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => structuredClone(input))

    expect(() => expectRefusedShowAuthoringEdit({
      show,
      composition,
      edit,
    })).toThrow()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('detects composition mutation during a refused edit', () => {
    const show = createDefaultShow('show-contract-refused-mutation', 'Contract refused mutation', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => {
      input.patternInstances[0].patternName = 'Mutated refused input'
      return input
    })

    expect(() => expectRefusedShowAuthoringEdit({
      show,
      composition,
      edit,
    })).toThrow()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('detects Show mutation during a refused edit', () => {
    const show = createDefaultShow('show-contract-refused-show', 'Contract refused Show', 1_000)
    const composition = compositionWithClip(show)
    const edit = vi.fn((input: ShowCompositionV1) => {
      show.scenes[0].durationMs += 1
      return input
    })

    expect(() => expectRefusedShowAuthoringEdit({
      show,
      composition,
      edit,
    })).toThrow()
    expect(edit).toHaveBeenCalledOnce()
  })
})
