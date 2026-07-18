import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { buildIssue533Artifacts, issue533Report, ISSUE533_PIXEL_COUNTS } from './issue533'

describe('Freeze-at-entry benchmark artifacts (#533)', () => {
  it('selects the RGB cache at 256, 1,000, and 2,000 pixels without extra arrays', () => {
    expect(issue533Report.map((row) => row.pixelCount)).toEqual([...ISSUE533_PIXEL_COUNTS])
    for (const row of issue533Report) {
      expect(row.selectedScenes).toBe(2)
      expect(row.estimatedPatternEvaluationsAvoidedPerReplayFrame).toBe(row.pixelCount)
      expect(row.vmWordDelta).toBe(0)
      expect(row.freeze.arenaWords).toBe(row.pixelCount * 3 + 12)
      expect(row.freeze.remainingVmWords).toBeGreaterThanOrEqual(0)
    }
  })

  it('matches Live on the capture frame in Fast and Precise replay', () => {
    const { live, freeze } = buildIssue533Artifacts(256)
    for (const fidelity of ['fast', 'fidelity'] as const) {
      expect(firstFrameChecksum(freeze, fidelity)).toBe(firstFrameChecksum(live, fidelity))
    }
  })
})

function firstFrameChecksum(
  artifact: ReturnType<typeof buildIssue533Artifacts>['freeze'],
  fidelity: 'fast' | 'fidelity',
): string {
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 1,
  }, {
    mapPoints: Array.from({ length: 256 }, () => ({ sample: [] })),
    randomSeed: 533,
    fidelity,
  })
  return runtime.advanceLive(16).checksum
}
