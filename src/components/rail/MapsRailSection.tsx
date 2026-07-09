import { Plus } from 'lucide-react'
import type { RefObject } from 'react'
import type { DimLens } from '@/engine/dimLens'
import { STOCK_MAP_ITEMS, type EditingMap, type MapRecord } from '@/store/mapStore'
import {
  EditableListItem,
  HeaderAction,
  RailEntityHeader,
  RailFilterBar,
  RailSectionScroller,
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
}) {
  return (
    <>
      <RailEntityHeader
        title="Maps"
        action={personalWorkspaceAuthenticated
          ? <HeaderAction icon={<Plus size={14} />} title="New map" onClick={onCreateMap} />
          : null}
      >
        <RailFilterBar
          lens={dimLens}
          onLensChange={onLensChange}
          query={query}
          onQueryChange={onQueryChange}
          hideOneDimensional
        />
      </RailEntityHeader>
      <RailSectionScroller
        testId="pattern-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
      >
        {!personalWorkspaceAuthenticated ? (
          <p className="pl-3 pr-3 py-2 text-zinc-600 italic select-none">
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save maps
          </p>
        ) : visibleMaps.length === 0 ? (
          userMaps.length === 0 ? (
            <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">
              No custom maps yet
            </p>
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
            <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">No stock maps match</p>
          ) : (
            <ul className="pt-2 opacity-85">
              {visibleStockMaps.map((map) => (
                <StockListItem
                  key={map.id}
                  name={map.name}
                  active={editingMap?.kind === 'stock' && editingMap.id === map.id}
                  meta={dimLens === 'all' ? `${map.dim}D` : undefined}
                  onSelect={() => onOpenStockMap(map.id)}
                />
              ))}
            </ul>
          )
        )}
      </RailSectionScroller>
    </>
  )
}
