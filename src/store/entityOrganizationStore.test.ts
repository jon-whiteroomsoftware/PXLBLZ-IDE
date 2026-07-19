import { beforeEach, describe, expect, it, vi } from 'vitest'
import { demoPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { moveEntityOrganizationNode, normalizeEntityOrganization, type EntityOrganizationV1 } from '@/engine/entityOrganization'
import {
  entityOrganizationInitialState,
  useEntityOrganizationStore,
} from './entityOrganizationStore'

describe('entity organization store', () => {
  beforeEach(() => {
    resetPersonalContentProvider()
    useEntityOrganizationStore.setState(entityOrganizationInitialState)
  })

  it('loads, migrates, and persists missing entity references without changing their ids', async () => {
    const stored: EntityOrganizationV1 = {
      version: 1,
      nodes: [{ kind: 'entity', entityId: 'pattern-a' }],
      trash: [],
      collapsedFolderIds: [],
    }
    const setEntityOrganization = vi.fn(async () => {})
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'organization-test',
      getEntityOrganization: async () => stored,
      setEntityOrganization,
    })

    await useEntityOrganizationStore.getState().loadOrganization('patterns', ['pattern-a', 'pattern-b'])

    expect(useEntityOrganizationStore.getState().organizations.patterns.nodes).toEqual([
      { kind: 'entity', entityId: 'pattern-a' },
      { kind: 'entity', entityId: 'pattern-b' },
    ])
    expect(setEntityOrganization).toHaveBeenCalledWith(
      'patterns',
      useEntityOrganizationStore.getState().organizations.patterns,
    )
  })

  it('updates immediately and persists each manual organization change', async () => {
    const stored: EntityOrganizationV1 = {
      version: 1,
      nodes: [
        { kind: 'folder', id: 'folder-a', name: 'A', children: [] },
        { kind: 'entity', entityId: 'pattern-a' },
      ],
      trash: [],
      collapsedFolderIds: [],
    }
    const setEntityOrganization = vi.fn(async () => {})
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      id: 'organization-test',
      getEntityOrganization: async () => stored,
      setEntityOrganization,
    })
    await useEntityOrganizationStore.getState().loadOrganization('patterns', ['pattern-a'])

    await useEntityOrganizationStore.getState().mutateOrganization(
      'patterns',
      ['pattern-a'],
      (organization) => moveEntityOrganizationNode(
        organization,
        'entity:pattern-a',
        'folder:folder-a',
        'inside',
      ),
    )

    expect(useEntityOrganizationStore.getState().organizations.patterns.nodes).toEqual([{
      kind: 'folder',
      id: 'folder-a',
      name: 'A',
      children: [{ kind: 'entity', entityId: 'pattern-a' }],
    }])
    expect(setEntityOrganization).toHaveBeenCalledTimes(1)
  })

  it('reconciles a newly-created entity into an already-loaded organization', async () => {
    useEntityOrganizationStore.setState({
      organizations: {
        patterns: normalizeEntityOrganization(undefined, ['a']),
        shows: normalizeEntityOrganization(undefined, []),
        maps: normalizeEntityOrganization(undefined, []),
        controllers: normalizeEntityOrganization(undefined, []),
        mixins: normalizeEntityOrganization(undefined, []),
        libraries: normalizeEntityOrganization(undefined, []),
      },
      loaded: {
        patterns: true,
        shows: false,
        maps: false,
        controllers: false,
        mixins: false,
        libraries: false,
      },
    })

    await useEntityOrganizationStore.getState().mutateOrganization(
      'patterns',
      ['a', 'b'],
      (organization) => organization,
    )

    expect(useEntityOrganizationStore.getState().organizations.patterns.nodes).toEqual([
      { kind: 'entity', entityId: 'a' },
      { kind: 'entity', entityId: 'b' },
    ])
  })
})
