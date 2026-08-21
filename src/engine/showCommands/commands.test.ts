import { describe, expect, it } from 'vitest'
import { showCommandFixture, singleClipCommandFixture, trackedCommandFixture } from '../../test/showCommandFixture'
import type { ShowRecord } from '../personalContentRecords'
import { showLoopDurationMs } from '../showModel'
import { projectShowSummary } from '../showSummaryProjection'
import { SHOW_COMMANDS, applyShowCommand, type ShowCommandChange } from './registry'

// Golden accepted case and refusal partitions per registry entry, plus the
// touch-path faithfulness sweep: every golden's actual changed paths must
// fall inside the entry's declared `touches`, and every declared pattern
// must be exercised by at least one golden.

interface AppliedRecord {
  command: string
  before: ShowRecord
  after: ShowRecord
}
const APPLIED: AppliedRecord[] = []

function applyOk(
  record: ShowRecord,
  command: string,
  input: Record<string, unknown> = {},
): { record: ShowRecord; changes: ShowCommandChange[] } {
  const outcome = applyShowCommand(record, command, input)
  expect(outcome.ok, `${command} refused: ${JSON.stringify(!outcome.ok && outcome.issues)}`).toBe(true)
  if (!outcome.ok) throw new Error('unreachable')
  expect(outcome.record).not.toBe(record)
  APPLIED.push({ command, before: record, after: outcome.record })
  return outcome
}

function applyRefused(
  record: ShowRecord,
  command: string,
  input: Record<string, unknown>,
  code: string,
) {
  const frozen = JSON.stringify(record)
  const outcome = applyShowCommand(record, command, input)
  expect(outcome.ok, `${command} unexpectedly accepted`).toBe(false)
  if (outcome.ok) throw new Error('unreachable')
  expect(outcome.issues[0].code, outcome.issues[0].message).toBe(code)
  expect(outcome.issues[0].message.length).toBeGreaterThan(10)
  expect(JSON.stringify(record)).toBe(frozen)
  return outcome.issues
}

function summaryClips(record: ShowRecord) {
  return projectShowSummary(record, record.composition!).zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
}

export const GOLDEN_RUNS: Record<string, () => void> = {
  add_clip: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'add_clip', {
      zone_id: 'zone-1',
      start_ms: 34_000,
      duration_ms: 5_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
    })
    const added = summaryClips(record).find((clip) => clip.startMs === 34_000)
    expect(added?.clipId).toBe(changes[0].targetId)
    expect(added?.durationMs).toBe(5_000)

    // At Show End with extend_show, the Show grows to fit.
    const extended = applyOk(record, 'add_clip', {
      zone_id: 'zone-1',
      start_ms: 62_000,
      duration_ms: 4_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
      extend_show: true,
    })
    expect(showLoopDurationMs(extended.record)).toBe(66_000)

    // An overlay layer accepts a clip by index.
    const overlay = applyOk(showCommandFixture(), 'add_clip', {
      zone_id: 'zone-1',
      start_ms: 10_000,
      duration_ms: 4_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
      overlay_layer_index: 0,
    })
    const overlayClip = summaryClips(overlay.record)
      .find((clip) => clip.kind === 'overlay' && clip.startMs === 10_000)
    expect(overlayClip?.layerId).toBe('overlay-1')
  },
  move_clip: () => {
    const { record } = applyOk(showCommandFixture(), 'move_clip', {
      clip_id: 'clip-b',
      start_ms: 34_000,
    })
    const moved = summaryClips(record).find((clip) => clip.clipId === 'clip-b')
    expect(moved?.startMs).toBe(34_000)
    expect(moved?.sceneId).toBe('scene-2')

    // A tracked clip carries its property track with it (within its Scene).
    const tracked = applyOk(trackedCommandFixture(), 'move_clip', {
      clip_id: 'clip-b',
      start_ms: 13_000,
    })
    const trackTimes = tracked.record.composition?.scenes
      .find((scene) => scene.sceneId === 'scene-1')?.propertyTracks
      ?.find((track) => track.id === 'track-b')?.keyframes.map((keyframe) => keyframe.timeMs)
    expect(trackTimes).toEqual([13_000, 20_000])
  },
  resize_clip: () => {
    const { record } = applyOk(showCommandFixture(), 'resize_clip', {
      clip_id: 'clip-b',
      duration_ms: 9_000,
    })
    expect(summaryClips(record).find((clip) => clip.clipId === 'clip-b')?.durationMs).toBe(9_000)

    const overlay = applyOk(showCommandFixture(), 'resize_clip', {
      clip_id: 'clip-ov',
      duration_ms: 4_000,
    })
    expect(summaryClips(overlay.record).find((clip) => clip.clipId === 'clip-ov')?.durationMs).toBe(4_000)
  },
  split_clip: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'split_clip', {
      clip_id: 'clip-a',
      at_ms: 4_000,
    })
    const left = summaryClips(record).find((clip) => clip.clipId === 'clip-a')
    const right = summaryClips(record).find((clip) => clip.clipId === changes[0].details?.rightClipId)
    expect(left?.endMs).toBe(4_000)
    expect(right?.startMs).toBe(4_000)
    expect(right?.endMs).toBe(10_000)
    expect(right?.instanceId).toBe('instance-a')

    // Splitting a tracked clip leaves a track on each half.
    const tracked = applyOk(trackedCommandFixture(), 'split_clip', {
      clip_id: 'clip-b',
      at_ms: 16_000,
    })
    const scene1 = tracked.record.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')
    expect((scene1?.propertyTracks ?? []).filter((track) => (
      'placementId' in track.target
    )).length).toBeGreaterThanOrEqual(2)
  },
  duplicate_clip: () => {
    const independent = applyOk(showCommandFixture(), 'duplicate_clip', { clip_id: 'clip-ov' })
    const copy = summaryClips(independent.record)
      .find((clip) => clip.clipId === independent.changes[0].targetId)
    expect(copy?.startMs).toBe(8_000)
    expect(copy?.instanceId).not.toBe('instance-ov')

    const linked = applyOk(showCommandFixture(), 'duplicate_clip', { clip_id: 'clip-ov', linked: true })
    expect(summaryClips(linked.record).find((clip) => clip.clipId === linked.changes[0].targetId)?.instanceId)
      .toBe('instance-ov')
  },
  remove_clip: () => {
    const { record } = applyOk(showCommandFixture(), 'remove_clip', { clip_id: 'clip-b' })
    expect(summaryClips(record).some((clip) => clip.clipId === 'clip-b')).toBe(false)

    const overlay = applyOk(showCommandFixture(), 'remove_clip', { clip_id: 'clip-ov' })
    expect(summaryClips(overlay.record).some((clip) => clip.clipId === 'clip-ov')).toBe(false)

    // Removing a tracked clip removes its placement-owned tracks.
    const tracked = applyOk(trackedCommandFixture(), 'remove_clip', { clip_id: 'clip-b' })
    const scene1 = tracked.record.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')
    expect((scene1?.propertyTracks ?? []).some((track) => track.id === 'track-b')).toBe(false)
  },
  make_clip_pattern_independent: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'make_clip_pattern_independent', {
      clip_id: 'clip-c',
    })
    const changed = summaryClips(record).find((clip) => clip.clipId === 'clip-c')
    expect(changed?.instanceId).toBe(changes[0].details?.newInstanceId)
    expect(summaryClips(record).find((clip) => clip.clipId === 'clip-a')?.instanceId).toBe('instance-a')

    // Instance-targeted tracks in the clip's Scenes clone onto the new instance.
    const tracked = applyOk(trackedCommandFixture(), 'make_clip_pattern_independent', {
      clip_id: 'clip-c',
    })
    const scene1 = tracked.record.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')
    const instanceTargets = (scene1?.propertyTracks ?? [])
      .filter((track) => track.target.kind === 'instance-time-scale')
      .map((track) => ('instanceId' in track.target ? track.target.instanceId : null))
    expect(instanceTargets.length).toBeGreaterThanOrEqual(2)
  },
  rejoin_clip_pattern_instance: () => {
    const { record } = applyOk(showCommandFixture(), 'rejoin_clip_pattern_instance', {
      clip_id: 'clip-b',
      target_clip_id: 'clip-a',
    })
    expect(summaryClips(record).find((clip) => clip.clipId === 'clip-b')?.instanceId).toBe('instance-a')
  },
  insert_time: () => {
    const base = showCommandFixture()
    const { record, changes } = applyOk(base, 'insert_time', { at_ms: 4_000, duration_ms: 3_000 })
    expect(showLoopDurationMs(record)).toBe(65_000)
    const left = summaryClips(record).find((clip) => clip.clipId === 'clip-a')
    expect(left?.endMs).toBe(4_000)
    const rightId = Object.values(
      (changes[0].details?.splitClipIdsBySourceId ?? {}) as Record<string, string>,
    )[0]
    expect(summaryClips(record).find((clip) => clip.clipId === rightId)?.startMs).toBe(7_000)
  },
  set_show_end: () => {
    const { record } = applyOk(showCommandFixture(), 'set_show_end', { end_ms: 70_000 })
    expect(showLoopDurationMs(record)).toBe(70_000)
  },
  add_marker: () => {
    const { record, changes } = applyOk(showCommandFixture(), 'add_marker', {
      at_ms: 15_000,
      name: 'Chorus',
      color: '#ff8800',
    })
    expect(record.composition?.markers?.find((marker) => marker.id === changes[0].targetId))
      .toMatchObject({ timeMs: 15_000, name: 'Chorus', color: '#ff8800' })
  },
  move_marker: () => {
    const { record } = applyOk(showCommandFixture(), 'move_marker', {
      marker_id: 'marker-1',
      at_ms: 20_000,
    })
    expect(record.composition?.markers?.[0].timeMs).toBe(20_000)
  },
  update_marker: () => {
    const { record } = applyOk(showCommandFixture(), 'update_marker', {
      marker_id: 'marker-1',
      name: 'Bridge',
    })
    expect(record.composition?.markers?.[0].name).toBe('Bridge')
  },
  remove_marker: () => {
    const { record } = applyOk(showCommandFixture(), 'remove_marker', { marker_id: 'marker-1' })
    expect(record.composition?.markers ?? []).toEqual([])
  },
}

describe('Show command goldens (#885)', () => {
  it('every registered command has a golden accepted case', () => {
    const missing = SHOW_COMMANDS.map((command) => command.name)
      .filter((name) => !(name in GOLDEN_RUNS))
    expect(missing).toEqual([])
  })

  for (const [name, run] of Object.entries(GOLDEN_RUNS)) {
    it(`${name}: golden accepted case`, run)
  }
})

describe('Show command refusal partitions (#885)', () => {
  it('add_clip refuses occupied time, invalid time, and a Transition window with the plan reason', () => {
    const base = { pattern_kind: 'stock', pattern_id: 'CometLoom' }
    applyRefused(showCommandFixture(), 'add_clip', { ...base, zone_id: 'zone-1', start_ms: 5_000 }, 'occupied')
    applyRefused(showCommandFixture(), 'add_clip', { ...base, zone_id: 'zone-1', start_ms: 100_000 }, 'invalid-time')
    applyRefused(showCommandFixture(), 'add_clip', { ...base, zone_id: 'zone-1', start_ms: 30_500 }, 'transition')
    applyRefused(showCommandFixture(), 'add_clip', { ...base, zone_id: 'no-zone', start_ms: 1_000 }, 'missing-owner')
  })

  it('clip commands refuse an unknown clip with candidates', () => {
    const issues = applyRefused(showCommandFixture(), 'move_clip', { clip_id: 'nope', start_ms: 0 }, 'unknown-clip')
    expect(issues[0].candidates).toContain('clip-a')
    applyRefused(showCommandFixture(), 'resize_clip', { clip_id: 'nope', duration_ms: 1_000 }, 'unknown-clip')
    applyRefused(showCommandFixture(), 'remove_clip', { clip_id: 'nope' }, 'unknown-clip')
  })

  it('move_clip refuses an occupied destination as an engine refusal', () => {
    applyRefused(showCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 2_000 }, 'engine-refused')
  })

  it('split_clip refuses a point outside the clip', () => {
    applyRefused(showCommandFixture(), 'split_clip', { clip_id: 'clip-a', at_ms: 0 }, 'outside-clip')
    applyRefused(showCommandFixture(), 'split_clip', { clip_id: 'clip-a', at_ms: 11_000 }, 'outside-clip')
  })

  it('duplicate_clip refuses an occupied tail with the plan reason', () => {
    applyRefused(showCommandFixture(), 'duplicate_clip', { clip_id: 'clip-a' }, 'occupied')
  })

  it('remove_clip refuses the last clip of a Show', () => {
    applyRefused(singleClipCommandFixture(), 'remove_clip', { clip_id: 'clip-a' }, 'last-clip')
  })

  it('pattern-instance commands refuse already-independent and incompatible targets', () => {
    applyRefused(
      showCommandFixture(),
      'make_clip_pattern_independent',
      { clip_id: 'clip-b' },
      'already-independent',
    )
    applyRefused(
      showCommandFixture(),
      'rejoin_clip_pattern_instance',
      { clip_id: 'clip-b', target_clip_id: 'clip-ov' },
      'incompatible-target',
    )
    applyRefused(
      showCommandFixture(),
      'rejoin_clip_pattern_instance',
      { clip_id: 'clip-c', target_clip_id: 'clip-a' },
      'already-shared',
    )
  })

  it('insert_time refuses a Transition window and a non-positive duration', () => {
    applyRefused(showCommandFixture(), 'insert_time', { at_ms: 31_000, duration_ms: 1_000 }, 'transition')
    applyRefused(showCommandFixture(), 'insert_time', { at_ms: 1_000, duration_ms: 0 }, 'invalid-duration')
  })

  it('set_show_end refuses when nothing would change', () => {
    applyRefused(showCommandFixture(), 'set_show_end', { end_ms: 62_000 }, 'no-change')
  })

  it('marker commands refuse an unknown marker with candidates', () => {
    const issues = applyRefused(showCommandFixture(), 'move_marker', { marker_id: 'nope', at_ms: 0 }, 'unknown-marker')
    expect(issues[0].candidates).toEqual(['marker-1'])
    applyRefused(showCommandFixture(), 'update_marker', { marker_id: 'nope', name: 'X' }, 'unknown-marker')
    applyRefused(showCommandFixture(), 'remove_marker', { marker_id: 'nope' }, 'unknown-marker')
    applyRefused(showCommandFixture(), 'update_marker', { marker_id: 'marker-1' }, 'invalid-argument')
  })

  it('group children refuse the direct clip commands', () => {
    const record = showCommandFixture()
    const composition = record.composition!
    const grouped: ShowRecord = {
      ...record,
      composition: {
        ...composition,
        groupDefinitions: [{
          id: 'group-1',
          name: 'Pair',
          patternInstances: [{
            id: 'inst-g',
            pattern: { kind: 'stock', id: 'Rings' },
            patternName: 'Rings',
            time: { timeScale: 1, timeOffsetMs: 0 },
          }],
          placements: [{
            id: 'g-a',
            instanceId: 'inst-g',
            startMs: 0,
            durationMs: 3_000,
            opacity: 1,
            view: { mirror: false, phase: 0, brightness: 1 },
            layerOffset: 0,
          }],
        }],
        groupOccurrences: [{
          id: 'occ-1',
          definitionId: 'group-1',
          sceneId: 'scene-2',
          zoneId: 'zone-1',
          startMs: 5_000,
          baseLayer: 0,
          translationX: 0,
          translationY: 0,
        }],
      },
    }
    const issues = applyRefused(grouped, 'move_clip', { clip_id: 'occ-1:g-a', start_ms: 40_000 }, 'group')
    expect(issues[0].remedy).toContain('Group')
  })
})

// --- Touch-path faithfulness -----------------------------------------------

/** Leaf-level JSON-pointer paths where two values differ. */
function changedPaths(before: unknown, after: unknown, prefix = ''): string[] {
  if (before === after) return []
  const bothObjects =
    before !== null && after !== null &&
    typeof before === 'object' && typeof after === 'object' &&
    Array.isArray(before) === Array.isArray(after)
  if (!bothObjects) {
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [prefix || '/']
  }
  const keys = new Set([
    ...Object.keys(before as Record<string, unknown>),
    ...Object.keys(after as Record<string, unknown>),
  ])
  const paths: string[] = []
  for (const key of keys) {
    paths.push(...changedPaths(
      (before as Record<string, unknown>)[key],
      (after as Record<string, unknown>)[key],
      `${prefix}/${key}`,
    ))
  }
  return paths
}

/** A path matches a pattern when one is a prefix of the other, '*' matching any segment. */
function pathMatches(path: string, pattern: string): boolean {
  const pathSegments = path.split('/').slice(1)
  const patternSegments = pattern.split('/').slice(1)
  const shared = Math.min(pathSegments.length, patternSegments.length)
  for (let index = 0; index < shared; index += 1) {
    const patternSegment = patternSegments[index]
    if (patternSegment !== '*' && patternSegment !== pathSegments[index]) return false
  }
  return true
}

describe('Show command touch-path faithfulness (#885)', () => {
  it('every declared touches pattern is exact against the golden fixtures', () => {
    APPLIED.length = 0
    for (const run of Object.values(GOLDEN_RUNS)) run()
    const IGNORED = ['/updatedAt']
    const violations: string[] = []
    for (const command of SHOW_COMMANDS) {
      const records = APPLIED.filter((record) => record.command === command.name)
      expect(records.length, `${command.name} has no recorded golden run`).toBeGreaterThan(0)
      const changed = new Set(
        records
          .flatMap((record) => changedPaths(record.before, record.after))
          .filter((path) => !IGNORED.some((ignored) => pathMatches(path, ignored))),
      )
      for (const path of changed) {
        if (!command.touches.some((pattern) => pathMatches(path, pattern))) {
          violations.push(`${command.name} changed undeclared path ${path}`)
        }
      }
      for (const pattern of command.touches.filter((candidate) => !IGNORED.includes(candidate))) {
        if (![...changed].some((path) => pathMatches(path, pattern))) {
          violations.push(`${command.name} declares ${pattern} but no golden fixture changes it`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
