import { describe, expect, it } from 'vitest'
import { showCommandFixture } from '../../test/showCommandFixture'
import { projectShowUnifiedTimeline } from '../showUnifiedTimelineProjection'
import {
  SHOW_COMMANDS,
  applyShowCommand,
  runShowCommandTransaction,
  validateShowCommandInput,
} from './registry'

describe('Show command registry core (#885)', () => {
  it('declares every command with a name, description, schema, and touch paths', () => {
    const names = SHOW_COMMANDS.map((command) => command.name)
    expect(new Set(names).size).toBe(names.length)
    for (const command of SHOW_COMMANDS) {
      expect(command.name).toMatch(/^[a-z][a-z0-9_]+$/)
      expect(command.description.length).toBeGreaterThan(40)
      expect(command.touches.length).toBeGreaterThan(0)
      expect(Object.keys(command.fields).length).toBeGreaterThan(0)
      for (const field of Object.values(command.fields)) {
        expect(field.description.length).toBeGreaterThan(3)
      }
    }
  })

  it('refuses an unknown command with candidates', () => {
    const outcome = applyShowCommand(showCommandFixture(), 'no_such_command')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.issues[0].code).toBe('unknown-command')
      expect(outcome.issues[0].candidates).toContain('move_clip')
    }
  })

  it('validates input against the schema: missing, mistyped, unknown, and enum fields', () => {
    const move = SHOW_COMMANDS.find((command) => command.name === 'move_clip')!
    expect(validateShowCommandInput(move, {}).map((issue) => issue.code))
      .toEqual(['invalid-argument', 'invalid-argument'])
    expect(validateShowCommandInput(move, { clip_id: 5, start_ms: 'late' })).toHaveLength(2)
    expect(validateShowCommandInput(move, { clip_id: 'clip-a', start_ms: 1, extra: true }))
      .toHaveLength(1)
    const add = SHOW_COMMANDS.find((command) => command.name === 'add_clip')!
    const enumIssue = validateShowCommandInput(add, {
      zone_id: 'zone-1',
      start_ms: 0,
      pattern_kind: 'imaginary',
      pattern_id: 'Rings',
    })
    expect(enumIssue).toHaveLength(1)
    expect(enumIssue[0].message).toContain('stock')
  })

  it('never mutates the input record, on acceptance or refusal', () => {
    const record = showCommandFixture()
    const frozen = JSON.stringify(record)
    applyShowCommand(record, 'move_clip', { clip_id: 'clip-b', start_ms: 34_000 })
    applyShowCommand(record, 'move_clip', { clip_id: 'missing', start_ms: 0 })
    applyShowCommand(record, 'remove_marker', { marker_id: 'marker-1' })
    expect(JSON.stringify(record)).toBe(frozen)
  })

  it('composes a transaction into one record, all-or-nothing', () => {
    const record = showCommandFixture()
    const outcome = runShowCommandTransaction(record, [
      { name: 'move_clip', input: { clip_id: 'clip-b', start_ms: 34_000 } },
      { name: 'resize_clip', input: { clip_id: 'clip-b', duration_ms: 6_000 } },
      { name: 'add_marker', input: { at_ms: 34_000, name: 'Landing' } },
    ])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.changes).toHaveLength(3)
    const timeline = projectShowUnifiedTimeline(outcome.record, outcome.record.composition!)
    const moved = timeline.zones[0].layers.flatMap((layer) => layer.clips)
      .find((clip) => clip.id === 'clip-b')
    expect(moved?.startMs).toBe(34_000)
    expect(moved?.durationMs).toBe(6_000)
    expect(outcome.record.composition?.markers?.some((marker) => marker.name === 'Landing')).toBe(true)
  })

  it('a refusing step aborts the transaction, reports its index, and changes nothing', () => {
    const record = showCommandFixture()
    const frozen = JSON.stringify(record)
    const outcome = runShowCommandTransaction(record, [
      { name: 'move_clip', input: { clip_id: 'clip-b', start_ms: 34_000 } },
      { name: 'move_clip', input: { clip_id: 'missing-clip', start_ms: 0 } },
      { name: 'add_marker', input: { at_ms: 1_000 } },
    ])
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.step).toBe(1)
    expect(outcome.issues[0].code).toBe('unknown-clip')
    expect(JSON.stringify(record)).toBe(frozen)
  })
})
