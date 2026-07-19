import { Cpu, Plus } from 'lucide-react'
import { useState, type RefObject } from 'react'
import type { ShowRecord } from '@/store/showStore'
import type { StockShow } from '@/pixelblaze/stock/shows'
import type { EntityOrganizationV1 } from '@/engine/entityOrganization'
import { stockShowOrganization } from '@/engine/stockEntityOrganization'
import {
  HeaderAction,
  RailEmptyState,
  RailEntityHeader,
  RailFilterBar,
  RailSectionScroller,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'
import { EntityOrganizationTree } from '@/components/rail/EntityOrganizationTree'

export function ShowsRailSection({
  personalWorkspaceAuthenticated,
  userShows,
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
  onCreateShowFromController,
  onOpenShow,
  onOpenStockShow,
  onToggleStockShows,
  onRenameShow,
  onQueryChange,
  personalOrganization,
  onPersonalOrganizationChange,
  onCollapse,
}: {
  personalWorkspaceAuthenticated: boolean
  userShows: ShowRecord[]
  activeShowId: string | null
  stockShows: StockShow[]
  activeStockShowId: string | null
  showStockShows: boolean
  showSeedProfileName: string | null
  query: string
  scrollRef: RefObject<HTMLDivElement | null>
  scrollMetrics: ScrollMetrics
  onScroll: () => void
  onCreateShow: () => void
  onCreateShowFromController: () => void
  onOpenShow: (show: ShowRecord) => void
  onOpenStockShow: (show: StockShow) => void
  onToggleStockShows: () => void
  onRenameShow: (id: string, name: string) => void
  onQueryChange: (query: string) => void
  personalOrganization: EntityOrganizationV1
  onPersonalOrganizationChange: (organization: EntityOrganizationV1) => void
  onCollapse?: () => void
}) {
  const [builtInOrganization, setBuiltInOrganization] = useState(() => stockShowOrganization(stockShows))
  return (
    <>
      <RailEntityHeader
        title="Shows"
        onCollapse={onCollapse}
        action={personalWorkspaceAuthenticated
          ? (
              <>
                {showSeedProfileName && (
                  <HeaderAction
                    icon={<Cpu size={14} />}
                    title={`New show from ${showSeedProfileName}`}
                    onClick={onCreateShowFromController}
                  />
                )}
                <HeaderAction icon={<Plus size={14} />} title="New show" onClick={onCreateShow} />
              </>
            )
          : null}
      >
        <RailFilterBar query={query} onQueryChange={onQueryChange} />
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
              organization={personalOrganization}
              items={userShows.map((show) => ({ id: show.id, name: show.name }))}
              activeEntityId={activeShowId}
              query={query}
              noun="show"
              emptyMessage="No shows yet"
              onSelect={(id) => {
                const show = userShows.find((candidate) => candidate.id === id)
                if (show) onOpenShow(show)
              }}
              onRenameEntity={onRenameShow}
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
            showSectionHeader={false}
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
