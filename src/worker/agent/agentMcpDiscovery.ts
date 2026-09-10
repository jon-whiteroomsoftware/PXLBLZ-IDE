import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
/** Discovery only: no Show access, account claim, tool dispatch, or durable MCP session. */
export async function agentMcpDiscovery(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  const server = new Server({ name: 'PXLBLZ Agent', version: '0.1.0' }, { capabilities: { tools: {} }, instructions: 'Connection authorized. Show editing is not available through this endpoint yet.' })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }))
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  await server.connect(transport)
  try { return await transport.handleRequest(request) } finally { await server.close() }
}
