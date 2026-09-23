import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  getPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '@/engine/personalContentProvider'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { showInitialState, useShowStore } from './showStore'

// Slice 11a: built-in lessons open as session-only v2 drafts ("memory mode").
// The lesson has no Transition, so the draft edit is a rename.
const LESSON_ID = 'stock-show-103-clip-transform'

let listShowDocumentsV2: ReturnType<typeof vi.fn<() => Promise<ShowRecordV2[]>>>
let replaceShowV2: ReturnType<typeof vi.fn<(id: string, record: ShowRecordV2) => Promise<void>>>

beforeEach(async () => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  listShowDocumentsV2 = vi.fn(async (): Promise<ShowRecordV2[]> => [])
  replaceShowV2 = vi.fn(async (_id: string, _record: ShowRecordV2): Promise<void> => {})
  setPersonalContentProvider({
    ...getPersonalContentProvider(),
    id: 'lesson-draft-test',
    listShowDocumentsV2,
    replaceShowV2,
  })
  // Each test starts with no pilot; a later open re-seeds its session draft.
  await useShowStore.getState().loadShows()
  listShowDocumentsV2.mockClear()
  replaceShowV2.mockClear()
})

afterEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  vi.restoreAllMocks()
})

function lesson() {
  const record = stockShowV2ById(LESSON_ID)
  if (!record) throw new Error(`Missing lesson ${LESSON_ID}`)
  return record
}

function renamed(name: string) {
  const pilot = useShowStore.getState().showV2Pilots[LESSON_ID]
  if (!pilot) throw new Error('No lesson pilot open')
  return { ...pilot, name }
}

it('(a) opens the lesson from its native copy with an empty history and no provider call', async () => {
  const result = await useShowStore.getState().openShowV2Pilot(LESSON_ID)
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') throw new Error('Lesson open refused')
  expect(result.record).toEqual(lesson())
  expect(useShowStore.getState().showV2Pilots[LESSON_ID]).toEqual(lesson())
  expect(useShowStore.getState().showV2Histories[LESSON_ID]).toEqual({ past: [], future: [] })
  expect(listShowDocumentsV2).not.toHaveBeenCalled()
  expect(replaceShowV2).not.toHaveBeenCalled()
})

it('(b) adopts an edit, Undo and Redo through history with no provider write', async () => {
  await useShowStore.getState().openShowV2Pilot(LESSON_ID)
  const draftName = `${lesson().name} (draft)`
  await useShowStore.getState().updateShowV2Pilot(LESSON_ID, renamed(draftName))
  expect(useShowStore.getState().showV2Pilots[LESSON_ID]?.name).toBe(draftName)
  expect(useShowStore.getState().showV2Histories[LESSON_ID]?.past).toHaveLength(1)
  expect(await useShowStore.getState().undoShowV2Pilot(LESSON_ID)).toBe(true)
  expect(useShowStore.getState().showV2Pilots[LESSON_ID]?.name).toBe(lesson().name)
  expect(await useShowStore.getState().redoShowV2Pilot(LESSON_ID)).toBe(true)
  expect(useShowStore.getState().showV2Pilots[LESSON_ID]?.name).toBe(draftName)
  expect(replaceShowV2).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2SaveFailure).toBeNull()
})

it('(c) opening again after an edit keeps the session draft', async () => {
  await useShowStore.getState().openShowV2Pilot(LESSON_ID)
  const draftName = `${lesson().name} (draft)`
  await useShowStore.getState().updateShowV2Pilot(LESSON_ID, renamed(draftName))
  const draft = useShowStore.getState().showV2Pilots[LESSON_ID]
  const result = await useShowStore.getState().openShowV2Pilot(LESSON_ID)
  expect(result).toEqual({ status: 'ready', record: draft })
  expect(listShowDocumentsV2).not.toHaveBeenCalled()
  expect(replaceShowV2).not.toHaveBeenCalled()
})

it('(d) reset returns the pilot to the lesson copy with an empty history and a bumped revision', async () => {
  await useShowStore.getState().openShowV2Pilot(LESSON_ID)
  await useShowStore.getState().updateShowV2Pilot(LESSON_ID, renamed(`${lesson().name} (draft)`))
  const revision = useShowStore.getState().showRevisions[LESSON_ID] ?? 0
  useShowStore.getState().resetShowV2LessonDraft(LESSON_ID)
  expect(useShowStore.getState().showV2Pilots[LESSON_ID]).toEqual(lesson())
  expect(useShowStore.getState().showV2Histories[LESSON_ID]).toEqual({ past: [], future: [] })
  expect(useShowStore.getState().showRevisions[LESSON_ID]).toBe(revision + 1)
})

it('(e) an edited lesson draft never gains a personal row and never renames as one', async () => {
  await useShowStore.getState().openShowV2Pilot(LESSON_ID)
  const draftName = `${lesson().name} (draft)`
  await useShowStore.getState().updateShowV2Pilot(LESSON_ID, renamed(draftName))
  expect(useShowStore.getState().showV2Rows.some(row => row.id === LESSON_ID)).toBe(false)
  // A lesson pilot is not a personal v2 row, so the rail rename leaves the
  // draft pilot alone and writes nothing through the provider.
  await useShowStore.getState().renameShow(LESSON_ID, `${draftName} renamed`)
  expect(useShowStore.getState().showV2Pilots[LESSON_ID]?.name).toBe(draftName)
  expect(replaceShowV2).not.toHaveBeenCalled()
})

it('(g) a workspace reload keeps the lesson pilot and history but retires an open stored pilot (#1067)', async () => {
  const stored = { ...structuredClone(lesson()), id: 'stored-v2-reload-pilot', name: 'Stored v2 Show' }
  listShowDocumentsV2.mockResolvedValue([stored])
  await useShowStore.getState().openShowV2Pilot(LESSON_ID)
  const draftName = `${lesson().name} (before reload)`
  await useShowStore.getState().updateShowV2Pilot(LESSON_ID, renamed(draftName))
  expect((await useShowStore.getState().openShowV2Pilot(stored.id)).status).toBe('ready')
  const before = useShowStore.getState()
  const draft = before.showV2Pilots[LESSON_ID]
  const history = before.showV2Histories[LESSON_ID]

  await useShowStore.getState().loadShows()

  const after = useShowStore.getState()
  expect(after.showV2Pilots[LESSON_ID]).toBe(draft)
  expect(after.showV2Histories[LESSON_ID]).toBe(history)
  expect(after.isShowV2LessonDraft(LESSON_ID)).toBe(true)
  expect(after.showV2Pilots[stored.id]).toBeUndefined()
  expect(after.showV2Histories[stored.id]).toBeUndefined()
  expect(after.showV2Rows.map(row => row.id)).toContain(stored.id)

  const nextName = `${lesson().name} (after reload)`
  await after.updateShowV2Pilot(LESSON_ID, renamed(nextName))
  expect(useShowStore.getState().showV2Pilots[LESSON_ID]?.name).toBe(nextName)
  expect(await useShowStore.getState().undoShowV2Pilot(LESSON_ID)).toBe(true)
  expect(useShowStore.getState().showV2Pilots[LESSON_ID]?.name).toBe(draftName)
  expect(replaceShowV2).not.toHaveBeenCalled()
})

it('(f) a pilot placed directly under a lesson id still saves through the provider', async () => {
  const directPilotId = 'stock-show-303-compile-simplify-deliver'
  const directPilot = stockShowV2ById(directPilotId)
  if (!directPilot) throw new Error(`Missing lesson ${directPilotId}`)
  useShowStore.setState({
    showV2Pilots: { [directPilotId]: structuredClone(directPilot) },
    showV2Histories: { [directPilotId]: { past: [], future: [] } },
  })
  await useShowStore.getState().updateShowV2Pilot(directPilotId, {
    ...structuredClone(directPilot),
    name: `${directPilot.name} (draft)`,
  })
  expect(replaceShowV2).toHaveBeenCalledTimes(1)
})
