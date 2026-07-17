import { Plus } from 'lucide-react'
import type { RefObject } from 'react'
import type { DimLens } from '@/engine/dimLens'
import { STOCK_MAP_ITEMS, type EditingMap, type MapRecord } from '@/store/mapStore'
import { groupMapCatalogue } from '@/engine/mapCatalogue'
import { IDE_MICROTYPE } from '@/components/ui/ideMicrotype'
import {
  EditableListItem,
  HeaderAction,
  RailEmptyState,
  RailEntityHeader,
  RailFilterBar,
  RailSectionScroller,
  RailSubsectionLabel,
  StockListItem,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'

export function MapsRailSection({
  personalWorkspaceAuthenticated,
  dimLens,
  query,
  userMaps,
  visibleMaps,
  visibleStockMaps,
  editingMap,
  showStockMaps,
  scrollRef,
  scrollMetrics,
  onScroll,
  onLensChange,
  onQueryChange,
  onCreateMap,
  onToggleStockMaps,
  onOpenUserMap,
  onOpenStockMap,
  onRenameMap,
  onDeleteMap,
  onCollapse,
}: {
  personalWorkspaceAuthenticated: boolean
  dimLens: DimLens
  query: string
  userMaps: MapRecord[]
  visibleMaps: MapRecord[]
  visibleStockMaps: typeof STOCK_MAP_ITEMS
  editingMap: EditingMap
  showStockMaps: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  scrollMetrics: ScrollMetrics
  onScroll: () => void
  onLensChange: (lens: DimLens) => void
  onQueryChange: (query: string) => void
  onCreateMap: () => void
  onToggleStockMaps: () => void
  onOpenUserMap: (map: MapRecord) => void
  onOpenStockMap: (id: string) => void
  onRenameMap: (id: string, name: string) => void
  onDeleteMap: (id: string) => void
  onCollapse?: () => void
}) {
  const stockGroups = groupMapCatalogue(visibleStockMaps.map((map) => ({
    ...map,
    provenance: 'stock' as const,
  }))).sort((left, right) => {
    if (left.kind === 'custom') return -1
    if (right.kind === 'custom') return 1
    return 0
  })
  return (
    <>
      <RailEntityHeader
        title="Maps"
        onCollapse={onCollapse}
        action={personalWorkspaceAuthenticated
          ? <HeaderAction icon={<Plus size={14} />} title="New map" onClick={onCreateMap} />
          : null}
      >
        <RailFilterBar
          lens={dimLens}
          onLensChange={onLensChange}
          query={query}
          onQueryChange={onQueryChange}
        />
      </RailEntityHeader>
      <RailSectionScroller
        testId="pattern-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
      >
        {!personalWorkspaceAuthenticated ? (
          <RailEmptyState roomy>
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save maps
          </RailEmptyState>
        ) : visibleMaps.length === 0 ? (
          userMaps.length === 0 ? (
            <RailEmptyState>
              No custom maps yet
            </RailEmptyState>
          ) : (
            null
          )
        ) : (
          <ul className="pt-2">
            {visibleMaps.map((map) => (
              <EditableListItem
                key={map.id}
                name={map.name}
                noun="map"
                active={editingMap?.kind === 'existing' && editingMap.id === map.id}
                dim={dimLens === 'all' ? `${map.dim}D` : undefined}
                badge={map.importMetadata ? 'import' : undefined}
                takenNames={userMaps.filter((m) => m.id !== map.id).map((m) => m.name)}
                onSelect={() => onOpenUserMap(map)}
                onRename={(name) => onRenameMap(map.id, name)}
                onDelete={() => onDeleteMap(map.id)}
              />
            ))}
          </ul>
        )}
        <StockSectionHeader
          label="Stock Maps"
          open={showStockMaps}
          onToggle={onToggleStockMaps}
        />
        {showStockMaps && (
          visibleStockMaps.length === 0 ? (
            <RailEmptyState>No stock maps match</RailEmptyState>
          ) : (
            <ul className="pt-1">
              {stockGroups.map((group) => (
                <li key={group.kind} className="pt-1.5">
                  <RailSubsectionLabel>{group.label}</RailSubsectionLabel>
                  <ul>
                    {group.items.map((item) => item.views.length === 1 ? (
                      <StockListItem
                        key={item.id}
                        name={item.name}
                        active={editingMap?.kind === 'stock' && editingMap.id === item.id}
                        meta={dimLens === 'all' ? `${item.views[0].dim}D` : undefined}
                        onSelect={() => onOpenStockMap(item.id)}
                      />
                    ) : (
                      <li key={item.familyId} className="min-h-[20px] px-3 py-px text-zinc-400">
                        <details>
                          <summary
                            onClick={() => onOpenStockMap(item.id)}
                            className={`flex cursor-pointer list-none items-center justify-between hover:text-zinc-200 [&::-webkit-details-marker]:hidden ${IDE_MICROTYPE.entity.className}`}
                          >
                            <span>{item.name}</span>
                            <span className={IDE_MICROTYPE.secondary.className}>{item.views.length} views</span>
                          </summary>
                          <div className="mt-1 flex flex-wrap gap-1" aria-label={`${item.name} coordinate views`}>
                            {item.views.map((view) => {
                              const active = editingMap?.kind === 'stock' && editingMap.id === view.id
                              const label = view.view ? `${view.view[0].toUpperCase()}${view.view.slice(1)}` : view.name
                              return (
                                <button
                                  key={view.id}
                                  type="button"
                                  aria-label={`${item.name} ${label} ${view.dim}D`}
                                  onClick={() => onOpenStockMap(view.id)}
                                  className={`rounded border px-1.5 py-0.5 transition-colors ${IDE_MICROTYPE.required.sizeClassName} ${
                                    active
                                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                                  }`}
                                >
                                  {label} <span className="text-zinc-400">{view.dim}D</span>
                                </button>
                              )
                            })}
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )
        )}
      </RailSectionScroller>
    </>
  )
}
