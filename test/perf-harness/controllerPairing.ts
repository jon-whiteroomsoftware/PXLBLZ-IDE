// Paired A/B ladder runner for spikes: pushes every candidate in the given
// order at each pixel count, samples FPS, then restores the Controller's
// active Pattern and pixel count, deletes only the probe ids this run
// pushed if any persisted, and reports any other inventory change without
// touching it. Restoration failures fold into the run error so callers can
// still write a partial report.
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
  type ControllerMeasurementOptions,
} from './controllerHardware'

export interface PairedCandidate {
  id: string
  code: string
}

export interface PairedRow {
  pixelCount: number
  candidate: string
  pass: number
  bytecodeBytes: number
  fps: Awaited<ReturnType<typeof pushAndMeasureControllerSource>>['fps']
}

export interface PairedLadderResult {
  controller: { ip: string; name?: string; boardType?: string; firmwareVersion?: string; originalPixelCount: number; originalActiveProgramId: string }
  rows: PairedRow[]
  runError: unknown
}

export async function runPairedLadder(
  ip: string,
  pixelCounts: readonly number[],
  candidates: readonly PairedCandidate[],
  options: ControllerMeasurementOptions & { passes?: number; log?: (line: string) => void } = {},
): Promise<PairedLadderResult> {
  const log = options.log ?? ((line: string) => console.log(line))
  const passes = options.passes ?? 2
  const compile = await fetchControllerCompiler(ip)
  const connection = new PixelblazeConnection({ host: ip, webSocketFactory: nodeWebSocketFactory, requestTimeoutMs: 15_000, pingIntervalMs: 0 })
  connection.on('error', (error) => console.error('controller socket:', error))
  await connection.connect()
  const original = await connection.getConfig()
  if (!original.activeProgramId) { connection.close(); throw new Error('Controller did not report an active Pattern; refusing a non-reversible probe.') }
  const savedPrograms = await connection.listPrograms().catch((error) => { connection.close(); throw error })
  if (!savedPrograms.some((program) => program.id === original.activeProgramId)) {
    connection.close()
    throw new Error(`Active Pattern ${original.activeProgramId} is not in the saved inventory; refusing a non-restorable probe.`)
  }
  if (original.pixelCount == null) { connection.close(); throw new Error('Controller did not report a pixel count; refusing a probe whose count cannot be restored.') }
  // Precondition the protocol cannot check: the active Pattern's controls
  // must be saved; activating probes discards live-tuned values.
  const savedIds = new Set(savedPrograms.map((program) => program.id))
  const pushedIds: string[] = []
  const rows: PairedRow[] = []
  let runError: unknown
  try {
    for (const pixelCount of pixelCounts) {
      connection.setPixelCount(pixelCount, false)
      const applied = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: original.activeProgramId, pixelCount })
      if (applied.pixelCount !== pixelCount) throw new Error(`Controller reports ${applied.pixelCount} pixels after requesting ${pixelCount}.`)
      for (let pass = 0; pass < passes; pass += 1) {
        for (const candidate of candidates) {
          const measured = await pushAndMeasureControllerSource(connection, candidate.code, compile, 0, { ...options, onPushed: (programId) => pushedIds.push(programId) })
          log(`  ${pixelCount} px ${candidate.id} pass ${pass}: ${measured.fps.median.toFixed(3)} median FPS (${measured.fps.samples} samples)`)
          rows.push({ pixelCount, candidate: candidate.id, pass, bytecodeBytes: measured.bytecodeBytes, fps: measured.fps })
        }
      }
    }
  } catch (error) {
    runError = error
  } finally {
    let restore = connection
    try {
      try {
        try { await connection.getConfig() } catch {
          connection.close()
          await sleep(2_000)
          restore = new PixelblazeConnection({ host: ip, webSocketFactory: nodeWebSocketFactory, requestTimeoutMs: 15_000, pingIntervalMs: 0 })
          restore.on('error', (error) => console.error('restore socket:', error))
          await restore.connect()
        }
        restore.setActiveProgram(original.activeProgramId)
        restore.setPixelCount(original.pixelCount, false)
        const restored = await waitForControllerConfig(() => restore.getConfig(), { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount })
        const inventory = await restore.listPrograms()
        const probeLeftovers = inventory.filter((program) => pushedIds.includes(program.id))
        for (const program of probeLeftovers) restore.deleteProgram(program.id)
        const finalInventory = probeLeftovers.length > 0 ? await sleep(1_000).then(() => restore.listPrograms()) : inventory
        const unremoved = finalInventory.filter((program) => pushedIds.includes(program.id)).map((program) => program.id)
        const foreign = finalInventory.filter((program) => !savedIds.has(program.id) && !pushedIds.includes(program.id)).map((program) => program.id)
        const missing = [...savedIds].filter((id) => !finalInventory.some((program) => program.id === id))
        if (foreign.length > 0) console.warn(`Saved inventory gained programs this run did not push (left untouched): ${foreign.join(', ')}`)
        if (restored.activeProgramId !== original.activeProgramId || restored.pixelCount !== original.pixelCount || unremoved.length > 0 || missing.length > 0) {
          const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount}, leftover probe programs=[${unremoved.join(', ')}], missing programs=[${missing.join(', ')}]).`)
          runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
        }
      } catch (restoreFailure) {
        const restoreError = restoreFailure instanceof Error ? restoreFailure : new Error(String(restoreFailure))
        runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
      }
    } finally {
      restore.close()
      if (restore !== connection) connection.close()
    }
  }
  return {
    controller: { ip, name: original.name, boardType: original.boardType, firmwareVersion: original.firmwareVersion, originalPixelCount: original.pixelCount, originalActiveProgramId: original.activeProgramId },
    rows,
    runError,
  }
}
