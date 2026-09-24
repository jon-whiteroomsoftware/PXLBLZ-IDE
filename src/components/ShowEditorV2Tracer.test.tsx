import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { validateShowRecordV2 } from '@/engine/showCompositionV2'
import { editShowTransitionV2, type ShowTransitionEditIntentV2 } from '@/engine/showTransitionsV2'
import { editShowZoneV2 } from '@/engine/showZonesV2'
import { editShowLayerV2 } from '@/engine/showLayersV2'
import { visualWindows } from '@/engine/showTimelineV2'
import { showBoundaryClipIdentity } from '@/engine/showClipIdentity'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { resizeBoundaryShow } from '@/agent-harness/baseline/fixtures'
import { duplicateShowClipAfter } from '@/engine/showTimelineClipAuthoring'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { convertibleV1Show, transitionV1Show } from '@/test/showV2TracerFixture'
import { planShowV2LayerTransitionInsertion } from '@/engine/showV2LayerTransitionInsertion'
import { planShowV2GroupLayerTransitionInsertion } from '@/engine/showV2LayerTransitionInsertion'
import { insertShowGroupDefinitionLayerTransitionV2 } from '@/engine/showGroupEditsV2'
import { showV2TransitionJunctionKey } from '@/engine/showV2TransitionEditorModel'
import { commandFixtureV2 } from '@/engine/showCommandsV2/fixtures'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { showPreviewOverrideInitialState, showV2StageRecord, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import { useShowEditorViewStore } from '@/store/showEditorViewStore'
import { resetControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  getPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { ShowRecord } from '@/engine/personalContentRecords'
import * as download from '@/engine/browserDownload'
import { buildShowFileBundle, parseShowFileBundle } from '@/engine/showFileBundle'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { buildShowEpeExportV2 } from '@/engine/showEpeExportV2'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { projectShowEditorTimelineV2 } from '@/engine/showEditorTimelinePresentation'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'
import * as previewThumbnailJpeg from '@/engine/previewThumbnailJpeg'
import type { ShowClipAppearanceEditIntentV2 } from '@/engine/showClipAppearanceEditsV2'
import type { ShowV2ClipInspectorInstanceIntent } from '@/engine/showV2ClipAppearancePlanning'
import userEvent from '@testing-library/user-event'
import { applyShowPatternSlotSelectionsV2 } from '@/engine/showReferenceShowV2'
import { resolveBundledPatternSliderNames } from '@/engine/showPatternControls'
import { compileLibraries } from '@/engine/libraries'
import { LIBRARIES } from '@/pixelblaze/libs'
import type { ShowPatternRef } from '@/engine/personalContentRecords'
import type { ShowPatternSlotGroup } from '@/engine/showReferenceShow'
import { convertForTest, openV2EditorForRecord, type EditorState, type OpenV2Editor } from '@/test/showEditorV2Harness'

vi.mock('@/components/PixelblazeCodeEditor', () => ({
  PixelblazeCodeEditor: ({ value }: { value: string }) => <pre data-testid="v2-viewcode-source">{value}</pre>,
}))

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
// `beforeDoor` lets a race test land another writer between a panel's plan and its door (#1098).
const admission = vi.hoisted(() => ({
  calls: [] as Array<{ door: string; request: Record<string, unknown> }>,
  beforeDoor: null as null | (() => void),
}))
vi.mock('@/store/showV2PreparedEditAdmission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/showV2PreparedEditAdmission')>()
  const observed: Record<string, unknown> = { ...actual }
  for (const [door, value] of Object.entries(actual)) {
    if (typeof value !== 'function' || !door.startsWith('admit')) continue
    observed[door] = (request: Record<string, unknown>) => {
      admission.calls.push({ door, request })
      admission.beforeDoor?.()
      return (value as (input: unknown) => unknown)(request)
    }
  }
  return observed
})

/**
 * Identity allocation is observable so the duplicate preview can prove it
 * allocates once, on drop. The real implementation still runs; the wrapper
 * only counts calls.
 */
vi.mock('@/engine/personalContentMetadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/personalContentMetadata')>()
  return { ...actual, newPersonalContentId: vi.fn(actual.newPersonalContentId) }
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
 * The boundary settings planner. A valid record tiles Show End with Layout
 * occurrences, so no rendered boundary ends outside one; a test that needs the
 * planner's own no-Layout refusal narrows the record the real planner reads.
 */
const boundaryPlanner = vi.hoisted(() => ({ narrow: null as null | ((record: ShowRecordV2) => ShowRecordV2) }))
vi.mock('@/engine/showV2TransitionEditorModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/showV2TransitionEditorModel')>()
  return {
    ...actual,
    planShowV2BoundaryTransitionChanges: (
      record: ShowRecordV2,
      ...rest: Parameters<typeof actual.planShowV2BoundaryTransitionChanges> extends [unknown, ...infer R] ? R : never
    ) => actual.planShowV2BoundaryTransitionChanges(boundaryPlanner.narrow ? boundaryPlanner.narrow(record) : record, ...rest),
  }
})

/**
 * The compatibility surface reads the resolved target profile, which on v2 is
 * hook-local: no DOM node names it when no Controller is live. The real
 * builder still runs; the wrapper only records which profile it resolved.
 */
const compatibilityProfiles = vi.hoisted(() => ({ calls: [] as Array<{ id: string } | undefined> }))
vi.mock('@/engine/showControllerCompatibilityContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/showControllerCompatibilityContext')>()
  return {
    ...actual,
    buildShowControllerCompatibilityContext: (
      ...args: Parameters<typeof actual.buildShowControllerCompatibilityContext>
    ) => {
      compatibilityProfiles.calls.push(args[0])
      return actual.buildShowControllerCompatibilityContext(...args)
    },
  }
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

/** The shared harness (`@/test/showEditorV2Harness`) opened on the tracer record. */
function openV2Editor(id: string): OpenV2Editor {
  return openV2EditorForRecord(v2TracerRecord(id))
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

function pointPointerAt(node: HTMLElement): () => void {
  const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => node })
  return () => {
    if (original) Object.defineProperty(document, 'elementFromPoint', original)
    else Reflect.deleteProperty(document, 'elementFromPoint')
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
  admission.beforeDoor = null
  planned.calls.length = 0
  plannedShowLevel.calls.length = 0
  boundaryPlanner.narrow = null
  compatibilityProfiles.calls.length = 0
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
  it('a v2 no-change move preview clears when the drag leaves the lane (#1067)', async () => {
    const editor = openV2Editor('tracer-native-no-change-leave')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')
    const lane = surface.lane('main')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(lane, 'dragover', 0)
    expect(surface.dataTransfer.dropEffect).toBe('move')
    expect(screen.getByTestId('show-clip-move-preview-time')).toHaveTextContent('0s')
    surface.fire(lane, 'dragleave', 1)
    expect(screen.queryByTestId('show-clip-move-preview')).not.toBeInTheDocument()
    surface.fire(lane, 'drop', 1)
    await act(async () => {})
    expectNoWrite(before, editor.state())
  })

  it("a v2 Shift pointer-drag that resolves to the Clip's own start keeps the move preview and commits nothing (#1067)", async () => {
    const editor = openV2Editor('tracer-shift-no-change')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')
    const restorePointerTarget = pointPointerAt(surface.lane('main'))

    try {
      fireEvent.pointerDown(surface.clip, { pointerId: 1067, clientX: 0, clientY: 20, shiftKey: true })
      fireEvent.pointerMove(window, { pointerId: 1067, clientX: 6, clientY: 20, shiftKey: true })
      expect(screen.getByTestId('show-clip-move-preview')).toHaveAttribute('data-drag-mode', 'move')
      expect(screen.getByTestId('show-clip-move-preview-time')).toHaveTextContent('0s')
      fireEvent.pointerUp(window, { pointerId: 1067, clientX: 6, clientY: 20, shiftKey: true })
      await act(async () => {})
      expectNoWrite(before, editor.state())
    } finally {
      restorePointerTarget()
    }
  })

  it('a v2 Shift pointer-drag paints tenths and commits the move (#1067)', async () => {
    const editor = openV2Editor('tracer-shift-tenths')
    useShowEditorSessionStore.setState({ snapEnabled: false, markersVisible: false, markerSnapEnabled: false })
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')
    const restorePointerTarget = pointPointerAt(surface.lane('main'))

    try {
      fireEvent.pointerDown(surface.clip, { pointerId: 1068, clientX: 0, clientY: 20, shiftKey: true })
      fireEvent.pointerMove(window, { pointerId: 1068, clientX: 123.37, clientY: 20, shiftKey: true })
      expect(screen.getByTestId('show-clip-move-preview-time')).toHaveTextContent('12.3s')
      fireEvent.pointerUp(window, { pointerId: 1068, clientX: 123.37, clientY: 20, shiftKey: true })
      await waitFor(() => expect(authoredClip(editor.state().record, 'resize-a').startMs).toBe(12_300))

      const after = editor.state()
      expect(temporalSubmissions()).toEqual([{
        intent: { kind: 'move', clipId: 'resize-a', startMs: 12_300 },
        baseRevision: 0,
      }])
      expect(after.history.past).toEqual([before.record])
      expect(after.v2Writes).toBe(1)
    } finally {
      restorePointerTarget()
    }
  })

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

  it('allocates duplicate identities once, on drop, across repeated previews', async () => {
    const editor = openV2Editor('tracer-alt-duplicate-identity')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')
    const identities = vi.mocked(newPersonalContentId)

    surface.fire(surface.clip, 'dragstart', 0, true)
    identities.mockClear()
    for (const x of [20, 30, 40, 50, 60]) surface.fire(surface.lane('overlay'), 'dragover', x, true)
    expect(identities).toHaveBeenCalledTimes(0)
    expect(screen.getByTestId('show-clip-move-preview')).toHaveAttribute('data-drag-mode', 'duplicate')
    surface.fire(surface.lane('overlay'), 'drop', 60, true)
    await act(async () => {})

    expect(identities.mock.calls.length).toBeGreaterThan(0)
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipSharingEdit'])
    const after = editor.state()
    expectOneEdit(before, after)
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

  it('moves an unjoined Clip across Layers without asking (#1069)', async () => {
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
    expect(screen.queryByRole('alertdialog', { name: 'Move connected Clip?' })).toBeNull()
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

    const dialog = screen.getByRole('alertdialog', { name: 'Move connected Clip?' })
    expectNoWrite(before, editor.state())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move Clip and remove Transition' }))
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

  it('refuses Delete on a Group occurrence on a refused Stage capture with no write (#1066 slice 2)', async () => {
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

    // Group Delete is wired: the keystroke reaches the group-occurrence edit
    // input, but this fixture's prepared Stage capture is refused (its Pattern
    // instance automates a slider no Pattern source provides), so the edit
    // stops before any admission door. The capture refusal is what the editor
    // surfaces, in the CompileBar error notice.
    expectNoWrite(before, editor.state())
    expect(screen.getByText('Clip "instance" cannot automate "sliderGain": public slider control not found.')).toBeInTheDocument()
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

// ── Clip sharing commands (#1090 slice A) ────────────────────────────────────
// Toolbar Clone and the Clip inspector's Make Pattern Independent / Rejoin
// Shared Pattern reach the v2 clip-sharing door through the existing
// ShowEditor handlers. Clone commits a linked duplicate immediately after the
// source Clip; independence mints a fresh instance for one Clip; rejoin
// adopts an existing compatible instance and collects the orphan. Every
// accepted edit keeps the tracer fences: exactly one history entry and one
// save, exact Undo then Redo, and no legacy owner invocation.

describe('v2 clip sharing (#1090 slice A)', () => {
  /** Selects resize-a and parks the playhead inside it. */
  async function selectResizeA(showId: string): Promise<void> {
    act(() => useShowTransportStore.setState({ showId, positionMs: 2_000 }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Select CometLoom' })[0])
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'clip', clipId: 'resize-a' })
  }

  /** The clip-sharing submissions one command made, in order. */
  function sharingSubmissions() {
    return admission.calls
      .filter((call) => call.door === 'admitShowV2PilotClipSharingEdit')
      .map((call) => ({ intent: call.request.intent, baseRevision: call.request.baseRevision }))
  }

  it('clones the selected Clip as a linked copy through the clip-sharing door', async () => {
    const editor = openV2Editor('tracer-clone-linked')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectResizeA(editor.showId)
    const before = editor.state()
    const source = authoredClip(before.record, 'resize-a')
    const button = timelineCommand('Clone selection')
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(button)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipSharingEdit'])
    expect(sharingSubmissions()).toHaveLength(1)
    expect(sharingSubmissions()[0].baseRevision).toBe(0)
    expect(sharingSubmissions()[0].intent).toMatchObject({
      kind: 'duplicate',
      clipId: 'resize-a',
      zoneId: source.zoneId,
      layerId: source.layerId,
      startMs: source.startMs + source.durationMs,
    })
    expect(after.record.composition.clips).toHaveLength(before.record.composition.clips.length + 1)
    const beforeIds = new Set(before.record.composition.clips.map((clip) => clip.id))
    const copies = after.record.composition.clips.filter((clip) => !beforeIds.has(clip.id))
    expect(copies).toHaveLength(1)
    expect(copies[0].layerId).toBe(source.layerId)
    expect(copies[0].startMs).toBe(source.startMs + source.durationMs)
    // Linked by contract: the copy consumes the source's Pattern instance
    // and mints no runtime of its own.
    expect(copies[0].instanceId).toBe(source.instanceId)
    expect(after.record.composition.patternInstances).toHaveLength(before.record.composition.patternInstances.length)
    expectOneEdit(before, after)
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'clip', clipId: copies[0].id })
    await expectUndoRedoExact(editor, before)
  })

  it('disables Clone with the v2 reason and writes nothing when the Layer has no room', async () => {
    // resize-a 1000-5000 is followed by resize-b at 7000: 2000 ms of room
    // cannot hold a 4000 ms copy, so the landed capability refuses.
    const editor = openV2EditorForRecord(connectedV2Record('tracer-clone-no-room'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectResizeA(editor.showId)
    const before = editor.state()
    const button = timelineCommand('Clone selection')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription('The selected Clip needs empty time after it on this Layer')

    fireEvent.click(button)
    await act(async () => {})

    expectNoWrite(before, editor.state())
  })

  it('makes a shared Clip independent through the clip-sharing door', async () => {
    // resize-a and resize-b share one CometLoom instance on this fixture.
    const editor = openV2Editor('tracer-make-independent')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectResizeA(editor.showId)
    expect(screen.getByRole('group', { name: 'Pattern instance' })).toHaveTextContent('Shared by 2 Clips')
    const before = editor.state()
    const sharedInstanceId = authoredClip(before.record, 'resize-a').instanceId
    expect(authoredClip(before.record, 'resize-b').instanceId).toBe(sharedInstanceId)

    fireEvent.click(screen.getByRole('button', { name: 'Make Pattern Independent' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipSharingEdit'])
    expect(sharingSubmissions()).toHaveLength(1)
    expect(sharingSubmissions()[0].baseRevision).toBe(0)
    expect(sharingSubmissions()[0].intent).toMatchObject({ kind: 'make-independent', clipId: 'resize-a' })
    expect(after.record.composition.clips).toHaveLength(before.record.composition.clips.length)
    expect(authoredClip(after.record, 'resize-a').instanceId).not.toBe(sharedInstanceId)
    expect(authoredClip(after.record, 'resize-b').instanceId).toBe(sharedInstanceId)
    expect(screen.getByRole('group', { name: 'Pattern instance' })).toHaveTextContent('Independent')
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('rejoins an independent Clip to a shared instance and collects the orphan', async () => {
    // resize-a and resize-b run the same CometLoom Pattern on independent
    // instances, so resize-a can rejoin resize-b's instance.
    const editor = openV2EditorForRecord(connectedV2Record('tracer-rejoin'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectResizeA(editor.showId)
    const before = editor.state()
    const targetInstanceId = authoredClip(before.record, 'resize-b').instanceId
    expect(authoredClip(before.record, 'resize-a').instanceId).not.toBe(targetInstanceId)

    fireEvent.click(screen.getByRole('button', { name: 'Rejoin Shared Pattern' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Rejoin Pattern instance' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipSharingEdit'])
    expect(sharingSubmissions()).toHaveLength(1)
    expect(sharingSubmissions()[0].baseRevision).toBe(0)
    expect(sharingSubmissions()[0].intent).toMatchObject({ kind: 'rejoin', clipId: 'resize-a', targetInstanceId })
    expect(authoredClip(after.record, 'resize-a').instanceId).toBe(targetInstanceId)
    expect(authoredClip(after.record, 'resize-b').instanceId).toBe(targetInstanceId)
    expect(after.record.composition.patternInstances.map((instance) => instance.id).sort())
      .toEqual(['overlay-instance', 'resize-b-instance'])
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('offers no independence write on a Clip that is already independent', async () => {
    const editor = openV2Editor('tracer-already-independent')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select TestPattern1D' })[0])
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'clip', clipId: 'overlay-a' })
    expect(screen.getByRole('group', { name: 'Pattern instance' })).toHaveTextContent('Independent')
    const before = editor.state()
    // The control is absent, so independence is unreachable: the planner's
    // `unchanged` outcome is never even submitted.
    expect(screen.queryByRole('button', { name: 'Make Pattern Independent' })).toBeNull()
    expectNoWrite(before, editor.state())
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
 * The committed `fresh` Show exactly as it stands: a single Zone pair whose
 * boundary Transition the converter lands at Layer *participant* scope, because
 * nothing at that boundary needs whole-output ownership. The drawn junction is
 * indistinguishable from a Layer Transition's; only the recorded provenance
 * says v1 authored it on the boundary surface.
 */
function convertedFreshBoundary(id: string): { source: ShowRecord; record: ShowRecordV2 } {
  const source = corpusSource('fresh')
  source.id = id
  const record = convertForTest(source)
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
  const record = convertForTest(source)
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
  const record = convertForTest(source)
  for (const transition of record.composition.transitions) delete transition.origin
  expect(validateShowRecordV2(record), 'native whole-output record').toEqual([])
  return { source, record }
}

/** The committed lesson Show, whose two Transitions v1 authored on a Layer. */
function convertedLayerTransitions(id: string): ShowRecordV2 {
  const source = corpusSource('stock-lesson')
  source.id = id
  return convertForTest(source)
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
  return convertForTest(source)
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

  it('reads supported advanced rows from the authored record', async () => {
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
    // The Show-wide scalar each side holds across this boundary.
    expect(within(advanced).getByText('1x → 2x')).toBeInTheDocument()
    expect(within(advanced).getByRole('checkbox', { name: 'Animate speed for main' })).toHaveAttribute('aria-disabled', 'true')
    expect(within(advanced).getByRole('checkbox', { name: 'Animate brightness for main' })).toHaveAttribute('aria-disabled', 'true')

    expectNoWrite(before, editor.state())
    expect(within(boundaryPanel()).getByRole('combobox', { name: 'Crossfade source' }))
      .toHaveValue('snapshot-live')
  })

  it('speed and brightness rows are disabled with a reason off the flat route (#1091 B3b)', async () => {
    const { record } = convertedFreshBoundary('tracer-boundary-layered-unavailable')
    record.composition.layers.push({ id: 'overlay', zoneId: record.zones[0].id, name: 'Overlay', rank: 1 })
    const transition = record.composition.transitions[0]
    const participant = transition.participants[0]
    const incoming = record.composition.clips.find(clip => clip.id === participant.toClipId)!
    transition.propertyRamps = [
      { participantId: participant.id, target: { kind: 'instance-time-scale', instanceId: incoming.instanceId }, from: 0.5, durationMs: 500 },
      { participantId: participant.id, target: { kind: 'clip-view', clipId: incoming.id, property: 'brightness' }, from: 0.4, durationMs: 500 },
    ]
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))
    await act(async () => {})
    fireEvent.click(within(boundaryPanel()).getByText('Advanced transition controls'))
    const advanced = within(boundaryPanel()).getByText('Advanced transition controls').closest('details')!
    for (const label of ['speed', 'brightness']) {
      const row = within(advanced).getByRole('region', { name: `${label === 'speed' ? 'Animation speed' : 'Brightness'} transition` })
      const control = within(row).getByRole('checkbox', { name: `Animate ${label} for main` })
      for (const input of row.querySelectorAll('input, select')) {
        expect(input).toHaveAttribute('aria-disabled', 'true')
        expect(input).not.toBeDisabled()
      }
      expect(control).toHaveAttribute('aria-disabled', 'true')
      const reasonId = control.getAttribute('aria-describedby')!
      expect(reasonId).toBeTruthy()
      control.focus()
      expect(document.getElementById(reasonId)).toHaveTextContent("This Transition can't animate speed or brightness.")
      await waitFor(() => expect(document.getElementById(reasonId)).toBeVisible())
      fireEvent.click(control)
    }
    await act(async () => {})
    expectNoWrite(before, editor.state())
  })

  it('Pattern control and Transform rows are hidden on v2 (#1091 B3b)', async () => {
    const { record } = convertedAdvancedBoundary('tracer-boundary-hidden-rows')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between CometLoom and CometLoom',
    }))
    await act(async () => {})
    fireEvent.click(within(boundaryPanel()).getByText('Advanced transition controls'))
    const advanced = within(boundaryPanel()).getByText('Advanced transition controls').closest('details')!
    expect(within(advanced).queryByRole('region', { name: 'Transform transition' })).not.toBeInTheDocument()
    expect(within(advanced).queryByRole('checkbox', { name: 'Animate Speed for main' })).not.toBeInTheDocument()
  })

  it.each([
    { label: 'speed', targetKind: 'instance-time-scale' },
    { label: 'brightness', targetKind: 'clip-view' },
  ])('enabling the $label row writes a $label ramp (#1091 B3a)', async ({ label, targetKind }) => {
    const { record } = convertedFreshBoundary(`tracer-boundary-${label}-write`)
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))
    await act(async () => {})
    fireEvent.click(within(boundaryPanel()).getByText('Advanced transition controls'))
    fireEvent.click(within(boundaryPanel()).getByRole('checkbox', { name: `Animate ${label} for main` }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map(call => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    expectOneEdit(before, after)
    const transition = after.record.composition.transitions[0]
    expect(transition.propertyRamps).toEqual([expect.objectContaining({
      participantId: transition.participants[0].id,
      target: expect.objectContaining({ kind: targetKind }),
    })])
    fireEvent.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await act(async () => {})
    expect(editor.state().record.composition).toEqual(before.record.composition)
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

    const after = editor.state()
    const definitionId = before.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occurrence-first')!.definitionId
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-definition-layer-transition', definitionId, transitionId: 'group-pulse-join', durationMs: 0 },
    ])
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Layer Transition Details' })).not.toBeInTheDocument()
    expect(after.record.composition.groupDefinitions.find((definition) => definition.id === definitionId)!.transitions).toEqual([])
  })

  it('keeps the popover open when the group-occurrence door rejects a Reset to Cut', async () => {
    // The save-failure hook, as the `v2 save-failure notice` tracer does: a
    // rejecting provider write forces the door to reject after a real
    // submission, so a popover that closes on settle cannot pass.
    const record = convertedGroupLocalTransition('tracer-group-local-reset-rejected')
    const editor = openV2EditorForRecord(record)
    const live = getPersonalContentProvider()
    const failingWrite = vi.fn(async (_id: string, _next: ShowRecordV2) => {
      throw new Error('Synthetic group transition save failure')
    })
    setPersonalContentProvider({
      ...live,
      id: 'tracer-group-reset-refusal',
      replaceShowV2: failingWrite,
    } as unknown as PersonalContentProvider)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    // v1 reaches a Group's internals only through isolation, and so does this.
    const child = screen.getAllByRole('button', { name: 'Select Group Mandala pulse' })[0]
    fireEvent.click(child, { detail: 2 })
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between SignalMandala and SignalMandala',
    }))
    await act(async () => {})
    const popover = screen.getByRole('dialog', { name: 'Layer Transition Details' })
    fireEvent.click(within(popover).getByRole('button', { name: 'Reset to Cut' }))
    await act(async () => {})

    const after = editor.state()
    const definitionId = before.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occurrence-first')!.definitionId
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-definition-layer-transition', definitionId, transitionId: 'group-pulse-join', durationMs: 0 },
    ])
    expect(failingWrite).toHaveBeenCalledTimes(1)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.record.composition).toEqual(before.record.composition)
    expect(after.record.composition.groupDefinitions.find((definition) => definition.id === definitionId)!.transitions).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Layer Transition Details' })).toBeInTheDocument()
  })

  it('retimes a Group-local Transition through the group-occurrence door inside Group isolation', async () => {
    const record = convertedGroupLocalTransition('tracer-group-local-resize')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    // v1 reaches a Group's internals only through isolation, and so does this.
    const child = screen.getAllByRole('button', { name: 'Select Group Mandala pulse' })[0]
    fireEvent.click(child, { detail: 2 })
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between SignalMandala and SignalMandala',
    }))
    await act(async () => {})
    const popover = screen.getByRole('dialog', { name: 'Layer Transition Details' })
    const duration = within(popover).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' })
    fireEvent.change(duration, { target: { value: '2.5' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})

    const after = editor.state()
    const definitionId = before.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occurrence-first')!.definitionId
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(admission.calls.map((call) => call.request.intent)).toEqual([
      { kind: 'resize-definition-layer-transition', definitionId, transitionId: 'group-pulse-join', durationMs: 2500 },
    ])
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Layer Transition Details' })).not.toBeInTheDocument()
    expect(after.record.composition.groupDefinitions.find((definition) => definition.id === definitionId)!.transitions.find((transition) => transition.id === 'group-pulse-join')?.durationMs).toBe(2500)
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

  // #1075 G4b-2b: an ordinary Cut on v2 opens the Layer Transition palette
  // for insertion. The Cut below is two exactly-adjacent Clips with 200 ms of
  // free time after them, so the insertion plan is enabled at 200 ms.
  function cutV2Record(id: string): ShowRecordV2 {
    const source = transitionV1Show('crossfade')
    source.id = id
    const converted = convertShowRecordV1ToV2(source)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const record = converted.record
    record.id = id
    const incoming = record.composition.clips.find((clip) => clip.id === 'in')!
    incoming.startMs = 400
    incoming.appearance.keys.forEach((key) => { key.timeMs -= 200 })
    record.composition.transitions = []
    expect(validateShowRecordV2(record)).toEqual([])
    return record
  }

  function cutV2JunctionKey(): string {
    return showV2TransitionJunctionKey({
      atMs: 400,
      zoneId: 'zone',
      layerId: 'layer:zone:main',
      fromClipId: 'out',
      toClipId: 'in',
    })
  }

  function openCutPalette(): HTMLElement {
    fireEvent.click(screen.getByRole('button', {
      name: 'Edit Cut between Outgoing and Incoming',
    }))
    return screen.getByRole('dialog', { name: 'Choose Layer Transition' })
  }

  it('opens the Layer Transition palette on a v2 Cut with the plan maximum', async () => {
    const record = cutV2Record('tracer-v2-cut-palette')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    const palette = openCutPalette()
    await act(async () => {})

    const plan = planShowV2LayerTransitionInsertion(record, cutV2JunctionKey())
    if (!plan.enabled) throw new Error('expected room after the Cut')
    expect(within(palette).getByText('Outgoing to Incoming')).toBeInTheDocument()
    expect(within(palette).getByText(/seconds fits here\./).textContent)
      .toContain(`Up to ${(plan.maxDurationMs / 1_000).toFixed(3)} seconds fits here.`)

    expectNoWrite(before, editor.state())
  })

  it('inserts a crossfade on a v2 Cut through the transition-edit door', async () => {
    const record = cutV2Record('tracer-v2-cut-insert')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    const palette = openCutPalette()
    await act(async () => {})
    const duration = within(palette).getByLabelText('Transition duration in seconds exact time')
    fireEvent.change(duration, { target: { value: '0.15' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    fireEvent.click(within(palette).getByRole('button', { name: 'Use Crossfade Transition' }))
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    const request = admission.calls[0].request as { intent: ShowTransitionEditIntentV2; baseRevision: number }
    if (request.intent.kind !== 'insert') throw new Error('expected an insert intent')
    expect(request.intent.transition.kind).toBe('crossfade')
    expect(request.intent.transition.durationMs).toBe(150)
    expect(request.intent.transition.crossfadePolicy).toBe('live-live')
    expect(request.intent.transition.participants.map((participant) => [participant.fromClipId, participant.toClipId]))
      .toEqual([['out', 'in']])
    expect(request.baseRevision).toBe(0)
    const after = editor.state()
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Choose Layer Transition' })).not.toBeInTheDocument()
    // The engine oracle on the admitted intent is the stored record exactly.
    const oracle = editShowTransitionV2(before.record, request.intent)
    expect(oracle.status).toBe('changed')
    if (oracle.status !== 'changed') throw new Error('the oracle refused the admitted intent')
    expect(after.record.composition).toEqual(oracle.record.composition)
    expect(after.record.composition.clips.find((clip) => clip.id === 'in')!.startMs).toBe(550)
  })

  it('clamps an over-maximum duration to the plan maximum on a v2 Cut', async () => {
    const record = cutV2Record('tracer-v2-cut-clamp')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const plan = planShowV2LayerTransitionInsertion(record, cutV2JunctionKey())
    if (!plan.enabled) throw new Error('expected room after the Cut')

    const palette = openCutPalette()
    await act(async () => {})
    const duration = within(palette).getByLabelText('Transition duration in seconds exact time')
    fireEvent.change(duration, { target: { value: '5' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    fireEvent.click(within(palette).getByRole('button', { name: 'Use Crossfade Transition' }))
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    const request = admission.calls[0].request as { intent: ShowTransitionEditIntentV2; baseRevision: number }
    if (request.intent.kind !== 'insert') throw new Error('expected an insert intent')
    expect(request.intent.transition.durationMs).toBe(plan.maxDurationMs)
    const after = editor.state()
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Choose Layer Transition' })).not.toBeInTheDocument()
    expect(after.record.composition.clips.find((clip) => clip.id === 'in')!.startMs).toBe(400 + plan.maxDurationMs)
  })

  it('shows the disabled reason and reaches no door on a Cut another Layer blocks', async () => {
    const record = cutV2Record('tracer-v2-cut-blocked')
    const outgoing = record.composition.clips.find((clip) => clip.id === 'out')!
    const obstruction = structuredClone(outgoing)
    obstruction.id = 'obstruction'
    obstruction.layerId = 'layer:zone:overlay:1'
    obstruction.startMs = 400
    obstruction.appearance.keys.forEach((key, index) => {
      key.id = `obstruction:appearance:${index + 1}`
      key.timeMs = 400
    })
    record.composition.clips.push(obstruction)
    expect(validateShowRecordV2(record)).toEqual([])
    const plan = planShowV2LayerTransitionInsertion(record, cutV2JunctionKey())
    if (plan.enabled) throw new Error('expected a disabled plan')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    const palette = openCutPalette()
    await act(async () => {})

    expect(within(palette).getByText(plan.reason)).toBeInTheDocument()
    fireEvent.click(within(palette).getByRole('button', { name: 'Use Crossfade Transition' }))
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual([])
    expect(editor.state().record).toBe(before.record)
    expect(screen.getByRole('dialog', { name: 'Choose Layer Transition' })).toBeInTheDocument()
  })

  it('keeps the palette open with the apply error when the door refuses the insert', async () => {
    const record = cutV2Record('tracer-v2-cut-refused')
    const editor = openV2EditorForRecord(record)
    const live = getPersonalContentProvider()
    const failingWrite = vi.fn(async (_id: string, _next: ShowRecordV2) => {
      throw new Error('Synthetic v2 cut insert save failure')
    })
    setPersonalContentProvider({
      ...live,
      id: 'tracer-v2-cut-refusal',
      replaceShowV2: failingWrite,
    } as unknown as PersonalContentProvider)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    const palette = openCutPalette()
    await act(async () => {})
    const duration = within(palette).getByLabelText('Transition duration in seconds exact time')
    fireEvent.change(duration, { target: { value: '0.15' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    fireEvent.click(within(palette).getByRole('button', { name: 'Use Crossfade Transition' }))
    await act(async () => {})
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    expect(failingWrite).toHaveBeenCalledTimes(1)
    const livePalette = screen.getByRole('dialog', { name: 'Choose Layer Transition' })
    expect(within(livePalette).getByText(
      'Crossfade could not be inserted because the available time at this junction changed. Reopen the Transition panel and try again.',
    )).toBeInTheDocument()
    const after = editor.state()
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.record.composition).toEqual(before.record.composition)
    expect(after.v2Writes).toBe(0)
  })

  // #1075 G4b-2c: a Cut between two Clips of one Group occurrence in
  // isolation opens the same palette for a definition-local insert. Two
  // exactly-adjacent definition Clips with no Transition, shared by two
  // linked occurrences.
  function groupCutV2Record(id: string): ShowRecordV2 {
    const source = convertibleV1Show()
    source.id = id
    source.scenes[0].durationMs = 30000
    source.composition!.durationMs = 30000
    source.composition!.scenes[0].zones[0].overlays = [{ id: 'ov1', name: 'ov', placements: [] }]
    const inst = { ...structuredClone(source.composition!.patternInstances[0]), id: 'g-inst' }
    source.composition!.groupDefinitions = [{
      id: 'def-1',
      name: 'Chorus',
      patternInstances: [inst],
      placements: [
        { id: 'g-a', instanceId: 'g-inst', layerOffset: 0, startMs: 0, durationMs: 4000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
        { id: 'g-b', instanceId: 'g-inst', layerOffset: 0, startMs: 4000, durationMs: 3000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
      ],
    }]
    source.composition!.groupOccurrences = [
      { id: 'occ-1', definitionId: 'def-1', sceneId: 'scene-a', zoneId: 'zone', startMs: 0, baseLayer: 1, translationX: 0, translationY: 0 },
      { id: 'occ-2', definitionId: 'def-1', sceneId: 'scene-a', zoneId: 'zone', startMs: 10000, baseLayer: 1, translationX: 0, translationY: 0 },
    ]
    const converted = convertShowRecordV1ToV2(source)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const record = converted.record
    record.id = id
    expect(validateShowRecordV2(record)).toEqual([])
    return record
  }

  function groupCutDefinitionId(record: ShowRecordV2): string {
    return record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-1')!.definitionId
  }

  async function openGroupCutPalette(): Promise<HTMLElement> {
    // v1 reaches a Group's internals only through isolation, and so does this.
    const children = screen.getAllByRole('button', { name: 'Select Group Chorus' })
      .filter((candidate) => candidate.getAttribute('data-show-group-occurrence') === 'occ-1')
    fireEvent.click(children[0]!, { detail: 2 })
    await act(async () => {})
    const cut = screen.getAllByRole('button', { name: 'Edit Cut between TestPattern1D and TestPattern1D' })
      .find((candidate) => candidate.getAttribute('data-show-group-occurrence') === 'occ-1')!
    fireEvent.click(cut)
    await act(async () => {})
    return screen.getByRole('dialog', { name: 'Choose Layer Transition' })
  }

  it('opens the Layer Transition palette on a Group Cut inside isolation', async () => {
    const record = groupCutV2Record('tracer-group-cut-palette')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    const palette = await openGroupCutPalette()

    const plan = planShowV2GroupLayerTransitionInsertion(record, 'occ-1', 'g-a', 'g-b')
    if (!plan.enabled) throw new Error('expected room at the Group Cut')
    expect(within(palette).getByText('TestPattern1D to TestPattern1D')).toBeInTheDocument()
    expect(within(palette).getByText(/seconds fits here\./).textContent)
      .toContain(`Up to ${(plan.maxDurationMs / 1000).toFixed(3)} seconds fits here.`)

    expectNoWrite(before, editor.state())
  })

  it('inserts a crossfade on a Group Cut through the group-occurrence door', async () => {
    const record = groupCutV2Record('tracer-group-cut-insert')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const definitionId = groupCutDefinitionId(record)
    const layerId = before.record.composition.groupDefinitions.find((definition) => definition.id === definitionId)!.layers[0]!.id

    const palette = await openGroupCutPalette()
    const duration = within(palette).getByLabelText('Transition duration in seconds exact time')
    fireEvent.change(duration, { target: { value: '0.15' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    fireEvent.click(within(palette).getByRole('button', { name: 'Use Crossfade Transition' }))
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    const request = admission.calls[0].request as { intent: { kind: string; definitionId: string; transition: { id: string; kind: string; durationMs: number; crossfadePolicy?: string; participants: Array<{ id: string; zoneId: string; layerId: string; fromClipId: string; toClipId: string }> } }; baseRevision: number }
    expect(request.intent.kind).toBe('insert-definition-layer-transition')
    expect(request.intent.definitionId).toBe(definitionId)
    expect(request.intent.transition.kind).toBe('crossfade')
    expect(request.intent.transition.durationMs).toBe(150)
    expect(request.intent.transition.crossfadePolicy).toBe('live-live')
    expect(request.intent.transition.participants).toEqual([
      { id: `${request.intent.transition.id}:participant`, zoneId: 'definition-zone', layerId, fromClipId: 'g-a', toClipId: 'g-b' },
    ])
    expect(request.baseRevision).toBe(0)
    const after = editor.state()
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Choose Layer Transition' })).not.toBeInTheDocument()
    const oracle = insertShowGroupDefinitionLayerTransitionV2(
      before.record,
      request.intent as Parameters<typeof insertShowGroupDefinitionLayerTransitionV2>[1],
    )
    expect(oracle.status).toBe('changed')
    if (oracle.status !== 'changed') throw new Error('the oracle refused the admitted intent')
    expect(after.record.composition).toEqual(oracle.record.composition)
    const edited = after.record.composition.groupDefinitions.find((definition) => definition.id === definitionId)!
    expect(edited.transitions).toHaveLength(1)
    expect(edited.transitions[0]).toMatchObject({ fromPlacementId: 'g-a', toPlacementId: 'g-b', kind: 'crossfade', durationMs: 150 })
    expect(after.record.composition.groupOccurrences.map((occurrence) => occurrence.definitionId))
      .toEqual([definitionId, definitionId])
  })

  it('keeps the palette open when the group-occurrence door rejects the insert', async () => {
    const record = groupCutV2Record('tracer-group-cut-refused')
    const editor = openV2EditorForRecord(record)
    const live = getPersonalContentProvider()
    const failingWrite = vi.fn(async (_id: string, _next: ShowRecordV2) => {
      throw new Error('Synthetic group cut insert save failure')
    })
    setPersonalContentProvider({
      ...live,
      id: 'tracer-group-cut-refusal',
      replaceShowV2: failingWrite,
    } as unknown as PersonalContentProvider)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    const palette = await openGroupCutPalette()
    const duration = within(palette).getByLabelText('Transition duration in seconds exact time')
    fireEvent.change(duration, { target: { value: '0.15' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    fireEvent.click(within(palette).getByRole('button', { name: 'Use Crossfade Transition' }))
    await act(async () => {})
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(failingWrite).toHaveBeenCalledTimes(1)
    const livePalette = screen.getByRole('dialog', { name: 'Choose Layer Transition' })
    expect(within(livePalette).getByText(
      'Crossfade could not be inserted because the available time at this junction changed. Reopen the Transition panel and try again.',
    )).toBeInTheDocument()
    const after = editor.state()
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.record.composition).toEqual(before.record.composition)
    expect(after.v2Writes).toBe(0)
  })
})

describe('v2 Add-menu Transition command (#1075 G4b-2d)', () => {
  // Same converted Cut the G4b-2b palette tests open: two exactly-adjacent
  // Clips with 200 ms of free time after them, so the insertion plan is
  // enabled at 200 ms.
  function addMenuCutRecord(id: string): ShowRecordV2 {
    const source = transitionV1Show('crossfade')
    source.id = id
    const converted = convertShowRecordV1ToV2(source)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const record = converted.record
    record.id = id
    const incoming = record.composition.clips.find((clip) => clip.id === 'in')!
    incoming.startMs = 400
    incoming.appearance.keys.forEach((key) => { key.timeMs -= 200 })
    record.composition.transitions = []
    expect(validateShowRecordV2(record)).toEqual([])
    return record
  }

  function openAddMenu(): void {
    fireEvent.click(screen.getByRole('button', { name: 'Add to Show' }))
  }

  it('enables the Add-menu Transition on a selected Clip and opens the palette', async () => {
    const record = addMenuCutRecord('tracer-v2-add-transition-palette')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(clipButton('out'))
    await act(async () => {})
    const before = editor.state()

    openAddMenu()
    const command = screen.getByRole('menuitem', { name: 'Transition to Incoming' })
    expect(command).toBeEnabled()
    fireEvent.click(command)
    await act(async () => {})

    const palette = screen.getByRole('dialog', { name: 'Choose Layer Transition' })
    expect(within(palette).getByText('Outgoing to Incoming')).toBeInTheDocument()
    expectNoWrite(before, editor.state())
  })

  it('inserts a crossfade from the Add menu through the transition-edit door', async () => {
    const record = addMenuCutRecord('tracer-v2-add-transition-insert')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(clipButton('out'))
    await act(async () => {})
    const before = editor.state()

    openAddMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Transition to Incoming' }))
    await act(async () => {})
    const palette = screen.getByRole('dialog', { name: 'Choose Layer Transition' })
    const duration = within(palette).getByLabelText('Transition duration in seconds exact time')
    fireEvent.change(duration, { target: { value: '0.15' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    fireEvent.click(within(palette).getByRole('button', { name: 'Use Crossfade Transition' }))
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    const request = admission.calls[0].request as { intent: ShowTransitionEditIntentV2; baseRevision: number }
    if (request.intent.kind !== 'insert') throw new Error('expected an insert intent')
    expect(request.intent.transition.kind).toBe('crossfade')
    expect(request.intent.transition.durationMs).toBe(150)
    expect(request.intent.transition.crossfadePolicy).toBe('live-live')
    expect(request.intent.transition.participants.map((participant) => [participant.fromClipId, participant.toClipId]))
      .toEqual([['out', 'in']])
    expect(request.baseRevision).toBe(0)
    const after = editor.state()
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Choose Layer Transition' })).not.toBeInTheDocument()
    const oracle = editShowTransitionV2(before.record, request.intent)
    expect(oracle.status).toBe('changed')
    if (oracle.status !== 'changed') throw new Error('the oracle refused the admitted intent')
    expect(after.record.composition).toEqual(oracle.record.composition)
    expect(after.record.composition.clips.find((clip) => clip.id === 'in')!.startMs).toBe(550)
  })

  it('disables the Add-menu Transition with Select a Clip first when nothing is selected', async () => {
    const record = addMenuCutRecord('tracer-v2-add-transition-unselected')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    openAddMenu()
    const reason = 'Select a Clip first.'
    const command = screen.getByRole('menuitem', { name: `Transition unavailable: ${reason}` })
    expect(command).toBeDisabled()
    expect(within(command).getByText(reason)).toBeInTheDocument()
    expectNoWrite(before, editor.state())
  })
})

// ── Time grid ────────────────────────────────────────────────────────────────

/**
 * The timeline's time grid pins the v2 CSS tracks recorded from the v1 renders before
 * the v1 backing was removed. The tracks are `fr` weights, so a different column set resolves to
 * a different sub-pixel origin even when the weights sum to the same total, and
 * every Clip box, ruler tick and label in the timeline then rasters differently
 * (#1065). The assertion is the rendered `style` attribute, which is what the
 * browser lays the surface out from.
 */
describe('v2 time grid columns (#1065)', () => {
  // Pinned literals are the v1 renders recorded before the v1 backing was removed.
  function renderGrid(record: ShowRecordV2): string {
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    return screen.getByTestId('show-timeline-grid').getAttribute('style') ?? ''
  }

  for (const [key, expected] of [
    ['fresh', 'width: calc(100% + 0px); min-width: 0px; grid-template-columns: 0px minmax(0, 30000fr) minmax(0, 2000fr) minmax(0, 30000fr); grid-template-rows: 28px 44px 17px;'],
    ['installation-layouts', 'width: calc(100% + 0px); min-width: 0px; grid-template-columns: 32px minmax(0, 5000fr) minmax(0, 0.001fr) minmax(0, 6000fr) minmax(0, 0.001fr) minmax(0, 6000fr); grid-template-rows: 28px 26px 44px 44px 17px;'],
    ['groups-animation', 'width: calc(100% + 0px); min-width: 0px; grid-template-columns: 0px minmax(0, 16000fr); grid-template-rows: 28px 44px 44px 44px 17px;'],
    ['stock-lesson', 'width: calc(100% + 0px); min-width: 0px; grid-template-columns: 0px minmax(0, 16500fr); grid-template-rows: 28px 44px 18px 17px;'],
  ] as const) {
    it('lays ' + key + ' out in the same grid tracks', () => {
      expect(renderGrid(convertForTest(corpusSource(key)))).toBe(expected)
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
    // The release names the refusal on the resized Clip (#1098).
    expectClipRefusal(clipId, 'Joined to a Transition', 'Resize the Transition to change this edge.')
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

  it('moves a joined Clip within its Layer without asking (#1069)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice1-move-connected'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('main'), 'dragover', 30)
    surface.fire(surface.lane('main'), 'drop', 30)
    await act(async () => {})

    const after = editor.state()
    expect(screen.queryByRole('alertdialog', { name: 'Move connected Clip?' })).toBeNull()
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

  it('confirms a cross-Layer drop that removes a Transition on v2 (#1069)', async () => {
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

    const dialog = screen.getByRole('alertdialog', { name: 'Move connected Clip?' })
    expect(dialog).toHaveTextContent('Moving this Clip to another Layer also removes its connected Transition. Other Clip durations and positions stay unchanged.')
    expectNoWrite(before, editor.state())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move Clip and remove Transition' }))
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

  it('reanchors a pinned Clip detail after confirming a cross-Layer drop (#1069)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-pinned-reroute'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const originalClip = clipButton('resize-a')
    fireEvent.click(originalClip)
    const detail = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    fireEvent.click(within(detail).getByRole('button', { name: 'Pin Entity Detail Panel' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-pinned', 'true')

    const surface = dragSurface('resize-a')
    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('overlay'), 'dragover', DROP_X)
    surface.fire(surface.lane('overlay'), 'drop', DROP_X)
    await act(async () => {})
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-pinned', 'true')

    const dialog = screen.getByRole('alertdialog', { name: 'Move connected Clip?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move Clip and remove Transition' }))
    await act(async () => {})

    const movedClip = clipButton('resize-a')
    expect(movedClip).not.toBe(originalClip)
    expect(originalClip.isConnected).toBe(false)
    const movedRect = vi.spyOn(movedClip, 'getBoundingClientRect')
    await waitFor(() => expect(movedRect).toHaveBeenCalled())
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-pinned', 'true')
    expect(authoredClip(editor.state().record, 'resize-a').layerId).toBe(
      editor.state().record.composition.layers.find((layer) => layer.rank === 1)!.id,
    )
  })

  it('cancels a cross-Layer drop with no write (#1069)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-connected-cancel'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('overlay'), 'dragover', DROP_X)
    surface.fire(surface.lane('overlay'), 'drop', DROP_X)
    await act(async () => {})

    const dialog = screen.getByRole('alertdialog', { name: 'Move connected Clip?' })
    expectNoWrite(before, editor.state())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await act(async () => {})

    expect(screen.queryByRole('alertdialog', { name: 'Move connected Clip?' })).toBeNull()
    expectNoWrite(before, editor.state())
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

// A converted `--layout-N` split with a second logical Clip: deleting one
// segment removes every segment of that logical Clip in one accepted edit,
// as v1 does (#1068 item 1b). Undo restores both segments.
function layoutSplitV2Record(id: string): ShowRecordV2 {
  const probeView = { mirror: false, phase: 0, brightness: 1 }
  const show: ShowRecord = convertibleV1Show()
  show.scenes = [
    { id: 'a', name: 'A', durationMs: 400 },
    { id: 'b', name: 'B', durationMs: 400 },
    { id: 'c', name: 'C', durationMs: 400 },
  ]
  show.zones = [
    { id: 'zone', name: 'Main', nominalPixelCount: 16 },
    { id: 'other', name: 'Other', nominalPixelCount: 16 },
  ]
  show.routingLayouts = [
    { id: 'full', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } },
    { id: 'other-only', name: 'Other only', zones: [], logical: { kind: 'single', zoneIds: ['other'] } },
  ]
  show.transitions = [
    { id: 'to-other', afterSceneId: 'a', kind: 'routing', layoutId: 'other-only', durationMs: 0, easing: { curve: 'linear' } },
    { id: 'to-full', afterSceneId: 'b', kind: 'routing', layoutId: 'full', durationMs: 0, easing: { curve: 'linear' } },
  ]
  show.composition = {
    version: 1,
    executionModel: 'deterministic-loop',
    durationMs: 1_200,
    patternInstances: [{
      id: 'instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    scenes: (['a', 'b', 'c'] as const).map((sceneId, index) => ({
      sceneId,
      zones: [
        {
          zoneId: 'zone',
          main: [{
            id: index === 0 ? 'solo' : `solo--span-${sceneId}`,
            ...(index === 0 ? {} : { logicalClipId: 'solo' }),
            instanceId: 'instance', startMs: 0, durationMs: 400, view: probeView,
          }],
          overlays: [],
        },
        { zoneId: 'other', main: [], overlays: [] },
      ],
    })),
  }
  const converted = convertShowRecordV1ToV2(show)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  record.id = id
  const segment = record.composition.clips.find((clip) => clip.id === 'solo--layout-1')
  if (!segment) throw new Error('No solo--layout-1 segment to copy.')
  const otherLayer = record.composition.layers.find((layer) => layer.zoneId !== segment.zoneId)
  if (!otherLayer) throw new Error('No second Zone Layer for the extra logical Clip.')
  // The extra logical Clip lives inside the `other-only` Layout occurrence,
  // so the prepared-stage capture stays qualified and the delete can commit.
  record.composition.clips.push({
    ...structuredClone(segment),
    id: 'other',
    logicalClipId: undefined,
    zoneId: otherLayer.zoneId,
    layerId: otherLayer.id,
    startMs: 400,
    durationMs: 400,
    appearance: { keys: [{ id: 'other:appearance:1', timeMs: 400, value: structuredClone(segment.appearance.keys[0].value) }] },
  })
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

describe('v2 logical-clip delete (#1068 item 1b)', () => {
  it('deletes every layout-split segment in one edit and undoes to both', async () => {
    const editor = openV2EditorForRecord(layoutSplitV2Record('slice2-logical-delete'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(document.querySelector<HTMLElement>('[data-show-selection-key="clip:solo--layout-1"]')!)
    await act(async () => {})
    const before = editor.state()
    expect(before.record.composition.clips.map((clip) => clip.id).sort()).toEqual(
      ['other', 'solo--layout-1', 'solo--layout-2'],
    )

    fireEvent.keyDown(document, { key: 'Delete' })
    await act(async () => {})

    const after = editor.state()
    expect(screen.queryByRole('alertdialog', { name: 'Remove connected Clip?' })).not.toBeInTheDocument()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipDelete'])
    expect(deleteSubmissions()).toEqual([{ intent: { kind: 'delete-clip', clipId: 'solo--layout-1' }, baseRevision: 0 }])
    expect(after.record.composition.clips.map((clip) => clip.id)).toEqual(['other'])
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })
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
  const option = screen.queryByRole('option', { name: new RegExp(`^${optionName}(?:, removes .*)?$`) })
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
  function multiSegmentAppearanceRecord(id: string): ShowRecordV2 {
    const record = connectedV2Record(id)
    const clip = record.composition.clips.find(candidate => candidate.id === 'overlay-a')!
    const first = clip.appearance.keys[0]
    clip.appearance.keys = [0, 1, 2].map(index => ({
      ...structuredClone(first), id: `overlay-appearance-${index}`, timeMs: first.timeMs + index * 500,
      value: { ...structuredClone(first.value), view: { ...first.value.view, brightness: 1 - index / 5 } },
    }))
    expect(validateShowRecordV2(record)).toEqual([])
    return record
  }

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

  it('a whole-Clip Brightness write on a multi-segment Clip confirms, then writes every segment (#1069)', async () => {
    const editor = openV2EditorForRecord(multiSegmentAppearanceRecord('slice5-brightness-confirm'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()
    const keysBefore = before.record.composition.clips.find(clip => clip.id === 'overlay-a')!.appearance.keys

    typeAndCommit('Brightness exact percentage', '63')
    await act(async () => {})

    const dialog = screen.getByRole('alertdialog', { name: 'Change every segment?' })
    expect(dialog).toHaveTextContent('This Clip has 3 held segments. This change applies to all of them.')
    expect(appearanceSubmissions()).toEqual([])
    expectNoWrite(before, editor.state())

    fireEvent.click(within(dialog).getByRole('button', { name: 'Change all segments' }))
    await act(async () => {})

    const after = editor.state()
    expect(appearanceSubmissions()).toEqual([{
      intent: { kind: 'appearance', clipId: 'overlay-a', scope: 'whole-clip', patch: { view: { brightness: 0.63 } } },
      baseRevision: 0,
    }])
    expect(after.record.composition.clips.find(clip => clip.id === 'overlay-a')!.appearance.keys.map(key => key.value.view.brightness))
      .toEqual([0.63, 0.63, 0.63])
    expect(after.record.composition.clips.find(clip => clip.id === 'overlay-a')!.appearance.keys.map(key => key.timeMs))
      .toEqual(keysBefore.map(key => key.timeMs))
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('cancelling the multi-segment write writes nothing (#1069)', async () => {
    const editor = openV2EditorForRecord(multiSegmentAppearanceRecord('slice5-brightness-cancel'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()

    typeAndCommit('Brightness exact percentage', '63')
    await act(async () => {})
    const dialog = screen.getByRole('alertdialog', { name: 'Change every segment?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await act(async () => {})

    expect(admission.calls).toEqual([])
    expectNoWrite(before, editor.state())
    expect(editor.state().record.composition.clips.find(clip => clip.id === 'overlay-a')!.appearance.keys.map(key => key.value.view.brightness))
      .toEqual([1, 0.8, 0.6])
  })

  async function multiSegmentGroupAppearanceRecord(id: string): Promise<ShowRecordV2> {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = id
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap(definition => definition.patternInstances)]) delete instance.controlTargets
    const child = record.composition.groupDefinitions[0]!.clips[0]!
    const first = child.appearance.keys[0]!
    child.appearance.keys = [0, 1, 2].map(index => ({
      ...structuredClone(first), id: `group-appearance-${index}`, timeMs: index * 100,
      value: { ...structuredClone(first.value), view: { ...first.value.view, brightness: 1 - index / 5 } },
    }))
    expect(validateShowRecordV2(record)).toEqual([])
    return record
  }

  it('a Group child multi-segment write confirms before overwriting the definition segments (#1069)', async () => {
    const editor = openV2EditorForRecord(await multiSegmentGroupAppearanceRecord('group-held-brightness-confirm'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })
    const before = editor.state()
    const keysBefore = before.record.composition.groupDefinitions[0]!.clips[0]!.appearance.keys
    expect(keysBefore).toHaveLength(3)

    typeAndCommit('Brightness exact percentage', '63')
    await act(async () => {})

    const dialog = screen.getByRole('alertdialog', { name: 'Change every segment?' })
    expect(dialog).toHaveTextContent('This Clip has 3 held segments. This change applies to all of them.')
    expect(admission.calls).toEqual([])
    expectNoWrite(before, editor.state())

    fireEvent.click(within(dialog).getByRole('button', { name: 'Change all segments' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(admission.calls).toHaveLength(1)
    const keysAfter = after.record.composition.groupDefinitions[0]!.clips[0]!.appearance.keys
    expect(keysAfter.map(key => key.value.view.brightness)).toEqual([0.63, 0.63, 0.63])
    expect(keysAfter.map(key => key.timeMs)).toEqual(keysBefore.map(key => key.timeMs))
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('cancelling a Group child multi-segment write writes nothing (#1069)', async () => {
    const editor = openV2EditorForRecord(await multiSegmentGroupAppearanceRecord('group-held-brightness-cancel'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })
    const before = editor.state()

    typeAndCommit('Brightness exact percentage', '63')
    await act(async () => {})
    const dialog = screen.getByRole('alertdialog', { name: 'Change every segment?' })
    expect(admission.calls).toEqual([])
    expectNoWrite(before, editor.state())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await act(async () => {})

    expect(admission.calls).toEqual([])
    expectNoWrite(before, editor.state())
    expect(editor.state().record.composition.groupDefinitions[0]!.clips[0]!.appearance.keys.map(key => key.value.view.brightness))
      .toEqual([1, 0.8, 0.6])
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

  it('unticking a control target with no lane removes it without asking (#1069)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice4-control-remove-plain'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})
    const enabled = editor.state()
    expect(instanceSubmissions()).toHaveLength(1)

    // Unchecking the last target commits the removal directly: no lane means
    // no confirmation, as on v1.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})

    const after = editor.state()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(instanceSubmissions()).toEqual([
      { intent: { clipId: 'resize-a', properties: { controls: { sliderSpeed: 0.5 } } }, baseRevision: 0 },
      { intent: { clipId: 'resize-a', properties: { remove_controls: ['sliderSpeed'] } }, baseRevision: 1 },
    ])
    expect(after.record.composition.patternInstances.find(instance => instance.id === 'resize-instance')?.controlTargets).toBeUndefined()
    expect((await authoredClipValue(editor.showId, 'resize-a')).simulation.controlTargets).toBeUndefined()
    expect(after.history.past).toEqual([...enabled.history.past, enabled.record])
    expect(after.history.future).toEqual([])
    expect(after.revision).toBe(enabled.revision + 1)
    expect(after.v2Writes).toBe(enabled.v2Writes + 1)
    expect(after.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])
    await expectUndoRedoExact(editor, enabled)
  })

  it('unticking a control target with a lane confirms, then removes both (#1069)', async () => {
    const record = connectedV2Record('slice4-control-remove-lane')
    record.composition.patternInstances.find(instance => instance.id === 'resize-instance')!.controlTargets = { sliderSpeed: 0.5 }
    record.composition.propertyTracks.push({ id: 'lane-speed', target: { kind: 'instance-control', instanceId: 'resize-instance', exportName: 'sliderSpeed' },
      activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'lane-speed-a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } }, { id: 'lane-speed-b', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] })
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')
    const before = editor.state()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})

    const dialog = screen.getByRole('alertdialog', { name: 'Remove Speed control?' })
    expect(dialog).toHaveTextContent('The Speed animation will be removed.')
    expect(instanceSubmissions()).toHaveLength(0)
    expect(editor.state().record).toBe(before.record)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Speed' }))
    await act(async () => {})

    const after = editor.state()
    expect(instanceSubmissions()).toEqual([
      { intent: { clipId: 'resize-a', properties: { remove_controls: ['sliderSpeed'] } }, baseRevision: 0 },
    ])
    expect(after.record.composition.patternInstances.find(instance => instance.id === 'resize-instance')?.controlTargets).toBeUndefined()
    expect(after.record.composition.propertyTracks.some(track => track.id === 'lane-speed')).toBe(false)
    expectOneEdit(before, after)
    expect(legacy.calls).toEqual([])
    await expectUndoRedoExact(editor, before)
  })

  it('cancelling the control-target removal writes nothing (#1069)', async () => {
    const record = connectedV2Record('slice4-control-remove-cancel')
    record.composition.patternInstances.find(instance => instance.id === 'resize-instance')!.controlTargets = { sliderSpeed: 0.5 }
    record.composition.propertyTracks.push({ id: 'lane-speed', target: { kind: 'instance-control', instanceId: 'resize-instance', exportName: 'sliderSpeed' },
      activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'lane-speed-a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } }, { id: 'lane-speed-b', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] })
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')
    const before = editor.state()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})

    const dialog = screen.getByRole('alertdialog', { name: 'Remove Speed control?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await act(async () => {})

    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)
    expect(editor.state().history).toEqual(before.history)
    expect(editor.state().v2Writes).toBe(before.v2Writes)
  })

  it('a Group child untick of a laned control confirms before removing the definition lane (#1069)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-control-remove-lane'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) {
      instance.pattern = { kind: 'stock', id: 'CometLoom' }
      instance.patternName = 'CometLoom'
      delete instance.controlTargets
    }
    const definition = record.composition.groupDefinitions[0]!
    definition.patternInstances[0]!.controlTargets = { sliderSpeed: 0.5 }
    const boundInstanceId = record.composition.groupOccurrences[0]!.instanceBindings?.[definition.patternInstances[0]!.id]
    record.composition.patternInstances.find((instance) => instance.id === boundInstanceId)!.controlTargets = { sliderSpeed: 0.5 }
    definition.propertyTracks.push({ id: 'lane-speed', target: { kind: 'instance-control', instanceId: definition.patternInstances[0]!.id, exportName: 'sliderSpeed' },
      activeStartMs: 0, activeDurationMs: 400, keyframes: [{ id: 'lane-speed-a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } }, { id: 'lane-speed-b', timeMs: 400, value: 0.8, easing: { curve: 'linear' } }] })
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })
    showTab('Pattern')
    const before = editor.state()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})

    const dialog = screen.getByRole('alertdialog', { name: 'Remove Speed control?' })
    expect(dialog).toHaveTextContent('The Speed animation will be removed.')
    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Speed' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(admission.calls).toHaveLength(1)
    expect(after.record.composition.groupDefinitions[0]!.patternInstances[0]!.controlTargets).toBeUndefined()
    expect(after.record.composition.groupDefinitions[0]!.propertyTracks.some((track) => track.id === 'lane-speed')).toBe(false)
    expectOneEdit(before, after)
    expect(legacy.calls).toEqual([])
    await expectUndoRedoExact(editor, before)
  })

  it('cancelling a Group child control-target removal writes nothing (#1069)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-control-remove-cancel'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) {
      instance.pattern = { kind: 'stock', id: 'CometLoom' }
      instance.patternName = 'CometLoom'
      delete instance.controlTargets
    }
    const definition = record.composition.groupDefinitions[0]!
    definition.patternInstances[0]!.controlTargets = { sliderSpeed: 0.5 }
    const boundInstanceId = record.composition.groupOccurrences[0]!.instanceBindings?.[definition.patternInstances[0]!.id]
    record.composition.patternInstances.find((instance) => instance.id === boundInstanceId)!.controlTargets = { sliderSpeed: 0.5 }
    definition.propertyTracks.push({ id: 'lane-speed', target: { kind: 'instance-control', instanceId: definition.patternInstances[0]!.id, exportName: 'sliderSpeed' },
      activeStartMs: 0, activeDurationMs: 400, keyframes: [{ id: 'lane-speed-a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } }, { id: 'lane-speed-b', timeMs: 400, value: 0.8, easing: { curve: 'linear' } }] })
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })
    showTab('Pattern')
    const before = editor.state()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})

    const dialog = screen.getByRole('alertdialog', { name: 'Remove Speed control?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await act(async () => {})

    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)
    expect(editor.state().history).toEqual(before.history)
    expect(editor.state().v2Writes).toBe(before.v2Writes)
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

  it('clamps a sub-minimum Edge width on v2 as v1 does (#1069)', async () => {
    const editor = openV2EditorForRecord(stagedV2Record('slice3-aperture-shape'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Place')

    fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' }))
    await act(async () => {})
    chooseOption('Aperture shape', 'ellipse')
    await act(async () => {})

    typeAndCommit('Aperture edge width', '0.0005')
    await act(async () => {})

    const submissions = appearanceSubmissions()
    expect(submissions).toHaveLength(3)
    const [, , feather] = submissions
    expect(feather.baseRevision).toBe(2)
    if (feather.intent.kind !== 'appearance') throw new Error('Expected an appearance intent.')
    expect(feather.intent.patch).toEqual({ aperture: { feather: 0.001 } })
    expect((await authoredClipValue(editor.showId, 'overlay-a')).viewport.feather).toBe(0.001)
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

  it('writes a packed shadow color edit on v2 (#1069)', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('slice3-effect-param'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Effects')

    await addEffectThroughPalette('Color map')
    typeAndCommit('Shadow Color exact value', '#804020')
    await act(async () => {})

    expect(appearanceSubmissions()).toHaveLength(2)
    const [, shadow] = appearanceSubmissions()
    expect(shadow).toEqual({
      intent: {
        kind: 'update-effect', clipId: 'overlay-a', scope: 'whole-clip',
        effectId: 'color-map', effectKind: 'color-map', parameter: 'shadowColor', value: '#804020',
      },
      baseRevision: 1,
    })
    const value = await authoredClipValue(editor.showId, 'overlay-a')
    expect(value.effects).toHaveLength(1)
    expect(value.effects[0]).toMatchObject({
      id: 'color-map', kind: 'color-map',
      shadowR: 0x80 / 255, shadowG: 0x40 / 255, shadowB: 0x20 / 255,
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

    typeAndCommit('Start seconds exact time', '12')
    await act(async () => {})

    const after = editor.state()
    expect(planned.calls).toHaveLength(0)
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
})

// ── Slice-4 entry policy and Replace Pattern (#1066) ─────────────────────────
// The restart write reaches the entry-policy door and the Source pattern
// combobox reaches the replacement door, both through the same v2 inspector
// commit as slice 3. Every accepted edit is one history entry and one save;
// refusals and no-ops write nothing and keep record identity; no legacy owner
// runs. The replacement adapter confirms incompatible control loss before
// submitting one edit (#1069).
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

  it('shows the same one-lane loss in the Source pattern picker and confirmation (#1069)', async () => {
    const record = connectedV2Record('slice4-replace-lossy-picker')
    record.composition.patternInstances.find(instance => instance.id === 'resize-instance')!.controlTargets = { sliderSpeed: 0.5 }
    record.composition.propertyTracks.push({ id: 'lost-speed', target: { kind: 'instance-control', instanceId: 'resize-instance', exportName: 'sliderSpeed' },
      activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'lost-speed-a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } }, { id: 'lost-speed-b', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] })
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')
    const pattern = screen.getByRole('combobox', { name: 'Source pattern' })
    fireEvent.focus(pattern)
    expect(screen.getByRole('option', { name: 'TestPattern2D, removes 1 property lane' })).toHaveTextContent('removes 1 property lane')
    expect(screen.getByRole('option', { name: 'CometLoom' })).not.toHaveTextContent('removes')
    fireEvent.click(screen.getByRole('option', { name: 'TestPattern2D, removes 1 property lane' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Use TestPattern2D?' })
    expect(dialog).toHaveTextContent('The Speed animation will be removed.')
    expect(editor.state().record.composition.propertyTracks.some(track => track.id === 'lost-speed')).toBe(true)
  })

  it('confirms a lossy Replace Pattern on v2 and applies it once (#1069)', async () => {
    const record = connectedV2Record('slice4-replace-lossy-confirm')
    record.composition.patternInstances.find(instance => instance.id === 'resize-instance')!.controlTargets = { sliderSpeed: 0.5 }
    record.composition.propertyTracks.push({ id: 'lost-speed', target: { kind: 'instance-control', instanceId: 'resize-instance', exportName: 'sliderSpeed' },
      activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'lost-speed-a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } }, { id: 'lost-speed-b', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] })
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')
    const before = editor.state()
    pickSourcePattern('TestPattern2D')
    await act(async () => {})
    const dialog = screen.getByRole('alertdialog', { name: 'Use TestPattern2D?' })
    expect(dialog).toHaveClass('z-[90]')
    expect(dialog).toHaveTextContent("TestPattern2D doesn't have the Speed control. The Speed animation will be removed.")
    expect(replacementSubmissions()).toHaveLength(0)
    expect(editor.state().record).toBe(before.record)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use TestPattern2D' }))
    await act(async () => {})
    const after = editor.state()
    expect(admission.calls.map(call => call.door)).toEqual(['admitShowV2PilotClipReplacementEdit'])
    expect(replacementSubmissions()).toHaveLength(1)
    expect(after.record.composition.patternInstances.find(instance => instance.id === 'resize-instance')?.controlTargets).toEqual({})
    expect(after.record.composition.propertyTracks.some(track => track.id === 'lost-speed')).toBe(false)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('cancels a lossy Replace Pattern on v2 with no write (#1069)', async () => {
    const record = connectedV2Record('slice4-replace-lossy-cancel')
    record.composition.patternInstances.find(instance => instance.id === 'resize-instance')!.controlTargets = { sliderSpeed: 0.5 }
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    showTab('Pattern')
    const before = editor.state()
    pickSourcePattern('TestPattern2D')
    const dialog = screen.getByRole('alertdialog', { name: 'Use TestPattern2D?' })
    expect(dialog).toHaveTextContent('Speed value will be removed.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await act(async () => {})
    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)
    expect(editor.state().history).toEqual(before.history)
    expect(editor.state().v2Writes).toBe(before.v2Writes)
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
// (Trails, portable reference, target Controller) through the show-metadata
// door, every accepted edit one history entry and one save. The drag preview
// paints from the v2-projected view and never writes; the commit reads the
// prepared capture, never preview state. A shortened end that would cut
// protected content refuses with no write instead of clamping.
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

  it('writes Target controller through the Show metadata door on v2 (#1091)', async () => {
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
    expect(showMetadataSubmissions()).toEqual([{
      intent: { command: 'set_target_controller_profile', input: { profile_id: 'profile-1' } },
      baseRevision: 0,
    }])
    expect(after.record.targetControllerProfileId).toBe('profile-1')
    expectOneEdit(before, after)
    fireEvent.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await act(async () => {})
    expect(editor.state().record.targetControllerProfileId).toBeUndefined()
  })
})

describe('v2 target profile (#1091 item 4)', () => {
  function twoProfiles(): void {
    act(() => {
      useControllerProfileStore.setState({
        profiles: [
          { id: 'profile-1', name: 'Profile 1', board: { kind: 'pixelblaze-v3-standard' }, inputs: [], globalTransforms: [], patternBindings: [], lastKnownPixelCount: 60, updatedAt: 1 },
          { id: 'profile-2', name: 'Profile 2', board: { kind: 'pixelblaze-v3-standard' }, inputs: [], globalTransforms: [], patternBindings: [], lastKnownPixelCount: 120, updatedAt: 2 },
        ],
        profilesLoaded: true,
      })
    })
  }

  function resolvedProfileIds(): Array<string | undefined> {
    return compatibilityProfiles.calls.map((call) => call?.id)
  }

  it('resolves the named target profile for a v2 record with no live Controller', async () => {
    const record = installationV2Record('item4-target-profile')
    record.targetControllerProfileId = 'profile-2'
    openV2EditorForRecord(record)
    twoProfiles()
    render(<ShowEditor showId={record.id} recordVersion={2} />)
    await act(async () => {})

    // No live Controller, so the compatibility surface reads the record's
    // named profile rather than the first profile.
    expect(compatibilityProfiles.calls.length).toBeGreaterThan(0)
    const ids = resolvedProfileIds()
    expect(ids[ids.length - 1]).toBe('profile-2')
  })

  it('resolves no target profile for a v2 portable-2d record', async () => {
    const record = connectedV2Record('item4-portable')
    expect(record.outputContract.kind).toBe('portable-2d')
    record.targetControllerProfileId = 'profile-2'
    openV2EditorForRecord(record)
    twoProfiles()
    render(<ShowEditor showId={record.id} recordVersion={2} />)
    await act(async () => {})

    expect(compatibilityProfiles.calls.length).toBeGreaterThan(0)
    const ids = resolvedProfileIds()
    expect(ids[ids.length - 1]).toBeUndefined()
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
// A Group child's animation writes reach the same door through the definition
// owner (#1075 G3); its cases live with the Group occurrence writes.
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
    const record = convertForTest(structuredClone(stock.show) as ShowRecord)
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

  function renderV2(source: ShowRecord): void {
    const editor = openV2EditorForRecord(convertForTest(source))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
  }

  it("reads each section's repeat scale in the cells for the same Show", async () => {
    const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!
    renderV2(structuredClone(stock.show) as ShowRecord)

    // Cells recorded from the v1 render before the v1 backing was removed.
    expect(laneCells()).toEqual(['2|3|1x', '4|3|1x', '6|3|1x', '8|3|1x', '10|3|1x', '12|3|1x', '14|3|1x', '16|3|1x', '18|3|4x'])
    expect(screen.getByTestId('show-timeline-grid').getAttribute('style')).toBe('width: calc(100% + 0px); min-width: 0px; grid-template-columns: 32px minmax(0, 5000fr) minmax(0, 0.001fr) minmax(0, 5000fr) minmax(0, 0.001fr) minmax(0, 5000fr) minmax(0, 0.001fr) minmax(0, 5000fr) minmax(0, 0.001fr) minmax(0, 5000fr) minmax(0, 0.001fr) minmax(0, 5000fr) minmax(0, 0.001fr) minmax(0, 5000fr) minmax(0, 1800fr) minmax(0, 5000fr) minmax(0, 1800fr) minmax(0, 5000fr); grid-template-rows: 28px 26px 26px 44px 44px 18px 18px 18px 18px 18px 18px 18px 44px 17px;')
  })

  it('draws a boundary button for every boundary Transition, and selecting it opens that boundary (#1066 slice 9c2b)', async () => {
    const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!
    renderV2(structuredClone(stock.show) as ShowRecord)
    const buttons = () => Array.from(screen.getByRole('group', { name: 'Sample repeat lane' }).querySelectorAll('button'))
      .map((button) => `${button.getAttribute('aria-label')}|${button.style.gridColumn}|${button.textContent}|${button.getAttribute('data-show-selection-key')}`)

    // Cut-boundary buttons are absent on v2 (spec :776), so only the two Transition boundaries draw.
    expect(buttons()).toEqual([
      'Edit repeat scale at 36.8: LineDancer2D + 1|15|—|transition:transition-effect-parameter',
      'Edit repeat scale at 43.6: LineDancer2D + 1|17|1x→4x|transition:transition-split-position',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Edit repeat scale at 43.6: LineDancer2D + 1' }))
    await act(async () => {})
    expect(within(boundaryPanel()).getByRole('checkbox', { name: 'Animate repeat scale' })).toBeChecked()
    expect(admission.calls).toEqual([])
  })

  // The Cut-boundary lane buttons are absent on v2 (docs/plans/scene-retirement-specification.md:776).
  it('draws no lane for a Show that never sets a repeat scale', () => {
    renderV2(corpusSource('stock-lesson'))

    expect(laneCells()).toBeNull()
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
    const record = convertForTest(source)
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

  it('retimes a show-repeat-scale ramp on one inspector Duration edit and Undo restores it', async () => {
    const { record } = nativeWholeOutputBoundary('issue-1061-inspector-duration')
    const transition = record.composition.transitions[0]
    transition.propertyRamps = [{ target: { kind: 'show-repeat-scale' }, from: 1, durationMs: 800 }]
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: /Edit crossfade Transition between/ }))
    await act(async () => {})
    const duration = within(boundaryPanel()).getByRole('textbox', { name: /^Duration/ })
    expect(duration).toHaveValue('2')
    fireEvent.change(duration, { target: { value: '1.5' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    const after = editor.state()
    expect(after.record.composition.transitions[0].propertyRamps).toEqual([
      { target: { kind: 'show-repeat-scale' }, from: 1, durationMs: 600 },
    ])
    expectOneEdit(before, after)
    fireEvent.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await act(async () => {})
    expect(editor.state().record.composition).toEqual(before.record.composition)
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
    const record = convertForTest(source)
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

describe('v2 marquee selection and Make Group (#1066 L2583)', () => {
  const box = (left: number, top: number, right: number, bottom: number): DOMRect => ({
    left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON() {},
  })

  /** Two Clips on different Layers of one Zone, with no Transition between them. */
  function groupMarqueeRecord(id: string): ShowRecordV2 {
    return {
      version: 2,
      id,
      name: 'Group marquee',
      zones: [{ id: 'zone', name: 'Main', nominalPixelCount: 60, color: '#38bdf8' }],
      zoneLayouts: [{ id: 'layout', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } }],
      stageMapId: null,
      outputContract: {
        version: 1,
        kind: 'portable-2d',
        referenceMapId: 'plane',
        referencePixelCount: 60,
        compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
      },
      composition: {
        version: 2,
        executionModel: 'continuous',
        showEndMs: 10_000,
        sampleRemap: { repeatScale: 1 },
        patternInstances: [
          { id: 'instance-main', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Main pulse', time: { timeScale: 1, timeOffsetMs: 0 } },
          { id: 'instance-overlay', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Overlay pulse', time: { timeScale: 1, timeOffsetMs: 0 } },
        ],
        layers: [
          { id: 'layer-main', zoneId: 'zone', name: 'Main', rank: 0 },
          { id: 'layer-overlay', zoneId: 'zone', name: 'Overlay', rank: 1 },
        ],
        clips: [
          { id: 'clip-main', instanceId: 'instance-main', zoneId: 'zone', layerId: 'layer-main', startMs: 0, durationMs: 5_000, entryPolicy: 'continue', zoneSampleMode: 'independent', appearance: { keys: [{ id: 'appearance-main', timeMs: 0, value: { opacity: 1, view: { brightness: 1, phase: 0, mirror: false }, effects: [] } }] } },
          { id: 'clip-overlay', instanceId: 'instance-overlay', zoneId: 'zone', layerId: 'layer-overlay', startMs: 0, durationMs: 5_000, entryPolicy: 'continue', zoneSampleMode: 'independent', appearance: { keys: [{ id: 'appearance-overlay', timeMs: 0, value: { opacity: 1, view: { brightness: 1, phase: 0, mirror: false }, effects: [] } }] } },
        ],
        transitions: [],
        layoutOccurrences: [{ id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 10_000, parameters: {} }],
        propertyTracks: [],
        markers: [],
        groupDefinitions: [],
        groupOccurrences: [],
      },
      updatedAt: 1,
    }
  }

  function openGroupMarqueeEditor(id: string): OpenV2Editor {
    return openV2EditorForRecord(groupMarqueeRecord(id))
  }

  /** Drags a marquee rectangle covering both Clips, as the browser test does. */
  function marqueeOverBothClips(): void {
    const grid = screen.getByTestId('show-timeline-grid')
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(box(0, 0, 400, 200))
    const clips = Array.from(document.querySelectorAll<HTMLElement>('[data-show-composition-clip="true"]'))
    expect(clips).toHaveLength(2)
    const clipBoxes = [box(20, 30, 120, 70), box(20, 100, 120, 140)]
    clips.forEach((clip, index) => {
      vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue(clipBoxes[index]!)
    })
    fireEvent.pointerDown(grid, { button: 0, clientX: 350, clientY: 10 })
    act(() => {
      for (const [type, clientX, clientY] of [
        ['pointermove', 200, 100],
        ['pointermove', 10, 190],
        ['pointerup', 10, 190],
      ] as const) {
        const event = new Event(type, { bubbles: true, cancelable: true })
        Object.defineProperties(event, { clientX: { value: clientX }, clientY: { value: clientY } })
        fireEvent(window, event)
      }
    })
  }

  function groupCommand(): HTMLElement {
    return screen.getByRole('button', { name: 'Make Group from selection' })
  }

  async function marqueeAndMakeGroup(id: string): Promise<OpenV2Editor> {
    const editor = openGroupMarqueeEditor(id)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    marqueeOverBothClips()
    await act(async () => {})
    fireEvent.click(groupCommand())
    await act(async () => {})
    return editor
  }

  it('selects both Clips with the marquee and enables Make Group', async () => {
    const editor = openGroupMarqueeEditor('v2-marquee-selects')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)

    marqueeOverBothClips()
    await act(async () => {})

    expect(document.querySelector('[data-show-timeline-marquee]')).toBeNull()
    expect(groupCommand()).not.toHaveAttribute('aria-disabled')
    const selection = useShowEditorViewStore.getState().selection
    expect(selection.kind).toBe('multi')
    if (selection.kind !== 'multi') throw new Error('Marquee did not produce a multi selection.')
    expect([...selection.groupSelection.placementIds].sort())
      .toEqual(['clip-main', 'clip-overlay'])
    expect(selection.groupSelection.transitionIds).toEqual([])
  })

  it('creates one Group, selects it, and undoes it', async () => {
    const editor = await marqueeAndMakeGroup('v2-make-group')

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotCreateGroup'])
    expect(after.record.composition.groupDefinitions).toHaveLength(1)
    expect(after.record.composition.groupDefinitions[0]!.name).toBe('Group')
    expect(after.record.composition.groupOccurrences).toHaveLength(1)
    expect(after.history.past).toHaveLength(1)
    const occurrenceId = after.record.composition.groupOccurrences[0]!.id
    expect(useShowEditorViewStore.getState().selection)
      .toEqual({ kind: 'group', occurrenceId })
    expect(after.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await act(async () => {})

    const undone = editor.state()
    expect(undone.record.composition.groupDefinitions).toHaveLength(0)
    expect(undone.record.composition.groupOccurrences).toHaveLength(0)
  })

  it('starts no marquee while a Group occurrence is isolated', async () => {
    await marqueeAndMakeGroup('v2-marquee-isolated')

    fireEvent.doubleClick(screen.getAllByRole('button', { name: 'Select Group Group' })[0]!)
    await act(async () => {})
    expect(screen.getByRole('status', { name: 'Group isolation: Group' })).toBeVisible()

    fireEvent.pointerDown(screen.getByTestId('show-timeline-grid'), { button: 0, clientX: 350, clientY: 10 })
    await act(async () => {})

    expect(document.querySelector('[data-show-timeline-marquee]')).toBeNull()
  })
})

// ── v2 Group occurrence Duplicate, Make unique and Ungroup (#1066) ───────────
// The Group inspector's three connected writes submit through the
// group-occurrence admission door on the v2 backing. The duplicate source is
// the earlier occurrence; its duplicate lands immediately after itself. The
// packed `propertyEditGroupRecord` cannot host that duplicate without
// overlapping its sibling (the owner refuses `invalid-result`), so the success
// case spaces the sibling to the next adjacent slot while keeping two linked
// occurrences of one definition.
describe('v2 Group occurrence inspector writes (#1066)', () => {
  async function selectGroupOccurrence(index: number): Promise<void> {
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[index]!)
    await act(async () => {})
  }

  it('duplicates the earlier occurrence immediately after itself', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const { groupOccurrenceDuration } = await import('@/engine/showGroupsV2')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-duplicate'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    record.composition.showEndMs = 2_000
    record.composition.layoutOccurrences[0]!.durationMs = 2_000
    record.composition.groupOccurrences[1]!.startMs = 1_000
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectGroupOccurrence(0)
    expect(screen.getByText('2 linked occurrences')).toBeInTheDocument()
    const before = editor.state()
    const source = before.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-0')!
    const definition = before.record.composition.groupDefinitions.find((candidate) => candidate.id === source.definitionId)!
    const expectedStartMs = source.startMs + groupOccurrenceDuration(definition, source)

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Group occurrence' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(after.record.composition.groupOccurrences).toHaveLength(3)
    const created = after.record.composition.groupOccurrences.find((occurrence) => occurrence.id !== 'occ-0' && occurrence.id !== 'occ-1')!
    expect(created.definitionId).toBe(source.definitionId)
    expect(created.startMs).toBe(expectedStartMs)
    expect(after.history.past).toHaveLength(1)
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group', occurrenceId: created.id })
    expect(screen.getByText('3 linked occurrences')).toBeInTheDocument()
    expect(after.v2Writes).toBe(before.v2Writes + 1)
    expect(after.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])
    expectOneEdit(before, after)

    fireEvent.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await act(async () => {})
    expect(editor.state().record.composition.groupOccurrences).toHaveLength(2)
  })

  it('makes the selected occurrence unique', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-make-unique'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectGroupOccurrence(0)
    const before = editor.state()
    const previousDefinitionId = before.record.composition.groupDefinitions[0]!.id

    fireEvent.click(screen.getByRole('button', { name: 'Make Group unique' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(after.record.composition.groupDefinitions).toHaveLength(2)
    const selected = after.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-0')!
    const sibling = after.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-1')!
    expect(selected.definitionId).not.toBe(previousDefinitionId)
    expect(sibling.definitionId).toBe(previousDefinitionId)
    expect(after.history.past).toHaveLength(1)
    expectOneEdit(before, after)

    fireEvent.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await act(async () => {})
    const undone = editor.state()
    expect(undone.record.composition.groupDefinitions).toHaveLength(1)
    expect(undone.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-0')!.definitionId).toBe(previousDefinitionId)
  })

  it('ungroups the selected occurrence into top-level Clips and closes the panel', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-ungroup'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectGroupOccurrence(0)
    const before = editor.state()
    const definitionClipCount = before.record.composition.groupDefinitions[0]!.clips.length

    fireEvent.click(screen.getByRole('button', { name: 'Ungroup occurrence' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(after.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-0')).toBeUndefined()
    expect(after.record.composition.clips).toHaveLength(before.record.composition.clips.length + definitionClipCount)
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    expect(after.history.past).toHaveLength(1)
    expectOneEdit(before, after)

    fireEvent.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await act(async () => {})
    const undone = editor.state()
    expect(undone.record.composition.groupOccurrences).toHaveLength(2)
    expect(undone.record.composition.clips).toHaveLength(before.record.composition.clips.length)
  })

  it('refuses a duplicate whose start lies outside every Layout occurrence', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const { groupOccurrenceDuration } = await import('@/engine/showGroupsV2')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-duplicate-refused'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    const cloned = structuredClone(record)
    const lastLayout = cloned.composition.layoutOccurrences.reduce((latest, candidate) => (
      candidate.startMs + candidate.durationMs > latest.startMs + latest.durationMs ? candidate : latest
    ))
    const lastLayoutEndMs = lastLayout.startMs + lastLayout.durationMs
    const source = cloned.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-1')!
    const definition = cloned.composition.groupDefinitions.find((candidate) => candidate.id === source.definitionId)!
    source.startMs = lastLayoutEndMs - groupOccurrenceDuration(definition, source)
    const editor = openV2EditorForRecord(cloned)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectGroupOccurrence(1)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Group occurrence' }))
    await act(async () => {})

    expectNoWrite(before, editor.state())
  })

  it('translates the selected occurrence through the Group occurrence door', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-translate'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    record.composition.showEndMs = 2_000
    record.composition.layoutOccurrences[0]!.durationMs = 2_000
    record.composition.groupOccurrences[1]!.startMs = 1_000
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectGroupOccurrence(0)
    const before = editor.state()
    const source = before.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-0')!

    typeAndCommit('X offset', '0.9')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    const moved = after.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-0')!
    expect(moved.translationX).toBe(0.9)
    expect(moved.translationY).toBe(source.translationY)
    expect(moved.startMs).toBe(source.startMs)
    expect(moved.layerBindings).toEqual(source.layerBindings)
    expect(after.history.past).toHaveLength(1)
    expectOneEdit(before, after)
  })

  it('places the selected occurrence at a new start through the Group occurrence door', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-place-start'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    record.composition.showEndMs = 2_000
    record.composition.layoutOccurrences[0]!.durationMs = 2_000
    record.composition.groupOccurrences[1]!.startMs = 1_000
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectGroupOccurrence(0)
    const before = editor.state()

    typeAndCommit('Start seconds exact time', '0.3')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    const moved = after.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-0')!
    expect(moved.startMs).toBe(300)
    expectOneEdit(before, after)
  })

  it('rebinds definition layers when the base layer has an owner at every rank', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-place-base'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    record.composition.showEndMs = 2_000
    record.composition.layoutOccurrences[0]!.durationMs = 2_000
    record.composition.groupOccurrences[1]!.startMs = 1_000
    record.composition.layers.push({ id: 'layer:zone:overlay:2', zoneId: 'zone', name: 'Extra', rank: 2 })
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectGroupOccurrence(0)
    const before = editor.state()
    const occurrence = before.record.composition.groupOccurrences.find((candidate) => candidate.id === 'occ-0')!

    typeAndCommit('Base Layer', '2')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    const moved = after.record.composition.groupOccurrences.find((candidate) => candidate.id === 'occ-0')!
    const expectedLayerId = after.record.composition.layers.find((layer) => layer.zoneId === occurrence.zoneId && layer.rank === 2)!.id
    expect(moved.layerBindings).toEqual([{ definitionLayerId: 'local-layer', layerId: expectedLayerId }])
    expect(moved.startMs).toBe(occurrence.startMs)
    expectOneEdit(before, after)
  })

  it('sends nothing when the base layer has no owner at a needed rank', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-place-base-missing'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    record.composition.showEndMs = 2_000
    record.composition.layoutOccurrences[0]!.durationMs = 2_000
    record.composition.groupOccurrences[1]!.startMs = 1_000
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectGroupOccurrence(0)
    const before = editor.state()

    typeAndCommit('Base Layer', '9')
    await act(async () => {})

    expect(admission.calls).toEqual([])
    expectNoWrite(before, editor.state())
  })

  it('deletes the selected occurrence through the card and retains its dormant definition', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-delete-card'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    record.composition.groupOccurrences = record.composition.groupOccurrences.filter((occurrence) => occurrence.id === 'occ-0')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectGroupOccurrence(0)
    const before = editor.state()
    expect(before.record.composition.groupOccurrences).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Group Definition' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(after.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-0')).toBeUndefined()
    expect(after.record.composition.groupOccurrences).toHaveLength(0)
    expect(after.record.composition.groupDefinitions.some((definition) => definition.id === 'definition')).toBe(true)
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'show' })
    expectOneEdit(before, after)
  })

  it('deletes the selected occurrence through keyboard Delete and returns to the Show', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-delete-keyboard'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    record.composition.groupOccurrences = record.composition.groupOccurrences.filter((occurrence) => occurrence.id === 'occ-0')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectGroupOccurrence(0)
    const before = editor.state()
    expect(before.record.composition.groupOccurrences).toHaveLength(1)

    fireEvent.keyDown(document, { key: 'Delete' })
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(after.record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-0')).toBeUndefined()
    expect(after.record.composition.groupOccurrences).toHaveLength(0)
    expect(after.record.composition.groupDefinitions.some((definition) => definition.id === 'definition')).toBe(true)
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'show' })
    expectOneEdit(before, after)
  })

  it('writes a Group Clip Duration through the group-occurrence door (#1075 G2a)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-duration'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })
    const before = editor.state()
    const durationField = screen.getByRole('textbox', { name: 'Duration seconds exact time' })
    // Fixture hold at local 200 ms for 100 ms must stay strictly inside the Clip, so local must exceed 200: smallest round Show time above 300 ms is 400 ms (0.4 s), storing local 400 - 100 = 300.
    fireEvent.change(durationField, { target: { value: '0.4' } })
    fireEvent.keyDown(durationField, { key: 'Enter' })
    await act(async () => {})
    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(admission.calls).toHaveLength(1)
    expect(after.record.composition.groupDefinitions[0]!.clips.find((clip) => clip.id === 'child')!.durationMs).toBe(300)
    expect(screen.getByRole('textbox', { name: 'Duration seconds exact time' })).toHaveValue('0.4')
    expectOneEdit(before, after)
  })

  it('writes a Group Clip Brightness through the group-occurrence door (#1075 G2b)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-brightness'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })
    const before = editor.state()
    typeAndCommit('Brightness exact percentage', '50')
    await act(async () => {})
    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(admission.calls).toHaveLength(1)
    expect(after.record.composition.groupDefinitions[0]!.clips.find((clip) => clip.id === 'child')!.appearance.keys[0]!.value.view!.brightness).toBe(0.5)
    expectOneEdit(before, after)
  })

  it('writes a Group Clip control value through the group-occurrence door (#1075 G2b)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-control'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) {
      delete instance.controlTargets
      instance.pattern = { kind: 'stock', id: 'CometLoom' }
      instance.patternName = 'CometLoom'
    }
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })
    showTab('Pattern')
    const before = editor.state()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    await act(async () => {})
    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(admission.calls).toHaveLength(1)
    expect(after.record.composition.groupDefinitions[0]!.patternInstances[0]!.controlTargets).toEqual({ sliderSpeed: 0.5 })
    expectOneEdit(before, after)
  })

  it('stores a Group Clip Brightness animation through the property door (#1075 G3)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-animation'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))
    await act(async () => {})
    typeAndCommit('Brightness animation to exact percentage', '42')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotPropertyEdit'])
    expect(admission.calls).toHaveLength(1)
    expect(after.record.composition.propertyTracks).toEqual([])
    const [track] = after.record.composition.groupDefinitions[0]!.propertyTracks
    expect(track.target).toEqual({ kind: 'clip-view', clipId: 'child', property: 'brightness' })
    expect(track.keyframes.map((key) => key.timeMs)).toEqual([0, 400])
    expect(track.keyframes[1]!.value).toBe(0.42)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('reopens a Group Clip Speed animation for edit with an animated summary (#1075 G3 corrective)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-speed-reopen'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })

    fireEvent.click(screen.getByRole('button', { name: 'Animate Animation speed' }))
    await act(async () => {})
    typeAndCommit('Animation speed animation to exact multiplier', '2')
    await act(async () => {})

    const created = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotPropertyEdit'])
    const [stored] = created.record.composition.groupDefinitions[0]!.propertyTracks
    expect(stored.target).toEqual({ kind: 'instance-time-scale', instanceId: 'slot' })
    expect(stored.keyframes.map((key) => key.timeMs)).toEqual([0, 400])
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Animation speed animation' }), { key: 'Escape' })
    await act(async () => {})

    const editButton = screen.getByRole('button', { name: 'Edit Animation speed animation' })
    expect(editButton.getAttribute('data-animated')).toBe('true')
    expect(screen.getByRole('region', { name: 'Clip summary' })).toHaveTextContent('Animation speed')

    fireEvent.click(editButton)
    await act(async () => {})
    const callsBefore = admission.calls.length
    typeAndCommit('Animation speed animation to exact multiplier', '3')
    await act(async () => {})

    expect(admission.calls).toHaveLength(callsBefore + 1)
    expect(admission.calls[callsBefore].door).toBe('admitShowV2PilotPropertyEdit')
    const updated = editor.state().record.composition.groupDefinitions[0]!.propertyTracks[0]!
    expect(updated.keyframes[1]!.value).toBe(3)
    expect(screen.getByRole('region', { name: 'Clip summary' })).toHaveTextContent('3x')
  })

  it('makes no property door call on a two-key Group Clip animation (#1075 G3)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-animation-delete-refused'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    record.composition.groupDefinitions[0]!.propertyTracks = [{
      id: 'two-key',
      target: { kind: 'clip-view', clipId: 'child', property: 'brightness' },
      activeStartMs: 0,
      activeDurationMs: 400,
      keyframes: [
        { id: 'left', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
        { id: 'right', timeMs: 400, value: 0.8, easing: { curve: 'linear' } },
      ],
    }]
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Brightness animation' }))
    await act(async () => {})

    expect(screen.queryByRole('button', { name: 'Delete Brightness animation from' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Brightness animation to' })).not.toBeInTheDocument()
    expectNoWrite(before, editor.state())
  })

  it('stores Group Clip keyframe times through the held-occurrence inverse (#1075 G3)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-animation-held'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    record.composition.groupDefinitions[0]!.propertyTracks = [{
      id: 'held-track',
      target: { kind: 'clip-view', clipId: 'child', property: 'brightness' },
      activeStartMs: 0,
      activeDurationMs: 400,
      keyframes: [
        { id: 'hk-1', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
        { id: 'hk-2', timeMs: 100, value: 0.5, easing: { curve: 'linear' } },
        { id: 'hk-3', timeMs: 400, value: 0.8, easing: { curve: 'linear' } },
      ],
    }]
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Edit Brightness animation' }))
    await act(async () => {})

    typeAndCommit('Brightness animation keyframe 2 time exact time', '0.4')
    await act(async () => {})

    const afterFirst = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotPropertyEdit'])
    expect(afterFirst.record.composition.groupDefinitions[0]!.propertyTracks[0]!.keyframes.map((key) => key.timeMs)).toEqual([0, 300, 400])
    expect(afterFirst.history.past).toHaveLength(1)

    typeAndCommit('Brightness animation keyframe 2 time exact time', '0.15')
    await act(async () => {})

    const afterSecond = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotPropertyEdit', 'admitShowV2PilotPropertyEdit'])
    expect(afterSecond.record.composition.groupDefinitions[0]!.propertyTracks[0]!.keyframes.map((key) => key.timeMs)).toEqual([0, 150, 400])
    expect(afterSecond.history.past).toHaveLength(2)
  })

  it('replaces a Group Clip Pattern through the group-replacement door (#1075 G2c)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const { materializeShowGroupsV2 } = await import('@/engine/showGroupsV2')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-pattern-replace'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })
    showTab('Pattern')
    const before = editor.state()
    pickSourcePattern('TestPattern2D')
    await act(async () => {})
    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupReplacementEdit'])
    expect(admission.calls).toHaveLength(1)
    expect(after.record.composition.groupDefinitions[0]!.patternInstances[0]!.pattern).toEqual({ kind: 'stock', id: 'TestPattern2D' })
    expect(after.record.composition.groupOccurrences).toHaveLength(2)
    const effective = materializeShowGroupsV2(after.record)
    const byId = new Map(effective.composition.patternInstances.map((instance) => [instance.id, instance]))
    const materialized = effective.composition.clips.filter((clip) => clip.id.endsWith(':child'))
    expect(materialized).toHaveLength(2)
    for (const clip of materialized) {
      expect(byId.get(clip.instanceId)?.pattern).toEqual({ kind: 'stock', id: 'TestPattern2D' })
    }
    expectOneEdit(before, after)
  })

  it('confirms a lossy Group Clip Replace Pattern on v2 and applies it once (#1069)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-pattern-lossy'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) {
      instance.pattern = { kind: 'stock', id: 'CometLoom' }
      instance.patternName = 'CometLoom'
      delete instance.controlTargets
    }
    record.composition.groupDefinitions[0]!.patternInstances[0]!.controlTargets = { sliderSpeed: 0.5 }
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'group-clip', occurrenceId: 'occ-0', placementId: 'child' })
    showTab('Pattern')
    const before = editor.state()
    fireEvent.focus(screen.getByRole('combobox', { name: 'Source pattern' }))
    expect(screen.getByRole('option', { name: 'TestPattern2D, removes 1 control value' })).toHaveTextContent('removes 1 control value')
    pickSourcePattern('TestPattern2D')
    await act(async () => {})
    const dialog = screen.getByRole('alertdialog', { name: 'Use TestPattern2D?' })
    expect(dialog).toHaveTextContent("TestPattern2D doesn't have the Speed control. The Speed value will be removed.")
    expect(admission.calls).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use TestPattern2D' }))
    await act(async () => {})
    const after = editor.state()
    expect(admission.calls.map(call => call.door)).toEqual(['admitShowV2PilotGroupReplacementEdit'])
    expect(after.record.composition.groupDefinitions[0]!.patternInstances.some(instance => instance.pattern.id === 'TestPattern2D')).toBe(true)
    expect(after.record.composition.groupDefinitions[0]!.patternInstances.every(instance => instance.controlTargets?.sliderSpeed === undefined || instance.pattern.id === 'CometLoom')).toBe(true)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('cancels a lossy Group Clip Replace Pattern on v2 with no write (#1069)', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-clip-pattern-lossy-cancel'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap(definition => definition.patternInstances)]) {
      instance.pattern = { kind: 'stock', id: 'CometLoom' }
      instance.patternName = 'CometLoom'
      delete instance.controlTargets
    }
    record.composition.groupDefinitions[0]!.patternInstances[0]!.controlTargets = { sliderSpeed: 0.5 }
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    showTab('Pattern')
    const before = editor.state()
    pickSourcePattern('TestPattern2D')
    const dialog = screen.getByRole('alertdialog', { name: 'Use TestPattern2D?' })
    expect(dialog).toHaveTextContent('Speed value will be removed.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await act(async () => {})
    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)
    expect(editor.state().history).toEqual(before.history)
    expect(editor.state().v2Writes).toBe(before.v2Writes)
  })

  it('makes no Group occurrence door call when read-only', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'tracer-group-readonly'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    record.composition.showEndMs = 2_000
    record.composition.layoutOccurrences[0]!.durationMs = 2_000
    record.composition.groupOccurrences[1]!.startMs = 1_000
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} readOnly />)
    await selectGroupOccurrence(0)
    const before = editor.state()

    const xField = screen.getByRole('textbox', { name: 'X offset' })
    fireEvent.change(xField, { target: { value: '0.9' } })
    fireEvent.keyDown(xField, { key: 'Enter' })
    await act(async () => {})

    const startField = screen.getByRole('textbox', { name: 'Start seconds exact time' })
    fireEvent.change(startField, { target: { value: '0.3' } })
    fireEvent.keyDown(startField, { key: 'Enter' })
    await act(async () => {})

    const baseField = screen.getByRole('textbox', { name: 'Base Layer' })
    fireEvent.change(baseField, { target: { value: '0' } })
    fireEvent.keyDown(baseField, { key: 'Enter' })
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Delete Group Definition' }))
    await act(async () => {})

    fireEvent.keyDown(document, { key: 'Delete' })
    await act(async () => {})

    expect(admission.calls).toEqual([])
    expectNoWrite(before, editor.state())
  })

})

// ── v2 split-position lane buttons (#1066 L2332) ────────────────────────────
// The Zone Layouts lane's per-boundary split buttons existed only on the v1
// backing; on v2 the lane rendered with zero split edit buttons. These cases
// drive the real lane markup through the existing v2 harness. The split-x
// record starts from the `fresh` corpus (two scenes joined by one converted
// boundary, as the seeded Installation Show the e2e covers) with a second
// Zone and a split-x logical Layout: the corpus `installation-layouts` row
// converts with zero boundary Transitions, so it cannot exercise the
// per-boundary lane on either backing.
describe('v2 split-position lane buttons (#1066 L2332)', () => {
  function splitFreshRecord(id: string): ShowRecordV2 {
    const source = corpusSource('fresh')
    source.id = id
    const base = convertForTest(source)
    const zoned = editShowZoneV2(base, {
      kind: 'add', zone: { id: 'z2', name: 'Second', nominalPixelCount: 64 },
    })
    if (zoned.status !== 'changed') throw new Error(`add zone refused: ${zoned.status}`)
    const layered = editShowLayerV2(zoned.record, {
      kind: 'add', layer: { id: 'layer:z2:main', zoneId: 'z2', name: 'Main', rank: 0 },
    })
    if (layered.status !== 'changed') throw new Error(`add layer refused: ${layered.status}`)
    const layout = layered.record.zoneLayouts[0]
    const record = {
      ...layered.record,
      zoneLayouts: [{
        ...layout,
        logical: { kind: 'split', zoneIds: [layered.record.zones[0].id, 'z2'], axis: 'x' },
      }],
    } as ShowRecordV2
    expect(validateShowRecordV2(record)).toEqual([])
    return record
  }

  function splitButtons(): HTMLElement[] {
    return Array.from(
      screen.getByRole('group', { name: 'Zone Layouts lane' }).querySelectorAll('button'),
    ).filter((button) => (
      (button as HTMLElement).getAttribute('aria-label')?.startsWith('Edit split position at ')
    )) as HTMLElement[]
  }

  it('renders one split button per boundary whose destination section follows the first', async () => {
    const record = splitFreshRecord('split-lane-buttons')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await act(async () => {})
    const buttons = splitButtons()
    expect(buttons).toHaveLength(1)
    const transitionId = record.composition.transitions[0].id
    expect(buttons[0].getAttribute('data-show-selection-key')).toBe(`transition:${transitionId}`)
    expect(buttons[0].textContent).toBe('—')
  })

  it('selects the boundary Transition when its split button is clicked', async () => {
    const record = splitFreshRecord('split-lane-select')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await act(async () => {})
    const transitionId = record.composition.transitions[0].id
    fireEvent.click(screen.getByRole('button', { name: /^Edit split position at / }))
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'transition', transitionId })
  })

  it('renders no split button when no Layout is a moving split', async () => {
    const source = corpusSource('installation-layouts')
    source.id = 'split-lane-no-split'
    const record = convertForTest(source)
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await act(async () => {})
    expect(screen.getByRole('group', { name: 'Zone Layouts lane' })).toBeInTheDocument()
    expect(splitButtons()).toHaveLength(0)
  })
})

describe('v2 Layout occurrence Duplicate and Make Unique (#1066 slice 8a)', () => {
  function layoutOccurrenceDoors() {
    return admission.calls.filter((call) => call.door === 'admitShowV2PilotLayoutOccurrenceEdit')
  }

  async function openLayoutActionsAt(showId: string, timeMs: number) {
    act(() => useShowTransportStore.getState().setPosition(showId, timeMs))
    fireEvent.click(screen.getByRole('button', { name: 'Add to Show' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    await act(async () => {})
    return screen.getByRole('dialog', { name: 'Zone Layout at playhead' })
  }

  it('duplicates a Layout occurrence through the layout-occurrence door', async () => {
    const base = commandFixtureV2()
    base.id = 'slice8a-duplicate'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const dialog = await openLayoutActionsAt(base.id, 5_001)
    const before = editor.state()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Duplicate Layout' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutOccurrenceEdit'])
    expect(layoutOccurrenceDoors()[0].request.intent).toEqual({
      kind: 'duplicate',
      occurrenceId: 'interval-2',
      newOccurrenceId: expect.any(String),
    })
    expect(after.record.composition.layoutOccurrences).toHaveLength(3)
    expectOneEdit(before, after)
  })

  it('makes a reused Layout occurrence unique through the layout-occurrence door', async () => {
    const base = commandFixtureV2()
    base.id = 'slice8a-make-unique'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const dialog = await openLayoutActionsAt(base.id, 5_001)
    const before = editor.state()

    fireEvent.click(within(dialog).getByRole('button', { name: /Make this Layout unique/i }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutOccurrenceEdit'])
    expect(layoutOccurrenceDoors()[0].request.intent).toEqual({
      kind: 'make-unique',
      occurrenceId: 'interval-2',
      layoutId: expect.any(String),
      name: 'Both copy',
    })
    const both = before.record.zoneLayouts.find((layout) => layout.id === 'both')
    const copy = after.record.zoneLayouts.find((layout) => layout.id !== 'both' && layout.id !== 'left-only')
    expect(copy?.name).toBe('Both copy')
    expect({ ...copy, id: 'layout', name: 'Layout' }).toEqual({ ...both, id: 'layout', name: 'Layout' })
    expect(after.record.composition.layoutOccurrences.find((occurrence) => occurrence.id === 'interval-2')?.layoutId).toBe(copy?.id)
    expect(after.record.composition.layoutOccurrences.find((occurrence) => occurrence.id === 'interval-1')?.layoutId).toBe('both')
    expect(after.record.zones).toEqual(before.record.zones)
    expectOneEdit(before, after)
  })

  it('makes the selected occurrence unique from the inspector through the layout-occurrence door', async () => {
    const base = commandFixtureV2()
    base.id = 'slice8a-inspector-make-unique'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Moving split X Zone Layout' }))
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'zone-layout', layoutId: 'both', intervalId: 'interval-1' })
    const inspector = screen.getByRole('region', { name: 'Zone Layout properties' })
    expect(within(inspector).getByText('2 linked uses')).toBeInTheDocument()
    const before = editor.state()

    fireEvent.click(within(inspector).getByRole('button', { name: 'Make this Layout unique' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutOccurrenceEdit'])
    expect(layoutOccurrenceDoors()[0].request.intent).toEqual({
      kind: 'make-unique',
      occurrenceId: 'interval-1',
      layoutId: expect.any(String),
      name: 'Both copy',
    })
    const copy = after.record.zoneLayouts.find((layout) => layout.id !== 'both' && layout.id !== 'left-only')
    expect(copy?.name).toBe('Both copy')
    expect(after.record.composition.layoutOccurrences.find((occurrence) => occurrence.id === 'interval-1')?.layoutId).toBe(copy?.id)
    expect(after.record.composition.layoutOccurrences.find((occurrence) => occurrence.id === 'interval-2')?.layoutId).toBe('both')
    expectOneEdit(before, after)
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'zone-layout', layoutId: copy?.id, intervalId: 'interval-1' })
    expect(screen.getByRole('button', { name: 'Duplicate Zone Layout Both copy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make this Layout unique' })).toBeNull()
  })

  it('hides the inspector Make Unique control for an unshared Layout, with no write', async () => {
    const base = commandFixtureV2()
    base.id = 'slice8a-inspector-make-unique-refused'
    // Moving the second occurrence onto the other Layout leaves interval-1's
    // Layout with a single use, so the inspector hides Make Unique.
    base.composition.layoutOccurrences[1]!.layoutId = 'left-only'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Moving split X Zone Layout' }))
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'zone-layout', layoutId: 'both', intervalId: 'interval-1' })
    const before = editor.state()

    const inspector = screen.getByRole('region', { name: 'Zone Layout properties' })
    expect(within(inspector).queryByRole('button', { name: 'Make this Layout unique' })).toBeNull()
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expect(after.record).toBe(before.record)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(after.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'zone-layout', layoutId: 'both', intervalId: 'interval-1' })
  })

  it('duplicates a Layout occurrence with its Clips through the layout-occurrence door', async () => {
    const base = commandFixtureV2()
    base.id = 'slice8a-duplicate-clips'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const dialog = await openLayoutActionsAt(base.id, 5_001)
    const before = editor.state()
    const source = before.record.composition.layoutOccurrences.find((occurrence) => occurrence.id === 'interval-2')!
    const insideClips = before.record.composition.clips.filter((clip) => (
      clip.startMs >= source.startMs && clip.startMs < source.startMs + source.durationMs
    ))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Duplicate + Clips' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutOccurrenceEdit'])
    expect(layoutOccurrenceDoors()[0].request.intent).toEqual({
      kind: 'duplicate',
      occurrenceId: 'interval-2',
      newOccurrenceId: expect.any(String),
      content: { idsBySourceId: {} },
    })
    expect(after.record.composition.layoutOccurrences).toHaveLength(3)
    const created = after.record.composition.layoutOccurrences.find((occurrence) => (
      occurrence.id !== 'interval-1' && occurrence.id !== 'interval-2'
    ))!
    expect(created.layoutId).toBe(source.layoutId)
    expect(created.startMs).toBe(source.startMs + source.durationMs)
    expect(created.durationMs).toBe(source.durationMs)
    expect(after.record.composition.clips).toHaveLength(before.record.composition.clips.length + insideClips.length)
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Zone Layout at playhead' })).toBeNull()
  })
})

describe('v2 lesson Live strip (#1066 11c2a)', () => {
  async function renderLessonV2(id: string, withNote = true) {
    const { stockShowById } = await import('@/pixelblaze/stock/shows')
    const { stockShowV2ById } = await import('@/pixelblaze/stock/showsV2')
    const stock = stockShowById(id)!
    const record = structuredClone(stockShowV2ById(id)!)
    const editor = openV2EditorForRecord(record)
    const builtInContext = withNote
      ? {
          track: stock.track,
          lesson: stock.lesson,
          description: stock.description,
          note: stock.note,
          patternSlots: stock.patternSlots,
          reference: stock.reference,
        }
      : undefined
    if (withNote) useShowEditorSessionStore.getState().setShowNoteOpen(editor.showId, true)
    render(<ShowEditor showId={editor.showId} recordVersion={2} builtInContext={builtInContext} />)
    await act(async () => {})
    return { stock, record, editor }
  }

  it('renders LIVE Heart 1/9 with the authored Kishimisu on aperture icons', async () => {
    const { stock } = await renderLessonV2('stock-show-reference-aperture-icons')
    const title = stock.note.number ? `${stock.note.number} ${stock.note.title}` : stock.note.title
    const strip = screen.getByRole('region', { name: `${title} live strip` })
    expect(within(strip).getByText('LIVE')).toBeInTheDocument()
    expect(within(strip).getByText('Heart')).toBeInTheDocument()
    expect(within(strip).getByText('1/9')).toBeInTheDocument()
    expect(within(strip).getByRole('combobox', { name: 'Try with Pattern' })).toHaveValue('Kishimisu')
    expect(admission.calls).toEqual([])
  })

  it('renders CLIP with the v1 first-clip label and count on 101', async () => {
    const { stock } = await renderLessonV2('stock-show-101-clips-cuts-blank-time')
    const { currentShowClip } = await import('@/engine/showReferenceShow')
    const clip = currentShowClip(stock.show, 0)!
    const title = stock.note.number ? `${stock.note.number} ${stock.note.title}` : stock.note.title
    const strip = screen.getByRole('region', { name: `${title} live strip` })
    expect(within(strip).getByText('CLIP')).toBeInTheDocument()
    expect(within(strip).getByText(clip.patternName)).toBeInTheDocument()
    expect(within(strip).getByText(`${clip.index + 1}/${clip.count}`)).toBeInTheDocument()
    expect(admission.calls).toEqual([])
  })

  it('renders INTERVAL on a multi-chapter non-reference lesson', async () => {
    const { stock } = await renderLessonV2('stock-show-105-portable-zones')
    expect(stock.reference).toBeUndefined()
    expect(stock.show.scenes.length).toBeGreaterThan(1)
    const { currentShowScene } = await import('@/engine/showReferenceShow')
    const scene = currentShowScene(stock.show, 0)!
    const title = stock.note.number ? `${stock.note.number} ${stock.note.title}` : stock.note.title
    const strip = screen.getByRole('region', { name: `${title} live strip` })
    expect(within(strip).getByText('INTERVAL')).toBeInTheDocument()
    expect(within(strip).getByText(scene.scene.name)).toBeInTheDocument()
    expect(within(strip).getByText(`${scene.index + 1}/${stock.show.scenes.length}`)).toBeInTheDocument()
    expect(admission.calls).toEqual([])
  })

  it('renders no live strip without a note', async () => {
    await renderLessonV2('stock-show-reference-aperture-icons', false)
    expect(screen.queryByRole('region', { name: /live strip/ })).not.toBeInTheDocument()
    expect(admission.calls).toEqual([])
  })

  function lessonStripTitle(stock: { note: { number?: string; title: string } }): string {
    return stock.note.number ? `${stock.note.number} ${stock.note.title}` : stock.note.title
  }

  function projectLessonV2(
    record: ShowRecordV2,
    groups: readonly ShowPatternSlotGroup[],
    selections: Readonly<Record<number, ShowPatternRef>>,
  ): ShowRecordV2 {
    const librarySet = compileLibraries(LIBRARIES, useLibraryStore.getState().userLibraries)
    const patterns = usePatternStore.getState().userPatterns
    return applyShowPatternSlotSelectionsV2(
      record,
      groups,
      selections,
      (ref) => (ref.kind === 'stock' ? resolveStockPatternId(ref.id) : patterns.find((pattern) => pattern.id === ref.id)?.name),
      (ref) => {
        const source = ref.kind === 'stock'
          ? DEMOS[resolveStockPatternId(ref.id)]
          : patterns.find((pattern) => pattern.id === ref.id)?.src
        return resolveBundledPatternSliderNames(source, librarySet)
      },
    )
  }

  function expectedLessonSource(record: ShowRecordV2): string {
    const maps = useMapStore.getState().userMaps
    const capture = captureShowStageEditV2(record, {
      patterns: usePatternStore.getState().userPatterns,
      libraries: useLibraryStore.getState().userLibraries,
      maps,
      profiles: useControllerProfileStore.getState().profiles,
      stageMap: resolveShowV2StageMap(record.stageMapId, maps),
    })
    if (capture.prepared.status !== 'ready') throw new Error(`lesson fixture not ready: ${capture.prepared.status}`)
    const artifact = capture.prepared.bundle.artifact
    const exported = buildShowEpeExportV2(record, artifact.code, {
      stampedAt: new Date(record.updatedAt),
      userMaps: maps,
      attribution: artifact.attribution,
    })
    if (exported.status !== 'exported') throw new Error(`lesson fixture refused export: ${exported.status}`)
    return exported.source
  }

  it('confirms a single slot swap that removes a control animation with no write (#1066 L2)', async () => {
    const user = userEvent.setup()
    const { stock, editor } = await renderLessonV2('stock-show-reference-property-animation')
    const strip = screen.getByRole('region', { name: `${lessonStripTitle(stock)} live strip` })
    const picker = () => within(strip).getByRole('combobox', { name: 'Try with Pattern' })
    expect(picker()).toHaveValue('LineDancer2D')
    const choose = async (patternName: string) => {
      await user.click(picker())
      await user.click(screen.getByRole('option', { name: patternName }))
    }

    await choose('TestPattern2D')
    const dialog = screen.getByRole('alertdialog', { name: 'Use TestPattern2D?' })
    expect(within(dialog).getByText(
      "TestPattern2D doesn't have the Speed control. The Speed animation will be removed.",
    )).toBeInTheDocument()
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[editor.showId]).toBeUndefined()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(picker()).toHaveValue('LineDancer2D')
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[editor.showId]).toBeUndefined()
    expect(admission.calls).toEqual([])
    expect(editor.state().history).toEqual({ past: [], future: [] })

    await choose('TestPattern2D')
    await user.click(within(screen.getByRole('alertdialog', { name: 'Use TestPattern2D?' })).getByRole('button', { name: 'Use TestPattern2D' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(picker()).toHaveValue('TestPattern2D')
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[editor.showId]).toEqual({
      0: { kind: 'stock', id: 'TestPattern2D' },
    })
    expect(admission.calls).toEqual([])
    const after = editor.state()
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(after.legacyWrites).toBe(0)
  }, 20_000)

  it('swaps one chip slot with no write while siblings keep their values (#1066 L2)', async () => {
    const user = userEvent.setup()
    const { stock, editor } = await renderLessonV2('stock-show-102-transitions-values')
    const strip = screen.getByRole('region', { name: `${lessonStripTitle(stock)} live strip` })
    await user.click(within(strip).getByRole('button', { name: 'Patterns (3)' }))
    const chooser = screen.getByRole('dialog', { name: 'Try with Pattern' })
    expect(within(chooser).getByRole('combobox', { name: 'Pattern 1' })).toHaveValue('ClockworkIris')
    expect(within(chooser).getByRole('combobox', { name: 'Pattern 2' })).toHaveValue('EventHorizon')
    expect(within(chooser).getByRole('combobox', { name: 'Pattern 3' })).toHaveValue('SignalMandala')

    await user.click(within(chooser).getByRole('combobox', { name: 'Pattern 2' }))
    await user.click(screen.getByRole('option', { name: 'Caustics' }))
    await act(async () => {})

    expect(screen.queryByRole('dialog', { name: 'Try with Pattern' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Select Caustics' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Select EventHorizon' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Select ClockworkIris' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Select SignalMandala' }).length).toBeGreaterThan(0)
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[editor.showId]).toEqual({
      1: { kind: 'stock', id: 'Caustics' },
    })
    expect(admission.calls).toEqual([])
    expect(editor.state().history).toEqual({ past: [], future: [] })
  }, 20_000)

  it('publishes the Try with Pattern projection as the v2 Stage override (#1066 L2 Stage)', async () => {
    const { editor } = await renderLessonV2('stock-show-102-transitions-values')
    const before = editor.state()
    act(() => {
      useShowEditorSessionStore.getState().setReferencePattern(editor.showId, 1, { kind: 'stock', id: 'Caustics' })
    })
    await act(async () => {})

    const stored = useShowStore.getState().showV2Pilots[editor.showId]
    const override = useShowPreviewOverrideStore.getState().showV2
    expect(override).not.toBeNull()
    if (!override) throw new Error('Expected the trial projection in the Stage override.')
    expect(override).not.toBe(stored)
    expect(override.id).toBe(stored.id)
    expect(override.composition.patternInstances.find((instance) => instance.id === 'horizon')?.pattern)
      .toEqual({ kind: 'stock', id: 'Caustics' })
    expect(stored.composition.patternInstances.find((instance) => instance.id === 'horizon')?.pattern)
      .toEqual({ kind: 'stock', id: 'EventHorizon' })
    expect(showV2StageRecord(stored, override)).toBe(override)

    const after = editor.state()
    expectNoWrite(before, after)
  }, 20_000)

  it('clears the v2 Stage override on Try with Pattern Reset (#1066 L2 Stage)', async () => {
    const user = userEvent.setup()
    const { stock, editor } = await renderLessonV2('stock-show-102-transitions-values')
    act(() => {
      useShowEditorSessionStore.getState().setReferencePattern(editor.showId, 1, { kind: 'stock', id: 'Caustics' })
    })
    await act(async () => {})
    expect(useShowPreviewOverrideStore.getState().showV2).not.toBeNull()
    const before = editor.state()

    const strip = screen.getByRole('region', { name: `${lessonStripTitle(stock)} live strip` })
    await user.click(within(strip).getByRole('button', { name: 'Patterns (3)' }))
    const chooser = screen.getByRole('dialog', { name: 'Try with Pattern' })
    await user.click(within(chooser).getByRole('button', { name: 'Reset' }))
    await act(async () => {})

    expect(useShowPreviewOverrideStore.getState().showV2).toBeNull()
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[editor.showId]).toBeUndefined()
    const after = editor.state()
    expectNoWrite(before, after)
  }, 20_000)

  it('clears the v2 Stage override when the editor unmounts with a trial active (#1066 L2 Stage)', async () => {
    const { editor } = await renderLessonV2('stock-show-102-transitions-values')
    act(() => {
      useShowEditorSessionStore.getState().setReferencePattern(editor.showId, 1, { kind: 'stock', id: 'Caustics' })
    })
    await act(async () => {})
    expect(useShowPreviewOverrideStore.getState().showV2).not.toBeNull()
    const before = editor.state()

    cleanup()
    await act(async () => {})

    expect(useShowPreviewOverrideStore.getState().showV2).toBeNull()
    const after = editor.state()
    expectNoWrite(before, after)
  }, 20_000)

  it('compiles the projected record into View code with no write (#1066 L2)', async () => {
    const user = userEvent.setup()
    const { stock, editor } = await renderLessonV2('stock-show-reference-aperture-icons')
    const strip = screen.getByRole('region', { name: `${lessonStripTitle(stock)} live strip` })
    const picker = within(strip).getByRole('combobox', { name: 'Try with Pattern' })
    await user.click(picker)
    await user.click(screen.getByRole('option', { name: 'TestPattern2D' }))
    await act(async () => {})
    expect(within(strip).getByRole('combobox', { name: 'Try with Pattern' })).toHaveValue('TestPattern2D')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    const stored = useShowStore.getState().showV2Pilots[editor.showId]
    const groups = stock.patternSlots ?? (stock.reference?.patternSlots ? [stock.reference.patternSlots] : [])
    const selections = useShowEditorSessionStore.getState().referencePatternsByShowId[editor.showId]!
    const projected = projectLessonV2(stored, groups, selections)
    expect(projected).not.toBe(stored)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'View code' }))
    const source = screen.getByTestId('v2-viewcode-source').textContent
    expect(source).toBe(expectedLessonSource(projected))
    expect(source).not.toBe(expectedLessonSource(stored))
    expect(admission.calls).toEqual([])
  }, 20_000)

  it('keeps Clip edits on the stored record with exactly one history entry (#1066 L2)', async () => {
    const { editor } = await renderLessonV2('stock-show-102-transitions-values')
    act(() => {
      useShowEditorSessionStore.getState().setReferencePattern(editor.showId, 1, { kind: 'stock', id: 'Caustics' })
    })
    expect(screen.getAllByRole('button', { name: 'Select Caustics' }).length).toBeGreaterThan(0)
    const before = editor.state()

    await selectClipByName('ClockworkIris', 0)
    typeAndCommit('Brightness exact percentage', '37')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotAppearanceEdit'])
    expectOneEdit(before, after)
    expect(after.record.composition.patternInstances.find((instance) => instance.id === 'horizon')?.pattern)
      .toEqual({ kind: 'stock', id: 'EventHorizon' })
    expect(screen.getAllByRole('button', { name: 'Select Caustics' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Select EventHorizon' })).not.toBeInTheDocument()
  })

  it('clears a slot selection when Clip Detail replaces a slot member Pattern (#1066 L2)', async () => {
    const { editor } = await renderLessonV2('stock-show-102-transitions-values')
    act(() => {
      const session = useShowEditorSessionStore.getState()
      session.setReferencePattern(editor.showId, 0, { kind: 'stock', id: 'Caustics' })
      session.setReferencePattern(editor.showId, 2, { kind: 'stock', id: 'TestPattern2D' })
    })
    const before = editor.state()

    await selectClipByName('Caustics', 0)
    showTab('Pattern')
    pickSourcePattern('TestPattern2D')
    await act(async () => {})

    const after = editor.state()
    expect(replacementSubmissions()).toHaveLength(1)
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[editor.showId]).toEqual({
      2: { kind: 'stock', id: 'TestPattern2D' },
    })
    expect(after.record.composition.patternInstances.find((instance) => instance.id === 'iris')?.pattern)
      .toEqual({ kind: 'stock', id: 'TestPattern2D' })
    expectOneEdit(before, after)
  })

  it('ends a slot trial when Clip Detail re-picks the stored Pattern (#1066 L2)', async () => {
    const { editor } = await renderLessonV2('stock-show-102-transitions-values')
    act(() => {
      useShowEditorSessionStore.getState().setReferencePattern(editor.showId, 1, { kind: 'stock', id: 'Caustics' })
    })
    expect(screen.getAllByRole('button', { name: 'Select Caustics' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Select EventHorizon' })).not.toBeInTheDocument()

    await selectClipByName('Caustics', 0)
    showTab('Pattern')
    pickSourcePattern('EventHorizon')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expect(after.history).toEqual({ past: [], future: [] })
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[editor.showId]?.[1] ?? null).toBeNull()
    expect(after.record.composition.patternInstances.find((instance) => instance.id === 'horizon')?.pattern)
      .toEqual({ kind: 'stock', id: 'EventHorizon' })
    expect(screen.getByRole('combobox', { name: 'Source pattern' })).toHaveValue('EventHorizon')
    expect(screen.getAllByRole('button', { name: 'Select EventHorizon' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Select Caustics' })).not.toBeInTheDocument()
  })
})

describe('v2 lesson Reset built-in Show (#1066 t54)', () => {
  // Beside the lesson Live-strip tests (e.g. 'keeps Clip edits on the stored
  // record with exactly one history entry (#1066 L2)'): Reset on a v2 lesson
  // draft follows the session-only v2 history, not the v1 stockShowDrafts map.
  it('enables Reset on a Clip Brightness edit and restores the lesson copy with no write', async () => {
    const id = 'stock-show-101-clips-cuts-blank-time'
    const v2Writes = vi.fn(async (_showId: string, _next: ShowRecordV2) => {})
    const legacyWrites = vi.fn(async () => {})
    setPersonalContentProvider({
      id: 't54-lesson-reset-provider',
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
    const opened = await useShowStore.getState().openShowV2Pilot(id)
    expect(opened.status).toBe('ready')
    const { stockShowById } = await import('@/pixelblaze/stock/shows')
    const { stockShowV2ById } = await import('@/pixelblaze/stock/showsV2')
    const stock = stockShowById(id)!
    const lesson = stockShowV2ById(id)!
    expect(useShowStore.getState().isShowV2LessonDraft(id)).toBe(true)
    render(<ShowEditor
      showId={id}
      recordVersion={2}
      builtInContext={{
        track: stock.track,
        lesson: stock.lesson,
        description: stock.description,
        note: stock.note,
        patternSlots: stock.patternSlots,
        reference: stock.reference,
      }}
    />)
    await act(async () => {})

    const reset = screen.getByRole('button', { name: 'Reset built-in Show' })
    expect(reset).toBeDisabled()

    await selectClipByName('RibbonLoom', 0)
    typeAndCommit('Brightness exact percentage', '37')
    await act(async () => {})

    await waitFor(() => expect(reset).toBeEnabled())
    expect(useShowStore.getState().showV2Histories[id].past).toHaveLength(1)
    expect(useShowStore.getState().showV2Pilots[id].composition).not.toEqual(lesson.composition)

    fireEvent.click(reset)
    await act(async () => {})

    expect(reset).toBeDisabled()
    expect(useShowStore.getState().showV2Pilots[id].composition).toEqual(lesson.composition)
    expect(useShowStore.getState().showV2Histories[id]).toEqual({ past: [], future: [] })
    expect(v2Writes).not.toHaveBeenCalled()
    expect(legacyWrites).not.toHaveBeenCalled()
    expect(useShowStore.getState().shows).toEqual([])
    expect(useShowStore.getState().stockShowDrafts[id]).toBeUndefined()
  })
})

describe('v2 lesson header Clone (#1091 item 3)', () => {
  it('clones the edited lesson projection as a v2 row with the Try with Pattern selection', async () => {
    const id = 'stock-show-101-clips-cuts-blank-time'
    const createdV2: ShowRecordV2[] = []
    const legacyWrites = vi.fn(async () => {})
    setPersonalContentProvider({
      id: 'clone-lesson-provider',
      listPatterns: async () => [],
      listMaps: async () => [],
      listMixins: async () => [],
      listShows: async () => [],
      listControllerProfiles: async () => [],
      createShow: legacyWrites,
      updateShow: legacyWrites,
      deleteShow: legacyWrites,
      createShowV2: async (record: ShowRecordV2) => { createdV2.push(structuredClone(record)) },
      replaceShowV2: async () => {},
      getLastActive: async () => undefined,
      setLastActive: async () => {},
    } as unknown as PersonalContentProvider)
    const opened = await useShowStore.getState().openShowV2Pilot(id)
    expect(opened.status).toBe('ready')
    act(() => { useWorkspaceStore.setState({ personalWorkspaceAuthenticated: true }) })
    const { stockShowById } = await import('@/pixelblaze/stock/shows')
    const { stockShowV2ById } = await import('@/pixelblaze/stock/showsV2')
    const stock = stockShowById(id)!
    const lesson = stockShowV2ById(id)!
    render(<ShowEditor
      showId={id}
      recordVersion={2}
      builtInContext={{
        track: stock.track,
        lesson: stock.lesson,
        description: stock.description,
        note: stock.note,
        patternSlots: stock.patternSlots,
        reference: stock.reference,
      }}
    />)
    await act(async () => {})

    await selectClipByName('RibbonLoom', 0)
    typeAndCommit('Brightness exact percentage', '37')
    await act(async () => {})
    expect((await authoredClipValue(id, 'clip-ribbons')).view.brightness).toBe(0.37)

    act(() => {
      useShowEditorSessionStore.getState().setReferencePattern(id, 0, { kind: 'stock', id: 'Kishimisu' })
    })
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Show actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clone' }))
    await act(async () => {})

    // One v2 row, carrying the Clip edit and the selected Pattern; no v1 row.
    expect(createdV2).toHaveLength(1)
    const copy = createdV2[0]
    expect(copy.id).not.toBe(id)
    expect(copy.name).toBe(`${lesson.name} copy`)
    const copiedClip = copy.composition.clips.find((clip) => clip.id === 'clip-ribbons')!
    expect(copiedClip.appearance.keys.some((key) => key.value.view.brightness === 0.37)).toBe(true)
    const pristineClip = lesson.composition.clips.find((clip) => clip.id === 'clip-ribbons')!
    expect(pristineClip.appearance.keys.some((key) => key.value.view.brightness === 0.37)).toBe(false)
    expect(copy.composition.patternInstances.find((instance) => instance.id === 'ribbons')?.pattern)
      .toEqual({ kind: 'stock', id: 'Kishimisu' })
    expect(useShowStore.getState().showV2Rows.map((row) => row.id)).toContain(copy.id)
    expect(legacyWrites).not.toHaveBeenCalled()
    expect(useShowStore.getState().shows).toEqual([])
  })
})

describe('v2 Layout occurrence Append (#1066 slice 8b-1)', () => {
  function layoutOccurrenceDoors() {
    return admission.calls.filter((call) => call.door === 'admitShowV2PilotLayoutOccurrenceEdit')
  }

  async function openLayoutActionsAt(showId: string, timeMs: number) {
    act(() => useShowTransportStore.getState().setPosition(showId, timeMs))
    fireEvent.click(screen.getByRole('button', { name: 'Add to Show' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    await act(async () => {})
    return screen.getByRole('dialog', { name: 'Zone Layout at playhead' })
  }

  it('appends a copied Zone Layout interval through the layout-occurrence door', async () => {
    const base = commandFixtureV2()
    base.id = 'slice8b1-append'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const dialog = await openLayoutActionsAt(base.id, 5_001)
    const before = editor.state()
    const showEndMs = before.record.composition.showEndMs

    fireEvent.click(within(dialog).getByRole('button', { name: 'Append' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutOccurrenceEdit'])
    expect(layoutOccurrenceDoors()[0].request.intent).toEqual({
      kind: 'append',
      occurrenceId: expect.any(String),
      durationMs: 5_000,
      // v1 allocates the appended Layout as nextEntityId('layout-', layouts):
      // two definitions in this fixture, so the fresh copy is layout-3
      // (a fresh Installation with layout-1 alone yields layout-2, as the
      // 8b-1 oracle and e2e case 2271 prove).
      layoutId: 'layout-3',
      definition: {
        kind: 'duplicate',
        layoutId: 'layout-3',
        name: 'Moving split X',
        sourceLayoutId: 'both',
      },
    })
    const intent = layoutOccurrenceDoors()[0].request.intent as { layoutId: string; occurrenceId: string; definition: { layoutId: string } }
    expect(intent.layoutId).toBe(intent.definition.layoutId)
    const both = before.record.zoneLayouts.find((layout) => layout.id === 'both')!
    const copy = after.record.zoneLayouts.find((layout) => layout.id === intent.layoutId)!
    expect(copy.name).toBe('Moving split X')
    expect({ ...copy, id: 'layout', name: 'Layout' }).toEqual({ ...both, id: 'layout', name: 'Layout' })
    expect(after.record.composition.layoutOccurrences).toHaveLength(3)
    const created = after.record.composition.layoutOccurrences[after.record.composition.layoutOccurrences.length - 1]!
    expect(created.id).toBe(intent.occurrenceId)
    expect(created).toMatchObject({ layoutId: copy.id, startMs: showEndMs, durationMs: 5_000 })
    expect(after.record.composition.showEndMs).toBe(showEndMs + 5_000)
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Zone Layout at playhead' })).toBeNull()
  })
})

describe('v2 Layout occurrence Insert here (#1066 slice 8b-2b)', () => {
  function layoutOccurrenceDoors() {
    return admission.calls.filter((call) => call.door === 'admitShowV2PilotLayoutOccurrenceEdit')
  }

  async function openLayoutActionsAt(showId: string, timeMs: number) {
    act(() => useShowTransportStore.getState().setPosition(showId, timeMs))
    fireEvent.click(screen.getByRole('button', { name: 'Add to Show' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    await act(async () => {})
    return screen.getByRole('dialog', { name: 'Zone Layout at playhead' })
  }

  it('inserts a copied Zone Layout interval through the layout-occurrence door', async () => {
    const base = commandFixtureV2()
    base.id = 'slice8b2b-insert'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const dialog = await openLayoutActionsAt(base.id, 5_001)
    const before = editor.state()
    const showEndMs = before.record.composition.showEndMs

    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert here' }))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutOccurrenceEdit'])
    const intent = layoutOccurrenceDoors()[0].request.intent as unknown as {
      kind: string; atMs: number; durationMs: number; layoutId: string
      definition: { kind: string; layoutId: string; sourceLayoutId?: string }
      occurrenceIds: { interval: string; resume: string }
      rightClipIds: Record<string, string>
    }
    expect(intent.kind).toBe('insert-interval')
    expect(intent.atMs).toBe(5_001)
    expect(intent.durationMs).toBe(5_000)
    expect(intent.layoutId).toBe('layout-3')
    expect(intent.definition).toMatchObject({ kind: 'duplicate', layoutId: 'layout-3', sourceLayoutId: 'both' })
    expect(intent.layoutId).toBe(intent.definition.layoutId)
    expect(Object.keys(intent.rightClipIds)).toEqual(['clip-b'])
    const both = before.record.zoneLayouts.find((layout) => layout.id === 'both')!
    const copy = after.record.zoneLayouts.find((layout) => layout.id === intent.layoutId)!
    expect({ ...copy, id: 'layout', name: 'Layout' }).toEqual({ ...both, id: 'layout', name: 'Layout' })
    const inserted = after.record.composition.layoutOccurrences.find((occurrence) => occurrence.id === intent.occurrenceIds.interval)!
    expect(inserted).toMatchObject({ layoutId: copy.id, startMs: 5_001, durationMs: 5_000 })
    const left = after.record.composition.clips.find((clip) => clip.id === 'clip-b')!
    expect(left).toMatchObject({ startMs: 4_000, durationMs: 1_001 })
    const rightClipId: string = intent.rightClipIds['clip-b'] as string
    const right = after.record.composition.clips.find((clip) => clip.id === rightClipId)!
    expect(right).toMatchObject({ startMs: 10_001, durationMs: 2_999 })
    expect(after.record.composition.showEndMs).toBe(showEndMs + 5_000)
    expectOneEdit(before, after)
    expect(screen.queryByRole('dialog', { name: 'Zone Layout at playhead' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await act(async () => {})
    expect(editor.state().record.composition).toEqual(before.record.composition)
  })

  it('rounds a fractional playhead before a v2 Insert here', async () => {
    // Beside the 8b-2b 'inserts a copied Zone Layout interval through the layout-occurrence door' test above:
    // the same flow with the playhead at a fractional time still reaches the layout-occurrence door once.
    const base = commandFixtureV2()
    base.id = 'slice8b2b-insert-fractional'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const dialog = await openLayoutActionsAt(base.id, 5000.4)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert here' }))
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotLayoutOccurrenceEdit'])
    const intent = layoutOccurrenceDoors()[0].request.intent as unknown as {
      kind: string; atMs: number; occurrenceIds: { interval: string; resume: string }
    }
    expect(intent.kind).toBe('insert-interval')
    expect(intent.atMs).toBe(5000)
    const after = editor.state()
    const inserted = after.record.composition.layoutOccurrences.find((occurrence) => occurrence.id === intent.occurrenceIds.interval)!
    expect(inserted.startMs).toBe(5000)
  })
})

describe('v2 View code and Download .epe (#1066)', () => {
  function freshV2Record(id: string): ShowRecordV2 {
    const source = corpusSource('fresh')
    source.id = id
    return convertForTest(source)
  }

  function expectedV2Source(stored: ShowRecordV2): string {
    const maps = useMapStore.getState().userMaps
    const capture = captureShowStageEditV2(stored, {
      patterns: usePatternStore.getState().userPatterns,
      libraries: useLibraryStore.getState().userLibraries,
      maps,
      profiles: useControllerProfileStore.getState().profiles,
      stageMap: resolveShowV2StageMap(stored.stageMapId, maps),
    })
    if (capture.prepared.status !== 'ready') throw new Error(`v2 fixture not ready: ${capture.prepared.status}`)
    const artifact = capture.prepared.bundle.artifact
    const expected = buildShowEpeExportV2(stored, artifact.code, {
      stampedAt: new Date(stored.updatedAt),
      userMaps: maps,
      attribution: artifact.attribution,
    })
    if (expected.status !== 'exported') throw new Error(`v2 fixture refused export: ${expected.status}`)
    return expected.source
  }

  it('shows the v2 generated pattern and returns to the Show', async () => {
    const record = freshV2Record('v2-viewcode-show')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Show actions' }))
    const viewCode = screen.getByRole('menuitem', { name: 'View code' })
    expect(viewCode).toBeEnabled()
    fireEvent.click(viewCode)

    const stored = useShowStore.getState().showV2Pilots[editor.showId]
    expect(screen.getByText(`Generated pattern - ${stored.name}`)).toBeInTheDocument()
    expect(screen.getByTestId('v2-viewcode-source').textContent).toBe(expectedV2Source(stored))
    expect(admission.calls).toEqual([])
    expect(legacy.calls).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Back to show' }))
    expect(screen.queryByText(`Generated pattern - ${stored.name}`)).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
  })

  it('downloads the v2 .epe from the header with the generated source', async () => {
    const record = freshV2Record('v2-download-epe')
    const editor = openV2EditorForRecord(record)
    const previewJpeg = vi.spyOn(previewThumbnailJpeg, 'buildPreviewJpeg').mockResolvedValue(new Uint8Array([1, 2, 3]))
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:v2-epe')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      render(<ShowEditor showId={editor.showId} recordVersion={2} />)
      await act(async () => {})

      fireEvent.click(screen.getByRole('button', { name: 'Show actions' }))
      const downloadItem = screen.getByRole('menuitem', { name: 'Download .epe' })
      expect(downloadItem).toBeEnabled()
      fireEvent.click(downloadItem)

      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1))
      const blob = createObjectURL.mock.calls[0][0]
      if (!(blob instanceof Blob)) throw new TypeError('Expected Show export to create a Blob URL')
      const exportedText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.addEventListener('load', () => resolve(String(reader.result)))
        reader.addEventListener('error', () => reject(reader.error))
        reader.readAsText(blob)
      })
      const exported = JSON.parse(exportedText) as { sources: { main: string } }
      const stored = useShowStore.getState().showV2Pilots[editor.showId]
      expect(exported.sources.main).toBe(expectedV2Source(stored))
    } finally {
      previewJpeg.mockRestore()
      anchorClick.mockRestore()
      revokeObjectURL.mockRestore()
      createObjectURL.mockRestore()
    }
  })
})

describe('v2 Zone Layout routing transfers (#1066)', () => {
  function layoutTransferDoors() {
    return admission.calls.filter((call) => call.door === 'admitShowV2PilotLayoutOccurrenceEdit')
  }
  function routingPanel(): HTMLElement {
    return screen.getByRole('region', { name: 'Transition properties' })
  }
  it('writes duration, easing and remove through the layout-occurrence door', async () => {
    const base = commandFixtureV2()
    base.id = 'routing-transfer-flow'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const handle = screen.getByRole('button', { name: 'Select Moving split X routing interval 1' })
    expect(handle).toBeInTheDocument()
    const before = editor.state()
    fireEvent.click(handle)
    await act(async () => {})
    const panel = routingPanel()
    expect(within(panel).getByRole('textbox', { name: 'Routing transfer duration seconds exact time' })).toBeInTheDocument()
    const duration = within(panel).getByRole('textbox', { name: 'Routing transfer duration seconds exact time' })
    fireEvent.change(duration, { target: { value: '2' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})
    const afterDuration = editor.state()
    expect(layoutTransferDoors()).toHaveLength(1)
    expect(layoutTransferDoors()[0].request.intent).toEqual({
      kind: 'set-transfer',
      occurrenceId: 'interval-2',
      transfer: expect.objectContaining({ durationMs: 2000 }),
    })
    expectOneEdit(before, afterDuration)
    expect(afterDuration.record.composition.layoutOccurrences.find((occurrence) => occurrence.id === 'interval-2')?.incomingTransfer?.durationMs).toBe(2000)
    const easing = within(routingPanel()).getByRole('combobox', { name: 'Routing transfer easing' })
    fireEvent.change(easing, { target: { value: 'ease-in-out' } })
    await act(async () => {})
    const afterEasing = editor.state()
    expect(layoutTransferDoors()).toHaveLength(2)
    const second = layoutTransferDoors()[1].request.intent as { kind: string; occurrenceId: string; transfer: { durationMs: number; easing: unknown } }
    expect(second.kind).toBe('set-transfer')
    expect(second.occurrenceId).toBe('interval-2')
    expect(second.transfer.durationMs).toBe(2000)
    expect(second.transfer.easing).toEqual({ curve: 'quadratic', direction: 'in-out' })
    expect(afterEasing.history.past).toHaveLength(2)
    expect(afterEasing.history.past[1]).toEqual(afterDuration.record)
    expect(afterEasing.history.future).toEqual([])
    expect(afterEasing.revision).toBe(afterDuration.revision + 1)
    expect(afterEasing.v2Writes).toBe(afterDuration.v2Writes + 1)
    expect(afterEasing.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])
    fireEvent.click(within(routingPanel()).getByRole('button', { name: 'Remove routing marker' }))
    await act(async () => {})
    const afterRemove = editor.state()
    expect(layoutTransferDoors()).toHaveLength(3)
    expect(layoutTransferDoors()[2].request.intent).toEqual({
      kind: 'remove-switch',
      occurrenceId: 'interval-2',
    })
    expect(afterRemove.record.composition.layoutOccurrences.some((occurrence) => occurrence.id === 'interval-2')).toBe(false)
    expect(afterRemove.record.composition.layoutOccurrences).toHaveLength(1)
    expect(afterRemove.history.past).toHaveLength(3)
    expect(afterRemove.history.past[2]).toEqual(afterEasing.record)
    expect(afterRemove.revision).toBe(afterEasing.revision + 1)
    expect(afterRemove.v2Writes).toBe(afterEasing.v2Writes + 1)
  })
  it('makes zero door calls when read-only', async () => {
    const base = commandFixtureV2()
    base.id = 'routing-transfer-readonly'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} readOnly />)
    fireEvent.click(screen.getByRole('button', { name: 'Select Moving split X routing interval 1' }))
    await act(async () => {})
    const before = editor.state()
    const panel = routingPanel()
    const duration = within(panel).getByRole('textbox', { name: 'Routing transfer duration seconds exact time' })
    fireEvent.change(duration, { target: { value: '2' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Routing transfer easing' }), { target: { value: 'ease-in-out' } })
    await act(async () => {})
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove routing marker' }))
    await act(async () => {})
    expect(admission.calls).toEqual([])
    expectNoWrite(before, editor.state())
  })
  it('rounds a fractional-second entry to a safe-integer transfer (#1066 rt-corrective)', async () => {
    const base = commandFixtureV2()
    base.id = 'routing-transfer-round'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select Moving split X routing interval 1' }))
    await act(async () => {})
    const duration = within(routingPanel()).getByRole('textbox', { name: 'Routing transfer duration seconds exact time' })
    fireEvent.change(duration, { target: { value: '1.005' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})
    expect(layoutTransferDoors()).toHaveLength(1)
    expect(layoutTransferDoors()[0].request.intent).toEqual({
      kind: 'set-transfer',
      occurrenceId: 'interval-2',
      transfer: expect.objectContaining({ durationMs: 1005 }),
    })
    expect(editor.state().record.composition.layoutOccurrences.find((occurrence) => occurrence.id === 'interval-2')?.incomingTransfer?.durationMs).toBe(1005)
  })
  it('removes a native Cut handle in one edit and drops the second occurrence (#1066 rt-corrective)', async () => {
    const base = commandFixtureV2()
    base.id = 'routing-transfer-remove-cut'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    expect(before.record.composition.layoutOccurrences).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Select Moving split X routing interval 1' }))
    await act(async () => {})
    fireEvent.click(within(routingPanel()).getByRole('button', { name: 'Remove routing marker' }))
    await act(async () => {})
    const after = editor.state()
    expect(layoutTransferDoors()).toHaveLength(1)
    expect(layoutTransferDoors()[0].request.intent).toEqual({ kind: 'remove-switch', occurrenceId: 'interval-2' })
    expect(after.record.composition.layoutOccurrences).toHaveLength(1)
    expect(after.record.composition.layoutOccurrences.some((occurrence) => occurrence.id === 'interval-2')).toBe(false)
    expectOneEdit(before, after)
  })
  it('keeps the routing panel open after a duration-0 edit (#1066 rt-corrective)', async () => {
    const base = commandFixtureV2()
    base.id = 'routing-transfer-duration-zero'
    const editor = openV2EditorForRecord(base)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select Moving split X routing interval 1' }))
    await act(async () => {})
    const duration = within(routingPanel()).getByRole('textbox', { name: 'Routing transfer duration seconds exact time' })
    fireEvent.change(duration, { target: { value: '2' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})
    expect(layoutTransferDoors()).toHaveLength(1)
    const zero = within(routingPanel()).getByRole('textbox', { name: 'Routing transfer duration seconds exact time' })
    fireEvent.change(zero, { target: { value: '0' } })
    fireEvent.keyDown(zero, { key: 'Enter' })
    await act(async () => {})
    expect(layoutTransferDoors()).toHaveLength(2)
    expect(layoutTransferDoors()[1].request.intent).toEqual({ kind: 'set-transfer', occurrenceId: 'interval-2', transfer: null })
    expect(within(routingPanel()).getByRole('textbox', { name: 'Routing transfer duration seconds exact time' })).toBeInTheDocument()
  })
})

describe('v2 Clip inspector Start and Duration (#1066)', () => {
  function transitionResizeSubmissions() {
    return admission.calls
      .filter((call) => call.door === 'admitShowV2PilotTransitionResize')
      .map((call) => ({ intent: call.request.intent, baseRevision: call.request.baseRevision }))
  }

  it('sets a free Clip Duration through the temporal door, matching a trailing drag resize', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('inspector-duration-free'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()
    expect(authoredClip(before.record, 'overlay-a').startMs).toBe(12_000)
    expect(authoredClip(before.record, 'overlay-a').durationMs).toBe(2_000)

    typeAndCommit('Duration seconds exact time', '3')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: { kind: 'extend', clipId: 'overlay-a', startMs: 12_000, endMs: 15_000 },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'overlay-a').startMs).toBe(12_000)
    expect(authoredClip(after.record, 'overlay-a').durationMs).toBe(3_000)
    expectOneEdit(before, after)

    const { projectShowEditorTimelineV2 } = await import('@/engine/showEditorTimelinePresentation')
    const { planShowV2ClipResize } = await import('@/engine/showV2ClipTemporalPlanning')
    const view = projectShowEditorTimelineV2(before.record)
    const planned = planShowV2ClipResize(view, { clipId: 'overlay-a', edge: 'trailing', startMs: 12_000, endMs: 15_000 })
    expect(planned.kind).not.toBe('refuse')
    if (planned.kind !== 'refuse') {
      expect(temporalSubmissions()[0]!.intent).toEqual(planned.intent)
    }
    await expectUndoRedoExact(editor, before)
  })

  it('moves a free Clip Start through the temporal door with duration unchanged', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('inspector-start-free'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()
    expect(authoredClip(before.record, 'overlay-a').startMs).toBe(12_000)
    expect(authoredClip(before.record, 'overlay-a').durationMs).toBe(2_000)

    typeAndCommit('Start seconds exact time', '13')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(temporalSubmissions()).toEqual([{
      intent: { kind: 'move', clipId: 'overlay-a', startMs: 13_000 },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'overlay-a').startMs).toBe(13_000)
    expect(authoredClip(after.record, 'overlay-a').durationMs).toBe(2_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('routes a joined Clip Duration through the transition-resize door, exactly as the drag does', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('inspector-duration-joined'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    const before = editor.state()
    expect(authoredClip(before.record, 'resize-a').startMs).toBe(1_000)
    expect(authoredClip(before.record, 'resize-a').durationMs).toBe(4_000)

    typeAndCommit('Duration seconds exact time', '3')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(transitionResizeSubmissions()).toEqual([{
      intent: { kind: 'resize-trailing', clipId: 'resize-a', endMs: 4_000 },
      baseRevision: 0,
    }])
    expect(authoredClip(after.record, 'resize-a').startMs).toBe(1_000)
    expect(authoredClip(after.record, 'resize-a').durationMs).toBe(3_000)
    expectOneEdit(before, after)

    const { projectShowEditorTimelineV2 } = await import('@/engine/showEditorTimelinePresentation')
    const { planShowV2ClipResize } = await import('@/engine/showV2ClipTemporalPlanning')
    const view = projectShowEditorTimelineV2(before.record)
    expect(planShowV2ClipResize(view, { clipId: 'resize-a', edge: 'trailing', startMs: 1_000, endMs: 4_000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-trailing', clipId: 'resize-a', endMs: 4_000 } })
    await expectUndoRedoExact(editor, before)
  })

  it('reverts no-change and refused values with no door call and record identity', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('inspector-timing-refused'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()

    typeAndCommit('Duration seconds exact time', '2')
    await act(async () => {})
    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)

    typeAndCommit('Start seconds exact time', '12')
    await act(async () => {})
    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)

    expect(admission.calls).toEqual([])
    expect(editor.state().record).toBe(before.record)
    expectNoWrite(before, editor.state())
  })

  it('refuses a duration that grows into a converted boundary with no door call', async () => {
    const { record } = convertedFreshBoundary('inspector-timing-collide')
    const transition = record.composition.transitions.find((candidate) => candidate.origin === 'converted-boundary-transition') ?? record.composition.transitions[0]!
    const fromId = transition.participants[0]!.fromClipId
    const clip = record.composition.clips.find((candidate) => candidate.id === fromId)!
    const instance = record.composition.patternInstances.find((candidate) => candidate.id === clip.instanceId)!
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName(instance.patternName, 0)
    const before = editor.state()

    typeAndCommit('Duration seconds exact time', String((clip.durationMs + 5_000) / 1_000))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expect(after.record).toBe(before.record)
    expectNoWrite(before, after)
  })
})

describe('v2 boundary palette live preview (#1066 5c)', () => {
  const JUNCTION = 'Edit crossfade Transition between TestPattern1D and CometLoom'

  async function openBoundaryPalette(record: ShowRecordV2): Promise<OpenV2Editor> {
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: JUNCTION }))
    await act(async () => {})
    useShowTransportStore.getState().openShow(record.id, record.composition.showEndMs)
    useShowTransportStore.getState().setPosition(record.id, 1_000)
    fireEvent.click(within(boundaryPanel()).getByRole('button', { name: /Change$/ }))
    await act(async () => {})
    return editor
  }

  function paletteRow(name: string): HTMLElement {
    return within(screen.getByRole('dialog', { name: 'Choose Transition' }))
      .getByRole('button', { name })
  }

  function candidateTransition(candidate: ShowRecordV2, transitionId: string) {
    const transition = candidate.composition.transitions.find((entry) => entry.id === transitionId)
    if (!transition) throw new Error(`No candidate Transition ${transitionId}.`)
    return transition
  }

  it('hovers a family into showV2 with zero door calls and no history entry', async () => {
    const { record } = convertedFreshBoundary('tracer-5c-hover')
    const transitionId = record.composition.transitions[0]!.id
    const editor = await openBoundaryPalette(record)
    const before = editor.state()

    fireEvent.pointerEnter(paletteRow('Use Block Transition'))
    await act(async () => {})

    const candidate = useShowPreviewOverrideStore.getState().showV2
    expect(candidate).not.toBeNull()
    expect(candidateTransition(candidate!, transitionId)).toMatchObject({ kind: 'dither' })
    expectNoWrite(before, editor.state())
    const window = projectShowEditorTimelineV2(candidate!).transitions
      .find((entry) => entry.id === transitionId)
    expect(window).toBeDefined()
    expect(useShowTransportStore.getState().seekRequest?.targetMs)
      .toBe(window!.startMs + (window!.endMs - window!.startMs) / 2)
  })

  it('re-hovers the same family into the identical candidate object', async () => {
    const { record } = convertedFreshBoundary('tracer-5c-rehover')
    const editor = await openBoundaryPalette(record)
    const before = editor.state()
    const row = paletteRow('Use Block Transition')

    fireEvent.pointerEnter(row)
    await act(async () => {})
    const first = useShowPreviewOverrideStore.getState().showV2
    expect(first).not.toBeNull()

    fireEvent.pointerLeave(row)
    await act(async () => {})
    expect(useShowPreviewOverrideStore.getState().showV2).toBeNull()
    expect(useShowTransportStore.getState().seekRequest?.targetMs).toBe(1_000)

    fireEvent.pointerEnter(row)
    await act(async () => {})
    expect(useShowPreviewOverrideStore.getState().showV2).toBe(first)
    expectNoWrite(before, editor.state())
  })

  it('pointer leave clears the candidate and seeks back', async () => {
    const { record } = convertedFreshBoundary('tracer-5c-leave')
    const editor = await openBoundaryPalette(record)
    const before = editor.state()
    const row = paletteRow('Use Block Transition')

    fireEvent.pointerEnter(row)
    await act(async () => {})
    expect(useShowPreviewOverrideStore.getState().showV2).not.toBeNull()

    fireEvent.pointerLeave(row)
    await act(async () => {})

    expect(useShowPreviewOverrideStore.getState().showV2).toBeNull()
    expect(useShowTransportStore.getState().seekRequest?.targetMs).toBe(1_000)
    expectNoWrite(before, editor.state())
  })

  it('apply after hovering makes one transition door call and leaves showV2 null', async () => {
    const { record } = convertedFreshBoundary('tracer-5c-apply')
    const editor = await openBoundaryPalette(record)
    const before = editor.state()
    const row = paletteRow('Use Block Transition')

    fireEvent.pointerEnter(row)
    await act(async () => {})
    expect(useShowPreviewOverrideStore.getState().showV2).not.toBeNull()

    fireEvent.click(row)
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    expectOneEdit(before, editor.state())
    expect(useShowPreviewOverrideStore.getState().showV2).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Choose Transition' })).not.toBeInTheDocument()
  })
})

describe('v2 Add Clip (#1090 slice B)', () => {
  it('adds one Clip from the Add menu at a free playhead', async () => {
    const user = userEvent.setup()
    const editor = openV2Editor('add-clip-free')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    act(() => useShowTransportStore.setState({ showId: editor.showId, positionMs: 5_000 }))

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const command = screen.getByRole('menuitem', { name: 'Clip' })
    expect(command).toBeEnabled()
    await user.click(command)
    const dialog = screen.getByRole('dialog', { name: 'Add Clip at playhead' })
    await user.click(within(dialog).getByRole('combobox', { name: 'Pattern for new Clip' }))
    await user.click(screen.getByRole('option', { name: 'AuroraSphere' }))

    await waitFor(() => {
      expect(editor.state().record.composition.clips).toHaveLength(before.record.composition.clips.length + 1)
    })
    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotCreateClip'])
    const beforeIds = new Set(before.record.composition.clips.map((clip) => clip.id))
    const added = after.record.composition.clips.filter((clip) => !beforeIds.has(clip.id))
    expect(added).toHaveLength(1)
    // The topmost free Layer at 5000 is the overlay: main holds resize-a
    // 0-4000 and resize-b 8000-10000, the overlay holds overlay-a 12000-14000.
    const overlayLayerId = before.record.composition.layers.find((layer) => layer.rank === 1)!.id
    expect(added[0].zoneId).toBe('z1')
    expect(added[0].layerId).toBe(overlayLayerId)
    expect(added[0].startMs).toBe(5_000)
    expect(added[0].durationMs).toBe(5_000)
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'clip', clipId: added[0].id })
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('disables Add Clip with every Layer occupied at the playhead', async () => {
    const user = userEvent.setup()
    const record = v2TracerRecord('add-clip-blocked')
    record.composition.clips.find((clip) => clip.id === 'resize-b')!.durationMs = 12_000
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    act(() => useShowTransportStore.setState({ showId: editor.showId, positionMs: 13_000 }))

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const command = screen.getByRole('menuitem', { name: 'Clip unavailable: no empty Layer' })
    expect(command).toBeDisabled()
    expectNoWrite(before, editor.state())
  })

  it('adds a Clip at Show End and extends the Show on v2 (#1091)', async () => {
    const user = userEvent.setup()
    const editor = openV2Editor('add-clip-show-end')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const showEndMs = before.record.composition.showEndMs
    act(() => useShowTransportStore.setState({ showId: editor.showId, positionMs: showEndMs }))

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const command = screen.getByRole('menuitem', { name: 'Clip' })
    expect(command).toBeEnabled()
    await user.click(command)
    const dialog = screen.getByRole('dialog', { name: 'Add Clip at playhead' })
    await user.click(within(dialog).getByRole('combobox', { name: 'Pattern for new Clip' }))
    await user.click(screen.getByRole('option', { name: 'AuroraSphere' }))

    await waitFor(() => {
      expect(editor.state().record.composition.clips).toHaveLength(before.record.composition.clips.length + 1)
    })
    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotCreateClip'])
    const beforeIds = new Set(before.record.composition.clips.map((clip) => clip.id))
    const added = after.record.composition.clips.filter((clip) => !beforeIds.has(clip.id))
    expect(added).toHaveLength(1)
    expect(added[0].startMs).toBe(showEndMs)
    expect(after.record.composition.showEndMs).toBe(showEndMs + added[0].durationMs)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })
})
// ── Slice C: Marker editing, Insert Time and Add Layer reach their v2 doors (#1090) ──
// The ruler Marker source, the Marker lane gestures, Add → Time and Add →
// Layer commit through the marker, insert-time and layer doors on a v2 row.
// Every accepted edit keeps the tracer fences: exactly one history entry and
// one save, record identity on refusal, exact Undo then Redo, and no legacy
// owner invocation.

/** The connected baseline plus one authored Marker the lane can work on. */
function markerSliceCRecord(id: string): ShowRecordV2 {
  const record = connectedV2Record(id)
  record.composition.markers = [{ id: 'm1', timeMs: 5000, name: 'Alpha', color: '#f59e0b' }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

/** The marker-door submissions one gesture made, in order. */
function markerSubmissions() {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotMarkerEdit')
    .map((call) => ({ intent: call.request.intent, baseRevision: call.request.baseRevision }))
}

/** The insert-time-door submissions one gesture made, in order. */
function insertTimeSubmissions() {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotInsertTime')
    .map((call) => ({ intent: call.request.intent, baseRevision: call.request.baseRevision }))
}

/** The layer-door submissions one gesture made, in order. */
function layerSubmissions() {
  return admission.calls
    .filter((call) => call.door === 'admitShowV2PilotLayerEdit')
    .map((call) => ({ intent: call.request.intent, baseRevision: call.request.baseRevision }))
}

async function openInsertTimeDialog(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Add to Show' }))
  await act(async () => {})
  fireEvent.click(screen.getByRole('menuitem', { name: 'Time' }))
  await act(async () => {})
  return screen.getByRole('dialog', { name: 'Insert Time' })
}

/** The marker surface rect: 200 px span the 20 s Show, so 1 px is 100 ms. */
function mockMarkerSurface(): void {
  vi.spyOn(screen.getByLabelText('Timeline Markers and Show End'), 'getBoundingClientRect').mockReturnValue({
    left: 0, right: 200, top: 0, bottom: 40, width: 200, height: 40, x: 0, y: 0, toJSON: () => ({}),
  })
}

describe('v2 markers, insert time and add layer (#1090 slice C)', () => {
  it('adds a Marker at the playhead from the ruler source through the marker door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('sliceC-marker-add'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    act(() => useShowTransportStore.setState({ showId: editor.showId, positionMs: 4023.6 }))
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Add Marker at playhead' }))
    await act(async () => {})

    const after = editor.state()
    // The fractional playhead rounds exactly as the v1 surface normalises it.
    // The converted baseline already carries its Scene-label chapter Marker,
    // which is not an authored Marker, so the new Marker is Marker 1, as v1 counts.
    const markerName = `Marker ${before.record.composition.markers.filter(marker => marker.origin !== 'converted-scene-label').length + 1}`
    expect(markerName).toBe('Marker 1')
    const beforeIds = new Set(before.record.composition.markers.map((marker) => marker.id))
    expect(markerSubmissions()).toEqual([{
      intent: {
        kind: 'add',
        marker: { id: expect.any(String), timeMs: 4024, name: markerName, color: '#f59e0b' },
      },
      baseRevision: 0,
    }])
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotMarkerEdit'])
    const added = after.record.composition.markers.filter((marker) => !beforeIds.has(marker.id))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ timeMs: 4024, name: markerName, color: '#f59e0b' })
    expect(screen.getByRole('button', { name: `${markerName} at 4.024 seconds` })).toBeInTheDocument()
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('moves a Marker through the marker door', async () => {
    const editor = openV2EditorForRecord(markerSliceCRecord('sliceC-marker-move'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    mockMarkerSurface()
    const before = editor.state()

    // Alt escapes the grid and magnetism to raw milliseconds: x=80 is 8000 ms.
    const button = screen.getByRole('button', { name: 'Alpha at 5 seconds' })
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 50 })
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 80, altKey: true })
    await act(async () => {})

    const after = editor.state()
    expect(markerSubmissions()).toEqual([{
      intent: { kind: 'move', markerId: 'm1', timeMs: 8000 },
      baseRevision: 0,
    }])
    expect(after.record.composition.markers).toMatchObject([{ id: 'm1', timeMs: 8000, name: 'Alpha' }])
    expect(screen.getByRole('button', { name: 'Alpha at 8 seconds' })).toBeInTheDocument()
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('renames a Marker through the marker door', async () => {
    const editor = openV2EditorForRecord(markerSliceCRecord('sliceC-marker-rename'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Alpha at 5 seconds' }))
    await act(async () => {})
    const dialog = screen.getByRole('dialog', { name: 'Alpha details' })
    const name = within(dialog).getByRole('textbox', { name: 'Marker name' })
    fireEvent.change(name, { target: { value: 'Beta' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    await act(async () => {})

    const after = editor.state()
    expect(markerSubmissions()).toEqual([{
      intent: { kind: 'update', markerId: 'm1', patch: { name: 'Beta' } },
      baseRevision: 0,
    }])
    expect(after.record.composition.markers).toMatchObject([{ id: 'm1', timeMs: 5000, name: 'Beta' }])
    expect(screen.getByRole('button', { name: 'Beta at 5 seconds' })).toBeInTheDocument()
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('removes a Marker through the marker door', async () => {
    const editor = openV2EditorForRecord(markerSliceCRecord('sliceC-marker-remove'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Alpha at 5 seconds' }))
    await act(async () => {})
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Alpha details' }))
      .getByRole('button', { name: 'Delete Alpha' }))
    await act(async () => {})

    const after = editor.state()
    expect(markerSubmissions()).toEqual([{
      intent: { kind: 'remove', markerId: 'm1' },
      baseRevision: 0,
    }])
    expect(after.record.composition.markers).toEqual([])
    expect(screen.queryByRole('button', { name: 'Alpha at 5 seconds' })).not.toBeInTheDocument()
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('refuses a move on a Marker id that does not exist with no write', async () => {
    const editor = openV2EditorForRecord(markerSliceCRecord('sliceC-marker-refuse'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    mockMarkerSurface()
    const button = screen.getByRole('button', { name: 'Alpha at 5 seconds' })
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 50 })
    // The mounted handle outlives its Marker: a concurrent removal lands
    // before release, so the committed move names a missing Marker. The store
    // object is edited in place so no render unmounts the handle first.
    editor.state().record.composition.markers = []
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 80, altKey: true })
    await act(async () => {})

    // The owner refuses the missing Marker, and the refusal persists nothing:
    // no history entry, no save, no legacy touch. Record identity is vacuous
    // here (the setup edits the live object), so it is not asserted.
    const after = editor.state()
    expect(markerSubmissions()).toEqual([{
      intent: { kind: 'move', markerId: 'm1', timeMs: 8000 },
      baseRevision: 0,
    }])
    expect(after.record.composition.markers).toEqual([])
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(after.legacyWrites).toBe(0)
    expect(legacy.calls).toEqual([])
  })

  it('inserts Time on a v2 Show at a free time through the insert-time door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('sliceC-insert'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    act(() => useShowTransportStore.setState({ showId: editor.showId, positionMs: 10000 }))
    const before = editor.state()

    const dialog = await openInsertTimeDialog()
    expect(within(dialog).getByRole('button', { name: 'Insert' })).toBeEnabled()
    const amount = within(dialog).getByRole('textbox', { name: 'Time to insert in seconds exact time' })
    fireEvent.change(amount, { target: { value: '2' } })
    fireEvent.keyDown(amount, { key: 'Enter' })
    await act(async () => {})
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Insert Time' })).getByRole('button', { name: 'Insert' }))
    await act(async () => {})

    const after = editor.state()
    expect(insertTimeSubmissions()).toEqual([{
      intent: { atMs: 10000, durationMs: 2000 },
      baseRevision: 0,
    }])
    // The Clip after the insertion point moves later by the duration, the
    // joined pair before it is untouched, and Show End grows by it.
    expect(authoredClip(after.record, 'overlay-a').startMs).toBe(14000)
    expect(authoredClip(after.record, 'resize-b').startMs).toBe(7000)
    expect(after.record.composition.showEndMs).toBe(22000)
    expect(screen.queryByRole('dialog', { name: 'Insert Time' })).not.toBeInTheDocument()
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('inserts Time from a fractional playhead rounded to whole milliseconds', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('sliceC-insert-fractional'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    act(() => useShowTransportStore.setState({ showId: editor.showId, positionMs: 4023.6 }))
    const before = editor.state()

    const dialog = await openInsertTimeDialog()
    expect(within(dialog).getByRole('button', { name: 'Insert' })).toBeEnabled()
    const amount = within(dialog).getByRole('textbox', { name: 'Time to insert in seconds exact time' })
    fireEvent.change(amount, { target: { value: '2' } })
    fireEvent.keyDown(amount, { key: 'Enter' })
    await act(async () => {})
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Insert Time' })).getByRole('button', { name: 'Insert' }))
    await act(async () => {})

    const after = editor.state()
    expect(insertTimeSubmissions()).toEqual([{
      intent: { atMs: 4024, durationMs: 2000 },
      baseRevision: 0,
    }])
    expect(after.record.composition.showEndMs).toBe(22000)
    expect(screen.queryByRole('dialog', { name: 'Insert Time' })).not.toBeInTheDocument()
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('disables Insert strictly inside a visual Transition window with the owner message', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('sliceC-insert-refuse'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    // The join-a-b crossfade owns (5000, 7000); 6000 is strictly inside it.
    act(() => useShowTransportStore.setState({ showId: editor.showId, positionMs: 6000 }))
    const before = editor.state()

    const dialog = await openInsertTimeDialog()
    expect(within(dialog).getByRole('button', { name: 'Insert' })).toBeDisabled()
    expect(within(dialog).getByText(/strictly inside visual Transition/)).toBeInTheDocument()
    expectNoWrite(before, editor.state())
  })

  it('adds a Layer to the target Zone through the layer door', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('sliceC-layer'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()

    fireEvent.click(screen.getByRole('button', { name: 'Add to Show' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('menuitem', { name: 'Layer' }))
    await act(async () => {})

    const after = editor.state()
    expect(layerSubmissions()).toEqual([{
      intent: {
        kind: 'add',
        layer: { id: expect.any(String), zoneId: 'z1', name: 'Layer 2', rank: 2 },
      },
      baseRevision: 0,
    }])
    // The new Layer lands on top of the Zone stack, above the converted Main
    // and Atmosphere Layers, with the v1 overlay number for its rank.
    expect(after.record.composition.layers
      .filter((layer) => layer.zoneId === 'z1')
      .sort((left, right) => left.rank - right.rank)
      .map((layer) => ({ name: layer.name, rank: layer.rank }))).toEqual([
      { name: 'Main', rank: 0 },
      { name: 'Atmosphere', rank: 1 },
      { name: 'Layer 2', rank: 2 },
    ])
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })
})
// ── Slice C corrective: Add Clip and Add Layer resolve their Zone from the Layout at the playhead (#1090) ──
// Zones A (z1) and B (z2). Layout `full` provides A over 0–5 s; Layout
// `narrow` provides only B over 5–10 s. Both Zones hold one empty Layer, so at
// 6 s with nothing selected the Add menu must offer B, not A.
/** Two Zones, two Layout definitions, two occurrences, empty Layers in both Zones. */
function layoutZoneSliceCRecord(id: string): ShowRecordV2 {
  const record = connectedV2Record(id)
  record.zones = [
    { id: 'z1', name: 'A', nominalPixelCount: 64 },
    { id: 'z2', name: 'B', nominalPixelCount: 64 },
  ]
  record.zoneLayouts = [
    { id: 'layout-full', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['z1'] } },
    { id: 'layout-narrow', name: 'Narrow', zones: [], logical: { kind: 'single', zoneIds: ['z2'] } },
  ]
  record.composition.showEndMs = 10_000
  record.composition.layoutOccurrences = [
    { id: 'occ-full', layoutId: 'layout-full', startMs: 0, durationMs: 5_000, parameters: {} },
    { id: 'occ-narrow', layoutId: 'layout-narrow', startMs: 5_000, durationMs: 5_000, parameters: {} },
  ]
  record.composition.layers = [
    { id: 'layer-a', zoneId: 'z1', name: 'Main', rank: 0 },
    { id: 'layer-b', zoneId: 'z2', name: 'Main', rank: 0 },
  ]
  record.composition.clips = []
  record.composition.transitions = []
  record.composition.groupOccurrences = []
  record.composition.groupDefinitions = []
  record.composition.propertyTracks = []
  record.composition.markers = []
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

describe('v2 Add Clip and Add Layer resolve the Zone from the Layout at the playhead (#1090 slice C corrective)', () => {
  it('adds one Clip from the Add menu in Zone B at 6 s', async () => {
    const user = userEvent.setup()
    const editor = openV2EditorForRecord(layoutZoneSliceCRecord('sliceC-layout-clip'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    act(() => useShowTransportStore.setState({ showId: editor.showId, positionMs: 6_000 }))

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const command = screen.getByRole('menuitem', { name: 'Clip' })
    expect(command).toBeEnabled()
    await user.click(command)
    const dialog = screen.getByRole('dialog', { name: 'Add Clip at playhead' })
    await user.click(within(dialog).getByRole('combobox', { name: 'Pattern for new Clip' }))
    await user.click(screen.getByRole('option', { name: 'AuroraSphere' }))

    await waitFor(() => {
      expect(editor.state().record.composition.clips).toHaveLength(before.record.composition.clips.length + 1)
    })
    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotCreateClip'])
    const beforeIds = new Set(before.record.composition.clips.map((clip) => clip.id))
    const added = after.record.composition.clips.filter((clip) => !beforeIds.has(clip.id))
    expect(added).toHaveLength(1)
    expect(added[0].zoneId).toBe('z2')
    expect(added[0].layerId).toBe('layer-b')
    expect(added[0].startMs).toBe(6_000)
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })

  it('adds a Layer in Zone B at 6 s', async () => {
    const editor = openV2EditorForRecord(layoutZoneSliceCRecord('sliceC-layout-layer'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    act(() => useShowTransportStore.setState({ showId: editor.showId, positionMs: 6_000 }))

    fireEvent.click(screen.getByRole('button', { name: 'Add to Show' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('menuitem', { name: 'Layer in B' }))
    await act(async () => {})

    const after = editor.state()
    expect(layerSubmissions()).toEqual([{
      intent: {
        kind: 'add',
        layer: { id: expect.any(String), zoneId: 'z2', name: 'Layer 1', rank: 1 },
      },
      baseRevision: 0,
    }])
    expect(after.record.composition.layers
      .filter((layer) => layer.zoneId === 'z2')
      .sort((left, right) => left.rank - right.rank)
      .map((layer) => ({ name: layer.name, rank: layer.rank }))).toEqual([
      { name: 'Main', rank: 0 },
      { name: 'Layer 1', rank: 1 },
    ])
    expectOneEdit(before, after)
    await expectUndoRedoExact(editor, before)
  })
})

describe('v2 restart availability (#1091)', () => {
  async function selectStockClip(clipId: string): Promise<void> {
    const node = document.querySelector<HTMLElement>(`[data-show-selection-key="clip:${clipId}"]`)
    if (!node) throw new Error(`No timeline button for ${clipId}.`)
    fireEvent.click(node)
    await act(async () => {})
  }

  it('disables Restart with its reason on a pattern that cannot reset and admits nothing on click', async () => {
    const { stockShowV2ById } = await import('@/pixelblaze/stock/showsV2')
    const source = stockShowV2ById('stock-show-302-installation-composition')
    if (!source) throw new Error('Missing stock show 302')
    const editor = openV2EditorForRecord(structuredClone(source))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectStockClip('hero-windows')
    showTab('Playback')

    const box = screen.getByRole('checkbox', { name: 'Restart Pattern on entry' })
    expect(box).toHaveAttribute('aria-disabled', 'true')
    expect(box).not.toBeDisabled()
    expect(box).toHaveAttribute('aria-describedby', 'clip-restart-unavailable-reason')
    expect(screen.getByText("This Pattern's state can't be reset.")).toBeInTheDocument()

    const before = editor.state()
    fireEvent.click(box)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expect(after.record).toBe(before.record)
  })

  it('keeps Restart enabled on an eligible stock clip', async () => {
    const { stockShowV2ById } = await import('@/pixelblaze/stock/showsV2')
    const source = stockShowV2ById('stock-show-101-clips-cuts-blank-time')
    if (!source) throw new Error('Missing stock show 101')
    const editor = openV2EditorForRecord(structuredClone(source))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectStockClip('clip-garden')
    showTab('Playback')

    const box = screen.getByRole('checkbox', { name: 'Restart Pattern on entry' })
    expect(box).toBeEnabled()
    expect(screen.queryByText("This Pattern's state can't be reset.")).not.toBeInTheDocument()
  })
})

// ── Timeline refusal feedback (#1098) ───────────────────────────────────────
// A refused v2 timeline gesture names its reason on release or drop: the red
// label on the anchoring Clip and the timeline's screen-reader status line.

function timelineStatus(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-show-timeline-focus] > [role="status"]')
}

function expectClipRefusal(clipId: string, label: string, status: string): void {
  expect(within(clipButton(clipId)).getByTestId('show-clip-delete-blocked')).toHaveTextContent(label)
  expect(screen.getAllByTestId('show-clip-delete-blocked')).toHaveLength(1)
  expect(timelineStatus()).toHaveTextContent(status)
}

/**
 * Counts Details re-anchors from now on. A successful Clip drop re-anchors any
 * open Details to the Clip's element through the one lookup that queries
 * every `[data-show-selection-key]`; a refused drop must never reach it.
 */
function watchDetailReanchors(): () => number {
  const query = vi.spyOn(document, 'querySelectorAll')
  const from = query.mock.calls.length
  return () => query.mock.calls.slice(from).filter(([selector]) => selector === '[data-show-selection-key]').length
}

/** Lets the drop's settlement and the re-anchor's zero-delay timer run. */
async function settleDrop(): Promise<void> {
  await act(async () => {})
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
}

/** The rendered main lane, sized so one pixel is `showEndMs / 200` ms. */
function sizedMainLane(): HTMLElement {
  const lane = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')
  if (!lane) throw new Error('No main Layer lane is rendered.')
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({
    left: 0, right: LANE_WIDTH_PX, top: 0, bottom: 40, width: LANE_WIDTH_PX, height: 40, x: 0, y: 0, toJSON() {},
  })
  Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', {
    configurable: true,
    value: LANE_WIDTH_PX,
  })
  return lane
}

describe('v2 timeline refusal feedback (#1098)', () => {
  it('re-anchors Details after an applied open-lane move (oracle control)', async () => {
    const editor = openV2Editor('refusal-reanchor-control')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('main'), 'dragover', DROP_X)
    const reanchors = watchDetailReanchors()
    surface.fire(surface.lane('main'), 'drop', DROP_X)
    await settleDrop()

    expect(authoredClip(editor.state().record, 'resize-a').startMs).toBe(SETTLED_START_MS)
    expect(reanchors()).toBeGreaterThan(0)
    expect(timelineStatus()).toBeNull()
  })

  it('names an occupied-range move drop on the dragged Clip and writes nothing', async () => {
    const editor = openV2Editor('refusal-move-occupied')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')
    expect(timelineStatus()).toBeNull()

    // x=85 asks for 8500 ms: resize-a (4 s) would cover resize-b (8000-10000).
    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('main'), 'dragover', 85)
    // During the drag the move previews and nothing is said yet.
    expect(timelineStatus()).toBeNull()
    const reanchors = watchDetailReanchors()
    surface.fire(surface.lane('main'), 'drop', 85)
    await settleDrop()

    // The refusal is not a success: Details are not re-anchored.
    expect(reanchors()).toBe(0)
    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(after.record).toBe(before.record)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expect(after.legacyWrites).toBe(0)
    expectClipRefusal('resize-a', 'Space taken', 'Clips on one Layer cannot overlap.')
  })

  it('names an occupied-range Alt duplicate on the dragged Clip and writes nothing', async () => {
    const editor = openV2Editor('refusal-duplicate-occupied')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    const selectionBefore = useShowEditorViewStore.getState().selection
    surface.fire(surface.clip, 'dragstart', 0, true)
    surface.fire(surface.lane('main'), 'dragover', 85, true)
    const reanchors = watchDetailReanchors()
    surface.fire(surface.lane('main'), 'drop', 85, true)
    await settleDrop()

    // The preview refuses the copy (#1111-B3), selecting nothing new and re-anchoring nothing.
    expect(useShowEditorViewStore.getState().selection).toEqual(selectionBefore)
    expect(reanchors()).toBe(0)
    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual([])
    expect(after.record).toBe(before.record)
    expect(after.record.composition.clips).toHaveLength(before.record.composition.clips.length)
    expect(after.v2Writes).toBe(0)
    expectClipRefusal('resize-a', 'Space taken', 'Clips on one Layer cannot overlap.')
  })

  it('names an Alt-duplicate preview refused after a mid-drag Show End change as a changed Show, on release', async () => {
    const editor = openV2Editor('refusal-duplicate-show-end-race')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0, true)
    // Another writer extends Show End to 30 s while the drag is held. The
    // timeline now clamps against 30 s; the drag's capture still ends at 20 s,
    // so its check refuses a copy at 26 s as past Show End.
    const extended = structuredClone(before.record)
    extended.composition.showEndMs = 30_000
    const last = extended.composition.layoutOccurrences[extended.composition.layoutOccurrences.length - 1]
    last.durationMs = 30_000 - last.startMs
    expect(validateShowRecordV2(extended)).toEqual([])
    act(() => useShowStore.setState({
      showV2Pilots: { [editor.showId]: extended },
      showRevisions: { [editor.showId]: before.revision + 1 },
    }))
    const refreshed = dragSurface('resize-a')
    refreshed.fire(refreshed.lane('overlay'), 'dragover', 199, true)
    expect(refreshed.dataTransfer.dropEffect).toBe('none')
    expect(screen.queryByTestId('show-clip-move-preview')).not.toBeInTheDocument()
    expect(timelineStatus()).toBeNull()
    // A refused preview fires no drop; the release is the drag's end.
    refreshed.fire(clipButton('resize-a'), 'dragend', 199, true)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expect(after.v2Writes).toBe(0)
    expect(after.record.composition.clips).toHaveLength(before.record.composition.clips.length)
    expectClipRefusal('resize-a', 'Show changed', 'The Show changed; try again.')
    expect(screen.queryByText('Space taken')).not.toBeInTheDocument()
  })

  it('keeps Clone of a Clip ending at Show End disabled with its existing reason', async () => {
    const record = v2TracerRecord('refusal-clone-show-end')
    const overlay = record.composition.clips.find((clip) => clip.id === 'overlay-a')!
    overlay.durationMs = record.composition.showEndMs - overlay.startMs
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(clipButton('overlay-a'))
    await act(async () => {})
    const before = editor.state()

    const clone = timelineCommand('Clone selection')
    expect(clone).toHaveAttribute('aria-disabled', 'true')
    expect(clone).toHaveAccessibleDescription('The selected Clip needs empty time after it on this Layer')
    fireEvent.click(clone)
    await act(async () => {})

    expectNoWrite(before, editor.state())
    expect(screen.queryByTestId('show-clip-delete-blocked')).not.toBeInTheDocument()
  })

  it('names a move into a Zone no Layout covers', async () => {
    const record = twoZoneV2Record('refusal-zone-unavailable')
    // From 10 s a second Layout routes only the first Zone, so the second
    // Zone has no Layout there.
    const [layout] = record.zoneLayouts
    record.zoneLayouts = [...record.zoneLayouts, { ...structuredClone(layout), id: 'first-only', name: 'First only', zones: [], logical: { kind: 'single', zoneIds: ['z1'] } }]
    const [occurrence] = record.composition.layoutOccurrences
    record.composition.layoutOccurrences = [
      { ...structuredClone(occurrence), startMs: 0, durationMs: 10_000 },
      { ...structuredClone(occurrence), id: 'first-only-occurrence', layoutId: 'first-only', startMs: 10_000, durationMs: record.composition.showEndMs - 10_000 },
    ]
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = zoneDropSurface('overlay-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.zoneLane('z2', 'main'), 'dragover', 110)
    surface.fire(surface.zoneLane('z2', 'main'), 'drop', 110)
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(after.record).toBe(before.record)
    expect(after.v2Writes).toBe(0)
    expectClipRefusal('overlay-a', 'No Zone Layout', 'No Zone Layout covers this time.')
  })

  it('names a Split whose playhead rounds onto the Clip edge', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('refusal-split-edge'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    // 0.3 ms inside resize-b's start: the capability sees an interior
    // playhead, and the planner rounds it onto the edge.
    await selectClipAt(editor.showId, 'CometLoom', 1, 7_000.3)
    const before = editor.state()

    fireEvent.click(timelineCommand('Split at playhead'))
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls).toEqual([])
    expect(after.record).toBe(before.record)
    expect(after.v2Writes).toBe(0)
    expectClipRefusal('resize-b', 'Playhead at the edge', 'Move the playhead inside the Clip to split it.')
  })

  it('names a double-click add inside a Transition in the status only', async () => {
    const record = connectedV2Record('refusal-add-transition')
    const [window] = visualWindows(record)
    expect(window).toBeDefined()
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const lane = sizedMainLane()
    const midMs = (window.startMs + window.endMs) / 2
    const clientX = midMs / record.composition.showEndMs * LANE_WIDTH_PX

    fireEvent.doubleClick(lane, { clientX, altKey: true })
    await act(async () => {})

    expectNoWrite(before, editor.state())
    expect(timelineStatus()).toHaveTextContent('A Clip cannot start inside a Transition.')
    expect(screen.queryByTestId('show-clip-delete-blocked')).not.toBeInTheDocument()
  })

  it('names a move commit whose capture went stale as a changed Show', async () => {
    const editor = openV2Editor('refusal-move-stale')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const surface = dragSurface('resize-a')

    surface.fire(surface.clip, 'dragstart', 0)
    surface.fire(surface.lane('main'), 'dragover', DROP_X)
    // Another writer advances the revision while the drag is held.
    act(() => useShowStore.setState({ showRevisions: { [editor.showId]: before.revision + 1 } }))
    const reanchors = watchDetailReanchors()
    surface.fire(surface.lane('main'), 'drop', DROP_X)
    await settleDrop()

    expect(reanchors()).toBe(0)
    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(after.record).toBe(before.record)
    expect(after.v2Writes).toBe(0)
    expectClipRefusal('resize-a', 'Show changed', 'The Show changed; try again.')
  })
})

// ── Panel refusal feedback (#1098) ──────────────────────────────────────────
// A refused panel edit names its reason in one inline alert line, the panel's
// last element, which clears on the panel's next edit.

function panelRefusalLines(text: string): HTMLElement[] {
  return screen.queryAllByRole('alert').filter((line) => line.textContent === text)
}

function expectPanelRefusal(text: string, panel: HTMLElement): void {
  const lines = panelRefusalLines(text)
  expect(lines).toHaveLength(1)
  expect(panel.contains(lines[0])).toBe(true)
  expect(lines[0].nextElementSibling).toBeNull()
}

function clipDetail(): HTMLElement {
  const detail = document.querySelector<HTMLElement>('[data-entity-family="clip"]')
  if (!detail) throw new Error('No Clip detail is open.')
  return detail
}

describe('v2 panel refusal feedback (#1098)', () => {
  it('names an inspector Duration that overlaps the next Clip, restores the field, and clears on the next accepted edit', async () => {
    const editor = openV2Editor('panel-refusal-overlap')
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('CometLoom', 0)
    const before = editor.state()
    expect(authoredClip(before.record, 'resize-a').durationMs).toBe(4_000)

    // resize-a would run 0-9000 over resize-b at 8000-10000.
    typeAndCommit('Duration seconds exact time', '9')
    await act(async () => {})

    const after = editor.state()
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(after.record).toBe(before.record)
    expect(after.history).toEqual({ past: [], future: [] })
    expect(after.v2Writes).toBe(0)
    expectPanelRefusal('Clips on one Layer cannot overlap.', clipDetail())
    expect(screen.getByRole('textbox', { name: 'Duration seconds exact time' })).toHaveValue('4')

    typeAndCommit('Duration seconds exact time', '5')
    await act(async () => {})

    expect(authoredClip(editor.state().record, 'resize-a').durationMs).toBe(5_000)
    expect(panelRefusalLines('Clips on one Layer cannot overlap.')).toEqual([])
  })

  it('names a whole-Clip Effect change on a Clip whose held segments differ', async () => {
    const record = connectedV2Record('panel-refusal-multi-key')
    const clip = record.composition.clips.find((candidate) => candidate.id === 'overlay-a')!
    const first = clip.appearance.keys[0]
    clip.appearance.keys = [0, 1].map((index) => ({
      ...structuredClone(first), id: `overlay-appearance-${index}`, timeMs: first.timeMs + index * 500,
      value: {
        ...structuredClone(first.value),
        effects: index === 0 ? [] : [{ id: 'held-ripple', kind: 'ripple', amount: 0.1, frequency: 3, phase: 0.2, centerX: 0.5, centerY: 0.5 }],
      },
    }))
    expect(validateShowRecordV2(record)).toEqual([])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    showTab('Effects')
    const before = editor.state()

    await addEffectThroughPalette('Ripple')

    expectNoWrite(before, editor.state())
    expectPanelRefusal("This Clip's Effects differ between its held segments; edit each segment instead.", clipDetail())
  })

  it('names a Group occurrence Start that no Layout covers and restores the field', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'panel-refusal-group-start'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!)
    await act(async () => {})
    const before = editor.state()
    const field = screen.getByRole('textbox', { name: 'Start seconds exact time' })
    const stored = (field as HTMLInputElement).value

    // Layout occurrences end at Show End, so a Group starting there has none.
    typeAndCommit('Start seconds exact time', String(record.composition.showEndMs / 1_000))
    await act(async () => {})

    expectNoWrite(before, editor.state())
    const panel = field.closest<HTMLElement>('section') ?? document.body
    expectPanelRefusal('No Zone Layout covers this start.', panel)
    expect(screen.getByRole('textbox', { name: 'Start seconds exact time' })).toHaveValue(stored)
  })

  it('names a Layer Transition retime past Show End and keeps the popover open', async () => {
    const record = convertedLayerTransitions('panel-refusal-retime')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    fireEvent.click(screen.getByRole('button', {
      name: 'Edit wipe Transition between EventHorizon and SignalMandala',
    }))
    await act(async () => {})
    const popover = screen.getByRole('dialog', { name: 'Layer Transition Details' })
    const duration = within(popover).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' })
    const stored = (duration as HTMLInputElement).value

    // SignalMandala ends under a second before Show End.
    fireEvent.change(duration, { target: { value: '3' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(editor.state().record).toBe(before.record)
    expect(editor.state().v2Writes).toBe(0)
    const open = screen.getByRole('dialog', { name: 'Layer Transition Details' })
    expectPanelRefusal('This Transition would run past Show End.', open)
    expect(within(open).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' })).toHaveValue(stored)
  })

  it('names a boundary Split Position animation whose end no Layout covers', async () => {
    const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!
    const record = convertForTest(structuredClone(stock.show) as ShowRecord)
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const before = editor.state()
    const junctions = screen.getAllByRole('button', { name: 'Edit crossfade Transition between LineDancer2D and LineDancer2D' })
    fireEvent.click(junctions[junctions.length - 1])
    await act(async () => {})
    // A valid record tiles Show End, so the planner reads a record without
    // the occurrence that covers this boundary's end.
    boundaryPlanner.narrow = (current) => ({
      ...current,
      composition: {
        ...current.composition,
        layoutOccurrences: current.composition.layoutOccurrences.filter((occurrence) => occurrence.id !== 'layout-occurrence:4'),
      },
    })

    fireEvent.click(within(boundaryPanel()).getByRole('checkbox', { name: 'Animate split position' }))
    await act(async () => {})

    expectNoWrite(before, editor.state())
    expectPanelRefusal("No Zone Layout covers this Transition's end.", boundaryPanel())
    expect(within(boundaryPanel()).getByRole('checkbox', { name: 'Animate split position' })).not.toBeChecked()
  })

  it('names an inspector commit that another writer overtook as a changed Show', async () => {
    const editor = openV2EditorForRecord(connectedV2Record('panel-refusal-race'))
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    await selectClipByName('TestPattern1D', 0)
    const before = editor.state()
    // Another writer lands between the inspector's plan and its door.
    admission.beforeDoor = () => useShowStore.setState({ showRevisions: { [editor.showId]: before.revision + 1 } })

    typeAndCommit('Duration seconds exact time', '3')
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotClipTemporal'])
    expect(editor.state().record).toBe(before.record)
    expect(editor.state().v2Writes).toBe(0)
    expectPanelRefusal('The Show changed; try again.', clipDetail())
    expect(screen.getByRole('textbox', { name: 'Duration seconds exact time' })).toHaveValue('2')
  })
})

// ── Refused panel field edits revert their draft (#1098 repair) ────────────
// Every field that feeds a panel alert line receives the refusal as `false`,
// so it shows the stored value again, and every refusal names a reason.

async function openLastPropertyAnimationBoundary(id: string): Promise<{ editor: OpenV2Editor; record: ShowRecordV2 }> {
  const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
  const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!
  const record = convertForTest(structuredClone(stock.show) as ShowRecord)
  record.id = id
  const editor = openV2EditorForRecord(record)
  render(<ShowEditor showId={editor.showId} recordVersion={2} />)
  const junctions = screen.getAllByRole('button', { name: 'Edit crossfade Transition between LineDancer2D and LineDancer2D' })
  fireEvent.click(junctions[junctions.length - 1])
  await act(async () => {})
  return { editor, record }
}

async function gappedGroupRecord(id: string): Promise<ShowRecordV2> {
  const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
  const record = propertyEditGroupRecord()
  record.id = id
  for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
  // Zone Layers at ranks 0, 1, 3 and 4: Base Layer 2 has no Layer, below the field's bound of 4.
  const template = record.composition.layers.find((layer) => layer.zoneId === 'zone')!
  record.composition.layers.push(
    { ...structuredClone(template), id: 'layer:zone:gap-a', name: 'Gap A', rank: 3 },
    { ...structuredClone(template), id: 'layer:zone:gap-b', name: 'Gap B', rank: 4 },
  )
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function groupPanel(): HTMLElement {
  const panel = screen.getByRole('button', { name: 'Duplicate Group occurrence' }).closest<HTMLElement>('section')
  if (!panel) throw new Error('No Group occurrence panel is open.')
  return panel
}

describe('v2 refused panel field edits revert their draft (#1098)', () => {
  it('restores a boundary Duration that would run past Show End and names it', async () => {
    // A native whole-output boundary retimes by shifting the Clips after it.
    // (A converted boundary instead grows Show End, so it never refuses here.)
    const { record } = nativeWholeOutputBoundary('panel-revert-boundary-duration')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getByRole('button', { name: /Edit crossfade Transition between/ }))
    await act(async () => {})
    const before = editor.state()
    const duration = within(boundaryPanel()).getByRole('textbox', { name: 'Duration (s) exact time' })
    const stored = (duration as HTMLInputElement).value
    expect(stored).toBe('2')

    // The incoming Clip ends at Show End, so a 10 s Transition pushes it
    // past Show End and the resize owner refuses.
    fireEvent.change(duration, { target: { value: '10' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionResize'])
    expect(editor.state().record).toBe(before.record)
    expect(editor.state().v2Writes).toBe(0)
    expectPanelRefusal('This Transition would run past Show End.', boundaryPanel())
    expect(within(boundaryPanel()).getByRole('textbox', { name: 'Duration (s) exact time' })).toHaveValue(stored)
  })

  it('restores a boundary sub-editor field whose commit another writer overtook', async () => {
    const { editor } = await openLastPropertyAnimationBoundary('panel-revert-boundary-repeat')
    const before = editor.state()
    const field = within(boundaryPanel()).getByRole('textbox', { name: 'Repeat scale duration seconds exact time' })
    const stored = (field as HTMLInputElement).value
    admission.beforeDoor = () => useShowStore.setState({ showRevisions: { [editor.showId]: before.revision + 1 } })

    fireEvent.change(field, { target: { value: '1' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotTransitionEdit'])
    expect(editor.state().record).toBe(before.record)
    expectPanelRefusal('The Show changed; try again.', boundaryPanel())
    expect(within(boundaryPanel()).getByRole('textbox', { name: 'Repeat scale duration seconds exact time' })).toHaveValue(stored)
  })

  it('bounds Base Layer at the rebinding limit, and names and restores a rank with no Layer below it', async () => {
    const record = await gappedGroupRecord('panel-revert-base-layer')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!)
    await act(async () => {})
    const before = editor.state()
    const field = within(groupPanel()).getByRole('textbox', { name: 'Base Layer' })
    expect(field).toHaveValue('1')

    fireEvent.change(field, { target: { value: '2' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await act(async () => {})

    expectNoWrite(before, editor.state())
    expectPanelRefusal('No Layer at that rank in this Group.', groupPanel())
    expect(within(groupPanel()).getByRole('textbox', { name: 'Base Layer' })).toHaveValue('1')

    // Beyond the bound the field clamps to the highest rank the rebinding accepts.
    fireEvent.change(field, { target: { value: '99' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await act(async () => {})
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(editor.state().record.composition.groupOccurrences.find((occurrence) => occurrence.id === 'occ-0')!.layerBindings)
      .toEqual([{ definitionLayerId: 'local-layer', layerId: 'layer:zone:gap-b' }])
    expect(panelRefusalLines('No Layer at that rank in this Group.')).toEqual([])
  })

  it('restores a Group offset whose commit another writer overtook', async () => {
    const record = await gappedGroupRecord('panel-revert-group-offset')
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!)
    await act(async () => {})
    const before = editor.state()
    const field = within(groupPanel()).getByRole('textbox', { name: 'X offset' })
    const stored = (field as HTMLInputElement).value
    admission.beforeDoor = () => useShowStore.setState({ showRevisions: { [editor.showId]: before.revision + 1 } })

    fireEvent.change(field, { target: { value: '0.25' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(editor.state().record).toBe(before.record)
    expectPanelRefusal('The Show changed; try again.', groupPanel())
    expect(within(groupPanel()).getByRole('textbox', { name: 'X offset' })).toHaveValue(stored)
  })

  it('names a Group Clip Pattern change that another writer overtook', async () => {
    const { propertyEditGroupRecord } = await import('@/test/showV2PropertyEditsFixture')
    const record = propertyEditGroupRecord()
    record.id = 'panel-revert-group-clip-pattern'
    for (const instance of [...record.composition.patternInstances, ...record.composition.groupDefinitions.flatMap((definition) => definition.patternInstances)]) delete instance.controlTargets
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Definition' })[0]!, { detail: 2 })
    await act(async () => {})
    showTab('Pattern')
    const before = editor.state()
    admission.beforeDoor = () => useShowStore.setState({ showRevisions: { [editor.showId]: before.revision + 1 } })

    pickSourcePattern('TestPattern2D')
    await act(async () => {})

    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupReplacementEdit'])
    expect(editor.state().record).toBe(before.record)
    expectPanelRefusal('The Show changed; try again.', clipDetail())
  })
})

describe('v2 Group Transition popover refusal per occurrence (#1098)', () => {
  it('clears a refusal when the popover moves to the same Transition in a linked occurrence', async () => {
    // Two linked occurrences share one definition, so both junctions carry
    // the definition-local Transition id group-pulse-join.
    const source = corpusSource('groups-animation')
    source.id = 'panel-refusal-linked-group-transition'
    const definition = source.composition!.groupDefinitions![0]
    definition.placements = [
      { ...definition.placements[0], startMs: 0, durationMs: 2_000, layerOffset: 0 },
      { ...definition.placements[1], startMs: 3_000, durationMs: 1_000, layerOffset: 0 },
    ]
    definition.propertyTracks = []
    definition.transitions = [{
      id: 'group-pulse-join', fromPlacementId: definition.placements[0].id, toPlacementId: definition.placements[1].id,
      kind: 'crossfade', durationMs: 1_000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
    }]
    const record = convertForTest(source)
    expect(record.composition.groupOccurrences.map((occurrence) => occurrence.id)).toEqual(['occurrence-first', 'occurrence-second'])
    const editor = openV2EditorForRecord(record)
    render(<ShowEditor showId={editor.showId} recordVersion={2} />)
    const junction = (occurrenceId: string) => screen.getAllByRole('button', { name: 'Edit crossfade Transition between SignalMandala and SignalMandala' })
      .find((button) => button.getAttribute('data-show-group-occurrence') === occurrenceId)!
    const popover = () => screen.getByRole('dialog', { name: 'Layer Transition Details' })
    const before = editor.state()

    // A Group's internals are reached through isolation.
    fireEvent.click(screen.getAllByRole('button', { name: 'Select Group Mandala pulse' })[0]!, { detail: 2 })
    await act(async () => {})
    fireEvent.click(junction('occurrence-first'))
    await act(async () => {})
    // Another writer lands between the retime's plan and its door.
    admission.beforeDoor = () => useShowStore.setState({ showRevisions: { [editor.showId]: before.revision + 1 } })
    const duration = within(popover()).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' })
    fireEvent.change(duration, { target: { value: '1.5' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await act(async () => {})
    expect(admission.calls.map((call) => call.door)).toEqual(['admitShowV2PilotGroupOccurrenceEdit'])
    expect(editor.state().record).toBe(before.record)
    expect(within(popover()).getByRole('alert')).toHaveTextContent('The Show changed; try again.')

    // A Group junction opens only inside its own isolation, and leaving or
    // entering isolation closes the popover. So the user reaches the other
    // occurrence's Transition by double-clicking out of A, double-clicking
    // into B, and opening B's junction. The popover key names the occurrence
    // too (showLayerTransitionPopoverKey), so a retarget that skipped the
    // close would still clear the line.
    admission.beforeDoor = null
    const secondChild = () => screen.getAllByRole('button', { name: 'Select Group Mandala pulse' })
      .find((button) => button.closest('[data-show-group-occurrence]')?.getAttribute('data-show-group-occurrence') === 'occurrence-second')!
    fireEvent.doubleClick(secondChild())
    await act(async () => {})
    fireEvent.doubleClick(secondChild())
    await act(async () => {})
    expect(useShowEditorViewStore.getState().selection).toMatchObject({ kind: 'group-clip', occurrenceId: 'occurrence-second' })
    fireEvent.click(junction('occurrence-second'))
    await act(async () => {})
    expect(junction('occurrence-second').getAttribute('data-show-layer-junction')).toBe('occurrence-second:group-pulse-join')
    expect(within(popover()).queryByRole('alert')).not.toBeInTheDocument()
    // The popover now edits the second occurrence: its retime goes to that occurrence's owner.
    fireEvent.change(within(popover()).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' }), { target: { value: '1.5' } })
    fireEvent.keyDown(within(popover()).getByRole('textbox', { name: 'Layer Transition duration in seconds exact time' }), { key: 'Enter' })
    await act(async () => {})
    expect(admission.calls).toHaveLength(2)
    expect(editor.state().record.composition.groupDefinitions[0]!.transitions.find((transition) => transition.id === 'group-pulse-join')?.durationMs).toBe(1_500)
  })
})
