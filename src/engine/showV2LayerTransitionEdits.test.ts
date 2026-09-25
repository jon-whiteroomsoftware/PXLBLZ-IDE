import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import { frozenV1Output } from '../test/v1AuthoringOracles'
import {
  resizeShowLayerTransition,
  resetShowLayerTransitionToCut,
} from './showLayerTransitionAuthoring'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { planShowV2TransitionReset } from './showV2TransitionEditorModel'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { newPersonalContentId } from './personalContentMetadata'

function layerFixture() {
  const show = createDefaultShow('v2-layer-transition-edits', 'Layer transition edits', 1000)
  show.transitions = []
  const zoneId = show.zones[0].id
  const placement = (id: string, startMs: number, durationMs: number) => ({
    id,
    instanceId: 'instance-a',
    startMs,
    durationMs,
    view: { mirror: false, phase: 0, brightness: 1 },
  })
  const composition = {
    version: 1 as const,
    patternInstances: [{
      id: 'instance-a',
      pattern: { kind: 'stock' as const, id: 'Rings' },
      patternName: 'Rings',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    transitions: [{
      id: 'transition-b-c',
      fromPlacementId: 'clip-b',
      toPlacementId: 'clip-c',
      kind: 'crossfade' as const,
      durationMs: 1000,
      easing: { curve: 'linear' as const },
      crossfadePolicy: 'live-live' as const,
    }],
    scenes: [{
      sceneId: show.scenes[0].id,
      zones: [{
        zoneId,
        main: [
          placement('clip-a', 0, 2000),
          placement('clip-b', 2000, 2000),
          placement('clip-c', 5000, 2000),
          placement('obstruction', 9000, 1000),
        ],
        overlays: [],
      }],
    }],
  }
  return { show, composition }
}

const lookup = {
  byCellId: {},
  byPatternInstanceId: {
    'instance-a':
      'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render2D(index,x,y) { rgb(1,x,y) }',
  },
  stageDimension: 2 as const,
}

describe('v2 Layer Transition edits match v1 (#1066)', () => {
  it('resizes a Layer Transition exactly as v1 does', () => {
    const { show, composition } = layerFixture()
    const resized = frozenV1Output('showV2LayerTransitionEdits.test.ts::resizes a Layer Transition exactly as v1 does::1', () => resizeShowLayerTransition(show, composition as never, 'transition-b-c', 500))
    expect(resized).not.toBe(composition)
    const resizedShow = { ...structuredClone(show), composition: structuredClone(resized) }
    const convertedResized = convertShowRecordV1ToV2(resizedShow)
    expect(convertedResized.status).toBe('converted')
    if (convertedResized.status !== 'converted') return

    const sourceShow = { ...structuredClone(show), composition: structuredClone(composition) }
    const convertedSource = convertShowRecordV1ToV2(sourceShow as never)
    expect(convertedSource.status).toBe('converted')
    if (convertedSource.status !== 'converted') return
    const edited = editShowTransitionV2(convertedSource.record, {
      kind: 'resize-transition',
      transitionId: 'transition-b-c',
      durationMs: 500,
    })
    expect(edited.status).toBe('changed')
    if (edited.status !== 'changed') return

    expect(edited.record.composition.clips).toEqual(convertedResized.record.composition.clips)
    expect(edited.record.composition.transitions).toEqual(convertedResized.record.composition.transitions)
    expect({ ...edited.record, updatedAt: 0 }).toEqual({ ...convertedResized.record, updatedAt: 0 })

    expect(prepareShowV2ForCompile(convertedResized.record, lookup).status).toBe('ready')
    expect(prepareShowV2ForCompile(edited.record, lookup).status).toBe('ready')
  })

  it('resets a Layer Transition to Cut exactly as v1 does', () => {
    const { show, composition } = layerFixture()
    const reset = frozenV1Output('showV2LayerTransitionEdits.test.ts::resets a Layer Transition to Cut exactly as v1 does::1', () => resetShowLayerTransitionToCut(show, composition as never, 'transition-b-c'))
    expect(reset).not.toBe(composition)
    const resetShow = { ...structuredClone(show), composition: structuredClone(reset) }
    const convertedReset = convertShowRecordV1ToV2(resetShow)
    expect(convertedReset.status).toBe('converted')
    if (convertedReset.status !== 'converted') return

    const sourceShow = { ...structuredClone(show), composition: structuredClone(composition) }
    const convertedSource = convertShowRecordV1ToV2(sourceShow as never)
    expect(convertedSource.status).toBe('converted')
    if (convertedSource.status !== 'converted') return
    const plan = planShowV2TransitionReset(convertedSource.record, 'transition-b-c', newPersonalContentId)
    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready') return
    const edited = editShowTransitionV2(convertedSource.record, plan.intent)
    expect(edited.status).toBe('changed')
    if (edited.status !== 'changed') return

    expect(edited.record.composition.clips).toEqual(convertedReset.record.composition.clips)
    expect(edited.record.composition.transitions).toEqual(convertedReset.record.composition.transitions)
    expect({ ...edited.record, updatedAt: 0 }).toEqual({ ...convertedReset.record, updatedAt: 0 })

    expect(prepareShowV2ForCompile(convertedReset.record, lookup).status).toBe('ready')
    expect(prepareShowV2ForCompile(edited.record, lookup).status).toBe('ready')
  })
})
