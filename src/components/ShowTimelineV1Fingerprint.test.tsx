import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import { resetControllerProvider } from '@/engine/controllerProviderRegistry'
import { resetPersonalContentProvider } from '@/engine/personalContentProvider'
import { projectShowTimelineViewModel } from '@/engine/showTimelineViewModel'
import { showV2ViewModelCorpus } from '@/test/showV2ViewModelCorpus'

/**
 * v1 projection and rendered-DOM byte identity across the pinned corpus.
 *
 * The baseline was captured before the view-model refactor and is the oracle
 * that a v1 record still projects and renders exactly as it did. A deliberate
 * v1 change regenerates it with `UPDATE_SHOW_TIMELINE_FINGERPRINTS=1` and must
 * explain itself; the refactor itself may not move a single byte.
 */
const BASELINE_PATH = resolve('src/components/__fixtures__/show-timeline-v1-fingerprints.json')

interface RecordFingerprint {
  viewModel: string
  dom: string
}

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useLibraryStore.setState(libraryInitialState)
  useMapStore.setState(mapInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  usePreviewStore.setState(previewInitialState)
  useShowTransportStore.setState(showTransportInitialState)
  useShowPreviewOverrideStore.setState(showPreviewOverrideInitialState)
  useShowEditorSessionStore.setState(showEditorSessionInitialState)
  useControllerStore.setState(controllerInitialState)
  useWorkspaceStore.setState(workspaceInitialState)
  resetControllerProvider()
})

afterEach(() => {
  cleanup()
  resetControllerProvider()
})

describe('v1 Show timeline projection and rendering byte identity', () => {
  const corpus = showV2ViewModelCorpus()
  const updating = process.env.UPDATE_SHOW_TIMELINE_FINGERPRINTS === '1'
  const baseline = updating
    ? {}
    : JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, RecordFingerprint>
  const measured: Record<string, RecordFingerprint> = {}

  for (const entry of corpus) {
    it(`renders ${entry.corpusId} exactly as the baseline`, async () => {
      useShowStore.setState({
        shows: [entry.show],
        activeShowId: entry.show.id,
        showsLoaded: true,
      })
      usePatternStore.setState({ userPatterns: entry.patterns, patternsLoaded: true })
      render(<ShowEditor showId={entry.show.id} />)
      await screen.findByTestId('show-timeline-grid')
      await act(async () => { await Promise.resolve() })
      measured[entry.corpusId] = {
        viewModel: sha256(JSON.stringify(projectShowTimelineViewModel(entry.show, entry.editorComposition))),
        dom: domFingerprint(),
      }
      if (!updating) expect(measured[entry.corpusId]).toEqual(baseline[entry.corpusId])
    })
  }

  it('covers the whole pinned corpus and no other record', () => {
    expect(Object.keys(measured)).toHaveLength(47)
    if (updating) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(measured, null, 2)}\n`)
      return
    }
    expect(measured).toEqual(baseline)
  })
})

/**
 * Hash the timeline surfaces this slice touches: the grid, the ruler and the
 * toolbar. Their markup carries every Zone row, Layer lane, Clip, junction,
 * Layout interval and Marker the view model now supplies.
 */
function domFingerprint(): string {
  return sha256(['show-timeline-toolbar', 'show-timeline-ruler', 'show-timeline-grid']
    .map((testId) => document.querySelector(`[data-testid="${testId}"]`)?.outerHTML ?? '')
    .join(' '))
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
