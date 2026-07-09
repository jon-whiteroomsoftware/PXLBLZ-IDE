import type { RefObject } from 'react'
import {
  RailEntityHeader,
  RailSectionScroller,
  StockListItem,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'

export function LibrariesRailSection({
  activeLibraryName,
  libraryNames,
  showStockLibraries,
  scrollRef,
  scrollMetrics,
  onScroll,
  onToggleStockLibraries,
  onOpenStockLibrary,
}: {
  activeLibraryName: string | null
  libraryNames: string[]
  showStockLibraries: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  scrollMetrics: ScrollMetrics
  onScroll: () => void
  onToggleStockLibraries: () => void
  onOpenStockLibrary: (name: string) => void
}) {
  return (
    <>
      <RailEntityHeader title="Libraries" />
      <RailSectionScroller
        testId="library-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
      >
        <p className="pl-3 pr-3 py-1 text-zinc-600 italic select-none">
          No cloud libraries yet
        </p>
        <StockSectionHeader
          label="Stock Libraries"
          open={showStockLibraries}
          onToggle={onToggleStockLibraries}
        />
        {showStockLibraries && (
          <ul className="pt-2 opacity-85">
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
