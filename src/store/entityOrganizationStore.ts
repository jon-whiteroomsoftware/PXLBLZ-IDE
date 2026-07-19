import { create } from 'zustand'
import {
  normalizeEntityOrganization,
  type EntityOrganizationKind,
  type EntityOrganizationV1,
} from '@/engine/entityOrganization'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'

const persistenceQueues = new Map<EntityOrganizationKind, Promise<void>>()

interface EntityOrganizationState {
  organizations: Record<EntityOrganizationKind, EntityOrganizationV1>
  loaded: Record<EntityOrganizationKind, boolean>
  loadOrganization: (kind: EntityOrganizationKind, entityIds: readonly string[]) => Promise<void>
  mutateOrganization: (
    kind: EntityOrganizationKind,
    entityIds: readonly string[],
    transform: (organization: EntityOrganizationV1) => EntityOrganizationV1,
  ) => Promise<void>
}

function emptyOrganization(): EntityOrganizationV1 {
  return normalizeEntityOrganization(undefined, [])
}

export const entityOrganizationInitialState = {
  organizations: {
    patterns: emptyOrganization(),
    shows: emptyOrganization(),
    maps: emptyOrganization(),
    controllers: emptyOrganization(),
    mixins: emptyOrganization(),
    libraries: emptyOrganization(),
  },
  loaded: {
    patterns: false,
    shows: false,
    maps: false,
    controllers: false,
    mixins: false,
    libraries: false,
  },
}

export const useEntityOrganizationStore = create<EntityOrganizationState>()((set, get) => ({
  ...entityOrganizationInitialState,

  loadOrganization: async (kind, entityIds) => {
    const provider = getPersonalContentProvider()
    const stored = await provider.getEntityOrganization?.(kind)
    const normalized = normalizeEntityOrganization(stored, entityIds)
    set((state) => ({
      organizations: { ...state.organizations, [kind]: normalized },
      loaded: { ...state.loaded, [kind]: true },
    }))
    if (provider.setEntityOrganization && !sameOrganization(stored, normalized)) {
      await enqueuePersistence(kind, () => provider.setEntityOrganization!(kind, normalized))
    }
  },

  mutateOrganization: async (kind, entityIds, transform) => {
    const previous = get().organizations[kind]
    const normalized = normalizeEntityOrganization(previous, entityIds)
    const next = normalizeEntityOrganization(transform(normalized), entityIds)
    if (sameOrganization(previous, next)) return
    set((state) => ({ organizations: { ...state.organizations, [kind]: next } }))
    const provider = getPersonalContentProvider()
    if (!provider.setEntityOrganization) return
    try {
      await enqueuePersistence(kind, () => provider.setEntityOrganization!(kind, next))
    } catch (cause) {
      set((state) => state.organizations[kind] === next
        ? { organizations: { ...state.organizations, [kind]: previous } }
        : state)
      throw cause
    }
  },
}))

async function enqueuePersistence(kind: EntityOrganizationKind, write: () => Promise<void>): Promise<void> {
  const previous = persistenceQueues.get(kind) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(write)
  persistenceQueues.set(kind, next)
  try {
    await next
  } finally {
    if (persistenceQueues.get(kind) === next) persistenceQueues.delete(kind)
  }
}

function sameOrganization(left: unknown, right: EntityOrganizationV1): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
