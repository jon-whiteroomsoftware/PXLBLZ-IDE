// #1273 Wrappers hardware probe: Slow-mo and Dreamy as native sliders on the
// bench 16x16 Controller. Raw-protocol modes; the IDE Save path lives in
// issue1273Ide.ts and the Controller web UI captures in issue1273WebUi.ts.
//
//   baseline   read-only snapshot: config, settings frame, saved list, map hash
//   fps        Q1/Q2: six Patterns x U D S R B U, run-only pushes, fresh fps frames
//   sliders    Q3/Q6: save one recording probe, read before any value is set,
//              activate by setActiveProgram and by the IDE's pushByteCode route
//   read-sliders  read the recording probe without moving its sliders
//   set        Q3: protocol setControls (no save) on the sliders probe, read handlers
//   survival   Q4 raw path: cases a, b, c on independent probes
//   jon        Q5: WavyBands wrapped with amount sliders, saved and left active
//   over-budget  Q7: one Run and one Save, only after the operator approves
//   restore    re-activate the baseline Pattern, delete manifest probes, compare
//
//   PIXELBLAZE_IP=192.168.8.161 npx tsx test/perf-harness/issue1273.ts --mode baseline --out .wrsp/1273/x.json
//
// Safety: every saved probe is named zz-1273-*, its id is appended to the
// manifest before upload, and a write to any baseline id is refused. Run-only
// pushes never enter the saved list. No settings, brightness, map, pixel count,
// firmware or reboot. Every socket is closed with code 1000. If the Controller
// stops answering, the run throws and does not retry. HUMAN-IN-THE-LOOP: needs a
// physical Pixelblaze; never part of a commit gate.

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import WebSocket from 'ws'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { encodePbp } from '../../src/engine/pbpEncode'
import { PixelblazeConnection, type WebSocketLike } from '../../src/engine/PixelblazeConnection'
import { fetchControllerCompiler, sleep } from './controllerHardware'
import {
  assertProbeTarget,
  buildVariant,
  compareRestore,
  type ControllerSnapshot,
  defaultsVerdict,
  type FpsFrame,
  FPS_VERSIONS,
  LABEL_PROBE_NAMES,
  OVER_BUDGET_PROBE_SOURCE,
  SLIDER_NAMES,
  sliderProbeSource,
  summarizeFreshFps,
  type SurvivalCase,
  survivalSource,
} from './issue1273Core'

const IP = process.env.PIXELBLAZE_IP
const PIXELS = 256
const SETTLE_MS = 2000
const ACTIVATION_TIMEOUT_MS = 15_000
const BASELINE = '.wrsp/1273/baseline-before.json'
const MANIFEST = '.wrsp/1273/manifest.jsonl'
const PREFIX = 'zz-1273-'

export const PROBE_PATTERNS: Array<{ name: string; path: string }> = [
  { name: 'WavyBands', path: 'src/pixelblaze/stock/patterns/WavyBands.js' },
  { name: 'LineDancer2D', path: 'src/pixelblaze/stock/patterns/LineDancer2D.js' },
  { name: 'IridescentFibers', path: 'src/pixelblaze/stock/patterns/IridescentFibers.js' },
  { name: 'VoronoiMix2D', path: 'src/pixelblaze/stock/patterns/VoronoiMix2D.js' },
  { name: 'slowMoSparkle', path: 'src/test/fixtures/slowMoSparkle.js' },
  { name: 'FastPaletteBlending', path: 'src/pixelblaze/stock/patterns/FastPaletteBlending.js' },
]

const log = (message: string) => console.error(`[${new Date().toISOString()}] ${message}`)
const arg = (flag: string, fallback = '') => {
  const index = process.argv.indexOf(flag)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

export interface Session {
  conn: PixelblazeConnection
  fps: FpsFrame[]
  status: Array<Record<string, unknown>>
  json: Array<Record<string, unknown>>
  close: () => Promise<void>
}

export function assertBenchPixels(pixelCount: number | undefined): void {
  if (pixelCount !== PIXELS) throw new Error(`Expected ${PIXELS} bench pixels, read ${pixelCount}; stopping`)
}

/** One fresh socket. Every JSON frame is kept; `fps` frames are timestamped. */
export async function openSession(ip: string): Promise<Session> {
  let socket: WebSocket | null = null
  const fps: FpsFrame[] = []
  const status: Array<Record<string, unknown>> = []
  const json: Array<Record<string, unknown>> = []
  const conn = new PixelblazeConnection({
    host: ip,
    webSocketFactory: (url: string): WebSocketLike => {
      const ws = new WebSocket(url)
      socket = ws
      ws.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return
        try {
          const message = JSON.parse(event.data) as Record<string, unknown>
          json.push(message)
          if (typeof message.fps === 'number') {
            fps.push({ at: performance.now(), fps: message.fps })
            status.push({ at: performance.now(), ...message })
          }
        } catch { /* not JSON */ }
      })
      return ws as unknown as WebSocketLike
    },
    pingIntervalMs: 1000,
    requestTimeoutMs: 15_000,
  })
  const close = async () => {
    const ws = socket as WebSocket | null
    const closed = ws && ws.readyState !== WebSocket.CLOSED
      ? new Promise<void>((resolve) => ws.once('close', () => resolve()))
      : Promise.resolve()
    ws?.close(1000)
    conn.close()
    await closed
  }
  try {
    await conn.connect()
  } catch (error) {
    await close()
    throw error
  }
  return {
    conn, fps, status, json,
    close,
  }
}

export async function withSession<T>(ip: string, run: (session: Session) => Promise<T>): Promise<T> {
  const session = await openSession(ip)
  try {
    assertBenchPixels((await session.conn.getConfig()).pixelCount)
    return await run(session)
  } finally {
    await session.close()
    await sleep(500)
  }
}

export async function waitActive(conn: PixelblazeConnection, id: string, timeoutMs = ACTIVATION_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const config = await conn.getConfig()
    assertBenchPixels(config.pixelCount)
    if (config.activeProgramId === id) return config
    await sleep(300)
  }
  throw new Error(`${id} did not become active within ${timeoutMs} ms`)
}

export async function snapshot(conn: PixelblazeConnection, ip: string): Promise<ControllerSnapshot> {
  const config = await conn.getConfig()
  const programs = (await conn.listPrograms()).map((p) => ({ id: p.id, name: p.name }))
  const response = await fetch(`http://${ip}/pixelmap.dat`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`GET pixelmap.dat -> ${response.status}`)
  const map = Buffer.from(await response.arrayBuffer())
  return {
    activeProgramId: config.activeProgramId,
    brightness: config.brightness,
    pixelCount: config.pixelCount,
    mapSha256: createHash('sha256').update(map).digest('hex'),
    programs,
  }
}

export function baselineIds(): Set<string> {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as { programs: Array<{ id: string }> }
  return new Set(baseline.programs.map((p) => p.id))
}

export type ProbeSave = (
  id: string, name: string, source: string, requireExisting: boolean,
) => Promise<{ blobBytes: number; sha256: string; bytecodeSha256: string }>

export function recordProbe(id: string, name: string): void {
  if (!name.startsWith(PREFIX)) throw new Error(`probe name ${name} lacks ${PREFIX}`)
  assertProbeTarget(id, baselineIds())
  appendFileSync(MANIFEST, `${JSON.stringify({ id, name, at: new Date().toISOString() })}\n`)
}

let previewJpeg: Uint8Array | null = null
export async function probePreview(): Promise<Uint8Array> {
  previewJpeg ??= new Uint8Array(await sharp({
    create: { width: 100, height: 150, channels: 3, background: { r: 40, g: 0, b: 60 } },
  }).jpeg({ quality: 70 }).toBuffer())
  return previewJpeg
}

/** Raw-protocol Save that waits for the firmware's flash-write reply. */
export async function rawSave(conn: PixelblazeConnection, id: string, name: string, sourceCode: string, byteCode: Uint8Array) {
  assertProbeTarget(id, baselineIds())
  const blob = encodePbp({ id, name, sourceCode, byteCode, previewImage: await probePreview() })
  const result = await conn.saveProgramAndWait(id, blob)
  if (result !== 'confirmed') throw new Error(`Save of ${name} was ${result}`)
  return {
    blobBytes: blob.length,
    sha256: createHash('sha256').update(blob).digest('hex'),
    bytecodeSha256: createHash('sha256').update(byteCode).digest('hex'),
  }
}

const pick = (vars: Record<string, number>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, vars[k]]))
const recordingKeys = (count: number) => Array.from({ length: count }, (_, i) => [`got${i}`, `n${i}`]).flat()

async function fpsMode(ip: string, out: string) {
  const compile = await fetchControllerCompiler(ip, 1)
  const sampleMs = Number(arg('--sample', '10000'))
  const only = arg('--patterns') ? arg('--patterns').split(',') : null
  const rows: Array<Record<string, unknown>> = []
  await withSession(ip, async ({ conn, fps, status }) => {
    const start = await conn.getConfig()
    if (start.runSequencer) throw new Error('sequencer is running; refusing')
    for (const pattern of PROBE_PATTERNS.filter((p) => !only || only.includes(p.name))) {
      const source = readFileSync(pattern.path, 'utf8')
      const versions = [...FPS_VERSIONS, { ...FPS_VERSIONS[0], key: 'U2', label: 'unwrapped again' }]
      for (const version of versions) {
        const variant = buildVariant(source, version.settings, PIXELS)
        const row: Record<string, unknown> = { pattern: pattern.name, version: version.key, label: version.label }
        if (variant.plan?.declined) {
          rows.push({ ...row, refused: variant.plan.declined })
          continue
        }
        let bytecode: Uint8Array
        try {
          bytecode = compile(variant.code)
        } catch (error) {
          rows.push({ ...row, refused: { reason: 'compile', message: (error as Error).message } })
          continue
        }
        const id = makeProgramId()
        conn.pushByteCode(bytecode, { id, name: '' })
        const activation = performance.now()
        const config = await waitActive(conn, id)
        await sleep(SETTLE_MS)
        const from = performance.now()
        await sleep(sampleMs)
        const to = performance.now()
        const summary = summarizeFreshFps(fps, from, to)
        const windowStatus = status.filter((s) => (s.at as number) >= from && (s.at as number) <= to)
        const lastStatus = windowStatus[windowStatus.length - 1] ?? null
        const vars = variant.readback.length ? pick(await conn.getVars(), variant.readback) : {}
        Object.assign(row, {
          programId: id,
          activationMs: Math.round(from - activation - SETTLE_MS),
          bytecodeBytes: bytecode.length,
          wrapperArrayWords: variant.plan?.arrayWords ?? 0,
          fps: summary,
          effective: vars,
          activeControls: config.activeControls ?? null,
          status: lastStatus,
        })
        rows.push(row)
        log(`${pattern.name} ${version.key}: ${summary ? summary.mean.toFixed(2) : 'unmeasured'} fps (n=${summary?.n ?? 0}) mem=${String(lastStatus?.mem)} ${JSON.stringify(vars)}`)
      }
    }
    if (start.activeProgramId) {
      conn.setActiveProgram(start.activeProgramId, false)
      await waitActive(conn, start.activeProgramId)
    }
  })
  const verdicts = PROBE_PATTERNS.map((p) => {
    const u = rows.find((r) => r.pattern === p.name && r.version === 'U')?.fps as { mean: number } | null | undefined
    const d = rows.find((r) => r.pattern === p.name && r.version === 'D')?.fps as { mean: number } | null | undefined
    return { pattern: p.name, ...(u && d ? defaultsVerdict(u.mean, d.mean) : { ratio: null, pass: null }) }
  })
  writeFileSync(out, JSON.stringify({ ip, at: new Date().toISOString(), sampleMs, settleMs: SETTLE_MS, rows, verdicts }, null, 2))
}

async function slidersMode(ip: string, out: string) {
  const compile = await fetchControllerCompiler(ip, 1)
  const source = sliderProbeSource(LABEL_PROBE_NAMES)
  const bytecode = compile(source)
  const id = makeProgramId()
  const name = `${PREFIX}sliders`
  const keys = recordingKeys(LABEL_PROBE_NAMES.length)
  const result: Record<string, unknown> = { ip, id, name, names: LABEL_PROBE_NAMES }
  await withSession(ip, async ({ conn }) => {
    const starting = await conn.getConfig()
    result.startingActive = starting.activeProgramId
    if ((await conn.listPrograms()).some((p) => p.name.startsWith(name))) throw new Error(`${name} already listed`)
    recordProbe(id, name)
    result.save = await rawSave(conn, id, name, source, bytecode)
    result.afterSave = { activeProgramId: (await conn.getConfig()).activeProgramId }
  })
  // Fresh socket: stored controls before any activation or value.
  await withSession(ip, async ({ conn }) => {
    result.storedBeforeActivation = await conn.getControls(id)
    conn.setActiveProgram(id, false)
    const config = await waitActive(conn, id)
    await sleep(SETTLE_MS)
    result.bySetActiveProgram = {
      activeControls: config.activeControls ?? null,
      activeControlsLater: (await conn.getConfig()).activeControls ?? null,
      vars: pick(await conn.getVars(), keys),
      stored: await conn.getControls(id),
    }
  })
  // Fresh socket: the IDE's activation route, pushByteCode under the same id.
  await withSession(ip, async ({ conn }) => {
    conn.pushByteCode(bytecode, { id, name })
    const config = await waitActive(conn, id)
    await sleep(SETTLE_MS)
    result.byPushByteCode = {
      activeControls: config.activeControls ?? null,
      activeControlsLater: (await conn.getConfig()).activeControls ?? null,
      vars: pick(await conn.getVars(), keys),
      stored: await conn.getControls(id),
    }
    result.listedAfter = (await conn.listPrograms()).filter((p) => p.id === id)
  })
  writeFileSync(out, JSON.stringify(result, null, 2))
}

async function setMode(ip: string, out: string) {
  const id = arg('--id')
  if (!id) throw new Error('--id <sliders probe id>')
  assertProbeTarget(id, baselineIds())
  const keys = recordingKeys(LABEL_PROBE_NAMES.length)
  const values = Object.fromEntries(LABEL_PROBE_NAMES.map((n, i) => [n, [0.1, 0.25, 0.5, 0.75, 0.9][i]]))
  const result: Record<string, unknown> = { ip, id, values }
  await withSession(ip, async ({ conn }) => {
    const active = (await conn.getConfig()).activeProgramId
    if (active !== id) throw new Error(`sliders probe is not active (active: ${active})`)
    result.before = pick(await conn.getVars(), keys)
    conn.setControls(values, false)
    await sleep(1500)
    result.after = pick(await conn.getVars(), keys)
    result.activeControls = (await conn.getConfig()).activeControls ?? null
    result.stored = await conn.getControls(id)
  })
  writeFileSync(out, JSON.stringify(result, null, 2))
}

async function readSlidersMode(ip: string, out: string) {
  const id = arg('--id')
  if (!id) throw new Error('--id <sliders probe id>')
  assertProbeTarget(id, baselineIds())
  const result = await withSession(ip, async ({ conn }) => {
    const config = await conn.getConfig()
    if (config.activeProgramId !== id) throw new Error(`sliders probe is not active (active: ${config.activeProgramId})`)
    return {
      ip, id, activeControls: config.activeControls ?? null,
      vars: pick(await conn.getVars(), recordingKeys(LABEL_PROBE_NAMES.length)),
      stored: await conn.getControls(id),
    }
  })
  writeFileSync(out, JSON.stringify(result, null, 2))
}

/** Read stored controls and, once activated, live controls and handler values. */
async function readValues(ip: string, id: string, sliders: string[], activate: boolean) {
  return withSession(ip, async ({ conn }) => {
    const stored = await conn.getControls(id)
    if (!activate) return { stored }
    conn.setActiveProgram(id, false)
    const config = await waitActive(conn, id)
    await sleep(SETTLE_MS)
    return {
      stored,
      storedAfterActivation: await conn.getControls(id),
      activeControls: config.activeControls ?? null,
      handlers: pick(await conn.getVars(), recordingKeys(sliders.length)),
    }
  })
}

export const SURVIVAL_VALUES = { [SLIDER_NAMES.plainSpeed]: 0.3, [SLIDER_NAMES.plainDreamy]: 0.7 }

/** Shared survival setup: save the target and a parking probe, activate the
 * target, save non-default values, confirm them over a fresh socket and park
 * on the other probe so the rewrite targets an inactive Pattern. */
async function survivalSetup(
  ip: string, compile: (s: string) => Uint8Array, path: string, kase: SurvivalCase, saveTarget: ProbeSave,
) {
  const initial = survivalSource(kase, 'initial')
  const id = makeProgramId()
  const name = `${PREFIX}sv-${path}-${kase}`
  const parkId = makeProgramId()
  const parkName = `${PREFIX}park-${path}-${kase}`
  await withSession(ip, async ({ conn }) => {
    const listed = await conn.listPrograms()
    if (listed.some((p) => p.id === id || p.id === parkId || p.name === name || p.name === parkName) || id === parkId) {
      throw new Error(`${name} or its parking probe already exists`)
    }
    recordProbe(id, name)
  })
  const initialSave = await saveTarget(id, name, initial.source, false)
  const parkSave = await withSession(ip, async ({ conn }) => {
    recordProbe(parkId, parkName)
    const park = sliderProbeSource(['sliderPark'], 'park')
    const saved = await rawSave(conn, parkId, parkName, park, compile(park))
    conn.setActiveProgram(id, false)
    await waitActive(conn, id)
    await sleep(SETTLE_MS)
    conn.setControls(SURVIVAL_VALUES, true)
    await sleep(2000)
    return saved
  })
  const confirmedBefore = await readValues(ip, id, initial.sliders, false)
  const values = confirmedBefore.stored.controls as Record<string, Record<string, number>> | undefined
  if (Object.entries(SURVIVAL_VALUES).some(([slider, expected]) => {
    const actual = values?.[id]?.[slider]
    return typeof actual !== 'number' || Math.abs(actual - expected) > 0.001
  })) throw new Error(`${name}: initial controls were not confirmed: ${JSON.stringify(confirmedBefore)}`)
  await withSession(ip, async ({ conn }) => {
    conn.setActiveProgram(parkId, false)
    await waitActive(conn, parkId)
  })
  return { id, name, parkId, parkName, initialSave, parkSave, confirmedBefore, initialSliders: initial.sliders }
}

/** After a rewrite: fresh read, then activate the target, park, and return. */
export async function survivalReadBack(ip: string, id: string, parkId: string, sliders: string[]) {
  const fresh = await readValues(ip, id, sliders, false)
  const activated = await readValues(ip, id, sliders, true)
  await withSession(ip, async ({ conn }) => {
    conn.setActiveProgram(parkId, false)
    await waitActive(conn, parkId)
  })
  const returned = await readValues(ip, id, sliders, true)
  return { fresh, activated, returned }
}

export async function runSurvival(ip: string, out: string, path: 'raw' | 'ide', saveTarget?: ProbeSave) {
  const cases = arg('--cases', 'a,b,c').split(',')
  if (cases.some((kase) => kase !== 'a' && kase !== 'b' && kase !== 'c')) throw new Error('--cases a,b,c')
  const compile = await fetchControllerCompiler(ip, 1)
  const save = saveTarget ?? ((id, name, source) =>
    withSession(ip, ({ conn }) => rawSave(conn, id, name, source, compile(source))))
  const results: Record<string, unknown>[] = []
  for (const kase of cases as SurvivalCase[]) {
    const setup = await survivalSetup(ip, compile, path, kase, save)
    const { id, name, parkId, initialSave } = setup
    const rewrite = survivalSource(kase, 'rewrite')
    const rewriteSave = await save(id, name, rewrite.source, true)
    const identicalBytes = rewriteSave.sha256 === initialSave.sha256
    if (kase === 'a' ? !identicalBytes : rewriteSave.bytecodeSha256 === initialSave.bytecodeSha256) {
      throw new Error(`${name}: rewrite did not match the required byte comparison`)
    }
    const afterRewrite = await survivalReadBack(ip, id, parkId, rewrite.sliders)
    const record: Record<string, unknown> = {
      path, case: kase, ...setup, rewriteSliders: rewrite.sliders, rewriteSave, identicalBytes, afterRewrite,
    }
    if (kase === 'c') {
      const restore = survivalSource('c', 'restore')
      record.restoreSave = await save(id, name, restore.source, true)
      record.restoreSliders = restore.sliders
      record.afterRestore = await survivalReadBack(ip, id, parkId, restore.sliders)
    }
    results.push(record)
    writeFileSync(out, JSON.stringify({ ip, at: new Date().toISOString(), values: SURVIVAL_VALUES, results }, null, 2))
    log(`${path} ${kase}: ${JSON.stringify(afterRewrite.fresh)}`)
  }
}

async function jonMode(ip: string, out: string) {
  const compile = await fetchControllerCompiler(ip, 1)
  const pattern = PROBE_PATTERNS.find((p) => p.name === arg('--pattern', 'WavyBands'))
  if (!pattern) throw new Error('unknown --pattern')
  const variant = buildVariant(readFileSync(pattern.path, 'utf8'), { position: 1, dreamy: 0 }, PIXELS, {
    amountSpeedSlider: SLIDER_NAMES.plainSpeed, dreamySlider: SLIDER_NAMES.plainDreamy,
  })
  const bytecode = compile(variant.code)
  const id = makeProgramId()
  const name = `${PREFIX}jon-${pattern.name}`
  await withSession(ip, async ({ conn }) => {
    if ((await conn.listPrograms()).some((p) => p.name === name)) throw new Error(`${name} already listed`)
    recordProbe(id, name)
    const save = await rawSave(conn, id, name, variant.code, bytecode)
    conn.pushByteCode(bytecode, { id, name })
    await waitActive(conn, id)
    await sleep(SETTLE_MS)
    const vars = pick(await conn.getVars(), variant.readback)
    writeFileSync(out, JSON.stringify({ ip, id, name, save, effective: vars, stored: await conn.getControls(id) }, null, 2))
  })
}

async function overBudgetMode(ip: string, out: string) {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
    ip: string
    config: { chipId: number; firmwareVersion: string }
  }
  if (ip !== baseline.ip) throw new Error('Over-budget probe requires the captured bench Controller')
  const runId = makeProgramId()
  const saveId = makeProgramId()
  const saveName = `${PREFIX}over-budget-save`
  const evidence: Record<string, unknown> = { ip, runId, saveId, saveName }
  const persist = () => writeFileSync(out, JSON.stringify(evidence, null, 2))
  writeFileSync(out, JSON.stringify(evidence, null, 2), { flag: 'wx' })

  let phase = 'bench identity'
  try {
    await withSession(ip, async ({ conn, json }) => {
      const before = await conn.getConfig()
      if (before.chipId !== baseline.config.chipId
        || before.firmwareVersion !== baseline.config.firmwareVersion || before.runSequencer !== false) {
        throw new Error('Bench identity, firmware, or sequencer does not match the probe baseline')
      }
      evidence.before = { activeProgramId: before.activeProgramId, chipId: before.chipId, firmware: before.firmwareVersion }
      const existing = await conn.listPrograms()
      if (runId === saveId || existing.some((p) => p.name === saveName || p.id === runId || p.id === saveId)) {
        throw new Error('Over-budget probe ids and Save name must be new')
      }
      const ids = baselineIds()
      assertProbeTarget(runId, ids)
      assertProbeTarget(saveId, ids)

      phase = 'compiler'
      const compile = await fetchControllerCompiler(ip, 1)
      let byteCode: Uint8Array
      try {
        byteCode = compile(OVER_BUDGET_PROBE_SOURCE)
      } catch (error) {
        evidence.compiler = { outcome: 'refused', error: (error as Error).message }
        persist()
        return
      }
      evidence.compiler = { outcome: 'compiled', bytes: byteCode.length }
      persist()
      const blob = encodePbp({ id: saveId, name: saveName, sourceCode: OVER_BUDGET_PROBE_SOURCE,
        byteCode, previewImage: await probePreview() })

      phase = 'Run'
      const interestingFrames = (from: number) => json.slice(from).filter((frame) =>
        'setCode' in frame || 'vmerr' in frame || 'fps' in frame || 'saveProgramSourceFile' in frame)
      const fromRun = json.length
      const run: Record<string, unknown> = { id: runId }
      evidence.run = run
      try {
        conn.pushByteCode(byteCode, { id: runId, name: '' })
        await sleep(SETTLE_MS)
        const config = await conn.getConfig()
        assertBenchPixels(config.pixelCount)
        run.activeProgramId = config.activeProgramId ?? null
        run.saved = (await conn.listPrograms()).some((p) => p.id === runId)
        run.responsive = true
      } finally {
        run.frames = interestingFrames(fromRun)
        persist()
      }

      phase = 'Save'
      const fromSave = json.length
      const save: Record<string, unknown> = { id: saveId }
      evidence.save = save
      try {
        recordProbe(saveId, saveName)
        try {
          save.outcome = await conn.saveProgramAndWait(saveId, blob)
        } catch (error) {
          if (!json.slice(fromSave).some((frame) => frame.saveProgramSourceFile === false)) throw error
          save.outcome = 'rejected'
        }
        const config = await conn.getConfig()
        assertBenchPixels(config.pixelCount)
        save.activeProgramId = config.activeProgramId ?? null
        save.saved = (await conn.listPrograms()).some((p) => p.id === saveId && p.name === saveName)
        save.responsive = true
      } finally {
        save.frames = interestingFrames(fromSave)
        persist()
      }
    })
  } catch (error) {
    evidence.stopped = { phase, error: (error as Error).message }
    persist()
    throw error
  }
  log(`over-budget: ${out}`)
}

async function restoreMode(ip: string, out: string) {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
    ip: string
    config: { activeProgramId: string; brightness: number; pixelCount: number }
    map: { sha256: string }
    programs: Array<{ id: string; name: string }>
  }
  if (ip !== baseline.ip) throw new Error('Restore requires the captured bench Controller')
  const ids = baselineIds()
  const manifest = existsSync(MANIFEST)
    ? readFileSync(MANIFEST, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { id: string; name: string })
    : []
  const deleted: string[] = []
  await withSession(ip, async ({ conn }) => {
    conn.setActiveProgram(baseline.config.activeProgramId, false)
    await waitActive(conn, baseline.config.activeProgramId)
    const listed = await conn.listPrograms()
    for (const probe of manifest) {
      if (ids.has(probe.id)) throw new Error(`manifest names baseline id ${probe.id}; refusing`)
      if (!listed.some((p) => p.id === probe.id && p.name === probe.name)) continue
      conn.deleteProgram(probe.id)
      deleted.push(`${probe.id} ${probe.name}`)
      await sleep(300)
    }
    await sleep(3000)
  })
  const after = await withSession(ip, ({ conn }) => snapshot(conn, ip))
  const before: ControllerSnapshot = {
    activeProgramId: baseline.config.activeProgramId,
    brightness: baseline.config.brightness,
    pixelCount: baseline.config.pixelCount,
    mapSha256: baseline.map.sha256,
    programs: baseline.programs,
  }
  const verdict = compareRestore(before, after)
  writeFileSync(out, JSON.stringify({ ip, at: new Date().toISOString(), deleted, after, verdict }, null, 2))
  log(`restore: ${verdict.ok ? 'matches baseline' : verdict.differences.join('; ')}`)
  if (!verdict.ok) throw new Error('Restore snapshot differs from baseline')
}

async function baselineMode(ip: string, out: string) {
  await withSession(ip, async ({ conn, json }) => {
    const shot = await snapshot(conn, ip)
    const config = await conn.getConfig()
    const settings = json.find((m) => 'pixelCount' in m && 'brightness' in m) ?? null
    writeFileSync(out, JSON.stringify({ ip, at: new Date().toISOString(), config, settings, ...shot }, null, 2))
  })
}

async function main() {
  if (!IP) throw new Error('set PIXELBLAZE_IP to the bench Controller')
  const mode = arg('--mode')
  const out = arg('--out')
  if (!out) throw new Error('--out <path> is required')
  const modes: Record<string, (ip: string, out: string) => Promise<void>> = {
    baseline: baselineMode, fps: fpsMode, sliders: slidersMode, set: setMode,
    'read-sliders': readSlidersMode,
    survival: (ip, out) => runSurvival(ip, out, 'raw'), jon: jonMode, restore: restoreMode,
    'over-budget': overBudgetMode,
  }
  const run = modes[mode]
  if (!run) throw new Error(`--mode ${Object.keys(modes).join('|')}`)
  await run(IP, out)
}

if (process.argv[1]?.endsWith('issue1273.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
