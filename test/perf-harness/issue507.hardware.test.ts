import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import { compileShow } from '../../src/engine/showCompiler'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE507_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const pixelCounts = [256, 2_048]

const zoneNames = ['A', 'B']
const zones = zoneNames.map((name, index) => ({
  id: name,
  name,
  ranges: [{ start: index, end: index }],
}))

const artifact = compileShow({
  clips: zoneNames.map((zone, zoneIndex) => ({
    id: zone,
    zone,
    source: `var t = 0
export function beforeRender(delta) { t = t + delta / 1000 }
export function render2D(index, x, y) {
  rgb(${zoneIndex === 0 ? '0.2 + triangle(x * 3 + t * 0.1) * 0.8' : '0.05 + triangle(y * 4 - t * 0.08) * 0.25'}, ${zoneIndex === 0 ? '0.05 + triangle(y * 5 - t * 0.07) * 0.25' : '0.2 + triangle(x * 4 + t * 0.09) * 0.8'}, 0.15 + triangle(x + y + t * 0.04) * 0.4)
}`,
  })),
  zones,
  routingLayouts: [
    { id: 'checker', name: 'Checker', zones, logical: { kind: 'checker', zoneNames, columns: 6, rows: 4 } },
    { id: 'rings', name: 'Rings', zones, logical: { kind: 'rings', zoneNames, rings: 5 } },
    { id: 'pinwheel', name: 'Pinwheel', zones, logical: { kind: 'pinwheel', zoneNames, arms: 7, twist: 3, rotation: 0.2 } },
    { id: 'wave', name: 'Wave', zones, logical: { kind: 'wave', zoneNames, axis: 'y', bands: 5, amplitude: 0.3, frequency: 2.5, phase: 0.1 } },
    { id: 'soft-split', name: 'Soft Split', zones, logical: { kind: 'soft-split', zoneNames: ['A', 'B'], axis: 'x', feather: 0.16 } },
  ],
  routingSwitches: [
    { atMs: 1_000, layoutId: 'rings' },
    { atMs: 2_000, layoutId: 'pinwheel' },
    { atMs: 3_000, layoutId: 'wave' },
    { atMs: 4_000, layoutId: 'soft-split' },
  ],
  routingPropertyRamps: {
    splitPosition: { initial: 0.25, ramps: [{ atMs: 4_000, durationMs: 1_000, from: 0.25, to: 0.75, easing: 'linear' }] },
  },
  loopDurationMs: 5_000,
}, {})

describe('production adaptive spatial operators on PB32 (#507)', () => {
  it('emits a constant-memory production artifact accepted by the hardware harness', () => {
    expect(artifact.code).not.toContain('NaN')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_route_pixels')
    expect(artifact.summary.routingRepresentation).toBe('coordinate-predicates')
    expect(artifact.summary.steadyStateRenderersPerPixel).toBe(1)
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(2)
    expect(artifact.summary.cost.memory.generatedArrayElements).toBe(0)
  })

  it.skipIf(!runHardware)('activates the production-compiled Show at 256 and 2,048 pixels and restores Controller state', async () => {
    const compile = await fetchControllerCompiler(ip)
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 15_000,
      pingIntervalMs: 0,
    })
    connection.on('error', (error) => console.error('controller socket:', error))
    await connection.connect()
    const original = await connection.getConfig()
    if (!original.activeProgramId) {
      connection.close()
      throw new Error('Controller did not report an active Pattern; refusing a non-reversible probe.')
    }

    let runError: unknown
    const measurements: unknown[] = []
    try {
      for (const pixelCount of pixelCounts) {
        if ((await connection.getConfig()).pixelCount !== pixelCount) {
          connection.setPixelCount(pixelCount, false)
          await sleep(1_000)
        }
        measurements.push({
          pixelCount,
          ...await pushAndMeasureControllerArtifact(connection, artifact, compile, {
            activationTimeoutMs: 15_000,
            settleMs: 1_000,
            sampleMs: 6_500,
          }),
        })
      }
      console.log(JSON.stringify({
        controller: {
          ip,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
          originalActiveProgramId: original.activeProgramId,
        },
        compiler: {
          routingRepresentation: artifact.summary.routingRepresentation,
          steadyStateRenderersPerPixel: artifact.summary.steadyStateRenderersPerPixel,
          worstInstantRenderersPerPixel: artifact.summary.worstInstantRenderersPerPixel,
          generatedArrayElements: artifact.summary.cost.memory.generatedArrayElements,
        },
        measurements,
      }, null, 2))
    } catch (error) {
      runError = error
    } finally {
      try {
        try {
          await connection.getConfig()
        } catch {
          await sleep(2_000)
          await connection.connect()
        }
        connection.setActiveProgram(original.activeProgramId)
        if (original.pixelCount) connection.setPixelCount(original.pixelCount, false)
        const restored = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount },
        )
        if (restored.activeProgramId !== original.activeProgramId || restored.pixelCount !== original.pixelCount) {
          const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount})`)
          runError = runError == null
            ? restoreError
            : new AggregateError([runError, restoreError], 'probe and restoration both failed')
        }
      } finally {
        connection.close()
      }
    }

    if (runError != null) throw runError
    expect(measurements).toHaveLength(pixelCounts.length)
  }, 90_000)
})
