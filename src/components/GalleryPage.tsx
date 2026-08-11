import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Images, Search, X } from 'lucide-react'
import { inlineIcon } from '@/components/iconScale'
import {
  GALLERY_ALL_CATEGORY,
  GALLERY_CATEGORIES,
  GALLERY_DIRECTORIES,
  GALLERY_PATTERNS,
  filterGalleryPatterns,
  type GalleryDirectory,
  type GalleryPattern,
} from '@/engine/galleryCatalog'
import type { DimLens } from '@/engine/dimLens'
import { useRouterStore } from '@/store/routerStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { GalleryLivePreview } from './GalleryLivePreview'

const DIM_OPTIONS: { label: string; value: DimLens }[] = [
  { label: 'All', value: 'all' },
  { label: '1D', value: 1 },
  { label: '2D', value: 2 },
  { label: '3D', value: 3 },
]

export function galleryAnchorId(slug: string): string {
  return `gallery-${slug}`
}

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
  const anchorId = galleryAnchorId(pattern.slug)

  return (
    <button
      id={anchorId}
      type="button"
      onClick={() => {
        const galleryUrl = `${window.location.pathname}${window.location.search}#${anchorId}`
        window.history.replaceState(window.history.state, '', galleryUrl)
        navigate(
          { kind: 'pattern-detail', slug: pattern.slug },
          { historyState: { galleryReturnPath: galleryUrl } },
        )
      }}
      onFocus={() => setAttended(true)}
      onBlur={() => setAttended(false)}
      onMouseEnter={() => setAttended(true)}
      onMouseLeave={() => setAttended(false)}
      className="group min-w-0 text-left focus-visible:outline-none"
    >
      <div className="relative aspect-square overflow-hidden rounded-[4px] bg-black transition-shadow group-hover:ring-1 group-hover:ring-live/60 group-focus-visible:ring-2 group-focus-visible:ring-live/70">
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
      <div className="flex min-w-0 items-baseline gap-2 px-px pt-2 font-mono">
          <span className="min-w-0 truncate text-[12.5px] text-zinc-100">{pattern.name}</span>
          <span
            data-pattern-dimension
            className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-structural"
          >
            {pattern.dim}D
          </span>
        <span className="ml-auto flex min-w-0 shrink gap-[5px] text-[9.5px] tracking-wide text-structural">
          {(pattern.sections.length ? pattern.sections : [GALLERY_ALL_CATEGORY]).slice(0, 2).map((section, i) => (
            <span key={section} className="inline-flex gap-[5px]">
              {i > 0 && <span aria-hidden>·</span>}
              <span className="truncate">{section.toLowerCase()}</span>
            </span>
          ))}
        </span>
      </div>
    </button>
  )
}

export function GalleryPage({ directory }: { directory?: GalleryDirectory }) {
  const [lens, setLens] = useState<DimLens>('all')
  const [query, setQuery] = useState('')
  const navigate = useRouterStore((state) => state.navigate)
  const personalWorkspaceAuthenticated = useWorkspaceStore((state) => state.personalWorkspaceAuthenticated)
  const personalWorkspaceResolved = useWorkspaceStore((state) => state.personalWorkspaceResolved)
  const category = directory?.label ?? GALLERY_ALL_CATEGORY

  const patterns = useMemo(
    () => filterGalleryPatterns(GALLERY_PATTERNS, { lens, category, query }),
    [lens, category, query],
  )

  useEffect(() => {
    const anchorId = decodeURIComponent(window.location.hash.slice(1))
    if (!anchorId.startsWith('gallery-')) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <main className="flex-1 overflow-auto bg-zinc-950" data-testid="gallery-page">
      <div className="mx-auto max-w-[1180px] px-4 pt-[14px] sm:px-[22px]">
        {personalWorkspaceResolved && !personalWorkspaceAuthenticated && (
          <div
            data-testid="studio-coming-soon-banner"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          >
            <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-live">
              Studio opens soon
            </span>
            <p className="text-[12.5px] leading-5 text-zinc-500">
              Everything in the Gallery works without an account; Studio sign-in is invite-only while we
              finish the last pieces.
            </p>
          </div>
        )}
      </div>
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-5 gap-y-2 px-4 pb-2 pt-[18px] sm:px-[22px]">
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
        <label className="relative flex w-full min-w-0 items-center rounded-none border-b border-zinc-800 bg-transparent font-mono text-[11.5px] text-zinc-300 transition-colors focus-within:border-live sm:w-auto sm:min-w-[120px]">
          <select
            value={category}
            onChange={(event) => {
              const selected = GALLERY_DIRECTORIES.find(
                (candidate) => candidate.label === event.target.value,
              )
              navigate(
                selected
                  ? { kind: 'gallery', directorySlug: selected.slug }
                  : { kind: 'gallery' },
              )
            }}
            aria-label="Directory filter"
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
        <label className="relative flex h-[27px] w-full min-w-0 max-w-none flex-1 items-center gap-2 rounded-none border-b border-zinc-800 bg-transparent pr-6 font-mono text-[11.5px] text-structural transition-colors focus-within:border-live sm:w-auto sm:min-w-[170px] sm:max-w-[230px] sm:flex-none">
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
              <X {...inlineIcon} aria-hidden />
            </button>
          )}
        </label>
      </div>

      {patterns.length > 0 ? (
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-x-4 gap-y-5 px-4 pb-[26px] pt-4 sm:px-[22px] md:grid-cols-2">
          {patterns.map((pattern, index) => (
            <GalleryCard key={pattern.name} pattern={pattern} index={index} />
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-[1180px] px-4 py-10 font-mono text-sm text-structural sm:px-[22px]">
          No patterns match those filters.
        </div>
      )}
    </main>
  )
}
