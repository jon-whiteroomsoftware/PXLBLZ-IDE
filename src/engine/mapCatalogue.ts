import type { GeometryFamilyView, MapCatalogueKind } from './maps'
export type { MapCatalogueKind } from './maps'
export type MapProvenance = 'stock' | 'user'

export interface MapCatalogueEntry {
  id: string
  name: string
  dim: 1 | 2 | 3
  kind: MapCatalogueKind
  provenance: MapProvenance
  family?: GeometryFamilyView
}

export interface MapCatalogueView {
  id: string
  name: string
  dim: 1 | 2 | 3
  view?: GeometryFamilyView['view']
  natural?: boolean
}

export interface MapCatalogueItem {
  id: string
  name: string
  kind: MapCatalogueKind
  provenance: MapProvenance
  familyId?: string
  views: MapCatalogueView[]
}

export interface MapCatalogueGroup {
  kind: MapCatalogueKind
  label: string
  items: MapCatalogueItem[]
}

export interface MapCatalogueFilter {
  dim?: 1 | 2 | 3
  query?: string
  provenance?: MapProvenance
}

const GROUPS: readonly { kind: MapCatalogueKind; label: string }[] = [
  { kind: 'path', label: 'Paths' },
  { kind: 'surface', label: 'Surfaces' },
  { kind: 'shell', label: 'Shells' },
  { kind: 'volume', label: 'Volumes' },
  { kind: 'custom', label: 'Custom / imported' },
]

function matches(value: string, query: string): boolean {
  return value.toLocaleLowerCase().includes(query)
}

// Pure shared view model for the Pattern selector and Maps rail. Filtering is
// applied to family children before grouping, so a dimension lens can retain a
// family while showing only the coordinate views meaningful in that lens.
export function groupMapCatalogue(
  entries: readonly MapCatalogueEntry[],
  filter: MapCatalogueFilter = {},
): MapCatalogueGroup[] {
  const query = filter.query?.trim().toLocaleLowerCase() ?? ''
  const eligible = entries.filter((entry) => (
    (!filter.provenance || entry.provenance === filter.provenance)
    && (!filter.dim || entry.dim === filter.dim)
  ))

  return GROUPS.map(({ kind, label }) => {
    const entriesForKind = eligible.filter((entry) => entry.kind === kind)
    const items: MapCatalogueItem[] = []
    const familyIndexes = new Map<string, number>()

    for (const entry of entriesForKind) {
      const familyNameMatches = !!entry.family && matches(entry.family.name, query)
      const entryMatches = !query
        || familyNameMatches
        || matches(entry.name, query)
        || (!!entry.family && matches(entry.family.view, query))
      if (!entryMatches) continue

      const view: MapCatalogueView = {
        id: entry.id,
        name: entry.name,
        dim: entry.dim,
        ...(entry.family ? { view: entry.family.view, natural: entry.family.natural } : {}),
      }
      if (!entry.family) {
        items.push({
          id: entry.id,
          name: entry.name,
          kind,
          provenance: entry.provenance,
          views: [view],
        })
        continue
      }

      const familyKey = `${entry.provenance}:${entry.family.id}`
      const priorIndex = familyIndexes.get(familyKey)
      if (priorIndex === undefined) {
        familyIndexes.set(familyKey, items.length)
        items.push({
          id: entry.id,
          name: entry.family.name,
          kind,
          provenance: entry.provenance,
          familyId: entry.family.id,
          views: [view],
        })
      } else {
        const item = items[priorIndex]
        item.views.push(view)
        if (entry.family.natural) item.id = entry.id
      }
    }

    return { kind, label, items }
  }).filter((group) => group.items.length > 0)
}

export function mapCatalogueKindLabel(kind: MapCatalogueKind): string {
  return GROUPS.find((group) => group.kind === kind)?.label ?? kind
}

export function mapCatalogueKindRank(kind: MapCatalogueKind | undefined): number {
  if (!kind) return -1
  return GROUPS.findIndex((group) => group.kind === kind)
}
