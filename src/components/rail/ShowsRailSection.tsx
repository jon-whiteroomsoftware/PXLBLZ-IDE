import { useRef, useState, type RefObject } from 'react'
import type { StockShowCatalogueEntry } from '@/pixelblaze/stock/showCatalogueV2'
import { searchEntityOrganization, type EntityOrganizationV1 } from '@/engine/entityOrganization'
import { stockShowOrganization } from '@/engine/stockEntityOrganization'
import {
  HeaderMenu,
  RailEmptyState,
  RailEntityHeader,
  RailFilterBar,
  RailSectionScroller,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'
import { EntityOrganizationTree, type EntityOrganizationTreeHandle } from '@/components/rail/EntityOrganizationTree'

export function ShowsRailSection({
  personalWorkspaceAuthenticated,
  userShowsV2 = [],
  onOpenShowV2,
  activeShowId,
  stockShows,
  activeStockShowId,
  showStockShows,
  showSeedProfileName,
  query,
  scrollRef,
  scrollMetrics,
  onScroll,
  onCreateShow,
  onImportShow,
  onCreateShowFromController,
  onOpenStockShow,
  onToggleStockShows,
  onRenameShow,
  onDuplicateShow,
  onEmptyTrash,
  onQueryChange,
  personalOrganization,
  onPersonalOrganizationChange,
  onCollapse,
}: {
  personalWorkspaceAuthenticated: boolean
  /**
   * Stored version-2 rows, listed beside the v1 ones behind the route gate
   * (#1056 slice 6). They are a separate prop because `shows` stays v1-typed
   * until #1039 couples the list and the editor.
   */
  userShowsV2?: readonly { id: string; name: string }[]
  onOpenShowV2?: (id: string) => void
  activeShowId: string | null
  stockShows: readonly StockShowCatalogueEntry[]
  activeStockShowId: string | null
  showStockShows: boolean
  showSeedProfileName: string | null
  query: string
  scrollRef: RefObject<HTMLDivElement | null>
  scrollMetrics: ScrollMetrics
  onScroll: () => void
  onCreateShow: () => void
  onImportShow: () => void
  onCreateShowFromController: () => void
  onOpenStockShow: (show: StockShowCatalogueEntry) => void
  onToggleStockShows: () => void
  onRenameShow: (id: string, name: string) => void
  onDuplicateShow: (id: string) => void
  onEmptyTrash: (entityIds: string[]) => void | boolean | Promise<void | boolean>
  onQueryChange: (query: string) => void
  personalOrganization: EntityOrganizationV1
  onPersonalOrganizationChange: (organization: EntityOrganizationV1) => void
  onCollapse?: () => void
}) {
  const [builtInOrganization, setBuiltInOrganization] = useState(() => stockShowOrganization(stockShows))
  const personalTreeRef = useRef<EntityOrganizationTreeHandle>(null)
  const personalNames = Object.fromEntries([
    ...userShowsV2.map((show) => [show.id, show.name] as const),
  ])
  const stockNames = Object.fromEntries(stockShows.map((show) => [show.id, show.name]))
  const total = (personalWorkspaceAuthenticated ? searchEntityOrganization(personalOrganization, personalNames, '').length : 0)
    + searchEntityOrganization(builtInOrganization, stockNames, '').length
  const count = (personalWorkspaceAuthenticated ? searchEntityOrganization(personalOrganization, personalNames, query).length : 0)
    + searchEntityOrganization(builtInOrganization, stockNames, query).length
  return (
    <>
      <RailEntityHeader
        title="Shows"
        query={query}
        onQueryChange={onQueryChange}
        onCollapse={onCollapse}
        action={personalWorkspaceAuthenticated ? (
          <HeaderMenu title="Add show" items={[
            { label: 'New show', onSelect: onCreateShow },
            { label: 'Import Show file…', onSelect: onImportShow },
            { label: 'New folder', onSelect: () => personalTreeRef.current?.createFolder() },
            ...(showSeedProfileName ? [{ label: `New show from ${showSeedProfileName}`, onSelect: onCreateShowFromController }] : []),
          ]} />
        ) : null}
      >
        <RailFilterBar query={query} count={count} total={total} noun="shows" />
      </RailEntityHeader>
      <RailSectionScroller
        testId="show-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
      >
        {!personalWorkspaceAuthenticated ? (
          <RailEmptyState roomy>
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save shows
          </RailEmptyState>
        ) : (
          <EntityOrganizationTree
              ref={personalTreeRef}
              organization={personalOrganization}
              items={[
                ...userShowsV2.map((show) => ({ id: show.id, name: show.name })),
              ]}
              activeEntityId={activeShowId}
              query={query}
              noun="show"
              sectionLabel="Shows"
              emptyMessage="No shows yet"
              onSelect={(id) => {
                if (userShowsV2.some((candidate) => candidate.id === id)) onOpenShowV2?.(id)
              }}
              onRenameEntity={onRenameShow}
              onDuplicateEntity={onDuplicateShow}
              onEmptyTrash={onEmptyTrash}
              onOrganizationChange={onPersonalOrganizationChange}
          />
        )}
        <StockSectionHeader
          label="Built-in Shows"
          open={showStockShows}
          onToggle={onToggleStockShows}
        />
        {showStockShows && (
          <EntityOrganizationTree
            organization={builtInOrganization}
            items={stockShows.map((show) => ({ id: show.id, name: show.name }))}
            activeEntityId={activeStockShowId}
            query={query}
            noun="show"
            editable={false}
            sectionLabel="Built-in Shows"
            onSelect={(id) => {
              const show = stockShows.find((candidate) => candidate.id === id)
              if (show) onOpenStockShow(show)
            }}
            onRenameEntity={() => undefined}
            onOrganizationChange={setBuiltInOrganization}
          />
        )}
      </RailSectionScroller>
    </>
  )
}
