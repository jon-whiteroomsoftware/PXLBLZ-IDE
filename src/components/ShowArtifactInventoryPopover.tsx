import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, X } from 'lucide-react'
import type {
  DeliveredShowSourceInventory,
  DeliveredShowSourceInventoryCategory,
  ShowArtifactInventoryModel,
} from '@/engine/showSourceInventory'

interface Props {
  inventory: DeliveredShowSourceInventory
  model: ShowArtifactInventoryModel
  vmWords: { used: number; budget: number; remaining: number }
  renderers: { steady: number; worst: number }
  structure: {
    transitionCount: number
    routing: string
    score: { boundaryCount: number; stackPlanCount: number; kernelCount: number } | null
    motion: { boundaryCount: number; stackPlanCount: number; kernelCount: number } | null
    generatedEffectKernelCount: number
  }
}

const CATEGORY_COLOR: Record<DeliveredShowSourceInventoryCategory, string> = {
  pattern: 'bg-amber-400',
  'runtime-scheduler': 'bg-zinc-500',
  'routing-render-plans': 'bg-sky-400',
  'effects-transitions': 'bg-fuchsia-400',
  'score-data': 'bg-emerald-400',
  exports: 'bg-violet-400',
  provenance: 'bg-cyan-400',
  remainder: 'bg-slate-600',
}

export function ShowArtifactInventoryPopover({ inventory, model, vmWords, renderers, structure }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const suppressFocusRevealRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({ left: 8, bottom: 38 })
  const patternRows = model.rows.filter((row) => row.category === 'pattern')
  const logicalPatternCount = patternRows.reduce((sum, row) => sum + (row.logicalInstanceCount ?? 0), 0)
  const physicalPatternCount = patternRows.reduce((sum, row) => sum + (row.physicalMachineCount ?? 0), 0)

  function reveal() {
    setOpen(true)
  }

  function closeUnlessFocused() {
    window.setTimeout(() => {
      if (pinned) return
      const active = document.activeElement
      if (triggerRef.current?.contains(active) || panelRef.current?.contains(active)) return
      setOpen(false)
    }, 0)
  }

  function closeAndFocusTrigger() {
    suppressFocusRevealRef.current = true
    setPinned(false)
    setOpen(false)
    triggerRef.current?.focus()
    window.setTimeout(() => { suppressFocusRevealRef.current = false }, 0)
  }

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(620, window.innerWidth - 16) - 8)),
        bottom: Math.max(38, window.innerHeight - rect.top + 6),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [open])

  useEffect(() => {
    if (!pinned) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setPinned(false)
      setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [pinned])

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Show source inventory"
      className="fixed z-[100] max-h-[min(680px,calc(100vh-48px))] w-[min(620px,calc(100vw-16px))] overflow-y-auto rounded-md border border-zinc-700 bg-[#08090b]/[0.99] p-4 font-mono text-[10px] text-zinc-300 shadow-[0_24px_80px_-20px_rgba(0,0,0,.98),0_0_0_1px_rgba(245,158,11,.10)] backdrop-blur-sm"
      style={position}
      onPointerEnter={reveal}
      onPointerLeave={() => { if (!pinned) setOpen(false) }}
      onFocus={reveal}
      onBlur={closeUnlessFocused}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        closeAndFocusTrigger()
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-zinc-100">Show source inventory</h2>
          <p className="mt-1 max-w-[54ch] leading-relaxed text-zinc-500">
            Exact UTF-8 bytes sent as source. Widths are shares of the {formatBytes(model.budgetBytes)} source budget.
          </p>
          <p className="mt-2 text-[9px] text-amber-200/80">
            Pattern machines: {logicalPatternCount} logical · {physicalPatternCount} physical
          </p>
        </div>
        <button
          type="button"
          aria-label="Close Show source inventory"
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          onClick={closeAndFocusTrigger}
        >
          <X size={13} aria-hidden />
        </button>
      </div>

      <div className="mt-4 flex h-4 w-full overflow-hidden rounded-sm bg-zinc-900 ring-1 ring-zinc-700/70" aria-hidden>
        {model.rows.map((row) => (
          <span
            key={row.id}
            className={`${CATEGORY_COLOR[row.category]} h-full min-w-px border-r border-black/20 last:border-r-0`}
            style={{ width: `${row.percentage * 100}%` }}
            title={`${row.label}: ${formatBytes(row.bytes)} (${formatPercent(row.percentage)})`}
          />
        ))}
      </div>

      <div className="mt-3 divide-y divide-zinc-800/80 border-y border-zinc-800/80">
        {model.rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-zinc-200">
                <span className={`h-2 w-2 shrink-0 rounded-[2px] ${CATEGORY_COLOR[row.category]}`} aria-hidden />
                <span className="truncate">{row.label}</span>
                {!row.creatorEditable && row.category === 'runtime-scheduler' && (
                  <span className="rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-zinc-500">fixed</span>
                )}
              </div>
              {row.category === 'pattern' && (
                <p className="mt-1 pl-4 text-[9px] text-zinc-500">
                  {row.logicalInstanceCount} logical · {row.physicalMachineCount} physical · {row.authoredReferenceCount} authored {row.authoredReferenceCount === 1 ? 'reference' : 'references'}
                </p>
              )}
              {row.category === 'routing-render-plans' && (
                <p className="mt-1 pl-4 text-[9px] text-zinc-500">{structure.routing} routing representation</p>
              )}
              {row.category === 'effects-transitions' && (
                <p className="mt-1 pl-4 text-[9px] text-zinc-500">
                  {structure.motion
                    ? `${structure.motion.boundaryCount} boundaries · ${structure.motion.stackPlanCount} interned stacks · ${structure.motion.kernelCount} ${structure.motion.kernelCount === 1 ? 'kernel' : 'kernels'}`
                    : `${structure.transitionCount} authored Transitions${structure.generatedEffectKernelCount > 0 ? ` · ${structure.generatedEffectKernelCount} shared Effect kernel${structure.generatedEffectKernelCount === 1 ? '' : 's'}` : ''}`}
                </p>
              )}
              {row.category === 'score-data' && structure.score && (
                <p className="mt-1 pl-4 text-[9px] text-zinc-500">
                  {structure.score.boundaryCount} boundaries · {structure.score.stackPlanCount} interned stacks · {structure.score.kernelCount} {structure.score.kernelCount === 1 ? 'kernel' : 'kernels'}
                </p>
              )}
            </div>
            <div className="text-right tabular-nums">
              <div className="text-zinc-200">{formatBytes(row.bytes)}</div>
              <div className="text-[9px] text-zinc-600">{formatPercent(row.percentage)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-zinc-800 ring-1 ring-zinc-800 sm:grid-cols-4">
        <ResourceAxis
          label="Delivered source"
          value={`${formatBytes(inventory.totalBytes)} / ${formatBytes(model.budgetBytes)}`}
          detail={`${formatPercent(inventory.totalBytes / model.budgetBytes)} of budget`}
        />
        <ResourceAxis label="Generated program" value={formatBytes(inventory.generatedSourceBytes)} />
        <ResourceAxis label="VM words" value={`${vmWords.used.toLocaleString('en-US')} / ${vmWords.budget.toLocaleString('en-US')}`} detail={`${vmWords.remaining.toLocaleString('en-US')} free`} />
        <ResourceAxis label="Runtime renderers" value={`${renderers.steady} steady`} detail={`${renderers.worst} worst`} />
      </div>

      {model.slimmingTips.length > 0 && (
        <section className="mt-4" aria-labelledby="show-slimming-heading">
          <h3 id="show-slimming-heading" className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300/90">Ways to slim this Show</h3>
          <ol className="mt-2 space-y-2">
            {model.slimmingTips.slice(0, 4).map((tip) => (
              <li key={tip.contributorId} className="grid grid-cols-[auto_1fr] gap-2 leading-relaxed text-zinc-400">
                <span className="tabular-nums text-zinc-200">{formatBytes(tip.currentBytes)}</span>
                <span>{tip.message}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="mt-4 border-t border-zinc-800 pt-3 leading-relaxed text-zinc-600">
        Source percentages do not describe Controller bytecode or runtime cost. VM words and renderer depth are independent axes.
      </p>
    </div>,
    document.body,
  ) : null

  return (
    <span onPointerEnter={reveal} onPointerLeave={() => { if (!pinned) setOpen(false) }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Show source inventory, ${formatBytes(inventory.totalBytes)} of ${formatBytes(model.budgetBytes)} source budget`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 font-semibold tabular-nums text-zinc-300 outline-none transition-colors hover:bg-amber-400/10 hover:text-amber-200 focus-visible:bg-amber-400/10 focus-visible:text-amber-200 focus-visible:ring-1 focus-visible:ring-amber-400/60"
        onFocus={() => { if (!suppressFocusRevealRef.current) reveal() }}
        onBlur={closeUnlessFocused}
        onClick={() => {
          const nextPinned = !pinned
          setPinned(nextPinned)
          if (nextPinned) reveal()
          else setOpen(false)
        }}
      >
        {formatBytes(inventory.totalBytes)} / {formatBytes(model.budgetBytes)}
        <ChevronUp size={11} aria-hidden />
      </button>
      {panel}
    </span>
  )
}

function ResourceAxis({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="bg-zinc-950 px-2.5 py-2">
      <div className="text-[8px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className="mt-1 tabular-nums text-zinc-200">{value}</div>
      {detail && <div className="text-[8px] text-zinc-600">{detail}</div>}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 1 : 2)} KB`
}

function formatPercent(ratio: number): string {
  if (ratio > 0 && ratio < 0.001) return '<0.1%'
  return `${(ratio * 100).toFixed(1)}%`
}
