import { Plus } from 'lucide-react'
import type { RefObject } from 'react'
import type { EditingLibrary, LibraryRecord } from '@/store/libraryStore'
import {
  EditableListItem,
  HeaderAction,
  RailEmptyState,
  RailEntityHeader,
  RailSectionScroller,
  StockListItem,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'

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
  onDeleteLibrary,
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
  onDeleteLibrary: (id: string) => void
  validateLibraryName: (name: string, currentId?: string) => string | null
  onCollapse?: () => void
}) {
  return (
    <>
      <RailEntityHeader
        title="Libraries"
        onCollapse={onCollapse}
        action={personalWorkspaceAuthenticated
          ? <HeaderAction icon={<Plus size={14} />} title="New library" onClick={onCreateLibrary} />
          : null}
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
        ) : userLibraries.length === 0 ? (
          <RailEmptyState>
            No cloud libraries yet
          </RailEmptyState>
        ) : (
          <>
            <StockSectionHeader label="Cloud Libraries" open onToggle={() => {}} />
            <ul className="pt-2">
              {userLibraries.map((library) => (
                <EditableListItem
                  key={library.id}
                  name={library.name}
                  noun="library"
                  active={editingLibrary?.kind === 'existing' && editingLibrary.id === library.id}
                  takenNames={[]}
                  validateName={(name) => validateLibraryName(name, library.id)}
                  onSelect={() => onOpenUserLibrary(library)}
                  onRename={(name) => onRenameLibrary(library.id, name)}
                  onDelete={() => onDeleteLibrary(library.id)}
                  deleteTitle="Delete library namespace?"
                  deleteDescription={`"${library.name}" will be permanently deleted. Patterns that reference this namespace will fail compile with an unknown-namespace error until you update them.`}
                />
              ))}
            </ul>
          </>
        )}
        <StockSectionHeader
          label="Stock Libraries"
          open={showStockLibraries}
          onToggle={onToggleStockLibraries}
        />
        {showStockLibraries && (
          <ul className="pt-2">
            {libraryNames.map((name) => (
              <StockListItem
                key={name}
                name={name}
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
