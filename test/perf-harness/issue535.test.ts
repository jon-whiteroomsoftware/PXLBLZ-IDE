import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import {
  buildIssue535Artifacts,
  issue535Report,
  ISSUE535_PIXEL_COUNTS,
  ISSUE535_REFRESH_CADENCES_MS,
  ISSUE535_ROLLING_SLICES,
} from './issue535'

describe('whole-frame Refresh benchmark artifacts (#535)', () => {
  it('selects every diagnostic cadence through the existing RGB arena', () => {
    expect(issue535Report.map((row) => row.pixelCount)).toEqual([...ISSUE535_PIXEL_COUNTS])
    for (const row of issue535Report) {
      for (const cadenceMs of ISSUE535_REFRESH_CADENCES_MS) {
        const refresh = row.refresh[cadenceMs]
        expect(refresh.selectedScenes).toBe(2)
        expect(refresh.cadenceMs).toEqual([cadenceMs, cadenceMs])
        expect(refresh.evaluationsAvoidedPerReplayFrame).toBe(row.pixelCount)
        expect(refresh.vmWords).toBe(row.freeze.vmWords)
        expect(refresh.arenaWords).toBe(row.pixelCount * 3 + 12)
        expect(refresh.remainingVmWords).toBeGreaterThanOrEqual(0)
      }
      for (const slices of ISSUE535_ROLLING_SLICES) {
        const rolling = row.rollingRefresh[slices]
        expect(rolling.selectedScenes).toBe(2)
        expect(rolling.slices).toEqual([slices, slices])
        expect(rolling.maxPixelAgeFrames).toBe(slices - 1)
        expect(rolling.evaluationsAvoidedPerFrame).toBe(row.pixelCount - Math.ceil(row.pixelCount / slices))
        expect(rolling.vmWords).toBe(row.freeze.vmWords)
        expect(rolling.arenaWords).toBe(row.pixelCount * 3 + 12)
        expect(rolling.remainingVmWords).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('matches Live on complete refresh traversals and replays deterministically between them', () => {
    const { live, refresh } = buildIssue535Artifacts(256)
    const selected = refresh.get(1_000)!
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const liveRuntime = runtime(live, fidelity)
      const refreshRuntime = runtime(selected, fidelity)

      const liveEntry = liveRuntime.advanceLive(16)
      const refreshEntry = refreshRuntime.advanceLive(16)
      expect(refreshEntry.checksum).toBe(liveEntry.checksum)

      liveRuntime.advanceLive(16)
      expect(refreshRuntime.advanceLive(16).checksum).toBe(refreshEntry.checksum)

      const liveBoundary = liveRuntime.advanceLive(968)
      const refreshBoundary = refreshRuntime.advanceLive(968)
      expect(refreshBoundary.checksum).toBe(liveBoundary.checksum)
      expect(refreshRuntime.advanceLive(16).checksum).toBe(refreshBoundary.checksum)
    }
  })

  it('updates one rolling slice per frame in both preview fidelities', () => {
    const { rollingRefresh } = buildIssue535Artifacts(256)
    const selected = rollingRefresh.get(4)!
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const rollingRuntime = runtime(selected, fidelity)
      const initialChecksum = rollingRuntime.advanceLive(16).checksum
      const phaseOneChecksum = rollingRuntime.advanceLive(250).checksum
      const phaseTwoChecksum = rollingRuntime.advanceLive(250).checksum
      expect(phaseOneChecksum).not.toBe(initialChecksum)
      expect(phaseTwoChecksum).not.toBe(phaseOneChecksum)
    }
  })

  it('reconstructs whole-frame cadence and rolling phase across segmented seeks', () => {
    const artifacts = buildIssue535Artifacts(256)
    const selected = [artifacts.refresh.get(1_000)!, artifacts.rollingRefresh.get(4)!]
    for (const artifact of selected) {
      for (const fidelity of ['fast', 'fidelity'] as const) {
        const uninterrupted = runtime(artifact, fidelity).advanceTo(1_750, { stepMs: 50 })
        const segmentedRuntime = runtime(artifact, fidelity)
        segmentedRuntime.advanceTo(1_200, { stepMs: 50 })
        const segmented = segmentedRuntime.advanceTo(1_750, { stepMs: 50 })
        expect(segmented.checksum).toBe(uninterrupted.checksum)
        expect(segmented.exports).toEqual(uninterrupted.exports)
      }
    }
  })
})

function runtime(
  artifact: ReturnType<typeof buildIssue535Artifacts>['live'],
  fidelity: 'fast' | 'fidelity',
) {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 1,
  }, {
    mapPoints: Array.from({ length: 256 }, () => ({ sample: [] })),
    randomSeed: 535,
    fidelity,
  })
}
