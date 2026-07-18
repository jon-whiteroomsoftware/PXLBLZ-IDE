import { issue538Cases } from './issue538'

describe('shared generated Effect-kernel capacity regression (#538)', () => {
  it('is exact in Fast and Precise replay at 2, 5, and 10 members', () => {
    for (const entry of issue538Cases) {
      expect(entry.parity).toEqual({ fast: true, precise: true })
    }
  })

  it('reduces generated source and globals without adding per-pixel branches', () => {
    for (const entry of issue538Cases) {
      expect(entry.delta.sourceBytes).toBeLessThan(0)
      expect(entry.delta.expandedSourceBytes).toBeLessThan(0)
      expect(entry.delta.persistentGlobals).toBeLessThan(0)
      expect(entry.delta.vmWords).toBe(0)
      expect(entry.delta.perPixelBranches).toBe(0)
    }
  })
})
