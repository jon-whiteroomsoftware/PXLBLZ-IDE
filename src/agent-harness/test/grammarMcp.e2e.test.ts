// Provenance: pxlblz-v3 test/grammarMcp.e2e.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { createShowsServer } from '../mcp/showsServer.js'
import { openGrammarFixture } from './support/grammarFixture.js'

// End-to-end over a real MCP client/server pair (#17): discovery of the
// generated grammar tools, the owner's example as a scripted sequence, and
// error semantics for unknown ids and refusals.
describe('grammar tools over MCP (#17)', () => {
  const client = new Client({ name: 'pxlblz-v3-test', version: '0.0.0' })

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await createShowsServer().connect(serverTransport)
    await client.connect(clientTransport)
  })

  const callJson = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args })
    const content = result.content as Array<{ type: string; text: string }>
    expect(content).toHaveLength(1)
    return { payload: JSON.parse(content[0].text), isError: result.isError === true }
  }

  it('lists one generated tool per registry entry plus the session tools', async () => {
    const tools = await client.listTools()
    const names = tools.tools.map((tool) => tool.name)
    for (const expected of [
      'open_show',
      'export_show',
      'close_session',
      'resize_clip',
      'add_property_track',
      'add_keyframe',
      'update_keyframe',
      'delete_keyframe',
    ]) {
      expect(names).toContain(expected)
    }
    const resize = tools.tools.find((tool) => tool.name === 'resize_clip')
    expect(resize?.description).toContain('global timeline')
    const schema = resize?.inputSchema as { properties: Record<string, unknown> }
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['session_id', 'clip_id', 'duration_ms', 'end_ms']),
    )
  })

  it("carries the owner's example end to end through the protocol", async () => {
    const fixture = openGrammarFixture({ overlay: true })
    const { payload: opened, isError: openError } = await callJson('open_show', {
      show: fixture.document.show,
    })
    expect(openError).toBe(false)
    const sessionId = opened.sessionId as string
    expect(sessionId.length).toBeGreaterThan(0)
    const overlay = (opened.listing.clips as Array<{ clipId: string; layer: { kind: string } }>)
      .find((clip) => clip.layer.kind === 'overlay')
    expect(overlay).toBeDefined()

    const { payload: resized, isError: resizeError } = await callJson('resize_clip', {
      session_id: sessionId,
      clip_id: overlay!.clipId,
      duration_ms: 12_000,
    })
    expect(resizeError).toBe(false)
    expect(resized.changes[0].description).toContain('12000 ms')

    const { payload: tracked, isError: trackError } = await callJson('add_property_track', {
      session_id: sessionId,
      clip_id: overlay!.clipId,
      target: 'opacity',
      keyframes: [
        { time_ms: 3_000, value: 0.8, easing: 'ease-in-out' },
        { time_ms: 8_000, value: 0.4, easing: 'ease-in-out' },
      ],
    })
    expect(trackError).toBe(false)
    const trackId = tracked.changes[0].targetId as string

    const { isError: keyframeError } = await callJson('add_keyframe', {
      session_id: sessionId,
      track_id: trackId,
      time_ms: 5_000,
      value: 0.6,
      easing: 'ease-in-out',
    })
    expect(keyframeError).toBe(false)

    const { payload: exported, isError: exportError } = await callJson('export_show', {
      session_id: sessionId,
    })
    expect(exportError).toBe(false)
    const scene = (exported.show.composition.scenes as Array<{
      sceneId: string
      propertyTracks?: Array<{
        id: string
        keyframes: Array<{ timeMs: number; value: number; easing: { curve: string } }>
      }>
    }>).find((candidate) => candidate.sceneId === 's1')
    const track = scene?.propertyTracks?.find((candidate) => candidate.id === trackId)
    expect(track?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([3_000, 5_000, 8_000])
    expect(track?.keyframes.map((keyframe) => keyframe.value)).toEqual([0.8, 0.6, 0.4])
    for (const keyframe of track?.keyframes ?? []) {
      expect(keyframe.easing).toEqual({ curve: 'quadratic', direction: 'in-out' })
    }

    const { payload: validated, isError: validateError } = await callJson('validate_show', {
      show: exported.show,
    })
    expect(validateError).toBe(false)
    expect(validated.valid).toBe(true)
  })

  it('surfaces refusals and unknown ids as tool errors with typed issues', async () => {
    const fixture = openGrammarFixture()
    const { payload: opened } = await callJson('open_show', { show: fixture.document.show })
    const sessionId = opened.sessionId as string
    const clips = opened.listing.clips as Array<{ clipId: string; startMs: number }>
    const first = clips.find((clip) => clip.startMs === 0)!

    const { payload: refused, isError: refusedIsError } = await callJson('resize_clip', {
      session_id: sessionId,
      clip_id: first.clipId,
      duration_ms: 40_000,
    })
    expect(refusedIsError).toBe(true)
    expect(refused.issues[0].code).toBe('overlap')
    expect(refused.issues[0].remedy).toBeTruthy()

    const { payload: unknownClip, isError: unknownClipIsError } = await callJson('resize_clip', {
      session_id: sessionId,
      clip_id: 'nope',
      duration_ms: 1_000,
    })
    expect(unknownClipIsError).toBe(true)
    expect(unknownClip.issues[0].code).toBe('unknown-clip')
    expect(unknownClip.issues[0].candidates).toContain(first.clipId)

    const { payload: unknownSession, isError: unknownSessionIsError } = await callJson('resize_clip', {
      session_id: 'show-999',
      clip_id: first.clipId,
      duration_ms: 1_000,
    })
    expect(unknownSessionIsError).toBe(true)
    expect(unknownSession.issues[0].code).toBe('unknown-session')
    expect(unknownSession.issues[0].candidates).toContain(sessionId)
  })

  it('drives a transaction round trip through the protocol, including a refused commit', async () => {
    const fixture = openGrammarFixture({ emptySecondScene: true })
    const { payload: opened } = await callJson('open_show', { show: fixture.document.show })
    const sessionId = opened.sessionId as string
    const clip = (opened.listing.clips as Array<{ clipId: string; startMs: number }>)
      .find((candidate) => candidate.startMs === 0)!

    const { isError: beginError } = await callJson('begin_edit', {
      session_id: sessionId,
      label: 'protocol txn',
    })
    expect(beginError).toBe(false)

    // An unresolvable user pattern is accepted into the working copy...
    const { payload: added, isError: addError } = await callJson('add_clip', {
      session_id: sessionId,
      zone_id: 'z1',
      start_ms: 35_000,
      duration_ms: 5_000,
      pattern_kind: 'user',
      pattern_id: 'no-such-pattern',
    })
    expect(addError).toBe(false)

    // ...and refused at commit with the typed tier-0 issues.
    const { payload: refused, isError: refusedIsError } = await callJson('commit_edit', {
      session_id: sessionId,
    })
    expect(refusedIsError).toBe(true)
    expect(refused.issues[0].code).toBe('result-invalid')
    expect(refused.issues[0].remedy).toContain('rollback_edit')

    // Fix inside the still-open transaction, add a real edit, and commit.
    await callJson('remove_clip', { session_id: sessionId, clip_id: added.changes[0].targetId })
    await callJson('resize_clip', { session_id: sessionId, clip_id: clip.clipId, duration_ms: 12_000 })
    const { payload: committed, isError: commitError } = await callJson('commit_edit', {
      session_id: sessionId,
    })
    expect(commitError).toBe(false)
    expect(committed.label).toBe('protocol txn')
    expect(committed.summary).toContain('12000 ms')

    const { payload: described } = await callJson('describe_changes', { session_id: sessionId })
    expect(described.entries).toHaveLength(1)

    const { payload: undone, isError: undoError } = await callJson('undo', { session_id: sessionId })
    expect(undoError).toBe(false)
    expect(undone.summary).toContain('protocol txn')
    const { payload: reExported } = await callJson('export_show', { session_id: sessionId })
    expect(reExported.show).toEqual(fixture.document.show)

    const { isError: redoError } = await callJson('redo', { session_id: sessionId })
    expect(redoError).toBe(false)

    const { payload: spent, isError: spentIsError } = await callJson('redo', { session_id: sessionId })
    expect(spentIsError).toBe(true)
    expect(spent.issues[0].code).toBe('history-exhausted')
  })

  it('serves the operating rules as server instructions and on id-taking tools', async () => {
    const instructions = client.getInstructions()
    expect(instructions).toContain('Resolve before acting')
    expect(instructions).toContain('never guess')
    expect(instructions).toContain('One transaction per user turn')

    const tools = await client.listTools()
    const resize = tools.tools.find((tool) => tool.name === 'resize_clip')
    expect(resize?.description).toContain('resolve before acting')
  })

  it('round-trips editor context and drives resolve-then-operate through the protocol', async () => {
    const fixture = openGrammarFixture()
    const { payload: opened } = await callJson('open_show', { show: fixture.document.show })
    const sessionId = opened.sessionId as string
    const clip = (opened.listing.clips as Array<{ clipId: string; startMs: number }>)
      .find((candidate) => candidate.startMs === 0)!

    const { payload: emptyContext } = await callJson('get_editor_context', { session_id: sessionId })
    expect(emptyContext.context).toEqual({})

    const { isError: setError } = await callJson('set_editor_context', {
      session_id: sessionId,
      hovered_clip_id: clip.clipId,
      playhead_ms: 45_000,
    })
    expect(setError).toBe(false)
    const { payload: readContext } = await callJson('get_editor_context', { session_id: sessionId })
    expect(readContext.context).toEqual({ hoveredClipId: clip.clipId, playheadMs: 45_000 })

    // "That clip" resolves through hover; then the operation uses the id.
    const { payload: resolved, isError: resolveError } = await callJson('resolve_reference', {
      session_id: sessionId,
      hovered: true,
    })
    expect(resolveError).toBe(false)
    expect(resolved.resolution).toBe('unique')
    const { isError: resizeError } = await callJson('resize_clip', {
      session_id: sessionId,
      clip_id: resolved.candidates[0].id,
      duration_ms: 12_000,
    })
    expect(resizeError).toBe(false)

    const { payload: described, isError: describeError } = await callJson('describe_show', {
      session_id: sessionId,
    })
    expect(describeError).toBe(false)
    const mainClips = described.description.zones[0].layers[0].clips as Array<{ clipId: string; durationMs: number }>
    expect(mainClips.find((candidate) => candidate.clipId === clip.clipId)?.durationMs).toBe(12_000)
  })

  it('evaluates a property track at a time through the protocol', async () => {
    const fixture = openGrammarFixture({ overlay: true })
    const { payload: opened } = await callJson('open_show', { show: fixture.document.show })
    const sessionId = opened.sessionId as string
    const overlay = (opened.listing.clips as Array<{ clipId: string; layer: { kind: string } }>)
      .find((candidate) => candidate.layer.kind === 'overlay')!

    const { payload: tracked } = await callJson('add_property_track', {
      session_id: sessionId,
      clip_id: overlay.clipId,
      target: 'opacity',
      keyframes: [
        { time_ms: 3_000, value: 0.8 },
        { time_ms: 8_000, value: 0.4 },
      ],
    })
    const { payload: evaluated, isError } = await callJson('evaluate_property_at', {
      session_id: sessionId,
      track_id: tracked.changes[0].targetId,
      at_ms: 5_500,
    })
    expect(isError).toBe(false)
    expect(evaluated.evaluation.value).toBeCloseTo(0.6, 5)
  })

  it('closes a session through the protocol', async () => {
    const fixture = openGrammarFixture()
    const { payload: opened } = await callJson('open_show', { show: fixture.document.show })
    const sessionId = opened.sessionId as string

    const { isError: closeError } = await callJson('close_session', { session_id: sessionId })
    expect(closeError).toBe(false)

    const { payload: after, isError: afterIsError } = await callJson('export_show', {
      session_id: sessionId,
    })
    expect(afterIsError).toBe(true)
    expect(after.issues[0].code).toBe('unknown-session')
  })

  it('rejects an invalid document at open_show with typed issues', async () => {
    const { payload, isError } = await callJson('open_show', { show: '{"cells": [' })
    expect(isError).toBe(true)
    expect(payload.issues[0].code).toBe('open-failed')
  })
})
