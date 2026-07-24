import { describe, expect, it } from 'vitest'
import { createDefaultShow } from '@/engine/showModel'
import type {
  ShowCompositionV1,
  ShowPatternInstance,
} from '@/engine/personalContentRecords'
import { expectAcceptedShowAuthoringEdit } from './showAuthoringContract'

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

describe('Show authoring edit contract harness (#595)', () => {
  it('detects input mutation even when an edit returns a distinct valid result', () => {
    const show = createDefaultShow('show-contract-mutation', 'Contract mutation', 1_000)
    const composition = compositionWithClip(show)

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit: (input) => {
        input.patternInstances[0].patternName = 'Mutated input'
        return structuredClone(input)
      },
    })).toThrow()
  })

  it('detects structurally invalid accepted output', () => {
    const show = createDefaultShow('show-contract-invalid', 'Contract invalid', 1_000)
    const composition = compositionWithClip(show)

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit: (input) => {
        const result = structuredClone(input)
        result.scenes[0].zones[0].main[0].durationMs = 0
        return result
      },
    })).toThrow()
  })

  it('detects an orphaned durable reference', () => {
    const show = createDefaultShow('show-contract-orphan', 'Contract orphan', 1_000)
    const composition = compositionWithClip(show)

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit: (input) => {
        const result = structuredClone(input)
        result.scenes[0].zones[0].main[0].instanceId = 'missing-instance'
        return result
      },
    })).toThrow()
  })

  it('runs the operation-specific unified projection oracle', () => {
    const show = createDefaultShow('show-contract-projection', 'Contract projection', 1_000)
    const composition = compositionWithClip(show)

    expect(() => expectAcceptedShowAuthoringEdit({
      show,
      composition,
      edit: (input) => {
        const result = structuredClone(input)
        result.scenes[0].zones[0].main[0].startMs = 2_000
        return result
      },
      assertProjection: (projection) => {
        expect(projection.zones[0].layers[0].clips[0].startMs).toBe(3_000)
      },
    })).toThrow()
  })
})
