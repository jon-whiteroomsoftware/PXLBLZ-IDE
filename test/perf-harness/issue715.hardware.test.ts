// #715: device pricing of packed-data Show artifacts on the pb32.
// 1. Prices each encoding fixture with the Controller's own compiler.
// 2. Verifies plain-literal and guarded packed-15 data by exported checksum.
// 3. Bisects the activation ceiling for literal-heavy bytecode.
// 4. Measures the unpack loop's per-frame cost as a paired FPS run.
// Writes issue715-pricing-report.json and restores the original Pattern.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import { makeProgramId } from '../../src/engine/bytecodePush'
import {
  fetchControllerCompiler,
  fetchControllerCompilerInspector,
  nodeWebSocketFactory,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import {
  buildChecksumFixture,
  buildPricingFixtures,
  buildUnpackFixtures,
  literalFillerSource,
} from './issue715'

const runHardware = process.env.ISSUE715_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

describe('packed-data artifact pricing on the Controller (#715)', () => {
  it.skipIf(!runHardware)('prices encodings, proves correctness, bisects the ceiling, and measures unpack cost', async () => {
    const inspect = await fetchControllerCompilerInspector(ip)
    const pricing = [256, 1024, 2048].flatMap((n) => {
      const baselineBytes = inspect(`var t = array(${n})\nexport function render(index) { rgb(0, 0, 0) }\n`).compiledWordCount * 4
      return buildPricingFixtures(n).map((fixture) => {
        const bytecodeBytes = inspect(fixture.source).compiledWordCount * 4
        const dataBytes = bytecodeBytes - baselineBytes
        return {
          n,
          label: fixture.label,
          sourceBytes: Buffer.byteLength(fixture.source),
          bytecodeBytes,
          bytecodePerValue: fixture.values ? +(dataBytes / fixture.values).toFixed(2) : null,
          sourcePerValue: fixture.values ? +(Buffer.byteLength(fixture.source) / fixture.values).toFixed(2) : null,
        }
      })
    })

    const compile = await fetchControllerCompiler(ip)
    let connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 15_000,
      pingIntervalMs: 0,
    })
    connection.on('error', (error) => console.error('controller socket:', String(error)))
    await connection.connect()
    const original = await connection.getConfig()
    if (!original.activeProgramId) {
      connection.close()
      throw new Error('Controller did not report an active Pattern; refusing a non-reversible probe.')
    }

    const reconnect = async () => {
      try { connection.close() } catch { /* already closed */ }
      await sleep(2_000)
      connection = new PixelblazeConnection({
        host: ip,
        webSocketFactory: nodeWebSocketFactory,
        requestTimeoutMs: 15_000,
        pingIntervalMs: 0,
      })
      connection.on('error', (error) => console.error('controller socket:', String(error)))
      await connection.connect()
    }

    // A failed oversized activation can drop the socket; every probe repairs
    // the connection rather than aborting the run (Phase B1 lost its
    // bisection to exactly this).
    const pushProbe = async (source: string, activationTimeoutMs = 12_000) => {
      const bytecode = compile(source)
      const programId = makeProgramId()
      const startedMs = Date.now()
      try {
        connection.pushByteCode(bytecode, { id: programId, name: '' })
      } catch {
        await reconnect()
        connection.pushByteCode(bytecode, { id: programId, name: '' })
      }
      const deadline = Date.now() + activationTimeoutMs
      let active: string | undefined
      while (Date.now() < deadline) {
        await sleep(400)
        try {
          active = (await connection.getConfig()).activeProgramId
        } catch {
          try { await reconnect() } catch { /* keep polling until deadline */ }
        }
        if (active === programId) break
      }
      return {
        bytecodeBytes: bytecode.length,
        activated: active === programId,
        activationMs: active === programId ? Date.now() - startedMs : null,
      }
    }

    let runError: unknown
    let report: Record<string, unknown> | undefined
    try {
      const checksumFixture = buildChecksumFixture(1024)
      const checksumProbe = await pushProbe(checksumFixture.source)
      if (!checksumProbe.activated) throw new Error('checksum pattern did not activate')
      await sleep(1_500)
      const vars = await connection.getVars()
      const correctness = {
        litsum: vars.litsum,
        packsum: vars.packsum,
        expectedLiteral: checksumFixture.expectedLiteral,
        expectedPacked: checksumFixture.expectedPacked,
        literalOk: vars.litsum === checksumFixture.expectedLiteral,
        packedOk: vars.packsum === checksumFixture.expectedPacked,
      }

      const probes: Array<{ elements: number; bytecodeBytes: number; activated: boolean; activationMs: number | null }> = []
      const probeElements = async (elements: number) => {
        const result = await pushProbe(literalFillerSource(elements))
        probes.push({ elements, ...result })
        return result.activated
      }
      let low = 14_000
      let high = 22_000
      if (!(await probeElements(low))) throw new Error('low bisection anchor failed to activate; widen downward')
      if (await probeElements(high)) throw new Error('high bisection anchor activated; widen upward')
      while (high - low > 64) {
        const middle = Math.round((low + high) / 2)
        if (await probeElements(middle)) low = middle
        else high = middle
      }
      const activationCeiling = {
        probes,
        largestActivating: probes.filter((p) => p.activated).reduce((best, p) => (p.elements > best.elements ? p : best)),
        smallestFailing: probes.filter((p) => !p.activated).reduce((best, p) => (p.elements < best.elements ? p : best)),
        statementFillerCeilingReference: 68_384,
      }

      const measureFps = async (source: string, label: string) => {
        const probe = await pushProbe(source)
        if (!probe.activated) throw new Error(`${label} did not activate`)
        await sleep(2_000)
        const samples: number[] = []
        const end = Date.now() + 8_000
        while (Date.now() < end) {
          if (connection.fps && connection.fps > 0) samples.push(connection.fps)
          await sleep(250)
        }
        if (samples.length === 0) throw new Error(`${label}: Controller did not report FPS`)
        const sorted = [...samples].sort((a, b) => a - b)
        const middle = Math.floor(sorted.length / 2)
        return {
          label,
          medianFps: sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle],
          samples: samples.length,
          min: Math.min(...samples),
          max: Math.max(...samples),
        }
      }
      const unpackFixtures = buildUnpackFixtures(1024)
      const base = await measureFps(unpackFixtures.base, 'no-unpack')
      const everyFrame = await measureFps(unpackFixtures.everyFrame, 'unpack-512-words-per-frame')
      const perFrameMs = 1000 / everyFrame.medianFps - 1000 / base.medianFps
      const unpackCost = {
        base,
        everyFrame,
        perFrameMs: +perFrameMs.toFixed(3),
        perWordMicroseconds: +((perFrameMs * 1000) / 512).toFixed(2),
      }

      report = {
        generatedAt: new Date().toISOString(),
        device: { name: original.name, firmwareVersion: original.firmwareVersion, pixelCount: original.pixelCount },
        pricing,
        correctness,
        activationCeiling,
        unpackCost,
      }
      writeFileSync(
        join(process.cwd(), 'test/perf-harness/issue715-pricing-report.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      )
      console.log(JSON.stringify(report))
      expect(correctness.literalOk).toBe(true)
      expect(correctness.packedOk).toBe(true)
    } catch (error) {
      runError = error
    } finally {
      try {
        try {
          await connection.getConfig()
        } catch {
          await reconnect()
        }
        connection.setActiveProgram(original.activeProgramId)
        if (original.pixelCount != null) connection.setPixelCount(original.pixelCount, false)
        const restored = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount },
        )
        if (restored.activeProgramId !== original.activeProgramId) {
          const restoreError = new Error('Controller state did not restore.')
          runError = runError == null ? restoreError : new AggregateError([runError as Error, restoreError])
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(report).toBeTruthy()
  }, 600_000)
})
