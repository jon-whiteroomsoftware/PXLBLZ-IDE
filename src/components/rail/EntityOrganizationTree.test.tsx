// @vitest-environment jsdom
import { createRef } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EntityOrganizationV1 } from '@/engine/entityOrganization'
import { EntityOrganizationTree, type EntityOrganizationTreeHandle } from './EntityOrganizationTree'

describe('EntityOrganizationTree', () => {
  it('keeps the Pattern action menu in the row stacking context while names overflow (#662)', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{ kind: 'entity', entityId: 'pattern-long' }],
      trash: [],
      collapsedFolderIds: [],
    }
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'pattern-long', name: 'A deliberately long Pattern name' }]}
        activeEntityId="pattern-long"
        query=""
        noun="pattern"
        allowHorizontalOverflow
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={vi.fn()}
      />,
    )

    const row = screen.getByRole('treeitem', { name: /A deliberately long Pattern name/ })
    fireEvent.click(screen.getByRole('button', { name: 'More actions for A deliberately long Pattern name' }))

    expect(screen.getByRole('button', { name: 'Move to Trash' }).parentElement?.parentElement).toBe(row)
  })

  it('masks overflowing folder names behind their fixed row facts (#662)', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{
        kind: 'folder',
        id: 'folder-long',
        name: 'A deliberately long Pattern folder name',
        children: [{ kind: 'entity', entityId: 'pattern-short' }],
      }],
      trash: [],
      collapsedFolderIds: [],
    }
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'pattern-short', name: 'Short' }]}
        activeEntityId={null}
        query=""
        noun="pattern"
        editable={false}
        allowHorizontalOverflow
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={vi.fn()}
      />,
    )

    const folder = screen.getByRole('treeitem', { name: 'A deliberately long Pattern folder name1' })
    expect(folder).toHaveClass('bg-[#0b0c0f]')
    expect(within(folder).getByText('1')).toHaveClass('relative', 'z-10', 'bg-inherit')
  })

  it('steps nested rows by a shallow per-level indent so deep names keep their width (#787)', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{
        kind: 'folder',
        id: 'outer',
        name: 'Outer',
        children: [{
          kind: 'folder',
          id: 'inner',
          name: 'Inner',
          children: [{ kind: 'entity', entityId: 'pattern-deep' }],
        }],
      }],
      trash: [],
      collapsedFolderIds: [],
    }
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'pattern-deep', name: 'Deep Pattern' }]}
        activeEntityId={null}
        query=""
        noun="pattern"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('treeitem', { name: /Outer/ })).toHaveStyle({ paddingLeft: '6px' })
    expect(screen.getByRole('treeitem', { name: /Inner/ })).toHaveStyle({ paddingLeft: '14px' })
    expect(screen.getByRole('treeitem', { name: /Deep Pattern/ })).toHaveStyle({ paddingLeft: '22px' })
  })

  it('discloses a recursive folder and persists its collapsed state', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{
        kind: 'folder',
        id: 'folder-installations',
        name: 'Installations',
        children: [{ kind: 'entity', entityId: 'pattern-redline' }],
      }],
      trash: [],
      collapsedFolderIds: [],
    }
    const onOrganizationChange = vi.fn()
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'pattern-redline', name: 'Redline Machine' }]}
        activeEntityId={null}
        query=""
        noun="pattern"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={onOrganizationChange}
      />,
    )

    fireEvent.click(screen.getByRole('treeitem', { name: /Installations/ }))

    expect(onOrganizationChange).toHaveBeenCalledWith(expect.objectContaining({
      collapsedFolderIds: ['folder-installations'],
    }))
  })

  it('shows path-aware search results from inside collapsed folders', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{
        kind: 'folder',
        id: 'folder-installations',
        name: 'Installations',
        children: [{
          kind: 'folder',
          id: 'folder-large',
          name: 'Large stages',
          children: [{ kind: 'entity', entityId: 'pattern-redline' }],
        }],
      }],
      trash: [],
      collapsedFolderIds: ['folder-installations'],
    }
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'pattern-redline', name: 'Redline Machine' }]}
        activeEntityId={null}
        query="large redline"
        noun="pattern"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('treeitem', { name: /Redline Machine/ })).toBeVisible()
    expect(screen.getByText('Installations / Large stages')).toBeVisible()
  })

  it('selects a search result on pointerdown, before the search input blur can unmount it', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{ kind: 'entity', entityId: 'pattern-redline' }],
      trash: [],
      collapsedFolderIds: [],
    }
    const onSelect = vi.fn()
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'pattern-redline', name: 'Redline Machine' }]}
        activeEntityId={null}
        query="redline"
        noun="pattern"
        onSelect={onSelect}
        onRenameEntity={vi.fn()}
        onOrganizationChange={vi.fn()}
      />,
    )

    const result = screen.getByRole('treeitem', { name: /Redline Machine/ })
    fireEvent.pointerDown(result, { button: 0 })
    expect(onSelect).toHaveBeenCalledWith('pattern-redline')

    onSelect.mockClear()
    fireEvent.keyDown(result, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('pattern-redline')
  })

  it('creates an inline-renamable folder without changing the entity list', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{ kind: 'entity', entityId: 'pattern-redline' }],
      trash: [],
      collapsedFolderIds: [],
    }
    const onOrganizationChange = vi.fn()
    const treeRef = createRef<EntityOrganizationTreeHandle>()
    const view = render(
      <EntityOrganizationTree
        ref={treeRef}
        organization={organization}
        items={[{ id: 'pattern-redline', name: 'Redline Machine' }]}
        activeEntityId={null}
        query=""
        noun="pattern"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={onOrganizationChange}
      />,
    )

    expect(screen.queryByText('Personal')).not.toBeInTheDocument()
    act(() => treeRef.current?.createFolder())

    const next = onOrganizationChange.mock.calls[0][0] as EntityOrganizationV1
    expect(next).toEqual(expect.objectContaining({
      nodes: expect.arrayContaining([expect.objectContaining({ kind: 'folder', name: 'New Folder' })]),
    }))
    view.rerender(
      <EntityOrganizationTree
        ref={treeRef}
        organization={next}
        items={[{ id: 'pattern-redline', name: 'Redline Machine' }]}
        activeEntityId={null}
        query=""
        noun="pattern"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={onOrganizationChange}
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Rename item' })).toBeVisible()
  })

  it('moves an item to recoverable Trash through its row menu', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{ kind: 'entity', entityId: 'pattern-redline' }],
      trash: [],
      collapsedFolderIds: [],
    }
    const onOrganizationChange = vi.fn()
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'pattern-redline', name: 'Redline Machine' }]}
        activeEntityId={null}
        query=""
        noun="pattern"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={onOrganizationChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Redline Machine' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))

    expect(onOrganizationChange).toHaveBeenCalledWith(expect.objectContaining({
      nodes: [],
      trash: [expect.objectContaining({ node: { kind: 'entity', entityId: 'pattern-redline' } })],
    }))
  })

  it('closes the row menu and commits a spaced folder name on the first rename', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{ kind: 'folder', id: 'folder-new', name: 'New Folder', children: [] }],
      trash: [],
      collapsedFolderIds: [],
    }
    const onOrganizationChange = vi.fn()
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[]}
        activeEntityId={null}
        query=""
        noun="library"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={onOrganizationChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'More actions for New Folder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(screen.queryByRole('button', { name: 'Move to Trash' })).not.toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: 'Rename item' })
    fireEvent.change(input, { target: { value: 'Pixelblaze Test Folder' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onOrganizationChange).toHaveBeenCalledTimes(1)
    expect(onOrganizationChange).toHaveBeenCalledWith(expect.objectContaining({
      nodes: [expect.objectContaining({ kind: 'folder', name: 'Pixelblaze Test Folder' })],
    }))
  })

  it('sanitizes Library entity identifiers without applying that rule to folders', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{ kind: 'entity', entityId: 'library-a' }],
      trash: [],
      collapsedFolderIds: [],
    }
    const onRenameEntity = vi.fn()
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'library-a', name: 'LibraryA' }]}
        activeEntityId={null}
        query=""
        noun="library"
        onSelect={vi.fn()}
        onRenameEntity={onRenameEntity}
        onOrganizationChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'More actions for LibraryA' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Rename item' })
    fireEvent.change(input, { target: { value: 'Library Name-1' } })
    expect(input).toHaveValue('LibraryName1')
    fireEvent.blur(input)
    expect(onRenameEntity).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'More actions for LibraryA' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const reopenedInput = screen.getByRole('textbox', { name: 'Rename item' })
    fireEvent.change(reopenedInput, { target: { value: 'Library Name-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Rename item' }))
    expect(onRenameEntity).toHaveBeenCalledWith('library-a', 'LibraryName1')
  })

  it('hides empty Trash, then permanently empties populated Trash through its hover action', async () => {
    const empty: EntityOrganizationV1 = {
      version: 1,
      nodes: [{ kind: 'entity', entityId: 'live' }],
      trash: [],
      collapsedFolderIds: [],
    }
    const onEmptyTrash = vi.fn(async () => {})
    const onOrganizationChange = vi.fn()
    const view = render(
      <EntityOrganizationTree
        organization={empty}
        items={[{ id: 'live', name: 'Live' }, { id: 'gone', name: 'Gone' }]}
        activeEntityId={null}
        query=""
        noun="map"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onEmptyTrash={onEmptyTrash}
        onOrganizationChange={onOrganizationChange}
      />,
    )

    expect(screen.queryByRole('button', { name: /Open Trash/ })).not.toBeInTheDocument()

    const populated: EntityOrganizationV1 = {
      ...empty,
      trash: [{
        node: {
          kind: 'folder',
          id: 'old-folder',
          name: 'Old folder',
          children: [{ kind: 'entity', entityId: 'gone' }],
        },
        parentFolderId: null,
        index: 0,
        collapsedFolderIds: [],
      }],
    }
    view.rerender(
      <EntityOrganizationTree
        organization={populated}
        items={[{ id: 'live', name: 'Live' }, { id: 'gone', name: 'Gone' }]}
        activeEntityId={null}
        query=""
        noun="map"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onEmptyTrash={onEmptyTrash}
        onOrganizationChange={onOrganizationChange}
      />,
    )

    expect(screen.getByRole('button', { name: 'Open Trash (1 item)' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }))

    await vi.waitFor(() => expect(onEmptyTrash).toHaveBeenCalledWith(['gone']))
    expect(onOrganizationChange).not.toHaveBeenCalled()
  })

  it('clears a drag cue when the pointer leaves the tree', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [
        { kind: 'entity', entityId: 'a' },
        { kind: 'entity', entityId: 'b' },
      ],
      trash: [],
      collapsedFolderIds: [],
    }
    const { container } = render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]}
        activeEntityId={null}
        query=""
        noun="pattern"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={vi.fn()}
      />,
    )
    const transfer = { effectAllowed: '', setData: vi.fn() }
    fireEvent.dragStart(screen.getByRole('treeitem', { name: /A/ }), { dataTransfer: transfer })
    fireEvent.dragOver(screen.getByRole('treeitem', { name: /B/ }), { clientY: 1 })
    expect(container.querySelector('[data-drop-cue]')).not.toBeNull()

    fireEvent.dragLeave(screen.getByRole('tree', { name: 'Patterns' }), { relatedTarget: document.body })
    expect(container.querySelector('[data-drop-cue]')).toBeNull()
  })

  it('ignores a Show timeline Clip drag instead of presenting organization drop cues', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [
        { kind: 'entity', entityId: 'a' },
        { kind: 'entity', entityId: 'b' },
      ],
      trash: [],
      collapsedFolderIds: [],
    }
    const onOrganizationChange = vi.fn()
    const { container } = render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]}
        activeEntityId={null}
        query=""
        noun="pattern"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={onOrganizationChange}
      />,
    )
    const timelineTransfer = {
      types: ['application/x-pxlblz-show-placement'],
      getData: vi.fn(() => 'placement-1'),
    }
    const target = screen.getByRole('treeitem', { name: /B/ })

    fireEvent.dragOver(target, { clientY: 1, dataTransfer: timelineTransfer })
    expect(container.querySelector('[data-drop-cue]')).toBeNull()

    fireEvent.drop(target, { clientY: 1, dataTransfer: timelineTransfer })
    expect(onOrganizationChange).not.toHaveBeenCalled()
  })

  it('leaves a muted placeholder at the drag origin until the drag ends', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [
        { kind: 'entity', entityId: 'a' },
        { kind: 'entity', entityId: 'b' },
      ],
      trash: [],
      collapsedFolderIds: [],
    }
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]}
        activeEntityId="a"
        query=""
        noun="pattern"
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={vi.fn()}
      />,
    )
    const origin = screen.getByRole('treeitem', { name: /A/ })
    const transfer = { effectAllowed: '', setData: vi.fn() }

    fireEvent.dragStart(origin, { dataTransfer: transfer })

    expect(origin).toHaveAttribute('data-drag-origin', 'true')
    expect(origin).toHaveClass('bg-zinc-900/40', 'text-zinc-600', 'opacity-40')
    expect(origin).not.toHaveClass('bg-live/5', 'text-live')

    fireEvent.dragEnd(origin)
    expect(origin).not.toHaveAttribute('data-drag-origin')
  })

  it('hides empty immutable branches after the dimension lens filters their entities', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [
        { kind: 'folder', id: 'visible', name: 'Visible group', children: [{ kind: 'entity', entityId: 'a' }, { kind: 'entity', entityId: 'b' }] },
        { kind: 'folder', id: 'hidden', name: 'Hidden group', children: [{ kind: 'entity', entityId: 'c' }] },
      ],
      trash: [],
      collapsedFolderIds: [],
    }
    render(
      <EntityOrganizationTree
        organization={organization}
        items={[{ id: 'a', name: 'A' }]}
        activeEntityId={null}
        query=""
        noun="pattern"
        editable={false}
        onSelect={vi.fn()}
        onRenameEntity={vi.fn()}
        onOrganizationChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('treeitem', { name: 'Visible group1' })).toBeVisible()
    expect(screen.queryByRole('treeitem', { name: /Hidden group/ })).not.toBeInTheDocument()
  })
})
