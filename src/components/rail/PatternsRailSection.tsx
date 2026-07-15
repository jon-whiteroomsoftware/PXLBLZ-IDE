import { FolderOpen, Plus } from 'lucide-react'
import type { RefObject } from 'react'
import { nativeDim, type DimLens } from '@/engine/dimLens'
import type { GalleryPattern } from '@/engine/galleryCatalog'
import type { PatternRecord } from '@/store/patternStore'
import {
  EditableListItem,
  HeaderAction,
  RailEntityHeader,
  RailFilterBar,
  RailSectionScroller,
  StockListItem,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'

export function PatternsRailSection({
  fileInputRef,
  importError,
  importNotice,
  personalWorkspaceAuthenticated,
  dimLens,
  query,
  activePatternId,
  activeDemoName,
  userPatterns,
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
  onDeletePattern,
  onRowRef,
  onRowKeyDown,
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
  userPatterns: PatternRecord[]
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
  onDeletePattern: (id: string) => void
  onRowRef: (key: string, el: HTMLLIElement | null) => void
  onRowKeyDown: (e: React.KeyboardEvent<HTMLLIElement>, key: string) => void
  onCollapse?: () => void
}) {
  return (
    <>
      <RailEntityHeader
        title="Patterns"
        onCollapse={onCollapse}
        action={personalWorkspaceAuthenticated ? (
          <>
            <HeaderAction
              icon={<FolderOpen size={14} />}
              title="Open pattern from .epe file"
              onClick={() => fileInputRef.current?.click()}
            />
            <HeaderAction icon={<Plus size={14} />} title="New pattern" onClick={onCreatePattern} />
          </>
        ) : null}
      >
        <RailFilterBar
          lens={dimLens}
          onLensChange={onLensChange}
          query={query}
          onQueryChange={onQueryChange}
        />
      </RailEntityHeader>
      <RailSectionScroller
        testId="pattern-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
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
          visibleUserPatterns.length === 0 ? (
            <p className="pl-3 pr-3 py-1 text-zinc-500 italic select-none">No patterns yet</p>
          ) : (
            <ul className="pt-2">
              {visibleUserPatterns.map((pattern) => (
                <EditableListItem
                  key={pattern.id}
                  name={pattern.name}
                  noun="pattern"
                  active={activePatternId === pattern.id}
                  dim={dimLens === 'all' ? `${nativeDim(pattern.src)}D` : undefined}
                  takenNames={userPatterns.filter((p) => p.id !== pattern.id).map((p) => p.name)}
                  navKey={`pattern:${pattern.id}`}
                  onSelect={() => onOpenUserPattern(pattern)}
                  onRename={(name) => onRenamePattern(pattern.id, name)}
                  onDelete={() => onDeletePattern(pattern.id)}
                  onRowRef={onRowRef}
                  onRowKeyDown={onRowKeyDown}
                />
              ))}
            </ul>
          )
        ) : (
          <p className="pl-3 pr-3 py-2 text-zinc-500 italic select-none">
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save patterns
          </p>
        )}
        <StockSectionHeader
          label="Built-in Patterns"
          open={showStockPatterns}
          onToggle={onToggleStockPatterns}
        />
        {showStockPatterns && (
          visibleStockPatterns.length === 0 ? (
            <p className="pl-3 pr-3 py-1 text-zinc-500 italic select-none">No built-in patterns match</p>
          ) : (
            <ul className="pt-2 opacity-85">
              {visibleStockPatterns.map((pattern) => (
                <StockListItem
                  key={pattern.name}
                  name={pattern.name}
                  active={activeDemoName === pattern.name}
                  meta={dimLens === 'all' ? `${pattern.dim}D` : undefined}
                  onSelect={() => onOpenStockPattern(pattern.name)}
                />
              ))}
            </ul>
          )
        )}
      </RailSectionScroller>
    </>
  )
}
