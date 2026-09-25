import { describe, expect, it, vi } from 'vitest'
import type { WorkerEnv } from '../../worker/apiRoutes'
import { agentMcpRouting } from '../../worker/agent/agentMcpRouting'
import { normalizeShowClipEffects } from '../showEffects'
import type { ShowClipEffect } from '../personalContentRecords'
import {
  SHOW_AUTHORING_V2_JSON_SCHEMA,
  SHOW_AUTHORING_V2_REFERENCE_MARKDOWN,
  SHOW_AUTHORING_V2_REFERENCE_URI,
  SHOW_AUTHORING_V2_SCHEMA_URI,
  SHOW_AUTHORING_V2_SCHEMA_VERSION,
  showEffectParameterReferenceV2,
} from './authoringReference'
import { EFFECT_KIND_VALUES } from './support'

const grant = {
  accountId: 'account', clientId: 'client', clientName: 'Client',
  clientOrigins: [], grantId: 'grant', expiresAt: Math.ceil(Date.now() / 1000) + 60,
}

async function resources() {
  const response = await agentMcpRouting(new Request('https://app.test/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'resources/list' }),
  }), { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv, grant)
  return await response.json() as { result: { resources: Array<{ uri: string; name: string }> } }
}

describe('v2 authoring resources', () => {
  it('names the versioned schema and reference resources', async () => {
    expect(SHOW_AUTHORING_V2_SCHEMA_VERSION).toBe(2)
    const after = await resources()
    expect(after.result.resources.map(resource => resource.uri).sort()).toEqual([
      SHOW_AUTHORING_V2_REFERENCE_URI,
      SHOW_AUTHORING_V2_SCHEMA_URI,
    ].sort())
  })

  it('reads the v2 reference back through the server', async () => {
    const response = await agentMcpRouting(new Request('https://app.test/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: SHOW_AUTHORING_V2_REFERENCE_URI } }),
    }), { ASSETS: { fetch: vi.fn() } } as unknown as WorkerEnv, grant)
    const read = await response.json() as { result: { contents: Array<{ uri: string; text: string }> } }
    expect(read.result.contents[0].text).toBe(SHOW_AUTHORING_V2_REFERENCE_MARKDOWN)
  })

  it('documents every Effect kind and its persisted parameters', () => {
    const reference = showEffectParameterReferenceV2()
    expect(reference.map(entry => entry.kind)).toEqual([...EFFECT_KIND_VALUES])
    for (const entry of reference) {
      const template = normalizeShowClipEffects([{ id: 'reference', kind: entry.kind } as ShowClipEffect])[0]
      const persisted = Object.keys(template).filter(name => name !== 'id' && name !== 'kind').sort()
      const documented = entry.parameters.map(parameter => parameter.name)
      for (const name of persisted) {
        expect(documented, `${entry.kind}.${name} must appear in the reference`).toContain(name)
      }
      // The reference is what the compact parameter record points a caller at.
      expect(SHOW_AUTHORING_V2_REFERENCE_MARKDOWN).toContain(`\`${entry.kind}\``)
    }
  })

  it('carries the identity, no-op and affected vocabulary a caller needs', () => {
    for (const phrase of [
      'stable identity from `read_show`',
      'half-open',
      'returns `unchanged`',
      'fourteen affected collections',
      'apply',
      'shape_parameters',
      'show-repeat-scale',
    ]) {
      expect(SHOW_AUTHORING_V2_REFERENCE_MARKDOWN).toContain(phrase)
    }
    expect(SHOW_AUTHORING_V2_JSON_SCHEMA.$defs.ClipSpec).toBeDefined()
    expect(SHOW_AUTHORING_V2_JSON_SCHEMA.$defs.ClipPatch).toBeDefined()
    expect(SHOW_AUTHORING_V2_JSON_SCHEMA.maxBatchItems).toBe(128)
  })
})
