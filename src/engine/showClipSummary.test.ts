import { describe, expect, it } from 'vitest'
import { createDefaultShow, updateShowBoundaryTransition, updateShowCellAdaptations } from './showModel'
import {
  projectCompositionShowClipSummary,
  projectGlobalShowClipSummary,
  projectShowClipTimelineSummary,
  showClipSummaryDestination,
  showClipInlineSummary,
} from './showClipSummary'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

describe('Show Clip summary', () => {
  it.each([
    ['playback', 'time-scale', { location: 'pattern', targetKey: 'speed', destinationLabel: 'Pattern Speed field' }],
    ['playback', 'stepped-clock', { location: 'pattern', targetKey: 'stutter', destinationLabel: 'Pattern Stutter control' }],
    ['controls', 'control:sliderSpeed', { location: 'pattern', targetKey: 'control:sliderSpeed', destinationLabel: 'Pattern control' }],
    ['view', 'brightness', { location: 'header', targetKey: 'brightness', destinationLabel: 'Clip header Brightness field' }],
    ['view', 'opacity', { location: 'header', targetKey: 'opacity', destinationLabel: 'Clip header Opacity field' }],
    ['view', 'mirror', { location: 'effects', targetKey: 'mirror', destinationLabel: 'Effects Mirror row' }],
    ['view', 'phase', { location: 'playback', targetKey: 'phase', destinationLabel: 'Playback Phase field' }],
    ['view', 'transform-position-x', { location: 'place', targetKey: 'transform-position-x', destinationLabel: 'Place Position X field' }],
    ['view', 'viewport', { location: 'place', targetKey: 'viewport', destinationLabel: 'Place Viewport fields' }],
    ['view', 'viewport-width', { location: 'place', targetKey: 'viewport', destinationLabel: 'Place Viewport fields' }],
    ['effects', 'effect:threshold', { location: 'effects', targetKey: 'effect:threshold', destinationLabel: 'Effects row' }],
  ] as const)('maps the %s/%s summary fact to its owning surface (#650)', (kind, itemId, expected) => {
    expect(showClipSummaryDestination(kind, itemId)).toEqual(expected)
  })

  it.each([
    ['playback', 'restart'],
    ['playback', 'time-offset'],
    ['playback', 'light-shutter'],
    ['animation', 'animation:time-scale'],
    ['view', 'unknown'],
  ] as const)('leaves %s/%s plain when the tabbed inspector has no destination (#650)', (kind, itemId) => {
    expect(showClipSummaryDestination(kind, itemId)).toBeNull()
  })

  it('projects unified Clip instance, placement, Effect, and owned animation facts (#599)', () => {
    const show = createDefaultShow('show-composition-summary', 'Composition summary', 1_000)
    const sceneId = show.scenes[0].id
    const zoneId = show.zones[0].id
    const composition = {
      version: 1 as const,
      patternInstances: [{
        id: 'instance-summary',
        pattern: { kind: 'stock' as const, id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 0.5, timeOffsetMs: 250 },
        controlTargets: { sliderAmount: 0.3 },
      }, {
        id: 'instance-unrelated',
        pattern: { kind: 'stock' as const, id: 'Comet' },
        patternName: 'Comet',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId,
        propertyTracks: [{
          id: 'track-speed',
          target: { kind: 'instance-time-scale' as const, instanceId: 'instance-summary' },
          keyframes: [
            { id: 'speed-0', timeMs: 0, value: 0.5, easing: { curve: 'linear' as const } },
            { id: 'speed-1', timeMs: 1_000, value: 1, easing: { curve: 'linear' as const } },
          ],
        }, {
          id: 'track-brightness',
          target: { kind: 'placement-view' as const, placementId: 'placement-summary', property: 'brightness' as const },
          keyframes: [
            { id: 'brightness-0', timeMs: 0, value: 0.75, easing: { curve: 'linear' as const } },
            { id: 'brightness-1', timeMs: 1_000, value: 1, easing: { curve: 'linear' as const } },
          ],
        }, {
          id: 'track-unrelated',
          target: { kind: 'placement-transform' as const, placementId: 'placement-unrelated', property: 'positionX' as const },
          keyframes: [
            { id: 'unrelated-0', timeMs: 0, value: 0, easing: { curve: 'linear' as const } },
            { id: 'unrelated-1', timeMs: 1_000, value: 1, easing: { curve: 'linear' as const } },
          ],
        }],
        zones: [{
          zoneId,
          main: [{
            id: 'placement-summary',
            instanceId: 'instance-summary',
            startMs: 0,
            durationMs: 1_000,
            view: { mirror: false, phase: 0, brightness: 0.75 },
            effects: [{ id: 'hue', kind: 'hue' as const, turns: 0.1 }],
          }, {
            id: 'placement-unrelated',
            instanceId: 'instance-unrelated',
            startMs: 2_000,
            durationMs: 1_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      }],
    }
    const clip = projectShowUnifiedTimeline(show, composition).zones[0].layers[0].clips[0]

    const summary = projectCompositionShowClipSummary(composition, clip, {
      sliderAmount: 'Amount',
    })

    expect(summary.map((section) => section.kind)).toEqual([
      'playback',
      'controls',
      'view',
      'effects',
    ])
    // Animated facts occupy the same slot as set facts: the range replaces
    // the value, the animated flag carries the cue (#666).
    expect(showClipInlineSummary(summary)).toBe(
      'Animation speed 0.5–1x · Start offset 250 ms · Amount 30% · Brightness 75–100% · Hue 0.1t',
    )
    expect(summary.find((section) => section.kind === 'playback')?.items).toContainEqual(
      expect.objectContaining({ id: 'time-scale', value: '0.5–1x', animated: true }),
    )
    expect(summary.flatMap((section) => section.items)).not.toContainEqual(
      expect.objectContaining({ id: 'transform-position-x' }),
    )
  })

  it('collects animation owned by every hidden segment of one logical Clip (#599)', () => {
    const show = createDefaultShow('show-logical-summary', 'Logical summary', 1_000)
    const zoneId = show.zones[0].id
    const composition = {
      version: 1 as const,
      patternInstances: [{
        id: 'instance-logical',
        pattern: { kind: 'stock' as const, id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, sceneIndex) => ({
        sceneId: scene.id,
        propertyTracks: sceneIndex === 1 ? [{
          id: 'track-second-segment-effect',
          target: {
            kind: 'placement-effect' as const,
            placementId: 'logical-right',
            effectId: 'hue',
            effectKind: 'hue' as const,
            parameterId: 'turns',
          },
          keyframes: [
            { id: 'hue-0', timeMs: 0, value: 0.1, easing: { curve: 'linear' as const } },
            { id: 'hue-1', timeMs: 1_000, value: 0.4, easing: { curve: 'linear' as const } },
          ],
        }] : undefined,
        zones: [{
          zoneId,
          main: [{
            id: sceneIndex === 0 ? 'logical-left' : 'logical-right',
            logicalClipId: 'logical-clip',
            instanceId: 'instance-logical',
            startMs: 0,
            durationMs: scene.durationMs,
            view: { mirror: false, phase: 0, brightness: 1 },
            effects: [{ id: 'hue', kind: 'hue' as const, turns: 0.1 }],
          }],
          overlays: [],
        }],
      })),
    }
    const clip = projectShowUnifiedTimeline(show, composition).zones[0].layers[0].clips[0]

    const summary = projectCompositionShowClipSummary(composition, clip)

    expect(clip.segmentIds).toEqual(['logical-left', 'logical-right'])
    expect(summary.find((section) => section.kind === 'effects')?.items).toContainEqual({
      id: 'effect:hue',
      label: 'Hue',
      value: '0.1–0.4t',
      timelineValue: '0.1–0.4t',
      animated: true,
    })
  })

  it('scopes instance animation to the Scenes owned by the projected Clip (#599 review)', () => {
    const show = createDefaultShow('show-scene-scoped-summary', 'Scene-scoped summary', 1_000)
    const zoneId = show.zones[0].id
    const composition = {
      version: 1 as const,
      patternInstances: [{
        id: 'instance-shared',
        pattern: { kind: 'stock' as const, id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, sceneIndex) => ({
        sceneId: scene.id,
        propertyTracks: sceneIndex === 1 ? [{
          id: 'track-second-scene-speed',
          target: { kind: 'instance-time-scale' as const, instanceId: 'instance-shared' },
          keyframes: [
            { id: 'speed-0', timeMs: 0, value: 1, easing: { curve: 'linear' as const } },
            { id: 'speed-1', timeMs: 1_000, value: 0.5, easing: { curve: 'linear' as const } },
          ],
        }] : undefined,
        zones: [{
          zoneId,
          main: [{
            id: `placement-${sceneIndex}`,
            instanceId: 'instance-shared',
            startMs: 0,
            durationMs: scene.durationMs,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      })),
    }
    const clips = projectShowUnifiedTimeline(show, composition).zones[0].layers[0].clips

    const firstSummary = projectCompositionShowClipSummary(composition, clips[0])
    const secondSummary = projectCompositionShowClipSummary(composition, clips[1])

    expect(firstSummary.flatMap((section) => section.items)).not.toContainEqual(
      expect.objectContaining({ animated: true }),
    )
    expect(secondSummary.find((section) => section.kind === 'playback')?.items).toContainEqual({
      id: 'time-scale',
      label: 'Animation speed',
      value: '0.5–1x',
      animated: true,
    })
  })

  it('shows the absolute keyframe range instead of an animated tag (#666)', () => {
    const show = createDefaultShow('show-range-summary', 'Range summary', 1_000)
    const sceneId = show.scenes[0].id
    const zoneId = show.zones[0].id
    const composition = {
      version: 1 as const,
      patternInstances: [{
        id: 'instance-range',
        pattern: { kind: 'stock' as const, id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId,
        propertyTracks: [{
          id: 'track-opacity-range',
          target: { kind: 'placement-opacity' as const, placementId: 'overlay-range' },
          keyframes: [
            { id: 'opacity-0', timeMs: 0, value: 0.65, easing: { curve: 'linear' as const } },
            { id: 'opacity-1', timeMs: 400, value: 0, easing: { curve: 'linear' as const } },
            { id: 'opacity-2', timeMs: 1_000, value: 0.3, easing: { curve: 'linear' as const } },
          ],
        }],
        zones: [{
          zoneId,
          main: [],
          overlays: [{
            id: 'overlay-range-layer',
            name: 'Overlay',
            placements: [{
              id: 'overlay-range',
              instanceId: 'instance-range',
              startMs: 0,
              durationMs: 1_000,
              opacity: 0.65,
              view: { mirror: false, phase: 0, brightness: 1 },
            }],
          }],
        }],
      }],
    }
    const clip = projectShowUnifiedTimeline(show, composition).zones[0].layers[0].clips[0]

    const summary = projectCompositionShowClipSummary(composition, clip)

    // Bounds cover every keyframe, not just the endpoints, and read min–max
    // in the same View slot the set value would occupy.
    expect(summary.find((section) => section.kind === 'view')?.items).toEqual([{
      id: 'opacity',
      label: 'Opacity',
      value: '0–65%',
      animated: true,
    }])
    expect(summary.find((section) => section.kind === 'animation')).toBeUndefined()
  })

  it('collapses a flat animated track to its single value (#666)', () => {
    const show = createDefaultShow('show-flat-range-summary', 'Flat range summary', 1_000)
    const sceneId = show.scenes[0].id
    const zoneId = show.zones[0].id
    const composition = {
      version: 1 as const,
      patternInstances: [{
        id: 'instance-flat',
        pattern: { kind: 'stock' as const, id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId,
        propertyTracks: [{
          id: 'track-brightness-flat',
          target: { kind: 'placement-view' as const, placementId: 'placement-flat', property: 'brightness' as const },
          keyframes: [
            { id: 'flat-0', timeMs: 0, value: 0.5, easing: { curve: 'linear' as const } },
            { id: 'flat-1', timeMs: 1_000, value: 0.5, easing: { curve: 'linear' as const } },
          ],
        }],
        zones: [{
          zoneId,
          main: [{
            id: 'placement-flat',
            instanceId: 'instance-flat',
            startMs: 0,
            durationMs: 1_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      }],
    }
    const clip = projectShowUnifiedTimeline(show, composition).zones[0].layers[0].clips[0]

    const summary = projectCompositionShowClipSummary(composition, clip)

    expect(summary.find((section) => section.kind === 'view')?.items).toEqual([{
      id: 'brightness',
      label: 'Brightness',
      value: '50%',
      animated: true,
    }])
  })

  it('keeps a newly animated flat value visible after an identical set value (#666 review)', () => {
    const previous = [{
      kind: 'view' as const,
      label: 'View',
      items: [{ id: 'brightness', label: 'Brightness', value: '50%' }],
    }]
    const current = [{
      kind: 'view' as const,
      label: 'View',
      items: [{ id: 'brightness', label: 'Brightness', value: '50%', animated: true }],
    }]

    expect(projectShowClipTimelineSummary(current, previous)[0].items[0].showValue).toBe(true)
    expect(projectShowClipTimelineSummary(previous, current)[0].items[0].showValue).toBe(true)
    expect(projectShowClipTimelineSummary(current, current)[0].items[0].showValue).toBe(false)
  })

  it('keeps default-valued Effects silent on the Clip row (#666 review)', () => {
    const show = createDefaultShow('show-default-effect-summary', 'Default effect summary', 1_000)
    show.cells[0].effects = [
      { id: 'hue', kind: 'hue', turns: 0 },
      { id: 'ripple', kind: 'ripple', amount: 0, frequency: 8, phase: 0, centerX: 0.5, centerY: 0.5 },
    ]

    const effects = projectGlobalShowClipSummary(show, show.cells[0].id)
      .find((section) => section.kind === 'effects')?.items

    // The Detail summary keeps the complete values; the Clip row contracts
    // an all-default Effect to its section glyph alone.
    expect(effects).toEqual([
      expect.objectContaining({ label: 'Hue', value: '0t', timelineValue: '' }),
      expect.objectContaining({ label: 'Ripple', timelineValue: '' }),
    ])
  })

  it('merges range bounds across every segment of one logical Clip (#666)', () => {
    const show = createDefaultShow('show-merged-range-summary', 'Merged range summary', 1_000)
    const zoneId = show.zones[0].id
    const composition = {
      version: 1 as const,
      patternInstances: [{
        id: 'instance-merged',
        pattern: { kind: 'stock' as const, id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, sceneIndex) => ({
        sceneId: scene.id,
        propertyTracks: [{
          id: `track-merged-${sceneIndex}`,
          target: {
            kind: 'placement-opacity' as const,
            placementId: sceneIndex === 0 ? 'merged-left' : 'merged-right',
          },
          keyframes: sceneIndex === 0
            ? [
                { id: 'left-0', timeMs: 0, value: 0, easing: { curve: 'linear' as const } },
                { id: 'left-1', timeMs: scene.durationMs, value: 0.2, easing: { curve: 'linear' as const } },
              ]
            : [
                { id: 'right-0', timeMs: 0, value: 0.5, easing: { curve: 'linear' as const } },
                { id: 'right-1', timeMs: scene.durationMs, value: 0.65, easing: { curve: 'linear' as const } },
              ],
        }],
        zones: [{
          zoneId,
          main: [],
          overlays: [{
            id: `overlay-merged-${sceneIndex}`,
            name: 'Overlay',
            placements: [{
              id: sceneIndex === 0 ? 'merged-left' : 'merged-right',
              logicalClipId: 'merged-clip',
              instanceId: 'instance-merged',
              startMs: 0,
              durationMs: scene.durationMs,
              opacity: 0.5,
              view: { mirror: false, phase: 0, brightness: 1 },
            }],
          }],
        }],
      })),
    }
    const clip = projectShowUnifiedTimeline(show, composition).zones[0].layers[0].clips[0]

    const summary = projectCompositionShowClipSummary(composition, clip)

    expect(clip.segmentIds).toEqual(['merged-left', 'merged-right'])
    expect(summary.find((section) => section.kind === 'view')?.items).toEqual([{
      id: 'opacity',
      label: 'Opacity',
      value: '0–65%',
      animated: true,
    }])
  })

  it('formats each animated property range in its native domain unit (#666)', () => {
    const show = createDefaultShow('show-unit-range-summary', 'Unit range summary', 1_000)
    const sceneId = show.scenes[0].id
    const zoneId = show.zones[0].id
    const composition = {
      version: 1 as const,
      patternInstances: [{
        id: 'instance-units',
        pattern: { kind: 'stock' as const, id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
        controlTargets: { sliderAmount: 0.1 },
      }],
      scenes: [{
        sceneId,
        propertyTracks: [{
          id: 'track-rotation',
          target: { kind: 'placement-transform' as const, placementId: 'placement-units', property: 'rotation' as const },
          keyframes: [
            { id: 'rotation-0', timeMs: 0, value: -0.25, easing: { curve: 'linear' as const } },
            { id: 'rotation-1', timeMs: 1_000, value: 0.25, easing: { curve: 'linear' as const } },
          ],
        }, {
          id: 'track-scale-x',
          target: { kind: 'placement-transform' as const, placementId: 'placement-units', property: 'scaleX' as const },
          keyframes: [
            { id: 'scale-0', timeMs: 0, value: 0.5, easing: { curve: 'linear' as const } },
            { id: 'scale-1', timeMs: 1_000, value: 2.507072, easing: { curve: 'linear' as const } },
          ],
        }, {
          id: 'track-viewport-width',
          target: { kind: 'placement-viewport' as const, placementId: 'placement-units', property: 'width' as const },
          keyframes: [
            { id: 'width-0', timeMs: 0, value: 1, easing: { curve: 'linear' as const } },
            { id: 'width-1', timeMs: 1_000, value: 2, easing: { curve: 'linear' as const } },
          ],
        }, {
          id: 'track-phase',
          target: { kind: 'placement-view' as const, placementId: 'placement-units', property: 'phase' as const },
          keyframes: [
            { id: 'phase-0', timeMs: 0, value: 0, easing: { curve: 'linear' as const } },
            { id: 'phase-1', timeMs: 1_000, value: 0.5, easing: { curve: 'linear' as const } },
          ],
        }, {
          id: 'track-control',
          target: { kind: 'instance-control' as const, instanceId: 'instance-units', exportName: 'sliderAmount' },
          keyframes: [
            { id: 'control-0', timeMs: 0, value: 0.1, easing: { curve: 'linear' as const } },
            { id: 'control-1', timeMs: 1_000, value: 0.8, easing: { curve: 'linear' as const } },
          ],
        }],
        zones: [{
          zoneId,
          main: [{
            id: 'placement-units',
            instanceId: 'instance-units',
            startMs: 0,
            durationMs: 1_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      }],
    }
    const clip = projectShowUnifiedTimeline(show, composition).zones[0].layers[0].clips[0]

    const summary = projectCompositionShowClipSummary(composition, clip, { sliderAmount: 'Amount' })

    expect(summary.find((section) => section.kind === 'view')?.items).toEqual([
      { id: 'transform-rotation', label: 'Rotation', value: '-90–90°', animated: true },
      { id: 'transform-scale-x', label: 'Scale X', value: '0.5–2.51x', animated: true },
      { id: 'viewport-width', label: 'Viewport Width', value: '1–2', timelineValue: 'w 1–2', animated: true },
      { id: 'phase', label: 'Phase', value: '0–0.5', animated: true },
    ])
    expect(summary.find((section) => section.kind === 'controls')?.items).toEqual([
      { id: 'control:sliderAmount', label: 'Amount', value: '10–80%', animated: true },
    ])

    // The Clip row alone drops leading zeros; full values stay in the model.
    const timeline = projectShowClipTimelineSummary(summary, null)
    expect(timeline.flatMap((section) => section.items.map((item) => item.displayValue))).toEqual([
      '10–80%',
      '-90–90°',
      '.5–2.51×1x',
      'w 1–2',
      '0–.5',
    ])
  })

  it('includes static overlay opacity and Viewport configuration (#599 review)', () => {
    const show = createDefaultShow('show-placement-summary', 'Placement summary', 1_000)
    const sceneId = show.scenes[0].id
    const zoneId = show.zones[0].id
    const composition = {
      version: 1 as const,
      patternInstances: [{
        id: 'instance-placement',
        pattern: { kind: 'stock' as const, id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId,
        zones: [{
          zoneId,
          main: [],
          overlays: [{
            id: 'overlay-placement',
            name: 'Overlay',
            placements: [{
              id: 'placement-configured',
              instanceId: 'instance-placement',
              startMs: 0,
              durationMs: 1_000,
              opacity: 0.25,
              view: { mirror: false, phase: 0, brightness: 1 },
              viewport: { enabled: true, x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
            }],
          }],
        }],
      }],
    }
    const clip = projectShowUnifiedTimeline(show, composition).zones[0].layers[0].clips[0]

    const summary = projectCompositionShowClipSummary(composition, clip)

    expect(showClipInlineSummary(summary)).toBe(
      'Opacity 25% · Viewport On · x 0.1, y 0.2, 0.6 × 0.5',
    )
  })

  it('separates static playback, Pattern controls, view, Effects, and animation facts', () => {
    let show = createDefaultShow('show-clip-summary', 'Clip summary', 1_000)
    const cellId = show.cells[0].id
    show = updateShowCellAdaptations(show, cellId, { timeScale: 0.35, brightness: 0.8 })
    show.cells[0] = {
      ...show.cells[0],
      controlTargets: { sliderSpeed: 0.28, sliderSharpness: 0.42 },
      effects: [
        { id: 'scale', kind: 'scale', x: 0.8, y: 0.8 },
        { id: 'hue', kind: 'hue', turns: 0.1 },
      ],
    }
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        timeScale: { fromByCellId: { [cellId]: 0.7 }, durationMs: 1_000 },
      },
    })

    const summary = projectGlobalShowClipSummary(show, cellId, {
      sliderSpeed: 'Speed',
      sliderSharpness: 'Sharpness',
    })

    expect(summary.map((section) => section.kind)).toEqual([
      'playback',
      'controls',
      'view',
      'effects',
      'animation',
    ])
    expect(summary.find((section) => section.kind === 'playback')?.items).toContainEqual(
      expect.objectContaining({ label: 'Animation speed', value: '0.35x' }),
    )
    expect(summary.find((section) => section.kind === 'controls')?.items).toEqual([
      expect.objectContaining({ label: 'Speed', value: '28%' }),
      expect.objectContaining({ label: 'Sharpness', value: '42%' }),
    ])
    expect(summary.find((section) => section.kind === 'view')?.items).toContainEqual(
      expect.objectContaining({ label: 'Brightness', value: '80%' }),
    )
    expect(summary.find((section) => section.kind === 'effects')?.items.map((item) => item.label)).toEqual([
      'Scale',
      'Hue',
    ])
    expect(summary.find((section) => section.kind === 'animation')?.items).toContainEqual(
      expect.objectContaining({ label: 'Animation speed', value: 'animated' }),
    )
    expect(showClipInlineSummary(summary)).toBe(
      'Animation speed 0.35x · Speed 28% · Sharpness 42% · Brightness 80% · Scale X 0.8x, Y 0.8x · Hue 0.1t · Animation speed animated',
    )
  })

  it('returns a quiet defaults label when the Clip has no authored modifications', () => {
    const show = createDefaultShow('show-default-clip-summary', 'Default Clip summary', 1_000)
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)

    expect(summary).toEqual([])
    expect(showClipInlineSummary(summary)).toBe('defaults')
  })

  it('compacts high-precision animation speed without mutating the stored value', () => {
    const show = createDefaultShow('show-speed-summary-precision', 'Speed summary precision', 1_000)
    show.cells[0].adaptations.timeScale = 2.507072

    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)
    const speed = summary.find((section) => section.kind === 'playback')?.items[0]

    expect(speed).toEqual(expect.objectContaining({ label: 'Animation speed', value: '2.51x' }))
    expect(show.cells[0].adaptations.timeScale).toBe(2.507072)
  })

  it('formats explicitly classified Effect scalars in their authored domain units', () => {
    const show = createDefaultShow('show-effect-percent-summary', 'Effect percentages', 1_000)
    show.cells[0].effects = [
      { id: 'fade', kind: 'opacity', opacity: 0.25 },
      { id: 'hue', kind: 'hue', turns: 0.1 },
      { id: 'size', kind: 'scale', x: 2.507072, y: 0.75 },
      {
        id: 'edge', kind: 'vignette', amount: 1, radius: 0.35, softness: 0.35,
        centerX: 0.5, centerY: 0.5, aspect: 16 / 9,
      },
    ]

    const effects = projectGlobalShowClipSummary(show, show.cells[0].id)
      .find((section) => section.kind === 'effects')?.items

    expect(effects).toEqual([
      expect.objectContaining({ label: 'Opacity', value: '25%' }),
      expect.objectContaining({ label: 'Hue', value: '0.1t' }),
      expect.objectContaining({
        label: 'Scale',
        value: 'X 2.51x, Y 0.75x',
        // The Clip row shows values only; names live in Clip Detail (#63).
        timelineValue: '2.51x / 0.75x',
      }),
      expect.objectContaining({ label: 'Vignette', value: expect.stringContaining('Aspect 16:9') }),
    ])
  })

  it('summarizes canonical Transform placement and animation separately from Effects (#529)', () => {
    let show = createDefaultShow('show-transform-summary', 'Transform summary', 1_000)
    const cellId = show.cells[1].id
    show.cells[1] = {
      ...show.cells[1],
      transform: { positionX: 0.25, positionY: 0, rotation: 0.25, scaleX: 2.507072, scaleY: 1 },
    }
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        transform: { positionX: { fromByCellId: { [cellId]: 0 } } },
      },
    })

    const summary = projectGlobalShowClipSummary(show, cellId)
    expect(summary.find((section) => section.kind === 'view')?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Position X', value: '0.25' }),
      expect.objectContaining({ label: 'Rotation', value: '90°' }),
      expect.objectContaining({ label: 'Scale X', value: '2.51x' }),
    ]))
    expect(summary.find((section) => section.kind === 'animation')?.items).toContainEqual(
      expect.objectContaining({ label: 'Position X', value: 'animated' }),
    )
  })

  it('shows timeline values only when a fact is introduced or changes from the preceding Clip (#548)', () => {
    let show = createDefaultShow('show-clip-summary-deltas', 'Clip summary deltas', 1_000)
    show = updateShowCellAdaptations(show, show.cells[0].id, { timeScale: 0.35, brightness: 0.8 })
    show = updateShowCellAdaptations(show, show.cells[1].id, { timeScale: 0.35, brightness: 0.8 })
    const first = projectGlobalShowClipSummary(show, show.cells[0].id)
    const unchanged = projectGlobalShowClipSummary(show, show.cells[1].id)

    expect(projectShowClipTimelineSummary(first, null).flatMap((section) => section.items)).toEqual([
      expect.objectContaining({ id: 'time-scale', value: '0.35x', showValue: true }),
      expect.objectContaining({ id: 'brightness', value: '80%', showValue: true }),
    ])
    expect(projectShowClipTimelineSummary(unchanged, first).flatMap((section) => section.items)).toEqual([
      expect.objectContaining({ id: 'time-scale', showValue: false }),
      expect.objectContaining({ id: 'brightness', showValue: false }),
    ])

    show = updateShowCellAdaptations(show, show.cells[1].id, { timeScale: 0.5 })
    const changed = projectGlobalShowClipSummary(show, show.cells[1].id)
    expect(projectShowClipTimelineSummary(changed, first).flatMap((section) => section.items)).toEqual([
      expect.objectContaining({ id: 'time-scale', value: '0.5x', showValue: true }),
      expect.objectContaining({ id: 'brightness', value: '80%', showValue: false }),
    ])
  })

  it('contracts multi-parameter Effect values without changing the complete summary (#548)', () => {
    const show = createDefaultShow('show-clip-summary-effect-contract', 'Effect contractions', 1_000)
    show.cells[0] = {
      ...show.cells[0],
      effects: [{
        id: 'ripple',
        kind: 'ripple',
        amount: 0.32,
        frequency: 4,
        phase: 0,
        centerX: 0.5,
        centerY: 0.5,
      }],
    }
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)
    const effect = summary.find((section) => section.kind === 'effects')?.items[0]
    const timelineEffect = projectShowClipTimelineSummary(summary, null)
      .find((section) => section.kind === 'effects')?.items[0]

    expect(effect?.value).toBe('Amount 0.32, Frequency 4, Phase 0t, Center X 0.5, Center Y 0.5')
    // The Clip row keeps only parameters authored away from their defaults,
    // as values only - names live in Clip Detail (#666, #63).
    expect(timelineEffect?.displayValue).toBe('.32 / 4')
  })
  it('pairs Transform axes on the Clip row under one glyph (#63)', () => {
    const show = createDefaultShow('show-clip-summary-pairs', 'Clip summary pairs', 1_000)
    show.cells[0] = {
      ...show.cells[0],
      transform: { positionX: -0.25, positionY: 0.25, rotation: 0.125, scaleX: 0.5, scaleY: 0.5 },
    }
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)
    const view = projectShowClipTimelineSummary(summary, null).find((section) => section.kind === 'view')

    expect(view?.items.map((item) => [item.id, item.displayValue, item.glyph])).toEqual([
      ['transform-position', '-.25,.25', 'move'],
      ['transform-rotation', '45°', 'rotate'],
      ['transform-scale', '.5x', 'scale'],
    ])
    // Clip Detail and the tooltip keep every axis as its own fact.
    expect(showClipInlineSummary(summary)).toBe(
      'Position X -0.25 · Position Y 0.25 · Rotation 45° · Scale X 0.5x · Scale Y 0.5x',
    )
  })

  it('keeps both axes in a pair when only one is authored or they differ (#63)', () => {
    const show = createDefaultShow('show-clip-summary-pair-axes', 'Clip summary pair axes', 1_000)
    show.cells[0] = {
      ...show.cells[0],
      transform: { positionX: 0, positionY: 0.25, rotation: 0, scaleX: 0.5, scaleY: 0.75 },
    }
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)
    const view = projectShowClipTimelineSummary(summary, null).find((section) => section.kind === 'view')

    expect(view?.items.map((item) => [item.id, item.displayValue])).toEqual([
      ['transform-position', '0,.25'],
      ['transform-scale', '.5×.75x'],
    ])
  })

  it('shows a pair when either axis changes from the preceding Clip (#63)', () => {
    const show = createDefaultShow('show-clip-summary-pair-delta', 'Clip summary pair delta', 1_000)
    show.cells[0] = { ...show.cells[0], transform: { positionX: 0.1, positionY: 0.2, rotation: 0, scaleX: 1, scaleY: 1 } }
    show.cells[1] = { ...show.cells[1], transform: { positionX: 0.1, positionY: 0.3, rotation: 0, scaleX: 1, scaleY: 1 } }
    const first = projectGlobalShowClipSummary(show, show.cells[0].id)
    const second = projectGlobalShowClipSummary(show, show.cells[1].id)

    const unchanged = projectShowClipTimelineSummary(first, first).find((section) => section.kind === 'view')
    expect(unchanged?.items[0]).toEqual(expect.objectContaining({ id: 'transform-position', showValue: false }))
    const changed = projectShowClipTimelineSummary(second, first).find((section) => section.kind === 'view')
    expect(changed?.items[0]).toEqual(expect.objectContaining({ id: 'transform-position', displayValue: '.1,.3', showValue: true }))
  })

  it('renders the Viewport as an origin pair and size, or off (#63)', () => {
    const show = createDefaultShow('show-clip-summary-viewport', 'Clip summary viewport', 1_000)
    show.cells[0] = { ...show.cells[0], viewport: { enabled: true, x: 0, y: 0.5, width: 0.25, height: 0.5 } }
    show.cells[1] = { ...show.cells[1], viewport: { enabled: false, x: 0, y: 0.5, width: 0.25, height: 0.5 } }
    const on = projectShowClipTimelineSummary(projectGlobalShowClipSummary(show, show.cells[0].id), null)
      .find((section) => section.kind === 'view')?.items[0]
    const off = projectShowClipTimelineSummary(projectGlobalShowClipSummary(show, show.cells[1].id), null)
      .find((section) => section.kind === 'view')?.items[0]

    expect(on).toEqual(expect.objectContaining({ id: 'viewport', displayValue: '0,.5 .25×.5', glyph: 'viewport' }))
    expect(off).toEqual(expect.objectContaining({ id: 'viewport', displayValue: 'off', glyph: 'viewport-off' }))
  })

  it('assigns Clip row glyphs per fact family and leaves boolean facts glyph-only (#63)', () => {
    let show = createDefaultShow('show-clip-summary-glyphs', 'Clip summary glyphs', 1_000)
    show = updateShowCellAdaptations(show, show.cells[0].id, { timeScale: 1.5, brightness: 0.8, mirror: true })
    show.cells[0] = { ...show.cells[0], controlTargets: { sliderSpeed: 0.4, sliderWidth: 0.75 } }
    const items = projectShowClipTimelineSummary(projectGlobalShowClipSummary(show, show.cells[0].id), null)
      .flatMap((section) => section.items)

    expect(items.map((item) => [item.id, item.displayValue, item.glyph])).toEqual([
      ['time-scale', '1.5x', 'clock'],
      ['control:sliderSpeed', '40%', 'controls'],
      ['control:sliderWidth', '75%', 'controls'],
      ['brightness', '80%', 'sun'],
      ['mirror', '', 'mirror'],
    ])
  })
})
