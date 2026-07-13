import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, Check, Eraser, MousePointer2, Plus, Minus } from 'lucide-react'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { validateInstallationCoverage } from '@/engine/showInstallationCoverage'
import {
  applySpatialIndexSelection,
  compactSpatialIndexes,
  indexesFromPhysicalRanges,
  selectIndexesInRect,
  updateShowPhysicalZoneSelection,
  type SpatialPoint2D,
  type SpatialSelectionMode,
} from '@/engine/showSpatialSelection'

export function ShowZoneSpatialSelector({
  show,
  zone,
  layoutId,
  mapName,
  points,
  onCommit,
  onCancel,
}: {
  show: ShowRecord
  zone: ShowRecord['zones'][number]
  layoutId: string
  mapName: string
  points: SpatialPoint2D[]
  onCommit: (indexes: number[]) => void
  onCancel: () => void
}) {
  const layout = show.routingLayouts.find((candidate) => candidate.id === layoutId)
  const initialRanges = layout?.zones.find((entry) => entry.zoneId === zone.id)?.ranges ?? []
  const [selected, setSelected] = useState(() => indexesFromPhysicalRanges(initialRanges, points.length))
  const [mode, setMode] = useState<SpatialSelectionMode>('replace')
  const [drag, setDrag] = useState<{ from: SpatialPoint2D; to: SpatialPoint2D } | null>(null)
  const dragRef = useRef<{ from: SpatialPoint2D; to: SpatialPoint2D } | null>(null)
  const selectedIndexes = useMemo(() => [...selected].sort((a, b) => a - b), [selected])
  const ranges = useMemo(() => compactSpatialIndexes(selectedIndexes), [selectedIndexes])
  const draftShow = useMemo(
    () => updateShowPhysicalZoneSelection(show, layoutId, zone.id, selectedIndexes),
    [layoutId, selectedIndexes, show, zone.id],
  )
  const coverage = validateInstallationCoverage(draftShow)?.layouts.find((candidate) => candidate.layoutId === layoutId)

  function position(event: ReactPointerEvent<SVGSVGElement>): SpatialPoint2D {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp01((event.clientX - bounds.left) / Math.max(1, bounds.width)),
      y: clamp01((event.clientY - bounds.top) / Math.max(1, bounds.height)),
    }
  }

  function beginDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const from = position(event)
    dragRef.current = { from, to: from }
    setDrag(dragRef.current)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function moveDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return
    const next = { ...dragRef.current, to: position(event) }
    dragRef.current = next
    setDrag(next)
  }

  function finishDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const current = dragRef.current
    if (!current) return
    const complete = { ...current, to: position(event) }
    const hits = selectIndexesInRect(points, complete.from, complete.to)
    setSelected((existing) => applySpatialIndexSelection(existing, hits, mode))
    dragRef.current = null
    setDrag(null)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <div className="scrollbar-hidden h-full overflow-auto bg-zinc-950/75 p-3 font-mono text-zinc-300 sm:p-5">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/90 shadow-2xl shadow-black/30">
        <header className="flex flex-wrap items-start gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5">
          <button type="button" onClick={onCancel} className="mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500 hover:text-zinc-200">
            <ArrowLeft size={12} aria-hidden /> Zone properties
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-[0.16em] text-amber-400">Installation physical zone</p>
            <h1 className="mt-0.5 text-base font-semibold text-zinc-100">Select LEDs for {zone.name}</h1>
            <p className="mt-1 text-[11px] text-zinc-500">{mapName} · {layout?.name ?? 'Default'} · drag across the saved 2D output map</p>
          </div>
          <button
            type="button"
            onClick={() => onCommit(selectedIndexes)}
            className="inline-flex h-8 items-center gap-2 rounded border border-live/40 bg-live/10 px-3 text-[11px] font-semibold text-live hover:bg-live/15"
          >
            <Check size={13} aria-hidden /> Save physical zone
          </button>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_17rem] sm:p-5">
          <div className="min-w-0">
            <svg
              role="img"
              aria-label={`Select LEDs for zone ${zone.name}`}
              tabIndex={0}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              onPointerDown={beginDrag}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={() => { dragRef.current = null; setDrag(null) }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') { event.preventDefault(); onCancel() }
                if (event.key === 'Enter') { event.preventDefault(); onCommit(selectedIndexes) }
              }}
              className="aspect-square max-h-[65vh] w-full touch-none cursor-crosshair rounded-md border border-zinc-700 bg-[#050507] outline-none focus:border-live/70 focus:ring-2 focus:ring-live/20"
            >
              <defs>
                <pattern id="spatial-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(113,113,122,.12)" strokeWidth=".25" />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#spatial-grid)" />
              {points.map((point, index) => (
                <circle
                  key={index}
                  cx={point.x * 100}
                  cy={point.y * 100}
                  r={selected.has(index) ? 2.15 : 1.55}
                  fill={selected.has(index) ? zone.color : '#3f3f46'}
                  stroke={selected.has(index) ? '#fafafa' : '#71717a'}
                  strokeWidth={selected.has(index) ? 0.45 : 0.25}
                  data-index={index}
                />
              ))}
              {drag && (
                <rect
                  x={Math.min(drag.from.x, drag.to.x) * 100}
                  y={Math.min(drag.from.y, drag.to.y) * 100}
                  width={Math.abs(drag.to.x - drag.from.x) * 100}
                  height={Math.abs(drag.to.y - drag.from.y) * 100}
                  fill="rgba(34,211,238,.12)"
                  stroke="#22d3ee"
                  strokeWidth=".45"
                  strokeDasharray="1.5 1"
                />
              )}
            </svg>
          </div>

          <aside className="space-y-3">
            <div className="rounded border border-zinc-800 bg-zinc-900/45 p-3">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500"><MousePointer2 size={12} aria-hidden /> Drag behavior</p>
              <div className="mt-2 grid grid-cols-3 gap-1">
                <ModeButton label="Replace selection" active={mode === 'replace'} onClick={() => setMode('replace')} icon={<MousePointer2 size={11} />} />
                <ModeButton label="Add selection" active={mode === 'add'} onClick={() => setMode('add')} icon={<Plus size={11} />} />
                <ModeButton label="Subtract selection" active={mode === 'subtract'} onClick={() => setMode('subtract')} icon={<Minus size={11} />} />
              </div>
              <button type="button" onClick={() => setSelected(new Set())} className="mt-2 inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200"><Eraser size={11} /> Clear</button>
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-900/45 p-3">
              <p className="text-[9px] uppercase tracking-[0.12em] text-zinc-600">Exact physical indexes</p>
              <p className="mt-1 break-words text-xs leading-5 text-zinc-200">Indexes {formatRanges(ranges)}</p>
              <p className="mt-2 text-[10px] leading-4 text-zinc-500">
                {selected.size} selected · {coverage?.assignedPixelCount ?? 0} assigned of {coverage?.totalPixelCount ?? points.length} total · {coverage?.missingPixelCount ?? points.length} missing · {coverage?.overlappingPixelCount ?? 0} overlapping · {coverage?.outOfRangePixelCount ?? 0} out of range
              </p>
            </div>
            <p className="text-[10px] leading-4 text-zinc-600">Selection follows LED indexes, even when adjacent points are discontinuous in wiring order. Saved indexes compact into minimal inclusive ranges.</p>
          </aside>
        </div>
      </section>
    </div>
  )
}

function ModeButton({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-8 items-center justify-center gap-1 rounded border text-[9px] ${active ? 'border-live/50 bg-live/10 text-live' : 'border-zinc-800 text-zinc-500 hover:text-zinc-200'}`}
    >
      {icon}
    </button>
  )
}

function formatRanges(ranges: Array<{ start: number; end: number }>): string {
  if (ranges.length === 0) return 'none'
  return ranges.map((range) => range.start === range.end ? String(range.start) : `${range.start}-${range.end}`).join(', ')
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
