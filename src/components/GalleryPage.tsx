import { useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Images, Search, X } from 'lucide-react'
import {
  GALLERY_ALL_CATEGORY,
  GALLERY_CATEGORIES,
  GALLERY_PATTERNS,
  filterGalleryPatterns,
  type GalleryPattern,
} from '@/engine/galleryCatalog'
import type { DimLens } from '@/engine/dimLens'
import { useRouterStore } from '@/store/routerStore'
import { GalleryLivePreview } from './GalleryLivePreview'

const DIM_OPTIONS: { label: string; value: DimLens }[] = [
  { label: 'All', value: 'all' },
  { label: '1D', value: 1 },
  { label: '2D', value: 2 },
  { label: '3D', value: 3 },
]

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        'rounded-full border px-[9px] py-[3px] font-mono text-[11px] transition-colors',
        active
          ? 'border-live/40 bg-live/15 text-live'
          : 'border-seam bg-panel text-zinc-400 hover:border-zinc-600 hover:text-zinc-200',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function GalleryCard({ pattern, index }: { pattern: GalleryPattern; index: number }) {
  const navigate = useRouterStore((s) => s.navigate)
  const [attended, setAttended] = useState(false)

  return (
    <button
      type="button"
      onClick={() => navigate({ kind: 'pattern-detail', slug: pattern.slug })}
      onFocus={() => setAttended(true)}
      onBlur={() => setAttended(false)}
      onMouseEnter={() => setAttended(true)}
      onMouseLeave={() => setAttended(false)}
      className="group overflow-hidden rounded-lg border border-seam bg-panel text-left transition-colors hover:border-structural focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/70"
    >
      <div className="relative aspect-[16/10] bg-black">
        <GalleryLivePreview
          name={pattern.name}
          src={pattern.src}
          dimmed={false}
          index={index}
          priority={attended}
        />
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded border border-live/35 bg-zinc-950/75 px-2 py-1 font-mono text-[10.5px] text-live opacity-0 shadow-[0_0_18px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          View pattern
          <ArrowRight size={12} aria-hidden />
        </span>
      </div>
      <div className="px-[11px] pb-[10px] pt-2">
        <div className="flex min-w-0 items-center gap-[7px] font-mono text-[12.5px] text-zinc-100">
          <span className="truncate">{pattern.name}</span>
          <span className="shrink-0 rounded border border-zinc-700 px-1.5 py-px text-[10px] uppercase tracking-wide text-structural">
            {pattern.dim}D
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-[5px] font-mono text-[9.5px] tracking-wide text-structural">
          {(pattern.sections.length ? pattern.sections : [GALLERY_ALL_CATEGORY]).slice(0, 2).map((section, i) => (
            <span key={section} className="inline-flex gap-[5px]">
              {i > 0 && <span aria-hidden>·</span>}
              <span>{section.toLowerCase()}</span>
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}

export function GalleryPage() {
  const [lens, setLens] = useState<DimLens>('all')
  const [category, setCategory] = useState(GALLERY_ALL_CATEGORY)
  const [query, setQuery] = useState('')

  const patterns = useMemo(
    () => filterGalleryPatterns(GALLERY_PATTERNS, { lens, category, query }),
    [lens, category, query],
  )

  return (
    <main className="flex-1 overflow-auto bg-zinc-950" data-testid="gallery-page">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-5 gap-y-2 px-[22px] pb-2 pt-[18px]">
        <div className="mr-auto">
          <h1 className="flex items-center gap-2 font-mono text-[19px] font-semibold tracking-normal text-zinc-100">
            <Images size={18} aria-hidden className="text-live" />
            Pattern Gallery
          </h1>
        </div>
        <div role="radiogroup" aria-label="Dimension filter" className="flex flex-wrap gap-1.5">
          {DIM_OPTIONS.map((option) => (
            <FilterChip
              key={String(option.value)}
              active={lens === option.value}
              onClick={() => setLens(option.value)}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>
        <label className="relative flex min-w-[190px] items-center rounded-md border border-seam bg-zinc-950 font-mono text-[11.5px] text-zinc-300 focus-within:border-zinc-600">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category filter"
            className="w-full appearance-none bg-transparent py-1 pl-2.5 pr-8 outline-none"
          >
            {GALLERY_CATEGORIES.map((option) => (
              <option key={option} value={option} className="bg-zinc-950 text-zinc-200">
                {option}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            aria-hidden
            className="pointer-events-none absolute right-2 text-structural"
          />
        </label>
        <label className="relative flex h-[27px] min-w-[170px] max-w-[230px] flex-1 items-center gap-2 rounded-md border border-seam bg-zinc-950 px-2.5 pr-6 font-mono text-[11.5px] text-structural focus-within:border-zinc-600 sm:flex-none">
          <Search size={13} aria-hidden className="shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search patterns..."
            aria-label="Search patterns"
            className="min-w-0 flex-1 bg-transparent text-zinc-300 outline-none placeholder:text-structural"
          />
          {query.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setQuery('')}
              className="absolute right-1 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded text-structural transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/70"
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </label>
      </div>

      {patterns.length > 0 ? (
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-4 px-[22px] pb-[26px] pt-4 md:grid-cols-2">
          {patterns.map((pattern, index) => (
            <GalleryCard key={pattern.name} pattern={pattern} index={index} />
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-[1180px] px-[22px] py-10 font-mono text-sm text-structural">
          No patterns match those filters.
        </div>
      )}
    </main>
  )
}
