import { execFileSync } from 'node:child_process'
import { runInThisContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BenchSocketGlobal } from './controller-import-hardware-sockets'

const installerSource = execFileSync(process.execPath, [
  '--import', 'tsx', '--input-type=module', '--eval',
  `import { installBenchSocketWitness } from ${JSON.stringify(new URL('./controller-import-hardware-sockets.ts', import.meta.url).href)}; process.stdout.write(installBenchSocketWitness.toString())`,
], { encoding: 'utf8' })

class NativeSocket extends EventTarget {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3
  static instances: NativeSocket[] = []
  readyState = 0
  requests: unknown[][] = []
  constructor(readonly url: string, readonly protocols?: string | string[]) { super(); NativeSocket.instances.push(this) }
  close(...args: unknown[]) { this.requests.push(args); this.readyState = 2 }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')) }
  finish(code = 1000) { this.readyState = 3; this.dispatchEvent(Object.assign(new Event('close'), { code })) }
}
const target = '192.168.8.196'
function fixture() {
  NativeSocket.instances = []
  vi.stubGlobal('WebSocket', NativeSocket)
  delete (globalThis as unknown as BenchSocketGlobal).__benchSockets
  // Receive the actual CLI-transformed function without its module's lexical scope.
  runInThisContext(`(${installerSource})`)(target)
  return (globalThis as unknown as BenchSocketGlobal).__benchSockets!
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); delete (globalThis as unknown as BenchSocketGlobal).__benchSockets })
describe('actual worker socket witness', () => {
  it('preserves unrelated constructors/constants and requires one explicit arm', () => {
    const gate = fixture()
    const unrelated = new WebSocket('ws://elsewhere:81', ['p']) as unknown as NativeSocket
    expect(unrelated.protocols).toEqual(['p']); expect(WebSocket.OPEN).toBe(1)
    expect((new WebSocket('relative-socket') as unknown as NativeSocket).url).toBe('relative-socket')
    expect(gate.events()).toEqual([])
    expect(() => new WebSocket(`ws://${target}:81`)).toThrow(/unarmed/)
    expect(() => gate.arm()).toThrow()
  })
  it('awaits the retained actual event, defaults provider close to 1000, and retains handoff evidence', async () => {
    const gate = fixture(); gate.arm()
    const socket = new WebSocket(`ws://${target}:81/`) as unknown as NativeSocket
    socket.open(); socket.close()
    let navigated = false
    const handoff = gate.closeAndWait().then(() => { gate.assertSafe(); navigated = true })
    await Promise.resolve(); expect(navigated).toBe(false)
    expect(socket.requests[0]).toEqual([1000])
    socket.finish(); await handoff
    expect(navigated).toBe(true)
    expect(gate.events()).toEqual([expect.objectContaining({ constructedUtc: expect.any(String), openUtc: expect.any(String), requestedCloseUtc: expect.any(String), actualCloseUtc: expect.any(String), code: 1000 })])
    gate.arm(); new WebSocket(`ws://${target}:81`)
    expect(gate.events()).toHaveLength(2)
  })
  it.each([1005, 1006])('permanently refuses after actual close %s', async (code) => {
    const gate = fixture(); gate.arm(); const socket = new WebSocket(`ws://${target}:81`) as unknown as NativeSocket
    socket.finish(code)
    await expect(gate.closeAndWait()).rejects.toThrow()
    expect(() => gate.arm()).toThrow(); expect(() => new WebSocket(`ws://${target}:81`)).toThrow()
  })
  it('times out without an actual close and never recovers construction permission', async () => {
    vi.useFakeTimers(); const gate = fixture(); gate.arm(); new WebSocket(`ws://${target}:81`)
    const result = expect(gate.closeAndWait()).rejects.toThrow(/close event/)
    await vi.advanceTimersByTimeAsync(5000); await result
    expect(() => gate.arm()).toThrow()
  })
  it('stops on errors or concurrent/replacement constructions', () => {
    const gate = fixture(); gate.arm(); const socket = new WebSocket(`ws://${target}:81`) as unknown as NativeSocket
    expect(() => gate.arm()).toThrow(); socket.dispatchEvent(new Event('error'))
    expect(() => new WebSocket(`ws://${target}:81`)).toThrow(); expect(() => gate.assertSafe()).toThrow()
  })
  it('does not invent a witness for an unconnected context', async () => {
    const gate = fixture(); await gate.closeAndWait(); gate.assertSafe(); expect(gate.events()).toEqual([])
  })
  it('requires completed close gate before rearming even when a clean event has arrived', () => {
    const gate = fixture(); gate.arm(); const socket = new WebSocket(`ws://${target}:81`) as unknown as NativeSocket
    socket.close(); socket.finish(1000)
    expect(() => gate.arm()).toThrow(/witness|gate/)
    expect(() => gate.assertHealthy()).toThrow()
  })
  it('permanently stops after an unsolicited clean event', async () => {
    const gate = fixture(); gate.arm(); const socket = new WebSocket(`ws://${target}:81`) as unknown as NativeSocket
    socket.finish(1000)
    await expect(gate.closeAndWait()).rejects.toThrow(/Unexpected/)
    expect(() => gate.arm()).toThrow()
  })
})
