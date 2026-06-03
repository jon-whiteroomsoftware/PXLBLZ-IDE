import { describe, it, expect } from 'vitest'
import { describeControllerPanel } from './controllerPanelView'

const programs = [
  { id: 'abc', name: 'Aurora' },
  { id: 'def', name: 'Nebula' },
]

describe('describeControllerPanel', () => {
  it('resolves the active pattern name from the program list', () => {
    const view = describeControllerPanel({ activeProgramId: 'def', programs, fps: 42 })
    expect(view.patternName).toBe('Nebula')
  })

  it('falls back to the raw id when no program matches', () => {
    const view = describeControllerPanel({ activeProgramId: 'ghost', programs, fps: null })
    expect(view.patternName).toBe('ghost')
  })

  it('shows an em-dash placeholder when no pattern is active', () => {
    const view = describeControllerPanel({ activeProgramId: undefined, programs, fps: null })
    expect(view.patternName).toBe('—')
  })

  it('formats fps to one decimal', () => {
    expect(describeControllerPanel({ programs, fps: 59.94 }).fpsLabel).toBe('59.9')
  })

  it('shows an em-dash placeholder when fps has not been reported', () => {
    expect(describeControllerPanel({ programs, fps: null }).fpsLabel).toBe('—')
  })
})
