// Provenance: pxlblz-v3 test/grammarReferentArgs.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { dictationFixture } from '../experiment/fixtures.js'
import { SHOW_GRAMMAR_OPERATIONS } from '../grammar/registry.js'
import { createShowsServer } from '../mcp/showsServer.js'

// Test model (issue #35). Boundary: the generated MCP tools over a real
// client, with editor context set through the protocol. Invariants: clip_id
// and clip are mutually exclusive and one is required; a refused resolution
// is a typed refusal with no side effect (document byte-identical, no history
// entry); a unique resolution is indistinguishable in effect from the id.
// Partitions sampled pairwise over tool × source × cardinality: ordinal in a
// zone (unique), at_playhead with no playhead (none, names the missing
// context), at_playhead (unique), pattern_name over two matching clips
// (ambiguous), pattern_name matching nothing (none), stale selection (none).
// The editorFocus block: empty context and a hovered clip plus playhead.

describe('clip referents inside operations (#35)', () => {
  const client = new Client({ name: 'pxlblz-v3-test', version: '0.0.0' })
  let sessionId = ''
  let firstClipId = ''

  const callJson = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args })
    const content = result.content as Array<{ type: string; text: string }>
    let payload: unknown
    try {
      payload = JSON.parse(content[0].text)
    } catch {
      payload = { error: content[0].text }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only loose payload access (V3 origin)
    return { payload: payload as Record<string, any>, isError: result.isError === true }
  }
  const snapshot = async () => JSON.stringify((await callJson('export_show', { session_id: sessionId })).payload.show)
  const historyLength = async () =>
    ((await callJson('describe_changes', { session_id: sessionId })).payload.entries as unknown[]).length

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await createShowsServer().connect(serverTransport)
    await client.connect(clientTransport)
    const opened = await callJson('open_show', { show: dictationFixture('empty-second-scene') })
    sessionId = opened.payload.sessionId
    firstClipId = opened.payload.listing.clips[0].clipId
  })

  it('every clip_id operation also takes clip, and clip_id is no longer required', async () => {
    const { tools } = await client.listTools()
    const clipOperations = SHOW_GRAMMAR_OPERATIONS.filter((operation) => 'clip_id' in operation.inputShape)
    expect(clipOperations.length).toBeGreaterThanOrEqual(15)
    for (const operation of clipOperations) {
      const tool = tools.find((candidate) => candidate.name === operation.name)
      const schema = tool?.inputSchema as { properties: Record<string, unknown>; required?: string[] }
      expect(Object.keys(schema.properties), operation.name).toContain('clip')
      expect(schema.required ?? [], operation.name).not.toContain('clip_id')
      expect(tool?.description, operation.name).toContain('Instead of clip_id you may give clip')
    }
    const junctionTools = SHOW_GRAMMAR_OPERATIONS.filter((operation) => 'junction_id' in operation.inputShape)
    // Junctions are already addressed by at_ms or after_clip_id; there is no junction_id to replace.
    expect(junctionTools).toEqual([])
  })

  it('resolves an ordinal within a zone and applies the operation as if by id', async () => {
    const before = await snapshot()
    const { payload, isError } = await callJson('resize_clip', {
      session_id: sessionId, clip: { ordinal: 1, zone: 'Main' }, duration_ms: 12_000,
    })
    expect(isError).toBe(false)
    expect(payload.changes[0]).toMatchObject({ op: 'resize_clip', targetId: firstClipId })
    expect(await snapshot()).not.toBe(before)
    expect(await historyLength()).toBe(1)
  })

  it('refuses at_playhead when the context has no playhead, naming the missing pointer', async () => {
    const before = await snapshot()
    const { payload, isError } = await callJson('split_clip', {
      session_id: sessionId, clip: { at_playhead: true }, at_ms: 6_000,
    })
    expect(isError).toBe(true)
    expect(payload.issues[0].message).toContain('playhead')
    expect(await snapshot()).toBe(before)
    expect(await historyLength()).toBe(1)
  })

  it('resolves at_playhead once the context has one', async () => {
    await callJson('set_editor_context', { session_id: sessionId, playhead_ms: 6_000 })
    const { payload, isError } = await callJson('split_clip', {
      session_id: sessionId, clip: { at_playhead: true }, at_ms: 6_000,
    })
    expect(isError).toBe(false)
    expect(payload.listing.clips).toHaveLength(2)
  })

  it('refuses an ambiguous pattern name with the candidates and no side effect', async () => {
    const before = await snapshot()
    const entries = await historyLength()
    const { payload, isError } = await callJson('resize_clip', {
      session_id: sessionId, clip: { pattern_name: 'comet loom' }, duration_ms: 3_000,
    })
    expect(isError).toBe(true)
    expect(payload.issues[0]).toMatchObject({
      code: 'ambiguous-referent',
      remedy: expect.stringContaining('Ask the user'),
      candidates: expect.arrayContaining([firstClipId]),
    })
    expect(payload.issues[0].candidates).toHaveLength(2)
    expect(payload.candidates.map((candidate: { description: string }) => candidate.description)).toEqual([
      expect.stringContaining('CometLoom'),
      expect.stringContaining('CometLoom'),
    ])
    expect(await snapshot()).toBe(before)
    expect(await historyLength()).toBe(entries)
  })

  it('refuses a pattern name matching nothing with the nearest clips', async () => {
    const before = await snapshot()
    const { payload, isError } = await callJson('remove_clip', {
      session_id: sessionId, clip: { pattern_name: 'nothing like this' },
    })
    expect(isError).toBe(true)
    expect(payload.issues[0]).toMatchObject({ code: 'unknown-clip', message: expect.stringContaining('Nearest') })
    expect(await snapshot()).toBe(before)
  })

  it('needs exactly one of clip_id and clip', async () => {
    const both = await callJson('resize_clip', {
      session_id: sessionId, clip_id: firstClipId, clip: { hovered: true }, duration_ms: 4_000,
    })
    expect(both.isError).toBe(true)
    expect(both.payload.issues[0]).toMatchObject({ code: 'invalid-argument', message: expect.stringContaining('not both') })
    const neither = await callJson('resize_clip', { session_id: sessionId, duration_ms: 4_000 })
    expect(neither.isError).toBe(true)
    expect(neither.payload.issues[0]).toMatchObject({ code: 'invalid-argument' })
  })

  it('treats a stale selection as nothing matched, leaving the document unchanged', async () => {
    const described = await callJson('describe_show', { session_id: sessionId })
    const clips = described.payload.description.zones[0].layers[0].clips as Array<{ clipId: string }>
    const second = clips[1].clipId
    await callJson('set_editor_context', { session_id: sessionId, selected_clip_ids: [second] })
    const removed = await callJson('remove_clip', { session_id: sessionId, clip_id: second })
    expect(removed.isError).toBe(false)
    const before = await snapshot()
    const { payload, isError } = await callJson('resize_clip', {
      session_id: sessionId, clip: { selected: true }, duration_ms: 4_000,
    })
    expect(isError).toBe(true)
    expect(payload.issues[0].code).toBe('unknown-clip')
    expect(await snapshot()).toBe(before)
  })

  it('pre-resolves the editor focus in the projection', async () => {
    await callJson('set_editor_context', { session_id: sessionId })
    const empty = await callJson('describe_show', { session_id: sessionId })
    expect(empty.payload.description.editorFocus).toEqual({ hovered: null, selected: [], playhead: null })

    await callJson('set_editor_context', {
      session_id: sessionId, hovered_clip_id: firstClipId, selected_clip_ids: [firstClipId], playhead_ms: 2_000,
    })
    const focused = await callJson('describe_show', { session_id: sessionId })
    expect(focused.payload.description.editorFocus).toEqual({
      hovered: { id: firstClipId, kind: 'clip', description: expect.stringContaining('CometLoom') },
      selected: [expect.objectContaining({ id: firstClipId })],
      playhead: { ms: 2_000, clips: [expect.objectContaining({ id: firstClipId })] },
    })
  })
})
