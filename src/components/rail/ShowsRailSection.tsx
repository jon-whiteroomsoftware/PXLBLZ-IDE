import { Cpu, Plus } from 'lucide-react'
import type { RefObject } from 'react'
import type { ShowRecord } from '@/store/showStore'
import {
  EditableListItem,
  HeaderAction,
  RailEntityHeader,
  RailSectionScroller,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'

export function ShowsRailSection({
  personalWorkspaceAuthenticated,
  userShows,
  activeShowId,
  showSeedProfileName,
  scrollRef,
  scrollMetrics,
  onScroll,
  onCreateShow,
  onCreateShowFromController,
  onOpenShow,
  onRenameShow,
  onDeleteShow,
}: {
  personalWorkspaceAuthenticated: boolean
  userShows: ShowRecord[]
  activeShowId: string | null
  showSeedProfileName: string | null
  scrollRef: RefObject<HTMLDivElement | null>
  scrollMetrics: ScrollMetrics
  onScroll: () => void
  onCreateShow: () => void
  onCreateShowFromController: () => void
  onOpenShow: (show: ShowRecord) => void
  onRenameShow: (id: string, name: string) => void
  onDeleteShow: (id: string) => void
}) {
  return (
    <>
      <RailEntityHeader
        title="Shows"
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
          <p className="pl-3 pr-3 py-2 text-zinc-600 italic select-none">
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save shows
          </p>
        ) : userShows.length === 0 ? (
          <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">
            No shows yet
          </p>
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
      </RailSectionScroller>
    </>
  )
}
