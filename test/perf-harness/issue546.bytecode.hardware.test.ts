import { createHash } from 'node:crypto'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import { fetchControllerCompiler, nodeWebSocketFactory } from './controllerHardware'
import { issue546Artifacts } from './issue546'

const runHardware = process.env.ISSUE546_BYTECODE_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

describe('Controller compiler bytecode identity for #546', () => {
  it.skipIf(!runHardware)('compares expanded and compacted source without changing Controller state', async () => {
    const compile = await fetchControllerCompiler(ip)
    const selected = issue546Artifacts['stock-show-reference-property-animation'].selected
    const expanded = compile(selected.expandedCode)
    const compacted = compile(selected.code)
    const differences = []
    for (let index = 0; index < Math.max(expanded.length, compacted.length); index += 1) {
      if (expanded[index] !== compacted[index]) {
        differences.push({ index, expanded: expanded[index], compacted: compacted[index] })
      }
    }
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 10_000,
      connectTimeoutMs: 10_000,
      pingIntervalMs: 2_000,
    })
    let controllerConfig: unknown
    try {
      await connection.connect()
      controllerConfig = await connection.getConfig()
    } catch (error) {
      controllerConfig = { error: error instanceof Error ? error.message : String(error) }
    } finally {
      connection.close()
    }
    console.log(JSON.stringify({
      expandedBytes: expanded.length,
      compactedBytes: compacted.length,
      expandedSha256: sha256(expanded),
      compactedSha256: sha256(compacted),
      differenceCount: differences.length,
      firstDifferences: differences.slice(0, 20),
      controllerConfig,
    }, null, 2))
    expect(expanded.length).toBe(compacted.length)
  }, 30_000)
})
