// CPU-load control for the Controller Save probes on a test Controller (#1268).
//
// Loads the Controller's render loop with a throwaway saved Pattern whose
// render spins `work` iterations per pixel, so the Save probes can run against
// a Controller rendering at a chosen low frame rate.
//
//   start    record the starting config and list in --state, save the load
//            Pattern (--work baked in) and make it active (volatile).
//   tune     set the running load Pattern's exported `work` (setVars, volatile)
//            and report the fps the Controller sends.
//   measure  report fps and inbound cadence for --seconds.
//   stop     re-activate the starting Pattern (volatile), delete the load
//            Pattern, and compare the list and active Pattern with --state.
//
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerLoadControl.ts start --work 150 --state /tmp/1268-load.json
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerLoadControl.ts tune --work 700
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/controllerLoadControl.ts stop --state /tmp/1268-load.json
//
// `loadPatternSource(work)` is also the source the probes upload under load
// (`--pattern <path>.js` / `--patterns <path>.js`), so an activating Save keeps the Controller loaded.
// HUMAN-IN-THE-LOOP, OUT-OF-BAND: needs a physical Pixelblaze; never a gate.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import WebSocket from 'ws'
import { PixelblazeConnection, type WebSocketLike } from '../../src/engine/PixelblazeConnection'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { encodePbp } from '../../src/engine/pbpEncode'
import { fetchControllerCompiler, sleep } from './controllerHardware'
import { maxInboundGapMs } from './controllerSaveProbeCore'

const IP = process.env.PIXELBLAZE_IP
const LOAD_PREFIX = 'zz-1268-tmp-load-'

export function loadPatternSource(work: number): string {
  // The firmware aborts a single beforeRender after about 360 ms (vmerr 7, fps
  // pinned near 2.8 on a 256-pixel pb32), so the load is spread over render():
  // `work` iterations per pixel per frame (16.16 values: at most 32767).
  return `// #1268 throwaway CPU load: render spins \`work\` iterations per pixel per frame.
export var work = ${Math.round(work)}
var acc = 0
export function beforeRender(delta) {
  acc = 0
}
export function render(index) {
  for (var i = 0; i < work; i++) { acc += sin(i * 0.001) }
  hsv(frac(acc * 0.0001 + index / pixelCount), 1, 0.15)
}
`
}

function arg(argv: string[], flag: string, fallback: string): string {
  const index = argv.indexOf(flag)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

async function main(): Promise<void> {
  if (!IP) throw new Error('set PIXELBLAZE_IP to the test Controller')
  const argv = process.argv.slice(2)
  const mode = argv[0]
  if (!['start', 'tune', 'measure', 'stop'].includes(mode)) throw new Error('mode start|tune|measure|stop')
  const work = Number(arg(argv, '--work', '150'))
  if (!(work >= 1 && work <= 32767)) throw new Error('--work must be 1..32767 (iterations per pixel)')
  const statePath = arg(argv, '--state', '')
  const seconds = Number(arg(argv, '--seconds', '20'))

  let socket: WebSocket | null = null
  const inbound: number[] = []
  const fps: Array<{ at: number; fps: number; vmerr?: number }> = []
  const t0 = performance.now()
  const conn = new PixelblazeConnection({
    host: IP,
    webSocketFactory: (url: string): WebSocketLike => {
      const ws = new WebSocket(url)
      ws.addEventListener('message', (event) => {
        const at = performance.now() - t0
        inbound.push(at)
        if (typeof event.data !== 'string') return
        try {
          const message = JSON.parse(event.data) as { fps?: number; vmerr?: number }
          if (typeof message.fps === 'number') fps.push({ at, fps: message.fps, vmerr: message.vmerr })
        } catch { /* ignore */ }
      })
      socket = ws
      return ws as unknown as WebSocketLike
    },
    pingIntervalMs: 1000,
    requestTimeoutMs: 30_000,
  })
  await conn.connect()
  const sample = async (ms: number) => {
    const from = performance.now() - t0
    await sleep(ms)
    const to = performance.now() - t0
    const window = fps.filter((entry) => entry.at >= from)
    const values = window.map((entry) => entry.fps)
    const sorted = [...values].sort((a, b) => a - b)
    return {
      seconds: Math.round((to - from) / 1000),
      fpsFrames: values.length,
      fpsMedian: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      fpsMin: sorted.length ? sorted[0] : null,
      fpsMax: sorted.length ? sorted[sorted.length - 1] : null,
      vmerrs: [...new Set(window.map((entry) => entry.vmerr ?? 0))],
      maxInboundGapMs: Math.round(maxInboundGapMs(inbound, from, to)),
    }
  }
  const timed = async <T>(run: () => Promise<T>) => {
    const started = performance.now()
    const value = await run()
    return { value, ms: Math.round(performance.now() - started) }
  }

  try {
    if (mode === 'start') {
      if (!statePath || existsSync(statePath)) throw new Error('--state <new path> is required')
      const list = await conn.listPrograms()
      if (list.some((program) => program.name.startsWith(LOAD_PREFIX))) throw new Error('a load Pattern is already listed; refusing')
      const config = await conn.getConfig()
      if (config.runSequencer) throw new Error('sequencer running; refusing')
      const compile = await fetchControllerCompiler(IP)
      const source = loadPatternSource(work)
      const byteCode = compile(source)
      const load = { id: makeProgramId(), name: `${LOAD_PREFIX}${work}` }
      writeFileSync(statePath, JSON.stringify({ startedAt: new Date().toISOString(), config, list, load }, null, 2))
      conn.saveProgram(load.id, encodePbp({ ...load, sourceCode: source, byteCode }))
      await sleep(4000)
      conn.pushByteCode(byteCode, load)
      await sleep(3000)
      const after = await timed(() => conn.getConfig())
      console.log(JSON.stringify({ mode, load, startingActive: config.activeProgramId, active: after.value.activeProgramId, configMs: after.ms, ...(await sample(seconds * 1000)) }, null, 2))
      return
    }
    if (mode === 'tune') {
      conn.setVars({ work })
      await sleep(3000)
      const vars = await timed(() => conn.getVars())
      console.log(JSON.stringify({ mode, work, varsWork: vars.value.work, getVarsMs: vars.ms, ...(await sample(seconds * 1000)) }, null, 2))
      return
    }
    if (mode === 'measure') {
      const config = await timed(() => conn.getConfig())
      const list = await timed(() => conn.listPrograms())
      const ping = await timed(() => conn.ping())
      console.log(JSON.stringify({ mode, active: config.value.activeProgramId, configMs: config.ms, listMs: list.ms, pingMs: ping.ms, ...(await sample(seconds * 1000)) }, null, 2))
      return
    }
    // stop
    if (!statePath) throw new Error('--state is required')
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
      config: { activeProgramId?: string }
      list: Array<{ id: string; name: string }>
      load: { id: string; name: string }
    }
    if (state.config.activeProgramId) conn.setActiveProgram(state.config.activeProgramId, false)
    await sleep(3000)
    conn.deleteProgram(state.load.id)
    await sleep(3000)
    const list = await conn.listPrograms()
    const config = await conn.getConfig()
    const key = (program: { id: string; name: string }) => `${program.id}\t${program.name}`
    const starting = state.list.map(key)
    console.log(JSON.stringify({
      mode,
      restoredActive: config.activeProgramId === state.config.activeProgramId,
      listMatchesStarting: list.length === starting.length && list.every((program) => starting.includes(key(program))),
      list: list.map(key),
      ...(await sample(5000)),
    }, null, 2))
  } finally {
    ;(socket as WebSocket | null)?.close(1000)
    conn.close()
  }
}

if (process.argv[1]?.endsWith('controllerLoadControl.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
