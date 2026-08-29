import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapModeHeader } from './MapModeHeader'
import { MixinModeHeader } from './MixinModeHeader'
import { LibraryModeHeader } from './LibraryModeHeader'
import { mapInitialState, useMapStore, type MapRecord } from '@/store/mapStore'
import { mixinInitialState, useMixinStore, type MixinRecord } from '@/store/mixinStore'
import { libraryInitialState, useLibraryStore, type LibraryRecord } from '@/store/libraryStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { editorInitialState, useEditorStore } from '@/store/editorStore'
import { routerInitialState, useRouterStore } from '@/store/routerStore'
import { workspaceInitialState, useWorkspaceStore } from '@/store/workspaceStore'
import { studioOperationInitialState, useStudioOperationStore } from '@/store/studioOperationStore'

const map: MapRecord = {
  id: 'map-1', name: 'Aurora Map', dim: 2, generator: 'custom', params: {}, points: [[0, 0]], updatedAt: 1,
}
const mixin: MixinRecord = {
  id: 'mixin-1', name: 'Aurora Mixin', kind: 'bind', src: '// @param PIN input', updatedAt: 1,
}
const library: LibraryRecord = {
  id: 'library-1', name: 'AuroraLib', src: 'function aurora() {}', updatedAt: 1,
}

type CloneOperation = (id: string, recordId?: string) => Promise<string | null>
type RemoveOperation = (id: string) => Promise<void>

beforeEach(() => {
  useMapStore.setState(mapInitialState)
  useMixinStore.setState(mixinInitialState)
  useLibraryStore.setState(libraryInitialState)
  usePatternStore.setState(patternInitialState)
  useEditorStore.setState(editorInitialState)
  useRouterStore.setState(routerInitialState)
  useWorkspaceStore.setState(workspaceInitialState)
  useStudioOperationStore.setState(studioOperationInitialState)
})

describe('entity mode headers', () => {
  it('renames a user Map from its title and keeps a stock Map read-only', async () => {
    const user = userEvent.setup()
    const renameMap = vi.fn()
    useMapStore.setState({ userMaps: [map], editingMap: { kind: 'existing', id: map.id }, renameMap })
    const { rerender } = render(<MapModeHeader />)
    await user.click(screen.getByRole('button', { name: 'Rename map Aurora Map' }))
    await user.clear(screen.getByRole('textbox', { name: 'Map name' }))
    await user.type(screen.getByRole('textbox', { name: 'Map name' }), 'Night Map{Enter}')
    expect(renameMap).toHaveBeenCalledWith(map.id, 'Night Map')

    act(() => useMapStore.setState({ editingMap: { kind: 'stock', id: 'plane' } }))
    rerender(<MapModeHeader />)
    expect(screen.queryByRole('button', { name: /Rename map/ })).not.toBeInTheDocument()
  })

  it('renames a user Mixin from its title and keeps a stock Mixin read-only', async () => {
    const user = userEvent.setup()
    const renameMixin = vi.fn()
    useMixinStore.setState({ userMixins: [mixin], editingMixin: { kind: 'existing', id: mixin.id }, renameMixin })
    const { rerender } = render(<MixinModeHeader />)
    await user.click(screen.getByRole('button', { name: 'Rename mixin Aurora Mixin' }))
    await user.clear(screen.getByRole('textbox', { name: 'Mixin name' }))
    await user.type(screen.getByRole('textbox', { name: 'Mixin name' }), 'Night Mixin')
    await user.click(screen.getByRole('button', { name: 'Apply mixin name' }))
    expect(renameMixin).toHaveBeenCalledWith(mixin.id, 'Night Mixin')

    act(() => useMixinStore.setState({ editingMixin: { kind: 'stock', id: 'input-bind' } }))
    rerender(<MixinModeHeader />)
    expect(screen.queryByRole('button', { name: /Rename mixin/ })).not.toBeInTheDocument()
  })

  it('renames a user Library as an identifier and keeps a stock Library read-only', async () => {
    const user = userEvent.setup()
    const renameLibrary = vi.fn()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    useLibraryStore.setState({
      userLibraries: [library], editingLibrary: { kind: 'existing', id: library.id }, renameLibrary,
      validateLibraryNamespace: () => null,
    })
    usePatternStore.setState({ activeLibraryName: library.name })
    const { rerender } = render(<LibraryModeHeader />)
    await user.click(screen.getByRole('button', { name: 'Rename library AuroraLib' }))
    const input = screen.getByRole('textbox', { name: 'Library name' })
    await user.clear(input)
    await user.type(input, '123 Night Lib')
    expect(input).toHaveValue('NightLib')
    await user.keyboard('{Enter}')
    expect(renameLibrary).toHaveBeenCalledWith(library.id, 'NightLib')

    await user.click(screen.getByRole('button', { name: 'Rename library AuroraLib' }))
    await user.clear(screen.getByRole('textbox', { name: 'Library name' }))
    await user.type(screen.getByRole('textbox', { name: 'Library name' }), 'DawnLib')
    await user.click(screen.getByRole('button', { name: 'Apply library name' }))
    expect(renameLibrary).toHaveBeenLastCalledWith(library.id, 'DawnLib')
    expect(confirm).not.toHaveBeenCalled()

    act(() => useLibraryStore.setState({ editingLibrary: { kind: 'stock', id: 'Color' } }))
    act(() => usePatternStore.setState({ activeLibraryName: 'Color' }))
    act(() => useEditorStore.setState({ isReadOnly: true }))
    rerender(<LibraryModeHeader />)
    expect(screen.queryByRole('button', { name: /Rename library/ })).not.toBeInTheDocument()
  })

  it.each([
    {
      entityKind: 'map',
      setup: (clone: Mock<CloneOperation>) => useMapStore.setState({ editingMap: { kind: 'stock', id: 'plane' }, cloneStockMap: clone }),
      renderHeader: () => <MapModeHeader />,
    },
    {
      entityKind: 'mixin',
      setup: (clone: Mock<CloneOperation>) => useMixinStore.setState({ editingMixin: { kind: 'stock', id: 'input-bind' }, cloneStockMixin: clone }),
      renderHeader: () => <MixinModeHeader />,
    },
    {
      entityKind: 'library',
      setup: (clone: Mock<CloneOperation>) => {
        useLibraryStore.setState({ editingLibrary: { kind: 'stock', id: 'Color' }, cloneStockLibrary: clone })
        usePatternStore.setState({ activeLibraryName: 'Color' })
        useEditorStore.setState({ isReadOnly: true })
      },
      renderHeader: () => <LibraryModeHeader />,
    },
  ])('reports a failed stock $entityKind Clone and retries the fixed intent', async ({ entityKind, setup, renderHeader }) => {
    const clone = vi.fn<CloneOperation>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('clone-id')
    useWorkspaceStore.setState({ personalWorkspaceAuthenticated: true, personalWorkspaceResolved: true })
    setup(clone)
    const user = userEvent.setup()
    render(renderHeader())

    await user.click(screen.getByRole('button', { name: 'Clone' }))

    expect(useStudioOperationStore.getState().failures.editor).toEqual(expect.objectContaining({
      action: 'clone',
      entityKind,
      entityName: expect.any(String),
      message: expect.stringMatching(new RegExp(`^Could not clone ${entityKind} ".+"\\.$`)),
    }))
    expect(clone).toHaveBeenCalledTimes(1)
    const retryId = clone.mock.calls[0]?.[1]
    expect(retryId).toEqual(expect.any(String))

    await act(() => useStudioOperationStore.getState().retry('editor'))

    expect(clone).toHaveBeenCalledTimes(2)
    expect(clone.mock.calls[1]?.[1]).toBe(retryId)
    expect(useStudioOperationStore.getState().failures.editor).toBeNull()
  })

  it.each([
    {
      entityKind: 'map', name: map.name,
      setup: (remove: Mock<RemoveOperation>) => useMapStore.setState({ userMaps: [map], editingMap: { kind: 'existing', id: map.id }, removeMap: remove }),
      renderHeader: () => <MapModeHeader />,
    },
    {
      entityKind: 'mixin', name: mixin.name,
      setup: (remove: Mock<RemoveOperation>) => useMixinStore.setState({ userMixins: [mixin], editingMixin: { kind: 'existing', id: mixin.id }, removeMixin: remove }),
      renderHeader: () => <MixinModeHeader />,
    },
    {
      entityKind: 'library', name: library.name,
      setup: (remove: Mock<RemoveOperation>) => {
        useLibraryStore.setState({ userLibraries: [library], editingLibrary: { kind: 'existing', id: library.id }, removeLibrary: remove })
        usePatternStore.setState({ activeLibraryName: library.name })
      },
      renderHeader: () => <LibraryModeHeader />,
    },
  ])('reports a failed permanent $entityKind Delete and retries the same record', async ({ entityKind, name, setup, renderHeader }) => {
    const remove = vi.fn<RemoveOperation>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    setup(remove)
    const user = userEvent.setup()
    render(renderHeader())

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('alertdialog', { name: `Delete ${entityKind}?` })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(useStudioOperationStore.getState().failures.editor?.message).toBe(`Could not delete ${entityKind} "${name}".`)
    expect(remove).toHaveBeenCalledWith(entityKind === 'map' ? map.id : entityKind === 'mixin' ? mixin.id : library.id)

    await act(() => useStudioOperationStore.getState().retry('editor'))

    expect(remove).toHaveBeenCalledTimes(2)
    expect(useStudioOperationStore.getState().failures.editor).toBeNull()
  })
})
