import type { RefObject } from 'react'
import { controllerProfileDisplayName } from '@/engine/controllerProfile'
import type { ControllerProfile } from '@/store/controllerProfileStore'
import {
  EditableListItem,
  RailEntityHeader,
  RailSectionScroller,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'

export function ControllersRailSection({
  personalWorkspaceAuthenticated,
  controllerProfiles,
  activeControllerProfileId,
  scrollRef,
  scrollMetrics,
  onScroll,
  profileIsLive,
  onOpenControllerProfile,
  onDeleteControllerProfile,
  onCollapse,
}: {
  personalWorkspaceAuthenticated: boolean
  controllerProfiles: ControllerProfile[]
  activeControllerProfileId: string | null
  scrollRef: RefObject<HTMLDivElement | null>
  scrollMetrics: ScrollMetrics
  onScroll: () => void
  profileIsLive: (profile: ControllerProfile) => boolean
  onOpenControllerProfile: (profileId: string) => void
  onDeleteControllerProfile: (profileId: string) => void
  onCollapse?: () => void
}) {
  return (
    <>
      <RailEntityHeader title="Controllers" onCollapse={onCollapse} />
      <RailSectionScroller
        testId="controller-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
      >
        {!personalWorkspaceAuthenticated ? (
          <p className="pl-3 pr-3 py-2 text-zinc-500 italic select-none">
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save controllers
          </p>
        ) : controllerProfiles.length === 0 ? (
          <p className="pl-3 pr-3 py-1 text-zinc-500 italic select-none">
            Connect a Controller to create its profile
          </p>
        ) : (
          <ul className="pt-2">
            {controllerProfiles.map((profile) => (
              <EditableListItem
                key={profile.id}
                name={controllerProfileDisplayName(profile)}
                noun="controller"
                active={activeControllerProfileId === profile.id}
                dim={profileIsLive(profile) ? 'LIVE' : 'IDLE'}
                takenNames={[]}
                onSelect={() => onOpenControllerProfile(profile.id)}
                onDelete={() => onDeleteControllerProfile(profile.id)}
              />
            ))}
          </ul>
        )}
      </RailSectionScroller>
    </>
  )
}
