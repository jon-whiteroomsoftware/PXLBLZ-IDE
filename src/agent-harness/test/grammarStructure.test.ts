// Provenance: pxlblz-v3 test/grammarStructure.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { SHOW_GRAMMAR_OPERATIONS } from '../grammar/registry.js'
import { SHOW_CLIP_EFFECT_KINDS } from '../grammar/operations/effects.js'
import { openShowDocument } from '../grammar/openShow.js'
import { grammarFixtureShow } from './support/grammarFixture.js'
import { GOLDEN_RUNS } from './support/grammarGoldens.js'
import {
  APPLIED_RECORDS,
  applyOk,
  applyRefused,
  clipAt,
  fixture,
  withConsecutiveClips,
  withLayerTransition,
  withRecording,
} from './support/grammarHarness.js'

// Test model (issue #19). Refusal partitions for the junction, layer
// transition, Effect, output contract, and Zone Layout families; the Effect
// union sweep (one create per kind); and the touch-path faithfulness test
// asserting every entry's declared `mutates` set is exact against the paths
// its golden fixtures actually change.

describe('junction operations (#19)', () => {
  it('resolves a junction by time or preceding clip, refusing with the nearest junctions', () => {
    const document = fixture({ boundaryCrossfade: true })
    const issues = applyRefused(
      document,
      'set_junction_transition',
      { at_ms: 15_000, kind: 'wipe' },
      'unknown-junction',
    )
    expect(issues[0].message).toContain('Nearest junctions')
    expect(issues[0].candidates?.length).toBeGreaterThan(0)

    applyRefused(
      document,
      'set_junction_transition',
      { after_clip_id: 'nope', kind: 'wipe' },
      'unknown-junction',
    )
    applyRefused(document, 'set_junction_transition', { kind: 'wipe' }, 'invalid-argument')
  })

  it('refuses boundary edits on a within-Scene junction, pointing at layer transitions', () => {
    const base = withConsecutiveClips()
    const issues = applyRefused(
      base.document,
      'set_junction_transition',
      { after_clip_id: base.firstClipId, kind: 'wipe' },
      'missing-target',
    )
    expect(issues[0].remedy).toContain('insert_layer_transition')
  })

  it('refuses an unknown transition variant naming the valid ones', () => {
    const document = fixture({ boundaryCrossfade: true })
    const issues = applyRefused(
      document,
      'set_junction_transition',
      { at_ms: 30_000, kind: 'wipe', variant: 'zigzag' },
      'invalid-argument',
    )
    expect(issues[0].message).toContain('linear')
  })

  it('refuses an unknown junction parameter naming the valid ones', () => {
    const document = fixture({ boundaryCrossfade: true })
    const { document: asWipe } = applyOk(document, 'set_junction_transition', {
      at_ms: 30_000,
      kind: 'wipe',
    })
    const issues = applyRefused(
      asWipe,
      'update_junction_parameter',
      { at_ms: 30_000, parameter: 'nope', value: 1 },
      'unknown-parameter',
    )
    expect(issues[0].candidates?.length).toBeGreaterThan(0)
  })

  it('refuses an unknown layout at a junction with candidates', () => {
    const document = fixture({ boundaryCrossfade: true })
    const issues = applyRefused(
      document,
      'set_junction_layout',
      { at_ms: 30_000, layout_id: 'nope' },
      'unknown-layout',
    )
    expect(issues[0].candidates).toContain('l1')
  })
})

describe('layer transition operations (#19)', () => {
  it('refuses insertion between clips that are not consecutive on one layer', () => {
    const document = fixture()
    const first = clipAt(document, 0)
    const second = clipAt(document, 30_000)
    // Reversed order: the junction from second to first does not exist.
    const issues = applyRefused(
      document,
      'insert_layer_transition',
      { from_clip_id: second.clipId, to_clip_id: first.clipId, duration_ms: 1_000 },
      'transition-conflict',
    )
    expect(issues[0].message.length).toBeGreaterThan(40)
  })

  it('refuses a duration longer than the room that can be made, naming the maximum', () => {
    const base = withConsecutiveClips()
    const issues = applyRefused(
      base.document,
      'insert_layer_transition',
      { from_clip_id: base.firstClipId, to_clip_id: base.secondClipId, duration_ms: 50_000 },
      'transition-conflict',
    )
    expect(issues[0].message).toMatch(/at most \d+ ms/)
  })

  it('refuses a double insertion at the same junction', () => {
    const base = withLayerTransition()
    applyRefused(
      base.document,
      'insert_layer_transition',
      { from_clip_id: base.firstClipId, to_clip_id: base.secondClipId, duration_ms: 1_000 },
      'transition-conflict',
    )
  })

  it('refuses unknown transition ids with candidates, and no-change resizes', () => {
    const base = withLayerTransition()
    const issues = applyRefused(
      base.document,
      'resize_layer_transition',
      { transition_id: 'nope', duration_ms: 1_000 },
      'unknown-transition',
    )
    expect(issues[0].candidates).toContain(base.transitionId)
    applyRefused(
      base.document,
      'resize_layer_transition',
      { transition_id: base.transitionId, duration_ms: 2_000 },
      'no-change',
    )
  })
})

describe('effect operations (#19)', () => {
  it('creates every Effect kind the record supports', () => {
    for (const kind of SHOW_CLIP_EFFECT_KINDS) {
      const document = fixture()
      const clip = clipAt(document, 0)
      const { changes } = applyOk(document, 'add_clip_effect', { clip_id: clip.clipId, kind })
      expect(changes[0].targetId.length).toBeGreaterThan(0)
    }
  })

  it('refuses an unknown parameter naming the valid ones for the kind', () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const issues = applyRefused(
      document,
      'add_clip_effect',
      { clip_id: clip.clipId, kind: 'vignette', parameters: { nope: 1 } },
      'unknown-parameter',
    )
    expect(issues[0].candidates).toContain('amount')
  })

  it('refuses unknown effect ids with the clip’s stack as candidates', () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const { document: withEffect, changes } = applyOk(document, 'add_clip_effect', {
      clip_id: clip.clipId,
      kind: 'brightness',
    })
    const issues = applyRefused(
      withEffect,
      'update_clip_effect',
      { clip_id: clip.clipId, effect_id: 'nope', parameter: 'brightness', value: 0.5 },
      'unknown-effect',
    )
    expect(issues[0].candidates).toContain(changes[0].targetId)
  })

  it('refuses moving an Effect across pipeline stages', () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const { document: one, changes: first } = applyOk(document, 'add_clip_effect', {
      clip_id: clip.clipId,
      kind: 'brightness',
    })
    const { document: two, changes: second } = applyOk(one, 'add_clip_effect', {
      clip_id: clip.clipId,
      kind: 'translate',
    })
    const issues = applyRefused(
      two,
      'move_clip_effect',
      {
        clip_id: clip.clipId,
        effect_id: first[0].targetId,
        target_effect_id: second[0].targetId,
      },
      'invalid-argument',
    )
    expect(issues[0].message).toContain('stage')

    applyRefused(
      two,
      'move_clip_effect',
      { clip_id: clip.clipId, effect_id: first[0].targetId, direction: 'later' },
      'no-change',
    )
  })
})

describe('structure operations (#19)', () => {
  it('set_output_contract refuses a no-change contract', () => {
    const document = fixture()
    applyRefused(
      document,
      'set_output_contract',
      { kind: 'portable-2d', map_id: 'plane', pixel_count: 256 },
      'no-change',
    )
  })

  it('layout interval operations refuse unknown layouts and intervals with candidates', () => {
    const document = fixture()
    applyRefused(
      document,
      'add_layout_interval',
      { layout_id: 'nope', duration_ms: 5_000 },
      'unknown-layout',
    )
    const issues = applyRefused(
      document,
      'duplicate_layout_interval',
      { interval_id: 'nope' },
      'unknown-interval',
    )
    expect(issues[0].candidates?.length).toBe(1)
    applyRefused(document, 'make_layout_interval_unique', { interval_id: 'nope' }, 'unknown-interval')
  })
})

describe('structure operations: Trails (#27)', () => {
  it('set_output_trails refuses a no-change in both directions', () => {
    applyRefused(fixture(), 'set_output_trails', { enabled: false }, 'no-change')
    const on = applyOk(fixture(), 'set_output_trails', { enabled: true, retention: 0.5 })
    applyRefused(on.document, 'set_output_trails', { enabled: true, retention: 0.5 }, 'no-change')
  })
})

describe('record and Zone metadata operations (#28)', () => {
  it('rename_show refuses an empty and an unchanged name', () => {
    const document = fixture()
    applyRefused(document, 'rename_show', { name: '   ' }, 'invalid-argument')
    applyRefused(document, 'rename_show', { name: 'Grammar fixture' }, 'no-change')
  })

  it('set_stage_map refuses a no-change binding', () => {
    const document = fixture()
    applyRefused(document, 'set_stage_map', { stage_map_id: null }, 'no-change')
  })

  it('update_zone refuses unknown Zones with candidates, empty input, and no-change', () => {
    const document = fixture()
    const issues = applyRefused(
      document,
      'update_zone',
      { zone_id: 'nope', name: 'Roof' },
      'unknown-zone',
    )
    expect(issues[0].candidates).toEqual(['z1'])
    applyRefused(document, 'update_zone', { zone_id: 'z1' }, 'invalid-argument')
    applyRefused(document, 'update_zone', { zone_id: 'z1', name: '  ' }, 'invalid-argument')
    applyRefused(
      document,
      'update_zone',
      { zone_id: 'z1', name: 'Main', nominal_pixel_count: 64 },
      'no-change',
    )
  })

  it('update_zone refuses renaming a Zone onto another Zone’s name', () => {
    const record = grammarFixtureShow()
    const opened = openShowDocument({
      ...record,
      zones: [...record.zones, { id: 'z2', name: 'Rig', nominalPixelCount: 32 }],
    })
    if (!opened.ok) throw new Error(`two-zone fixture failed to open: ${JSON.stringify(opened.issues)}`)
    const issues = applyRefused(
      opened.document,
      'update_zone',
      { zone_id: 'z2', name: 'Main' },
      'duplicate-name',
    )
    expect(issues[0].message).toContain('z1')
  })
})

// --- Touch-path faithfulness (#19) -----------------------------------------

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

describe('touch-path faithfulness (#19)', () => {
  it('every declared mutates pattern is exact against the golden fixtures', () => {
    withRecording(() => {
      for (const run of Object.values(GOLDEN_RUNS)) run()
    })
    const IGNORED = ['/updatedAt']
    const violations: string[] = []
    for (const operation of SHOW_GRAMMAR_OPERATIONS) {
      const records = APPLIED_RECORDS.filter((record) => record.op === operation.name)
      expect(records.length, `${operation.name} has no recorded golden run`).toBeGreaterThan(0)
      const changed = new Set(
        records
          .flatMap((record) => changedPaths(record.before, record.after))
          .filter((path) => !IGNORED.some((ignored) => pathMatches(path, ignored))),
      )
      for (const path of changed) {
        if (!operation.mutates.some((pattern) => pathMatches(path, pattern))) {
          violations.push(`${operation.name} changed undeclared path ${path}`)
        }
      }
      for (const pattern of operation.mutates.filter((candidate) => !IGNORED.includes(candidate))) {
        if (![...changed].some((path) => pathMatches(path, pattern))) {
          violations.push(`${operation.name} declares ${pattern} but no golden fixture changes it`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
