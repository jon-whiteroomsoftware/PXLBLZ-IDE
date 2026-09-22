import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { validateShowRecordV2 } from '@/engine/showCompositionV2'
import { editShowTransitionV2 } from '@/engine/showTransitionsV2'
import { editShowZoneV2 } from '@/engine/showZonesV2'
import { editShowLayerV2 } from '@/engine/showLayersV2'
import { showBoundaryClipIdentity } from '@/engine/showClipIdentity'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { resizeBoundaryShow } from '@/agent-harness/baseline/fixtures'
import { duplicateShowClipAfter } from '@/engine/showTimelineClipAuthoring'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { commandFixtureV2 } from '@/engine/showCommandsV2/fixtures'
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
import * as download from '@/engine/browserDownload'
import { buildShowFileBundle, parseShowFileBundle } from '@/engine/showFileBundle'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowClipAppearanceEditIntentV2 } from '@/engine/showClipAppearanceEditsV2'
import type { ShowV2ClipInspectorInstanceIntent } from '@/engine/showV2ClipAppearancePlanning'

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
 * The slice-3 patch planner. Refused and no-op patches never reach an
 * admission door, so without this seam a refusal test could not tell a wired
 * refusal from a control that no longer calls anything. The real planner
 * still runs: a recorded call is a real plan.
 */
const planned = vi.hoisted(() => ({ calls: [] as Array<{ clipId: string; patch: Record<string, unknown> }> }))
vi.mock('@/engine/showV2ClipAppearancePlanning', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/showV2ClipAppearancePlanning')>()
  return {
    ...actual,
    planShowV2ClipInspectorPatch: (record: unknown, clipId: string, patch: Record<string, unknown>) => {
      planned.calls.push({ clipId, patch })
      return actual.planShowV2ClipInspectorPatch(
        record as never,
        clipId,
        patch as never,
      )
    },
  }
})

/**
 * The slice-6 show-level planner. Plans never reach a door on refusal or
 * no-op, so without this seam a refused plan could not be told apart from a
 * control that no longer plans at all. The real planners still run.
 */
const plannedShowLevel = vi.hoisted(() => ({ calls: [] as Array<{ fn: string }> }))
vi.mock('@/engine/showV2ShowLevelPlanning', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/showV2ShowLevelPlanning')>()
  const observed: Record<string, unknown> = { ...actual }
  for (const fn of ['planShowV2SetShowEnd', 'planShowV2TrailsEdit', 'planShowV2PortableReferenceEdit']) {
    const real = (actual as Record<string, unknown>)[fn]
    if (typeof real !== 'function') throw new Error(`No show-level planner named ${fn} to observe.`)
    observed[fn] = (...args: unknown[]) => {
      plannedShowLevel.calls.push({ fn })
      return (real as (...input: unknown[]) => unknown)(...args)
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
  planned.calls.length = 0
  plannedShowLevel.calls.length = 0
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

  it('duplicates a Clip on an Alt drag as a linked copy', async () => {
    const editor = openV2Editor('tracer-alt-duplicate')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const overlayLayerId = before.record.composition.layers.find((layer) => layer.id !== authoredClip(before.record, 'resize-a').layerId)!.id
    const sourceInstanceId = authoredClip(before.record, 'resize-a').instanceId
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0, true)
    surface.fire(surface.lane('overlay'), 'dragover', DROP_X, true)
    // The copy affordance is visible in the drag itself, before any owner runs.
    expect(surface.dataTransfer.dropEffect).toBe('copy')
    expect(screen.getByTestId('show-clip-move-preview')).toHaveAttribute('data-drag-mode', 'duplicate')
    surface.fire(surface.lane('overlay'), 'drop', DROP_X, true)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipSharingEdit'])
    const request = admission.calls[0].request as { intent: Record<string, unknown>; baseRevision: number }
    expect(request.intent).toMatchObject({
      kind: 'duplicate', clipId: 'resize-a', zoneId: 'z1', layerId: overlayLayerId, startMs: SETTLED_START_MS,
    })
    expect(request.baseRevision).toBe(0)
    // One more Clip; the source Clip unchanged in place and instance.
    expect(after.record.composition.clips).toHaveLength(before.record.composition.clips.length + 1)
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(0)
    expect(authoredClip(after.record, 'resize-a').layerId)
      .toBe(authoredClip(before.record, 'resize-a').layerId)
    expect(authoredClip(after.record, 'resize-a').instanceId).toBe(sourceInstanceId)
    const beforeIds = new Set(before.record.composition.clips.map((clip) => clip.id))
    const copies = after.record.composition.clips.filter((clip) => !beforeIds.has(clip.id))
    expect(copies).toHaveLength(1)
    // Linked by contract: the copy consumes the source's Pattern instance and
    // mints no runtime of its own.
    expect(copies[0].layerId).toBe(overlayLayerId)
    expect(copies[0].startMs).toBe(SETTLED_START_MS)
    expect(copies[0].instanceId).toBe(sourceInstanceId)
    expect(after.record.composition.patternInstances).toHaveLength(before.record.composition.patternInstances.length)
    expectOneEdit(before, after)
    // The copy is selected after the drop.
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'clip', clipId: copies[0].id })
    // Undo restores the preimage composition exactly - including the original
    // Clip count - and Redo restores the edit.
    await expectUndoRedoExact(editor, before)
  })

  it('refuses an Alt duplicate drag of a Group occurrence Clip', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-alt-duplicate'
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('clip')
    const groupClip = document.querySelector<HTMLElement>('[data-show-group-occurrence="occ-0"]')
    if (!groupClip) throw new Error('No rendered Group occurrence Clip to drag.')

    surface.fire(groupClip, 'dragstart', 0, true)
    surface.fire(surface.lane('main'), 'dragover', DROP_X, true)
    surface.fire(surface.lane('main'), 'drop', DROP_X, true)
    await act(async () => {})

    const after = editor.state()
    // A Group Clip use is inert to drags: the gesture starts nothing, so the
    // drop target reads `none` and no owner is reached.
    expect(surface.dataTransfer.dropEffect).toBe('none')
    expectNoWrite(before, after)
    expect(after.record.composition.clips).toHaveLength(before.record.composition.clips.length)
  })

  it('duplicates a Clip onto a collapsed Zone as a linked copy', async () => {
    const editor = openV2EditorForRecord(twoZoneV2Record('tracer-alt-collapsed-duplicate'))
    useShowEditorSessionStore.getState().setZoneCollapsed(editor.showId, 'z2', true)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const sourceInstanceId = authoredClip(before.record, 'overlay-a').instanceId
    const surface = zoneDropSurface('overlay-a')
    const collapsed = surface.collapsedZone('z2')
    vi.spyOn(collapsed, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 200, top: 0, bottom: 28, width: 200, height: 28, x: 0, y: 0, toJSON() {},
    })

    // x=110 asks for 11000 ms on the collapsed Zone, which lands on its
    // bottom main Layer.
    surface.fire(surface.clip, 'dragstart', 0, true)
    surface.fire(collapsed, 'dragover', 110, true)
    surface.fire(collapsed, 'drop', 110, true)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipSharingEdit'])
    const request = admission.calls[0].request as { intent: Record<string, unknown>; baseRevision: number }
    expect(request.intent).toMatchObject({
      kind: 'duplicate', clipId: 'overlay-a', zoneId: 'z2', layerId: 'layer:z2:main', startMs: 11_000,
    })
    expect(request.baseRevision).toBe(0)
    expect(after.record.composition.clips).toHaveLength(before.record.composition.clips.length + 1)
    expect(authoredClip(after.record, 'overlay-a').startMs).toBe(12_000)
    const beforeIds = new Set(before.record.composition.clips.map((clip) => clip.id))
    const copies = after.record.composition.clips.filter((clip) => !beforeIds.has(clip.id))
    expect(copies).toHaveLength(1)
    expect(copies[0].zoneId).toBe('z2')
    expect(copies[0].layerId).toBe('layer:z2:main')
    expect(copies[0].startMs).toBe(11_000)
    expect(copies[0].instanceId).toBe(sourceInstanceId)
    expect(after.record.composition.patternInstances).toHaveLength(before.record.composition.patternInstances.length)
    expectOneEdit(before, after)
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'clip', clipId: copies[0].id })
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
        kind: 'replace-placement', clipId: 'resize-a', zoneId: 'z1', layerId: overlayLayerId, startMs: SETTLED_START_MS, detachParticipantTransitions: true,
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

  it('settles a converted-boundary-joined Clip at its explicit start with the window reclaimed (#1068)', async () => {
    // join-a-b is exact (resize-a ends 5000, resize-b starts 7000, 2000 ms
    // crossfade), so reinterpreting it as a converted boundary gives a ready
    // repair with window [5000, 7000). The drop paints startMs 8000 and the
    // Clip must land at exactly 8000 — not 6000 — while the window reclaims.
    const record = connectedV2Record('tracer-boundary-drop')
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
    const before = editor.state()
    const overlayLayerId = before.record.composition.layers.find((layer) => layer.id !== authoredClip(before.record, 'resize-b').layerId)!.id
    const surface = dragSurface('resize-b')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('overlay'), 'dragover', 80)
    surface.fire(surface.lane('overlay'), 'drop', 80)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: {
        kind: 'replace-placement', clipId: 'resize-b', zoneId: 'z1', layerId: overlayLayerId, startMs: 8_000, detachParticipantTransitions: true,
      },
      baseRevision: 0,
    }])
    // Post-repair coordinates: the Clip is where it was dropped. A preimage
    // repair shift would leave it at 6000 instead.
    expect(authoredClip(after.record, 'resize-b').layerId).toBe(overlayLayerId)
    expect(authoredClip(after.record, 'resize-b').startMs).toBe(8_000)
    // The boundary window still reclaims: Show End shrinks by its duration and
    // downstream content rides the repair.
    expect(after.record.composition.showEndMs).toBe(before.record.composition.showEndMs - 2_000)
    expect(authoredClip(after.record, 'overlay-a').startMs).toBe(
      authoredClip(before.record, 'overlay-a').startMs - 2_000,
    )
    expectOneEdit(before, after)
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

  it('reads every advanced row the v1 panel draws from the authored record; only settings write', async () => {
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

    // The settings write is connected (#1066 slice 5a); the repeat-scale
    // descriptor row stays unconnected and resolves as an internal
    // no-change result.
    fireEvent.click(within(advanced).getByRole('checkbox', { name: 'Animate speed for main' }))
    await act(async () => {})

    expectNoWrite(before, editor.state())
    // The panel is still open and still reads the authored settings.
    expect(within(boundaryPanel()).getByRole('combobox', { name: 'Crossfade source' }))
      .toHaveValue('snapshot-live')
  })

  it('writes a Crossfade source change through the transition-edit door', async () => {
    const { record } = convertedAdvancedBoundary('tracer-boundary-settings-write')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between CometLoom and CometLoom',
    }))
    await act(async () => {})

    const panel = boundaryPanel()
    expect(within(panel).getByRole('combobox', { name: 'Crossfade source' })).toHaveValue('snapshot-live')

    fireEvent.change(within(panel).getByRole('combobox', { name: 'Crossfade source' }), {
      target: { value: 'live-live' },
    })
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    const request = admission.calls[0].request as {
      intent: { kind: string; transition: { crossfadePolicy?: string } }
      baseRevision: number
    }
    expect(request.intent.kind).toBe('update-transition')
    expect(request.intent.transition.crossfadePolicy).toBe('live-live')
    expect(request.baseRevision).toBe(0)
    expectOneEdit(before, after)
    expect(within(boundaryPanel()).getByRole('combobox', { name: 'Crossfade source' }))
      .toHaveValue('live-live')
  })

  it('removes a boundary Transition to a Cut through the transition-edit door', async () => {
    const { record } = convertedFreshBoundary('tracer-boundary-remove')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))
    await act(async () => {})

    fireEvent.click(within(boundaryPanel()).getByRole('button', { name: 'Reset transition to cut' }))
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    const request = admission.calls[0].request as {
      intent: { kind: string; transitionId: string }
      baseRevision: number
    }
    expect(request.intent).toEqual({ kind: 'reset-to-cut', transitionId: record.composition.transitions[0].id })
    expect(request.baseRevision).toBe(0)
    expectOneEdit(before, editor.state())
    expect(editor.state().record.composition.transitions).toEqual([])
    expect(screen.queryByRole('region', { name: 'Transition properties' })).not.toBeInTheDocument()
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

  it('applies a palette choice through the transition-edit door', async () => {
    const { record } = convertedFreshBoundary('tracer-boundary-palette-apply')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))
    await act(async () => {})
    fireEvent.click(within(boundaryPanel()).getByRole('button', { name: /Change$/ }))
    await act(async () => {})

    const palette = screen.getByRole('dialog', { name: 'Choose Transition' })
    fireEvent.click(within(palette).getByRole('button', { name: 'Use Block Transition' }))
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    const request = admission.calls[0].request as {
      intent: { kind: string; transition: { kind?: string; dissolveVariant?: string } }
      baseRevision: number
    }
    expect(request.intent.kind).toBe('update-transition')
    expect(request.intent.transition.kind).toBe('dither')
    expect(request.intent.transition.dissolveVariant).toBe('block')
    expectOneEdit(before, editor.state())
    expect(screen.queryByRole('dialog', { name: 'Choose Transition' })).not.toBeInTheDocument()
  })

  it('applies a palette choice to a native whole-output Transition in one history entry (#1066 slice 5b-2)', async () => {
    const { record } = nativeWholeOutputBoundary('tracer-boundary-palette-apply-native')
    // The fixture's Transition already holds the palette Duration (2000 ms),
    // so shrink it first: the Block choice below then carries a new Duration,
    // which is the refused-then-accepted path this slice owns.
    expect(record.composition.transitions).toHaveLength(1)
    const transitionId = record.composition.transitions[0].id
    expect(record.composition.transitions[0].durationMs).toBe(2_000)
    const resized = editShowTransitionV2(record, { kind: 'resize-transition', transitionId, durationMs: 1_000 })
    expect(resized.status).toBe('changed')
    if (resized.status !== 'changed') throw new Error(JSON.stringify(resized))
    const editor = openV2EditorForRecord(resized.record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))
    await act(async () => {})
    fireEvent.click(within(boundaryPanel()).getByRole('button', { name: /Change$/ }))
    await act(async () => {})

    const palette = screen.getByRole('dialog', { name: 'Choose Transition' })
    fireEvent.click(within(palette).getByRole('button', { name: 'Use Block Transition' }))
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    const request = admission.calls[0].request as {
      intent: { kind: string; transition: { kind?: string; dissolveVariant?: string } }
      baseRevision: number
    }
    expect(request.intent.kind).toBe('update-transition')
    expect(request.intent.transition.kind).toBe('dither')
    expect(request.intent.transition.dissolveVariant).toBe('block')
    expectOneEdit(before, editor.state())
    expect(screen.queryByRole('dialog', { name: 'Choose Transition' })).not.toBeInTheDocument()
  })

  /**
   * A converted one-sided boundary (#1068): the converter admits an empty
   * contributor side, and the empty side is the compiler-owned Empty.
   */
  function convertedOneSidedBoundary(id: string, variant: 'fade-out' | 'fade-in' | 'empty-both'): ShowRecordV2 {
    const source = convertibleV1Show()
    source.id = id
    source.stageMapId = 'plane'
    source.composition!.durationMs = 11000
    source.scenes = [
      { id: 'scene-a', name: 'Outgoing', durationMs: 5000 },
      { id: 'scene-b', name: 'Incoming', durationMs: 5000 },
    ]
    source.composition!.patternInstances = [
      { id: 'out-instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Outgoing', time: { timeScale: 1, timeOffsetMs: 0 } },
      { id: 'in-instance', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Incoming', time: { timeScale: 1, timeOffsetMs: 0 } },
    ]
    const outgoing = variant === 'fade-in' ? [] : [{
      id: 'out', instanceId: 'out-instance', startMs: 0, durationMs: variant === 'empty-both' ? 1000 : 5000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }]
    const incoming = variant === 'fade-out' || variant === 'empty-both' ? [] : [{
      id: 'in', instanceId: 'in-instance', startMs: 0, durationMs: 5000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }]
    source.composition!.scenes = [
      { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: outgoing, overlays: [] }] },
      { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: incoming, overlays: [] }] },
    ]
    source.transitions = [{
      id: 't1', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 1000,
      easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
    }]
    const result = convertShowRecordV1ToV2(source)
    if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
    expect(validateShowRecordV2(result.record), `${source.id} converted`).toEqual([])
    return result.record
  }

  it('renders a one-sided fade-out boundary once selected, with the empty side as Empty', async () => {
    const record = convertedOneSidedBoundary('tracer-boundary-fade-out', 'fade-out')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    // No junction is drawn for a one-sided boundary (reported gap for Jon),
    // so no click can reach this Transition yet. The panel is opened on the
    // neighbouring Clip through the real gesture, then the selection below —
    // the exact identity a future junction would produce — retargets the open
    // panel. That proves the inspector half end to end: projection, memo,
    // selection branch, panel, palette gate.
    expect(screen.queryByRole('region', { name: 'Transition properties' })).not.toBeInTheDocument()
    await selectClipByName('Outgoing', 0)
    act(() => { useShowEditorViewStore.getState().setSelection({ kind: 'transition', transitionId: 't1' }) })
    await act(async () => {})

    const panel = boundaryPanel()
    // The empty destination side renders as the compiler-owned Empty: the
    // panel draws its heading, Change entry and crossfade controls with no
    // destination rows, rather than refusing the selection.
    expect(within(panel).getByRole('button', { name: /Change$/ })).toBeEnabled()
    expect(within(panel).getByRole('combobox', { name: 'Crossfade source' })).toHaveValue('snapshot-live')

    fireEvent.click(within(panel).getByRole('button', { name: /Change$/ }))
    await act(async () => {})
    const palette = screen.getByRole('dialog', { name: 'Choose Transition' })
    expect(within(palette).getByRole('button', { name: 'Use Crossfade Transition' })).toBeEnabled()

    expectNoWrite(before, editor.state())
  })
})

describe('v2 Layer Transition popover (#1065)', () => {
  it('reads a converted Layer Transition through the existing popover', async () => {
    const record = convertedLayerTransitions('tracer-layer-popover')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)

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
    expect(within(popover).getByRole('button', { name: 'Reset to Cut' })).toBeEnabled()
    expect(screen.queryByRole('region', { name: 'Transition properties' })).not.toBeInTheDocument()
  })

  it('retimes a converted Layer Transition through the existing popover', async () => {
    const record = convertedLayerTransitions('tracer-layer-resize')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit wipe Transition between EventHorizon and SignalMandala',
    }))
    await act(async () => {})
    const popover = screen.getByRole('dialog', { name: 'Layer Transition Details' })
    const duration = within(popover).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' })
    fireEvent.change(duration, { target: { value: '0.5' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-transition', transitionId: 'transition-horizon-mandala', durationMs: 500 },
    ])
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Layer Transition Details' })).not.toBeInTheDocument()
    expect(after.record.composition.transitions.find((transition) => transition.id === 'transition-horizon-mandala')?.durationMs).toBe(500)
  })

  it('keeps the popover open when the door refuses a retime, as v1 does', async () => {
    const record = convertedLayerTransitions('tracer-layer-resize-refused')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit wipe Transition between EventHorizon and SignalMandala',
    }))
    await act(async () => {})
    const popover = screen.getByRole('dialog', { name: 'Layer Transition Details' })
    const duration = within(popover).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' })
    // SignalMandala ends under a second before Show End, so a 3 s wipe would
    // push it past Show End and the owner refuses.
    fireEvent.change(duration, { target: { value: '3' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})

    // The door is reached and refuses; nothing is adopted or saved.
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    const after = editor.state()
    expect(after.record).toBe(before.record)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(screen.getByRole('dialog', { name: 'Layer Transition Details' })).toBeInTheDocument()
  })

  it('resets a converted Layer Transition to Cut through the existing popover', async () => {
    const record = convertedLayerTransitions('tracer-layer-reset')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit wipe Transition between EventHorizon and SignalMandala',
    }))
    await act(async () => {})
    const popover = screen.getByRole('dialog', { name: 'Layer Transition Details' })
    fireEvent.click(within(popover).getByRole('button', { name: 'Reset to Cut' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'reset-to-cut', transitionId: 'transition-horizon-mandala' },
    ])
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Layer Transition Details' })).not.toBeInTheDocument()
    expect(after.record.composition.transitions.some((transition) => transition.id === 'transition-horizon-mandala')).toBe(false)
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
function connectedV1Record(id: string): ShowRecord {
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
  return source
}

function connectedV2Record(id: string): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(connectedV1Record(id))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(validateShowRecordV2(converted.record)).toEqual([])
  return converted.record
}

function v2TracerV1Record(id: string): ShowRecord {
  return connectedV1Record(id)
}

/**
 * Slice-3 Place tests need the 2D Stage the browser seed carries
 * (`stageMapId: 'plane'`): the Place tab is only applicable on a 2D Stage,
 * whichever record backs the editor (#1065).
 */
function stagedV2Record(id: string): ShowRecordV2 {
  const record = connectedV2Record(id)
  const staged = { ...record, stageMapId: 'plane' }
  expect(validateShowRecordV2(staged)).toEqual([])
  return staged
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

describe('v2 converted-boundary resize repair (#1068)', () => {
  it('repairs an Alt resize that pulls a converted-boundary leading edge away (#1068)', async () => {
    const { record } = convertedFreshBoundary('slice1-boundary-alt-away')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const clipId = convertedClipIdByPattern(record, 'CometLoom')
    // CometLoom starts at 32000 on a 200 px / 62000 ms lane, so +10 px asks
    // for 35100: away from the incoming converted-boundary window. The
    // connected leading form now carries the #1068 repair in the same edit:
    // the requested trim, the boundary record replaced by the cut adjacency,
    // and Show End reclaimed by the 2000 ms window.
    await resizeDrag('CometLoom', 'start', 0, 70, 80)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-leading', clipId, startMs: 35_100 },
    ])
    expect(authoredClip(after.record, clipId).startMs).toBe(33_100)
    expect(authoredClip(after.record, clipId).durationMs).toBe(26_900)
    expect(after.record.composition.transitions).toEqual([])
    expect(after.record.composition.showEndMs).toBe(60_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('repairs the same boundary-away resize without Alt (#1068)', async () => {
    const { record } = convertedFreshBoundary('slice1-boundary-plain-away')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const clipId = convertedClipIdByPattern(record, 'CometLoom')
    // 62 ms per px on the wide lane: +50 px asks for 35100, which the plain
    // pointer quantizes to the grid step at 35000 - still away from the
    // incoming converted-boundary window, so it repairs exactly as Alt.
    await resizeDrag('CometLoom', 'start', 0, 350, 400, false, 1000)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-leading', clipId, startMs: 35_000 },
    ])
    expect(authoredClip(after.record, clipId).startMs).toBe(33_000)
    expect(authoredClip(after.record, clipId).durationMs).toBe(27_000)
    expect(after.record.composition.transitions).toEqual([])
    expect(after.record.composition.showEndMs).toBe(60_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('repairs an Alt resize that pulls a converted-boundary trailing edge away (#1068)', async () => {
    const { record } = convertedFreshBoundary('slice1-boundary-trailing-away')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const clipId = convertedClipIdByPattern(record, 'TestPattern1D')
    // -10 px asks for end 26900: away from the outgoing converted-boundary
    // window, repaired in the same connected trailing form: the requested
    // trim, the boundary record dropped, and Show End reclaimed.
    await resizeDrag('TestPattern1D', 'end', 0, 70, 60)

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-trailing', clipId, endMs: 26_900 },
    ])
    expect(authoredClip(after.record, clipId).startMs).toBe(0)
    expect(authoredClip(after.record, clipId).durationMs).toBe(26_900)
    const rightId = convertedClipIdByPattern(record, 'CometLoom')
    expect(authoredClip(after.record, rightId).startMs).toBe(30_000)
    expect(after.record.composition.transitions).toEqual([])
    expect(after.record.composition.showEndMs).toBe(60_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('refuses a resize that grows a converted-boundary Clip into the boundary (#1068)', async () => {
    const { record } = convertedFreshBoundary('slice1-boundary-toward')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const clipId = convertedClipIdByPattern(record, 'CometLoom')
    // -1 px asks for 31690: toward the incoming window, which would grow the
    // Clip into the converted boundary. Both owners refuse that extension as
    // invalid-topology, so the planner refuses before any submission: no
    // preview, no write, record identity kept.
    await resizeDrag('CometLoom', 'start', 0, 70, 69)

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expectNoWrite(before, after)
    expect(authoredClip(after.record, clipId).startMs).toBe(32_000)
    expect(after.record.composition.transitions).toHaveLength(1)
    expect(after.record.composition.transitions[0].durationMs).toBe(2_000)
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

  it('detaches the Transition on a cross-Layer drop of a joined Clip (#1068 gap 2)', async () => {
    // Rewriting this refusal is the point of the slice, not a weakening of it:
    // gap 2 turns the connected-reroute refusal into a detach-and-move through
    // the clip-temporal door — one edit, one history entry and one save.
    const editor = openV2EditorForRecord(connectedV2Record('slice1-connected-reroute'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const zoneId = authoredClip(before.record, 'resize-a').zoneId
    const overlayLayerId = before.record.composition.layers.find((layer) => layer.id !== authoredClip(before.record, 'resize-a').layerId)!.id
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('overlay'), 'dragover', DROP_X)
    surface.fire(surface.lane('overlay'), 'drop', DROP_X)
    await act(async () => {})

    const after = editor.state()
    // DROP_X asks for 4000, but the dragged end magnetizes to the former join
    // partner's start (7000), so the Clip settles at 3000 on the overlay.
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: {
        kind: 'replace-placement', clipId: 'resize-a', zoneId, layerId: overlayLayerId, startMs: 3_000, detachParticipantTransitions: true,
      },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'resize-a').layerId).toBe(overlayLayerId)
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(3_000)
    // Only the dragged Clip moves: the former join partner stays and the join is gone.
    expect(authoredClip(after.record, 'resize-b').startMs).toBe(7_000)
    expect(after.record.composition.transitions).toEqual([])
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
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
        kind: 'replace-placement', clipId: 'overlay-a', zoneId: 'z2', layerId: 'layer:z2:main', startMs: 11_000, detachParticipantTransitions: true,
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
        kind: 'replace-placement', clipId: 'overlay-a', zoneId: 'z2', layerId: 'layer:z2:main', startMs: 11_000, detachParticipantTransitions: true,
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
        kind: 'replace-placement', clipId: 'resize-a', zoneId: 'z1', layerId: overlayLayerId, startMs: 4_037, detachParticipantTransitions: true,
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
        kind: 'replace-placement', clipId: 'overlay-a', zoneId: 'z2', layerId: 'layer:z2:main', startMs: 11_037, detachParticipantTransitions: true,
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
        kind: 'replace-placement', clipId: 'overlay-a', zoneId: 'z2', layerId: 'layer:z2:main', startMs: 11_037, detachParticipantTransitions: true,
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

  it('deletes a converted-boundary-joined Clip without the connected dialog, as v1 does (#1068)', async () => {
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

    expect(screen.queryByRole('alertdialog', { name: 'Remove connected Clip?' })).not.toBeInTheDocument()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipDelete'])
    expect(deleteSubmissions()).toEqual([{ intent: { kind: 'delete-clip', clipId: 'resize-a' }, baseRevision: 0 }])
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

// ── Slice-3 Clip appearance (#1066) ────────────────────────────────────────
// The Clip detail panel's appearance surface on a v2-stored Show through the
// v2 inspector commit: brightness, opacity, phase, mirror, transform,
// aperture, presentation, blink and the Effects stack through the appearance
// door; speed, control targets, stepped clock and evaluation through the
// instance-properties door. Every accepted edit is one history entry and one
// save; refusals and no-ops write nothing and keep record identity; Undo and
// Redo are exact; no legacy owner runs. Each control is driven as the user
// would drive it, and the test fails if the drive does not reach the
// admission exactly once.

function appearanceSubmissions(): Array<{ intent: ShowClipAppearanceEditIntentV2; baseRevision: number }> {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotAppearanceEdit')
    .map((call) => ({
      intent: call.request.intent as ShowClipAppearanceEditIntentV2,
      baseRevision: call.request.baseRevision as number,
    }))
}

function instanceSubmissions(): Array<{ intent: ShowV2ClipInspectorInstanceIntent; baseRevision: number }> {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotInstanceProperties')
    .map((call) => ({
      intent: call.request.intent as ShowV2ClipInspectorInstanceIntent,
      baseRevision: call.request.baseRevision as number,
    }))
}

function entryPolicySubmissions(): Array<{ intent: unknown; baseRevision: number }> {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotClipEntryPolicy')
    .map((call) => ({ intent: call.request.intent, baseRevision: call.request.baseRevision as number }))
}

function replacementSubmissions(): Array<{ intent: Record<string, unknown>; baseRevision: number }> {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotClipReplacementEdit')
    .map((call) => ({
      intent: call.request.intent as Record<string, unknown>,
      baseRevision: call.request.baseRevision as number,
    }))
}

function pickSourcePattern(optionName: string): void {
  const pattern = screen.getByRole('combobox', { name: 'Source pattern' })
  fireEvent.focus(pattern)
  fireEvent.change(pattern, { target: { value: optionName.toLocaleLowerCase() } })
  const option = screen.queryByRole('option', { name: optionName })
  if (option) fireEvent.click(option)
}

function showTab(name: 'Pattern' | 'Place' | 'Effects' | 'Playback'): void {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }))
}

function typeAndCommit(name: string, text: string): void {
  const field = screen.getByRole('textbox', { name })
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key: 'Enter' })
}

function chooseOption(name: string, optionValue: string): void {
  fireEvent.change(screen.getByRole('combobox', { name }), { target: { value: optionValue } })
}

async function addEffectThroughPalette(label: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Add Effect' }))
  fireEvent.click(screen.getByRole('button', { name: `Add ${label} Effect` }))
  await act(async () => {})
}

function openEffectMenu(label: string, scope?: HTMLElement): void {
  const root = scope ?? document.body
  const trigger = within(root as HTMLElement).getByRole('button', { name: `More actions for ${label} Effect` });
  fireEvent.click(trigger)
}

async function authoredClipValue(showId: string, clipId: string) {
  const { projectShowEditorInspectorPresentationV2 } = await import('@/engine/showEditorInspectorPresentation')
  const record = useShowStore.getState().showV2Pilots[showId]
  return projectShowEditorInspectorPresentationV2(record, 0)!.clipsById[clipId].value
}

describe('v2 clip appearance (#1066 slice 3)', () => {
  it('stores header Brightness through the appearance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-brightness'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()

    typeAndCommit('Brightness exact percentage', '63')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotAppearanceEdit'])
    expect(appearanceSubmissions()).toEqual([{
      intent: { kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip', patch: { view: { brightness: 0.63 } } },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).view.brightness).toBe(0.63)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('stores header Opacity through the appearance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-opacity'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()

    typeAndCommit('Opacity exact percentage', '50')
    await act(async () => {})

    const after = editor.state()
    expect(appearanceSubmissions()).toEqual([{
      intent: { kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip', patch: { opacity: 0.5 } },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).local.opacity).toBe(0.5)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('stores Pattern-tab Speed through the instance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-speed'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')
    const before = editor.state()

    typeAndCommit('Animation speed exact multiplier', '2')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotInstanceProperties'])
    expect(instanceSubmissions()).toEqual([{
      intent: { clipId: 'resize-a', properties: { time_scale: 2 } },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'resize-a')).simulation.timeScale).toBe(2)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('enables a Pattern control target through the instance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-control-enable'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')
    const before = editor.state()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})

    const after = editor.state()
    expect(instanceSubmissions()).toEqual([{
      intent: { clipId: 'resize-a', properties: { controls: { sliderSpeed: 0.5 } } },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'resize-a')).simulation.controlTargets).toEqual({ sliderSpeed: 0.5 })
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('edits a Pattern control target value through the instance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-control-value'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})

    typeAndCommit('Speed target exact percentage', '75')
    await act(async () => {})

    const after = editor.state()
    expect(instanceSubmissions()).toEqual([
      { intent: { clipId: 'resize-a', properties: { controls: { sliderSpeed: 0.5 } } }, baseRevision: 0 },
      { intent: { clipId: 'resize-a', properties: { controls: { sliderSpeed: 0.75 } } }, baseRevision: 1 },
    ])
    expect((await authoredClipValue(editor.showId, 'resize-a')).simulation.controlTargets).toEqual({ sliderSpeed: 0.75 })
    expect(after.history.past).toHaveLength(2)
    expect(after.v2Writes).toBe(2)
    expect(legacy.calls).toEqual([])
    expect(planned.calls).toHaveLength(2)
  })

  it('refuses a Pattern control target removal with no write', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-control-remove'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})
    const enabled = editor.state()
    expect(instanceSubmissions()).toHaveLength(1)

    // Unchecking deletes the target, which the merge owner cannot express:
    // the removal submits nothing and the enabled record stands.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})

    const after = editor.state()
    expect(instanceSubmissions()).toHaveLength(1)
    expect(planned.calls).toHaveLength(2)
    expect(after.record).toBe(enabled.record)
    expect(after.history).toEqual(enabled.history)
    expect(after.v2Writes).toBe(enabled.v2Writes)
    expect(legacy.calls).toEqual([])
    expect((await authoredClipValue(editor.showId, 'resize-a')).simulation.controlTargets).toEqual({ sliderSpeed: 0.5 })
  })

  it('checks and clears the stutter clock through the instance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-stutter'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Stutter Pattern clock' }))
    await act(async () => {})

    expect(instanceSubmissions()).toEqual([{
      intent: { clipId: 'resize-a', properties: { stepped_clock: { stepMs: 250 } } },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'resize-a')).simulation.steppedClock).toEqual({ stepMs: 250 })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Stutter Pattern clock' }))
    await act(async () => {})

    const after = editor.state()
    expect(instanceSubmissions()).toEqual([
      { intent: { clipId: 'resize-a', properties: { stepped_clock: { stepMs: 250 } } }, baseRevision: 0 },
      { intent: { clipId: 'resize-a', properties: { stepped_clock: null } }, baseRevision: 1 },
    ])
    expect((await authoredClipValue(editor.showId, 'resize-a')).simulation.steppedClock).toBeUndefined()
    expect(after.history.past).toHaveLength(2)
    expect(after.v2Writes).toBe(2)
    expect(legacy.calls).toEqual([])
  })

  it('stores Playback evaluation through the instance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-evaluation'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Playback')
    const before = editor.state()

    chooseOption('Clip evaluation', 'freeze-at-entry')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotInstanceProperties'])
    expect(instanceSubmissions()).toEqual([{
      intent: { clipId: 'overlay-a', properties: { evaluation: 'freeze-at-entry' } },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).evaluationPolicy).toBe('freeze-at-entry')
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('stores Playback phase through the appearance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-phase'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Playback')
    const before = editor.state()

    typeAndCommit('Phase exact phase', '0.5')
    await act(async () => {})

    const after = editor.state()
    expect(appearanceSubmissions()).toEqual([{
      intent: { kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip', patch: { view: { phase: 0.5 } } },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).view.phase).toBe(0.5)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('stores a strobe presentation through the appearance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-presentation'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Playback')
    const before = editor.state()

    chooseOption('Clip presentation', 'strobe')
    await act(async () => {})

    const after = editor.state()
    expect(appearanceSubmissions()).toEqual([{
      intent: {
        kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip',
        patch: { presentation: { mode: 'strobe', cadenceMs: 1_000 } },
      },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).presentation).toEqual({ mode: 'strobe', cadenceMs: 1_000 })
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('enables Blink through the appearance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-blink'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Playback')
    const before = editor.state()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Blink Clip output' }))
    await act(async () => {})

    const after = editor.state()
    expect(appearanceSubmissions()).toEqual([{
      intent: {
        kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip',
        patch: { blink: { rateHz: 2, duty: 0.5, phase: 0 } },
      },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).blink).toEqual({ rateHz: 2, duty: 0.5, phase: 0 })
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('stores Place Content X through the appearance door', async () => {
    const editor = openV2EditorForRecord(stagedV2Record('slice3-transform-x'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Place')
    const before = editor.state()

    typeAndCommit('Content X exact position', '0.25')
    await act(async () => {})

    const after = editor.state()
    expect(appearanceSubmissions()).toEqual([{
      intent: { kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip', patch: { transform: { positionX: 0.25 } } },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).transform.positionX).toBe(0.25)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('stores Place rotation through the appearance door', async () => {
    const editor = openV2EditorForRecord(stagedV2Record('slice3-rotation'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Place')
    const before = editor.state()

    typeAndCommit('Rotation exact rotation', '-90')
    await act(async () => {})

    const after = editor.state()
    expect(appearanceSubmissions()).toEqual([{
      intent: { kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip', patch: { transform: { rotation: -0.25 } } },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).transform.rotation).toBe(-0.25)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('enables the aperture from the Place summary through the appearance door', async () => {
    const editor = openV2EditorForRecord(stagedV2Record('slice3-aperture-enable'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Place')
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotAppearanceEdit'])
    expect(appearanceSubmissions()).toHaveLength(1)
    const [submission] = appearanceSubmissions()
    expect(submission.baseRevision).toBe(0)
    expect(submission.intent.kind).toBe('appearance')
    expect(submission.intent.scope).toBe('whole-clip')
    if (submission.intent.kind !== 'appearance') throw new Error('Expected an appearance intent.')
    expect(submission.intent.patch.aperture).toMatchObject({ enabled: true })
    expect((await authoredClipValue(editor.showId, 'overlay-a')).viewport.enabled).toBe(true)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('stores an ellipse silhouette and edge width through the appearance door', async () => {
    const editor = openV2EditorForRecord(stagedV2Record('slice3-aperture-shape'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Place')

    fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' }))
    await act(async () => {})
    chooseOption('Aperture shape', 'ellipse')
    await act(async () => {})

    expect(appearanceSubmissions()).toHaveLength(2)
    const [, shape] = appearanceSubmissions()
    expect(shape.baseRevision).toBe(1)
    if (shape.intent.kind !== 'appearance') throw new Error('Expected an appearance intent.')
    expect(shape.intent.patch.aperture).toMatchObject({ aperture: 'ellipse' })
    expect((await authoredClipValue(editor.showId, 'overlay-a')).viewport.aperture).toBe('ellipse')

    typeAndCommit('Aperture edge width', '0.1')
    await act(async () => {})

    const submissions = appearanceSubmissions()
    expect(submissions).toHaveLength(3)
    const [, , feather] = submissions
    expect(feather.baseRevision).toBe(2)
    if (feather.intent.kind !== 'appearance') throw new Error('Expected an appearance intent.')
    expect(feather.intent.patch).toEqual({ aperture: { feather: 0.1 } })
    expect((await authoredClipValue(editor.showId, 'overlay-a')).viewport.feather).toBe(0.1)
    const after = editor.state()
    expect(after.history.past).toHaveLength(3)
    expect(after.v2Writes).toBe(3)
    expect(legacy.calls).toEqual([])
  })

  it('adds a Ripple Effect through the palette and the appearance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-effect-add'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Effects')
    const before = editor.state()

    await addEffectThroughPalette('Ripple')

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotAppearanceEdit'])
    expect(appearanceSubmissions()).toHaveLength(1)
    const [submission] = appearanceSubmissions()
    expect(submission.baseRevision).toBe(0)
    if (submission.intent.kind !== 'add-effect' || submission.intent.scope !== 'whole-clip') {
      throw new Error('Expected a whole-Clip add-effect intent.')
    }
    expect(submission.intent.effect.id).toBe('ripple')
    expect(submission.intent.effect.kind).toBe('ripple')
    expect((await authoredClipValue(editor.showId, 'overlay-a')).effects.map((effect) => effect.id)).toEqual(['ripple'])
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('edits a Ripple parameter through the appearance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-effect-param'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Effects')

    await addEffectThroughPalette('Ripple')
    typeAndCommit('Amount', '0.2')
    await act(async () => {})

    expect(appearanceSubmissions()).toHaveLength(2)
    const [, param] = appearanceSubmissions()
    expect(param).toEqual({
      intent: {
        kind: 'update-effect', clipId: 'overlay-a', scope: 'whole-clip',
        effectId: 'ripple', effectKind: 'ripple', parameter: 'amount', value: 0.2,
      },
      baseRevision: 1,
    })
    const after = editor.state()
    expect(after.history.past).toHaveLength(2)
    expect(after.v2Writes).toBe(2)
    expect(legacy.calls).toEqual([])
  })

  it('removes one Effect and leaves the Clip through the appearance door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-effect-remove'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Effects')

    await addEffectThroughPalette('Ripple')
    openEffectMenu('Ripple')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Ripple Effect' }))
    await act(async () => {})

    expect(appearanceSubmissions()).toHaveLength(2)
    const [, removal] = appearanceSubmissions()
    expect(removal).toEqual({
      intent: { kind: 'remove-effect', clipId: 'overlay-a', scope: 'whole-clip', effectId: 'ripple', effectKind: 'ripple' },
      baseRevision: 1,
    })
    expect((await authoredClipValue(editor.showId, 'overlay-a')).effects).toEqual([])
    const after = editor.state()
    expect(after.history.past).toHaveLength(2)
    expect(after.v2Writes).toBe(2)
    expect(legacy.calls).toEqual([])
  })

  it('duplicates and reorders Effects through the overflow menu', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-effect-duplicate'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Effects')

    await addEffectThroughPalette('Ripple')
    await addEffectThroughPalette('Swirl')
    openEffectMenu('Ripple')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate Ripple Effect' }))
    await act(async () => {})

    expect(appearanceSubmissions()).toHaveLength(3)
    const [, , duplicate] = appearanceSubmissions()
    expect(duplicate.baseRevision).toBe(2)
    if (duplicate.intent.kind !== 'duplicate-effect') throw new Error('Expected a duplicate-effect intent.')
    expect(duplicate.intent.effectId).toBe('ripple')
    expect(duplicate.intent.newEffectId).toBe('ripple-2')

    const stack = screen.getByRole('region', { name: 'Clip Effects' })
    openEffectMenu('Ripple', within(stack).getByTestId('show-effect-ripple-2'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move Ripple Effect later' }))
    await act(async () => {})

    const submissions = appearanceSubmissions()
    expect(submissions).toHaveLength(4)
    const [, , , reorder] = submissions
    expect(reorder.baseRevision).toBe(3)
    if (reorder.intent.kind !== 'reorder-effect') throw new Error('Expected a reorder-effect intent.')
    expect(reorder.intent.effectId).toBe('ripple-2')
    expect((await authoredClipValue(editor.showId, 'overlay-a')).effects.map((effect) => effect.id))
      .toEqual(['ripple', 'swirl', 'ripple-2'])
    const after = editor.state()
    expect(after.history.past).toHaveLength(4)
    expect(after.v2Writes).toBe(4)
    expect(legacy.calls).toEqual([])

    // The moved distort Effect no longer lands last in the array once a
    // color-output Effect trails it; the same menu gesture still names the
    // distort sibling, not the raw-array neighbour.
    await addEffectThroughPalette('Brightness')
    openEffectMenu('Swirl')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move Swirl Effect later' }))
    await act(async () => {})

    const extended = appearanceSubmissions()
    expect(extended).toHaveLength(6)
    const swirlReorder = extended[5]
    expect(swirlReorder.baseRevision).toBe(5)
    if (swirlReorder.intent.kind !== 'reorder-effect') throw new Error('Expected a reorder-effect intent.')
    expect(swirlReorder.intent.effectId).toBe('swirl')
    expect((await authoredClipValue(editor.showId, 'overlay-a')).effects.map((effect) => effect.id))
      .toEqual(['ripple', 'ripple-2', 'swirl', 'brightness'])
  })

  it('adds and removes Mirror through its fixed Transform row', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-mirror'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Effects')

    await addEffectThroughPalette('Mirror')
    expect(appearanceSubmissions()).toEqual([{
      intent: { kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip', patch: { view: { mirror: true } } },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).view.mirror).toBe(true)

    openEffectMenu('Mirror')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Mirror Effect' }))
    await act(async () => {})

    expect(appearanceSubmissions()).toEqual([
      {
        intent: { kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip', patch: { view: { mirror: true } } },
        baseRevision: 0,
      },
      {
        intent: { kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip', patch: { view: { mirror: false } } },
        baseRevision: 1,
      },
    ])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).view.mirror).toBe(false)
    const after = editor.state()
    expect(after.history.past).toHaveLength(2)
    expect(after.v2Writes).toBe(2)
    expect(legacy.calls).toEqual([])
  })

  it('refuses header Start timing with no write and keeps record identity', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-timing-refuse'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()

    typeAndCommit('Start seconds exact time', '13')
    await act(async () => {})

    const after = editor.state()
    expect(planned.calls).toHaveLength(1)
    expect(planned.calls[0].clipId).toBe('overlay-a')
    expect(admission.calls).toEqual([])
    expectNoWrite(before, after)
  })

  it('refuses a Source pattern swap with no write and keeps record identity', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-pattern-refuse'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')
    const before = editor.state()

    const pattern = screen.getByRole('combobox', { name: 'Source pattern' })
    fireEvent.focus(pattern)
    fireEvent.change(pattern, { target: { value: 'testpattern1d' } })
    const option = screen.queryByRole('option', { name: 'TestPattern1D' })
    if (option) fireEvent.click(option)
    await act(async () => {})

    const after = editor.state()
    // Slice 4 connects this drive: the shared CometLoom instance causes an
    // independence mint, and the swap lands as one history entry and one save.
    expect(planned.calls).toHaveLength(1)
    expect(planned.calls[0].clipId).toBe('resize-a')
    expect(replacementSubmissions()).toHaveLength(1)
    const [submission] = replacementSubmissions()
    expect(submission.baseRevision).toBe(0)
    expect(submission.intent).toMatchObject({
      kind: 'replace-pattern',
      clipId: 'resize-a',
      patternReference: { kind: 'stock', id: 'TestPattern1D' },
    })
    expect((await authoredClipValue(editor.showId, 'resize-a')).patternName).toBe('TestPattern1D')
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('keeps a v1 row on the legacy inspector path', async () => {
    const source: ShowRecord = v2TracerV1Record('slice3-v1-brightness')
    const v2Writes = vi.fn(async (_id: string, _next: ShowRecordV2) => {})
    const legacyWrites = vi.fn(async () => {})
    setPersonalContentProvider({
      id: 'tracer-guard-provider',
      listPatterns: async () => [],
      listMaps: async () => [],
      listMixins: async () => [],
      listControllerProfiles: async () => [],
      createShow: legacyWrites,
      updateShow: legacyWrites,
      deleteShow: legacyWrites,
      replaceShowV2: v2Writes,
      getLastActive: async () => undefined,
      setLastActive: async () => {},
    } as unknown as PersonalContentProvider)
    useShowStore.setState({
      shows: [source],
      showsLoaded: true,
      activeShowId: source.id,
      showV2Pilots: {},
      showV2Histories: {},
      showRevisions: {},
    })
    render(<ShowEditor showId={source.id} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select TestPattern1D' })[0])
    await act(async () => {})

    typeAndCommit('Brightness exact percentage', '75')
    await act(async () => {})

    expect(admission.calls).toEqual([])
    expect(v2Writes).not.toHaveBeenCalled()
    expect(legacyWrites.mock.calls.length).toBeGreaterThan(0)
    const stored = useShowStore.getState().shows[0]
    const brightness = stored.composition!.scenes[0].zones[0].overlays[0].placements[0].view.brightness
    expect(brightness).toBe(0.75)
  })
})

// ── Slice-4 entry policy and Replace Pattern (#1066) ─────────────────────────
// The restart write reaches the entry-policy door and the Source pattern
// combobox reaches the replacement door, both through the same v2 inspector
// commit as slice 3. Every accepted edit is one history entry and one save;
// refusals and no-ops write nothing and keep record identity; no legacy owner
// runs. A replacement that would drop incompatible controls refuses with no
// write: the patch path carries no loss-confirmation surface, so the adapter
// cannot adopt what the owner would report (#1068 rule).
describe('v2 clip entry policy and replacement (#1066 slice 4)', () => {
  it('stores Restart on entry through the entry-policy door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice4-entry-restart'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Playback')
    const before = editor.state()
    const next = authoredClip(before.record, 'overlay-a').entryPolicy === 'restart' ? 'continue' : 'restart'

    fireEvent.click(screen.getByRole('checkbox', { name: 'Restart Pattern on entry' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipEntryPolicy'])
    expect(entryPolicySubmissions()).toEqual([{
      intent: { kind: 'set-entry-policy', clipId: 'overlay-a', entryPolicy: next },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'overlay-a').entryPolicy).toBe(next)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('replaces a sole-user Pattern with no independence mint', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice4-replace-sole'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Pattern')
    const before = editor.state()

    pickSourcePattern('TestPattern2D')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipReplacementEdit'])
    expect(replacementSubmissions()).toEqual([{
      intent: {
        kind: 'replace-pattern',
        clipId: 'overlay-a',
        patternReference: { kind: 'stock', id: 'TestPattern2D' },
      },
      baseRevision: 0,
    }])
    expect((await authoredClipValue(editor.showId, 'overlay-a')).patternName).toBe('TestPattern2D')
    expect(authoredClip(after.record, 'overlay-a').instanceId)
      .toBe(authoredClip(before.record, 'overlay-a').instanceId)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('refuses a lossy Source pattern swap with no write and keeps record identity', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice4-replace-lossy'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')

    // The incompatible control target is authored first through the connected
    // instance door; replacing CometLoom (exports sliderSpeed) with
    // TestPattern2D (exports nothing) would drop it.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})
    const enabled = editor.state()
    expect(instanceSubmissions()).toHaveLength(1)

    pickSourcePattern('TestPattern2D')
    await act(async () => {})

    const after = editor.state()
    expect(planned.calls).toHaveLength(2)
    expect(replacementSubmissions()).toHaveLength(0)
    expect(after.record).toBe(enabled.record)
    expect(after.history).toEqual(enabled.history)
    expect(after.v2Writes).toBe(enabled.v2Writes)
    expect(legacy.calls).toEqual([])
    expect((await authoredClipValue(editor.showId, 'resize-a')).patternName).toBe('CometLoom')
    expect((await authoredClipValue(editor.showId, 'resize-a')).simulation.controlTargets)
      .toEqual({ sliderSpeed: 0.5 })
  })

  it('refuses an unresolvable Source pattern with no write', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice4-replace-unresolvable'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    // The option exists in the catalogue, but its source cannot be bundled,
    // so trusted resolution refuses and nothing is submitted.
    act(() => {
      usePatternStore.setState({
        userPatterns: [{
          id: 'ghost-pattern', name: 'Ghost Pattern', src: 'this is not parseable (((( ',
          controls: {}, updatedAt: 1,
        }],
        patternsLoaded: true,
      })
    })
    await selectClipByName('TestPattern1D', 0)
    showTab('Pattern')
    const before = editor.state()

    pickSourcePattern('Ghost Pattern')
    await act(async () => {})

    const after = editor.state()
    expect(planned.calls).toHaveLength(1)
    expect(replacementSubmissions()).toHaveLength(0)
    expect(admission.calls).toEqual([])
    expectNoWrite(before, after)
  })
})

// ── Slice-6 Show End and Show metadata (#1066) ─────────────────────────────
// Show End commits through the set-show-end door and Show-level metadata
// (Trails, portable reference) through the show-metadata door, every accepted
// edit one history entry and one save. The drag preview paints from the
// v2-projected view and never writes; the commit reads the prepared capture,
// never preview state. Target controller has no landed door (the metadata
// allowlist names only output contract, Stage map, Zone and Trails), so its
// select stays unconnected: changing it writes nothing. A shortened end that
// would cut protected content refuses with no write instead of clamping.
function showEndSubmissions() {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotSetShowEnd')
    .map((call) => ({ intent: call.request.intent, baseRevision: call.request.baseRevision }))
}

function showMetadataSubmissions() {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotShowMetadata')
    .map((call) => ({ intent: call.request.intent, baseRevision: call.request.baseRevision }))
}

function openShowProperties(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Show properties' }))
}

function installationV2Record(id: string): ShowRecordV2 {
  const record = connectedV2Record(id)
  const installation: ShowRecordV2 = {
    ...record,
    outputContract: { version: 1, kind: 'installation', outputMapId: null, pixelCount: 256, resolution: 'fixed' },
  }
  expect(validateShowRecordV2(installation)).toEqual([])
  return installation
}

describe('v2 show end and show metadata (#1066 slice 6)', () => {
  it('paints the dragged Show End label from the v2 record while dragging (row 98)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice6-end-preview'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const handle = screen.getByRole('button', { name: 'Show End at 20 seconds' })
    const surface = screen.getByLabelText('Timeline Markers and Show End')
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 200, top: 0, bottom: 40, width: 200, height: 40, x: 0, y: 0, toJSON: () => {},
    })
    const before = editor.state()

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, altKey: true })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150, altKey: true })

    // The label tracks the pointer before release, and nothing has been
    // submitted: the preview path never writes.
    expect(screen.getByTestId('show-end-drag-time')).toHaveTextContent('25s')
    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)

    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 150, altKey: true })
    await act(async () => {})

    const after = editor.state()
    expect(showEndSubmissions()).toEqual([{
      intent: { kind: 'set-show-end', showEndMs: 25_000 },
      baseRevision: 0,
    }])
    expect(after.record.composition.showEndMs).toBe(25_000)
    expect(screen.queryByTestId('show-end-drag-time')).not.toBeInTheDocument()
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('sets Show End from the details seconds field through the set-show-end door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice6-end-field'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show End at 20 seconds' }))
    })
    const field = within(screen.getByRole('dialog', { name: 'Show End details' }))
      .getByRole('textbox', { name: 'Show End time in seconds exact time' })
    const before = editor.state()

    fireEvent.change(field, { target: { value: '25' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await act(async () => {})

    const after = editor.state()
    expect(plannedShowLevel.calls).toEqual([{ fn: 'planShowV2SetShowEnd' }])
    expect(showEndSubmissions()).toEqual([{
      intent: { kind: 'set-show-end', showEndMs: 25_000 },
      baseRevision: 0,
    }])
    expect(after.record.composition.showEndMs).toBe(25_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('refuses a Show End that would cut protected content with no write', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice6-end-refuse'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show End at 20 seconds' }))
    })
    const field = within(screen.getByRole('dialog', { name: 'Show End details' }))
      .getByRole('textbox', { name: 'Show End time in seconds exact time' })
    const before = editor.state()

    fireEvent.change(field, { target: { value: '5' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await act(async () => {})

    const after = editor.state()
    expect(showEndSubmissions()).toEqual([{
      intent: { kind: 'set-show-end', showEndMs: 5_000 },
      baseRevision: 0,
    }])
    expect(after.record).toBe(before.record)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(after.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])
  })

  it('enables Trails through the show-metadata door (row 796)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice6-trails'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    openShowProperties()
    const before = editor.state()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Trails' }))
    await act(async () => {})

    const after = editor.state()
    expect(plannedShowLevel.calls).toEqual([{ fn: 'planShowV2TrailsEdit' }])
    expect(showMetadataSubmissions()).toEqual([{
      intent: { command: 'set_output_trails', input: { enabled: true, retention: 15 / 16 } },
      baseRevision: 0,
    }])
    expect(after.record.outputEffects).toEqual([{ id: 'trails', kind: 'trails', retention: 15 / 16 }])
    expectOneEdit(before, after)
  })

  it('retunes the portable reference pixels through the show-metadata door (row 1469)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice6-portable-pixels'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    openShowProperties()
    expect(editor.state().record.outputContract).toMatchObject({
      kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 256,
    })
    const before = editor.state()

    const field = screen.getByRole('textbox', { name: 'Portable reference pixels' })
    fireEvent.change(field, { target: { value: '300' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await act(async () => {})

    const after = editor.state()
    expect(showMetadataSubmissions()).toEqual([{
      intent: { command: 'set_output_contract', input: { kind: 'portable-2d', pixel_count: 300, map_id: 'plane' } },
      baseRevision: 0,
    }])
    expect(after.record.outputContract).toMatchObject({
      kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 300,
    })
    expect(after.record.stageMapId).toBe('plane')
    expectOneEdit(before, after)
  })

  it('clears the portable reference map through the show-metadata door (row 1469)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice6-portable-map'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    openShowProperties()
    const before = editor.state()

    fireEvent.change(screen.getByRole('combobox', { name: 'Portable reference map' }), { target: { value: '' } })
    await act(async () => {})

    const after = editor.state()
    expect(showMetadataSubmissions()).toEqual([{
      intent: { command: 'set_output_contract', input: { kind: 'portable-2d', pixel_count: 256, map_id: null } },
      baseRevision: 0,
    }])
    expect(after.record.outputContract).toMatchObject({ kind: 'portable-2d', referenceMapId: null })
    expect(after.record.stageMapId).toBe(null)
    expectOneEdit(before, after)
  })

  it('leaves Target controller unconnected on v2: no door admits it, so it writes nothing', async () => {
    const editor = openV2EditorForRecord(installationV2Record('slice6-target-profile'))
    act(() => {
      useControllerProfileStore.setState({
        profiles: [{
          id: 'profile-1',
          name: 'Profile 1',
          board: { kind: 'pixelblaze-v3-standard' },
          inputs: [],
          globalTransforms: [],
          patternBindings: [],
          updatedAt: 1,
        }],
        profilesLoaded: true,
      })
    })
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    openShowProperties()
    const select = screen.getByRole('combobox', { name: 'Target controller' })
    const before = editor.state()

    fireEvent.change(select, { target: { value: 'profile-1' } })
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expect(after.record).toBe(before.record)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(after.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])
  })
})

describe('v2 Zone and Zone Layout definition wiring (#1066 slice 7)', () => {
  function zoneDoors() {
    return admission.calls.filter((call) => call.door === 'admitShowV2PilotZoneEdit')
  }
  function layoutDoors() {
    return admission.calls.filter((call) => call.door === 'admitShowV2PilotLayoutDefinitionEdit')
  }
  function metadataDoors() {
    return admission.calls.filter((call) => call.door === 'admitShowV2PilotShowMetadata')
  }

  it('adds a Zone from the Zone Map popover through the zone door', async () => {
    const editor = openV2EditorForRecord(twoZoneV2Record('slice7-d2-add'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Zone Map' }))
    await act(async () => {})
    const dialog = screen.getByRole('dialog', { name: 'Zone Map' })
    const before = editor.state()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Zone' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotZoneEdit'])
    expect(zoneDoors()[0].request.intent).toMatchObject({ kind: 'add', zone: { id: 'zone-3', name: 'zone-3' } })
    expect(after.record.zones.map((zone) => zone.id).sort()).toEqual(['z1', 'z2', 'zone-3'])
    expect(after.record.zones.find((zone) => zone.id === 'zone-3')).toMatchObject({ name: 'zone-3', nominalPixelCount: 60 })
    expectOneEdit(before, after)
  })

  it('retunes a Zone pixel count through the show-metadata door', async () => {
    const editor = openV2EditorForRecord(installationV2Record('slice7-d2-pixels'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Zones' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Open zone Main properties' }))
    await act(async () => {})
    const before = editor.state()

    typeAndCommit('Nominal pixels Main', '12')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotShowMetadata'])
    expect(metadataDoors()[0].request.intent).toEqual({
      command: 'update_zone',
      input: expect.objectContaining({ nominal_pixel_count: 12 }),
    })
    expect(after.record.zones.find((zone) => zone.name === 'Main')?.nominalPixelCount).toBe(12)
    expectOneEdit(before, after)
  })

  it('removes a Zone from its inspector through the zone door', async () => {
    const editor = openV2EditorForRecord(twoZoneV2Record('slice7-d2-remove-zone'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Zones' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Open zone Second properties' }))
    await act(async () => {})
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Remove zone Second' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotZoneEdit'])
    expect(zoneDoors()[0].request.intent).toEqual({ kind: 'remove', zoneId: 'z2' })
    expect(after.record.zones.some((zone) => zone.id === 'z2')).toBe(false)
    expectOneEdit(before, after)
  })

  it('duplicates a Zone Layout through the definition door', async () => {
    const base = commandFixtureV2()
    base.id = 'slice7-d2-duplicate'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Moving split X Zone Layout' }))
    await act(async () => {})
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Zone Layout Both' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutDefinitionEdit'])
    expect(layoutDoors()[0].request.intent).toMatchObject({ kind: 'duplicate', sourceLayoutId: 'both' })
    expect(after.record.zoneLayouts.length).toBe(before.record.zoneLayouts.length + 1)
    expect(after.record.zoneLayouts.map((layout) => layout.id)).toContain('layout-3')
    expectOneEdit(before, after)
  })

  it('writes physical ranges through the definition door', async () => {
    const base = commandFixtureV2()
    const record = {
      ...base,
      id: 'slice7-d2-ranges',
      outputContract: { version: 1, kind: 'installation', outputMapId: null, pixelCount: 256, resolution: 'fixed' } as const,
      zones: [{ id: 'left', name: 'Left', nominalPixelCount: 8 }, { id: 'right', name: 'Right', nominalPixelCount: 8 }],
      zoneLayouts: [{ id: 'phys', name: 'Physical', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 127 }] }, { zoneId: 'right', ranges: [{ start: 128, end: 255 }] }] }],
      composition: { ...base.composition, layoutOccurrences: [{ id: 'interval-1', layoutId: 'phys', startMs: 0, durationMs: 5_000, parameters: {} }, { id: 'interval-2', layoutId: 'phys', startMs: 5_000, durationMs: 5_000, parameters: {} }] },
    }
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Physical ranges Zone Layout' }))
    await act(async () => {})
    const before = editor.state()

    typeAndCommit('Physical Left pixel ranges', '0-199')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutDefinitionEdit'])
    expect(layoutDoors()[0].request.intent).toEqual({
      kind: 'set-physical-ranges',
      layoutId: 'phys',
      zoneId: 'left',
      ranges: [{ start: 0, end: 199 }],
    })
    expect(after.record.zoneLayouts.find((layout) => layout.id === 'phys')?.zones.find((entry) => entry.zoneId === 'left')?.ranges).toEqual([{ start: 0, end: 199 }])
    expectOneEdit(before, after)
  })

  it('removes an unused Zone Layout through the definition door', async () => {
    const base = commandFixtureV2()
    base.id = 'slice7-d2-remove-unused'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Moving split X Zone Layout' }))
    await act(async () => {})
    const { useShowEditorViewStore: view } = await import('@/store/showEditorViewStore')
    act(() => { view.getState().setSelection({ kind: 'zone-layout', layoutId: 'left-only' }) })
    await act(async () => {})
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Zone Layout Left only' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutDefinitionEdit'])
    expect(layoutDoors()[0].request.intent).toEqual({ kind: 'remove', layoutId: 'left-only' })
    expect(after.record.zoneLayouts.some((layout) => layout.id === 'left-only')).toBe(false)
    expectOneEdit(before, after)
  })

  it('refuses to remove a Zone Layout an occurrence uses, with no write', async () => {
    const base = commandFixtureV2()
    base.id = 'slice7-d2-remove-used'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Moving split X Zone Layout' }))
    await act(async () => {})
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Zone Layout Both' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutDefinitionEdit'])
    expect(layoutDoors()[0].request.intent).toEqual({ kind: 'remove', layoutId: 'both' })
    expect(after.record).toBe(before.record)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(after.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])
    expect(after.record.zoneLayouts.some((layout) => layout.id === 'both')).toBe(true)
  })

  it('refuses a Zone rename to a taken name, with no write', async () => {
    const editor = openV2EditorForRecord(twoZoneV2Record('slice7-d2-rename-taken'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Zones' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Open zone Second properties' }))
    await act(async () => {})
    const before = editor.state()

    typeAndCommit('Zone name Second', 'Main')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotShowMetadata'])
    expect(metadataDoors()[0].request.intent).toMatchObject({ command: 'update_zone' })
    expect(after.record).toBe(before.record)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(after.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])
    expect(after.record.zones.find((zone) => zone.id === 'z2')?.name).toBe('Second')
  })

  it('saves a spatial physical-zone selection through the definition door', async () => {
    const base = commandFixtureV2()
    const layoutId = base.zoneLayouts[0].id
    const zoneId = base.zones[0].id
    const zoneName = base.zones[0].name
    const record = {
      ...base,
      id: 'slice7-d2-spatial',
      stageMapId: 'plane',
      outputContract: { version: 1, kind: 'installation', outputMapId: 'plane', pixelCount: 4, resolution: 'fixed' } as const,
      zoneLayouts: base.zoneLayouts.map((layout) => ({
        id: layout.id,
        name: layout.name,
        zones: [{ zoneId, ranges: [{ start: 0, end: 1 }] }],
      })),
      composition: {
        ...base.composition,
        layoutOccurrences: base.composition.layoutOccurrences.map((occurrence) => ({
          ...occurrence,
          layoutId: base.zoneLayouts[0].id,
        })),
      },
    }
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Zones' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: `Open zone ${zoneName} properties` }))
    await act(async () => {})
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: `Select ${zoneName} LEDs on output map` }))
    await act(async () => {})
    expect(screen.getByText('Indexes 0-1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('Indexes none')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText(`Select LEDs for zone ${zoneName}`), { key: 'Enter' })
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutDefinitionEdit'])
    expect(layoutDoors()[0].request.intent).toEqual({
      kind: 'set-physical-ranges',
      layoutId,
      zoneId,
      ranges: [],
    })
    expect(after.record.zoneLayouts.find((layout) => layout.id === layoutId)?.zones).toEqual([{ zoneId, ranges: [] }])
    expectOneEdit(before, after)
  })
})

describe('v2 save-failure notice (#1066 slice 12)', () => {
  it('shows the save-failure notice on a rolled-back v2 edit and retries it from the notice', async () => {
    const record = v2TracerRecord('v2-save-failure-notice')
    let offline = true
    const v2Writes = vi.fn(async (_id: string, _next: ShowRecordV2) => {
      if (offline) throw new Error('offline')
    })
    setPersonalContentProvider({
      id: 'v2-notice-provider',
      listPatterns: async () => [],
      listMaps: async () => [],
      listMixins: async () => [],
      listShows: async () => [],
      listControllerProfiles: async () => [],
      createShow: async () => {},
      updateShow: async () => {},
      deleteShow: async () => {},
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
    render(<ShowEditor showId={record.id} recordVersion={2} />)

    await act(async () => {
      await expect(useShowStore.getState().updateShowV2Pilot(record.id, { ...record, name: 'Lost edit' }))
        .rejects.toThrow('offline')
    })
    expect(screen.getByTestId('show-save-failure'))
      .toHaveTextContent("Couldn't save this Show. The last edit was reverted.")

    // Dismiss clears the notice without writing.
    const writesBeforeDismiss = v2Writes.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss save notice' }))
    await waitFor(() => expect(screen.queryByTestId('show-save-failure')).not.toBeInTheDocument())
    expect(useShowStore.getState().showV2SaveFailure).toBeNull()
    expect(v2Writes.mock.calls.length).toBe(writesBeforeDismiss)

    // A later edit can fail again after the dismiss.
    await act(async () => {
      await expect(useShowStore.getState().updateShowV2Pilot(record.id, { ...record, name: 'Lost edit' }))
        .rejects.toThrow('offline')
    })
    expect(screen.getByTestId('show-save-failure')).toBeInTheDocument()

    offline = false
    const writesBeforeRetry = v2Writes.mock.calls.length
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    })
    await waitFor(() => expect(screen.queryByTestId('show-save-failure')).not.toBeInTheDocument())
    expect(v2Writes.mock.calls.length).toBe(writesBeforeRetry + 1)
    expect(useShowStore.getState().showV2Pilots[record.id].name).toBe('Lost edit')
  })
})

describe('v2 header export (#1066 slice 12)', () => {
  // jsdom's Blob has no .stream(), which serialize/parseShowFileBundle use
  // around the real gzip step. The shim below supplies the byte stream; the
  // gzip round trip itself stays genuine.
  function ensureBlobStream() {
    const proto = Blob.prototype as Blob & { stream?: unknown }
    if (typeof proto.stream === 'function') return
    Object.defineProperty(Blob.prototype, 'stream', {
      configurable: true,
      writable: true,
      value(this: Blob) {
        const pending = this.arrayBuffer()
        return new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(new Uint8Array(await pending))
            controller.close()
          },
        })
      },
    })
  }

  it('exports the authored v2 Show file from the header', async () => {
    ensureBlobStream();
    const editor = openV2Editor('v2-header-export')
    const write = vi.spyOn(download, 'downloadBrowserFile').mockImplementation(() => {})
    try {
      render(<ShowEditor showId={editor.showId} recordVersion={2} />)
      fireEvent.click(screen.getByRole('button', { name: 'Show actions' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Export Show file…' }))
      await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
      const [filename, body, type] = write.mock.calls[0]
      const stored = useShowStore.getState().showV2Pilots[editor.showId]
      const expected = buildShowFileBundle(stored, {
        patterns: usePatternStore.getState().userPatterns,
        maps: useMapStore.getState().userMaps,
        libraries: useLibraryStore.getState().userLibraries,
      }, { appVersion: 'slice-12-test' })
      expect(filename).toBe(expected.filename)
      expect(filename.endsWith('.pxlshow')).toBe(true)
      expect(type).toBe('application/gzip')
      const reopened = await parseShowFileBundle(body as Uint8Array, { acceptV2: true })
      expect(reopened.version).toBe(2)
      expect(reopened.show).toEqual(stored)
    } finally {
      write.mockRestore()
    }
  })
})

// ── Slice-10 Property animation writes (#1066) ───────────────────────────────
// The authored-v2 Clip inspector's animation surface reaches the property
// admission door through the same prepared-capture plumbing as the slice-3
// appearance commit: one accepted change is one history entry and one save.
// A Group child's inspector keeps the unconnected no-change result because its
// hold-aware time mapping has no landed inverse.
describe('v2 property animation (#1066 slice 10)', () => {
  it('stores a Brightness animation through the property door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice10-brightness'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))
    await act(async () => {})
    typeAndCommit('Brightness animation to exact percentage', '42')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotPropertyEdit'])
    expect(after.record.composition.propertyTracks).toHaveLength(1)
    const [track] = after.record.composition.propertyTracks
    expect(track.target).toEqual({ kind: 'clip-view', clipId: 'overlay-a', property: 'brightness' })
    expect(track.keyframes.map((key) => key.timeMs)).toEqual([12_000, 14_000])
    expect(track.keyframes[1].value).toBe(0.42)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('leaves a Group child animation unconnected with no write', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-animation-unconnected'
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    // v1 reaches a Group's internals only through isolation, and so does this.
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0], { detail: 2 })
    await act(async () => {})
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))
    await act(async () => {})
    typeAndCommit('Brightness animation to exact percentage', '42')
    await act(async () => {})

    expectNoWrite(before, editor.state())
  })
})

// ── v2 Zone Layouts lane split cell (#1066 slice 9a) ─────────────────────────
// On v2 the lane reads the split cell off the v2 backing: each moving-split
// occurrence shows its own split share with a two-colour gradient.
describe('v2 Zone Layouts lane split cell (#1066 slice 9a)', () => {
  it('shows each occurrence split share on the moving-split Layout', async () => {
    const { stockShowV2ById } = await import('@/pixelblaze/stock/showsV2')
    const record = structuredClone(stockShowV2ById('stock-show-reference-property-animation')!)
    record.id = 'tracer-lane-split-cell'
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await act(async () => {})
    const lane = screen.getByRole('group', { name: 'Zone Layouts lane' })
    const cells = within(lane).getAllByRole('button', { name: 'Edit Moving split X Zone Layout' })
    expect(cells.map((cell) => cell.textContent)).toEqual(['Moving split X50%', '50%', '50%', '50%', '50%', '50%', 'Moving split X25%', 'Moving split X75%', 'Moving split X50%'])
    expect(cells.every((cell) => cell.style.background.startsWith('linear-gradient('))).toBe(true)
    expect(admission.calls).toEqual([])
  })

  it('colours the split cell from the two split Zones, not the fallback colours', async () => {
    // The stock Show's Zone colours equal the lane's fallbacks, so this record
    // recolours both split Zones to tell the v2 Zone read from the constants.
    const { stockShowV2ById } = await import('@/pixelblaze/stock/showsV2')
    const record = structuredClone(stockShowV2ById('stock-show-reference-property-animation')!)
    record.id = 'tracer-lane-split-colours'
    const split = record.zoneLayouts.find((layout) => layout.logical?.kind === 'split')!
    const [first, second] = split.logical!.zoneIds
    record.zones = record.zones.map((zone) => (
      zone.id === first ? { ...zone, color: '#123456' } : zone.id === second ? { ...zone, color: '#abcdef' } : zone
    ))
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await act(async () => {})
    const lane = screen.getByRole('group', { name: 'Zone Layouts lane' })
    const [cell] = within(lane).getAllByRole('button', { name: 'Edit Moving split X Zone Layout' })
    const background = cell.style.background
    expect(background).toMatch(/#123456|rgb\(18, 52, 86\)/)
    expect(background).toMatch(/#abcdef|rgb\(171, 205, 239\)/)
    expect(background).not.toMatch(/#38bdf8|rgb\(56, 189, 248\)/)
    expect(background).not.toMatch(/#f97316|rgb\(249, 115, 22\)/)
  })
})

describe('v2 boundary scalar ramp edits (#1066 slice 9c2a)', () => {
  it('turns Animate split position on through the transition-edit door', async () => {
    const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!
    const record = convertCorpus(structuredClone(stock.show) as ShowRecord)
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    const junctions = screen.getAllByRole('button', { name: 'Edit crossfade Transition between LineDancer2D and LineDancer2D' })
    fireEvent.click(junctions[junctions.length - 1])
    await act(async () => {})
    const panel = boundaryPanel()
    expect(within(panel).getByRole('checkbox', { name: 'Animate repeat scale' })).toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: 'Animate split position' })).not.toBeChecked()

    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Animate split position' }))
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    const request = admission.calls[0].request as { intent: { kind: string; transition: ShowRecordV2['composition']['transitions'][number] } }
    expect(request.intent.kind).toBe('update-transition')
    expect(request.intent.transition.id).toBe('transition-split-position')
    expect(request.intent.transition.propertyRamps).toEqual([
      { target: { kind: 'show-repeat-scale' }, from: 1, durationMs: 1800, easing: { curve: 'linear' } },
      { target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'layout-occurrence:4' }, from: 0.75, durationMs: 1800, easing: { curve: 'linear' } },
    ])
    expectOneEdit(before, editor.state())
    expect(within(boundaryPanel()).getByRole('checkbox', { name: 'Animate split position' })).toBeChecked()
  })
})

describe('v2 sample repeat lane (#1066 slice 9c1)', () => {
  function laneCells(): string[] | null {
    const lane = screen.queryByRole('group', { name: 'Sample repeat lane' })
    if (!lane) return null
    return Array.from(lane.children).slice(1)
      .filter((cell) => cell.tagName === 'DIV')
      .map((cell) => `${(cell as HTMLElement).style.gridColumn}|${(cell as HTMLElement).style.gridRow}|${cell.textContent}`)
  }

  function renderBoth(source: ShowRecord): { v1: string[] | null; v2: string[] | null; v1Grid: string | null; v2Grid: string | null } {
    const record = convertCorpus(source)
    useShowStore.setState({ shows: [source], showsLoaded: true, activeShowId: source.id, showV2Pilots: {}, showV2Histories: {}, showRevisions: {} })
    render(<ShowEditor showId={source.id} />)
    const v1 = laneCells()
    const v1Grid = screen.getByTestId('show-timeline-grid').getAttribute('style')
    cleanup()
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    return { v1, v2: laneCells(), v1Grid, v2Grid: screen.getByTestId('show-timeline-grid').getAttribute('style') }
  }

  it('reads each section\'s repeat scale in the cells v1 draws for the same Show', async () => {
    const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!
    const { v1, v2, v1Grid, v2Grid } = renderBoth(structuredClone(stock.show) as ShowRecord)

    expect(v1).toEqual(['2|3|1x', '4|3|1x', '6|3|1x', '8|3|1x', '10|3|1x', '12|3|1x', '14|3|1x', '16|3|1x', '18|3|4x'])
    expect(v2).toEqual(v1)
    expect(v2Grid).toBe(v1Grid)
  })

  it('draws a boundary button where v1 does for every boundary Transition, and selecting it opens that boundary (#1066 slice 9c2b)', async () => {
    const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!
    const source = structuredClone(stock.show) as ShowRecord
    const buttons = () => Array.from(screen.getByRole('group', { name: 'Sample repeat lane' }).querySelectorAll('button'))
      .map((button) => `${button.getAttribute('aria-label')}|${button.style.gridColumn}|${button.textContent}|${button.getAttribute('data-show-selection-key')}`)
    useShowStore.setState({ shows: [source], showsLoaded: true, activeShowId: source.id, showV2Pilots: {}, showV2Histories: {}, showRevisions: {} })
    render(<ShowEditor showId={source.id} />)
    const v1 = buttons()
    cleanup()
    const editor = openV2EditorForRecord(convertCorpus(source))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const v2 = buttons()

    // v1 also draws a button at each of its six Cut boundaries; a derived Cut
    // on v2 has no Transition to select until Insert from Cut connects.
    expect(v1).toHaveLength(8)
    expect(v2).toEqual([
      'Edit repeat scale at 36.8: LineDancer2D + 1|15|—|transition:transition-effect-parameter',
      'Edit repeat scale at 43.6: LineDancer2D + 1|17|1x→4x|transition:transition-split-position',
    ])
    expect(v2).toEqual(v1.slice(6))

    fireEvent.click(screen.getByRole('button', { name: 'Edit repeat scale at 43.6: LineDancer2D + 1' }))
    await act(async () => {})
    expect(within(boundaryPanel()).getByRole('checkbox', { name: 'Animate repeat scale' })).toBeChecked()
    expect(admission.calls).toEqual([])
  })

  it('draws no lane for a Show that never sets a repeat scale', () => {
    const { v1, v2 } = renderBoth(corpusSource('stock-lesson'))

    expect(v1).toBeNull()
    expect(v2).toBeNull()
  })
})

// ── v2 fixes A (#1066) ───────────────────────────────────────────────────────
// Three small editor gaps the v2 browser suite found: the Show End drag never
// previewed the time grid, the boundary panel's Duration field committed into
// a planner that refuses it, and the Installation coverage banner never read
// the v2 verdict. Each case drives the real gesture and asserts the surface
// the user sees, plus the admission door it reaches.
describe('v2 fixes A (#1066)', () => {
  function gridFrs(): number[] {
    const style = screen.getByTestId('show-timeline-grid').getAttribute('style') ?? ''
    return [...style.matchAll(/([\d.]+)fr/g)].map((match) => Number(match[1]))
  }

  function showEndPreviewMs(): number {
    const label = screen.getByRole('button', { name: /^Show End at / }).getAttribute('aria-label') ?? ''
    const seconds = Number(label.match(/Show End at ([\d.]+) seconds/)?.[1])
    if (!Number.isFinite(seconds)) throw new Error(`Unparseable Show End label ${label}.`)
    return Math.round(seconds * 1000)
  }

  it('previews a Show End drag in the time grid without writing before release', async () => {
    const source = corpusSource('fresh')
    source.id = 'fixa-show-end-preview'
    const record = convertCorpus(source)
    const savedEndMs = record.composition.showEndMs
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const styleBefore = screen.getByTestId('show-timeline-grid').getAttribute('style') ?? ''
    expect(styleBefore).toContain('grid-template-columns:')
    const frsBefore = gridFrs()
    expect(frsBefore.length).toBeGreaterThan(0)

    const surface = screen.getByLabelText('Timeline Markers and Show End')
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 620, bottom: 100, width: 620, height: 100, toJSON: () => ({}),
    })
    const showEnd = screen.getByRole('button', { name: /^Show End at / })
    fireEvent.pointerDown(showEnd, { pointerId: 41, clientX: 720 })
    fireEvent.pointerMove(showEnd, { pointerId: 41, clientX: 783.7 })

    const dragging = screen.getByRole('button', { name: /^Show End at / })
    expect(dragging.getAttribute('data-show-end-dragging')).toBe('true')
    const previewMs = showEndPreviewMs()
    expect(previewMs).not.toBe(savedEndMs)
    const styleMid = screen.getByTestId('show-timeline-grid').getAttribute('style') ?? ''
    expect(styleMid).not.toBe(styleBefore)
    const frsMid = gridFrs()
    expect(frsMid.slice(0, -1)).toEqual(frsBefore.slice(0, -1))
    expect(frsMid[frsMid.length - 1]).toBe(
      Math.max(1, Math.round(frsBefore[frsBefore.length - 1] + (previewMs - savedEndMs))),
    )
    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)

    fireEvent.pointerUp(showEnd, { pointerId: 41, clientX: 783.7 })
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotSetShowEnd'])
    const request = admission.calls[0].request as { intent: { kind: string; showEndMs: number } }
    expect(request.intent).toEqual({ kind: 'set-show-end', showEndMs: previewMs })
    expect(editor.state().record.composition.showEndMs).toBe(previewMs)
  })

  it('commits a changed boundary Duration through the transition-resize door', async () => {
    const { record } = convertedFreshBoundary('fixa-boundary-duration')
    const transition = record.composition.transitions[0]
    expect(transition.durationMs).toBe(2000)
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))
    await act(async () => {})
    const panel = boundaryPanel()
    const duration = within(panel).getByRole('textbox', { name: /^Duration/ })
    expect(duration).toHaveValue('2')
    fireEvent.change(duration, { target: { value: '3.4' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    const request = admission.calls[0].request as { intent: Record<string, unknown>; baseRevision: number }
    expect(request.intent).toEqual({ kind: 'resize-transition', transitionId: transition.id, durationMs: 3400 })
    expect(request.baseRevision).toBe(0)
    const after = editor.state()
    expect(after.record.composition.transitions[0].durationMs).toBe(3400)
    expectOneEdit(before, after)
  })

  it('commits nothing for an unchanged boundary Duration', async () => {
    const { record } = convertedFreshBoundary('fixa-boundary-duration-unchanged')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))
    await act(async () => {})
    const duration = within(boundaryPanel()).getByRole('textbox', { name: /^Duration/ })
    fireEvent.change(duration, { target: { value: '2' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})

    expectNoWrite(before, editor.state())
  })

  it('still sends a boundary settings change through the transition-edit door', async () => {
    const { record } = convertedAdvancedBoundary('fixa-boundary-settings')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between CometLoom and CometLoom',
    }))
    await act(async () => {})
    const panel = boundaryPanel()
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Crossfade source' }), {
      target: { value: 'live-live' },
    })
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    const request = admission.calls[0].request as {
      intent: { kind: string; transition: { crossfadePolicy?: string } }
      baseRevision: number
    }
    expect(request.intent.kind).toBe('update-transition')
    expect(request.intent.transition.crossfadePolicy).toBe('live-live')
    expect(request.baseRevision).toBe(0)
    expectOneEdit(before, editor.state())
  })

  it('surfaces invalid Installation coverage in the tray banner until repaired', async () => {
    const source = corpusSource('installation-layouts')
    source.id = 'fixa-coverage-banner'
    const record = convertCorpus(source)
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await act(async () => {})
    expect(editor.state()).toBeDefined()
    const tray = () => within(screen.getByTestId('show-compile-bar'))
    expect(tray().queryAllByText(/assigns \d+ of \d+ pixels/)).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Add to Show' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    fireEvent.click(screen.getByRole('button', { name: "Open this interval's Zone Layout" }))
    await act(async () => {})
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const ranges = within(panel).getByRole('textbox', { name: 'Full Surface Weave pixel ranges' })
    expect(ranges).toHaveValue('0-63')
    fireEvent.change(ranges, { target: { value: '0-47' } })
    fireEvent.keyDown(ranges, { key: 'Enter' })
    await act(async () => {})

    expect(tray().getAllByText(/Full Surface assigns 48 of 64 pixels \(16 missing\)/i).length).toBeGreaterThan(0)

    const repaired = within(screen.getByRole('dialog', { name: 'Entity Detail Panel' }))
      .getByRole('textbox', { name: 'Full Surface Weave pixel ranges' })
    fireEvent.change(repaired, { target: { value: '0-63' } })
    fireEvent.keyDown(repaired, { key: 'Enter' })
    await act(async () => {})

    expect(tray().queryAllByText(/assigns \d+ of \d+ pixels/)).toEqual([])
  })
})
