// The bridge's authoring-validation boundary, re-authored on the version-2
// record for #1039.
//
// Invariants carried from the v1 suite: the request record is never mutated; a
// private edit that ends in refusal exposes no candidate; an unresolvable
// personal reference that was already unresolvable is tolerated while a new one
// is refused. What changed is where those land. The faults are v2 faults — a
// dangling Clip instanceId, a missing Layer, an unknown stock id — a new
// unavailable Pattern is now refused at the command rather than at commit, and
// the Portable capability check v1 ran no longer exists on this path; each of
// those is called out where it is asserted.
import { expect, it } from 'vitest'
import { createScriptedAgent, runUtterance } from '../bridge/service'
import { openGrammarFixture } from './support/grammarFixture'
import { createSessionStore } from '../grammar/session'
import { validateShowDocument } from '../shows/evaluate'

const scriptedAgent = createScriptedAgent()

it('accepts a resize and then reports a same-duration repeat as nothing applied', async () => {
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

it.each(['dangling-instance', 'missing-layer', 'unresolvable-pattern'] as const)(
  'refuses %s at service open without mutating the request',
  async (fault) => {
    const show = openGrammarFixture().document.show
    if (fault === 'dangling-instance') show.composition.clips[0].instanceId = 'gone'
    if (fault === 'missing-layer') show.composition.clips[0].layerId = 'gone'
    if (fault === 'unresolvable-pattern') {
      show.composition.patternInstances[0].pattern = { kind: 'stock', id: 'NoSuchPatternAnywhere' }
    }
    const before = structuredClone(show)
    const result = await runUtterance(scriptedAgent, { show: { ...show }, utterance: 'make the first Clip exactly eight seconds' }, undefined, true)
    expect(result.privateOutcome.kind).toBe('service-refused')
    expect(result.changed).toBe(false)
    expect(result.show).toBeUndefined()
    expect(result.summaries).toEqual([])
    expect(result.timing.toolCalls).toEqual([])
    expect(show).toEqual(before)
  },
)

it('preserves the identical missing personal reference while editing around it', async () => {
  const show = openGrammarFixture().document.show
  show.composition.patternInstances[0].pattern = { kind: 'user', id: 'personal-on-library' }
  const before = structuredClone(show)
  // The session opens it: editing needs the reference's identity, not its source.
  expect(createSessionStore({ authoringValidation: true }).open(show, [], { allowUnresolvedUserPatterns: true }).ok).toBe(true)
  const result = await runUtterance(scriptedAgent, { show: { ...show }, utterance: 'make the first Clip exactly eight seconds' }, undefined, true)
  expect(result.privateOutcome.kind).toBe('committed')
  const candidate = result.show as typeof show
  expect(candidate.composition.patternInstances[0].pattern).toEqual({ kind: 'user', id: 'personal-on-library' })
  expect(candidate.composition.clips[0].durationMs).toBe(8_000)
  expect(show).toEqual(before)
})

it('discards earlier private edits when the final edit is refused', async () => {
  const show = openGrammarFixture({ emptyTail: true }).document.show
  const before = structuredClone(show)
  let calls = 0
  const result = await runUtterance({ name: 'unrepaired-authoring', run: async context => {
    calls += 1
    if (calls === 1) {
      await context.callTool('resize_clip', { session_id: context.sessionId, clip_id: context.listing.clips[0].clipId, duration_ms: 8_000 })
      const refusal = await context.callTool('set_field', {
        session_id: context.sessionId,
        pointer: '/composition/clips/0/instanceId',
        value: 'gone',
      })
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

it('refuses a new unavailable personal dependency at the command, not at commit', async () => {
  // v1 admitted the Clip and refused the whole candidate at commit. The v2
  // catalogue needs trusted resolved Pattern exports to author a Clip at all, so
  // the refusal arrives at the command with `missing-dependency` and no private
  // edit is ever staged. The guarantee is stronger and is recorded as such.
  const show = openGrammarFixture({ emptyTail: true }).document.show
  const before = structuredClone(show)
  let calls = 0
  let issues: unknown
  const result = await runUtterance({ name: 'final-authoring', run: async context => {
    calls += 1
    if (calls === 1) {
      const added = await context.callTool('create_clips', {
        session_id: context.sessionId,
        clips: [{
          zone_id: 'z1',
          layer_id: context.listing.layers[0].layerId,
          start_ms: 35_000,
          duration_ms: 10_000,
          pattern: { kind: 'user', id: 'new-personal-on-library' },
        }],
      })
      expect(added.isError).toBe(true)
      issues = (added.payload as { issues?: Array<{ code: string }> }).issues
    }
    return { finalText: 'That Pattern is unavailable here.', completion: { intent: 'refuse' } }
  } }, { show: { ...show }, utterance: 'Add unavailable personal dependency' })
  expect(calls).toBe(1)
  expect(issues).toMatchObject([{ code: 'missing-dependency' }])
  expect(result.privateOutcome.kind).toBe('refused')
  expect(result.changed).toBe(false)
  expect(result.show).toBeUndefined()
  expect(result.summaries).toEqual([])
  expect(show).toEqual(before)
})

it('keeps a 3D-only stock Pattern on a Portable Show authorable through the service', async () => {
  // RESIDUAL (#1039): under v1 this Show was invalid — `validateShowDocument`
  // ran `validatePortableShowCompatibility`, which refused a 3D-only Pattern on
  // a portable-2d contract. The v2 authoring validator, the v2 prepared Stage
  // and the v2 compile path all accept it, so the harness accepts it too rather
  // than keeping a second opinion about validity. The lost diagnostic is
  // reported to the epic; this case pins the behavior that actually holds.
  const show = openGrammarFixture().document.show
  show.composition.patternInstances[0].pattern = { kind: 'stock', id: 'AuroraSphere' }
  show.composition.patternInstances[0].patternName = 'AuroraSphere'
  const before = structuredClone(show)
  expect(validateShowDocument(show).valid).toBe(true)
  const result = await runUtterance(scriptedAgent, { show: { ...show }, utterance: 'make the first Clip exactly eight seconds' }, undefined, true)
  expect(result.privateOutcome.kind).toBe('committed')
  const candidate = result.show as typeof show
  expect(candidate.composition.clips[0].durationMs).toBe(8_000)
  expect(show).toEqual(before)
})
