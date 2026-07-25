import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapModeHeader } from './MapModeHeader'
import { MixinModeHeader } from './MixinModeHeader'
import { LibraryModeHeader } from './LibraryModeHeader'
import { mapInitialState, useMapStore, type MapRecord } from '@/store/mapStore'
import { mixinInitialState, useMixinStore, type MixinRecord } from '@/store/mixinStore'
import { libraryInitialState, useLibraryStore, type LibraryRecord } from '@/store/libraryStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { editorInitialState, useEditorStore } from '@/store/editorStore'

const map: MapRecord = {
  id: 'map-1', name: 'Aurora Map', dim: 2, generator: 'custom', params: {}, points: [[0, 0]], updatedAt: 1,
}
const mixin: MixinRecord = {
  id: 'mixin-1', name: 'Aurora Mixin', kind: 'bind', src: '// @param PIN input', updatedAt: 1,
}
const library: LibraryRecord = {
  id: 'library-1', name: 'AuroraLib', src: 'function aurora() {}', updatedAt: 1,
}

beforeEach(() => {
  useMapStore.setState(mapInitialState)
  useMixinStore.setState(mixinInitialState)
  useLibraryStore.setState(libraryInitialState)
  usePatternStore.setState(patternInitialState)
  useEditorStore.setState(editorInitialState)
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

    useMapStore.setState({ editingMap: { kind: 'stock', id: 'plane' } })
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

    useMixinStore.setState({ editingMixin: { kind: 'stock', id: 'input-bind' } })
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

    useLibraryStore.setState({ editingLibrary: { kind: 'stock', id: 'Color' } })
    usePatternStore.setState({ activeLibraryName: 'Color' })
    useEditorStore.setState({ isReadOnly: true })
    rerender(<LibraryModeHeader />)
    expect(screen.queryByRole('button', { name: /Rename library/ })).not.toBeInTheDocument()
  })
})
