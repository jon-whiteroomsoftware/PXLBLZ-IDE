import { useRef, type RefObject } from 'react'
import type { EntityOrganizationV1 } from '@/engine/entityOrganization'
import type { EditingLibrary, LibraryRecord } from '@/store/libraryStore'
import {
  HeaderMenu,
  RailEmptyState,
  RailEntityHeader,
  RailSectionScroller,
  StockListItem,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'
import { EntityOrganizationTree, type EntityOrganizationTreeHandle } from '@/components/rail/EntityOrganizationTree'

export function LibrariesRailSection({
  personalWorkspaceAuthenticated,
  userLibraries,
  editingLibrary,
  activeLibraryName,
  libraryNames,
  showStockLibraries,
  scrollRef,
  scrollMetrics,
  onScroll,
  onCreateLibrary,
  onToggleStockLibraries,
  onOpenUserLibrary,
  onOpenStockLibrary,
  onRenameLibrary,
  personalOrganization,
  onPersonalOrganizationChange,
  onEmptyTrash,
  validateLibraryName,
  onCollapse,
}: {
  personalWorkspaceAuthenticated: boolean
  userLibraries: LibraryRecord[]
  editingLibrary: EditingLibrary
  activeLibraryName: string | null
  libraryNames: string[]
  showStockLibraries: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  scrollMetrics: ScrollMetrics
  onScroll: () => void
  onCreateLibrary: () => void
  onToggleStockLibraries: () => void
  onOpenUserLibrary: (library: LibraryRecord) => void
  onOpenStockLibrary: (name: string) => void
  onRenameLibrary: (id: string, name: string) => void
  personalOrganization: EntityOrganizationV1
  onPersonalOrganizationChange: (organization: EntityOrganizationV1) => void
  onEmptyTrash: (entityIds: string[]) => void | boolean | Promise<void | boolean>
  validateLibraryName: (name: string, currentId?: string) => string | null
  onCollapse?: () => void
}) {
  const personalTreeRef = useRef<EntityOrganizationTreeHandle>(null)
  return (
    <>
      <RailEntityHeader
        title="Libraries"
        onCollapse={onCollapse}
        action={personalWorkspaceAuthenticated ? (
          <HeaderMenu
            title="Add library"
            items={[
              { label: 'New library', onSelect: onCreateLibrary },
              { label: 'New folder', onSelect: () => personalTreeRef.current?.createFolder() },
            ]}
          />
        ) : null}
      />
      <RailSectionScroller
        testId="library-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
      >
        {!personalWorkspaceAuthenticated ? (
          <RailEmptyState roomy>
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save libraries
          </RailEmptyState>
        ) : (
          <EntityOrganizationTree
            ref={personalTreeRef}
            organization={personalOrganization}
            items={userLibraries.map((library) => ({ id: library.id, name: library.name }))}
            activeEntityId={editingLibrary?.kind === 'existing' ? editingLibrary.id : null}
            query=""
            noun="library"
            sectionLabel="Libraries"
            emptyMessage="No libraries yet"
            onSelect={(id) => {
              const library = userLibraries.find((candidate) => candidate.id === id)
              if (library) onOpenUserLibrary(library)
            }}
            onRenameEntity={(id, name) => {
              if (!validateLibraryName(name, id)) onRenameLibrary(id, name)
            }}
            onEmptyTrash={onEmptyTrash}
            onOrganizationChange={onPersonalOrganizationChange}
          />
        )}
        <StockSectionHeader
          label="Built-in Libraries"
          open={showStockLibraries}
          onToggle={onToggleStockLibraries}
        />
        {showStockLibraries && (
          <ul className="pt-2">
            {libraryNames.map((name) => (
              <StockListItem
                key={name}
                name={name}
                noun="library"
                active={activeLibraryName === name}
                onSelect={() => onOpenStockLibrary(name)}
              />
            ))}
          </ul>
        )}
      </RailSectionScroller>
    </>
  )
}
