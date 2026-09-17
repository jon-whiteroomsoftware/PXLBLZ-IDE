import { describe, expect, it } from 'vitest'
import { commandFixtureV2 } from './showCommandsV2/fixtures'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'
import { createInstallationShowOutputContract } from './showOutputContract'
import { prepareShowStageV2 } from './showPreparedStageV2'
import { editShowZoneV2 } from './showZonesV2'

/**
 * The v2 Zone owner: adding a Zone and removing one with its content (#1039).
 *
 * Oracles are the reopened record, `validateShowRecordV2`, and - for the
 * counterexample the missing owner used to produce - `prepareShowStageV2`,
 * because appending a valid Zone is not enough on its own: every Layout
 * definition has to route it or the whole Show stops preparing.
 */
const dependencies = {
  patterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }],
  maps: [],
  libraries: [],
  profiles: [],
  stageMap: null,
}

/** The shared fixture with one Layer and Clip on the second Zone as well. */
function record(): ShowRecordV2 {
  const value = commandFixtureV2()
  for (const instance of value.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  value.composition.layers.push({ id: 'right-base', zoneId: 'right', name: 'Base', rank: 0 })
  value.composition.clips.push({
    ...structuredClone(value.composition.clips[0]),
    id: 'clip-right',
    zoneId: 'right',
    layerId: 'right-base',
    startMs: 0,
    durationMs: 10_000,
    appearance: {
      keys: [{ ...structuredClone(value.composition.clips[0].appearance.keys[0]), id: 'clip-right:key', timeMs: 0 }],
    },
  })
  // Both occurrences route both Zones so the added Clip is available throughout.
  value.zoneLayouts[1].logical = { kind: 'stripes', axis: 'y', zoneIds: ['left', 'right'] }
  expect(validateShowRecordV2(value)).toEqual([])
  return value
}

function installationRecord(): ShowRecordV2 {
  const value = record()
  value.outputContract = createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 16 })
  value.zoneLayouts = [
    { id: 'both', name: 'Both', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 7 }] }, { zoneId: 'right', ranges: [{ start: 8, end: 15 }] }] },
    { id: 'left-only', name: 'Left only', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 15 }] }, { zoneId: 'right', ranges: [] }] },
  ]
  expect(validateShowRecordV2(value)).toEqual([])
  return value
}

function reopen(value: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(value))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

/** Leaves room for a positive Transition window before the second Clip. */
function moveClipB(value: ShowRecordV2): void {
  const clip = value.composition.clips.find(candidate => candidate.id === 'clip-b')!
  clip.startMs = 5_000
  for (const key of clip.appearance.keys) key.timeMs = 5_000
}

const spare = { id: 'spare', name: 'Spare', nominalPixelCount: 8, color: '#22c55e' }

describe('adding a Zone', () => {
  it('routes the new Zone in every Layout definition so the Show still prepares', () => {
    const source = record()
    const before = structuredClone(source)
    const result = editShowZoneV2(source, { kind: 'add', zone: spare })
    if (result.status !== 'changed') throw new Error(`${result.status}: ${JSON.stringify(result)}`)
    expect(source).toEqual(before)

    const reopened = reopen(result.record)
    expect(reopened.zones.map(zone => zone.id)).toEqual(['left', 'right', 'spare'])
    // Every definition routes it: v1's `appendZoneToLayout` appends the member
    // and turns a fixed-arity operator into a horizontal stripe subdivision.
    expect(reopened.zoneLayouts[0].logical).toEqual({ kind: 'stripes', axis: 'x', zoneIds: ['left', 'right', 'spare'] })
    expect(reopened.zoneLayouts[1].logical).toEqual({ kind: 'stripes', axis: 'y', zoneIds: ['left', 'right', 'spare'] })
    expect(prepareShowStageV2(reopened, dependencies).status).toBe('ready')
    expect(result.affectedZoneIds).toEqual(['spare'])
    expect(result.affectedLayoutDefinitionIds).toEqual(['both', 'left-only'])
    expect(result.removedIds).toEqual([])
  })

  it('appends physical ranges after the last assigned pixel', () => {
    const result = editShowZoneV2(installationRecord(), { kind: 'add', zone: spare })
    if (result.status !== 'changed') throw new Error(result.status)
    expect(result.record.zoneLayouts[0].zones).toEqual([
      { zoneId: 'left', ranges: [{ start: 0, end: 7 }] },
      { zoneId: 'right', ranges: [{ start: 8, end: 15 }] },
      { zoneId: 'spare', ranges: [{ start: 16, end: 23 }] },
    ])
    // The second definition's largest assigned end is 15 as well.
    expect(result.record.zoneLayouts[1].zones[2]).toEqual({ zoneId: 'spare', ranges: [{ start: 16, end: 23 }] })
  })

  it('refuses a blank, unusable, duplicate or renamed-over Zone', () => {
    const source = record()
    expect(editShowZoneV2(source, { kind: 'add', zone: { ...spare, id: ' ' } })).toMatchObject({ status: 'refused', code: 'invalid-request' })
    expect(editShowZoneV2(source, { kind: 'add', zone: { ...spare, name: '' } })).toMatchObject({ status: 'refused', code: 'invalid-request' })
    expect(editShowZoneV2(source, { kind: 'add', zone: { ...spare, nominalPixelCount: 0 } })).toMatchObject({ status: 'refused', code: 'invalid-request' })
    expect(editShowZoneV2(source, { kind: 'add', zone: { ...spare, nominalPixelCount: 1.5 } })).toMatchObject({ status: 'refused', code: 'invalid-request' })
    expect(editShowZoneV2(source, { kind: 'add', zone: { ...spare, rank: 1 } as never })).toMatchObject({ status: 'refused', code: 'invalid-request' })
    expect(editShowZoneV2(source, { kind: 'add', zone: { ...spare, id: 'left' } })).toMatchObject({ status: 'refused', code: 'identity-conflict' })
    // v1's `uniqueZoneName` compares case-insensitively and silently renames;
    // this owner refuses instead, because the caller supplies the name.
    const collision = editShowZoneV2(source, { kind: 'add', zone: { ...spare, name: 'left' } })
    expect(collision).toMatchObject({ status: 'refused', code: 'duplicate-name' })
    expect(collision.record).toBe(source)
    expect(collision.affectedZoneIds).toEqual([])
    expect(collision.affectedLayoutDefinitionIds).toEqual([])
  })
})

describe('removing a Zone', () => {
  it('carries the Zone Layers, Clips, Transitions and Clip-owned tracks', () => {
    const source = record()
    moveClipB(source)
    source.composition.transitions.push({
      id: 'cross',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      participants: [{ id: 'pair', zoneId: 'left', layerId: 'base', fromClipId: 'clip-a', toClipId: 'clip-b' }],
      propertyRamps: [],
    })
    expect(validateShowRecordV2(source)).toEqual([])
    const before = structuredClone(source)

    const result = editShowZoneV2(source, { kind: 'remove', zoneId: 'left' })
    if (result.status !== 'changed') throw new Error(`${result.status}: ${JSON.stringify(result)}`)
    expect(source).toEqual(before)

    const reopened = reopen(result.record)
    expect(reopened.zones.map(zone => zone.id)).toEqual(['right'])
    expect(reopened.composition.layers.map(layer => layer.id)).toEqual(['right-base'])
    expect(reopened.composition.clips.map(clip => clip.id)).toEqual(['clip-right'])
    expect(reopened.composition.transitions).toEqual([])
    expect(reopened.composition.propertyTracks).toEqual([])
    // The definitions lose the Zone's membership and ranges; v1 drops an
    // operator that named it, leaving physical ranges behind.
    expect(reopened.zoneLayouts[0]).toEqual({ id: 'both', name: 'Both', zones: [] })
    expect(reopened.zoneLayouts[1]).toEqual({ id: 'left-only', name: 'Left only', zones: [] })
    expect(prepareShowStageV2(reopened, dependencies).status).toBe('ready')

    expect(result.affectedZoneIds).toEqual(['left'])
    expect(result.affectedLayerIds).toEqual(['base', 'over'])
    expect(result.affectedLayoutDefinitionIds).toEqual(['both', 'left-only'])
    expect(result.affectedTransitionIds).toEqual(['cross'])
    expect(result.removedIds).toEqual(['base', 'clip-a', 'clip-b', 'clip-c', 'cross', 'left', 'over', 'track-a'])
  })

  it('keeps the ranges of a definition whose operator did not name the Zone', () => {
    const source = record()
    source.zoneLayouts[1].logical = { kind: 'single', zoneIds: ['right'] }
    source.composition.clips = source.composition.clips.filter(clip => clip.zoneId === 'right')
    source.composition.layers = source.composition.layers.filter(layer => layer.zoneId === 'right')
    source.composition.propertyTracks = []
    expect(validateShowRecordV2(source)).toEqual([])
    const result = editShowZoneV2(source, { kind: 'remove', zoneId: 'left' })
    if (result.status !== 'changed') throw new Error(`${result.status}: ${JSON.stringify(result)}`)
    expect(result.record.zoneLayouts[1].logical).toEqual({ kind: 'single', zoneIds: ['right'] })
    // Only the definition that actually changed is reported.
    expect(result.affectedLayoutDefinitionIds).toEqual(['both'])
  })

  it('refuses the last Zone, an unknown Zone and a foreign Clip plan', () => {
    const source = record()
    const one = editShowZoneV2(source, { kind: 'remove', zoneId: 'left' })
    if (one.status !== 'changed') throw new Error(one.status)
    const last = editShowZoneV2(one.record, { kind: 'remove', zoneId: 'right' })
    expect(last).toMatchObject({ status: 'refused', code: 'last-zone' })
    expect(last.record).toBe(one.record)
    expect(editShowZoneV2(source, { kind: 'remove', zoneId: 'nope' })).toMatchObject({ status: 'refused', code: 'missing-target' })
    expect(editShowZoneV2(source, { kind: 'remove', zoneId: 'left', clipRemovals: [{ clipId: 'clip-right', propertyRampProjections: [] }] }))
      .toMatchObject({ status: 'refused', code: 'invalid-request' })
  })

  it('refuses when a removed Clip carries a Transition Property ramp with no projection plan', () => {
    const source = record()
    moveClipB(source)
    source.composition.transitions.push({
      id: 'cross',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      participants: [{ id: 'pair', zoneId: 'left', layerId: 'base', fromClipId: 'clip-a', toClipId: 'clip-b' }],
      propertyRamps: [{ participantId: 'pair', target: { kind: 'clip-opacity', clipId: 'clip-b' }, from: 0 }],
    })
    expect(validateShowRecordV2(source)).toEqual([])
    const refused = editShowZoneV2(source, { kind: 'remove', zoneId: 'left' })
    expect(refused).toMatchObject({ status: 'refused', code: 'unsupported-property-carrier' })
    expect(refused.record).toBe(source)
    expect(refused.removedIds).toEqual([])
  })

  it('cannot narrow routing: removal only drops the removed Zone from each definition', () => {
    // Every definition either keeps its operator or falls back to the whole
    // Zone set, so a surviving Clip never loses its routing. The shared
    // availability check still guards the result; the add path can reach it.
    const source = record()
    const result = editShowZoneV2(source, { kind: 'remove', zoneId: 'left' })
    if (result.status !== 'changed') throw new Error(result.status)
    expect(result.record.zoneLayouts.every(layout => !layout.zones.some(entry => entry.zoneId === 'left'))).toBe(true)
  })
})

describe('the shared result check', () => {
  it('refuses an addition that would leave an existing Clip unrouted', () => {
    // A definition with no explicit Zone entries and no operator routes every
    // Zone. Appending the new Zone's ranges makes it the only routed Zone,
    // which v1 would have written silently; this owner refuses atomically.
    const source = record()
    source.zoneLayouts[1] = { id: 'left-only', name: 'Left only', zones: [] }
    source.composition.layoutOccurrences[1].layoutId = 'left-only'
    expect(validateShowRecordV2(source)).toEqual([])
    const refused = editShowZoneV2(source, { kind: 'add', zone: spare })
    expect(refused).toMatchObject({ status: 'refused', code: 'zone-unavailable' })
    expect(refused.record).toBe(source)
    expect(refused.affectedLayoutDefinitionIds).toEqual([])
  })
})
