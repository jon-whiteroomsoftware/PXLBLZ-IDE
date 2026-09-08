import { expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { createScriptedAgent, runUtterance } from '../bridge/service'
import { openGrammarFixture } from './support/grammarFixture'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { createSessionStore } from '../grammar/session'
import { validateShowDocument } from '../shows/evaluate'

const scriptedAgent = createScriptedAgent()

it.each([
  ['missing', [{ start: 0, end: 3 }]],
  ['overlap', [{ start: 0, end: 5 }, { start: 4, end: 7 }]],
  ['above-output', [{ start: 0, end: 11 }]],
  ['negative', [{ start: -3, end: 7 }]],
] as const)('resizes physical %s through the scripted service while preserving coverage and blocking delivery', async (_name, ranges) => {
  const show = openGrammarFixture().document.show
  show.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 8, resolution: 'fixed' }
  show.routingLayouts = [{ id: 'l1', name: 'Incomplete', zones: [{ zoneId: 'z1', ranges: ranges.map(range => ({ ...range })) }] }]
  const before = structuredClone(show)
  const result = await runUtterance(scriptedAgent, { show: { ...show }, utterance: 'make the first Clip exactly eight seconds' }, undefined, true)
  expect(result.privateOutcome.kind).toBe('committed')
  expect(result.changed).toBe(true)
  expect(result.summaries).toHaveLength(1)
  const expected = structuredClone(before)
  expected.composition!.scenes[0].zones[0].main[0].durationMs = 8000
  expect(result.show).toEqual({ ...expected, updatedAt: expect.any(Number) })
  expect(show).toEqual(before)
  expect(validateShowDocument(result.show).valid).toBe(false)
  expect(createSessionStore().open(before).ok).toBe(false)
  const { bundle } = buildShowFileBundle(result.show as ShowRecord, { patterns: [], maps: [] }, { appVersion: 'D2' })
  const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle), { preserveAuthoringPhysicalRanges: true })
  expect(reopened.show).toEqual({
    ...expected, updatedAt: expect.any(Number),
    cells: expected.cells.map(cell => ({ ...cell, restartOnEntry: false })),
    transitions: [{ id: 'transition-s1', afterSceneId: 's1', durationMs: 0, kind: 'cut', easing: { curve: 'linear' } }],
  })
})

it('accepts stock input and a same-duration no-op without exposing another candidate', async () => {
  const show = openGrammarFixture().document.show
  const first = await runUtterance(scriptedAgent, { show: { ...show }, utterance: 'make the first Clip exactly eight seconds' }, undefined, true)
  expect(first.privateOutcome.kind).toBe('committed')
  const before = structuredClone(first.show)
  const repeated = await runUtterance(scriptedAgent, { show: { ...first.show! }, utterance: 'make the first Clip exactly eight seconds' }, undefined, true)
  expect(repeated.privateOutcome.kind).toBe('nothing-applied')
  expect(repeated.changed).toBe(false)
  expect(repeated.show).toBeUndefined()
  expect(repeated.summaries).toEqual([])
  expect(first.show).toEqual(before)
})

it.each(['malformed-endpoint', 'unknown-owner', 'invalid-composition', 'flat-personal'] as const)('refuses %s at service open without mutating the request', async fault => {
  const show = openGrammarFixture().document.show
  if (fault === 'malformed-endpoint') show.routingLayouts[0].zones = [{ zoneId: 'z1', ranges: [{ start: 0.5, end: 7 }] }]
  if (fault === 'unknown-owner') show.cells[0].zoneId = 'gone'
  if (fault === 'invalid-composition') show.composition!.scenes[0].zones[0].main[0].instanceId = 'gone'
  if (fault === 'flat-personal') {
    delete show.composition
    show.cells[0].pattern = { kind: 'user', id: 'personal-on-library' }
  }
  const before = structuredClone(show)
  const result = await runUtterance(scriptedAgent, { show: { ...show }, utterance: 'make the first Clip exactly eight seconds' }, undefined, true)
  expect(result.privateOutcome.kind).toBe('service-refused')
  expect(result.changed).toBe(false)
  expect(result.show).toBeUndefined()
  expect(result.summaries).toEqual([])
  expect(result.timing.toolCalls).toEqual([])
  expect(show).toEqual(before)
})

it('preserves the identical missing personal reference while editing around it', async () => {
  const show = openGrammarFixture().document.show
  show.composition!.patternInstances[0].pattern = { kind: 'user', id: 'personal-on-library' }
  const before = structuredClone(show)
  const result = await runUtterance(scriptedAgent, { show: { ...show }, utterance: 'make the first Clip exactly eight seconds' }, undefined, true)
  const expected = structuredClone(before)
  expected.composition!.scenes[0].zones[0].main[0].durationMs = 8000
  expect(result.privateOutcome.kind).toBe('committed')
  expect(result.show).toEqual({ ...expected, updatedAt: expect.any(Number) })
  expect(show).toEqual(before)
})

it.each(['new-reference', 'unknown-slider', 'invalid-final'] as const)('refuses %s and discards earlier private edits without exposing a candidate', async fault => {
  const show = openGrammarFixture({ emptySecondScene: true }).document.show
  show.composition!.patternInstances[0].pattern = { kind: 'user', id: 'personal-on-library' }
  const before = structuredClone(show)
  let calls = 0
  const result = await runUtterance({ name: 'unrepaired-authoring', run: async context => {
    calls += 1
    if (calls === 1) {
      await context.callTool('resize_clip', { session_id: context.sessionId, clip_id: context.listing.clips[0].clipId, duration_ms: 8000 })
      const args = fault === 'new-reference'
        ? { pointer: '/composition/patternInstances/0/pattern', value: { kind: 'user', id: 'new-personal-on-library' } }
        : fault === 'unknown-slider'
          ? { pointer: '/composition/patternInstances/0/controlTargets', value: { sliderInvented: 0.5 } }
          : { pointer: '/composition/scenes/0/zones/0/main/0/instanceId', value: 'gone' }
      const refusal = await context.callTool('set_field', { session_id: context.sessionId, ...args })
      expect(refusal.isError).toBe(true)
    }
    return { finalText: 'The edit was refused.', completion: { intent: 'refuse' } }
  } }, { show: { ...show }, utterance: 'Invalid final edit' })
  expect(calls).toBe(1)
  expect(result.privateOutcome.kind).toBe('refused')
  expect(result.changed).toBe(false)
  expect(result.show).toBeUndefined()
  expect(result.summaries).toEqual([])
  expect(show).toEqual(before)
})

it('rejects a final new missing personal dependency after one repair opportunity', async () => {
  const show = openGrammarFixture({ emptySecondScene: true }).document.show
  const before = structuredClone(show)
  let calls = 0
  const result = await runUtterance({ name: 'final-authoring', run: async context => {
    calls += 1
    if (calls === 1) {
      const added = await context.callTool('add_clip', { session_id: context.sessionId, zone_id: 'z1', start_ms: 35000, duration_ms: 10000, pattern_kind: 'user', pattern_id: 'new-personal-on-library' })
      expect(added.isError).toBe(false)
    }
    return { finalText: 'Added.', completion: { intent: 'apply' } }
  } }, { show: { ...show }, utterance: 'Add unavailable personal dependency' })
  expect(calls).toBe(2)
  expect(result.privateOutcome.kind).toBe('commit-refused')
  expect(result.changed).toBe(false)
  expect(result.show).toBeUndefined()
  expect(result.summaries).toEqual([])
  expect(show).toEqual(before)
})

it('keeps Portable capability mismatch authorable through the service', async () => {
  const show = openGrammarFixture().document.show
  show.cells[0].pattern = { kind: 'stock', id: 'AuroraSphere' }
  show.composition!.patternInstances[0].pattern = { kind: 'stock', id: 'AuroraSphere' }
  const before = structuredClone(show)
  expect(validateShowDocument(show).valid).toBe(false)
  const result = await runUtterance(scriptedAgent, { show: { ...show }, utterance: 'make the first Clip exactly eight seconds' }, undefined, true)
  const expected = structuredClone(before)
  expected.composition!.scenes[0].zones[0].main[0].durationMs = 8000
  expect(result.privateOutcome.kind).toBe('committed')
  expect(result.show).toEqual({ ...expected, updatedAt: expect.any(Number) })
  expect(validateShowDocument(result.show).valid).toBe(false)
  expect(show).toEqual(before)
})
