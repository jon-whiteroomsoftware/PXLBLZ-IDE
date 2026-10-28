export interface BenchSocketEvent {
  constructedUtc: string
  openUtc?: string
  requestedCloseUtc?: string
  actualCloseUtc?: string
  errorUtc?: string
  code?: number
}
export interface BenchSocketWitness {
  arm(): void
  closeAndWait(): Promise<void>
  assertSafe(): void
  assertHealthy(): void
  events(): BenchSocketEvent[]
}
export interface BenchSocketGlobal { __benchSockets?: BenchSocketWitness }

/** Self-contained: Playwright serializes this function into the actual worker. */
export function installBenchSocketWitness(target: string): void {
  const g = globalThis as typeof globalThis & BenchSocketGlobal
  if (g.__benchSockets) throw new Error('Socket witness already installed')
  if (target !== '192.168.8.196') throw new Error('Socket witness target refused')
  const Native = g.WebSocket
  const rows: BenchSocketEvent[] = []
  let armed = false
  let stopped: string | undefined
  let owned: { socket: WebSocket; row: BenchSocketEvent; closed: Promise<void>; witnessed: boolean } | undefined
  const fail = (why: string): never => { stopped ??= why; throw new Error(stopped) }
  const healthy = () => { if (stopped) throw new Error(stopped) }
  const safe = () => {
    healthy()
    if (armed || (owned && (!owned.witnessed || !owned.row.actualCloseUtc || owned.row.code !== 1000))) throw new Error('Completed actual clean-close gate is required')
  }
  const requestClose = () => {
    if (!owned || owned.row.actualCloseUtc) return
    if (!owned.row.requestedCloseUtc) {
      owned.row.requestedCloseUtc = new Date().toISOString()
      Native.prototype.close.call(owned.socket, 1000)
    }
  }
  const Wrapped = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      let isOwned = false
      try { isOwned = new URL(String(url)).href === `ws://${target}:81/` } catch { /* Let the native constructor handle other URL forms. */ }
      if (isOwned) {
        healthy()
        if (!armed) fail('unarmed or replacement Controller socket construction refused')
        if (owned && !owned.row.actualCloseUtc) fail('Concurrent Controller socket construction refused')
        armed = false
      }
      // Preserve native overload behavior, including omitted protocols.
      try {
        if (protocols === undefined) super(url)
        else super(url, protocols)
      } catch (error) { if (isOwned) stopped ??= 'Native Controller socket construction failed'; throw error }
      if (!isOwned) return
      const row: BenchSocketEvent = { constructedUtc: new Date().toISOString() }
      rows.push(row)
      let settle!: () => void
      const closed = new Promise<void>(resolve => { settle = resolve })
      owned = { socket: this, row, closed, witnessed: false }
      this.addEventListener('open', () => { row.openUtc = new Date().toISOString() })
      this.addEventListener('error', () => { row.errorUtc = new Date().toISOString(); stopped ??= 'Controller socket error' })
      this.addEventListener('close', event => {
        row.actualCloseUtc = new Date().toISOString(); row.code = event.code
        if (event.code !== 1000 || !row.requestedCloseUtc) stopped ??= `Unexpected Controller close ${event.code}`
        settle()
      })
      this.close = () => {
        if (!row.requestedCloseUtc) row.requestedCloseUtc = new Date().toISOString()
        Native.prototype.close.call(this, 1000)
      }
    }
  }
  g.WebSocket = Wrapped
  g.__benchSockets = {
    arm() { healthy(); if (armed) fail('Concurrent socket arm refused'); if (owned && !owned.witnessed) fail('Completed clean-close witness gate required before socket arm'); armed = true },
    assertSafe: safe,
    assertHealthy: healthy,
    events: () => rows.map(row => ({ ...row })),
    async closeAndWait() {
      if (!owned) { safe(); return }
      requestClose()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([owned.closed, new Promise<never>((_, reject) => {
          timer = setTimeout(() => { stopped ??= 'Missing actual Controller close event within 5s'; reject(new Error(stopped)) }, 5000)
        })])
        healthy()
        if (!owned.row.actualCloseUtc || owned.row.code !== 1000) fail('Actual clean-close event required')
        owned.witnessed = true
        safe()
      } finally { if (timer !== undefined) clearTimeout(timer) }
    },
  }
}
