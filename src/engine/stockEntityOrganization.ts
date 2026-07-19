import { normalizeEntityOrganization, type EntityOrganizationNode, type EntityOrganizationV1 } from './entityOrganization'
import type { GalleryPattern } from './galleryCatalog'
import type { StockShow } from '@/pixelblaze/stock/shows'

export function stockPatternOrganization(patterns: readonly GalleryPattern[]): EntityOrganizationV1 {
  const labels = [...new Set(patterns.flatMap((pattern) => pattern.sections))]
  const nodes: EntityOrganizationNode[] = labels.map((label) => ({
    kind: 'folder',
    id: `stock-pattern-${slug(label)}`,
    name: label,
    children: patterns
      .filter((pattern) => pattern.sections.includes(label))
      .map((pattern) => ({ kind: 'entity', entityId: pattern.name })),
  }))
  return normalizeEntityOrganization({ version: 1, nodes, trash: [], collapsedFolderIds: [] }, patterns.map((pattern) => pattern.name))
}

export function stockShowOrganization(shows: readonly StockShow[]): EntityOrganizationV1 {
  const learn = ([100, 200] as const).map((level): EntityOrganizationNode => ({
    kind: 'folder',
    id: `stock-show-learn-${level}`,
    name: String(level),
    children: shows
      .filter((show) => show.collection === 'learn' && show.level === level)
      .sort((left, right) => left.order - right.order)
      .map((show) => ({ kind: 'entity', entityId: show.id })),
  }))
  const showcaseGroups = [
    { id: 'effects', name: 'Effects', matches: (show: StockShow) => show.collection === 'showcases' && show.track === 'portable' && show.name.includes('Effects') },
    { id: 'transitions', name: 'Transitions & animation', matches: (show: StockShow) => show.collection === 'showcases' && show.track === 'portable' && !show.name.includes('Effects') },
    { id: 'installations', name: 'Installations', matches: (show: StockShow) => show.collection === 'showcases' && show.track === 'installation' },
  ]
  const showcases = showcaseGroups.map((group): EntityOrganizationNode => ({
    kind: 'folder',
    id: `stock-show-showcases-${group.id}`,
    name: group.name,
    children: shows.filter(group.matches).sort((left, right) => left.order - right.order).map((show) => ({ kind: 'entity', entityId: show.id })),
  }))
  const nodes: EntityOrganizationNode[] = [
    { kind: 'folder', id: 'stock-show-learn', name: 'Learn', children: learn },
    { kind: 'folder', id: 'stock-show-showcases', name: 'Showcases', children: showcases },
  ]
  return normalizeEntityOrganization({ version: 1, nodes, trash: [], collapsedFolderIds: [] }, shows.map((show) => show.id))
}

function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
