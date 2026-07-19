export const ENTITY_ORGANIZATION_VERSION = 1 as const
export const MAX_ENTITY_ORGANIZATION_DEPTH = 8

export type EntityOrganizationKind =
  | 'patterns'
  | 'shows'
  | 'maps'
  | 'controllers'
  | 'mixins'
  | 'libraries'

export interface EntityOrganizationEntry {
  kind: 'entity'
  entityId: string
}

export interface EntityOrganizationFolder {
  kind: 'folder'
  id: string
  name: string
  children: EntityOrganizationNode[]
}

export type EntityOrganizationNode = EntityOrganizationEntry | EntityOrganizationFolder
export type EntityOrganizationNodeKey = `entity:${string}` | `folder:${string}`
export type EntityOrganizationDropPlacement = 'before' | 'inside' | 'after'

export interface TrashedEntityOrganizationNode {
  node: EntityOrganizationNode
  parentFolderId: string | null
  index: number
  collapsedFolderIds: string[]
}

export interface EntityOrganizationV1 {
  version: typeof ENTITY_ORGANIZATION_VERSION
  nodes: EntityOrganizationNode[]
  trash: TrashedEntityOrganizationNode[]
  collapsedFolderIds: string[]
}

export interface EntityOrganizationSearchResult {
  entityId: string
  name: string
  path: string[]
}

export function normalizeEntityOrganization(
  value: unknown,
  entityIds: readonly string[],
): EntityOrganizationV1 {
  const validEntityIds = new Set(entityIds)
  const seenEntityIds = new Set<string>()
  const seenFolderIds = new Set<string>()
  const stored = isRecord(value) && value.version === ENTITY_ORGANIZATION_VERSION ? value : null
  const nodes = normalizeNodes(stored?.nodes, validEntityIds, seenEntityIds, seenFolderIds, 0)
  const trash = normalizeTrash(stored?.trash, validEntityIds, seenEntityIds, seenFolderIds)
  for (const entityId of entityIds) {
    if (seenEntityIds.has(entityId)) continue
    seenEntityIds.add(entityId)
    nodes.push({ kind: 'entity', entityId })
  }
  const collapsedFolderIds = Array.isArray(stored?.collapsedFolderIds)
    ? stored.collapsedFolderIds.filter((id): id is string => typeof id === 'string' && seenFolderIds.has(id))
    : []
  return {
    version: ENTITY_ORGANIZATION_VERSION,
    nodes,
    trash,
    collapsedFolderIds: [...new Set(collapsedFolderIds)],
  }
}

export function entityOrganizationNodeKey(node: EntityOrganizationNode): EntityOrganizationNodeKey {
  return node.kind === 'entity' ? `entity:${node.entityId}` : `folder:${node.id}`
}

export function moveEntityOrganizationNode(
  organization: EntityOrganizationV1,
  sourceKey: EntityOrganizationNodeKey,
  targetKey: EntityOrganizationNodeKey,
  placement: EntityOrganizationDropPlacement,
): EntityOrganizationV1 {
  if (sourceKey === targetKey) return organization
  const source = findOrganizationNode(organization.nodes, sourceKey)
  const target = findOrganizationNode(organization.nodes, targetKey)
  if (!source || !target) return organization
  if (source.kind === 'folder' && containsOrganizationNode(source, targetKey)) return organization
  const targetContainerDepth = findOrganizationNodeContainerDepth(organization.nodes, targetKey)
  const destinationDepth = placement === 'inside' && target.kind === 'folder'
    ? targetContainerDepth + 1
    : targetContainerDepth
  if (destinationDepth + organizationNodeFolderHeight(source) > MAX_ENTITY_ORGANIZATION_DEPTH) return organization

  const removed = removeOrganizationNode(organization.nodes, sourceKey)
  if (!removed.node) return organization
  const inserted = placement === 'inside' && target.kind === 'folder'
    ? insertOrganizationNodeInside(removed.nodes, targetKey, removed.node)
    : insertOrganizationNodeRelative(removed.nodes, targetKey, removed.node, placement === 'before' ? 'before' : 'after')
  return inserted.didInsert ? { ...organization, nodes: inserted.nodes } : organization
}

export function moveEntityOrganizationNodeToContainer(
  organization: EntityOrganizationV1,
  sourceKey: EntityOrganizationNodeKey,
  parentFolderId: string | null,
  index?: number,
): EntityOrganizationV1 {
  const source = findOrganizationNode(organization.nodes, sourceKey)
  if (!source) return organization
  if (parentFolderId) {
    const parentKey: EntityOrganizationNodeKey = `folder:${parentFolderId}`
    const parent = findOrganizationNode(organization.nodes, parentKey)
    if (!parent || parent.kind !== 'folder') return organization
    if (source.kind === 'folder' && containsOrganizationNode(source, parentKey)) return organization
    const parentDepth = findOrganizationNodeContainerDepth(organization.nodes, parentKey) + 1
    if (parentDepth + organizationNodeFolderHeight(source) > MAX_ENTITY_ORGANIZATION_DEPTH) return organization
  }

  const removed = removeOrganizationNode(organization.nodes, sourceKey)
  if (!removed.node) return organization
  if (!parentFolderId) {
    return { ...organization, nodes: insertAt(removed.nodes, removed.node, index ?? removed.nodes.length) }
  }
  const inserted = insertOrganizationNodeAt(
    removed.nodes,
    parentFolderId,
    removed.node,
    index ?? Number.MAX_SAFE_INTEGER,
  )
  return inserted.didInsert ? { ...organization, nodes: inserted.nodes } : organization
}

export function createEntityOrganizationFolder(
  organization: EntityOrganizationV1,
  input: { id: string; name: string; parentFolderId?: string | null; index?: number },
): EntityOrganizationV1 {
  const name = input.name.trim()
  if (!input.id || !name || findOrganizationNode(organization.nodes, `folder:${input.id}`)) return organization
  const folder: EntityOrganizationFolder = { kind: 'folder', id: input.id, name, children: [] }
  if (input.parentFolderId) {
    const inserted = insertOrganizationFolderAt(
      organization.nodes,
      input.parentFolderId,
      folder,
      input.index,
    )
    return inserted.didInsert ? { ...organization, nodes: inserted.nodes } : organization
  }
  const index = boundedInsertionIndex(input.index, organization.nodes.length)
  return {
    ...organization,
    nodes: [...organization.nodes.slice(0, index), folder, ...organization.nodes.slice(index)],
  }
}

export function renameEntityOrganizationFolder(
  organization: EntityOrganizationV1,
  folderId: string,
  name: string,
): EntityOrganizationV1 {
  const trimmed = name.trim()
  if (!trimmed) return organization
  const nodes = organization.nodes.map(function rename(node): EntityOrganizationNode {
    if (node.kind !== 'folder') return node
    if (node.id === folderId) return { ...node, name: trimmed }
    return { ...node, children: node.children.map(rename) }
  })
  return { ...organization, nodes }
}

export function trashEntityOrganizationNode(
  organization: EntityOrganizationV1,
  key: EntityOrganizationNodeKey,
): EntityOrganizationV1 {
  const removed = removeOrganizationNode(organization.nodes, key)
  if (!removed.node) return organization
  const removedFolderIds = collectOrganizationFolderIds(removed.node)
  const collapsedFolderIds = organization.collapsedFolderIds.filter((id) => removedFolderIds.has(id))
  return {
    ...organization,
    nodes: removed.nodes,
    trash: [...organization.trash, {
      node: removed.node,
      parentFolderId: removed.parentFolderId,
      index: removed.index,
      collapsedFolderIds,
    }],
    collapsedFolderIds: organization.collapsedFolderIds.filter((id) => !removedFolderIds.has(id)),
  }
}

export function restoreEntityOrganizationNode(
  organization: EntityOrganizationV1,
  key: EntityOrganizationNodeKey,
): EntityOrganizationV1 {
  const trashIndex = organization.trash.findIndex((entry) => entityOrganizationNodeKey(entry.node) === key)
  if (trashIndex < 0) return organization
  const entry = organization.trash[trashIndex]
  const restored = entry.parentFolderId
    ? insertOrganizationNodeAt(organization.nodes, entry.parentFolderId, entry.node, entry.index)
    : {
        nodes: insertAt(organization.nodes, entry.node, entry.index),
        didInsert: true,
      }
  if (!restored.didInsert) return organization
  return {
    ...organization,
    nodes: restored.nodes,
    trash: [...organization.trash.slice(0, trashIndex), ...organization.trash.slice(trashIndex + 1)],
    collapsedFolderIds: [...new Set([...organization.collapsedFolderIds, ...entry.collapsedFolderIds])],
  }
}

export function collectTrashedEntityOrganizationIds(
  organization: EntityOrganizationV1,
): string[] {
  return organization.trash.flatMap((entry) => collectOrganizationEntityIds(entry.node))
}

export function emptyEntityOrganizationTrash(
  organization: EntityOrganizationV1,
): EntityOrganizationV1 {
  return organization.trash.length === 0 ? organization : { ...organization, trash: [] }
}

export function searchEntityOrganization(
  organization: EntityOrganizationV1,
  namesByEntityId: Readonly<Record<string, string>>,
  query: string,
): EntityOrganizationSearchResult[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const results: EntityOrganizationSearchResult[] = []
  walkOrganizationEntries(organization.nodes, [], (entry, path) => {
    const name = namesByEntityId[entry.entityId]
    if (!name) return
    const haystack = `${path.join(' ')} ${name}`.toLocaleLowerCase()
    if (terms.every((term) => haystack.includes(term))) {
      results.push({ entityId: entry.entityId, name, path })
    }
  })
  return results
}

export function setEntityOrganizationFolderCollapsed(
  organization: EntityOrganizationV1,
  folderId: string,
  collapsed: boolean,
): EntityOrganizationV1 {
  if (!findOrganizationNode(organization.nodes, `folder:${folderId}`)) return organization
  const current = new Set(organization.collapsedFolderIds)
  if (collapsed) current.add(folderId)
  else current.delete(folderId)
  return { ...organization, collapsedFolderIds: [...current] }
}

function normalizeNodes(
  value: unknown,
  validEntityIds: Set<string>,
  seenEntityIds: Set<string>,
  seenFolderIds: Set<string>,
  depth: number,
): EntityOrganizationNode[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): EntityOrganizationNode[] => {
    if (!isRecord(candidate)) return []
    if (candidate.kind === 'entity' && typeof candidate.entityId === 'string') {
      if (!validEntityIds.has(candidate.entityId) || seenEntityIds.has(candidate.entityId)) return []
      seenEntityIds.add(candidate.entityId)
      return [{ kind: 'entity', entityId: candidate.entityId }]
    }
    if (
      candidate.kind !== 'folder'
      || typeof candidate.id !== 'string'
      || typeof candidate.name !== 'string'
      || !candidate.name.trim()
      || seenFolderIds.has(candidate.id)
      || depth >= MAX_ENTITY_ORGANIZATION_DEPTH
    ) return []
    seenFolderIds.add(candidate.id)
    return [{
      kind: 'folder',
      id: candidate.id,
      name: candidate.name.trim(),
      children: normalizeNodes(candidate.children, validEntityIds, seenEntityIds, seenFolderIds, depth + 1),
    }]
  })
}

function normalizeTrash(
  value: unknown,
  validEntityIds: Set<string>,
  seenEntityIds: Set<string>,
  seenFolderIds: Set<string>,
): TrashedEntityOrganizationNode[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): TrashedEntityOrganizationNode[] => {
    if (!isRecord(candidate)) return []
    const normalized = normalizeNodes([candidate.node], validEntityIds, seenEntityIds, seenFolderIds, 0)[0]
    if (!normalized) return []
    const parentFolderId = candidate.parentFolderId === null || typeof candidate.parentFolderId === 'string'
      ? candidate.parentFolderId
      : null
    const index = typeof candidate.index === 'number' && Number.isInteger(candidate.index) && candidate.index >= 0
      ? candidate.index
      : 0
    const collapsedFolderIds = Array.isArray(candidate.collapsedFolderIds)
      ? candidate.collapsedFolderIds.filter((id): id is string => typeof id === 'string')
      : []
    return [{ node: normalized, parentFolderId, index, collapsedFolderIds }]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function findOrganizationNode(
  nodes: readonly EntityOrganizationNode[],
  key: EntityOrganizationNodeKey,
): EntityOrganizationNode | null {
  for (const node of nodes) {
    if (entityOrganizationNodeKey(node) === key) return node
    if (node.kind === 'folder') {
      const found = findOrganizationNode(node.children, key)
      if (found) return found
    }
  }
  return null
}

function containsOrganizationNode(node: EntityOrganizationNode, key: EntityOrganizationNodeKey): boolean {
  return entityOrganizationNodeKey(node) === key
    || (node.kind === 'folder' && Boolean(findOrganizationNode(node.children, key)))
}

function findOrganizationNodeContainerDepth(
  nodes: readonly EntityOrganizationNode[],
  key: EntityOrganizationNodeKey,
  depth = 0,
): number {
  if (nodes.some((node) => entityOrganizationNodeKey(node) === key)) return depth
  for (const node of nodes) {
    if (node.kind !== 'folder') continue
    const nested = findOrganizationNodeContainerDepth(node.children, key, depth + 1)
    if (nested >= 0) return nested
  }
  return -1
}

function organizationNodeFolderHeight(node: EntityOrganizationNode): number {
  if (node.kind === 'entity') return 0
  return 1 + Math.max(0, ...node.children.map(organizationNodeFolderHeight))
}

function removeOrganizationNode(
  nodes: readonly EntityOrganizationNode[],
  key: EntityOrganizationNodeKey,
  parentFolderId: string | null = null,
): { nodes: EntityOrganizationNode[]; node: EntityOrganizationNode | null; parentFolderId: string | null; index: number } {
  const index = nodes.findIndex((node) => entityOrganizationNodeKey(node) === key)
  if (index >= 0) return {
    nodes: [...nodes.slice(0, index), ...nodes.slice(index + 1)],
    node: nodes[index],
    parentFolderId,
    index,
  }
  for (let index = 0; index < nodes.length; index += 1) {
    const candidate = nodes[index]
    if (candidate.kind !== 'folder') continue
    const removed = removeOrganizationNode(candidate.children, key, candidate.id)
    if (removed.node) {
      const next = [...nodes]
      next[index] = { ...candidate, children: removed.nodes }
      return { ...removed, nodes: next }
    }
  }
  return { nodes: [...nodes], node: null, parentFolderId: null, index: -1 }
}

function insertOrganizationNodeInside(
  nodes: readonly EntityOrganizationNode[],
  targetKey: EntityOrganizationNodeKey,
  node: EntityOrganizationNode,
): { nodes: EntityOrganizationNode[]; didInsert: boolean } {
  let didInsert = false
  const next = nodes.map((candidate): EntityOrganizationNode => {
    if (entityOrganizationNodeKey(candidate) === targetKey && candidate.kind === 'folder') {
      didInsert = true
      return { ...candidate, children: [...candidate.children, node] }
    }
    if (candidate.kind !== 'folder') return candidate
    const inserted = insertOrganizationNodeInside(candidate.children, targetKey, node)
    if (inserted.didInsert) didInsert = true
    return inserted.didInsert ? { ...candidate, children: inserted.nodes } : candidate
  })
  return { nodes: next, didInsert }
}

function insertOrganizationNodeRelative(
  nodes: readonly EntityOrganizationNode[],
  targetKey: EntityOrganizationNodeKey,
  node: EntityOrganizationNode,
  placement: 'before' | 'after',
): { nodes: EntityOrganizationNode[]; didInsert: boolean } {
  const index = nodes.findIndex((candidate) => entityOrganizationNodeKey(candidate) === targetKey)
  if (index >= 0) {
    const insertionIndex = placement === 'before' ? index : index + 1
    return {
      nodes: [...nodes.slice(0, insertionIndex), node, ...nodes.slice(insertionIndex)],
      didInsert: true,
    }
  }
  for (let index = 0; index < nodes.length; index += 1) {
    const candidate = nodes[index]
    if (candidate.kind !== 'folder') continue
    const inserted = insertOrganizationNodeRelative(candidate.children, targetKey, node, placement)
    if (inserted.didInsert) {
      const next = [...nodes]
      next[index] = { ...candidate, children: inserted.nodes }
      return { nodes: next, didInsert: true }
    }
  }
  return { nodes: [...nodes], didInsert: false }
}

function insertOrganizationFolderAt(
  nodes: readonly EntityOrganizationNode[],
  parentFolderId: string,
  folder: EntityOrganizationFolder,
  requestedIndex: number | undefined,
): { nodes: EntityOrganizationNode[]; didInsert: boolean } {
  let didInsert = false
  const next = nodes.map((node): EntityOrganizationNode => {
    if (node.kind !== 'folder') return node
    if (node.id === parentFolderId) {
      didInsert = true
      const index = boundedInsertionIndex(requestedIndex, node.children.length)
      return {
        ...node,
        children: [...node.children.slice(0, index), folder, ...node.children.slice(index)],
      }
    }
    const inserted = insertOrganizationFolderAt(node.children, parentFolderId, folder, requestedIndex)
    if (inserted.didInsert) didInsert = true
    return inserted.didInsert ? { ...node, children: inserted.nodes } : node
  })
  return { nodes: next, didInsert }
}

function insertOrganizationNodeAt(
  nodes: readonly EntityOrganizationNode[],
  parentFolderId: string,
  node: EntityOrganizationNode,
  requestedIndex: number,
): { nodes: EntityOrganizationNode[]; didInsert: boolean } {
  let didInsert = false
  const next = nodes.map((candidate): EntityOrganizationNode => {
    if (candidate.kind !== 'folder') return candidate
    if (candidate.id === parentFolderId) {
      didInsert = true
      return { ...candidate, children: insertAt(candidate.children, node, requestedIndex) }
    }
    const inserted = insertOrganizationNodeAt(candidate.children, parentFolderId, node, requestedIndex)
    if (inserted.didInsert) didInsert = true
    return inserted.didInsert ? { ...candidate, children: inserted.nodes } : candidate
  })
  return { nodes: next, didInsert }
}

function insertAt(
  nodes: readonly EntityOrganizationNode[],
  node: EntityOrganizationNode,
  requestedIndex: number,
): EntityOrganizationNode[] {
  const index = boundedInsertionIndex(requestedIndex, nodes.length)
  return [...nodes.slice(0, index), node, ...nodes.slice(index)]
}

function collectOrganizationFolderIds(node: EntityOrganizationNode): Set<string> {
  if (node.kind === 'entity') return new Set()
  return new Set([node.id, ...node.children.flatMap((child) => [...collectOrganizationFolderIds(child)])])
}

function collectOrganizationEntityIds(node: EntityOrganizationNode): string[] {
  return node.kind === 'entity'
    ? [node.entityId]
    : node.children.flatMap(collectOrganizationEntityIds)
}

function walkOrganizationEntries(
  nodes: readonly EntityOrganizationNode[],
  path: string[],
  visit: (entry: EntityOrganizationEntry, path: string[]) => void,
): void {
  for (const node of nodes) {
    if (node.kind === 'entity') visit(node, path)
    else walkOrganizationEntries(node.children, [...path, node.name], visit)
  }
}

function boundedInsertionIndex(requested: number | undefined, length: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return length
  return Math.max(0, Math.min(length, Math.floor(requested)))
}
