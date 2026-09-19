import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { validateShowRecordV2 } from '@/engine/showCompositionV2'
import { editShowZoneV2 } from '@/engine/showZonesV2'
import { editShowLayerV2 } from '@/engine/showLayersV2'
import { showBoundaryClipIdentity } from '@/engine/showClipIdentity'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { resizeBoundaryShow } from '@/agent-harness/baseline/fixtures'
import { duplicateShowClipAfter } from '@/engine/showTimelineClipAuthoring'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import { useShowEditorViewStore } from '@/store/showEditorViewStore'
import { resetControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { ShowRecord } from '@/engine/personalContentRecords'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'

/**
 * #1065: v2 tracer command routing through the existing Show editor.
 *
 * The tracer connects exactly one v2 write - an ordinary same-Layer Clip move,
 * its single history entry and its single queued save. These tests own the
 * safety half of that boundary: a gesture the tracer did not qualify must reach
 * no owner at all, a settlement whose captured preimage went stale must be
 * refused rather than adopted, one gesture must submit once, and an unconnected
 * command must resolve as an internal no-change result without disabling or
 * hiding its control. The qualified move appears here only as the positive
 * control that keeps every refusal assertion from passing vacuously; its
 * behavioral qualification lives in the reviewed oracle.
 */

/**
 * Every v2 prepared-edit command the editor can submit passes through this one
 * module, so wrapping its `admit*` doors records exactly which owner a gesture
 * reached and with which intent. The real implementations still run: this is an
 * observation seam, not a stub, so a recorded call is a real submission.
 */
const admission = vi.hoisted(() => ({ calls: [] as Array<{ door: string; request: Record<string, unknown> }> }))
vi.mock('@/store/showV2PreparedEditAdmission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/showV2PreparedEditAdmission')>()
  const observed: Record<string, unknown> = { ...actual }
  for (const [door, value] of Object.entries(actual)) {
    if (typeof value !== 'function' || !door.startsWith('admit')) continue
    observed[door] = (request: Record<string, unknown>) => {
      admission.calls.push({ door, request })
      return (value as (input: unknown) => unknown)(request)
    }
  }
  return observed
})

/**
 * The legacy command owners the unconnected v1 commands reach: Split, Clone,
 * Delete, manual resize and the two legacy drag owners. Provider spies cannot
 * stand in for these - with no legacy row open every one of them returns its
 * input unchanged, so a mistaken legacy dispatch persists nothing and would be
 * invisible in the save count. Each wrapper records the call and then runs the
 * real implementation; behaviour is unchanged.
 */
const legacy = vi.hoisted(() => {
  const calls: string[] = []
  const observe = <T extends object>(actual: T, owners: readonly string[]): T => {
    const observed = { ...actual } as Record<string, unknown>
    for (const owner of owners) {
      const real = (actual as Record<string, unknown>)[owner]
      if (typeof real !== 'function') throw new Error(`No legacy owner named ${owner} to observe.`)
      observed[owner] = (...args: unknown[]) => {
        calls.push(owner)
        return (real as (...input: unknown[]) => unknown)(...args)
      }
    }
    return observed as T
  }
  return { calls, observe }
})
vi.mock('@/engine/showTimelineClipAuthoring', async (importOriginal) => legacy.observe(
  await importOriginal<typeof import('@/engine/showTimelineClipAuthoring')>(),
  ['splitShowClipAtGlobalTime', 'duplicateShowClipAfter', 'duplicateShowClipAtGlobalTime'],
))
vi.mock('@/engine/showLayerTransitionAuthoring', async (importOriginal) => legacy.observe(
  await importOriginal<typeof import('@/engine/showLayerTransitionAuthoring')>(),
  ['moveShowConnectedClipAtGlobalTime', 'moveShowConnectedClipInShowAtGlobalTime'],
))
vi.mock('@/engine/showClipDeletion', async (importOriginal) => legacy.observe(
  await importOriginal<typeof import('@/engine/showClipDeletion')>(),
  ['deleteShowClipInShow'],
))
vi.mock('@/engine/showGroupModel', async (importOriginal) => legacy.observe(
  await importOriginal<typeof import('@/engine/showGroupModel')>(),
  ['deleteShowGroupOccurrence'],
))
vi.mock('@/engine/showManualClipResize', async (importOriginal) => legacy.observe(
  await importOriginal<typeof import('@/engine/showManualClipResize')>(),
  ['resizeShowClipManually', 'previewShowClipResize'],
))

/**
 * The legacy owners the store itself exposes as editor commands. They are
 * wrapped on the live store rather than through a module mock, because the
 * editor reads them out of store state.
 */
const STORE_OWNERS = ['cloneClip', 'removeBoundaryTransition', 'removeZone'] as const
const realStoreOwners = Object.fromEntries(
  STORE_OWNERS.map((owner) => [owner, useShowStore.getState()[owner]]),
) as { [K in typeof STORE_OWNERS[number]]: ReturnType<typeof useShowStore.getState>[K] }
function observeStoreOwners(): void {
  useShowStore.setState(Object.fromEntries(STORE_OWNERS.map((owner) => [
    owner,
    (...args: unknown[]) => {
      legacy.calls.push(owner)
      return (realStoreOwners[owner] as (...input: unknown[]) => unknown)(...args)
    },
  ])) as Partial<ReturnType<typeof useShowStore.getState>>)
}

/** The clip-temporal submissions one gesture made, in order. */
function temporalSubmissions() {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotClipTemporal')
    .map((call) => ({ intent: call.request.intent, baseRevision: call.request.baseRevision }))
}


// ── Fixture ──────────────────────────────────────────────────────────────────
// One stored v2 row converted from the shared baseline resize fixture, with a
// second authored Layer so a cross-Layer drag has a real target. Authored times
// are round, so a settled move reads exactly:
//   main    : resize-a 0-4000, resize-b 8000-10000 (CometLoom)
//   overlay : overlay-a 12000-14000                (TestPattern1D)
// Show End is 20000, which the drag surface below maps onto 200 px.
function v2TracerRecord(id: string): ShowRecordV2 {
  const source: ShowRecord = resizeBoundaryShow(id)
  const zone = source.composition!.scenes[0].zones[0]
  source.composition!.patternInstances.push({
    id: 'overlay-instance',
    pattern: { kind: 'stock', id: 'TestPattern1D' },
    patternName: 'TestPattern1D',
    time: { timeScale: 1, timeOffsetMs: 0 },
  })
  zone.overlays = [{
    id: 'overlay-1',
    name: 'Atmosphere',
    placements: [{
      id: 'overlay-a',
      instanceId: 'overlay-instance',
      startMs: 12_000,
      durationMs: 2_000,
      opacity: 1,
      view: { mirror: false, phase: 0, brightness: 1 },
    }],
  }]
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

interface EditorState {
  record: ShowRecordV2
  history: { past: ShowRecordV2[]; future: ShowRecordV2[] }
  revision: number
  v2Writes: number
  legacyWrites: number
  legacyShows: readonly ShowRecord[]
  legacyHistories: Record<string, unknown>
}

interface OpenV2Editor {
  readonly showId: string
  state(): EditorState
}

/**
 * Opens one v2 pilot on a provider that records both persistence doors. The
 * legacy door is spied separately from the v2 door so an unconnected write that
 * silently reaches a legacy owner is a failure, not an invisible no-op.
 */
function openV2Editor(id: string): OpenV2Editor {
  return openV2EditorForRecord(v2TracerRecord(id))
}

/** The same pilot harness, opened on an already-authored v2 record. */
function openV2EditorForRecord(record: ShowRecordV2): OpenV2Editor {
  const v2Writes = vi.fn(async (_id: string, _next: ShowRecordV2) => {})
  const legacyWrites = vi.fn(async () => {})
  setPersonalContentProvider({
    id: 'tracer-guard-provider',
    listPatterns: async () => [],
    listMaps: async () => [],
    listMixins: async () => [],
    listShows: async () => [],
    listControllerProfiles: async () => [],
    createShow: legacyWrites,
    updateShow: legacyWrites,
    deleteShow: legacyWrites,
    replaceShowV2: v2Writes,
    getLastActive: async () => undefined,
    setLastActive: async () => {},
  } as unknown as PersonalContentProvider)
  useShowStore.setState({
    shows: [],
    showsLoaded: true,
    activeShowId: null,
    showV2Pilots: { [record.id]: record },
    showV2Histories: { [record.id]: { past: [], future: [] } },
    showRevisions: { [record.id]: 0 },
  })
  return {
    showId: record.id,
    state: () => {
      const store = useShowStore.getState()
      return {
        record: store.showV2Pilots[record.id],
        history: store.showV2Histories[record.id],
        revision: store.showRevisions[record.id] ?? 0,
        v2Writes: v2Writes.mock.calls.length,
        legacyWrites: legacyWrites.mock.calls.length,
        legacyShows: store.shows,
        legacyHistories: store.showHistories,
      }
    },
  }
}

/**
 * Nothing at all happened to the record, its history, its revision, either
 * persistence door or the legacy backing. Record identity is asserted, not
 * deep equality: an adopted candidate that happens to equal the preimage is
 * still an adoption.
 */
function expectNoWrite(before: EditorState, after: EditorState): void {
  expect(admission.calls.map((call) => call.door)).toEqual([])
  // A legacy owner invoked with no legacy row open returns its input unchanged,
  // so this is the only assertion that can see it.
  expect(legacy.calls).toEqual([])
  expect(after.record).toBe(before.record)
  expect(after.history).toEqual({ past: [], future: [] })
  expect(after.revision).toBe(before.revision)
  expect(after.v2Writes).toBe(0)
  expect(after.legacyWrites).toBe(0)
  expect(after.legacyShows).toEqual([])
  expect(after.legacyHistories).toEqual({})
}

// ── Gesture surface ──────────────────────────────────────────────────────────
// The v1 native Clip drag the tracer preserves. 200 px spans the 20 s Show, so
// one pixel is 100 ms and a drop at x=40 asks for 4000 ms - the one placement
// that leaves resize-a inside its own Layer without overlapping resize-b.
const LANE_WIDTH_PX = 200
const MS_PER_PX = 100
const DROP_X = 40
const SETTLED_START_MS = DROP_X * MS_PER_PX

interface DragSurface {
  clip: HTMLElement
  lane(kind: 'main' | 'overlay'): HTMLElement
  dataTransfer: { dropEffect: string }
  fire(node: HTMLElement, type: string, clientX: number, altKey?: boolean): void
}

/** The rendered Clip button for one authored Clip, whichever Layer holds it. */
function clipButton(clipId: string): HTMLElement {
  const button = document.querySelector<HTMLElement>(`[data-show-selection-key="clip:${clipId}"]`)
  if (!button) throw new Error(`No rendered Clip button for ${clipId}.`)
  return button
}

function dragSurface(clipId: string): DragSurface {
  const rect = (width: number): DOMRect => ({
    left: 0, right: width, top: 0, bottom: 40, width, height: 40, x: 0, y: 0, toJSON() {},
  })
  const clip = clipButton(clipId)
  vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue(rect(40))
  const lanes = new Map<string, HTMLElement>()
  for (const node of document.querySelectorAll<HTMLElement>('[data-show-layer-kind]')) {
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(rect(LANE_WIDTH_PX))
    lanes.set(node.getAttribute('data-show-layer-kind')!, node)
  }
  Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', {
    configurable: true,
    value: LANE_WIDTH_PX,
  })
  const dataTransfer = { setData() {}, effectAllowed: 'none', dropEffect: 'none' }
  return {
    clip,
    lane(kind) {
      const found = lanes.get(kind)
      if (!found) throw new Error(`No ${kind} Layer lane is rendered.`)
      return found
    },
    dataTransfer,
    fire(node, type, clientX, altKey = false) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        altKey: { value: altKey },
        dataTransfer: { value: dataTransfer },
      })
      fireEvent(node, event)
    },
  }
}

function authoredClip(record: ShowRecordV2, clipId: string) {
  const clip = record.composition.clips.find((candidate) => candidate.id === clipId)
  if (!clip) throw new Error(`No authored Clip ${clipId}.`)
  return clip
}

function timelineCommand(name: 'Split at playhead' | 'Clone selection'): HTMLElement {
  return within(screen.getByRole('group', { name: 'Timeline commands' })).getByRole('button', { name })
}

beforeEach(() => {
  admission.calls.length = 0
  legacy.calls.length = 0
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
  observeStoreOwners()
  resetControllerProvider()
})

afterEach(() => {
  resetControllerProvider()
  resetPersonalContentProvider()
})

describe('legacy owner observation (#1065)', () => {
  it('records a legacy owner that silently no-ops with no legacy row open', async () => {
    // The instrument's own oracle. Both owners below run their real
    // implementation, change nothing and persist nothing - which is exactly why
    // a save count or a provider spy cannot see them, and why the unconnected
    // command tests assert on this seam instead.
    const source = resizeBoundaryShow('tracer-owner-seam')
    const composition = source.composition!
    const unchanged = duplicateShowClipAfter(source, composition, {
      owner: { kind: 'main', sceneId: 's1', zoneId: 'z1', placementId: 'not-a-placement' },
      newPlacementId: 'copy',
      newInstanceId: 'copy-instance',
    })
    expect(unchanged).toBe(composition)
    await expect(useShowStore.getState().cloneClip('missing-show', 'missing-clip')).resolves.toBeNull()

    expect(legacy.calls).toEqual(['duplicateShowClipAfter', 'cloneClip'])
  })
})

describe('v2 tracer settlement routing (#1065)', () => {
  it('settles the one qualified same-Layer move through the v2 door only', async () => {
    const editor = openV2Editor('tracer-qualified-move')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('main'), 'dragover', DROP_X)
    surface.fire(surface.lane('main'), 'drop', DROP_X)
    await act(async () => {})

    const after = editor.state()
    // One command, named as a temporal intent against the authored Clip, on the
    // revision the gesture started from.
    expect(temporalSubmissions()).toEqual([{
      intent: { kind: 'move', clipId: 'resize-a', startMs: SETTLED_START_MS },
      baseRevision: 0,
    }])
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(SETTLED_START_MS)
    // Authored identity survives the move: the tracer writes a temporal intent
    // against the authored Clip, never a replacement or a generated target.
    expect(after.record.composition.clips.map((clip) => clip.id))
      .toEqual(before.record.composition.clips.map((clip) => clip.id))
    expect(after.v2Writes).toBe(1)
    expect(after.history.past).toEqual([before.record])
    expect(after.history.future).toEqual([])
    // The legacy door stays shut, and no legacy backing appears under this id.
    expect(after.legacyWrites).toBe(0)
    expect(after.legacyShows).toEqual([])
    expect(after.legacyHistories).toEqual({})
  })

  it('refuses an Alt duplicate drag instead of settling it as a move', async () => {
    const editor = openV2Editor('tracer-alt-duplicate')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0, true)
    surface.fire(surface.lane('main'), 'dragover', DROP_X, true)
    surface.fire(surface.lane('main'), 'drop', DROP_X, true)
    await act(async () => {})

    const after = editor.state()
    // The refusal is visible in the drag itself, before any owner is reached.
    expect(surface.dataTransfer.dropEffect).toBe('none')
    expectNoWrite(before, after)
    // Neither half of the duplicate leaks: the source Clip has not moved and no
    // copy was authored.
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(0)
    expect(after.record.composition.clips).toHaveLength(before.record.composition.clips.length)
  })

  it('settles a cross-Layer drag of a free Clip as a placement replacement', async () => {
    const editor = openV2Editor('tracer-cross-layer')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const overlayLayerId = before.record.composition.layers.find((layer) => layer.id !== authoredClip(before.record, 'resize-a').layerId)!.id
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('overlay'), 'dragover', DROP_X)
    surface.fire(surface.lane('overlay'), 'drop', DROP_X)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: {
        kind: 'replace-placement', clipId: 'resize-a', zoneId: 'z1', layerId: overlayLayerId, startMs: SETTLED_START_MS,
      },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'resize-a').layerId).toBe(overlayLayerId)
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(SETTLED_START_MS)
    expect(after.v2Writes).toBe(1)
    expect(after.history.past).toEqual([before.record])
    expect(after.history.future).toEqual([])
    expect(after.legacyWrites).toBe(0)
    expect(after.legacyShows).toEqual([])
    expect(legacy.calls).toEqual([])
  })

  it('submits one settlement per gesture when the drop repeats', async () => {
    const editor = openV2Editor('tracer-duplicate-settlement')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('main'), 'dragover', DROP_X)
    // Both drops land before the first admission has settled, which is the
    // window a duplicate pointer/native submission would use.
    surface.fire(surface.lane('main'), 'drop', DROP_X)
    surface.fire(surface.lane('main'), 'drop', DROP_X)
    surface.fire(surface.clip, 'dragend', DROP_X)
    await act(async () => {})

    const after = editor.state()
    // The guard is proved at the command boundary, not only at the save: a
    // second submission refused as stale would still leave one write behind.
    expect(temporalSubmissions()).toEqual([{
      intent: { kind: 'move', clipId: 'resize-a', startMs: SETTLED_START_MS },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(SETTLED_START_MS)
    expect(after.v2Writes).toBe(1)
    expect(after.revision).toBe(before.revision + 1)
    expect(after.history.past).toEqual([before.record])
    expect(after.legacyWrites).toBe(0)
  })

  it('settles a genuinely second gesture on the revision the first produced', async () => {
    // The discriminating counterpart to the settlement guard and the stale
    // fence above: this surface does submit twice when two gestures really
    // happen, and the second carries the revision the first left behind. Both
    // "exactly one submission" assertions therefore rest on the guard, not on
    // an inert drag surface.
    const editor = openV2Editor('tracer-second-gesture')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const first = editor.state()

    const forward = dragSurface('resize-a')
    forward.fire(forward.clip, 'dragstart', 0)
    forward.fire(forward.lane('main'), 'dragover', DROP_X)
    forward.fire(forward.lane('main'), 'drop', DROP_X)
    await act(async () => {})
    const second = editor.state()

    const back = dragSurface('resize-a')
    back.fire(back.clip, 'dragstart', 0)
    back.fire(back.lane('main'), 'dragover', 0)
    back.fire(back.lane('main'), 'drop', 0)
    await act(async () => {})

    const after = editor.state()
    expect(temporalSubmissions()).toEqual([
      { intent: { kind: 'move', clipId: 'resize-a', startMs: SETTLED_START_MS }, baseRevision: 0 },
      { intent: { kind: 'move', clipId: 'resize-a', startMs: 0 }, baseRevision: 1 },
    ])
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(0)
    expect(after.v2Writes).toBe(2)
    expect(after.revision).toBe(2)
    expect(after.history.past).toEqual([first.record, second.record])
    expect(after.legacyWrites).toBe(0)
  })

  it.each([
    {
      fence: 'the captured record',
      // Another writer adopts a new record while the gesture is in flight.
      disturb: (showId: string) => {
        const current = useShowStore.getState().showV2Pilots[showId]
        const external = { ...current, name: 'Adopted elsewhere' }
        useShowStore.setState({ showV2Pilots: { [showId]: external } })
        return external
      },
    },
    {
      fence: 'the captured revision',
      // The same record, one revision later: the gesture's base is stale even
      // though the preimage it captured still looks current.
      disturb: (showId: string) => {
        const current = useShowStore.getState().showV2Pilots[showId]
        useShowStore.setState({ showRevisions: { [showId]: 1 } })
        return current
      },
    },
  ])('refuses a settlement that outlived $fence', async ({ disturb }) => {
    const editor = openV2Editor('tracer-stale-settlement')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const surface = dragSurface('resize-a')

    // The capture the tracer fences on is taken here, at gesture start.
    surface.fire(surface.clip, 'dragstart', 0)
    let expected!: ShowRecordV2
    act(() => { expected = disturb(editor.showId) })
    const before = editor.state()
    surface.fire(surface.lane('main'), 'dragover', DROP_X)
    surface.fire(surface.lane('main'), 'drop', DROP_X)
    await act(async () => {})

    const after = editor.state()
    // The gesture does submit, carrying the base it captured at gesture start;
    // re-reading either the record or the revision at settlement would have
    // adopted the stale preimage instead of refusing it.
    expect(temporalSubmissions()).toEqual([{
      intent: { kind: 'move', clipId: 'resize-a', startMs: SETTLED_START_MS },
      baseRevision: 0,
    }])
    // The stale preimage is never adopted over the current record.
    expect(after.record).toBe(expected)
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(0)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.revision).toBe(before.revision)
    expect(after.v2Writes).toBe(0)
    expect(after.legacyWrites).toBe(0)
  })
})

describe('v2 tracer history routing (#1065)', () => {
  it.each(['the toolbar button', 'the keyboard shortcut'] as const)(
    'dispatches Undo from %s against the v2 backing',
    async (surface) => {
      const editor = openV2Editor(`tracer-undo-${surface.includes('keyboard') ? 'key' : 'toolbar'}`)
      render(<ShowEditor showId={editor.showId} recordVersion={2} />)
      const preimage = editor.state().record
      const drag = dragSurface('resize-a')
      drag.fire(drag.clip, 'dragstart', 0)
      drag.fire(drag.lane('main'), 'dragover', DROP_X)
      drag.fire(drag.lane('main'), 'drop', DROP_X)
      await act(async () => {})
      expect(authoredClip(editor.state().record, 'resize-a').startMs).toBe(SETTLED_START_MS)

      const undo = screen.getByRole('button', { name: 'Undo Show edit' })
      expect(undo).toBeEnabled()
      if (surface === 'the toolbar button') fireEvent.click(undo)
      else fireEvent.keyDown(document, { key: 'z', metaKey: true })
      await act(async () => {})

      // A v1 dispatch would silently do nothing here; the restored preimage is
      // what distinguishes the two. Undo restamps `updatedAt` because the
      // restored record is itself a save; the authored content is exact.
      const after = editor.state()
      expect(after.record.composition).toEqual(preimage.composition)
      expect(after.record).toEqual({ ...preimage, updatedAt: expect.any(Number) })
      expect(after.history.past).toEqual([])
      expect(after.history.future).toHaveLength(1)
      expect(after.legacyHistories).toEqual({})
      expect(after.legacyWrites).toBe(0)
    },
  )
})

describe('v2 tracer unconnected commands (#1065)', () => {
  /** Selects resize-a and parks the playhead inside it, as Split requires. */
  async function selectFirstClip(showId: string): Promise<void> {
    act(() => useShowTransportStore.setState({ showId, positionMs: 2_000 }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Select CometLoom' })[0])
    await act(async () => {})
  }

  it(
    'resolves Clone selection as an internal no-change result without disabling the control',
    async () => {
      const editor = openV2Editor('tracer-unconnected-clone')
      render(<ShowEditor showId={editor.showId} recordVersion={2} />)
      await selectFirstClip(editor.showId)
      const before = editor.state()
      const button = timelineCommand('Clone selection')
      // The tracer changes no enabled styling: the control the v1 editor offers
      // for this selection stays offered, and stays reachable.
      expect(button).toBeEnabled()
      expect(button).not.toHaveAttribute('aria-disabled', 'true')

      fireEvent.click(button)
      await act(async () => {})

      expectNoWrite(before, editor.state())
      expect(timelineCommand('Clone selection')).toBeEnabled()
    },
  )

  it('leaves Delete on a Group occurrence unclaimed with no write (#1066 slice 2)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-unconnected-delete'
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    act(() => { useShowEditorViewStore.getState().setSelection({ kind: 'group', occurrenceId: 'occ-0' }) })
    await act(async () => {})
    const before = editor.state()

    fireEvent.keyDown(document, { key: 'Delete' })
    await act(async () => {})

    expectNoWrite(before, editor.state())
  })

  it('keeps the Clip edge handles rendered on a v2 backing', async () => {
    const editor = openV2Editor('tracer-resize-handles')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectFirstClip(editor.showId)
    // The handles are still rendered: connecting the gesture hides no v1
    // affordance. Their behavior is proved in the slice-1 suite below.
    expect(screen.getAllByRole('separator', { name: 'Resize CometLoom end' })[0]).toBeInTheDocument()
    expect(screen.getAllByRole('separator', { name: 'Resize CometLoom start' })[0]).toBeInTheDocument()
  })
})

// ── Transition surfaces ──────────────────────────────────────────────────────
// v1 edits Transitions through two surfaces: the boundary Transition inspector
// in the entity detail panel, and the Layer Transition popover anchored on a
// junction. The tracer must reach both from a v2 backing through the same JSX,
// because a v1 Show stored as v2 has to read identically. Every write on these
// surfaces is unconnected in this tracer, so each case also asserts that
// opening and reading reaches no owner at all.

const corpusManifest = JSON.parse(readFileSync(
  // The DOM environment has no file-scheme `import.meta.url`, so the committed
  // manifest is read from the repository root the runner already runs in.
  'e2e/fixtures/showEditorEquivalence.json',
  'utf8',
)) as { version: 1; corpus: Array<{ key: string; source: ShowRecord }> }

function corpusSource(key: string): ShowRecord {
  const entry = corpusManifest.corpus.find((candidate) => candidate.key === key)
  if (!entry) throw new Error(`No corpus case ${key}.`)
  return structuredClone(entry.source)
}

/**
 * The real converter on a real v1 corpus Show, with the exact Pattern source
 * each Clip needs - the same dependencies the reviewed equivalence oracle
 * supplies. Every fixture below is an admitted record, asserted against the
 * domain validator rather than hand-written to match the projection.
 */
function convertCorpus(source: ShowRecord): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(source, {
    byCellId: Object.fromEntries(source.cells.map((cell) => {
      if (cell.pattern.kind !== 'stock') throw new Error(`${source.id}: non-stock flat dependency`)
      const patternSource = DEMOS[resolveStockPatternId(cell.pattern.id)]
      if (!patternSource) throw new Error(`${source.id}: missing stock source ${cell.pattern.id}`)
      return [cell.id, patternSource]
    })),
  })
  if (result.status !== 'converted') throw new Error(`${source.id} refused: ${JSON.stringify(result.issues)}`)
  expect(validateShowRecordV2(result.record), `${source.id} converted`).toEqual([])
  return result.record
}

/**
 * The committed `fresh` Show exactly as it stands: a single Zone pair whose
 * boundary Transition the converter lands at Layer *participant* scope, because
 * nothing at that boundary needs whole-output ownership. The drawn junction is
 * indistinguishable from a Layer Transition's; only the recorded provenance
 * says v1 authored it on the boundary surface.
 */
function convertedFreshBoundary(id: string): { source: ShowRecord; record: ShowRecordV2 } {
  const source = corpusSource('fresh')
  source.id = id
  const record = convertCorpus(source)
  const transition = record.composition.transitions[0]
  expect(transition.origin).toBe('converted-boundary-transition')
  expect(transition.wholeOutput).toBeUndefined()
  expect(transition.participants).toHaveLength(1)
  return { source, record }
}

/**
 * The committed `fresh` boundary, with one Pattern on both sides so the
 * compatible-pair rows the v1 panel draws - Transform, and a shared Pattern
 * control - are actually present, and with a different value on each side of
 * every read the panel makes. The Show-wide repeat scale changes across the
 * boundary, which is what gives this one whole-output ownership.
 */
function convertedAdvancedBoundary(id: string): { source: ShowRecord; record: ShowRecordV2 } {
  const source = corpusSource('fresh')
  source.id = id
  source.scenes[0].sampleTargets = { repeatScale: 1 }
  source.scenes[1].sampleTargets = { repeatScale: 2 }
  // v1 shares one Pattern instance between two ShowCells on the same Pattern,
  // so instance-owned time and control targets have to match; the per-Clip
  // Transform and brightness are free to differ, and do.
  source.cells[0] = {
    ...source.cells[0],
    pattern: { kind: 'stock', id: 'CometLoom' },
    patternName: 'CometLoom',
    transform: { positionX: 0.25, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    controlTargets: { sliderSpeed: 0.2 },
  }
  source.cells[1] = {
    ...source.cells[1],
    adaptations: { ...source.cells[1].adaptations, brightness: 0.5 },
    transform: { positionX: -0.5, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    controlTargets: { sliderSpeed: 0.2 },
  }
  const record = convertCorpus(source)
  expect(record.composition.transitions[0].wholeOutput).toBeDefined()
  return { source, record }
}

/**
 * The same Show with an outgoing Clip spanning two Scenes while the Show-wide
 * repeat scale changes inside that span: the converter gives that boundary
 * whole-output ownership. Removing `origin` afterwards makes it a record that
 * claims no v1 provenance at all, which is the only shape a natively authored
 * whole-output Transition can have.
 */
function nativeWholeOutputBoundary(id: string): { source: ShowRecord; record: ShowRecordV2 } {
  const source = corpusSource('fresh')
  source.id = id
  source.scenes = [
    { id: 'scene-1', name: 'Scene 1', durationMs: 30_000, sampleTargets: { repeatScale: 1 } },
    { id: 'scene-2', name: 'Scene 2', durationMs: 30_000, sampleTargets: { repeatScale: 2 } },
    { id: 'scene-3', name: 'Scene 3', durationMs: 30_000, sampleTargets: { repeatScale: 3 } },
  ]
  source.cells = [
    { ...source.cells[0], sceneId: 'scene-1', sceneSpan: 2 },
    { ...source.cells[1], sceneId: 'scene-3', sceneSpan: 1 },
  ]
  source.transitions = [{
    id: 'transition-scene-2',
    afterSceneId: 'scene-2',
    kind: 'crossfade',
    durationMs: 2_000,
    easing: { curve: 'linear' },
    crossfadePolicy: 'snapshot-live',
  }]
  const record = convertCorpus(source)
  for (const transition of record.composition.transitions) delete transition.origin
  expect(validateShowRecordV2(record), 'native whole-output record').toEqual([])
  return { source, record }
}

/** The committed lesson Show, whose two Transitions v1 authored on a Layer. */
function convertedLayerTransitions(id: string): ShowRecordV2 {
  const source = corpusSource('stock-lesson')
  source.id = id
  return convertCorpus(source)
}

/**
 * The committed Group Show with its two definition children moved onto one
 * Layer, adjacent, and joined by a definition-local Layer Transition. No
 * committed Group authors one, and this is the smallest v1 mutation that does.
 */
function convertedGroupLocalTransition(id: string): ShowRecordV2 {
  const source = corpusSource('groups-animation')
  source.id = id
  const definition = source.composition!.groupDefinitions![0]
  definition.placements = [
    { ...definition.placements[0], startMs: 0, durationMs: 2_000, layerOffset: 0 },
    { ...definition.placements[1], startMs: 3_000, durationMs: 1_000, layerOffset: 0 },
  ]
  definition.propertyTracks = []
  definition.transitions = [{
    id: 'group-pulse-join',
    fromPlacementId: definition.placements[0].id,
    toPlacementId: definition.placements[1].id,
    kind: 'crossfade',
    durationMs: 1_000,
    easing: { curve: 'linear' },
    crossfadePolicy: 'live-live',
  }]
  source.composition!.groupOccurrences = [source.composition!.groupOccurrences![0]]
  return convertCorpus(source)
}

function boundaryPanel(): HTMLElement {
  return screen.getByRole('region', { name: 'Transition properties' })
}

describe('v2 boundary Transition inspector (#1065)', () => {
  it('opens the boundary panel from a participant-scope junction the user clicks', async () => {
    const { source, record } = convertedFreshBoundary('tracer-boundary-fresh')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    // The real gesture, not a store selection: a participant-scope converted
    // boundary draws the same junction a Layer Transition does, so only the
    // recorded family can send this click to the boundary panel.
    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))
    await act(async () => {})

    expect(within(boundaryPanel()).getByText(showBoundaryClipIdentity(source, 'scene-1')))
      .toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Layer Transition Details' })).not.toBeInTheDocument()
    expectNoWrite(before, editor.state())
  })

  it('reads every advanced row the v1 panel draws from the authored record, and writes nothing', async () => {
    const { source, record } = convertedAdvancedBoundary('tracer-boundary-advanced')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between CometLoom and CometLoom',
    }))
    await act(async () => {})

    const panel = boundaryPanel()
    // The boundary heading v1 draws, resolved from the authored destination
    // time and the Pattern that starts there.
    expect(within(panel).getByText(showBoundaryClipIdentity(source, 'scene-1'))).toBeInTheDocument()
    // The Change button is the palette's only entry point, and it stays enabled.
    expect(within(panel).getByRole('button', { name: /Change$/ })).toBeEnabled()
    // The crossfade-only control and its cost readout, exactly as v1 draws them.
    expect(within(panel).getByRole('combobox', { name: 'Crossfade source' })).toHaveValue('snapshot-live')

    fireEvent.click(within(panel).getByText('Advanced transition controls'))
    const advanced = within(panel).getByText('Advanced transition controls').closest('details')!
    expect(within(advanced).getByTestId('transition-cost-tag')).toHaveTextContent('cost · expensive')
    // Each side's authored Transform pose, read from the two Clips the
    // Transition names rather than from a Scene's ShowCells.
    const transform = within(advanced).getByRole('region', { name: 'Transform transition' })
    expect(within(transform).getByText('0.25 to -0.5')).toBeInTheDocument()
    // The Show-wide scalar each side holds across this boundary.
    expect(within(advanced).getByText('1x → 2x')).toBeInTheDocument()
    // The per-Zone rows are named by the authored Zone and stay enabled; the
    // shared Pattern control appears because both sides target it.
    expect(within(advanced).getByRole('checkbox', { name: 'Animate speed for main' })).toBeEnabled()
    expect(within(advanced).getByRole('checkbox', { name: 'Animate brightness for main' })).toBeEnabled()
    expect(within(advanced).getByRole('checkbox', { name: 'Animate Speed for main' })).toBeEnabled()

    // Every write this panel offers resolves as an internal no-change result.
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Crossfade source' }), {
      target: { value: 'live-live' },
    })
    fireEvent.click(within(advanced).getByRole('checkbox', { name: 'Animate speed for main' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset transition to cut' }))
    await act(async () => {})

    expectNoWrite(before, editor.state())
    // The panel is still open and still reads the authored settings.
    expect(within(boundaryPanel()).getByRole('combobox', { name: 'Crossfade source' }))
      .toHaveValue('snapshot-live')
  })

  it('reads a native whole-output Transition through the same boundary panel', async () => {
    const { source, record } = nativeWholeOutputBoundary('tracer-boundary-whole-output')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    // The whole-output Transition is reachable from the junction it names, the
    // same handle v1 draws from its own boundary record.
    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))
    await act(async () => {})

    const panel = boundaryPanel()
    expect(within(panel).getByText(showBoundaryClipIdentity(source, 'scene-2'))).toBeInTheDocument()
    fireEvent.click(within(panel).getByText('Advanced transition controls'))
    // The outgoing scalar is the one handed over at the boundary, not the one
    // the outgoing Clip started with two Scenes earlier.
    expect(within(panel).getByText('2x → 3x')).toBeInTheDocument()

    expectNoWrite(before, editor.state())
  })

  it('opens the existing boundary Change palette without reaching an owner', async () => {
    const { record } = convertedAdvancedBoundary('tracer-boundary-palette')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between CometLoom and CometLoom',
    }))
    await act(async () => {})
    fireEvent.click(within(boundaryPanel()).getByRole('button', { name: /Change$/ }))
    await act(async () => {})

    // Opening the palette is a read. It is v1's palette, with v1's catalogue.
    const palette = screen.getByRole('dialog', { name: 'Choose Transition' })
    expect(within(palette).getByRole('button', { name: 'Use Crossfade Transition' })).toBeEnabled()
    expect(within(palette).getByRole('searchbox', { name: 'Search Transitions' })).toBeVisible()

    expectNoWrite(before, editor.state())
  })
})

describe('v2 Layer Transition popover (#1065)', () => {
  it('reads a converted Layer Transition through the existing popover', async () => {
    const record = convertedLayerTransitions('tracer-layer-popover')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit wipe Transition between EventHorizon and SignalMandala',
    }))
    await act(async () => {})

    // v1's Layer surface, not the boundary inspector: this junction is a Layer
    // Transition in the record v1 authored, and conversion recorded that.
    const popover = screen.getByRole('dialog', { name: 'Layer Transition Details' })
    expect(within(popover).getByRole('heading', { name: 'wipe' })).toBeInTheDocument()
    expect(within(popover).getByText('EventHorizon to SignalMandala')).toBeInTheDocument()
    expect(within(popover).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' }))
      .toHaveValue('1.5')
    // Reset to Cut is unconnected here, and stays offered rather than disabled.
    expect(within(popover).getByRole('button', { name: 'Reset to Cut' })).toBeEnabled()
    expect(screen.queryByRole('region', { name: 'Transition properties' })).not.toBeInTheDocument()

    fireEvent.change(
      within(popover).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' }),
      { target: { value: '0.5' } },
    )
    fireEvent.blur(within(popover).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' }))
    fireEvent.click(within(popover).getByRole('button', { name: 'Reset to Cut' }))
    await act(async () => {})

    expectNoWrite(before, editor.state())
  })

  it('reads a Group-local Transition through the same popover inside Group isolation', async () => {
    const record = convertedGroupLocalTransition('tracer-group-local-popover')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    // v1 reaches a Group's internals only through isolation, and so does this.
    const child = screen.getAllByRole('button', { name: 'Select Group Mandala pulse' })[0]
    fireEvent.click(child, { detail: 2 })
    await act(async () => {})
    const junction = screen.getByRole('button', {
      name: 'Edit crossfade Transition between SignalMandala and SignalMandala',
    })
    fireEvent.click(junction)
    await act(async () => {})

    const popover = screen.getByRole('dialog', { name: 'Layer Transition Details' })
    expect(within(popover).getByRole('heading', { name: 'crossfade' })).toBeInTheDocument()
    expect(within(popover).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' }))
      .toHaveValue('1')
    // The junction is named by the occurrence and the definition child it
    // presents, so the Group-local Transition never becomes a top-level one.
    expect(junction.getAttribute('data-show-group-occurrence')).toBe('occurrence-first')
    expect(junction.getAttribute('data-show-layer-junction'))
      .toBe('occurrence-first:group-pulse-join')

    fireEvent.click(within(popover).getByRole('button', { name: 'Reset to Cut' }))
    await act(async () => {})

    expectNoWrite(before, editor.state())
  })

  it('draws the authored Group-local Transition pictogram on its own junction', async () => {
    const record = convertedGroupLocalTransition('tracer-group-local-pictogram')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    const child = screen.getAllByRole('button', { name: 'Select Group Mandala pulse' })[0]
    fireEvent.click(child, { detail: 2 })
    await act(async () => {})

    const junction = screen.getByRole('button', {
      name: 'Edit crossfade Transition between SignalMandala and SignalMandala',
    })
    expect(junction.getAttribute('data-show-layer-junction'))
      .toBe('occurrence-first:group-pulse-join')
    // v1 draws its crossfade glyph on this band. Opening the popover proves the
    // click routes, not that the band is drawn, so the oracle is the junction's
    // own SVG: a settings lookup that misses the occurrence key renders nothing
    // here and the user sees an empty outline.
    const pictogram = within(junction).getByTestId('transition-xray-pictogram')
    expect(pictogram).toHaveAttribute('data-transition-kind', 'crossfade')
    expect(pictogram.querySelector('[data-crossfade-ramp="outgoing"]')).not.toBeNull()
    expect(pictogram.querySelector('[data-crossfade-ramp="incoming"]')).not.toBeNull()

    expectNoWrite(before, editor.state())
  })
})

// ── Time grid ────────────────────────────────────────────────────────────────

/**
 * The timeline's time grid must resolve to the same CSS tracks on both
 * backings. The tracks are `fr` weights, so a different column set resolves to
 * a different sub-pixel origin even when the weights sum to the same total, and
 * every Clip box, ruler tick and label in the timeline then rasters differently
 * (#1065). The assertion is the rendered `style` attribute, which is what the
 * browser lays the surface out from.
 */
describe('v2 time grid columns (#1065)', () => {
  function gridStyle(): string {
    return screen.getByTestId('show-timeline-grid').getAttribute('style') ?? ''
  }

  function renderV1(source: ShowRecord): string {
    useShowStore.setState({
      shows: [source],
      showsLoaded: true,
      activeShowId: source.id,
      showV2Pilots: {},
      showV2Histories: {},
      showRevisions: {},
    })
    render(<ShowEditor showId={source.id} />)
    const style = gridStyle()
    cleanup()
    return style
  }

  function renderV2(record: ShowRecordV2): string {
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    return gridStyle()
  }

  for (const key of ['fresh', 'installation-layouts', 'groups-animation', 'stock-lesson'] as const) {
    it(`lays ${key} out in the same grid tracks on both backings`, () => {
      const source = corpusSource(key)
      const record = convertCorpus(source)

      const v1Style = renderV1(source)
      const v2Style = renderV2(record)

      expect(v1Style).toContain('grid-template-columns:')
      expect(v2Style).toBe(v1Style)
    })
  }
})

// ── Slice-1 Clip temporal commands (#1066) ───────────────────────────────────
// The rest of the Clip temporal intents through the existing handlers: free
// trim/extend and placement replacement through the clip-temporal door, split
// at the playhead through the same door, and the connected forms
// (resize-leading, resize-trailing, move-connected) through the
// transition-resize door. Every case keeps the tracer fences: exactly one
// history entry and one save per accepted edit, record identity on refusal,
// exact Undo then Redo, and no legacy owner invocation on a v2 row.

/**
 * The tracer baseline plus a joined main pair: resize-a 1000-5000 joined to
 * resize-b 7000-9000 by a 2000 ms crossfade, overlay-a free at 12000-14000,
 * Show End 20000. Both move directions have slack, so connected outcomes are
 * exercisable instead of only refusals.
 */
function connectedV2Record(id: string): ShowRecordV2 {
  const source: ShowRecord = resizeBoundaryShow(id)
  const zone = source.composition!.scenes[0].zones[0]
  source.composition!.patternInstances.push(
    { id: 'resize-b-instance', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom', time: { timeScale: 1, timeOffsetMs: 0 } },
    { id: 'overlay-instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } },
  )
  const view = { mirror: false, phase: 0, brightness: 1 }
  zone.main = [
    { id: 'resize-a', instanceId: 'resize-instance', startMs: 1000, durationMs: 4000, view },
    { id: 'resize-b', instanceId: 'resize-b-instance', startMs: 7000, durationMs: 2000, view },
  ]
  zone.overlays = [{
    id: 'overlay-1',
    name: 'Atmosphere',
    placements: [{
      id: 'overlay-a',
      instanceId: 'overlay-instance',
      startMs: 12_000,
      durationMs: 2_000,
      opacity: 1,
      view,
    }],
  }]
  source.composition!.transitions = [{
    id: 'join-a-b',
    fromPlacementId: 'resize-a',
    toPlacementId: 'resize-b',
    kind: 'crossfade',
    durationMs: 2_000,
    easing: { curve: 'linear' },
    crossfadePolicy: 'live-live',
  }]
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(validateShowRecordV2(converted.record)).toEqual([])
  return converted.record
}

/** One accepted edit: exactly one history entry, one save, no legacy touch. */
function expectOneEdit(before: EditorState, after: EditorState): void {
  expect(after.history.past).toEqual([before.record])
  expect(after.history.future).toEqual([])
  expect(after.revision).toBe(before.revision + 1)
  expect(after.v2Writes).toBe(before.v2Writes + 1)
  expect(after.legacyWrites).toBe(0)
  expect(after.legacyShows).toEqual([])
  expect(after.legacyHistories).toEqual({})
  expect(legacy.calls).toEqual([])
}

/** Undo restores the preimage composition exactly; Redo restores the edit. */
async function expectUndoRedoExact(editor: OpenV2Editor, before: EditorState): Promise<void> {
  const applied = editor.state()
  fireEvent.click(screen.getByRole('button', { name: 'Undo Show edit' }))
  await act(async () => {})
  // Undo restamps `updatedAt` because the restored record is itself a save;
  // the authored content is exact.
  expect(editor.state().record.composition).toEqual(before.record.composition)
  fireEvent.click(screen.getByRole('button', { name: 'Redo Show edit' }))
  await act(async () => {})
  expect(editor.state().record.composition).toEqual(applied.record.composition)
}

/**
 * An Alt edge drag: Alt escapes grid and magnetism to raw milliseconds, so
 * the settled boundary is the pointer position exactly.
 */
async function resizeDrag(
  patternName: string,
  edge: 'start' | 'end',
  index: number,
  fromX: number,
  toX: number,
  altKey = true,
  laneWidthPx = 200,
): Promise<void> {
  const handle = screen.getAllByRole('separator', { name: `Resize ${patternName} ${edge}` })[index]
  const lane = handle.closest('[data-show-layer-kind]') as HTMLElement
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({
    left: 0, right: laneWidthPx, top: 0, bottom: 40, width: laneWidthPx, height: 40, x: 0, y: 0, toJSON() {},
  })
  // jsdom reports clientWidth 0, and `0 ?? rect.width` keeps 0, which blows
  // the 10 px magnet threshold up to the whole timeline: plain-pointer targets
  // would snap back onto a structural time and refuse as no-change.
  Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', {
    configurable: true,
    value: laneWidthPx,
  })
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: fromX, altKey })
  fireEvent.pointerMove(window, { pointerId: 1, clientX: toX, altKey })
  fireEvent.pointerUp(window, { pointerId: 1, clientX: toX, altKey })
  await act(async () => {})
}

async function selectClipAt(showId: string, name: string, index: number, positionMs: number): Promise<void> {
  act(() => useShowTransportStore.setState({ showId, positionMs }))
  fireEvent.click(screen.getAllByRole('button', { name: `Select ${name}` })[index])
  await act(async () => {})
}

describe('v2 clip temporal commands (#1066)', () => {
  it('trims a free trailing edge through the clip-temporal door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-trim'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    await resizeDrag('TestPattern1D', 'end', 0, 40, 30)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: { kind: 'trim', clipId: 'overlay-a', startMs: 12_000, endMs: 13_000 },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'overlay-a').durationMs).toBe(1_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('extends a free trailing edge through the clip-temporal door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-extend'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    await resizeDrag('TestPattern1D', 'end', 0, 40, 60)

    const after = editor.state()
    expect(temporalSubmissions()).toEqual([{
      intent: { kind: 'extend', clipId: 'overlay-a', startMs: 12_000, endMs: 16_000 },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'overlay-a').durationMs).toBe(4_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('resizes a joined trailing edge through the connected trailing form', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-resize-trailing'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    await resizeDrag('CometLoom', 'end', 0, 40, 60)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-trailing', clipId: 'resize-a', endMs: 7_000 },
    ])
    // The trailing growth ripples the joined successor later, exactly as the
    // transition owner defines: resize-b follows its incoming window.
    expect(authoredClip(after.record, 'resize-a').durationMs).toBe(6_000)
    expect(authoredClip(after.record, 'resize-b').startMs).toBe(9_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('resizes a joined leading edge through the connected leading form', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-resize-leading'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    await resizeDrag('CometLoom', 'start', 1, 40, 30)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-leading', clipId: 'resize-b', startMs: 6_000 },
    ])
    expect(authoredClip(after.record, 'resize-b').startMs).toBe(6_000)
    expect(after.record.composition.transitions[0].durationMs).toBe(1_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('treats an Alt resize away from a Layer-Transition join as the connected form (#1068)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-alt-layer-away'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    // CometLoom resize-b starts at 7000 on a 200 px / 20000 ms lane, so +10 px
    // asks for 8000: away from the incoming join-a-b window. Alt escapes
    // magnetism to raw milliseconds but never detaches, and join-a-b carries
    // converted-layer-transition provenance, so the gesture takes the
    // connected leading form exactly as without Alt.
    await resizeDrag('CometLoom', 'start', 1, 70, 80)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-leading', clipId: 'resize-b', startMs: 8_000 },
    ])
    expect(authoredClip(after.record, 'resize-b').startMs).toBe(8_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('keeps the connected leading form for the same resize without Alt (#1066)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-plain-away'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    // 20 ms per px on the wide lane: +50 px asks for 8000, clear of the
    // 200 ms magnet threshold around the 7000 and 9000 structural times.
    await resizeDrag('CometLoom', 'start', 1, 350, 400, false, 1000)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-leading', clipId: 'resize-b', startMs: 8_000 },
    ])
    expect(authoredClip(after.record, 'resize-b').startMs).toBe(8_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('treats a plain free-edge resize like the Alt free resize (#1066)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-plain-trim'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    // 20 ms per px: -50 px asks for 13000, clear of the 12000/14000 edges.
    await resizeDrag('TestPattern1D', 'end', 0, 700, 650, false, 1000)

    const after = editor.state()
    expect(temporalSubmissions()).toEqual([{
      intent: { kind: 'trim', clipId: 'overlay-a', startMs: 12_000, endMs: 13_000 },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'overlay-a').durationMs).toBe(1_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('keeps the untouched edge exact when a leading boundary lands on a half-millisecond (#1066)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-half-ms-leading'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const beforeEndMs = authoredClip(before.record, 'overlay-a').startMs + authoredClip(before.record, 'overlay-a').durationMs
    // 100 ms per px on the 200 px lane: +5.005 px asks for a 12500.5 ms
    // leading boundary, so independently rounded start and duration would sum
    // one past the untouched trailing edge.
    await resizeDrag('TestPattern1D', 'start', 0, 40, 45.005)

    const after = editor.state()
    expect(temporalSubmissions()).toEqual([{
      intent: { kind: 'trim', clipId: 'overlay-a', startMs: 12_501, endMs: 14_000 },
      baseRevision: 0,
    }])
    const resized = authoredClip(after.record, 'overlay-a')
    expect(resized.startMs).toBe(12_501)
    expect(resized.startMs + resized.durationMs).toBe(beforeEndMs)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

/**
 * The converted Clip id behind one stock Pattern: conversion mints Clip
 * identity per run, so boundary assertions resolve it through the instance.
 */
function convertedClipIdByPattern(record: ShowRecordV2, patternName: string): string {
  const instance = record.composition.patternInstances.find((candidate) => candidate.patternName === patternName)
  if (!instance) throw new Error(`No ${patternName} instance.`)
  const clip = record.composition.clips.find((candidate) => candidate.instanceId === instance.id)
  if (!clip) throw new Error(`No ${patternName} clip.`)
  return clip.id
}

describe('v2 converted-boundary resize refusals (#1068)', () => {
  it('refuses an Alt resize that pulls a converted-boundary leading edge away', async () => {
    const { record } = convertedFreshBoundary('slice1-boundary-alt-away')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const clipId = convertedClipIdByPattern(record, 'CometLoom')
    // CometLoom starts at 32000 on a 200 px / 62000 ms lane, so +10 px asks
    // for 35100: away from the incoming converted-boundary window. v1 detaches
    // that edge into a trim plus a Transition reset and Show-End reclaim,
    // which no single landed v2 owner expresses in one edit (#1068) - the
    // gesture submits nothing and the Transition stays intact.
    await resizeDrag('CometLoom', 'start', 0, 70, 80)

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expectNoWrite(before, after)
    expect(authoredClip(after.record, clipId).startMs).toBe(32_000)
    expect(after.record.composition.transitions).toHaveLength(1)
    expect(after.record.composition.transitions[0]).toMatchObject({
      id: 'transition-scene-1', kind: 'crossfade', durationMs: 2_000,
      origin: 'converted-boundary-transition',
    })
  })

  it('refuses the same boundary-away resize without Alt', async () => {
    const { record } = convertedFreshBoundary('slice1-boundary-plain-away')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const clipId = convertedClipIdByPattern(record, 'CometLoom')
    // 62 ms per px on the wide lane: +50 px asks for 35100, clear of the
    // structural-time magnets, so the plain pointer refuses exactly as Alt.
    await resizeDrag('CometLoom', 'start', 0, 350, 400, false, 1000)

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expectNoWrite(before, after)
    expect(authoredClip(after.record, clipId).startMs).toBe(32_000)
    expect(after.record.composition.transitions).toHaveLength(1)
    expect(after.record.composition.transitions[0].durationMs).toBe(2_000)
  })

  it('refuses an Alt resize that pulls a converted-boundary trailing edge away', async () => {
    const { record } = convertedFreshBoundary('slice1-boundary-trailing-away')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const clipId = convertedClipIdByPattern(record, 'TestPattern1D')
    // -10 px asks for end 26900: away from the outgoing converted-boundary
    // window, refused for the same missing detach owner.
    await resizeDrag('TestPattern1D', 'end', 0, 70, 60)

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expectNoWrite(before, after)
    expect(authoredClip(after.record, clipId).durationMs).toBe(30_000)
    expect(after.record.composition.transitions).toHaveLength(1)
    expect(after.record.composition.transitions[0].durationMs).toBe(2_000)
  })

  it('keeps the connected leading form toward a converted-boundary join', async () => {
    const { record } = convertedFreshBoundary('slice1-boundary-toward')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const clipId = convertedClipIdByPattern(record, 'CometLoom')
    // -1 px asks for 31690: toward the incoming window, which the connected
    // leading form retunes (2000 ms -> 1690 ms) exactly as for a Layer join.
    await resizeDrag('CometLoom', 'start', 0, 70, 69)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-leading', clipId, startMs: 31_690 },
    ])
    expect(authoredClip(after.record, clipId).startMs).toBe(31_690)
    expect(after.record.composition.transitions[0].durationMs).toBe(1_690)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('keeps the connected form away from a natively authored join', async () => {
    const record = connectedV2Record('slice1-native-away')
    for (const transition of record.composition.transitions) delete transition.origin
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    // 20 ms per px on the wide lane: +50 px asks for 8000, away from the
    // incoming window. No provenance means a natively authored join, which
    // the connected leading form keeps.
    await resizeDrag('CometLoom', 'start', 1, 350, 400, false, 1000)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-leading', clipId: 'resize-b', startMs: 8_000 },
    ])
    expect(authoredClip(after.record, 'resize-b').startMs).toBe(8_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })
})

  it('moves a joined Clip with its connected component', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-move-connected'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('main'), 'dragover', 30)
    surface.fire(surface.lane('main'), 'drop', 30)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'move-connected', clipId: 'resize-a', startMs: 3_000 },
    ])
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(3_000)
    expect(authoredClip(after.record, 'resize-b').startMs).toBe(9_000)
    expect(after.record.composition.clips.map((clip) => clip.id))
      .toEqual(before.record.composition.clips.map((clip) => clip.id))
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('refuses a cross-Layer drop of a joined Clip without detaching its Transition', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-connected-reroute'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('overlay'), 'dragover', DROP_X)
    surface.fire(surface.lane('overlay'), 'drop', DROP_X)
    await act(async () => {})

    const after = editor.state()
    // v1 detaches the Transition and moves; the v2 owner refuses the
    // re-placement, so the gesture plans nothing and submits no command.
    expect(surface.dataTransfer.dropEffect).toBe('none')
    expectNoWrite(before, after)
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(1_000)
    expect(authoredClip(after.record, 'resize-a').layerId)
      .toBe(authoredClip(before.record, 'resize-a').layerId)
    expect(after.record.composition.transitions).toHaveLength(1)
  })

  it('splits the selected Clip at the playhead and selects the right half', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-split'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipAt(editor.showId, 'CometLoom', 1, 8_000)
    const before = editor.state()
    const button = timelineCommand('Split at playhead')
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(button)
    await act(async () => {})

    const submissions = temporalSubmissions()
    expect(submissions).toHaveLength(1)
    expect(submissions[0].baseRevision).toBe(0)
    const intent = submissions[0].intent as { kind: string; clipId: string; atMs: number; rightClipId: string }
    expect(intent.kind).toBe('split')
    expect(intent.clipId).toBe('resize-b')
    expect(intent.atMs).toBe(8_000)
    expect(typeof intent.rightClipId).toBe('string')
    expect(before.record.composition.clips.some((clip) => clip.id === intent.rightClipId)).toBe(false)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(authoredClip(after.record, 'resize-b').durationMs).toBe(1_000)
    const right = authoredClip(after.record, intent.rightClipId)
    expect([right.startMs, right.durationMs, right.entryPolicy]).toEqual([8_000, 1_000, 'continue'])
    expect(after.record.composition.clips).toHaveLength(4)
    expect(clipButton(intent.rightClipId).getAttribute('aria-pressed')).toBe('true')
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('splits a joined Clip with the outgoing endpoint following the right half', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-split-joined'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipAt(editor.showId, 'CometLoom', 0, 3_000)
    const before = editor.state()

    fireEvent.click(timelineCommand('Split at playhead'))
    await act(async () => {})

    const submissions = temporalSubmissions()
    expect(submissions).toHaveLength(1)
    const intent = submissions[0].intent as { kind: string; clipId: string; atMs: number; rightClipId: string }
    expect({ kind: intent.kind, clipId: intent.clipId, atMs: intent.atMs }).toEqual({
      kind: 'split', clipId: 'resize-a', atMs: 3_000,
    })
    const after = editor.state()
    expect(authoredClip(after.record, 'resize-a').durationMs).toBe(2_000)
    const right = authoredClip(after.record, intent.rightClipId)
    expect([right.startMs, right.durationMs]).toEqual([3_000, 2_000])
    const transition = after.record.composition.transitions[0]
    expect(transition.participants[0].fromClipId).toBe(intent.rightClipId)
    expect(transition.participants[0].toClipId).toBe('resize-b')
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('settles a collapsed-Zone drop of a free Clip on the Zone bottom Layer (#1066)', async () => {
    const editor = openV2EditorForRecord(twoZoneV2Record('slice1-collapsed-drop'))
    useShowEditorSessionStore.getState().setZoneCollapsed(editor.showId, 'z2', true)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = zoneDropSurface('overlay-a')
    const collapsed = surface.collapsedZone('z2')
    // The collapsed drop reads the target box itself; an unmocked jsdom width
    // of 0 would clamp every drop onto the latest same-Layer start.
    vi.spyOn(collapsed, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 200, top: 0, bottom: 28, width: 200, height: 28, x: 0, y: 0, toJSON() {},
    })

    // x=110 lands at 11000: clear of the join-a-b window edges and of the
    // dragged Clip's own excluded boundaries, so the grid keeps it exactly.
    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(collapsed, 'dragover', 110)
    surface.fire(collapsed, 'drop', 110)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: {
        kind: 'replace-placement', clipId: 'overlay-a', zoneId: 'z2', layerId: 'layer:z2:main', startMs: 11_000,
      },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'overlay-a').zoneId).toBe('z2')
    expect(authoredClip(after.record, 'overlay-a').layerId).toBe('layer:z2:main')
    expect(authoredClip(after.record, 'overlay-a').startMs).toBe(11_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('settles a cross-Zone drop of a free Clip as a placement replacement (#1066)', async () => {
    const editor = openV2EditorForRecord(twoZoneV2Record('slice1-cross-zone'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = zoneDropSurface('overlay-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.zoneLane('z2', 'main'), 'dragover', 110)
    surface.fire(surface.zoneLane('z2', 'main'), 'drop', 110)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: {
        kind: 'replace-placement', clipId: 'overlay-a', zoneId: 'z2', layerId: 'layer:z2:main', startMs: 11_000,
      },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'overlay-a').zoneId).toBe('z2')
    expect(authoredClip(after.record, 'overlay-a').layerId).toBe('layer:z2:main')
    expect(authoredClip(after.record, 'overlay-a').startMs).toBe(11_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('lands an Alt cross-Layer drop on the rounded millisecond v1 lands on (#1066)', async () => {
    const editor = openV2Editor('tracer-alt-cross-layer')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const overlayLayerId = before.record.composition.layers.find((layer) => layer.id !== authoredClip(before.record, 'resize-a').layerId)!.id
    const surface = dragSurface('resize-a')

    // Alt is held only after gesture start, so the drag stays a move while the
    // drop escapes the snap grid: x=40.37 asks for 4036.9999999999995 ms, and
    // v1 moveShowClip rounds that same resolver output to 4037.
    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('overlay'), 'dragover', 40.37, true)
    surface.fire(surface.lane('overlay'), 'drop', 40.37, true)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: {
        kind: 'replace-placement', clipId: 'resize-a', zoneId: 'z1', layerId: overlayLayerId, startMs: 4_037,
      },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'resize-a').layerId).toBe(overlayLayerId)
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(4_037)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('lands an Alt cross-Zone drop on the rounded millisecond v1 lands on (#1066)', async () => {
    const editor = openV2EditorForRecord(twoZoneV2Record('slice1-alt-cross-zone'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = zoneDropSurface('overlay-a')

    // x=110.37 asks for 11037.000000000002 ms with Alt escaping the grid.
    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.zoneLane('z2', 'main'), 'dragover', 110.37, true)
    surface.fire(surface.zoneLane('z2', 'main'), 'drop', 110.37, true)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: {
        kind: 'replace-placement', clipId: 'overlay-a', zoneId: 'z2', layerId: 'layer:z2:main', startMs: 11_037,
      },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'overlay-a').zoneId).toBe('z2')
    expect(authoredClip(after.record, 'overlay-a').layerId).toBe('layer:z2:main')
    expect(authoredClip(after.record, 'overlay-a').startMs).toBe(11_037)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('lands an Alt collapsed-Zone drop on the rounded millisecond v1 lands on (#1066)', async () => {
    const editor = openV2EditorForRecord(twoZoneV2Record('slice1-alt-collapsed-drop'))
    useShowEditorSessionStore.getState().setZoneCollapsed(editor.showId, 'z2', true)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = zoneDropSurface('overlay-a')
    const collapsed = surface.collapsedZone('z2')
    vi.spyOn(collapsed, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 200, top: 0, bottom: 28, width: 200, height: 28, x: 0, y: 0, toJSON() {},
    })

    // x=110.37 asks for 11037.000000000002 ms with Alt escaping the grid.
    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(collapsed, 'dragover', 110.37, true)
    surface.fire(collapsed, 'drop', 110.37, true)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: {
        kind: 'replace-placement', clipId: 'overlay-a', zoneId: 'z2', layerId: 'layer:z2:main', startMs: 11_037,
      },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'overlay-a').zoneId).toBe('z2')
    expect(authoredClip(after.record, 'overlay-a').layerId).toBe('layer:z2:main')
    expect(authoredClip(after.record, 'overlay-a').startMs).toBe(11_037)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('lands an Alt same-Layer drag of a joined Clip on the rounded connected start (#1066)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-alt-move-connected'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    // x=30.77 asks for 3076.9999999999995 ms with Alt escaping the grid; the
    // connected component shifts rigidly to the rounded start.
    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('main'), 'dragover', 30.77, true)
    surface.fire(surface.lane('main'), 'drop', 30.77, true)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'move-connected', clipId: 'resize-a', startMs: 3_077 },
    ])
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(3_077)
    expect(authoredClip(after.record, 'resize-b').startMs).toBe(9_077)
    expect(after.record.composition.clips.map((clip) => clip.id))
      .toEqual(before.record.composition.clips.map((clip) => clip.id))
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })
})

/**
 * The joined-pair record plus an empty second Zone, built through the landed
 * Zone and Layer owners so every layout routes the new Zone - a hand-pushed
 * Zone stops the prepared Stage capture with `references missing zone` and
 * the gesture then captures nothing and submits nothing. One bottom main
 * Layer and no Clips, so a cross-Zone or collapsed-Zone drop of a free Clip
 * has a real target while every other authoring shape stays exactly the
 * Slice-1 one.
 */
function twoZoneV2Record(id: string): ShowRecordV2 {
  const zoned = editShowZoneV2(connectedV2Record(id), {
    kind: 'add', zone: { id: 'z2', name: 'Second', nominalPixelCount: 64 },
  })
  if (zoned.status !== 'changed') throw new Error(`add zone refused: ${zoned.status}`)
  const layered = editShowLayerV2(zoned.record, {
    kind: 'add', layer: { id: 'layer:z2:main', zoneId: 'z2', name: 'Main', rank: 0 },
  })
  if (layered.status !== 'changed') throw new Error(`add layer refused: ${layered.status}`)
  expect(validateShowRecordV2(layered.record)).toEqual([])
  return layered.record
}

/** Drop surface for the two-Zone record: lanes addressed by Zone and kind. */
function zoneDropSurface(clipId: string): DragSurface & {
  zoneLane(zoneId: string, kind: 'main' | 'overlay'): HTMLElement
  collapsedZone(zoneId: string): HTMLElement
} {
  const surface = dragSurface(clipId)
  return {
    ...surface,
    zoneLane(zoneId: string, kind: 'main' | 'overlay') {
      const lane = document.querySelector<HTMLElement>(
        `[data-show-zone-id="${zoneId}"][data-show-layer-kind="${kind}"]`,
      )
      if (!lane) throw new Error(`No ${kind} lane is rendered for Zone ${zoneId}.`)
      return lane
    },
    collapsedZone(zoneId: string) {
      const zone = document.querySelector<HTMLElement>(`[data-collapsed-zone="${zoneId}"]`)
      if (!zone) throw new Error(`No collapsed Zone ${zoneId} is rendered.`)
      return zone
    },
  }
}

// ── Slice-2 Clip delete (#1066) ────────────────────────────────────────────
// Clip delete on a v2-stored Show through the existing handlers: the inspector
// Delete control, keyboard Delete/Backspace on a selected Clip, and the
// connected-Transition confirmation. Every accepted delete is one history
// entry and one save; refusals write nothing and keep record identity; Undo
// restores the preimage and Redo the postimage; no legacy owner runs.

function deleteSubmissions() {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotClipDelete')
    .map((call) => ({ intent: call.request.intent, baseRevision: call.request.baseRevision }))
}

async function selectClipByName(name: string, index: number): Promise<void> {
  fireEvent.click(screen.getAllByRole('button', { name: `Select ${name}` })[index])
  await act(async () => {})
}

describe('v2 clip delete (#1066 slice 2)', () => {
  it('deletes a free Clip through the inspector Delete control', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice2-inspector-delete'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Delete clip TestPattern1D' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipDelete'])
    expect(deleteSubmissions()).toEqual([{ intent: { kind: 'delete-clip', clipId: 'overlay-a' }, baseRevision: 0 }])
    expect(after.record.composition.clips.some((clip) => clip.id === 'overlay-a')).toBe(false)
    expect(after.record.composition.clips.map((clip) => clip.id).sort()).toEqual(['resize-a', 'resize-b'])
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('deletes a free Clip through keyboard Delete', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice2-keyboard-delete'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()

    fireEvent.keyDown(document, { key: 'Delete' })
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipDelete'])
    expect(deleteSubmissions()).toEqual([{ intent: { kind: 'delete-clip', clipId: 'overlay-a' }, baseRevision: 0 }])
    expect(after.record.composition.clips.some((clip) => clip.id === 'overlay-a')).toBe(false)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('deletes a free Clip through keyboard Backspace', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice2-backspace-delete'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()

    fireEvent.keyDown(document, { key: 'Backspace' })
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipDelete'])
    expect(deleteSubmissions()).toEqual([{ intent: { kind: 'delete-clip', clipId: 'overlay-a' }, baseRevision: 0 }])
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('confirms a joined Clip before removing it with its Transition', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice2-connected-delete'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    const before = editor.state()
    expect(before.record.composition.transitions.map((transition) => transition.id)).toEqual(['join-a-b'])

    fireEvent.keyDown(document, { key: 'Delete' })
    await act(async () => {})

    expect(screen.getByRole('alertdialog', { name: 'Remove connected Clip?' })).toBeInTheDocument()
    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)

    fireEvent.click(screen.getByRole('button', { name: 'Remove Clip and Transition' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipDelete'])
    expect(deleteSubmissions()).toEqual([{ intent: { kind: 'delete-clip', clipId: 'resize-a' }, baseRevision: 0 }])
    expect(after.record.composition.clips.some((clip) => clip.id === 'resize-a')).toBe(false)
    expect(after.record.composition.transitions).toEqual([])
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('signals Keep one Clip when Delete targets the final remaining Clip', async () => {
    const single = connectedV2Record('slice2-final-clip')
    single.composition.clips = [single.composition.clips[0]]
    single.composition.transitions = []
    single.composition.propertyTracks = []
    const editor = openV2EditorForRecord(single)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const clipId = single.composition.clips[0].id
    fireEvent.click(document.querySelector<HTMLElement>(`[data-show-selection-key="clip:${clipId}"]`)!)
    await act(async () => {})
    const before = editor.state()

    fireEvent.keyDown(document, { key: 'Delete' })
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expect(after.record).toBe(before.record)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(after.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])
    expect(screen.getByTestId('show-clip-delete-blocked')).toHaveTextContent('Keep one Clip')
    expect(screen.getByRole('status', { name: 'Clip deletion unavailable' })).toHaveTextContent(
      'A Show must contain at least one Clip.',
    )
  })

  it('stops a converted-boundary-joined Clip at the connected dialog v1 never shows (#1068)', async () => {
    const record = connectedV2Record('slice2-boundary-dialog')
    const boundary = record.composition.transitions.find((transition) => transition.id === 'join-a-b')
    if (!boundary) throw new Error('No join-a-b Transition to reinterpret as a converted boundary.')
    record.composition.transitions = [{
      ...boundary,
      id: 'transition-scene-1',
      origin: 'converted-boundary-transition',
    }]
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    expect(screen.getAllByRole('button', { name: 'Select CometLoom' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Select TestPattern1D' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo Show edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo Show edit' })).toBeDisabled()
    await selectClipByName('CometLoom', 0)
    expect(screen.getByRole('button', { name: 'Delete clip CometLoom' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Delete' })
    await act(async () => {})

    expect(screen.getByRole('alertdialog', { name: 'Remove connected Clip?' })).toBeInTheDocument()
    const after = editor.state()
    expect(admission.calls).toEqual([])
    expect(after.record.composition.clips.map((clip) => clip.id).sort()).toEqual(['overlay-a', 'resize-a', 'resize-b'])
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(legacy.calls).toEqual([])
  })

  it('refuses a missing Clip with no write and keeps record identity', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice2-missing-clip'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const { useShowEditorViewStore: view } = await import('@/store/showEditorViewStore')
    act(() => { view.getState().setSelection({ kind: 'clip', clipId: 'missing' }) })
    await act(async () => {})
    const before = editor.state()

    fireEvent.keyDown(document, { key: 'Delete' })
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expect(after.record).toBe(before.record)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(legacy.calls).toEqual([])
  })
})
