// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editorInitialState, useEditorStore, type EditorFlavor } from './editorStore'
import { libraryInitialState, useLibraryStore } from './libraryStore'
import { mapInitialState, useMapStore } from './mapStore'
import { mixinInitialState, useMixinStore } from './mixinStore'
import { patternInitialState, usePatternStore } from './patternStore'
import { routerInitialState, useRouterStore } from './routerStore'
import { __resetAutosaveSyncForTests } from './autosaveSync'
import {
  __resetNavigationPreflightForTests,
  cancelNavigationPreflight,
  continueNavigationPreflight,
  installNavigationPreflight,
  requestBufferReplacement,
  useNavigationPreflightStore,
} from './navigationPreflightStore'

const RECORD = {
  id: 'owned-1',
  name: 'Broken aurora',
  persisted: 'export function render(index) {}',
}

type OwnerCase = {
  flavor: EditorFlavor
  kind: 'patterns' | 'maps' | 'mixins' | 'libraries'
  seed: (includeRecord?: boolean) => void
  durableSource: () => string | undefined
  replaceDurableSource: (source: string) => void
}

const ownerCases: OwnerCase[] = [
  {
    flavor: 'pattern',
    kind: 'patterns',
    seed: (includeRecord = true) => usePatternStore.setState({
      activePatternId: RECORD.id,
      userPatterns: includeRecord ? [{
        id: RECORD.id,
        name: RECORD.name,
        src: RECORD.persisted,
        controls: {},
        updatedAt: 100,
      }] : [],
    }),
    durableSource: () => usePatternStore.getState().userPatterns[0]?.src,
    replaceDurableSource: (source) => usePatternStore.setState((state) => ({
      userPatterns: state.userPatterns.map((pattern) => (
        pattern.id === RECORD.id ? { ...pattern, src: source } : pattern
      )),
    })),
  },
  {
    flavor: 'map',
    kind: 'maps',
    seed: (includeRecord = true) => useMapStore.setState({
      editingMap: { kind: 'existing', id: RECORD.id },
      userMaps: includeRecord ? [{
        id: RECORD.id,
        name: RECORD.name,
        dim: 2,
        generator: 'custom',
        params: {},
        source: RECORD.persisted,
        updatedAt: 100,
      }] : [],
    }),
    durableSource: () => useMapStore.getState().userMaps[0]?.source,
    replaceDurableSource: (source) => useMapStore.setState((state) => ({
      userMaps: state.userMaps.map((map) => (
        map.id === RECORD.id ? { ...map, source } : map
      )),
    })),
  },
  {
    flavor: 'mixin',
    kind: 'mixins',
    seed: (includeRecord = true) => useMixinStore.setState({
      editingMixin: { kind: 'existing', id: RECORD.id },
      userMixins: includeRecord ? [{
        id: RECORD.id,
        name: RECORD.name,
        kind: 'bind',
        src: RECORD.persisted,
        updatedAt: 100,
      }] : [],
    }),
    durableSource: () => useMixinStore.getState().userMixins[0]?.src,
    replaceDurableSource: (source) => useMixinStore.setState((state) => ({
      userMixins: state.userMixins.map((mixin) => (
        mixin.id === RECORD.id ? { ...mixin, src: source } : mixin
      )),
    })),
  },
  {
    flavor: 'library',
    kind: 'libraries',
    seed: (includeRecord = true) => useLibraryStore.setState({
      editingLibrary: { kind: 'existing', id: RECORD.id },
      userLibraries: includeRecord ? [{
        id: RECORD.id,
        name: RECORD.name,
        src: RECORD.persisted,
        updatedAt: 100,
      }] : [],
    }),
    durableSource: () => useLibraryStore.getState().userLibraries[0]?.src,
    replaceDurableSource: (source) => useLibraryStore.setState((state) => ({
      userLibraries: state.userLibraries.map((library) => (
        library.id === RECORD.id ? { ...library, src: source } : library
      )),
    })),
  },
]

const confirmOwnerCases = ownerCases.filter((owner) => owner.flavor !== 'pattern')

function seedOwner(owner: OwnerCase, options: {
  source?: string
  compileStatus?: 'good' | 'broken'
  isReadOnly?: boolean
  includeRecord?: boolean
  routeKind?: OwnerCase['kind'] | 'controllers'
} = {}): void {
  owner.seed(options.includeRecord)
  useRouterStore.setState({
    route: {
      kind: 'studio',
      entity: { kind: options.routeKind ?? owner.kind, id: RECORD.id },
    },
  })
  useEditorStore.setState({
    editorFlavor: owner.flavor,
    source: options.source ?? 'broken(',
    compileStatus: options.compileStatus ?? 'broken',
    isReadOnly: options.isReadOnly ?? false,
    bufferEdited: true,
    previewSource: 'last clean preview',
    previewPatternName: RECORD.name,
  })
}

function visibleSnapshot(owner: OwnerCase) {
  const editor = useEditorStore.getState()
  return {
    route: useRouterStore.getState().route,
    editorFlavor: editor.editorFlavor,
    source: editor.source,
    compileStatus: editor.compileStatus,
    isReadOnly: editor.isReadOnly,
    bufferEdited: editor.bufferEdited,
    previewSource: editor.previewSource,
    previewPatternName: editor.previewPatternName,
    activePatternId: usePatternStore.getState().activePatternId,
    durableSource: owner.durableSource(),
  }
}

beforeEach(() => {
  __resetNavigationPreflightForTests()
  __resetAutosaveSyncForTests()
  useRouterStore.setState(routerInitialState)
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useMixinStore.setState(mixinInitialState)
  useLibraryStore.setState(libraryInitialState)
})

describe('Pattern departure persistence (#818)', () => {
  it('persists exact broken source before replacing the buffer', async () => {
    const pattern = ownerCases[0]
    const brokenSource = 'export function render(index) {'
    seedOwner(pattern, { source: brokenSource })
    const updatePatternSrc = vi.fn(async (id: string, source: string) => {
      usePatternStore.setState((state) => ({
        userPatterns: state.userPatterns.map((record) => (
          record.id === id ? { ...record, src: source } : record
        )),
      }))
    })
    usePatternStore.setState({ updatePatternSrc })
    const transition = vi.fn()

    expect(requestBufferReplacement(transition)).toBe(false)

    expect(transition).not.toHaveBeenCalled()
    expect(useNavigationPreflightStore.getState().pending).toBeNull()
    await vi.waitFor(() => expect(transition).toHaveBeenCalledOnce())
    expect(updatePatternSrc).toHaveBeenCalledWith(RECORD.id, brokenSource)
    expect(pattern.durableSource()).toBe(brokenSource)
    expect(useEditorStore.getState()).toMatchObject({
      source: brokenSource,
      previewSource: '',
      previewUnavailableReason: 'broken-source',
      bufferEdited: false,
    })
  })

  it.each([
    ['valid', 'export function render(index) { hsv(index, 1, 1) }', 'good' as const],
    ['empty', '', 'good' as const],
  ])('persists exact %s source at departure', async (_label, source, compileStatus) => {
    const pattern = ownerCases[0]
    seedOwner(pattern, { source, compileStatus })
    const updatePatternSrc = vi.fn(async (id: string, nextSource: string) => {
      usePatternStore.setState((state) => ({
        userPatterns: state.userPatterns.map((record) => (
          record.id === id ? { ...record, src: nextSource } : record
        )),
      }))
    })
    usePatternStore.setState({ updatePatternSrc })
    const transition = vi.fn()

    requestBufferReplacement(transition)

    await vi.waitFor(() => expect(transition).toHaveBeenCalledOnce())
    expect(updatePatternSrc).toHaveBeenCalledWith(RECORD.id, source)
    expect(pattern.durableSource()).toBe(source)
  })

  it('preserves the complete Pattern state on failure and retries on the next navigation request', async () => {
    const pattern = ownerCases[0]
    seedOwner(pattern)
    const before = visibleSnapshot(pattern)
    const transition = vi.fn()
    usePatternStore.setState({
      updatePatternSrc: vi.fn(async () => {
        throw new Error('offline')
      }),
    })

    requestBufferReplacement(transition)

    await vi.waitFor(() => expect(useEditorStore.getState().autosaveFailedEntity).toEqual({
      flavor: 'pattern',
      id: RECORD.id,
    }))
    expect(transition).not.toHaveBeenCalled()
    expect(visibleSnapshot(pattern)).toEqual(before)
    expect(useNavigationPreflightStore.getState().pending).toBeNull()

    usePatternStore.setState({
      updatePatternSrc: vi.fn(async (id: string, source: string) => {
        usePatternStore.setState((state) => ({
          userPatterns: state.userPatterns.map((record) => (
            record.id === id ? { ...record, src: source } : record
          )),
        }))
      }),
    })
    requestBufferReplacement(transition)

    await vi.waitFor(() => expect(transition).toHaveBeenCalledOnce())
    expect(pattern.durableSource()).toBe(before.source)
    expect(useEditorStore.getState().autosaveFailedEntity).toBeNull()
  })

  it('keeps a newer edit open when it arrives during the departure write', async () => {
    const pattern = ownerCases[0]
    const captured = 'export function render(index) {'
    const newer = `${captured}\n// newer edit`
    seedOwner(pattern, { source: captured })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    usePatternStore.setState({
      updatePatternSrc: vi.fn(async (id: string, source: string) => {
        await gate
        usePatternStore.setState((state) => ({
          userPatterns: state.userPatterns.map((record) => (
            record.id === id ? { ...record, src: source } : record
          )),
        }))
      }),
    })
    const transition = vi.fn()

    requestBufferReplacement(transition)
    useEditorStore.getState().setEditedSource(newer)
    release()

    await vi.waitFor(() => expect(pattern.durableSource()).toBe(captured))
    expect(transition).not.toHaveBeenCalled()
    expect(useEditorStore.getState()).toMatchObject({
      source: newer,
      bufferEdited: true,
    })
  })

  it('keeps the route on Pattern A until its departure write durably succeeds', async () => {
    const pattern = ownerCases[0]
    seedOwner(pattern, { source: 'broken(' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    usePatternStore.setState({
      updatePatternSrc: vi.fn(async (id: string, source: string) => {
        await gate
        usePatternStore.setState((state) => ({
          userPatterns: state.userPatterns.map((record) => (
            record.id === id ? { ...record, src: source } : record
          )),
        }))
      }),
    })
    const removeGuard = installNavigationPreflight()

    useRouterStore.getState().navigate({ kind: 'gallery' })

    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: RECORD.id },
    })
    release()
    await vi.waitFor(() => expect(useRouterStore.getState().route).toEqual({ kind: 'gallery' }))
    expect(pattern.durableSource()).toBe('broken(')
    removeGuard()
  })
})

describe('broken-buffer navigation preflight (#831)', () => {
  it.each(confirmOwnerCases)('blocks dirty broken $flavor source with shared record vocabulary', (owner) => {
    seedOwner(owner)
    const transition = vi.fn()

    requestBufferReplacement(transition)

    expect(transition).not.toHaveBeenCalled()
    expect(useNavigationPreflightStore.getState().pending?.draft).toEqual({
      flavor: owner.flavor,
      id: RECORD.id,
      name: RECORD.name,
    })
  })

  it.each([
    ['already saved', { source: RECORD.persisted }],
    ['read-only', { isReadOnly: true }],
    ['missing durable entity', { includeRecord: false }],
    ['route no longer owns the editor', { routeKind: 'controllers' as const }],
  ])('continues immediately for a Pattern whose buffer is %s', (_label, options) => {
    seedOwner(ownerCases[0], options)
    const transition = vi.fn()

    requestBufferReplacement(transition)

    expect(transition).toHaveBeenCalledOnce()
    expect(useNavigationPreflightStore.getState().pending).toBeNull()
  })

  it.each(confirmOwnerCases)('Cancel preserves the complete $flavor route, editor, preview, and durable snapshot', (owner) => {
    seedOwner(owner)
    const before = visibleSnapshot(owner)
    const transition = vi.fn(() => {
      useRouterStore.setState({ route: { kind: 'gallery' } })
      useEditorStore.setState({
        editorFlavor: 'pattern',
        source: 'replacement',
        previewSource: 'replacement preview',
      })
    })
    requestBufferReplacement(transition)

    cancelNavigationPreflight()

    expect(transition).not.toHaveBeenCalled()
    expect(visibleSnapshot(owner)).toEqual(before)
    expect(useNavigationPreflightStore.getState().pending).toBeNull()
  })

  it('Continue discards invalid Map source without persisting and performs the transition once', () => {
    seedOwner(confirmOwnerCases[0])
    const transition = vi.fn(() => {
      expect(useEditorStore.getState()).toMatchObject({
        source: RECORD.persisted,
        compileStatus: 'good',
        bufferEdited: false,
      })
      useEditorStore.getState().setSource('next source')
    })
    requestBufferReplacement(transition)

    continueNavigationPreflight()
    continueNavigationPreflight()

    expect(transition).toHaveBeenCalledOnce()
    expect(useNavigationPreflightStore.getState().pending).toBeNull()
  })

  it.each(confirmOwnerCases)('Continue restores the latest durable $flavor source, not the dialog snapshot', (owner) => {
    const latestDurable = `${RECORD.persisted}\n// autosave completed while the dialog was open`
    seedOwner(owner)
    const transition = vi.fn()
    requestBufferReplacement(transition)

    owner.replaceDurableSource(latestDurable)
    continueNavigationPreflight()

    expect(transition).toHaveBeenCalledOnce()
    expect(useEditorStore.getState()).toMatchObject({
      source: latestDurable,
      compileStatus: 'good',
      bufferEdited: false,
    })
  })

  it('keeps the original transition when another request arrives while confirmation is open', () => {
    seedOwner(confirmOwnerCases[0])
    const original = vi.fn()
    const repeated = vi.fn()

    requestBufferReplacement(original)
    requestBufferReplacement(repeated)
    continueNavigationPreflight()

    expect(original).toHaveBeenCalledOnce()
    expect(repeated).not.toHaveBeenCalled()
  })

  it('restores durable source before async work so nested navigation needs no long-lived approval', async () => {
    seedOwner(confirmOwnerCases[0])
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const nested = vi.fn()
    const transition = vi.fn(async () => {
      await gate
      requestBufferReplacement(nested)
    })
    requestBufferReplacement(transition)
    continueNavigationPreflight()

    expect(useEditorStore.getState()).toMatchObject({
      source: RECORD.persisted,
      compileStatus: 'good',
      bufferEdited: false,
    })

    release()
    await gate
    await vi.waitFor(() => expect(nested).toHaveBeenCalledOnce())

    expect(transition).toHaveBeenCalledOnce()
    expect(useNavigationPreflightStore.getState().pending).toBeNull()
  })

  it('guards a new broken edit while an earlier confirmed async operation is still pending', async () => {
    seedOwner(confirmOwnerCases[0])
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    requestBufferReplacement(async () => gate)
    continueNavigationPreflight()
    useEditorStore.setState({
      source: 'another broken edit(',
      compileStatus: 'broken',
      bufferEdited: true,
    })
    const unrelated = vi.fn()

    requestBufferReplacement(unrelated)

    expect(unrelated).not.toHaveBeenCalled()
    expect(useNavigationPreflightStore.getState().pending?.draft.name).toBe(RECORD.name)
    cancelNavigationPreflight()
    release()
    await gate
  })

  it('consumes an async rejection without weakening the next broken-source guard', async () => {
    seedOwner(confirmOwnerCases[0])
    requestBufferReplacement(async () => {
      throw new Error('create failed')
    })
    continueNavigationPreflight()
    await Promise.resolve()

    useEditorStore.setState({
      source: 'broken again(',
      compileStatus: 'broken',
      bufferEdited: true,
    })
    requestBufferReplacement(vi.fn())

    expect(useNavigationPreflightStore.getState().pending?.draft.name).toBe(RECORD.name)
  })

  it('guards route-only navigation before history or route state changes', () => {
    const owner = confirmOwnerCases[0]
    seedOwner(owner)
    const removeGuard = installNavigationPreflight()

    useRouterStore.getState().navigate({ kind: 'gallery' })

    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: owner.kind, id: RECORD.id },
    })
    expect(useNavigationPreflightStore.getState().pending?.draft.name).toBe(RECORD.name)

    continueNavigationPreflight()
    expect(useRouterStore.getState().route).toEqual({ kind: 'gallery' })
    expect(useEditorStore.getState()).toMatchObject({
      source: RECORD.persisted,
      compileStatus: 'good',
      bufferEdited: false,
    })
    removeGuard()
  })

  it.each(confirmOwnerCases)('route-only Continue clears the $flavor buffer back to durable source', (owner) => {
    seedOwner(owner)
    requestBufferReplacement(() => {
      useRouterStore.setState({ route: { kind: 'gallery' } })
    })

    continueNavigationPreflight()

    expect(useEditorStore.getState()).toMatchObject({
      source: RECORD.persisted,
      compileStatus: 'good',
      bufferEdited: false,
    })
    expect(owner.durableSource()).toBe(RECORD.persisted)
  })

  it('bounces browser history until Back navigation is cancelled or confirmed', () => {
    const owner = confirmOwnerCases[0]
    window.history.replaceState({ origin: 'studio' }, '', `/studio/${owner.kind}/${RECORD.id}`)
    useRouterStore.getState().syncFromLocation()
    seedOwner(owner)
    const removeGuard = installNavigationPreflight()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    window.history.pushState({ origin: 'gallery' }, '', '/gallery')
    useRouterStore.getState().syncFromLocation()

    expect(window.location.pathname).toBe(`/studio/${owner.kind}/${RECORD.id}`)
    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: owner.kind, id: RECORD.id },
    })
    expect(useNavigationPreflightStore.getState().pending?.draft.name).toBe(RECORD.name)

    cancelNavigationPreflight()
    expect(back).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe(`/studio/${owner.kind}/${RECORD.id}`)

    window.history.pushState({ origin: 'gallery' }, '', '/gallery')
    useRouterStore.getState().syncFromLocation()
    continueNavigationPreflight()
    expect(back).toHaveBeenCalledOnce()

    // Simulate the popstate caused by replaying the approved history entry.
    window.history.replaceState({ origin: 'gallery' }, '', '/gallery')
    useRouterStore.getState().syncFromLocation()
    expect(useRouterStore.getState().route).toEqual({ kind: 'gallery' })
    expect(useEditorStore.getState().source).toBe(RECORD.persisted)

    back.mockRestore()
    removeGuard()
  })
})
