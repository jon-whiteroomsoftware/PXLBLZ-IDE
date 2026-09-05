// Provenance: pxlblz-v3 test/showsMcpServer.e2e.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { createShowsServer } from '../mcp/showsServer.js'

// End-to-end over a real MCP client/server pair: registration, discovery,
// and both tools through the protocol layer.
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

  it('exposes the evaluation, critique, measurement, catalogue, and grammar tools', async () => {
    const tools = await client.listTools()
    const names = tools.tools.map((tool) => tool.name).sort()
    expect(names).toEqual([
      'add_clip',
      'add_clip_effect',
      'add_keyframe',
      'add_layout_interval',
      'add_marker',
      'add_overlay_layer',
      'add_property_track',
      'apply_patch',
      'begin_edit',
      'close_session',
      'commit_edit',
      'compile_show',
      'critique_show',
      'delete_keyframe',
      'delete_property_track',
      'describe_changes',
      'describe_show',
      'duplicate_clip',
      'duplicate_clip_effect',
      'duplicate_layout_interval',
      'evaluate_property_at',
      'export_show',
      'get_editor_context',
      'get_stock_pattern',
      'insert_layer_transition',
      'insert_time',
      'list_stock_patterns',
      'make_clip_pattern_independent',
      'make_layout_interval_unique',
      'measure_show',
      'move_clip',
      'move_clip_effect',
      'move_connected_clip',
      'move_keyframe',
      'move_marker',
      'open_show',
      'redo',
      'rejoin_clip_pattern_instance',
      'remove_clip',
      'remove_clip_effect',
      'remove_marker',
      'rename_show',
      'reset_layer_transition_to_cut',
      'resize_clip',
      'resize_connected_clip',
      'resize_layer_transition',
      'resolve_reference',
      'restart_clip',
      'rollback_edit',
      'set_clip_control_target',
      'set_clip_evaluation',
      'set_clip_time',
      'set_clip_view',
      'set_editor_context',
      'set_field',
      'set_junction_layout',
      'set_junction_timing',
      'set_junction_transition',
      'set_output_contract',
      'set_output_trails',
      'set_show_end',
      'set_stage_map',
      'split_clip',
      'undo',
      'update_clip_effect',
      'update_junction_parameter',
      'update_keyframe',
      'update_marker',
      'update_zone',
      'validate_show',
    ])
  })

  // #12 acceptance: the full authoring loop — validate, critique, compile,
  // measure — against one Show in a single client session.
  it('drives validate → critique → compile → measure in one session', async () => {
    const show = STOCK_SHOWS[0].show

    const { payload: validated, isError: validateError } = await callJson('validate_show', { show })
    expect(validateError).toBe(false)
    expect(validated.valid).toBe(true)

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
      id: 'e2e-strobe', name: 'Strobe', updatedAt: 0,
      scenes: [{ id: 's1', name: 'One', durationMs: 8_000 }],
      zones: [{ id: 'z1', name: 'Main', nominalPixelCount: 64 }],
      cells: [{
        id: 'c1', zoneId: 'z1', sceneId: 's1', sceneSpan: 1,
        pattern: { kind: 'user', id: 'strobe' }, patternName: 'strobe',
        adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
      }],
      routingLayouts: [{ id: 'l1', name: 'Full Stage', zones: [], logical: { kind: 'single', zoneIds: ['z1'] } }],
      transitions: [],
      outputContract: {
        version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 256,
        compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
      },
    }
    const strobeSource =
      'var t = 0\nexport function beforeRender(delta) { t += delta }\n' +
      'export function render2D(index, x, y) { var on = floor(t / 50) % 2\n rgb(on, on, on) }'
    const { payload, isError } = await callJson('measure_show', {
      show: strobeShow,
      inline_patterns: [{ id: 'strobe', source: strobeSource }],
    })
    expect(isError).toBe(true)
    expect(payload.ok).toBe(true)
    expect(payload.flickerGatePassed).toBe(false)
    expect(payload.report.summary).toContain('FLICKER GATE FAILED')
  })

  it('critique_show returns advisory findings and defers legality to validate_show', async () => {
    const { payload, isError } = await callJson('critique_show', { show: STOCK_SHOWS[0].show })
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

  it('serves the schema and data-model resources', async () => {
    const resources = await client.listResources()
    const uris = resources.resources.map((resource) => resource.uri).sort()
    expect(uris).toEqual(['pxlblz://docs/show-data-model', 'pxlblz://schemas/show-record'])

    const schema = await client.readResource({ uri: 'pxlblz://schemas/show-record' })
    const schemaDoc = JSON.parse((schema.contents[0] as { text: string }).text)
    expect(schemaDoc.$ref).toBe('#/definitions/ShowRecord')

    const dataModel = await client.readResource({ uri: 'pxlblz://docs/show-data-model' })
    const text = (dataModel.contents[0] as { text: string }).text
    for (const term of ['Scene', 'Zone Layout', 'Cell', 'Transition', 'output contract', 'Budgets']) {
      expect(text).toContain(term)
    }
  })

  it('validate_show passes a stock Show through the protocol', async () => {
    const { payload, isError } = await callJson('validate_show', { show: STOCK_SHOWS[0].show })
    expect(isError).toBe(false)
    expect(payload.errors).toEqual([])
    expect(payload.valid).toBe(true)
  })

  it('validate_show reports malformed JSON handed over as a string', async () => {
    const { payload } = await callJson('validate_show', { show: '{"cells": [' })
    expect(payload.valid).toBe(false)
    expect(payload.errors[0].code).toBe('malformed-json')
  })

  it('compile_show returns code and summary for a stock Show', async () => {
    const { payload, isError } = await callJson('compile_show', { show: STOCK_SHOWS[0].show })
    expect(isError).toBe(false)
    expect(payload.ok).toBe(true)
    expect(payload.code.length).toBeGreaterThan(0)
    expect(payload.summary.artifactBytes).toBeGreaterThan(0)
    expect(payload.summary.artifactBudgetRatio).toBeGreaterThan(0)
  })

  it('compile_show flags an unresolvable user-library reference as a tool error', async () => {
    const show = structuredClone(STOCK_SHOWS[0].show)
    show.cells[0].pattern = { kind: 'user', id: 'someones-library-pattern' }
    const { payload, isError } = await callJson('compile_show', { show })
    expect(isError).toBe(true)
    expect(payload.ok).toBe(false)
    expect(payload.errors[0].code).toBe('user-library-pattern')
    expect(payload.errors[0].message).toContain('not resolvable without authentication')
  })
})
