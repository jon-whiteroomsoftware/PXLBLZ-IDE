import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import {
  applyShowReferencePattern,
  currentShowReferenceExample,
  type ShowReferenceGuide,
} from './showReferenceShow'

describe('Show reference Pattern projection (#506)', () => {
  it('replaces only the configured flat cells without mutating the authored Show', () => {
    const authored = createDefaultShow('show-1', 'Reference Show', 100)
    authored.cells[0].controlTargets = { speed: 0.5 }
    const original = structuredClone(authored)

    const projected = applyShowReferencePattern(authored, {
      pattern: { kind: 'stock', id: 'CompassRose' },
      patternName: 'Compass Rose',
      cellIds: [authored.cells[0].id],
      instanceIds: [],
    })

    expect(projected).not.toBe(authored)
    expect(projected.cells[0]).toMatchObject({
      pattern: { kind: 'stock', id: 'CompassRose' },
      patternName: 'Compass Rose',
    })
    expect(projected.cells[0].controlTargets).toBeUndefined()
    expect(projected.cells[1]).toEqual(authored.cells[1])
    expect(authored).toEqual(original)
  })

  it('keeps a boundary example current through the following Scene hold', () => {
    const show = createDefaultShow('show-1', 'Reference Show', 100)
    const transitionId = show.transitions![0].id
    const guide: ShowReferenceGuide = {
      summary: 'Compare one family.',
      examples: [
        { id: 'reference', label: 'Reference', detail: 'Unmodified.', anchor: { kind: 'scene', sceneId: 'scene-1' } },
        { id: 'wipe', label: 'Wipe east', detail: 'Reference -> Selected', anchor: { kind: 'boundary', transitionId } },
      ],
    }

    expect(currentShowReferenceExample(show, guide, 1_000)?.id).toBe('reference')
    expect(currentShowReferenceExample(show, guide, 31_000)?.id).toBe('wipe')
    expect(currentShowReferenceExample(show, guide, 50_000)?.id).toBe('wipe')
  })

  it('keeps a Scene example named through its outgoing animated boundary', () => {
    const show = createDefaultShow('show-1', 'Effect Reference', 100)
    const guide: ShowReferenceGuide = {
      summary: 'Compare rendered states.',
      examples: [{
        id: 'reference',
        label: 'Reference',
        detail: 'Unmodified.',
        anchor: { kind: 'scene', sceneId: 'scene-1' },
      }],
    }

    expect(currentShowReferenceExample(show, guide, 31_000)?.id).toBe('reference')
  })
})
