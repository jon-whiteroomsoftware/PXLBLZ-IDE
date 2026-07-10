import { compileShowForPreview } from './showPreviewArtifact'
import { createDefaultShow, extendShowCell, updateShowCellAdaptations } from './showModel'

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
})
