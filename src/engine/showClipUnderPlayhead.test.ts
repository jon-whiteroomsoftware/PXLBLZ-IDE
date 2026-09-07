import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'
import { currentShowClip } from './showReferenceShow'

describe('Clip under the live-strip playhead (#985)', () => {
  const show = STOCK_SHOWS.find((item) => item.id === 'stock-show-103-clip-transform')!.show

  it.each([[0, 0], [2999, 0], [3000, 1], [15000, 0], [18000, 1], [-1, 4]])(
    'at %i ms names CompassRose at index %i', (time, index) => {
      expect(currentShowClip(show, time)).toEqual({ patternName: 'CompassRose', index, count: 5 })
    },
  )

  it('retains the last started Clip through blank time and sorts the lane by start', () => {
    const edited = structuredClone(show)
    const lane = edited.composition!.scenes[0].zones[0].main
    lane[0].durationMs = 1000
    lane.reverse()
    expect(currentShowClip(edited, 2000)).toEqual({ patternName: 'CompassRose', index: 0, count: 5 })
  })

  it('names the Pattern of a single-Clip lane throughout the loop', () => {
    const edited = structuredClone(show)
    edited.composition!.scenes[0].zones[0].main.splice(1)
    expect(currentShowClip(edited, 14000)).toEqual({ patternName: 'CompassRose', index: 0, count: 1 })
  })
})
