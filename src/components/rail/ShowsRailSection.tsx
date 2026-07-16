import { Cpu, Plus } from 'lucide-react'
import type { RefObject } from 'react'
import type { ShowRecord } from '@/store/showStore'
import type { StockShow } from '@/pixelblaze/stock/shows'
import {
  EditableListItem,
  HeaderAction,
  RailEmptyState,
  RailEntityHeader,
  RailSectionScroller,
  RailSubsectionLabel,
  StockListItem,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'

export function ShowsRailSection({
  personalWorkspaceAuthenticated,
  userShows,
  activeShowId,
  stockShows,
  activeStockShowId,
  showStockShows,
  showSeedProfileName,
  scrollRef,
  scrollMetrics,
  onScroll,
  onCreateShow,
  onCreateShowFromController,
  onOpenShow,
  onOpenStockShow,
  onToggleStockShows,
  onRenameShow,
  onDeleteShow,
  onCollapse,
}: {
  personalWorkspaceAuthenticated: boolean
  userShows: ShowRecord[]
  activeShowId: string | null
  stockShows: StockShow[]
  activeStockShowId: string | null
  showStockShows: boolean
  showSeedProfileName: string | null
  scrollRef: RefObject<HTMLDivElement | null>
  scrollMetrics: ScrollMetrics
  onScroll: () => void
  onCreateShow: () => void
  onCreateShowFromController: () => void
  onOpenShow: (show: ShowRecord) => void
  onOpenStockShow: (show: StockShow) => void
  onToggleStockShows: () => void
  onRenameShow: (id: string, name: string) => void
  onDeleteShow: (id: string) => void
  onCollapse?: () => void
}) {
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
        ) : userShows.length === 0 ? (
          <RailEmptyState>
            No shows yet
          </RailEmptyState>
        ) : (
          <ul className="pt-2">
            {userShows.map((show) => (
              <EditableListItem
                key={show.id}
                name={show.name}
                noun="show"
                active={activeShowId === show.id}
                dim={`${show.scenes.length} SC`}
                takenNames={userShows.filter((item) => item.id !== show.id).map((item) => item.name)}
                onSelect={() => onOpenShow(show)}
                onRename={(name) => onRenameShow(show.id, name)}
                onDelete={() => onDeleteShow(show.id)}
              />
            ))}
          </ul>
        )}
        <StockSectionHeader
          label="Built-in Shows"
          open={showStockShows}
          onToggle={onToggleStockShows}
        />
        {showStockShows && (['portable', 'installation'] as const).map((track) => (
          <section key={track} aria-label={`${track === 'portable' ? 'Portable' : 'Installation'} built-in Shows`}>
            <RailSubsectionLabel>
              {track === 'portable' ? 'Portable' : 'Installation'}
            </RailSubsectionLabel>
            <ul>
              {stockShows.filter((item) => item.track === track).map((item) => (
                <StockListItem
                  key={item.id}
                  name={item.name}
                  active={activeStockShowId === item.id}
                  meta={`${item.show.scenes.length} SC`}
                  onSelect={() => onOpenStockShow(item)}
                />
              ))}
            </ul>
          </section>
        ))}
      </RailSectionScroller>
    </>
  )
}
