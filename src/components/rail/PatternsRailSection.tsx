import { useRef, useState, type RefObject } from 'react'
import type { DimLens } from '@/engine/dimLens'
import type { GalleryPattern } from '@/engine/galleryCatalog'
import { stockPatternOrganization } from '@/engine/stockEntityOrganization'
import type { EntityOrganizationV1 } from '@/engine/entityOrganization'
import type { PatternRecord } from '@/store/patternStore'
import { FolderOpen } from 'lucide-react'
import {
  HeaderAction,
  HeaderMenu,
  RailEmptyState,
  RailEntityHeader,
  RailFilterBar,
  RailSectionScroller,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'
import { EntityOrganizationTree, type EntityOrganizationTreeHandle } from '@/components/rail/EntityOrganizationTree'

export function PatternsRailSection({
  fileInputRef,
  importError,
  importNotice,
  personalWorkspaceAuthenticated,
  dimLens,
  query,
  activePatternId,
  activeDemoName,
  visibleUserPatterns,
  visibleStockPatterns,
  showStockPatterns,
  scrollRef,
  scrollMetrics,
  onScroll,
  onLensChange,
  onQueryChange,
  onCreatePattern,
  onToggleStockPatterns,
  onOpenUserPattern,
  onOpenStockPattern,
  onRenamePattern,
  onEmptyTrash,
  personalOrganization,
  onPersonalOrganizationChange,
  onCollapse,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>
  importError: string | null
  importNotice: string | null
  personalWorkspaceAuthenticated: boolean
  dimLens: DimLens
  query: string
  activePatternId: string | null
  activeDemoName: string | null
  visibleUserPatterns: PatternRecord[]
  visibleStockPatterns: GalleryPattern[]
  showStockPatterns: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  scrollMetrics: ScrollMetrics
  onScroll: () => void
  onLensChange: (lens: DimLens) => void
  onQueryChange: (query: string) => void
  onCreatePattern: () => void
  onToggleStockPatterns: () => void
  onOpenUserPattern: (pattern: PatternRecord) => void
  onOpenStockPattern: (name: string) => void
  onRenamePattern: (id: string, name: string) => void
  onEmptyTrash: (entityIds: string[]) => void | Promise<void>
  personalOrganization: EntityOrganizationV1
  onPersonalOrganizationChange: (organization: EntityOrganizationV1) => void
  onCollapse?: () => void
}) {
  const [builtInOrganization, setBuiltInOrganization] = useState(() => stockPatternOrganization(visibleStockPatterns))
  const personalTreeRef = useRef<EntityOrganizationTreeHandle>(null)
  return (
    <>
      <RailEntityHeader
        title="Patterns"
        onCollapse={onCollapse}
        action={(
          <>
            <RailFilterBar
              lens={dimLens}
              onLensChange={onLensChange}
              query={query}
              onQueryChange={onQueryChange}
            />
            {personalWorkspaceAuthenticated && (
              <>
                <HeaderAction
                  icon={<FolderOpen size={14} aria-hidden />}
                  title="Open pattern from .epe file"
                  onClick={() => fileInputRef.current?.click()}
                />
                <HeaderMenu
                  title="Add pattern"
                  items={[
                    { label: 'New pattern', onSelect: onCreatePattern },
                    { label: 'New folder', onSelect: () => personalTreeRef.current?.createFolder() },
                  ]}
                />
              </>
            )}
          </>
        )}
      />
      <RailSectionScroller
        testId="pattern-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
        allowHorizontalScroll
      >
        {importError && (
          <p className="pl-3 pr-3 py-1 text-red-400 truncate" title={importError}>{importError}</p>
        )}
        {importNotice && (
          <p role="status" className="border-l-2 border-amber-500/60 py-1 pl-2 pr-3 text-[10px] leading-4 text-amber-200/85" title={importNotice}>
            {importNotice}
          </p>
        )}
        {personalWorkspaceAuthenticated ? (
          <EntityOrganizationTree
              ref={personalTreeRef}
              organization={personalOrganization}
              items={visibleUserPatterns.map((pattern) => ({ id: pattern.id, name: pattern.name }))}
              activeEntityId={activePatternId}
              query={query}
              noun="pattern"
              allowHorizontalOverflow
              sectionLabel="Patterns"
              emptyMessage="No patterns yet"
              onSelect={(id) => {
                const pattern = visibleUserPatterns.find((candidate) => candidate.id === id)
                if (pattern) onOpenUserPattern(pattern)
              }}
              onRenameEntity={onRenamePattern}
              onEmptyTrash={onEmptyTrash}
              onOrganizationChange={onPersonalOrganizationChange}
          />
        ) : (
          <RailEmptyState roomy>
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save patterns
          </RailEmptyState>
        )}
        <StockSectionHeader
          label="Built-in Patterns"
          open={showStockPatterns}
          onToggle={onToggleStockPatterns}
        />
        {showStockPatterns && (
          visibleStockPatterns.length === 0 ? (
            <RailEmptyState>No built-in patterns match</RailEmptyState>
          ) : (
            <EntityOrganizationTree
              organization={builtInOrganization}
              items={visibleStockPatterns.map((pattern) => ({ id: pattern.name, name: pattern.name }))}
              activeEntityId={activeDemoName}
              query={query}
              noun="pattern"
              allowHorizontalOverflow
              editable={false}
              sectionLabel="Built-in Patterns"
              onSelect={onOpenStockPattern}
              onRenameEntity={() => undefined}
              onOrganizationChange={setBuiltInOrganization}
            />
          )
        )}
      </RailSectionScroller>
    </>
  )
}
