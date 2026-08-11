import { useRef, useState, type RefObject } from 'react'
import type { ShowRecord } from '@/store/showStore'
import type { StockShow } from '@/pixelblaze/stock/shows'
import type { EntityOrganizationV1 } from '@/engine/entityOrganization'
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
  onDuplicateShow,
  onEmptyTrash,
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
  onDuplicateShow: (id: string) => void
  onEmptyTrash: (entityIds: string[]) => void | Promise<void>
  onQueryChange: (query: string) => void
  personalOrganization: EntityOrganizationV1
  onPersonalOrganizationChange: (organization: EntityOrganizationV1) => void
  onCollapse?: () => void
}) {
  const [builtInOrganization, setBuiltInOrganization] = useState(() => stockShowOrganization(stockShows))
  const personalTreeRef = useRef<EntityOrganizationTreeHandle>(null)
  return (
    <>
      <RailEntityHeader
        title="Shows"
        onCollapse={onCollapse}
        action={(
          <>
            <RailFilterBar query={query} onQueryChange={onQueryChange} />
            {personalWorkspaceAuthenticated && (
              <HeaderMenu
                title="Add show"
                items={[
                  { label: 'New show', onSelect: onCreateShow },
                  { label: 'New folder', onSelect: () => personalTreeRef.current?.createFolder() },
                  ...(showSeedProfileName
                    ? [{ label: `New show from ${showSeedProfileName}`, onSelect: onCreateShowFromController }]
                    : []),
                ]}
              />
            )}
          </>
        )}
      />
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
              items={userShows.map((show) => ({ id: show.id, name: show.name }))}
              activeEntityId={activeShowId}
              query={query}
              noun="show"
              sectionLabel="Shows"
              emptyMessage="No shows yet"
              onSelect={(id) => {
                const show = userShows.find((candidate) => candidate.id === id)
                if (show) onOpenShow(show)
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
