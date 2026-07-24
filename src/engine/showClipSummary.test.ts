import { describe, expect, it } from 'vitest'
import { createDefaultShow, updateShowBoundaryTransition, updateShowCellAdaptations } from './showModel'
import {
  projectCompositionShowClipSummary,
  projectGlobalShowClipSummary,
  projectShowClipTimelineSummary,
  showClipInlineSummary,
} from './showClipSummary'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

describe('Show Clip summary', () => {
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
      'animation',
    ])
    expect(showClipInlineSummary(summary)).toBe(
      'Animation speed 0.5x · Start offset 250 ms · Amount 30% · Brightness 75% · Hue 0.1 turn · Animation speed animated · Brightness animated',
    )
    expect(summary.find((section) => section.kind === 'animation')?.items).not.toContainEqual(
      expect.objectContaining({ label: 'Position X' }),
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
    expect(summary.find((section) => section.kind === 'animation')?.items).toContainEqual({
      id: 'animation:effect:hue:turns',
      label: 'Hue shift',
      value: 'animated',
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

    expect(firstSummary.find((section) => section.kind === 'animation')).toBeUndefined()
    expect(secondSummary.find((section) => section.kind === 'animation')?.items).toContainEqual({
      id: 'animation:time-scale',
      label: 'Animation speed',
      value: 'animated',
    })
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
      'Animation speed 0.35x · Speed 28% · Sharpness 42% · Brightness 80% · Scale X 0.8x, Y 0.8x · Hue 0.1 turn · Animation speed animated',
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
      expect.objectContaining({ label: 'Hue', value: '0.1 turn' }),
      expect.objectContaining({
        label: 'Scale',
        value: 'X 2.51x, Y 0.75x',
        timelineValue: 'x 2.51x, y 0.75x',
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
      expect.objectContaining({ label: 'Rotation', value: '90 deg' }),
      expect.objectContaining({ label: 'Scale X', value: '2.51x', timelineValue: 'sx 2.51x' }),
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

    expect(effect?.value).toBe('Amount 0.32, Frequency 4, Phase 0 turn, Center X 0.5, Center Y 0.5')
    expect(timelineEffect?.displayValue).toBe('amt 0.32, freq 4, phase 0 turn, cx 0.5, cy 0.5')
  })
})
