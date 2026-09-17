import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { ShowEditorV2Route } from './ShowEditorV2Route'

/**
 * Clip timing completion on the editor route (#1056 slice 6 migrated this from
 * the retired pilot host): the timeline's split submits once, a rolled-back
 * save restores the authored record, and a completion that is no longer
 * current publishes nothing.
 */
vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: () => <div data-testid="prepared-stage" /> }))
beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useLibraryStore.setState(libraryInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
})
afterEach(() => resetPersonalContentProvider())

let index = 0

function setup() {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw Error('convert')
  const record = converted.record
  record.id = `timing-completion-${++index}`
  record.composition.clips = record.composition.clips.slice(0, 1)
  record.composition.transitions = []
  record.composition.clips[0].durationMs = 10_000
  record.composition.showEndMs = 30_000
  record.composition.layoutOccurrences[0].durationMs = 30_000
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  usePatternStore.setState({
    userPatterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }],
  })
  useShowStore.setState({
    showV2Pilots: { [record.id]: record },
    showV2Histories: { [record.id]: { past: [], future: [] } },
  })
  let release!: () => void
  let reject!: (error: Error) => void
  const pending = new Promise<void>((resolve, fail) => { release = resolve; reject = fail })
  const write = vi.fn(() => pending)
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'timing-completion', replaceShowV2: write })
  const view = render(<ShowEditorV2Route showId={record.id} />)
  return { record, write, pending, release, reject, view }
}

/** The timeline's own split: `S` halves the focused Clip (0-10000 ms). */
const clips = () => screen.getAllByRole('button', { name: /^Clip .*, 0\.00s to/ })
function split() {
  fireEvent.keyDown(clips()[0], { key: 's' })
}
const status = () => screen.getByTestId('show-timeline-read-only-status').textContent

it('submits one split per gesture, saves once and reports only on its own receipt', async () => {
  const { record, write, pending, release } = setup()
  split()
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  // The surface refuses a second gesture while the first is in flight.
  expect(clips()[0]).toHaveAttribute('aria-disabled', 'true')
  split()
  expect(write).toHaveBeenCalledTimes(1)

  await act(async () => { release(); await pending })
  await waitFor(() => expect(status()).toBe('Clip saved.'))
  const saved = useShowStore.getState().showV2Pilots[record.id]
  expect(saved.composition.clips.map((clip) => [clip.startMs, clip.durationMs])).toEqual([[0, 5_000], [5_000, 5_000]])
  expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
})

it('restores the authored record on save rollback, with no history entry', async () => {
  const { record, write, pending, reject } = setup()
  split()
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  await act(async () => { reject(Error('offline')); await pending.catch(() => {}) })

  await waitFor(() => expect(status()).toBe('Save failed: offline'))
  expect(useShowStore.getState().showV2Pilots[record.id].composition).toEqual(record.composition)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

it.each(['record', 'revision', 'Pattern', 'Map', 'Library', 'profile', 'provider', 'route', 'unmount'] as const)(
  'suppresses an obsolete saved status after %s replaces the context',
  async (partition) => {
    const { record, write, pending, release, view } = setup()
    split()
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    act(() => {
      switch (partition) {
        case 'record':
          useShowStore.setState({
            showV2Pilots: { [record.id]: { ...useShowStore.getState().showV2Pilots[record.id], name: 'External' } },
          })
          break
        case 'revision': useShowStore.setState({ showRevisions: { [record.id]: 2 } }); break
        case 'Pattern': usePatternStore.setState({ userPatterns: [...usePatternStore.getState().userPatterns] }); break
        case 'Map': useMapStore.setState({ userMaps: [] }); break
        case 'Library': useLibraryStore.setState({ userLibraries: [] }); break
        case 'profile': useControllerProfileStore.setState({ profiles: [] }); break
        case 'provider': setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'external' }); break
        case 'route': view.rerender(<ShowEditorV2Route showId="external" />); break
        case 'unmount': view.unmount(); break
      }
    })
    await act(async () => { release(); await pending })
    expect(screen.queryByText('Clip saved.')).not.toBeInTheDocument()
  },
)
