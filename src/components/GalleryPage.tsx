import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Columns2, Columns3, Columns4, Images, Search, X } from 'lucide-react'
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
import {
  GALLERY_DENSITY_OPTIONS,
  readGalleryDensity,
  writeGalleryDensity,
  type GalleryDensity,
} from '@/engine/galleryDensity'
import { useRouterStore } from '@/store/routerStore'
import { GalleryLivePreview } from './GalleryLivePreview'

const DIM_OPTIONS: { label: string; value: DimLens }[] = [
  { label: 'Any dimension', value: 'all' },
  { label: '1D', value: 1 },
  { label: '2D', value: 2 },
  { label: '3D', value: 3 },
]

export function galleryAnchorId(slug: string): string {
  return `gallery-${slug}`
}

const DENSITY_PRESENTATION: Record<GalleryDensity, { label: string; Icon: typeof Columns2; grid: string }> = {
  2: { label: 'Large cards, 2 per row', Icon: Columns2, grid: 'md:grid-cols-2 gap-x-6 gap-y-[30px]' },
  3: { label: 'Medium cards, 3 per row', Icon: Columns3, grid: 'md:grid-cols-3 gap-x-[18px] gap-y-6' },
  4: { label: 'Small cards, 4 per row', Icon: Columns4, grid: 'md:grid-cols-4 gap-x-[18px] gap-y-[18px]' },
}

function DensityPicker({ density, onChange }: { density: GalleryDensity; onChange: (d: GalleryDensity) => void }) {
  return (
    <div role="radiogroup" aria-label="Card density" className="hidden overflow-hidden rounded-full border border-seam bg-panel md:flex">
      {GALLERY_DENSITY_OPTIONS.map((option) => {
        const { label, Icon } = DENSITY_PRESENTATION[option]
        const active = density === option
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(option)}
            className={[
              'grid h-[25px] w-[30px] place-items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-live/70',
              active ? 'bg-live/15 text-live' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
            ].join(' ')}
          >
            <Icon size={13} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

function GalleryCard({ pattern, index }: { pattern: GalleryPattern; index: number }) {
  const navigate = useRouterStore((s) => s.navigate)
  const anchorId = galleryAnchorId(pattern.slug)
  // 1D Patterns render as two-column strips that take the row's height: a
  // strip in a square wastes most of the box.
  const strip = pattern.dim === 1

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
      data-gallery-strip={strip || undefined}
      className={[
        'group relative min-w-0 overflow-hidden rounded-[4px] bg-black text-left transition-shadow hover:ring-1 hover:ring-live/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/70',
        strip ? 'min-h-[96px] md:col-span-2' : 'aspect-square',
      ].join(' ')}
    >
      <GalleryLivePreview name={pattern.name} src={pattern.src} index={index} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-[9px] pb-[7px] pt-7 font-mono">
        <div className="flex min-w-0 items-baseline gap-[6px]">
          <span className="min-w-0 truncate text-[11.5px] text-zinc-100">{pattern.name}</span>
          <span
            data-pattern-dimension
            className="shrink-0 text-[9.5px] uppercase tracking-[0.08em] text-zinc-400"
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
      </div>
    </button>
  )
}

export function GalleryPage({ directory }: { directory?: GalleryDirectory }) {
  const [lens, setLens] = useState<DimLens>('all')
  const [query, setQuery] = useState('')
  const [density, setDensity] = useState<GalleryDensity>(() =>
    readGalleryDensity(typeof localStorage === 'undefined' ? null : localStorage),
  )
  const navigate = useRouterStore((state) => state.navigate)
  const changeDensity = (next: GalleryDensity) => {
    setDensity(next)
    writeGalleryDensity(typeof localStorage === 'undefined' ? null : localStorage, next)
  }
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
    <main className="flex-1 overflow-auto bg-zinc-950" data-testid="gallery-page" data-gallery-scrollport>
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-5 gap-y-2 px-4 pb-2 pt-[18px] sm:px-[22px]">
        <div className="mr-auto">
          <h1 className="flex items-center gap-2 font-mono text-[19px] font-semibold tracking-normal text-zinc-100">
            <Images size={18} aria-hidden className="text-live" />
            Pattern Gallery
          </h1>
        </div>
        <label className="relative flex w-full min-w-0 items-center rounded-none border-b border-zinc-800 bg-transparent font-mono text-[11.5px] text-zinc-300 transition-colors focus-within:border-live sm:w-auto sm:min-w-[120px]">
          <select
            value={String(lens)}
            onChange={(event) => {
              const selected = DIM_OPTIONS.find((option) => String(option.value) === event.target.value)
              setLens(selected?.value ?? 'all')
            }}
            aria-label="Dimension filter"
            className="w-full appearance-none bg-transparent py-1 pl-2.5 pr-8 outline-none"
          >
            {DIM_OPTIONS.map((option) => (
              <option key={String(option.value)} value={String(option.value)} className="bg-zinc-950 text-zinc-200">
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            aria-hidden
            className="pointer-events-none absolute right-2 text-structural"
          />
        </label>
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
        <DensityPicker density={density} onChange={changeDensity} />
      </div>

      {patterns.length > 0 ? (
        <div
          data-testid="gallery-grid"
          data-density={density}
          className={`mx-auto grid max-w-[1180px] grid-flow-dense grid-cols-1 gap-x-4 gap-y-5 px-4 pb-[26px] pt-4 sm:px-[22px] ${DENSITY_PRESENTATION[density].grid}`}
        >
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
