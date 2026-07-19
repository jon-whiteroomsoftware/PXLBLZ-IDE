import { describe, expect, it } from 'vitest'
import {
  collectTrashedEntityOrganizationIds,
  createEntityOrganizationFolder,
  emptyEntityOrganizationTrash,
  moveEntityOrganizationNode,
  moveEntityOrganizationNodeToContainer,
  normalizeEntityOrganization,
  renameEntityOrganizationFolder,
  restoreEntityOrganizationNode,
  searchEntityOrganization,
  setEntityOrganizationFolderCollapsed,
  trashEntityOrganizationNode,
  type EntityOrganizationV1,
} from './entityOrganization'

describe('entity organization', () => {
  it('migrates an existing flat catalogue without changing entity ids or order', () => {
    expect(normalizeEntityOrganization(undefined, ['pattern-c', 'pattern-a', 'pattern-b'])).toEqual({
      version: 1,
      nodes: [
        { kind: 'entity', entityId: 'pattern-c' },
        { kind: 'entity', entityId: 'pattern-a' },
        { kind: 'entity', entityId: 'pattern-b' },
      ],
      trash: [],
      collapsedFolderIds: [],
    })
  })

  it('preserves valid hierarchy and manual order while removing stale and duplicate references', () => {
    const stored = {
      version: 1,
      nodes: [
        {
          kind: 'folder',
          id: 'folder-live',
          name: 'Live',
          children: [
            { kind: 'entity', entityId: 'pattern-b' },
            { kind: 'entity', entityId: 'pattern-b' },
            { kind: 'entity', entityId: 'pattern-deleted' },
          ],
        },
        { kind: 'entity', entityId: 'pattern-a' },
      ],
      trash: [{ node: { kind: 'entity', entityId: 'pattern-c' }, parentFolderId: null, index: 2 }],
      collapsedFolderIds: ['folder-live', 'folder-missing'],
    }

    expect(normalizeEntityOrganization(stored, ['pattern-a', 'pattern-b', 'pattern-c', 'pattern-d'])).toEqual({
      version: 1,
      nodes: [
        {
          kind: 'folder',
          id: 'folder-live',
          name: 'Live',
          children: [{ kind: 'entity', entityId: 'pattern-b' }],
        },
        { kind: 'entity', entityId: 'pattern-a' },
        { kind: 'entity', entityId: 'pattern-d' },
      ],
      trash: [{
        node: { kind: 'entity', entityId: 'pattern-c' },
        parentFolderId: null,
        index: 2,
        collapsedFolderIds: [],
      }],
      collapsedFolderIds: ['folder-live'],
    })
  })

  it('moves an entity before, after, or inside another personal node while preserving exact order', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [
        { kind: 'folder', id: 'folder-a', name: 'A', children: [{ kind: 'entity', entityId: 'pattern-a' }] },
        { kind: 'folder', id: 'folder-b', name: 'B', children: [{ kind: 'entity', entityId: 'pattern-b' }] },
        { kind: 'entity', entityId: 'pattern-c' },
      ],
      trash: [],
      collapsedFolderIds: [],
    }

    expect(moveEntityOrganizationNode(
      organization,
      'entity:pattern-c',
      'folder:folder-a',
      'inside',
    ).nodes).toEqual([
      {
        kind: 'folder',
        id: 'folder-a',
        name: 'A',
        children: [
          { kind: 'entity', entityId: 'pattern-a' },
          { kind: 'entity', entityId: 'pattern-c' },
        ],
      },
      { kind: 'folder', id: 'folder-b', name: 'B', children: [{ kind: 'entity', entityId: 'pattern-b' }] },
    ])
  })

  it('moves a node to the root or an empty folder through the fallback move command', () => {
    const organization = normalizeEntityOrganization({
      version: 1,
      nodes: [
        { kind: 'folder', id: 'source', name: 'Source', children: [{ kind: 'entity', entityId: 'a' }] },
        { kind: 'folder', id: 'empty', name: 'Empty', children: [] },
        { kind: 'entity', entityId: 'b' },
      ],
      trash: [],
      collapsedFolderIds: [],
    }, ['a', 'b'])

    const nested = moveEntityOrganizationNodeToContainer(organization, 'entity:b', 'empty')
    expect(nested.nodes[1]).toMatchObject({
      kind: 'folder',
      id: 'empty',
      children: [{ kind: 'entity', entityId: 'b' }],
    })

    const rooted = moveEntityOrganizationNodeToContainer(nested, 'entity:a', null, 0)
    expect(rooted.nodes[0]).toEqual({ kind: 'entity', entityId: 'a' })
  })

  it('creates and renames a folder at an explicit position', () => {
    const organization = normalizeEntityOrganization(undefined, ['pattern-a', 'pattern-b'])
    const created = createEntityOrganizationFolder(organization, {
      id: 'folder-new',
      name: 'Experiments',
      index: 1,
    })

    expect(renameEntityOrganizationFolder(created, 'folder-new', 'Installation tests').nodes).toEqual([
      { kind: 'entity', entityId: 'pattern-a' },
      { kind: 'folder', id: 'folder-new', name: 'Installation tests', children: [] },
      { kind: 'entity', entityId: 'pattern-b' },
    ])
  })

  it('moves a whole branch to recoverable Trash and restores it to its exact prior position', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [
        { kind: 'entity', entityId: 'pattern-a' },
        {
          kind: 'folder',
          id: 'folder-live',
          name: 'Live',
          children: [{ kind: 'entity', entityId: 'pattern-b' }],
        },
        { kind: 'entity', entityId: 'pattern-c' },
      ],
      trash: [],
      collapsedFolderIds: ['folder-live'],
    }

    const trashed = trashEntityOrganizationNode(organization, 'folder:folder-live')
    expect(trashed.nodes).toEqual([
      { kind: 'entity', entityId: 'pattern-a' },
      { kind: 'entity', entityId: 'pattern-c' },
    ])
    expect(trashed.trash).toEqual([{
      node: {
        kind: 'folder',
        id: 'folder-live',
        name: 'Live',
        children: [{ kind: 'entity', entityId: 'pattern-b' }],
      },
      parentFolderId: null,
      index: 1,
      collapsedFolderIds: ['folder-live'],
    }])
    expect(trashed.collapsedFolderIds).toEqual([])
    expect(restoreEntityOrganizationNode(trashed, 'folder:folder-live')).toEqual(organization)
  })

  it('collects every entity in trashed branches and empties only the Trash', () => {
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [{ kind: 'entity', entityId: 'still-live' }],
      trash: [
        {
          node: { kind: 'entity', entityId: 'loose' },
          parentFolderId: null,
          index: 0,
          collapsedFolderIds: [],
        },
        {
          node: {
            kind: 'folder',
            id: 'folder-trashed',
            name: 'Trashed folder',
            children: [
              { kind: 'entity', entityId: 'nested-a' },
              {
                kind: 'folder',
                id: 'folder-nested',
                name: 'Nested',
                children: [{ kind: 'entity', entityId: 'nested-b' }],
              },
            ],
          },
          parentFolderId: null,
          index: 1,
          collapsedFolderIds: ['folder-trashed'],
        },
      ],
      collapsedFolderIds: [],
    }

    expect(collectTrashedEntityOrganizationIds(organization)).toEqual(['loose', 'nested-a', 'nested-b'])
    expect(emptyEntityOrganizationTrash(organization)).toEqual({
      ...organization,
      trash: [],
    })
  })

  it('searches through collapsed branches and returns folder path context', () => {
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
      collapsedFolderIds: ['folder-installations', 'folder-large'],
    }

    expect(searchEntityOrganization(
      organization,
      { 'pattern-redline': 'Redline Machine' },
      'large redline',
    )).toEqual([{
      entityId: 'pattern-redline',
      name: 'Redline Machine',
      path: ['Installations', 'Large stages'],
    }])
  })

  it('rejects a move that would exceed the eight-folder depth limit', () => {
    const deep = (depth: number): EntityOrganizationV1['nodes'][number] => ({
      kind: 'folder',
      id: `folder-${depth}`,
      name: `Level ${depth}`,
      children: depth === 8 ? [] : [deep(depth + 1)],
    })
    const organization: EntityOrganizationV1 = {
      version: 1,
      nodes: [deep(1), { kind: 'folder', id: 'folder-move', name: 'Move me', children: [] }],
      trash: [],
      collapsedFolderIds: [],
    }

    expect(moveEntityOrganizationNode(
      organization,
      'folder:folder-move',
      'folder:folder-8',
      'inside',
    )).toBe(organization)
  })

  it('persists folder disclosure without duplicating folder ids', () => {
    const organization = createEntityOrganizationFolder(
      normalizeEntityOrganization(undefined, ['pattern-a']),
      { id: 'folder-a', name: 'A' },
    )
    const collapsed = setEntityOrganizationFolderCollapsed(organization, 'folder-a', true)

    expect(setEntityOrganizationFolderCollapsed(collapsed, 'folder-a', true).collapsedFolderIds).toEqual(['folder-a'])
    expect(setEntityOrganizationFolderCollapsed(collapsed, 'folder-a', false).collapsedFolderIds).toEqual([])
  })
})
