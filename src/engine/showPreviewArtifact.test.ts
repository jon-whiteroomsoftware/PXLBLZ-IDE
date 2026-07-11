import { compileShowForPreview } from './showPreviewArtifact'
import {
  addShowZone,
  createDefaultShow,
  extendShowCell,
  splitShowAtTime,
  updateShowCellAdaptations,
  updateShowCellRestartOnEntry,
  updateShowTransition,
} from './showModel'

describe('compileShowForPreview temporal adaptations (#379)', () => {
  it('loads the exact stepped-clock artifact used by generated Show output', () => {
    const base = extendShowCell(createDefaultShow('show-1', 'Stepped hold'), 'cell-1', 2)
    const show = updateShowCellAdaptations(base, 'cell-1', {
      steppedClock: { stepMs: 125 },
    })

    const compiled = compileShowForPreview(show, [], undefined, {})

    expect(compiled.error).toBeNull()
    expect(compiled.artifact?.summary).toMatchObject({
      temporalPolicy: 'stepped-clock',
      renderPolicy: 'single-continuous-hold',
      clips: [expect.objectContaining({ stepMs: 125 })],
    })
    expect(compiled.artifact?.code).toContain('var __pxlblz_show_c0_step_ms = 125')
  })

  it('loads routed multi-range zone offsets into the exact Stage artifact', () => {
    const base = addShowZone(createDefaultShow('show-1', 'Rounds'), {
      name: 'right',
      nominalPixelCount: 4,
    })
    const rightCell = base.cells.find((cell) => cell.zoneId === 'zone-2' && cell.sceneId === 'scene-1')!
    const show = updateShowCellAdaptations(base, rightCell.id, { timeOffsetMs: 500 })
    const compiled = compileShowForPreview(show, [], [
      { id: 'left', name: 'main', ranges: [{ start: 0, end: 1 }, { start: 4, end: 5 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }, { start: 6, end: 7 }] },
    ], {})

    expect(compiled.error).toBeNull()
    expect(compiled.artifact?.summary).toMatchObject({
      renderPolicy: 'route-one-renderer-per-pixel',
      timeOffsetPolicy: 'per-clip',
      clips: [
        expect.objectContaining({ timeOffsetMs: 0 }),
        expect.objectContaining({ timeOffsetMs: 500 }),
      ],
    })
    expect(compiled.artifact?.code).toContain('var __pxlblz_show_c1_elapsed_ms = 500')
  })

  it('validates and compiles the selected 2D Stage domain for portal transitions', () => {
    const base = { ...createDefaultShow('show-1', 'Portal'), stageMapId: 'plane' }
    const show = updateShowTransition(base, 'scene-1', 'portal', 2000, 0.1, {
      centerX: 0.5,
      centerY: 0.5,
      invert: false,
      featherPolicy: 'dither',
    })

    expect(compileShowForPreview(show, [], undefined, {}, { stageDimension: 3 }).error)
      .toMatch(/requires a 2D Stage Map/i)

    const compiled = compileShowForPreview(show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact?.metadata.renderFns).toEqual({
      hasBeforeRender: true,
      hasRender: false,
      hasRender2D: true,
      hasRender3D: false,
    })
  })

  it('uses shared preview state for Continue and isolated state for Restart (#415)', () => {
    const continued = splitShowAtTime(createDefaultShow('show-1', 'Split preview'), 10_000)
    const destination = continued.cells.find((cell) => cell.sceneId === 'scene-3')!

    const continueArtifact = compileShowForPreview(continued, [], undefined, {}).artifact
    expect(continueArtifact?.summary.clipCount).toBe(2)
    expect(continueArtifact?.code.match(/var __pxlblz_show_c0_elapsed_ms/g)).toHaveLength(1)

    const restarted = updateShowCellRestartOnEntry(continued, destination.id, true)
    const restartArtifact = compileShowForPreview(restarted, [], undefined, {}).artifact
    expect(restartArtifact?.summary.clipCount).toBe(3)
    expect(restartArtifact?.code).toContain('var __pxlblz_show_c2_elapsed_ms = 0')
  })
})
