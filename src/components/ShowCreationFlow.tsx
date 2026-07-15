import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, MapPinned, Waves } from 'lucide-react'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
  MAX_PORTABLE_PREVIEW_PIXELS,
  resolveShowOutputMapSelection,
} from '@/engine/showOutputContract'
import type { ShowOutputContract } from '@/engine/personalContentRecords'

export interface ShowCreationMapOption {
  id: string
  name: string
  dim: 1 | 2 | 3
  source: 'stock' | 'user'
  fixedPixelCount?: number
}

export function ShowCreationFlow({
  maps,
  onCreate,
  onCancel,
}: {
  maps: ShowCreationMapOption[]
  onCreate: (input: { name: string; outputContract: ShowOutputContract }) => void | Promise<void>
  onCancel: () => void
}) {
  const [kind, setKind] = useState<ShowOutputContract['kind'] | null>(null)
  const [name, setName] = useState('Untitled Show')
  const [pixelCountText, setPixelCountText] = useState('256')
  const eligibleMaps = useMemo(
    () => kind === 'portable-2d' ? maps.filter((map) => map.dim === 2) : maps,
    [kind, maps],
  )
  const [mapId, setMapId] = useState<string | null>(maps.find((map) => map.dim === 2)?.id ?? maps[0]?.id ?? null)
  const requestedPixelCount = Number(pixelCountText) || 1
  const selection = resolveShowOutputMapSelection(mapId, requestedPixelCount, maps)

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target
      if (target instanceof Element && target.closest('input, select, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  function choose(nextKind: ShowOutputContract['kind']) {
    const nextMaps = nextKind === 'portable-2d' ? maps.filter((map) => map.dim === 2) : maps
    setKind(nextKind)
    setMapId(nextMaps[0]?.id ?? null)
    setPixelCountText('256')
  }

  function selectMap(nextMapId: string) {
    const next = resolveShowOutputMapSelection(nextMapId || null, requestedPixelCount, maps)
    setMapId(next.mapId)
    setPixelCountText(String(next.pixelCount))
  }

  function updatePixelCount(nextValue: string) {
    if (kind !== 'portable-2d' || nextValue === '') {
      setPixelCountText(nextValue)
      return
    }
    const numericValue = Number(nextValue)
    setPixelCountText(Number.isFinite(numericValue) && numericValue > MAX_PORTABLE_PREVIEW_PIXELS
      ? String(MAX_PORTABLE_PREVIEW_PIXELS)
      : nextValue)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!kind) return
    const outputContract = kind === 'portable-2d'
      ? createPortableShowOutputContract({
          referenceMapId: selection.mapId,
          referencePixelCount: selection.pixelCount,
        })
      : createInstallationShowOutputContract({
          outputMapId: selection.mapId,
          pixelCount: selection.pixelCount,
        })
    void onCreate({ name: name.trim() || 'Untitled Show', outputContract })
  }

  if (kind) {
    const portable = kind === 'portable-2d'
    return (
      <div className="scrollbar-hidden h-full overflow-auto bg-zinc-950/75 p-4 font-mono text-zinc-300 sm:p-6">
        <form onSubmit={submit} className="mx-auto max-w-3xl rounded-lg border border-zinc-800 bg-zinc-950/80 shadow-2xl shadow-black/30">
          <header className="border-b border-zinc-800 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => setKind(null)}
              className="mb-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500 hover:text-live"
            >
              <ArrowLeft size={12} aria-hidden /> Compare contracts
            </button>
            <h1 className="text-lg font-semibold text-zinc-100">
              Set up the {portable ? 'reference output' : 'installation'}
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
              {portable
                ? 'This map and count shape the authoring preview. The Show remains LED-resolution independent across compatible 2D mapped surfaces.'
                : 'This count and map are the physical output promise. The initial main zone receives the entire output.'}
            </p>
          </header>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
            <label className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 sm:col-span-2">
              Show name
              <input
                autoFocus
                aria-label="Show name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 block h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-sm normal-case tracking-normal text-zinc-100 outline-none focus:border-live/70"
              />
            </label>
            <label className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              {portable ? 'Preview pixels' : 'Pixels'}
              <input
                aria-label={portable ? 'Preview pixels' : 'Pixels'}
                type="number"
                min={1}
                max={portable ? MAX_PORTABLE_PREVIEW_PIXELS : 65536}
                disabled={selection.pixelCountLocked}
                value={selection.pixelCountLocked ? selection.pixelCount : pixelCountText}
                onChange={(event) => updatePixelCount(event.target.value)}
                className="mt-1 block h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-sm normal-case tracking-normal text-zinc-100 outline-none focus:border-live/70 disabled:cursor-not-allowed disabled:text-zinc-500"
              />
              {selection.pixelCountLocked && (
                <span className="mt-1 block normal-case tracking-normal text-zinc-600">Measured by the fixed map.</span>
              )}
            </label>
            <label className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              {portable ? 'Reference map' : 'Output map'}
              <select
                aria-label={portable ? 'Reference map' : 'Output map'}
                value={mapId ?? ''}
                onChange={(event) => selectMap(event.target.value)}
                className="mt-1 block h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-xs normal-case tracking-normal text-zinc-100 outline-none focus:border-live/70"
              >
                {eligibleMaps.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.name} · {map.fixedPixelCount !== undefined
                      ? `Fixed size · ${map.fixedPixelCount.toLocaleString()} px`
                      : 'Preview size'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3 sm:px-6">
            <button type="button" onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-200">Cancel</button>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-5 rounded border border-live/40 bg-live/10 px-4 text-xs font-semibold text-live hover:bg-live/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/50"
            >
              Create Show <ArrowRight size={14} aria-hidden />
            </button>
          </footer>
        </form>
      </div>
    )
  }

  return (
    <div className="scrollbar-hidden h-full overflow-auto bg-zinc-950/75 p-3 font-mono text-zinc-300 sm:p-5">
      <section aria-labelledby="show-contract-title" className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/85 shadow-2xl shadow-black/30">
        <header className="border-b border-zinc-800 px-4 py-4 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-live">New Show</p>
              <h1 id="show-contract-title" className="mt-1 text-lg font-semibold text-zinc-100">Choose how this Show will run</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
                Choose whether this Show can move between compatible 2D maps or stays tied to one exact installation. This cannot be changed later.
              </p>
            </div>
            <button type="button" onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-200">Cancel</button>
          </div>
        </header>
        <div className="grid md:grid-cols-2">
          <ShowContractChoiceColumn
            icon={<Waves size={18} aria-hidden />}
            title="Portable Show"
            kicker="Resolution-independent 2D"
            promise="LED-resolution independent"
            description="Compose once, then run the Show on compatible 2D maps with different LED counts."
            diagram="field"
            includes={[
              '32×32, 128×12, or another compatible output',
              'Divide by position: left/right, top/bottom, or a 2×2 grid',
              'Choose one map and pixel count for the authoring preview',
            ]}
            limits={['Cannot target specific LED numbers', 'Cannot select physical LED clusters', '2D mapped surfaces only for now']}
            action="Create Portable Show"
            actionLabel="Create"
            onChoose={() => choose('portable-2d')}
          />
          <ShowContractChoiceColumn
            icon={<MapPinned size={18} aria-hidden />}
            title="Installation Show"
            kicker="Exact physical output"
            promise="Exact pixel and map identity"
            description="Lock the Show to one pixel count and map, then route Patterns to exact LED groups."
            diagram="indexed"
            includes={[
              'One fixed pixel count and output map',
              'Zones made from exact LED numbers or ranges',
              'Warnings when the Controller count or map does not match',
            ]}
            limits={['Built for one installation', 'Changing output requires a new Show', "Sending never changes the Controller's map"]}
            action="Create Installation Show"
            actionLabel="Create"
            onChoose={() => choose('installation')}
          />
        </div>
      </section>
    </div>
  )
}

export function ShowContractChoiceColumn({
  icon,
  title,
  kicker,
  promise,
  description,
  diagram,
  includes,
  limits,
  action,
  actionLabel = action,
  onChoose,
}: {
  icon: React.ReactNode
  title: string
  kicker: string
  promise: string
  description: string
  diagram: 'field' | 'indexed'
  includes: string[]
  limits: string[]
  action: string
  actionLabel?: string
  onChoose: () => void
}) {
  return (
    <article className="flex flex-col border-zinc-800 p-4 first:border-b md:first:border-b-0 md:first:border-r">
      <header className="flex min-h-10 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-live">{icon}<h2 className="text-base font-semibold text-zinc-100">{title}</h2></div>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">{kicker}</p>
        </div>
        <button
          type="button"
          aria-label={action}
          onClick={onChoose}
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded border border-live/35 bg-live/10 px-3 text-[11px] font-semibold text-live hover:bg-live/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/50"
        >
          {actionLabel} <ArrowRight size={13} aria-hidden />
        </button>
      </header>
      <OutputDiagram kind={diagram} />
      <h3 className="mt-3 text-sm font-semibold text-zinc-100">{promise}</h3>
      <p className="mt-1 min-h-10 text-xs leading-5 text-zinc-500">{description}</p>
      <ListBlock label="Includes" items={includes} accent />
      <ListBlock label="Limits" items={limits} />
    </article>
  )
}

function OutputDiagram({ kind }: { kind: 'field' | 'indexed' }) {
  const portableSquare = Array.from({ length: 16 })
  const portableWide = Array.from({ length: 18 })
  const portableRing = Array.from({ length: 10 })
  const installation = Array.from({ length: 30 })

  return (
    <figure className="relative mt-3 h-20 overflow-hidden rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
      {kind === 'field' ? (
        <svg role="img" aria-label="Portable Shows adapt from a square map to a wide map and a ring" viewBox="0 0 320 64" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
          {portableSquare.map((_, index) => (
            <circle key={`square-${index}`} cx={22 + (index % 4) * 8} cy={20 + Math.floor(index / 4) * 8} r="2.5" className={index % 5 === 0 || index === 6 || index === 9 ? 'fill-live' : 'fill-zinc-700'} />
          ))}
          <path d="M67 32h18m-5-5 5 5-5 5" className="fill-none stroke-zinc-600" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {portableWide.map((_, index) => (
            <circle key={`wide-${index}`} cx={105 + (index % 6) * 8} cy={24 + Math.floor(index / 6) * 8} r="2.5" className={index === 0 || index === 7 || index > 14 ? 'fill-live' : 'fill-zinc-700'} />
          ))}
          <path d="M166 32h18m-5-5 5 5-5 5" className="fill-none stroke-zinc-600" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="236" cy="32" r="22" className="fill-none stroke-zinc-700" strokeWidth="1.5" />
          {portableRing.map((_, index) => {
            const angle = index / 10 * Math.PI * 2
            return <circle key={`ring-${index}`} cx={236 + Math.cos(angle) * 17} cy={32 + Math.sin(angle) * 17} r="2.5" className={index < 4 ? 'fill-live' : 'fill-zinc-700'} />
          })}
        </svg>
      ) : (
        <svg role="img" aria-label="Installation Shows address exact LED groups by index" viewBox="0 0 320 64" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
          <rect x="62" y="7" width="196" height="50" rx="25" className="fill-none stroke-zinc-700" strokeWidth="1.5" />
          {installation.map((_, index) => (
            <circle
              key={`installation-${index}`}
              cx={91 + (index % 10) * 15.5}
              cy={24 + Math.floor(index / 10) * 8}
              r="3"
              className={index < 8 ? 'fill-sky-400' : index < 22 ? 'fill-live' : 'fill-violet-400'}
            />
          ))}
        </svg>
      )}
      <span className="absolute bottom-1.5 right-2 text-[8px] uppercase tracking-widest text-zinc-600">
        {kind === 'field' ? 'normalized position' : 'exact indexes'}
      </span>
    </figure>
  )
}

function ListBlock({ label, items, accent = false }: { label: string; items: string[]; accent?: boolean }) {
  return (
    <div className="mt-3">
      <p className={`text-[9px] uppercase tracking-[0.14em] ${accent ? 'text-live/80' : 'text-zinc-600'}`}>{label}</p>
      <ul className="mt-1 space-y-1 text-[11px] leading-4 text-zinc-400">
        {items.map((item) => <li key={item} className="flex gap-2"><span className="text-zinc-700">—</span><span>{item}</span></li>)}
      </ul>
    </div>
  )
}
