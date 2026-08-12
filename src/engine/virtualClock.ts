export interface VirtualClock {
  advance(ms: number): void
  getTime(): number
  setTime(ms: number): void
  reset(): void
}

export function createVirtualClock(): VirtualClock {
  let time = 0
  return {
    advance(ms) { time += ms },
    getTime() { return time },
    setTime(ms) { time = ms },
    reset() { time = 0 },
  }
}
