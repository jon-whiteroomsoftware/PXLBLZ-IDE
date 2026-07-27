import { beforeEach, describe, expect, it } from 'vitest'
import {
  projectShowClipDetailTabs,
  recallShowClipDetailTab,
  rememberShowClipDetailTab,
  resetShowClipDetailTabMemory,
  resolveShowClipDetailTab,
  type ShowClipDetailTabId,
} from './showClipDetailTabs'
import type { ShowClipInspectorValue } from './showClipInspectorModel'

function value(overrides: Partial<ShowClipInspectorValue> = {}): ShowClipInspectorValue {
  return {
    scope: 'scene-main',
    owner: { kind: 'scene-main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-1' },
    pattern: { kind: 'stock', id: 'TestPattern2D' },
    patternName: 'TestPattern2D',
    evaluationPolicy: 'live',
    presentation: { mode: 'live' },
    simulation: { timeScale: 1, timeOffsetMs: 0 },
    view: { mirror: false, phase: 0, brightness: 1 },
    transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    viewport: { enabled: false, x: 0, y: 0, width: 1, height: 1 },
    effects: [],
    placementId: 'placement-1',
    instanceId: 'instance-1',
    local: { startMs: 0, durationMs: 1_000 },
    ...overrides,
  } as ShowClipInspectorValue
}

const tabs = (input: Partial<{ value: ShowClipInspectorValue; transformEnabled: boolean }> = {}) =>
  projectShowClipDetailTabs({ value: input.value ?? value(), transformEnabled: input.transformEnabled ?? true })

describe('Clip detail tab partition (#642)', () => {
  it('orders the four tabs by ownership', () => {
    expect(tabs().map((tab) => tab.id)).toEqual(['pattern', 'place', 'effects', 'playback'])
    expect(tabs().map((tab) => tab.label)).toEqual(['Pattern', 'Place', 'Effects', 'Playback'])
  })

  it('marks Place inapplicable off a 2D Stage and leaves the rest available', () => {
    const projected = tabs({ transformEnabled: false })
    expect(projected.find((tab) => tab.id === 'place')?.applicable).toBe(false)
    expect(projected.filter((tab) => tab.id !== 'place').every((tab) => tab.applicable)).toBe(true)
  })

  it('reports no authored state for a default Clip', () => {
    expect(tabs().every((tab) => !tab.authored)).toBe(true)
  })

  it.each([
    ['pattern', { simulation: { timeScale: 0.5, timeOffsetMs: 0 } }],
    ['pattern', { simulation: { timeScale: 1, timeOffsetMs: 0, controlTargets: { sliderSpeed: 0.4 } } }],
    ['place', { transform: { positionX: 0.2, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 } }],
    ['place', { viewport: { enabled: true, x: 0, y: 0, width: 1, height: 1 } }],
    ['effects', { view: { mirror: true, phase: 0, brightness: 1 } }],
    ['playback', { presentation: { mode: 'freeze' } }],
    ['playback', { evaluationPolicy: 'freeze-at-entry' }],
    ['playback', { view: { mirror: false, phase: 0.5, brightness: 1 } }],
  ] as Array<[ShowClipDetailTabId, Partial<ShowClipInspectorValue>]>)(
    'flags %s as authored for its own non-default value',
    (id, overrides) => {
      const projected = tabs({ value: value(overrides) })
      expect(projected.find((tab) => tab.id === id)?.authored).toBe(true)
    },
  )

  it('does not let brightness alone light a tab, because it lives in the header', () => {
    const projected = tabs({ value: value({ view: { mirror: false, phase: 0, brightness: 0.4 } }) })
    expect(projected.every((tab) => !tab.authored)).toBe(true)
  })
})

describe('Clip detail tab resolution (#642)', () => {
  it('keeps the preferred tab when it is merely empty', () => {
    // Effects has nothing on this Clip, and that is exactly when holding still matters.
    expect(resolveShowClipDetailTab('effects', tabs())).toBe('effects')
  })

  it('falls back only when the preferred tab is unavailable', () => {
    expect(resolveShowClipDetailTab('place', tabs({ transformEnabled: false }))).toBe('pattern')
  })

  it('returns to the preferred tab once a Clip can show it again', () => {
    const preferred: ShowClipDetailTabId = 'place'
    expect(resolveShowClipDetailTab(preferred, tabs({ transformEnabled: false }))).toBe('pattern')
    expect(resolveShowClipDetailTab(preferred, tabs({ transformEnabled: true }))).toBe('place')
  })

  it('defaults to Pattern with no preference', () => {
    expect(resolveShowClipDetailTab(undefined, tabs())).toBe('pattern')
  })
})

describe('Clip detail tab memory (#642)', () => {
  beforeEach(resetShowClipDetailTabMemory)

  it('is empty until something is remembered', () => {
    expect(recallShowClipDetailTab('transient')).toBeUndefined()
  })

  it('keeps a separate tab per panel so comparison panels do not move together', () => {
    rememberShowClipDetailTab('transient', 'effects')
    rememberShowClipDetailTab('pinned', 'playback')

    expect(recallShowClipDetailTab('transient')).toBe('effects')
    expect(recallShowClipDetailTab('pinned')).toBe('playback')
  })

  it('survives being recalled repeatedly, standing in for close and reopen', () => {
    rememberShowClipDetailTab('transient', 'place')
    expect(recallShowClipDetailTab('transient')).toBe('place')
    expect(recallShowClipDetailTab('transient')).toBe('place')
  })
})
