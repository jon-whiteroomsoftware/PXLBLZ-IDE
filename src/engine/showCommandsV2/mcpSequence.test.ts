import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../../worker/apiRoutes'
import { agentMcpRouting } from '../../worker/agent/agentMcpRouting'
import { parseEpe } from '../epeImport'
import { parseShowFileBundle } from '../showFileBundle'
import { prepareShowStageV2 } from '../showPreparedStageV2'
import { qualifyShowV2PilotArtifacts, type ShowV2PilotAssets } from '../showV2Pilot'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from '../showCompositionV2'
import { applyShowCommandV2, SHOW_COMMANDS_V2, type ShowCommandV2Change } from './registry'
import { commandFixtureV2, fixtureContext } from './fixtures'

// The #1029 sequence in v2 vocabulary: create Layers and Clips, remove the old
// content, set the exact 30000 ms Show End, add Property tracks, commit, read
// the outcome and reopen the saved record.
//
// Fidelity boundary: every step's tool and arguments go through the real MCP
// server (`agentMcpRouting` with a fake grant and the prepared `catalogue: 'v2'`
// option), and every step's semantics go through the real v2 catalogue over the
// prepared v2 record, judged at the reopened `.pxlshow` and `.epe`. The browser
// executor still applies v1 commands to a v1 capture, so binding this transcript
// to a live editor is #1039's coordinated activation and its deployed transcript
// is that issue's named gate.

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const grant = {
  accountId: 'account', clientId: 'client', clientName: 'Client',
  clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60,
}
const context = fixtureContext()

interface Step { tool: string; arguments: Record<string, unknown> }

/** The #1029 sequence, expressed once and replayed through both surfaces. */
function sequence(): Step[] {
  return [
    { tool: 'create_layers', arguments: { layers: [{ zone_id: 'right', name: 'Right base' }] } },
    {
      tool: 'create_clips',
      arguments: {
        clips: [{
          zone_id: 'right', layer_id: 'RIGHT_LAYER', start_ms: 0, duration_ms: 10_000,
          pattern: { kind: 'stock', id: 'TestPattern2D' }, instance: 'sole',
          appearance: { opacity: 0.8 },
        }],
      },
    },
    { tool: 'remove_clips', arguments: { clip_ids: ['clip-a', 'clip-b', 'clip-c'] } },
    { tool: 'set_show_end', arguments: { end_ms: 30_000 } },
    { tool: 'update_clips', arguments: { updates: [{ clip_id: 'NEW_CLIP', duration_ms: 30_000 }] } },
    {
      tool: 'add_property_tracks',
      arguments: {
        tracks: [
          { target: { kind: 'opacity', clip_id: 'NEW_CLIP' }, keyframes: [{ at_ms: 0, value: 0 }, { at_ms: 30_000, value: 1, easing: 'ease-in-out' }] },
          { target: { kind: 'time-scale', instance_id: 'inst-b' }, initial_value: 0.5 },
        ],
      },
    },
  ]
}

async function callTool(step: Step) {
  const response = await agentMcpRouting(new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: {
        name: step.tool,
        arguments: { binding_id: 'binding', operation_id: 'operation', ...step.arguments },
      },
    }),
  }), { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv, grant, { catalogue: 'v2' })
  return await response.json() as { result?: { isError?: boolean; structuredContent?: { code?: string } }; error?: { message: string } }
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

const ASSETS: ShowV2PilotAssets = { patterns: [], maps: [], libraries: [] }

describe('#1029 sequence in v2 vocabulary', () => {
  it('accepts every step at the real MCP tool boundary', async () => {
    const exposed = new Set(SHOW_COMMANDS_V2.map(command => command.name))
    for (const step of sequence()) {
      expect(exposed, `${step.tool} must be exposed by the prepared catalogue`).toContain(step.tool)
      const called = await callTool({
        tool: step.tool,
        arguments: JSON.parse(JSON.stringify(step.arguments).replace(/NEW_CLIP|RIGHT_LAYER/g, 'placeholder-id')),
      })
      // The transport accepts the arguments and reaches delivery; with no live
      // editor bound it answers with a typed transport code, never a schema error.
      expect(called.error, `${step.tool} arguments must satisfy the published schema`).toBeUndefined()
      expect(called.result?.structuredContent?.code, step.tool).toBeTypeOf('string')
      expect(['invalid-argument', 'unknown-field'], step.tool)
        .not.toContain(called.result?.structuredContent?.code)
    }
  })

  it('runs the sequence over the prepared v2 record and reopens the saved artifacts', async () => {
    let record = commandFixtureV2()
    const transcript: Array<{ tool: string; arguments: unknown; status: string; changes: ShowCommandV2Change[] }> = []
    let layerId = ''
    let clipId = ''

    for (const step of sequence()) {
      const resolved = JSON.parse(
        JSON.stringify(step.arguments).replace(/RIGHT_LAYER/g, layerId).replace(/NEW_CLIP/g, clipId),
      ) as Record<string, unknown>
      const outcome = applyShowCommandV2(record, step.tool, resolved, context)
      if (outcome.status === 'refused') throw new Error(`${step.tool}: ${JSON.stringify(outcome.issues)}`)
      transcript.push({ tool: step.tool, arguments: resolved, status: outcome.status, changes: outcome.changes })
      record = outcome.record
      if (step.tool === 'create_layers') layerId = outcome.status === 'changed' ? outcome.changes[0].details.layers[0] : layerId
      if (step.tool === 'create_clips') clipId = outcome.status === 'changed' ? outcome.changes[0].details.clips[0] : clipId
      expect(validateShowRecordV2(reopen(record)), step.tool).toEqual([])
    }

    // Commit: the sequence leaves exactly the authored content it asked for.
    expect(record.composition.showEndMs).toBe(30_000)
    expect(record.composition.clips.map(clip => clip.id)).toEqual([clipId])
    const clip = record.composition.clips[0]
    expect([clip.zoneId, clip.layerId, clip.startMs, clip.durationMs]).toEqual(['right', layerId, 0, 30_000])
    expect(clip.appearance.keys[0].value.opacity).toBe(0.8)
    expect(record.composition.propertyTracks.map(track => track.target.kind).sort())
      .toEqual(['clip-opacity', 'instance-time-scale'])
    // Removing the old content collected its tracks and Transitions with it.
    expect(record.composition.propertyTracks.some(track => track.id === 'track-a')).toBe(false)
    expect(record.composition.transitions).toEqual([])
    // Layout coverage still spans the whole Show exactly once.
    expect(record.composition.layoutOccurrences.map(occurrence => [occurrence.startMs, occurrence.durationMs]))
      .toEqual([[0, 5_000], [5_000, 25_000]])

    // Outcome and reopen: the saved record travels through the real importers.
    const prepared = prepareShowStageV2(record, { ...ASSETS, profiles: [], stageMap: null })
    expect(prepared.status, prepared.status === 'refused' ? prepared.message : '').toBe('ready')
    if (prepared.status !== 'ready') return
    const artifacts = await qualifyShowV2PilotArtifacts(prepared.bundle, {
      appVersion: '1041-mcp-sequence', exportedAt: '2026-09-16T00:00:00.000Z',
    })
    const reopened = await parseShowFileBundle(artifacts.pxlshowBytes, { acceptV2: true })
    expect(reopened).toMatchObject({ version: 2, show: { version: 2 } })
    expect(artifacts.importedShow.composition.showEndMs).toBe(30_000)
    expect(artifacts.importedShow.composition.clips).toHaveLength(1)
    expect(artifacts.importedShow.composition.propertyTracks).toHaveLength(2)
    expect(parseEpe(artifacts.epeText)).toMatchObject({ stamp: { kind: 'show' } })

    const directory = join(repoRoot, 'docs', 'reference', 'evidence', 'issue-1041-v2-commands')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'mcp-sequence-transcript.json'), `${JSON.stringify({
      issue: 1029,
      catalogue: 'v2',
      surface: 'agentMcpRouting tools/call schema boundary plus the v2 catalogue over the prepared v2 record',
      transcript,
      savedRecord: artifacts.importedShow,
      artifacts: {
        pxlshowBytes: artifacts.pxlshowBytes.byteLength,
        epeBytes: new TextEncoder().encode(artifacts.epeText).byteLength,
      },
    }, null, 2)}\n`)
  })
})
