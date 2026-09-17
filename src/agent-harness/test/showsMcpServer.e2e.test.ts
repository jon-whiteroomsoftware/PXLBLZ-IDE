// Provenance: pxlblz-v3 test/showsMcpServer.e2e.test.ts at 9ecd481f, re-authored
// onto the version-2 vocabulary for #1039 (see src/agent-harness/PROVENANCE.md).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { commandFixtureV2 } from '@/engine/showCommandsV2/fixtures'
import { SHOW_COMMANDS_V2 } from '@/engine/showCommandsV2/registry'
import { createShowsServer } from '../mcp/showsServer.js'
import { toShowRecordV2 } from './support/convertFixture.js'

// End-to-end over a real MCP client/server pair: registration, discovery,
// and the tools through the protocol layer. The subject is a version-2 record
// throughout — the flip made the v2 catalogue the discovery default, so no
// retired v1 name may be reachable here.
describe('pxlblz-shows MCP server (#7)', () => {
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
    expect(content[0].type).toBe('text')
    return { payload: JSON.parse(content[0].text), isError: result.isError === true }
  }

  /** The stock catalogue entry as the version-2 record the app's converter makes. */
  const stockShowV2 = () => toShowRecordV2(structuredClone(STOCK_SHOWS[0].show), STOCK_SHOWS[0].name)

  it('advertises the catalogue\'s bounded domains and rejects malformed protocol arguments', async () => {
    const tools = await client.listTools()
    const update = tools.tools.find((tool) => tool.name === 'update_clips')!
    const patch = (update.inputSchema.properties!.updates as {
      items: { properties: Record<string, unknown> }
    }).items.properties
    // The catalogue's own domains reach the wire: an enum stays an enum and a
    // bounded number keeps its bounds, so the protocol layer refuses an
    // out-of-domain value before any owner runs.
    expect(patch.entry_policy).toMatchObject({ type: 'string', enum: ['continue', 'restart'] })
    expect(patch.zone_sample_mode).toMatchObject({ type: 'string', enum: ['independent', 'span', 'repeat'] })
    expect(patch.start_ms).toMatchObject({ type: 'integer', minimum: 0 })

    for (const update of [
      { clip_id: 'clip-a', entry_policy: 'resume' },
      { clip_id: 'clip-a', zone_sample_mode: 'overlay' },
      { clip_id: 'clip-a', start_ms: -1 },
      { clip_id: 'clip-a', start_ms: 0.5 },
    ]) {
      const result = await client.callTool({
        name: 'update_clips',
        arguments: { session_id: 'schema-only', updates: [update] },
      })
      expect(result.isError, JSON.stringify(update)).toBe(true)
      expect(JSON.stringify(result.content)).toContain(Object.keys(update)[1])
    }
  })

  it('exposes the evaluation, critique, measurement, catalogue, and grammar tools', async () => {
    const tools = await client.listTools()
    const names = tools.tools.map((tool) => tool.name).sort()
    expect(names).toEqual([
      'add_clip_effect',
      'add_layout_interval',
      'add_marker',
      'add_property_tracks',
      'apply_patch',
      'begin_edit',
      'close_session',
      'commit_edit',
      'compile_show',
      'create_clips',
      'create_layers',
      'critique_show',
      'describe_changes',
      'describe_show',
      'duplicate_clip',
      'duplicate_clip_effect',
      'duplicate_group_occurrence',
      'duplicate_layout_interval',
      'edit_property_keyframes',
      'evaluate_property_at',
      'export_show',
      'get_editor_context',
      'get_stock_pattern',
      'insert_time',
      'insert_transition',
      'list_stock_patterns',
      'make_clip_pattern_independent',
      'make_group_unique',
      'make_layout_interval_unique',
      'measure_show',
      'move_clip_effect',
      'move_group_occurrence',
      'move_layout_switch',
      'open_show',
      'redo',
      'rejoin_clip_pattern_instance',
      'remove_clip_effect',
      'remove_clips',
      'remove_layer',
      'remove_layout_interval',
      'remove_marker',
      'remove_property_tracks',
      'remove_transition',
      'rename_layer',
      'rename_show',
      'reorder_layer',
      'replace_clip_pattern',
      'resize_clip',
      'resize_transition',
      'resolve_reference',
      'rollback_edit',
      'select_layout',
      'set_editor_context',
      'set_field',
      'set_layout_transfer',
      'set_output_contract',
      'set_output_trails',
      'set_show_end',
      'set_stage_map',
      'set_target_controller_profile',
      'split_clip',
      'undo',
      'ungroup',
      'update_clip_effect',
      'update_clips',
      'update_layout_interval',
      'update_marker',
      'update_property_track',
      'update_transition',
      'update_zone',
      'validate_show',
    ])
    // Every authored tool is a catalogue entry under its own name: the server
    // registers the production catalogue, it does not keep a second vocabulary.
    for (const command of SHOW_COMMANDS_V2) expect(names).toContain(command.name)
  })

  it('registers no retired version-1 command name', async () => {
    const tools = await client.listTools()
    const names = new Set(tools.tools.map((tool) => tool.name))
    for (const retired of [
      'add_clip', 'add_keyframe', 'add_overlay_layer', 'add_property_track',
      'delete_keyframe', 'delete_property_track', 'insert_layer_transition',
      'move_clip', 'move_connected_clip', 'move_marker', 'remove_clip',
      'remove_overlay_layer', 'reorder_overlay_layer', 'reset_layer_transition_to_cut',
      'resize_layer_transition', 'restart_clip', 'set_boundary_layout',
      'set_boundary_transition', 'set_boundary_transition_timing', 'set_clip_aperture',
      'set_clip_control_target', 'set_clip_evaluation', 'set_clip_opacity',
      'set_clip_time', 'set_clip_transform', 'set_clip_view',
      'update_boundary_transition_parameter', 'update_keyframe',
    ]) {
      expect(names.has(retired), `retired v1 tool ${retired} is still advertised`).toBe(false)
    }
  })

  // #12 acceptance: the full authoring loop — validate, critique, compile,
  // measure — against one Show in a single client session.
  it('drives validate → critique → compile → measure in one session', async () => {
    const show = stockShowV2()

    const { payload: validated, isError: validateError } = await callJson('validate_show', { show })
    expect(validateError).toBe(false)
    expect(validated.valid, JSON.stringify(validated.errors)).toBe(true)

    const { payload: critique, isError: critiqueError } = await callJson('critique_show', { show })
    expect(critiqueError).toBe(false)
    expect(Array.isArray(critique.findings)).toBe(true)

    const { payload: compiled, isError: compileError } = await callJson('compile_show', { show })
    expect(compileError).toBe(false)
    expect(compiled.ok).toBe(true)

    const { payload: measured, isError: measureError } = await callJson('measure_show', {
      show,
      duration_seconds: 10,
    })
    expect(measureError).toBe(false)
    expect(measured.ok).toBe(true)
    expect(measured.flickerGatePassed).toBe(true)
    expect(measured.report.summary).toContain('Flicker gate passed')
    expect(measured.report.input.frameCount).toBe(600)
    expect(measured.compile.artifactBytes).toBe(compiled.summary.artifactBytes)
  })

  it('measure_show marks a flicker-gate failure as a tool error carrying the full report', async () => {
    const strobeShow = {
      ...commandFixtureV2(),
      id: 'e2e-strobe',
      name: 'Strobe',
    }
    strobeShow.composition = {
      ...strobeShow.composition,
      patternInstances: strobeShow.composition.patternInstances.map((instance) => ({
        ...instance,
        pattern: { kind: 'user' as const, id: 'strobe' },
        patternName: 'strobe',
      })),
    }
    const strobeSource =
      'var t = 0\nexport function beforeRender(delta) { t += delta }\n' +
      'export function render2D(index, x, y) { var on = floor(t / 50) % 2\n rgb(on, on, on) }'
    const { payload, isError } = await callJson('measure_show', {
      show: strobeShow,
      inline_patterns: [{ id: 'strobe', source: strobeSource }],
    })
    expect(isError).toBe(true)
    expect(payload.ok, JSON.stringify(payload).slice(0, 400)).toBe(true)
    expect(payload.flickerGatePassed).toBe(false)
    expect(payload.report.summary).toContain('FLICKER GATE FAILED')
  })

  it('critique_show returns advisory findings and defers legality to validate_show', async () => {
    const { payload, isError } = await callJson('critique_show', { show: stockShowV2() })
    expect(isError).toBe(false)
    expect(Array.isArray(payload.findings)).toBe(true)
    for (const finding of payload.findings) expect(finding.severity).toBe('suggestion')

    const { payload: invalid, isError: invalidIsError } = await callJson('critique_show', {
      show: '{"not": "a show"}',
    })
    expect(invalidIsError).toBe(true)
    expect(invalid.error).toContain('validate_show')
  })

  it('lists and fetches stock patterns through the protocol', async () => {
    const { payload: listing, isError } = await callJson('list_stock_patterns', {})
    expect(isError).toBe(false)
    expect(listing.length).toBeGreaterThan(50)
    const twoD = listing.find((entry: { dimensions: number }) => entry.dimensions === 2)
    const { payload: detail } = await callJson('get_stock_pattern', { id: twoD.id })
    expect(detail.source.length).toBeGreaterThan(0)
    const { payload: missing, isError: missingIsError } = await callJson('get_stock_pattern', {
      id: 'NoSuchPattern',
    })
    expect(missingIsError).toBe(true)
    expect(missing.error).toContain('list_stock_patterns')
  })

  it('serves the version-2 schema, data-model and authoring resources', async () => {
    const resources = await client.listResources()
    const uris = resources.resources.map((resource) => resource.uri).sort()
    expect(uris).toEqual([
      'pxlblz://docs/clip-layer-authoring/v2',
      'pxlblz://docs/show-data-model',
      'pxlblz://schemas/clip-layer-authoring/v2',
      'pxlblz://schemas/show-record',
    ])

    const schema = await client.readResource({ uri: 'pxlblz://schemas/show-record' })
    const schemaDoc = JSON.parse((schema.contents[0] as { text: string }).text)
    expect(schemaDoc.$ref).toBe('#/$defs/ShowRecordV2')

    const dataModel = await client.readResource({ uri: 'pxlblz://docs/show-data-model' })
    const text = (dataModel.contents[0] as { text: string }).text
    for (const term of ['Layer', 'Zone Layout', 'Clip', 'Transition', 'Layout occurrence', 'Output contract', 'Budgets']) {
      expect(text, `the data model no longer names ${term}`).toContain(term)
    }
    // No retired v1 record field is described as authorable: an agent reading
    // this must not emit one. The retirement is stated once, in prose.
    for (const retired of ['routingLayouts', 'sceneSpan', 'sceneId', 'adaptations', '`scenes`', '`cells`']) {
      expect(text, `the data model still names ${retired}`).not.toContain(retired)
    }
    expect(text).toContain('There are no Scenes, no Cells')
    const authoring = await client.readResource({ uri: 'pxlblz://docs/clip-layer-authoring/v2' })
    const authoringText = (authoring.contents[0] as { text: string }).text
    // The two contracts the harness adapter depends on: the affected-entity
    // result it maps onto its change list, and the uniform accepted no-op.
    expect(authoringText).toContain('affected collections in `changes[].details`')
    expect(authoringText).toContain('returns `unchanged` with no changes')
  })

  it('executes bulk creation and shared-instance update through the diagnostic protocol adapter', async () => {
    const opened = await callJson('open_show', { show: commandFixtureV2() })
    expect(opened.isError, JSON.stringify(opened.payload)).toBe(false)
    const sessionId = opened.payload.sessionId as string

    const created = await callJson('create_clips', {
      session_id: sessionId,
      clips: [{
        zone_id: 'left',
        layer_id: 'over',
        start_ms: 8_000,
        duration_ms: 1_000,
        // No runtime exists yet for this source, so "sole" creates the first.
        pattern: { kind: 'stock', id: 'CometLoom' },
        instance: 'sole',
      }],
    })
    expect(created.isError, JSON.stringify(created.payload)).toBe(false)
    expect(created.payload.changes).toHaveLength(1)
    expect(created.payload.changes[0].op).toBe('create_clips')
    expect(created.payload.changes[0].details.clips).toHaveLength(1)

    // clip-a and clip-b share runtime inst-a: a Pattern-instance value written
    // through one of them is reported as affecting the other too.
    const updated = await callJson('update_clips', {
      session_id: sessionId,
      updates: [{ clip_id: 'clip-a', instance_properties: { time_scale: 0.5 } }],
    })
    expect(updated.isError, JSON.stringify(updated.payload)).toBe(false)
    expect(updated.payload.changes).toHaveLength(1)
    expect(updated.payload.changes[0].details.instances).toEqual(['inst-a'])
    expect(updated.payload.changes[0].details.clips).toEqual(expect.arrayContaining(['clip-a', 'clip-b']))

    const exported = await callJson('export_show', { session_id: sessionId })
    expect(exported.isError).toBe(false)
    const instance = exported.payload.show.composition.patternInstances
      .find((candidate: { id: string }) => candidate.id === 'inst-a')
    expect(instance.time.timeScale).toBe(0.5)
  })

  it('validate_show passes a stock Show through the protocol', async () => {
    const { payload, isError } = await callJson('validate_show', { show: stockShowV2() })
    expect(isError).toBe(false)
    expect(payload.errors).toEqual([])
    expect(payload.valid).toBe(true)
  })

  it('validate_show reports malformed JSON handed over as a string', async () => {
    const { payload } = await callJson('validate_show', { show: '{"composition": [' })
    expect(payload.valid).toBe(false)
    expect(payload.errors[0].code).toBe('malformed-json')
  })

  it('compile_show returns code and summary for a stock Show', async () => {
    const { payload, isError } = await callJson('compile_show', { show: stockShowV2() })
    expect(isError).toBe(false)
    expect(payload.ok).toBe(true)
    expect(payload.code.length).toBeGreaterThan(0)
    expect(payload.summary.artifactBytes).toBeGreaterThan(0)
    expect(payload.summary.artifactBudgetRatio).toBeGreaterThan(0)
  })

  it('compile_show flags an unresolvable user-library reference as a tool error', async () => {
    const show = stockShowV2()
    show.composition.patternInstances[0].pattern = { kind: 'user', id: 'someones-library-pattern' }
    const { payload, isError } = await callJson('compile_show', { show })
    expect(isError).toBe(true)
    expect(payload.ok).toBe(false)
    expect(payload.errors[0].code).toBe('user-library-pattern')
    expect(payload.errors[0].message).toContain('not resolvable without authentication')
  })
})
