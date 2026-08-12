// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editorInitialState, useEditorStore, type EditorFlavor } from './editorStore'
import { libraryInitialState, useLibraryStore } from './libraryStore'
import { mapInitialState, useMapStore } from './mapStore'
import { mixinInitialState, useMixinStore } from './mixinStore'
import { patternInitialState, usePatternStore } from './patternStore'
import { routerInitialState, useRouterStore } from './routerStore'
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
  },
]

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
    durableSource: owner.durableSource(),
  }
}

beforeEach(() => {
  __resetNavigationPreflightForTests()
  useRouterStore.setState(routerInitialState)
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useMixinStore.setState(mixinInitialState)
  useLibraryStore.setState(libraryInitialState)
})

describe('broken-buffer navigation preflight (#831)', () => {
  it.each(ownerCases)('blocks dirty broken $flavor source with shared record vocabulary', (owner) => {
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
    ['valid dirty', { compileStatus: 'good' as const }],
    ['already saved', { source: RECORD.persisted }],
    ['read-only', { isReadOnly: true }],
    ['missing durable entity', { includeRecord: false }],
    ['route no longer owns the editor', { routeKind: 'controllers' as const }],
  ])('continues without a prompt for %s source', (_label, options) => {
    seedOwner(ownerCases[0], options)
    const transition = vi.fn()

    requestBufferReplacement(transition)

    expect(transition).toHaveBeenCalledOnce()
    expect(useNavigationPreflightStore.getState().pending).toBeNull()
  })

  it.each(ownerCases)('Cancel preserves the complete $flavor route, editor, preview, and durable snapshot', (owner) => {
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

  it('Continue discards without persisting invalid source and performs the transition once', () => {
    seedOwner(ownerCases[0])
    const updatePatternSrc = vi.fn(async () => {})
    usePatternStore.setState({ updatePatternSrc })
    const transition = vi.fn(() => {
      expect(useEditorStore.getState()).toMatchObject({
        source: RECORD.persisted,
        previewSource: RECORD.persisted,
        compileStatus: 'good',
        bufferEdited: false,
      })
      usePatternStore.getState().setActivePattern('next-pattern')
      useEditorStore.getState().setSource('next source')
    })
    requestBufferReplacement(transition)

    continueNavigationPreflight()
    continueNavigationPreflight()

    expect(transition).toHaveBeenCalledOnce()
    expect(updatePatternSrc).not.toHaveBeenCalled()
    expect(useNavigationPreflightStore.getState().pending).toBeNull()
  })

  it('keeps the original transition when another request arrives while confirmation is open', () => {
    seedOwner(ownerCases[0])
    const original = vi.fn()
    const repeated = vi.fn()

    requestBufferReplacement(original)
    requestBufferReplacement(repeated)
    continueNavigationPreflight()

    expect(original).toHaveBeenCalledOnce()
    expect(repeated).not.toHaveBeenCalled()
  })

  it('restores durable source before async work so nested navigation needs no long-lived approval', async () => {
    seedOwner(ownerCases[0])
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
    seedOwner(ownerCases[0])
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
    seedOwner(ownerCases[0])
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
    seedOwner(ownerCases[0])
    const removeGuard = installNavigationPreflight()

    useRouterStore.getState().navigate({ kind: 'gallery' })

    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: RECORD.id },
    })
    expect(useNavigationPreflightStore.getState().pending?.draft.name).toBe(RECORD.name)

    continueNavigationPreflight()
    expect(useRouterStore.getState().route).toEqual({ kind: 'gallery' })
    expect(useEditorStore.getState()).toMatchObject({
      source: RECORD.persisted,
      previewSource: RECORD.persisted,
      compileStatus: 'good',
      bufferEdited: false,
    })
    removeGuard()
  })

  it.each(ownerCases)('route-only Continue clears the $flavor buffer back to durable source', (owner) => {
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
    window.history.replaceState({ origin: 'studio' }, '', `/studio/patterns/${RECORD.id}`)
    useRouterStore.getState().syncFromLocation()
    seedOwner(ownerCases[0])
    const removeGuard = installNavigationPreflight()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    window.history.pushState({ origin: 'gallery' }, '', '/gallery')
    useRouterStore.getState().syncFromLocation()

    expect(window.location.pathname).toBe(`/studio/patterns/${RECORD.id}`)
    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: RECORD.id },
    })
    expect(useNavigationPreflightStore.getState().pending?.draft.name).toBe(RECORD.name)

    cancelNavigationPreflight()
    expect(back).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe(`/studio/patterns/${RECORD.id}`)

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
