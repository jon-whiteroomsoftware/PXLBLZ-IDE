import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, X } from 'lucide-react'
import { HelpHint } from './HelpHint'
import type {
  DeliveredShowSourceInventory,
  DeliveredShowSourceInventoryCategory,
  ShowArtifactInventoryModel,
  ShowArtifactInventoryRow,
} from '@/engine/showSourceInventory'

export interface ShowArtifactInventoryProps {
  inventory: DeliveredShowSourceInventory
  model: ShowArtifactInventoryModel
  vmWords: { used: number; budget: number; remaining: number }
  renderers: {
    controller: { steady: number; worst: number }
    perPixel: { steady: number; worst: number }
  }
  structure: {
    transitionCount: number
  }
  delivery?: { totalBytes: number; transformBytes: number }
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

const PANEL_WIDTH = 460
const POINTER_LEAVE_GRACE_MS = 150

function rowMeta(row: ShowArtifactInventoryRow, transitionCount: number): string {
  if (row.category === 'effects-transitions' && transitionCount > 0) {
    return `${transitionCount} ${transitionCount === 1 ? 'Transition' : 'Transitions'}`
  }
  return ''
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function patternStructure(row: ShowArtifactInventoryRow): string {
  return [
    countLabel(row.logicalInstanceCount ?? 0, 'use'),
    countLabel(row.physicalMachineCount ?? 0, 'code copy', 'code copies'),
    countLabel(row.authoredReferenceCount ?? 0, 'placement'),
  ].join(' · ')
}

function patternCostEquation(row: ShowArtifactInventoryRow): string {
  const breakdown = row.patternBreakdown
  if (!breakdown || breakdown.baseCopies.length === 0) return `${formatBytes(row.bytes)} Pattern total`
  const [first, ...additional] = breakdown.baseCopies
  const terms = [`one compiled copy ${formatBytes(first.bytes)}`]
  if (additional.length > 0) {
    const additionalBytes = additional.reduce((sum, copy) => sum + copy.bytes, 0)
    const equalAdditionalCopies = additional.every((copy) => copy.bytes === additional[0].bytes)
    terms.push(additional.length > 1 && equalAdditionalCopies
      ? `${additional.length} x ${formatBytes(additional[0].bytes)} for ${additional.length} additional compiled copies`
      : `${formatBytes(additionalBytes)} across ${countLabel(additional.length, 'additional compiled copy')}`)
  }
  terms.push(`${formatBytes(breakdown.generatedBytes)} generated for Show settings and placements`)
  return `${terms.join(' + ')} = ${formatBytes(row.bytes)}`
}

function busiestLedWork(steady: number, worst: number): string {
  const normalWork = countLabel(steady, 'Pattern color calculation')
  if (steady === worst) return `Busiest LED: ${normalWork}`
  return `Busiest LED: ${normalWork} normally, up to ${worst} when visuals overlap`
}

export function ShowArtifactInventoryPopover({ inventory, model, vmWords, renderers, structure, delivery }: ShowArtifactInventoryProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pointerCloseTimerRef = useRef<number | null>(null)
  const suppressFocusRevealRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({ left: 8, bottom: 38 })
  const deliveredBytes = delivery?.totalBytes ?? inventory.totalBytes

  function cancelScheduledPointerClose() {
    if (pointerCloseTimerRef.current === null) return
    window.clearTimeout(pointerCloseTimerRef.current)
    pointerCloseTimerRef.current = null
  }

  function reveal() {
    cancelScheduledPointerClose()
    setOpen(true)
  }

  function schedulePointerClose() {
    cancelScheduledPointerClose()
    pointerCloseTimerRef.current = window.setTimeout(() => {
      pointerCloseTimerRef.current = null
      if (pinned) return
      const active = document.activeElement
      if (triggerRef.current?.contains(active) || panelRef.current?.contains(active)) return
      setOpen(false)
    }, POINTER_LEAVE_GRACE_MS)
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
    cancelScheduledPointerClose()
    suppressFocusRevealRef.current = true
    setPinned(false)
    setOpen(false)
    triggerRef.current?.focus()
    window.setTimeout(() => { suppressFocusRevealRef.current = false }, 0)
  }

  useEffect(() => () => {
    if (pointerCloseTimerRef.current !== null) window.clearTimeout(pointerCloseTimerRef.current)
  }, [])

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(PANEL_WIDTH, window.innerWidth - 16) - 8)),
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
      cancelScheduledPointerClose()
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
      className="fixed z-[100] max-h-[min(680px,calc(100vh-48px))] w-[min(460px,calc(100vw-16px))] overflow-y-auto rounded-md border border-zinc-700 bg-[#08090b]/[0.99] p-3 font-mono text-[10px] text-zinc-300 shadow-[0_24px_80px_-20px_rgba(0,0,0,.98),0_0_0_1px_rgba(245,158,11,.10)] backdrop-blur-sm"
      style={position}
      onPointerEnter={reveal}
      onPointerLeave={schedulePointerClose}
      onFocus={reveal}
      onBlur={closeUnlessFocused}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        closeAndFocusTrigger()
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-100">Show source inventory</h2>
        {pinned ? (
          <button
            type="button"
            aria-label="Close Show source inventory"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            onClick={closeAndFocusTrigger}
          >
            <X size={13} aria-hidden />
          </button>
        ) : (
          <span className="text-[8px] text-zinc-500">Select the meter to keep this open</span>
        )}
      </div>
      <ShowArtifactInventoryBody inventory={inventory} model={model} vmWords={vmWords} renderers={renderers} structure={structure} delivery={delivery} />

    </div>,
    document.body,
  ) : null

  return (
    <span onPointerEnter={reveal} onPointerLeave={schedulePointerClose}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Show source inventory, ${formatBytes(deliveredBytes)} / ${formatBytes(model.budgetBytes)} advisory`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 font-semibold tabular-nums text-zinc-300 outline-none transition-colors hover:bg-amber-400/10 hover:text-amber-200 focus-visible:bg-amber-400/10 focus-visible:text-amber-200 focus-visible:ring-1 focus-visible:ring-amber-400/60"
        onFocus={() => { if (!suppressFocusRevealRef.current) reveal() }}
        onBlur={closeUnlessFocused}
        onClick={() => {
          const nextPinned = !pinned
          setPinned(nextPinned)
          if (nextPinned) reveal()
          else {
            cancelScheduledPointerClose()
            setOpen(false)
          }
        }}
      >
        {formatBytes(deliveredBytes)} / {formatBytes(model.budgetBytes)}
        <ChevronUp size={11} aria-hidden />
      </button>
      {panel}
    </span>
  )
}

export function ShowArtifactInventoryBody({ inventory, model, vmWords, renderers, structure, delivery }: ShowArtifactInventoryProps) {
  const deliveredBytes = delivery?.totalBytes ?? inventory.totalBytes
  const transformBytes = Math.max(0, delivery?.transformBytes ?? 0)
  return <div className="show-source-inventory-body">
      <div className="flex h-4 w-full overflow-hidden rounded-sm bg-zinc-900 ring-1 ring-zinc-700/70" aria-hidden>
        {model.rows.map((row) => (
          <span
            key={row.id}
            className={`${CATEGORY_COLOR[row.category]} h-full min-w-px shrink-0 border-r border-black/20 last:border-r-0`}
            style={{ width: `${row.percentage * 100}%` }}
            title={`${row.label}: ${formatBytes(row.bytes)} (${formatPercent(row.percentage)})`}
          />
        ))}
        {transformBytes > 0 && (
          <span
            className="h-full min-w-px shrink-0 border-r border-black/20 bg-rose-400"
            style={{ width: `${transformBytes / model.budgetBytes * 100}%` }}
            title={`Controller transforms: ${formatBytes(transformBytes)}`}
          />
        )}
      </div>

      <div className="mt-1.5">
        {model.rows.map((row) => {
          const meta = rowMeta(row, structure.transitionCount)
          const pattern = row.category === 'pattern' && row.patternBreakdown
          return (
            <div key={row.id} className={pattern ? 'min-w-0 py-1' : 'flex min-w-0 items-center gap-2 py-[2.5px]'}>
              <div className={pattern ? 'flex items-center gap-2' : 'contents'}>
                <span className={`h-2 w-2 shrink-0 rounded-[2px] ${CATEGORY_COLOR[row.category]}`} aria-hidden />
                <span className="min-w-0 truncate text-zinc-200" title={row.label}>{row.label}</span>
                {pattern && <span className="shrink-0"><HelpHint label={`About ${row.label} source`}>
                  <p className="font-semibold">{row.label}</p>
                  <p className="mt-1">{patternStructure(row)}</p>
                  <p className="mt-1">{patternCostEquation(row)}</p>
                </HelpHint></span>}
                {!row.creatorEditable && row.category === 'runtime-scheduler' && (
                  <span className="shrink-0 rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-zinc-500">fixed</span>
                )}
                {meta && <span className="truncate text-[9px] text-zinc-500">{meta}</span>}
                <span className="ml-auto shrink-0 tabular-nums text-zinc-200">{formatBytes(row.bytes)}</span>
              </div>
              {pattern && (
                <div className="ml-4 min-w-0 truncate text-[9px] leading-4 text-zinc-500" title={patternStructure(row)}>
                  {patternStructure(row)}
                </div>
              )}
            </div>
          )
        })}
        {transformBytes > 0 && (
          <div className="flex items-center gap-2 py-1">
            <span className="h-2 w-2 shrink-0 rounded-[2px] bg-rose-400" aria-hidden />
            <span className="truncate text-zinc-200">Controller transforms</span>
            <span className="ml-auto shrink-0 tabular-nums text-zinc-200">+{formatBytes(transformBytes)}</span>
          </div>
        )}
      </div>

      <div className="relative isolate mt-1.5 min-w-0">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 -inset-x-1.5 -z-10 rounded-sm border border-zinc-700/70 bg-zinc-800/40" />
        <div className="pt-1 text-[9px] font-medium uppercase tracking-wider text-zinc-400">Output summary</div>
        <div className="flex min-w-0 flex-col divide-y divide-zinc-700/60">
        <ResourceAxis
          primary
          label={delivery ? 'Controller source' : 'Delivered source'}
          value={`${formatBytes(deliveredBytes)} / ${formatBytes(model.budgetBytes)}`}
          detail={`${formatPercent(deliveredBytes / model.budgetBytes)} advisory`}
        />
        <ResourceAxis label="VM words" value={`${vmWords.used.toLocaleString('en-US')} / ${vmWords.budget.toLocaleString('en-US')}`} detail={`${vmWords.remaining.toLocaleString('en-US')} free`} />
        <ResourceAxis
          label="Pattern copies running"
          value={`Up to ${renderers.controller.worst} at once`}
          help={`${busiestLedWork(renderers.perPixel.steady, renderers.perPixel.worst)}. Busiest LED counts how many Pattern colors are calculated for one LED at the same moment. Effects modify those colors; they do not add another Pattern calculation.`}
        />
        </div>
      </div>

  </div>
}

function ResourceAxis({ label, value, detail, help, primary }: { label: string; value: string; detail?: string; help?: string; primary?: boolean }) {
  return (
    <div data-source-resource={label} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 py-1">
      <div className="flex min-w-0 items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-400">
        <span className="truncate" title={label}>{label}</span>
        {help && <span className="shrink-0 normal-case"><HelpHint label={`About ${label}`}>{help}</HelpHint></span>}
      </div>
      <div data-source-resource-value className={`whitespace-nowrap text-right tabular-nums ${primary ? 'font-semibold text-zinc-100' : 'text-zinc-200'}`}>{value}</div>
      {detail && <div className="col-span-2 truncate text-[9px] text-zinc-500" title={detail}>{detail}</div>}
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
