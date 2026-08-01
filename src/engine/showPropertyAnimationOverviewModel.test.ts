import { describe, expect, it } from 'vitest'
import type {
  ShowPropertyAnimationTrack,
} from './personalContentRecords'
import type { ShowPropertyAnimationValidationCode } from './showPropertyAnimation'
import {
  projectShowPropertyAnimationOverview,
  type ShowPropertyAnimationEditorContext,
  type ShowPropertyAnimationOption,
} from './showPropertyAnimationEditorModel'

const brightness: ShowPropertyAnimationOption = {
  key: 'placement-view:placement-1:brightness',
  label: 'Brightness',
  target: { kind: 'placement-view', placementId: 'placement-1', property: 'brightness' },
  value: 1,
  min: 0,
  max: 1,
  step: 0.01,
  presentation: 'percentage',
}

const speed: ShowPropertyAnimationOption = {
  key: 'instance-time-scale:instance-1',
  label: 'Animation speed',
  target: { kind: 'instance-time-scale', instanceId: 'instance-1' },
  value: 1,
  min: 0,
  max: 4,
  step: 0.01,
  presentation: 'multiplier',
}

function track(
  id: string,
  target: ShowPropertyAnimationTrack['target'],
  values: number[] = [0.25, 0.75],
): ShowPropertyAnimationTrack {
  return {
    id,
    target,
    keyframes: values.map((value, index) => ({
      id: `${id}-${index}`,
      timeMs: index * 1_000,
      value,
      easing: { curve: 'linear' },
    })),
  }
}

function context(
  tracks: ShowPropertyAnimationTrack[],
  trackIssues: ShowPropertyAnimationEditorContext['trackIssues'] = {},
): ShowPropertyAnimationEditorContext {
  return {
    storageOwner: { kind: 'scene', sceneId: 'scene-1' },
    tracks,
    trackIssues,
    storageDurationMs: 4_000,
    showTimeOffsetMs: 12_000,
    instanceUseCount: 3,
  }
}

describe('Property animation overview projection (#649)', () => {
  it('groups placement and shared-instance tracks with field locations and Show-global ranges', () => {
    const rows = projectShowPropertyAnimationOverview(
      context([
        track('brightness', brightness.target),
        track('speed', speed.target, [1, 2]),
      ]),
      [brightness, speed],
    )

    expect(rows).toEqual([
      expect.objectContaining({
        trackId: 'brightness',
        group: 'placement',
        label: 'Brightness',
        valueRange: '25% → 75%',
        timeRange: '12s → 13s',
        fieldLocation: 'header',
        orphaned: false,
        keyframeCount: 2,
      }),
      expect.objectContaining({
        trackId: 'speed',
        group: 'instance',
        label: 'Animation speed',
        valueRange: '1x → 2x',
        timeRange: '12s → 13s',
        fieldLocation: 'pattern',
        linkedClipCount: 3,
      }),
    ])
  })

  it.each([
    'missing-instance',
    'missing-control',
    'missing-placement',
    'missing-effect',
    'effect-identity-mismatch',
    'missing-effect-parameter',
  ] satisfies ShowPropertyAnimationValidationCode[])(
    'surfaces the %s validator outcome as a removable orphan',
    (code) => {
      const orphan = track('orphan', {
        kind: 'placement-effect',
        placementId: 'placement-1',
        effectId: 'missing-effect',
        effectKind: 'brightness',
        parameterId: 'amount',
      })
      const rows = projectShowPropertyAnimationOverview(context([orphan], {
        orphan: [{
          path: 'scenes[0].propertyTracks[0].target',
          code,
          message: `Fixture ${code}`,
        }],
      }), [])

      expect(rows[0]).toMatchObject({
        trackId: 'orphan',
        orphaned: true,
        orphanCode: code,
        orphanMessage: `Fixture ${code}`,
        removable: true,
        fieldLocation: null,
      })
    },
  )

  it('summarizes all three keyframes without rewriting or truncating the stored track', () => {
    const authored = track('three-point', brightness.target, [0.1, 0.5, 0.9])
    const before = structuredClone(authored)

    const [row] = projectShowPropertyAnimationOverview(context([authored]), [brightness])

    // Multi-keyframe tracks are ordinary editable tracks (#363), and the
    // summary carries every value because a curve's meaning often lives in
    // its middle.
    expect(row).toMatchObject({
      trackId: 'three-point',
      keyframeCount: 3,
      readOnly: false,
      valueRange: '10% → 50% → 90%',
      timeRange: '12s → 14s',
    })
    expect(authored).toEqual(before)
  })
})
