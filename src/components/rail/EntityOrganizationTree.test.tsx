// @vitest-environment jsdom
import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EntityOrganizationV1 } from '@/engine/entityOrganization'
import { EntityOrganizationTree, type EntityOrganizationTreeHandle } from './EntityOrganizationTree'

describe('EntityOrganizationTree', () => {
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
