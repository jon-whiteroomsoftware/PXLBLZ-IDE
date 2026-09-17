// What the harness owes the v2 catalogue (#1039).
//
// This file replaces the v1 `commandParity` and `grammarBreadth` suites, and the
// change of obligation is deliberate. Those suites existed because the harness
// carried its own implementations of the Show operations, so their agreement
// with the canonical registry had to be proved case by case. On v2 the harness
// registers the production catalogue itself through one adapter, so re-proving
// each command's behavior here would only duplicate `showCommandsV2`'s own
// suites. What can still drift is the adapter: which entries reach the tool
// surface, whether their metadata survives, and whether the three catalogue
// outcomes are reported faithfully. That is what this file proves.
import { describe, expect, it } from 'vitest'
import { SHOW_COMMANDS_V2 } from '@/engine/showCommandsV2/registry'
import { SHOW_COMMAND_V2_NAME_MAP, RETIRED_V1_REFUSAL_CODES } from '@/engine/showCommandsV2/coverage'
import { SHOW_GRAMMAR_OPERATIONS, applyShowGrammarOperation } from '../grammar/registry.js'
import { GENERIC_OPERATION_NAMES } from '../grammar/operations/generic.js'
import { applyNoop, applyOk, applyRefused, clipAt, fixture, layerNamed } from './support/grammarHarness.js'

const registered = new Map(SHOW_GRAMMAR_OPERATIONS.map((operation) => [operation.name, operation]))

describe('the authored tool surface is the v2 catalogue', () => {
  it('registers every catalogue entry and nothing else but the generic backstops', () => {
    const authored = SHOW_GRAMMAR_OPERATIONS
      .filter((operation) => !GENERIC_OPERATION_NAMES.includes(operation.name))
      .map((operation) => operation.name)
      .sort()
    expect(authored).toEqual(SHOW_COMMANDS_V2.map((command) => command.name).sort())
  })

  it('carries each entry’s own description, family and touch paths unchanged', () => {
    for (const command of SHOW_COMMANDS_V2) {
      const operation = registered.get(command.name)!
      expect(operation.description).toBe(command.description)
      expect(operation.family).toBe(command.family)
      expect(operation.mutates).toEqual([...command.touches])
    }
  })

  it('generates a zod shape for every declared field of every entry', () => {
    for (const command of SHOW_COMMANDS_V2) {
      const operation = registered.get(command.name)!
      expect(Object.keys(operation.inputShape).sort()).toEqual(Object.keys(command.fields).sort())
    }
  })

  it('publishes no runtime alias for a retired v1 name', () => {
    const retired = SHOW_COMMAND_V2_NAME_MAP
      .filter((entry) => entry.v1 !== null && entry.v2 !== entry.v1)
      .map((entry) => entry.v1!)
    for (const name of retired) {
      expect(registered.has(name), `${name} is retired and must not be registered`).toBe(false)
    }
  })

  it('names an unknown operation with the catalogue’s own candidates', () => {
    const outcome = applyShowGrammarOperation(fixture(), 'add_clip', {})
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.issues[0].code).toBe('unknown-operation')
    expect(outcome.issues[0].candidates).toContain('create_clips')
  })
})

describe('the adapter reports the catalogue’s three outcomes faithfully', () => {
  it('changed: the owner’s record, changes and affected collections pass through', () => {
    const document = fixture()
    const clip = clipAt(document, 0)
    const outcome = applyOk(document, 'resize_clip', { clip_id: clip.clipId, duration_ms: 12_000 })
    expect(outcome.changes).toHaveLength(1)
    expect(outcome.changes[0].targetId).toBe(clip.clipId)
    expect(outcome.changes[0].details).toMatchObject({ clips: [clip.clipId] })
    expect(clipAt(outcome.document, 0).durationMs).toBe(12_000)
  })

  it('unchanged: an already-satisfied valid request is an accepted no-op, never a refusal', () => {
    const document = fixture()
    applyNoop(document, 'resize_clip', { clip_id: clipAt(document, 0).clipId, duration_ms: 30_000 })
    applyNoop(document, 'rename_show', { name: document.show.name })
  })

  it('refused: the owner’s own code and message reach the caller unchanged', () => {
    const document = fixture()
    const issues = applyRefused(document, 'resize_clip', { clip_id: 'nope', duration_ms: 1_000 }, 'unknown-id')
    expect(issues[0].message).toContain('nope')
  })

  it('surfaces no retired v1 refusal code', () => {
    const document = fixture()
    const retired = new Set(RETIRED_V1_REFUSAL_CODES.map((entry) => entry.code))
    const refusals = [
      applyShowGrammarOperation(document, 'resize_clip', { clip_id: 'nope', duration_ms: 1_000 }),
      applyShowGrammarOperation(document, 'split_clip', { clip_id: clipAt(document, 0).clipId, at_ms: 45_000 }),
      applyShowGrammarOperation(document, 'set_show_end', { end_ms: 20_000 }),
    ]
    for (const outcome of refusals) {
      expect(outcome.ok).toBe(false)
      if (outcome.ok) continue
      for (const issue of outcome.issues) expect(retired.has(issue.code)).toBe(false)
    }
  })
})

describe('an authoring sequence stays valid throughout', () => {
  it('creates a Layer and a Clip, animates, inserts time and moves Show End', () => {
    let document = fixture({ emptyTail: true })
    const first = clipAt(document, 0)

    document = applyOk(document, 'create_layers', {
      layers: [{ zone_id: 'z1', name: 'Over', above_layer_id: layerNamed(document, 'Main').layerId }],
    }).document
    document = applyOk(document, 'create_clips', {
      clips: [{
        zone_id: 'z1',
        layer_id: layerNamed(document, 'Over').layerId,
        start_ms: 5_000,
        duration_ms: 10_000,
        pattern: { kind: 'stock', id: 'TestPattern2D' },
      }],
    }).document
    document = applyOk(document, 'update_clips', {
      updates: [{ clip_id: first.clipId, appearance: { apply: { scope: 'whole-clip' }, view: { brightness: 0.7 } } }],
    }).document
    document = applyOk(document, 'add_marker', { at_ms: 5_000, name: 'Overlay in' }).document
    document = applyOk(document, 'insert_time', { at_ms: 25_000, duration_ms: 5_000 }).document
    document = applyOk(document, 'set_show_end', { end_ms: 80_000 }).document

    expect(document.show.composition.showEndMs).toBe(80_000)
    expect(document.show.composition.clips.length).toBe(2)
  })
})
