import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Zap } from 'lucide-react'
import type { ShowBoundaryTransition, ShowRecord } from '@/engine/personalContentRecords'
import { NumberField } from '@/components/ui/number-field'
import { PercentageField } from '@/components/ui/percentage-field'
import { DomainNumberField } from '@/components/ui/domain-number-field'
import { ColorField } from '@/components/ui/color-field'
import { projectShowTimeline } from '@/engine/showModel'
import {
  replaceShowBoundaryTransition,
  showBoundaryTransitionParameterValue,
  showBoundaryTransitionParameters,
} from '@/engine/showTransitionAuthoring'
import { SHOW_VISUAL_TOOLKIT_REGISTRY, type ShowToolkitParameterValue } from '@/engine/showVisualToolkit'
import {
  buildShowToolkitPresentationCatalogue,
  filterShowToolkitPresentationCatalogue,
  type ShowToolkitPresentationItem,
} from '@/engine/showVisualToolkitPresentation'
import { useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { useShowTransportStore } from '@/store/showTransportStore'

export function ShowTransitionPalette({
  show,
  transitionId,
  stageDimensions,
  onApply,
  onClose,
}: {
  show: ShowRecord
  transitionId: string
  stageDimensions: 1 | 2 | 3
  onApply: (transition: ShowBoundaryTransition) => void
  onClose: () => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const originalPositionRef = useRef(useShowTransportStore.getState().positionMs)
  const activePreviewRef = useRef<{ key: string; show: ShowRecord } | null>(null)
  const [query, setQuery] = useState('')
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const [activeItem, setActiveItem] = useState<ShowToolkitPresentationItem | null>(null)
  const preview = useShowPreviewOverrideStore((state) => state.preview)
  const clearPreview = useShowPreviewOverrideStore((state) => state.clear)
  const catalogue = useMemo(
    () => buildShowToolkitPresentationCatalogue({ stageDimensions }),
    [stageDimensions],
  )
  const items = useMemo(() => filterShowToolkitPresentationCatalogue(catalogue, {
    kind: 'transition', query, compatibleOnly,
  }).filter((item) => familyId === null || item.familyId === familyId), [catalogue, compatibleOnly, familyId, query])
  const families = useMemo(() => SHOW_VISUAL_TOOLKIT_REGISTRY.filter((family) => family.kind === 'transition'), [])

  const clearCandidatePreview = () => {
    if (!activePreviewRef.current) return
    activePreviewRef.current = null
    clearPreview(show.id)
  }
  const restorePreview = () => {
    if (!activePreviewRef.current) return
    clearCandidatePreview()
    useShowTransportStore.getState().requestSeek(show.id, originalPositionRef.current)
  }
  const close = () => {
    restorePreview()
    onClose()
  }
  const candidate = (item: ShowToolkitPresentationItem, presetId?: string) => (
    replaceShowBoundaryTransition(show, transitionId, item, presetId)
  )
  const previewItem = (item: ShowToolkitPresentationItem, presetId?: string) => {
    if (!item.compatible) return
    setActiveItem(item)
    const previewKey = `${item.key}:${presetId ?? ''}`
    if (activePreviewRef.current?.key === previewKey) return
    const changed = candidate(item, presetId)
    activePreviewRef.current = { key: previewKey, show: changed }
    preview(changed)
    const boundary = projectShowTimeline(changed).boundaryTransitions
      .find((entry) => entry.id === transitionId)
    if (boundary) {
      useShowTransportStore.getState().requestSeek(
        show.id,
        boundary.startMs + (boundary.endMs - boundary.startMs) / 2,
      )
    }
  }
  const applyItem = (item: ShowToolkitPresentationItem, presetId?: string) => {
    if (!item.compatible) return
    const previewKey = `${item.key}:${presetId ?? ''}`
    const changed = activePreviewRef.current?.key === previewKey
      ? activePreviewRef.current.show
      : candidate(item, presetId)
    const transition = changed.transitions?.find((entry) => entry.id === transitionId)
    if (!transition) {
      close()
      return
    }
    onApply(transition)
    clearCandidatePreview()
    onClose()
  }

  useEffect(() => {
    searchRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restorePreview()
    }
  // Palette ownership is intentionally one mounted lifecycle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id])

  const activeVariant = activeItem
    ? SHOW_VISUAL_TOOLKIT_REGISTRY
      .find((family) => family.kind === 'transition' && family.id === activeItem.familyId)
      ?.variants.find((variant) => variant.id === activeItem.variantId)
    : undefined

  return createPortal(
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Choose Transition"
      className="fixed left-1/2 top-[76px] z-[90] flex max-h-[min(500px,calc(100vh-92px))] w-[min(680px,calc(100vw-16px))] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-zinc-700 bg-[#0b0c0f]/[0.985] shadow-[0_24px_80px_-18px_rgba(0,0,0,0.98)] backdrop-blur-sm"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800 px-2.5">
        <Zap size={13} className="text-amber-300" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-200">Choose Transition</h3>
          <p className="truncate text-[9px] text-zinc-600">preview outgoing to incoming in Stage, click to apply</p>
        </div>
        <button type="button" onClick={close} className="ml-auto grid size-6 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close Transitions palette"><X size={13} /></button>
      </header>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 p-2">
        <label className="relative min-w-0 flex-1">
          <Search size={12} className="pointer-events-none absolute left-2 top-2 text-zinc-600" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            aria-label="Search Transitions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Transitions and presets"
            className="h-7 w-full rounded border border-zinc-700 bg-zinc-950 pl-7 pr-2 text-[10px] text-zinc-200 outline-none focus:border-amber-400/60"
          />
        </label>
        <label className="flex h-7 shrink-0 items-center gap-1.5 rounded border border-zinc-800 px-2 text-[9px] text-zinc-500">
          <input type="checkbox" checked={compatibleOnly} onChange={(event) => setCompatibleOnly(event.target.checked)} className="size-3 accent-amber-400" />
          compatible
        </label>
      </div>
      <nav className="scrollbar-hidden flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-800 px-2 py-1.5" aria-label="Transition families">
        <button type="button" onClick={() => setFamilyId(null)} className={`h-6 rounded px-2 text-[9px] ${familyId === null ? 'bg-amber-400/15 text-amber-200' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'}`}>All</button>
        {families.map((family) => (
          <button key={family.id} type="button" onClick={() => setFamilyId(family.id)} className={`h-6 rounded px-2 text-[9px] ${familyId === family.id ? 'bg-amber-400/15 text-amber-200' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'}`}>{family.label}</button>
        ))}
      </nav>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-px overflow-auto bg-zinc-800 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-label={`Use ${item.label} Transition`}
            disabled={!item.compatible}
            onPointerEnter={() => previewItem(item)}
            onPointerLeave={restorePreview}
            onFocus={() => previewItem(item)}
            onClick={() => applyItem(item)}
            className="group flex h-10 min-w-0 items-center gap-2 bg-[#101115] px-2 text-left hover:bg-[#171920] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            title={item.compatible ? item.summary : item.compatibilityReason ?? undefined}
          >
            <TransitionMnemonic family={item.familyId} variant={item.variantId} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-medium text-zinc-100">{item.label}</span>
              <span className="block truncate text-[8px] text-zinc-600">{item.familyLabel} · {item.costPolicies.join(' · ')}</span>
            </span>
          </button>
        ))}
        {items.length === 0 && <p className="col-span-full p-6 text-center text-[10px] text-zinc-600">No Transitions match.</p>}
      </div>
      <footer className="min-h-12 shrink-0 border-t border-zinc-800 bg-zinc-950/75 px-2.5 py-2">
        {activeItem ? (
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[9px] text-zinc-400" title={activeItem.summary}>{activeItem.summary}</p>
            {activeVariant?.presets?.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onPointerEnter={() => previewItem(activeItem, preset.id)}
                onFocus={() => previewItem(activeItem, preset.id)}
                onClick={() => applyItem(activeItem, preset.id)}
                className="h-6 shrink-0 rounded border border-zinc-700 px-2 text-[8px] text-zinc-300 hover:border-amber-400/50 hover:text-amber-200"
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : <p className="text-[9px] text-zinc-600">Hover or focus a Transition to preview the boundary in the existing Stage.</p>}
      </footer>
    </section>,
    document.body,
  )
}

export function ShowTransitionParameters({
  transition,
  item,
  onPreview,
  onPreviewEnd,
  onChange,
}: {
  transition: ShowBoundaryTransition
  item: ShowToolkitPresentationItem
  onPreview?: (parameterId: string, value: ShowToolkitParameterValue) => void
  onPreviewEnd?: () => void
  onChange: (parameterId: string, value: ShowToolkitParameterValue) => void
}) {
  const parameters = showBoundaryTransitionParameters(item, transition)
  return (
    <div role="group" aria-label={`${item.label} Transition parameters`} className="grid grid-cols-2 items-end gap-1.5 sm:grid-cols-3">
      {parameters.map((parameter) => {
        const value = showBoundaryTransitionParameterValue(transition, parameter.id)
        if (parameter.kind === 'boolean') {
          return (
            <label key={parameter.id} className="flex min-h-8 items-center gap-2 self-end text-[9px] text-zinc-500">
              <input type="checkbox" aria-label={parameter.label} checked={Boolean(value)} onChange={(event) => onChange(parameter.id, event.target.checked)} className="size-3 accent-amber-400" />
              {parameter.label}
            </label>
          )
        }
        if (parameter.kind === 'enum' || parameter.kind === 'easing') {
          const options = parameter.kind === 'easing'
            ? parameter.easingOptions?.map((option) => ({ value: option.id, label: option.label }))
            : parameter.options
          return (
            <label key={parameter.id} className="text-[8px] uppercase tracking-wide text-zinc-600">
              {parameter.label}
              <select aria-label={parameter.label} value={String(value)} onChange={(event) => onChange(parameter.id, event.target.value)} className="mt-0.5 h-7 w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 text-[10px] normal-case tracking-normal text-zinc-200 outline-none focus:border-amber-400/60">
                {options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )
        }
        if (parameter.kind === 'color') {
          return (
            <ColorField
              key={parameter.id}
              label={parameter.label}
              value={String(value)}
              variant="editor"
              onPreview={(next) => onPreview?.(parameter.id, next)}
              onPreviewEnd={onPreviewEnd}
              onChange={(next) => onChange(parameter.id, next)}
            />
          )
        }
        if (parameter.presentation === 'percentage') {
          return (
            <PercentageField
              key={parameter.id}
              label={parameter.label}
              value={Number(value)}
              min={parameter.min ?? 0}
              max={parameter.max ?? 1}
              step={parameter.step ?? 0.01}
              variant="editor"
              compact
              disabled={transition.kind === 'cut'}
              onPreview={(next) => onPreview?.(parameter.id, next)}
              onPreviewEnd={onPreviewEnd}
              onChange={(next) => onChange(parameter.id, next)}
            />
          )
        }
        if (parameter.presentation === 'multiplier' || parameter.presentation === 'ratio') {
          return (
            <DomainNumberField
              key={parameter.id}
              label={parameter.label}
              presentation={parameter.presentation}
              value={Number(value)}
              min={parameter.min ?? 0}
              max={parameter.max ?? 1}
              step={parameter.step ?? 0.01}
              variant="editor"
              compact
              disabled={transition.kind === 'cut'}
              onPreview={(next) => onPreview?.(parameter.id, next)}
              onPreviewEnd={onPreviewEnd}
              onChange={(next) => onChange(parameter.id, next)}
            />
          )
        }
        // Millisecond model values present as seconds (#577): the model and
        // presets stay in ms while entry uses the app-wide seconds convention.
        const msUnit = parameter.unit === 'ms'
        return (
          <NumberField
            key={parameter.id}
            label={msUnit ? `${parameter.label} (s)` : `${parameter.label}${parameter.unit ? ` (${parameter.unit})` : ''}`}
            value={msUnit ? Number(value) / 1_000 : Number(value)}
            min={msUnit && parameter.min !== undefined ? parameter.min / 1_000 : parameter.min}
            max={msUnit && parameter.max !== undefined ? parameter.max / 1_000 : parameter.max}
            step={msUnit ? 0.1 : parameter.step}
            disabled={transition.kind === 'cut' && parameter.id !== 'durationMs'}
            onChange={(next) => onChange(parameter.id, msUnit ? Math.round(next * 1_000) : next)}
          />
        )
      })}
    </div>
  )
}

function TransitionMnemonic({ family, variant }: { family: string; variant: string }) {
  const color = family === 'blend' ? '#a1a1aa' : family === 'fade' ? '#fbbf24' : family === 'wipe' ? '#38bdf8' : family === 'dissolve' ? '#a78bfa' : family === 'shape-reveal' ? '#34d399' : '#fb7185'
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6 shrink-0" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="15" rx="2" fill="#09090b" stroke="#3f3f46" />
      {family === 'dissolve' ? <path d="M4 4h2v2H4zm5 1h2v2H9zm5-2h2v2h-2zm3 5h2v2h-2zM6 10h2v2H6zm6 1h2v2h-2z" fill={color} />
        : family === 'shape-reveal' ? <circle cx="12" cy="8" r={variant === 'ring' ? 4 : 3} fill={variant === 'ring' ? 'none' : color} stroke={color} strokeWidth="1.5" />
          : family === 'wipe' ? <path d="M4 12 10 4v8l6-8v8h4" fill="none" stroke={color} strokeWidth="1.5" />
            : family === 'motion' ? <path d="m5 8 5-4v3h8v2h-8v3z" fill={color} />
              : <path d="M3 3h8v10H3zm10 0h8v10h-8z" fill={color} fillOpacity={family === 'blend' ? 0.55 : 0.8} />}
    </svg>
  )
}
