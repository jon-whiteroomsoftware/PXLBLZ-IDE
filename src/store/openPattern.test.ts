import { beforeEach, describe, expect, it } from 'vitest'
import { editorInitialState, useEditorStore } from './editorStore'
import { libraryInitialState, useLibraryStore } from './libraryStore'
import { mapInitialState, useMapStore } from './mapStore'
import { mixinInitialState, useMixinStore } from './mixinStore'
import { openPatternRecord } from './openPattern'
import { patternInitialState, type PatternRecord, usePatternStore } from './patternStore'

const PATTERN: PatternRecord = {
  id: 'pattern-a',
  name: 'Pattern A',
  src: 'export function render(index) { hsv(index, 1, 1) }',
  controls: {},
  updatedAt: 1,
}

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useMixinStore.setState(mixinInitialState)
  useLibraryStore.setState(libraryInitialState)
})

describe('openPatternRecord preview publication (#818)', () => {
  it('publishes a valid saved Pattern to the preview', () => {
    usePatternStore.setState({ userPatterns: [PATTERN] })

    openPatternRecord(PATTERN)

    expect(useEditorStore.getState()).toMatchObject({
      source: PATTERN.src,
      previewSource: PATTERN.src,
      previewUnavailableReason: null,
      compileStatus: 'good',
    })
  })

  it('restores exact broken source without showing the previous Pattern pixels', () => {
    const broken = { ...PATTERN, src: 'export function render(index) {' }
    usePatternStore.setState({ userPatterns: [broken] })
    useEditorStore.setState({ previewSource: 'previous Pattern source' })

    openPatternRecord(broken)

    expect(useEditorStore.getState()).toMatchObject({
      source: broken.src,
      previewSource: '',
      previewUnavailableReason: 'broken-source',
      compileStatus: 'broken',
    })
  })

  it('restores exact empty source with an explicit unavailable reason', () => {
    const empty = { ...PATTERN, src: '' }
    usePatternStore.setState({ userPatterns: [empty] })
    useEditorStore.setState({ previewSource: 'previous Pattern source' })

    openPatternRecord(empty)

    expect(useEditorStore.getState()).toMatchObject({
      source: '',
      previewSource: '',
      previewUnavailableReason: 'empty-source',
      compileStatus: 'good',
    })
  })
})
