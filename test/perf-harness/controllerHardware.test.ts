import { waitForControllerConfig } from './controllerHardware'

describe('waitForControllerConfig', () => {
  it('polls through stale configuration replies until the expected state arrives', async () => {
    const replies = [
      { activeProgramId: 'probe', pixelCount: 1_000 },
      { activeProgramId: 'probe', pixelCount: 256 },
      { activeProgramId: 'original', pixelCount: 256 },
    ]
    let reads = 0

    const restored = await waitForControllerConfig(
      async () => replies[Math.min(reads++, replies.length - 1)],
      { activeProgramId: 'original', pixelCount: 256 },
      1_000,
    )

    expect(restored).toEqual({ activeProgramId: 'original', pixelCount: 256 })
    expect(reads).toBe(3)
  })
})
