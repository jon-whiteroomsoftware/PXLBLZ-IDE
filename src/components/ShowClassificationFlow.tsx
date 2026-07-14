import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, MapPinned, Waves } from 'lucide-react'
import type { ShowOutputContract, ShowRecord } from '@/engine/personalContentRecords'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
  resolveShowOutputMapSelection,
} from '@/engine/showOutputContract'
import {
  ShowContractChoiceColumn,
  type ShowCreationMapOption,
} from './ShowCreationFlow'

export function ShowClassificationFlow({
  show,
  maps,
  modeledPixelCount,
  targetControllerName,
  reasons,
  onConfirm,
  onCancel,
}: {
  show: ShowRecord
  maps: ShowCreationMapOption[]
  modeledPixelCount: number
  targetControllerName: string | null
  reasons: string[]
  onConfirm: (outputContract: ShowOutputContract) => void | Promise<void>
  onCancel: () => void
}) {
  const [kind, setKind] = useState<ShowOutputContract['kind'] | null>(null)
  const [mapId, setMapId] = useState<string | null>(show.stageMapId ?? null)
  const [pixelCountText, setPixelCountText] = useState(String(modeledPixelCount))
  const eligibleMaps = useMemo(
    () => kind === 'portable-2d' ? maps.filter((map) => map.dim === 2) : maps,
    [kind, maps],
  )
  const requestedPixelCount = Number(pixelCountText) || 1
  const selection = resolveShowOutputMapSelection(mapId, requestedPixelCount, maps)
  const currentMap = maps.find((map) => map.id === show.stageMapId)
  const hasPhysicalRanges = show.routingLayouts.some((layout) => (
    layout.zones.some((zone) => zone.ranges.length > 0)
  ))
  const hasLogicalRouting = show.routingLayouts.some((layout) => Boolean(layout.logical))

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
    const currentEligible = nextMaps.some((map) => map.id === show.stageMapId)
    setKind(nextKind)
    setMapId(currentEligible ? show.stageMapId ?? null : nextMaps[0]?.id ?? null)
    setPixelCountText(String(modeledPixelCount))
  }

  function selectMap(nextMapId: string) {
    const next = resolveShowOutputMapSelection(nextMapId || null, requestedPixelCount, maps)
    setMapId(next.mapId)
    setPixelCountText(String(next.pixelCount))
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
    void onConfirm(outputContract)
  }

  if (kind) {
    const portable = kind === 'portable-2d'
    return (
      <div className="scrollbar-hidden h-full overflow-auto bg-zinc-950/75 p-4 font-mono text-zinc-300 sm:p-6">
        <form onSubmit={submit} className="mx-auto max-w-3xl rounded-lg border border-zinc-800 bg-zinc-950/80 shadow-2xl shadow-black/30">
          <header className="border-b border-zinc-800 px-4 py-4 sm:px-6">
            <button type="button" onClick={() => setKind(null)} className="mb-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500 hover:text-live">
              <ArrowLeft size={12} aria-hidden /> Compare contracts
            </button>
            <p className="text-[10px] uppercase tracking-[0.18em] text-amber-400">Legacy Show · {show.name}</p>
            <h1 className="mt-1 text-lg font-semibold text-zinc-100">
              Confirm the {portable ? 'Portable' : 'Installation'} contract
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
              These values start from the saved Stage and modeled count. Classification adds the output promise without changing the timeline.
            </p>
          </header>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
            <label className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              {portable ? 'Reference pixels' : 'Pixels'}
              <input
                aria-label={portable ? 'Reference pixels' : 'Pixels'}
                type="number"
                min={1}
                max={65536}
                disabled={selection.pixelCountLocked}
                value={selection.pixelCountLocked ? selection.pixelCount : pixelCountText}
                onChange={(event) => setPixelCountText(event.target.value)}
                className="mt-1 block h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-sm normal-case tracking-normal text-zinc-100 outline-none focus:border-live/70 disabled:cursor-not-allowed disabled:text-zinc-500"
              />
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
            <button type="submit" className="inline-flex h-9 items-center gap-4 rounded border border-live/40 bg-live/10 px-4 text-xs font-semibold text-live hover:bg-live/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/50">
              Confirm classification <ArrowRight size={14} aria-hidden />
            </button>
          </footer>
        </form>
      </div>
    )
  }

  return (
    <div className="scrollbar-hidden h-full overflow-auto bg-zinc-950/75 p-3 font-mono text-zinc-300 sm:p-5">
      <section aria-labelledby="show-classification-title" className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/85 shadow-2xl shadow-black/30">
        <header className="border-b border-zinc-800 px-4 py-4 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-amber-400">One-time choice · {show.name}</p>
              <h1 id="show-classification-title" className="mt-1 text-lg font-semibold text-zinc-100">Classify this legacy Show</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
                This Show predates output contracts. Choose the promise its saved choreography was built to keep; the choice is permanent.
              </p>
            </div>
            <button type="button" onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-200">Cancel</button>
          </div>
          <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
            <Fact label="Current Stage" value={currentMap?.name ?? 'No saved Stage map'} />
            <Fact label="Modeled output" value={`${modeledPixelCount} pixels`} />
            <Fact label="Target" value={targetControllerName ?? 'No target Controller'} />
            <Fact
              label="Routing"
              value={hasPhysicalRanges ? 'Physical LED ranges' : hasLogicalRouting ? 'Logical Stage routing' : 'No exclusive routing evidence'}
            />
          </dl>
          {reasons.length > 0 && <p className="mt-3 text-[10px] leading-4 text-zinc-600">{reasons.join(' ')}</p>}
        </header>
        <div className="grid md:grid-cols-2">
          <ShowContractChoiceColumn
            icon={<Waves size={18} aria-hidden />}
            title="Portable"
            kicker="Resolution-independent 2D"
            promise="LED-resolution independent"
            description="Use normalized Stage positions so compatible 2D maps can run at different LED counts."
            diagram="field"
            includes={['2D mapped surfaces at different resolutions', 'Position-based stripes, grids, and moving splits', 'One editable reference output for authoring']}
            limits={['No physical LED-number targeting', '2D mapped surfaces only', '3D-only Pattern members are incompatible']}
            action="Use Portable contract"
            actionLabel="Choose"
            onChoose={() => choose('portable-2d')}
          />
          <ShowContractChoiceColumn
            icon={<MapPinned size={18} aria-hidden />}
            title="Installation"
            kicker="Exact physical output"
            promise="Exact pixel and map identity"
            description="Keep one fixed map and count, with physical LED ranges and exact Controller checks."
            diagram="indexed"
            includes={['One exact pixel count and output map', 'Physical LED-number ranges', 'Exact Controller compatibility checks']}
            limits={['Built for one installation', 'Every output index must be covered', 'Changing output requires a new Show']}
            action="Use Installation contract"
            actionLabel="Choose"
            onChoose={() => choose('installation')}
          />
        </div>
      </section>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/45 px-3 py-2">
      <dt className="text-[9px] uppercase tracking-[0.13em] text-zinc-600">{label}</dt>
      <dd className="mt-1 truncate text-zinc-300" title={value}>{value}</dd>
    </div>
  )
}
