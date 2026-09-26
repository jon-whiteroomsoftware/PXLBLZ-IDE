// Provenance: pxlblz-v3 test/grammarMcp.e2e.test.ts at 9ecd481f, re-authored
// onto the version-2 catalogue for #1039 (see src/agent-harness/PROVENANCE.md).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { createShowsServer } from '../mcp/showsServer.js'
import { openGrammarFixture } from './support/grammarFixture.js'

// End-to-end over a real MCP client/server pair (#17): discovery of the
// generated grammar tools, a scripted authoring sequence, and error semantics
// for unknown ids and refusals — all on the v2 catalogue's own arguments.
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

  const openFixture = async (options: Parameters<typeof openGrammarFixture>[0] = {}) => {
    const fixture = openGrammarFixture(options)
    const { payload, isError } = await callJson('open_show', { show: fixture.document.show })
    expect(isError, JSON.stringify(payload)).toBe(false)
    return { fixture, sessionId: payload.sessionId as string, listing: payload.listing }
  }

  it('lists one generated tool per registry entry plus the session tools', async () => {
    const tools = await client.listTools()
    const names = tools.tools.map((tool) => tool.name)
    for (const expected of [
      'open_show',
      'export_show',
      'close_session',
      'resize_clip',
      'add_property_tracks',
      'edit_property_keyframes',
      'update_property_track',
      'remove_property_tracks',
    ]) {
      expect(names).toContain(expected)
    }
    const resize = tools.tools.find((tool) => tool.name === 'resize_clip')
    expect(resize?.description).toContain('ripples connected successors')
    const schema = resize?.inputSchema as { properties: Record<string, unknown> }
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['session_id', 'clip_id', 'duration_ms', 'end_ms']),
    )
  })

  it('exposes exact marker schemas and preserves export and history after no-op and refused requests', async () => {
    const tools = await client.listTools()
    for (const name of ['add_marker', 'update_marker']) {
      const schema = tools.tools.find((tool) => tool.name === name)!.inputSchema as {
        properties: Record<string, { type: string; maximum: number }>
      }
      expect(schema.properties.at_ms.type).toBe('integer')
      expect(schema.properties.at_ms.maximum).toBe(Number.MAX_SAFE_INTEGER)
    }
    const fixture = openGrammarFixture()
    fixture.document.show.composition.markers = [{ id: 'm', timeMs: 10, name: 'Existing' }]
    const { payload: opened } = await callJson('open_show', { show: fixture.document.show })
    const session_id = opened.sessionId
    const before = await callJson('export_show', { session_id })

    // A valid request that changes nothing is an accepted no-op: no changes, no
    // history entry, and the same record identity (catalogue rule 4).
    const noop = await callJson('update_marker', { session_id, marker_id: 'm', at_ms: 10 })
    expect(noop.isError).toBe(false)
    expect(noop.payload.changes).toEqual([])

    for (const args of [{ at_ms: -1 }, { at_ms: 0.5 }, { at_ms: Number.MAX_SAFE_INTEGER + 1 }, { name: null }, {}]) {
      expect(
        (await client.callTool({ name: 'update_marker', arguments: { session_id, marker_id: 'm', ...args } })).isError,
        JSON.stringify(args),
      ).toBe(true)
    }
    expect((await callJson('remove_marker', { session_id, marker_id: 'absent' })).isError).toBe(true)
    expect(await callJson('export_show', { session_id })).toEqual(before)
    expect((await callJson('undo', { session_id })).isError).toBe(true)
  })

  it('publishes the canonical Layer schema and creates a Layer through actual MCP', async () => {
    const tools = await client.listTools()
    // Stacking is authored by rank or by an explicit neighbour Layer; the v1
    // layer_index word retires with v1 addressing.
    const create = tools.tools.find((tool) => tool.name === 'create_layers')!.inputSchema
    const layerSpec = (create.properties!.layers as { items: { properties: Record<string, unknown>; required?: string[] } }).items
    expect(layerSpec.properties.zone_id).toMatchObject({ type: 'string' })
    expect(layerSpec.required).toContain('zone_id')
    expect(layerSpec.properties.rank).toMatchObject({ type: 'integer', minimum: 0 })
    for (const name of ['reorder_layer', 'remove_layer', 'rename_layer']) {
      const schema = tools.tools.find((tool) => tool.name === name)!.inputSchema
      expect(schema.properties?.layer_index, `${name} still takes a v1 layer_index`).toBeUndefined()
      expect(schema.required).toContain('layer_id')
    }

    const { sessionId: session_id } = await openFixture()
    const before = await callJson('export_show', { session_id })
    expect((await callJson('create_layers', { session_id, layers: [{ zone_id: 'absent' }] })).isError).toBe(true)
    expect(await callJson('export_show', { session_id })).toEqual(before)

    const added = await callJson('create_layers', { session_id, layers: [{ zone_id: 'z1', name: 'Over' }] })
    expect(added.isError, JSON.stringify(added.payload)).toBe(false)
    expect(added.payload.changes[0].details.layers).toHaveLength(1)
    const layerId = added.payload.changes[0].details.layers[0]
    // A Zone-owned Layer for the whole Show, stacked above Main.
    const afterAdd = await callJson('export_show', { session_id })
    const layer = afterAdd.payload.show.composition.layers.find((candidate: { id: string }) => candidate.id === layerId)
    expect(layer).toMatchObject({ zoneId: 'z1', name: 'Over', rank: 1 })

    expect((await callJson('undo', { session_id })).isError).toBe(false)
    expect(await callJson('export_show', { session_id })).toEqual(before)
  })

  it('publishes optional boolean independence and preserves duplicate export/Undo/Redo over MCP', async () => {
    const schema = (await client.listTools()).tools.find((tool) => tool.name === 'duplicate_clip')!.inputSchema
    expect(Object.keys(schema.properties ?? {}).sort())
      .toEqual(['clip', 'clip_id', 'independent', 'layer_id', 'session_id', 'start_ms', 'zone_id'])
    expect(schema.properties?.independent).toMatchObject({ type: 'boolean' })
    expect(schema.required).not.toContain('independent')

    const { sessionId: session_id } = await openFixture({ emptyTail: true })
    const before = await callJson('export_show', { session_id })
    expect((await client.callTool({
      name: 'duplicate_clip',
      arguments: { session_id, clip_id: 'clip-1', start_ms: 30_000, independent: 'yes' },
    })).isError).toBe(true)
    expect(await callJson('export_show', { session_id })).toEqual(before)

    const result = await callJson('duplicate_clip', { session_id, clip_id: 'clip-1', start_ms: 30_000 })
    expect(result.isError, JSON.stringify(result.payload)).toBe(false)
    // The default copy shares the source runtime: no new Pattern instance.
    expect(result.payload.changes[0].details.instances).toEqual([])
    const after = await callJson('export_show', { session_id })
    expect(after).not.toEqual(before)
    const copy = after.payload.show.composition.clips.find((clip: { startMs: number }) => clip.startMs === 30_000)
    expect(copy.instanceId).toBe('inst-1')

    expect((await callJson('undo', { session_id })).isError).toBe(false)
    expect(await callJson('export_show', { session_id })).toEqual(before)
    expect((await callJson('redo', { session_id })).isError).toBe(false)
    expect(await callJson('export_show', { session_id })).toEqual(after)
  })

  it('publishes numeric split time and preserves complete export/Undo/Redo over MCP', async () => {
    const schema = (await client.listTools()).tools.find((tool) => tool.name === 'split_clip')!.inputSchema
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(['at_ms', 'clip', 'clip_id', 'session_id'])
    expect(schema.properties?.at_ms).toMatchObject({ type: 'integer' })

    const { sessionId: session_id } = await openFixture()
    const before = await callJson('export_show', { session_id })
    // A split at the Clip's own boundary is not strictly inside it.
    expect((await callJson('split_clip', { session_id, clip_id: 'clip-1', at_ms: 30_000 })).isError).toBe(true)
    expect(await callJson('export_show', { session_id })).toEqual(before)

    const split = await callJson('split_clip', { session_id, clip_id: 'clip-1', at_ms: 16_000 })
    expect(split.isError, JSON.stringify(split.payload)).toBe(false)
    expect(split.payload.changes[0].details.clips).toContain('clip-1')
    const after = await callJson('export_show', { session_id })
    // The left piece keeps the identity; the right piece is new and shares the
    // source runtime with entry policy continue.
    const pieces = after.payload.show.composition.clips
      .filter((clip: { layerId: string }) => clip.layerId === 'layer:z1:main')
      .sort((left: { startMs: number }, right: { startMs: number }) => left.startMs - right.startMs)
    expect(pieces[0]).toMatchObject({ id: 'clip-1', startMs: 0, durationMs: 16_000 })
    expect(pieces[1]).toMatchObject({ startMs: 16_000, durationMs: 14_000, instanceId: 'inst-1', entryPolicy: 'continue' })

    expect((await callJson('undo', { session_id })).isError).toBe(false)
    expect(await callJson('export_show', { session_id })).toEqual(before)
    expect((await callJson('redo', { session_id })).isError).toBe(false)
    expect(await callJson('export_show', { session_id })).toEqual(after)
  })

  it('publishes the bulk removal schema and preserves complete export/Undo over MCP', async () => {
    const tools = await client.listTools()
    const schema = tools.tools.find((tool) => tool.name === 'remove_clips')!.inputSchema
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(['clip_ids', 'session_id'])
    expect(schema.properties?.clip_ids).toMatchObject({ type: 'array' })

    const { sessionId: session_id } = await openFixture()
    const before = await callJson('export_show', { session_id })
    expect((await callJson('remove_clips', { session_id, clip_ids: ['clip-2'] })).isError).toBe(false)
    const after = await callJson('export_show', { session_id })
    expect(after).not.toEqual(before)
    // Surviving positions and Show End stay fixed; the window becomes blank.
    expect(after.payload.show.composition.showEndMs).toBe(60_000)
    expect((await callJson('remove_clips', { session_id, clip_ids: ['clip-2'] })).isError).toBe(true)
    expect(await callJson('export_show', { session_id })).toEqual(after)
    expect((await callJson('undo', { session_id })).isError).toBe(false)
    expect(await callJson('export_show', { session_id })).toEqual(before)
    expect((await callJson('redo', { session_id })).isError).toBe(false)
    expect(await callJson('export_show', { session_id })).toEqual(after)
  })

  it("carries the owner's example end to end through the protocol", async () => {
    const { sessionId, listing } = await openFixture({ overlay: true })
    expect(sessionId.length).toBeGreaterThan(0)
    const overlay = (listing.clips as Array<{ clipId: string; layerName: string }>)
      .find((clip) => clip.layerName === 'Over')
    expect(overlay).toBeDefined()

    const { payload: resized, isError: resizeError } = await callJson('resize_clip', {
      session_id: sessionId,
      clip_id: overlay!.clipId,
      duration_ms: 12_000,
    })
    expect(resizeError, JSON.stringify(resized)).toBe(false)
    expect(resized.changes[0].description).toContain('0–12000 ms')

    const { payload: tracked, isError: trackError } = await callJson('add_property_tracks', {
      session_id: sessionId,
      tracks: [{
        target: { kind: 'opacity', clip_id: overlay!.clipId },
        keyframes: [
          { at_ms: 3_000, value: 0.8, easing: 'ease-in-out' },
          { at_ms: 8_000, value: 0.4, easing: 'ease-in-out' },
        ],
      }],
    })
    expect(trackError, JSON.stringify(tracked)).toBe(false)
    const trackId = tracked.changes[0].details.tracks[0] as string

    const { payload: edited, isError: keyframeError } = await callJson('edit_property_keyframes', {
      session_id: sessionId,
      track_id: trackId,
      edits: { add: [{ at_ms: 5_000, value: 0.6, easing: 'ease-in-out' }] },
    })
    expect(keyframeError, JSON.stringify(edited)).toBe(false)

    const { payload: exported, isError: exportError } = await callJson('export_show', {
      session_id: sessionId,
    })
    expect(exportError).toBe(false)
    const track = (exported.show.composition.propertyTracks as Array<{
      id: string
      keyframes: Array<{ timeMs: number; value: number; easing: { curve: string; direction?: string } }>
    }>).find((candidate) => candidate.id === trackId)
    expect(track?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([3_000, 5_000, 8_000])
    expect(track?.keyframes.map((keyframe) => keyframe.value)).toEqual([0.8, 0.6, 0.4])
    for (const keyframe of track?.keyframes ?? []) {
      expect(keyframe.easing).toEqual({ curve: 'quadratic', direction: 'in-out' })
    }

    const { payload: validated, isError: validateError } = await callJson('validate_show', {
      show: exported.show,
    })
    expect(validateError).toBe(false)
    expect(validated.valid, JSON.stringify(validated.errors)).toBe(true)
  })

  it('surfaces refusals and unknown ids as tool errors with typed issues', async () => {
    const { sessionId, listing } = await openFixture()
    const clips = listing.clips as Array<{ clipId: string; startMs: number }>
    const first = clips.find((clip) => clip.startMs === 0)!

    // The neighbour Clip occupies 30 000 ms onward on the same Layer.
    const { payload: refused, isError: refusedIsError } = await callJson('resize_clip', {
      session_id: sessionId,
      clip_id: first.clipId,
      duration_ms: 40_000,
    })
    expect(refusedIsError, JSON.stringify(refused)).toBe(true)
    expect(refused.issues[0].code).toBe('invalid-result')
    expect(refused.issues[0].message).toContain('Clips on one Zone and Layer cannot overlap')

    const { payload: unknownClip, isError: unknownClipIsError } = await callJson('resize_clip', {
      session_id: sessionId,
      clip_id: 'nope',
      duration_ms: 1_000,
    })
    expect(unknownClipIsError).toBe(true)
    expect(unknownClip.issues[0].code).toBe('unknown-id')
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
    const { fixture, sessionId, listing } = await openFixture({ emptyTail: true })
    const clip = (listing.clips as Array<{ clipId: string; startMs: number }>)
      .find((candidate) => candidate.startMs === 0)!

    // Two exactly adjacent Clips with a Property activation on the second.
    await callJson('resize_clip', { session_id: sessionId, clip_id: clip.clipId, duration_ms: 10_000 })
    const { payload: created } = await callJson('create_clips', {
      session_id: sessionId,
      clips: [{
        zone_id: 'z1', layer_id: 'layer:z1:main', start_ms: 10_000, duration_ms: 10_000,
        pattern: { kind: 'stock', id: 'TestPattern2D' },
      }],
    })
    const secondClipId = (created.changes[0].details.clips as string[])
      .find((id) => id !== clip.clipId)!
    await callJson('add_property_tracks', {
      session_id: sessionId,
      tracks: [{
        target: { kind: 'view-brightness', clip_id: secondClipId },
        keyframes: [{ at_ms: 10_000, value: 1 }, { at_ms: 20_000, value: 0.2 }],
      }],
    })
    const settled = await callJson('export_show', { session_id: sessionId })

    const { isError: beginError } = await callJson('begin_edit', {
      session_id: sessionId,
      label: 'protocol txn',
    })
    expect(beginError).toBe(false)

    // A participant Transition beside that activation is accepted into the
    // working copy — the Transition owner's own candidate is valid...
    const { payload: inserted, isError: insertError } = await callJson('insert_transition', {
      session_id: sessionId,
      from_clip_id: clip.clipId,
      to_clip_id: secondClipId,
      duration_ms: 2_000,
      kind: 'crossfade',
    })
    expect(insertError, JSON.stringify(inserted)).toBe(false)

    // ...and refused at commit with the typed tier-0 issue: the compiler cannot
    // split a participant Transition across the derived section boundary a
    // section-scoped activation needs.
    const { payload: refused, isError: refusedIsError } = await callJson('commit_edit', {
      session_id: sessionId,
    })
    expect(refusedIsError).toBe(true)
    expect(refused.issues[0].code).toBe('result-invalid')
    expect(refused.issues[0].message).toContain('A property track or held appearance change cannot start or end inside Transition')
    expect(refused.issues[0].remedy).toContain('rollback_edit')

    // Fix inside the still-open transaction, add a real edit, and commit.
    const transitionId = inserted.changes[0].details.transitions[0] as string
    await callJson('remove_transition', { session_id: sessionId, transition_id: transitionId })
    await callJson('rename_show', { session_id: sessionId, name: 'Renamed in a transaction' })
    const { payload: committed, isError: commitError } = await callJson('commit_edit', {
      session_id: sessionId,
    })
    expect(commitError, JSON.stringify(committed)).toBe(false)
    expect(committed.label).toBe('protocol txn')
    expect(committed.summary).toContain('Renamed in a transaction')

    // The whole transaction is one history entry on top of the three settled edits.
    const { payload: described } = await callJson('describe_changes', { session_id: sessionId })
    expect(described.entries).toHaveLength(4)

    const { payload: undone, isError: undoError } = await callJson('undo', { session_id: sessionId })
    expect(undoError).toBe(false)
    expect(undone.summary).toContain('protocol txn')
    const { payload: reExported } = await callJson('export_show', { session_id: sessionId })
    expect(reExported.show).toEqual(settled.payload.show)
    expect(reExported.show).not.toEqual(fixture.document.show)

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
    const { sessionId, listing } = await openFixture()
    const clip = (listing.clips as Array<{ clipId: string; startMs: number }>)
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
    const { sessionId, listing } = await openFixture({ overlay: true })
    const overlay = (listing.clips as Array<{ clipId: string; layerName: string }>)
      .find((candidate) => candidate.layerName === 'Over')!

    const { payload: tracked, isError: trackError } = await callJson('add_property_tracks', {
      session_id: sessionId,
      tracks: [{
        target: { kind: 'opacity', clip_id: overlay.clipId },
        keyframes: [
          { at_ms: 3_000, value: 0.8 },
          { at_ms: 8_000, value: 0.4 },
        ],
      }],
    })
    expect(trackError, JSON.stringify(tracked)).toBe(false)
    const { payload: evaluated, isError } = await callJson('evaluate_property_at', {
      session_id: sessionId,
      track_id: tracked.changes[0].details.tracks[0],
      at_ms: 5_500,
    })
    expect(isError).toBe(false)
    expect(evaluated.evaluation.value).toBeCloseTo(0.6, 5)
  })

  it('closes a session through the protocol', async () => {
    const { sessionId } = await openFixture()

    const { isError: closeError } = await callJson('close_session', { session_id: sessionId })
    expect(closeError).toBe(false)

    const { payload: after, isError: afterIsError } = await callJson('export_show', {
      session_id: sessionId,
    })
    expect(afterIsError).toBe(true)
    expect(after.issues[0].code).toBe('unknown-session')
  })

  it('rejects an invalid document at open_show with typed issues', async () => {
    const { payload, isError } = await callJson('open_show', { show: '{"composition": [' })
    expect(isError).toBe(true)
    expect(payload.issues[0].code).toBe('open-failed')
  })
})
