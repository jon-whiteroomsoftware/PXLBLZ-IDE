import { report } from './issue516'

describe('Redline snapshot/live crossfade harness (#516)', () => {
  it('pins the arena role, resource delta, and deterministic replay contract', () => {
    expect(report).toMatchObject({
      fixture: 'paired-redline-machine-crossfade',
      pixelCount: 2_000,
      candidates: {
        live: {
          renderPolicy: 'steady-active-transition-both',
          renderTarget: { activeRole: null, words: 6_012 },
        },
        snapshot: {
          renderPolicy: 'snapshot-outgoing-transition-live-incoming',
          renderTarget: { activeRole: 'stage-rgb', words: 6_012 },
        },
      },
      deterministicReplay: [
        { fidelity: 'fast', liveRepeatMatches: true, snapshotRepeatMatches: true },
        { fidelity: 'fidelity', liveRepeatMatches: true, snapshotRepeatMatches: true },
      ],
    })
    expect(report.candidates.snapshot.resources.renderTargetWords).toBe(
      report.candidates.live.resources.renderTargetWords,
    )
    expect(report.candidates.snapshot.resources.persistentGlobals).toBe(
      report.candidates.live.resources.persistentGlobals + 1,
    )
    expect(report.candidates.snapshot.fastMeanTransitionFrameMs).toBeGreaterThan(0)
    expect(report.candidates.snapshot.preciseMeanTransitionFrameMs).toBeGreaterThan(0)
  }, 30_000)
})
