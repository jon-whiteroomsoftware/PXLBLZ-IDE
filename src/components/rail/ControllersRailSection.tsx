import { useRef, type RefObject } from 'react'
import { controllerProfileDisplayName } from '@/engine/controllerProfile'
import type { EntityOrganizationV1 } from '@/engine/entityOrganization'
import type { ControllerProfile } from '@/store/controllerProfileStore'
import {
  HeaderMenu,
  RailEmptyState,
  RailEntityHeader,
  RailSectionScroller,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'
import { EntityOrganizationTree, type EntityOrganizationTreeHandle } from '@/components/rail/EntityOrganizationTree'

export function ControllersRailSection({
  personalWorkspaceAuthenticated,
  controllerProfiles,
  activeControllerProfileId,
  scrollRef,
  scrollMetrics,
  onScroll,
  profileIsLive,
  onOpenControllerProfile,
  onRenameControllerProfile,
  personalOrganization,
  onPersonalOrganizationChange,
  onEmptyTrash,
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
  onRenameControllerProfile: (profileId: string, name: string) => void
  personalOrganization: EntityOrganizationV1
  onPersonalOrganizationChange: (organization: EntityOrganizationV1) => void
  onEmptyTrash: (entityIds: string[]) => void | Promise<void>
  onCollapse?: () => void
}) {
  const personalTreeRef = useRef<EntityOrganizationTreeHandle>(null)
  return (
    <>
      <RailEntityHeader
        title="Controllers"
        onCollapse={onCollapse}
        action={personalWorkspaceAuthenticated ? (
          <HeaderMenu
            title="Add folder"
            items={[{ label: 'New folder', onSelect: () => personalTreeRef.current?.createFolder() }]}
          />
        ) : null}
      />
      <RailSectionScroller
        testId="controller-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
      >
        {!personalWorkspaceAuthenticated ? (
          <RailEmptyState roomy>
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save controllers
          </RailEmptyState>
        ) : (
          <EntityOrganizationTree
            ref={personalTreeRef}
            organization={personalOrganization}
            items={controllerProfiles.map((profile) => ({
              id: profile.id,
              name: controllerProfileDisplayName(profile),
              meta: profileIsLive(profile) ? 'LIVE' : 'IDLE',
            }))}
            activeEntityId={activeControllerProfileId}
            query=""
            noun="controller"
            canRenameEntity={false}
            sectionLabel="Controllers"
            emptyMessage="Connect a Controller to create its profile"
            onSelect={onOpenControllerProfile}
            onRenameEntity={onRenameControllerProfile}
            onEmptyTrash={onEmptyTrash}
            onOrganizationChange={onPersonalOrganizationChange}
          />
        )}
      </RailSectionScroller>
    </>
  )
}
