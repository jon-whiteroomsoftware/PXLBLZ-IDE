import { compileShowForPreview } from './showPreviewArtifact'
import { addShowZone, createDefaultShow, extendShowCell, updateShowCellAdaptations } from './showModel'

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
})
