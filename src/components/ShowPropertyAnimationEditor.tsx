import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ArrowLeft, Diamond, Trash2 } from 'lucide-react'
import { DomainNumberField } from './ui/domain-number-field'
import { NumberField } from './ui/number-field'
import { PercentageField } from './ui/percentage-field'
import { TimeField } from './ui/time-field'
import {
  SHOW_EASING_OPTIONS,
  showEasingFromOptionId,
  showEasingOptionId,
} from '@/engine/showEasing'
import type {
  ShowPropertyAnimationKeyframe,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
} from '@/engine/personalContentRecords'
import { evaluateShowPropertyTrack, propertyTargetKey } from '@/engine/showPropertyAnimation'
import {
  showPropertyAnimationGlobalSeconds,
  showPropertyAnimationLocalTimeMs,
  projectShowPropertyAnimationOverview,
  type ShowPropertyAnimationFieldLocation,
  type ShowPropertyAnimationChange,
  type ShowPropertyAnimationOption,
} from '@/engine/showPropertyAnimationEditorModel'
import type { ShowPropertyAnimationValidationIssue } from '@/engine/showPropertyAnimation'

interface ShowPropertyAnimationEditorValue {
  options: ShowPropertyAnimationOption[]
  tracks: ShowPropertyAnimationTrack[]
  trackIssues: Record<string, ShowPropertyAnimationValidationIssue[]>
  storageDurationMs: number
  showTimeOffsetMs: number
  instanceUseCount: number
  activeKey: string | null
  setActiveKey: (key: string | null) => void
  onOpenOverview?: () => void
  onChange: (change: ShowPropertyAnimationChange) => boolean | void
}

const ShowPropertyAnimationEditorContext = createContext<ShowPropertyAnimationEditorValue | null>(null)

export function ShowPropertyAnimationProvider({
  options,
  tracks,
  trackIssues = {},
  storageDurationMs,
  showTimeOffsetMs,
  instanceUseCount,
  onOpenOverview,
  onChange,
  children,
}: {
  options: ShowPropertyAnimationOption[]
  tracks: ShowPropertyAnimationTrack[]
  trackIssues?: Record<string, ShowPropertyAnimationValidationIssue[]>
  storageDurationMs: number
  showTimeOffsetMs: number
  instanceUseCount: number
  onOpenOverview?: () => void
  onChange: (change: ShowPropertyAnimationChange) => boolean | void
  children: ReactNode
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const value = useMemo(() => ({
    options,
    tracks,
    trackIssues,
    storageDurationMs,
    showTimeOffsetMs,
    instanceUseCount,
    activeKey,
    setActiveKey,
    onOpenOverview,
    onChange,
  }), [
    activeKey,
    instanceUseCount,
    onChange,
    onOpenOverview,
    options,
    showTimeOffsetMs,
    storageDurationMs,
    trackIssues,
    tracks,
  ])
  return (
    <ShowPropertyAnimationEditorContext.Provider value={value}>
      {children}
    </ShowPropertyAnimationEditorContext.Provider>
  )
}

export function ShowPropertyAnimationAction({
  target,
  label,
}: {
  target: ShowPropertyAnimationTarget
  label?: string
}) {
  const context = useContext(ShowPropertyAnimationEditorContext)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const key = propertyTargetKey(target)
  const option = context?.options.find((candidate) => candidate.key === key)
  const track = context?.tracks.find((candidate) => propertyTargetKey(candidate.target) === key)
  if (!context || !option) return null
  const accessibleLabel = label ?? option.label
  const animated = Boolean(track)
  const open = context.activeKey === key
  const title = animated
    ? `Edit the ${track!.keyframes.length}-keyframe ${accessibleLabel} animation`
    : `Create a two-point ${accessibleLabel} ramp and open its editor`
  return (
    <>
      <button
        type="button"
        aria-label={animated ? `Edit ${accessibleLabel} animation` : `Animate ${accessibleLabel}`}
        aria-expanded={open}
        title={title}
        data-animated={animated ? 'true' : 'false'}
        data-show-property-animation-target={key}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setAnchor(event.currentTarget)
          context.setActiveKey(open ? null : key)
        }}
        className={`-m-1 grid size-6 shrink-0 place-items-center rounded text-[8px] transition-colors hover:bg-violet-300/10 hover:text-violet-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet-200 ${
          animated ? 'text-violet-300' : 'text-zinc-700'
        }`}
      >
        <Diamond size={8} fill={animated ? 'currentColor' : 'none'} aria-hidden />
      </button>
      {open && (
        <ShowPropertyAnimationPopover
          option={option}
          track={track}
          anchor={anchor}
          context={context}
          onClose={() => context.setActiveKey(null)}
        />
      )}
    </>
  )
}

export function ShowPropertyAnimationOverview({
  onBack,
  onNavigate,
}: {
  onBack: () => void
  onNavigate: (location: ShowPropertyAnimationFieldLocation, targetKey: string) => void
}) {
  const context = useContext(ShowPropertyAnimationEditorContext)
  const backRef = useRef<HTMLDivElement>(null)
  const onBackRef = useRef(onBack)
  const rows = context
    ? projectShowPropertyAnimationOverview(context, context.options)
    : []

  useEffect(() => {
    onBackRef.current = onBack
  }, [onBack])

  useEffect(() => {
    backRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onBackRef.current()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [])

  if (!context) return null
  const placementRows = rows.filter((row) => row.group === 'placement')
  const instanceRows = rows.filter((row) => row.group === 'instance')
  return (
    <section
      role="region"
      aria-label="Animations overview"
      data-show-detail-escape-owned="true"
      className="min-h-[262px] overflow-hidden rounded border border-violet-300/20 bg-violet-300/[0.025]"
    >
      <header className="flex h-8 items-center gap-2 border-b border-violet-300/15 px-2">
        <div
          ref={backRef}
          role="button"
          tabIndex={0}
          aria-label="Back from Animations overview"
          onClick={onBack}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onBack()
          }}
          className="grid size-6 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet-200"
        >
          <ArrowLeft size={12} aria-hidden />
        </div>
        <Diamond size={9} fill="currentColor" aria-hidden className="text-violet-300" />
        <h3 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-violet-200">
          Animations · {rows.length}
        </h3>
      </header>
      <div className="max-h-[360px] overflow-y-auto p-2">
        <AnimationOverviewGroup
          heading="This Clip placement"
          rows={placementRows}
          context={context}
          onNavigate={onNavigate}
        />
        <AnimationOverviewGroup
          heading="Shared Pattern instance"
          note={instanceRows.length > 0 ? `affects ${context.instanceUseCount} linked Clips` : undefined}
          rows={instanceRows}
          context={context}
          onNavigate={onNavigate}
        />
      </div>
    </section>
  )
}

function AnimationOverviewGroup({
  heading,
  note,
  rows,
  context,
  onNavigate,
}: {
  heading: string
  note?: string
  rows: ReturnType<typeof projectShowPropertyAnimationOverview>
  context: ShowPropertyAnimationEditorValue
  onNavigate: (location: ShowPropertyAnimationFieldLocation, targetKey: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <section className="mb-2 last:mb-0">
      <div className="mb-1 flex items-baseline gap-2">
        <h4 className="text-[8px] font-semibold uppercase tracking-[0.11em] text-zinc-400">{heading}</h4>
        {note && <span className="text-[8px] text-cyan-300/70">{note}</span>}
      </div>
      <div className="divide-y divide-zinc-800/80 overflow-hidden rounded border border-zinc-800">
        {rows.map((row) => (
          <div
            key={row.trackId}
            role="group"
            aria-label={`${row.label} animation summary`}
            className={`grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-2 py-1.5 ${
              row.orphaned ? 'bg-red-950/15' : 'bg-zinc-950/45'
            }`}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                {row.orphaned && <AlertTriangle size={10} aria-hidden className="shrink-0 text-red-400" />}
                {row.fieldLocation ? (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Go to ${row.label} field`}
                    onClick={() => onNavigate(row.fieldLocation!, row.targetKey)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      onNavigate(row.fieldLocation!, row.targetKey)
                    }}
                    className="truncate text-left text-[9.5px] font-medium text-violet-100 hover:text-violet-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet-200"
                  >
                    {row.label}
                  </div>
                ) : (
                  <strong className="truncate text-[9.5px] font-medium text-red-300">{row.label}</strong>
                )}
                {row.fieldLocation && (
                  <span className="shrink-0 rounded bg-zinc-800 px-1 text-[7.5px] uppercase tracking-[0.08em] text-zinc-500">
                    {fieldLocationLabel(row.fieldLocation)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-[8.5px] text-zinc-400">
                {row.valueRange} · {row.timeRange}
              </p>
              {row.orphaned && (
                <p className="mt-0.5 text-[8px] leading-3 text-red-300/75">
                  Orphaned · {row.orphanMessage ?? 'The target field no longer exists.'}
                </p>
              )}
              {!row.orphaned && row.keyframeCount !== 2 && (
                <p className="mt-0.5 text-[8px] text-zinc-500">
                  {row.keyframeCount} keyframes
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label={`Remove ${row.label} animation`}
              onClick={() => context.onChange({ kind: 'delete-track', trackId: row.trackId })}
              className="grid size-6 place-items-center self-center rounded text-red-400 hover:bg-red-950/30 hover:text-red-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-red-300"
            >
              <Trash2 size={10} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function fieldLocationLabel(location: ShowPropertyAnimationFieldLocation): string {
  if (location === 'header') return 'Header'
  return `${location.charAt(0).toUpperCase()}${location.slice(1)}`
}

function ShowPropertyAnimationPopover({
  option,
  track,
  anchor,
  context,
  onClose,
}: {
  option: ShowPropertyAnimationOption
  track?: ShowPropertyAnimationTrack
  anchor: HTMLButtonElement | null
  context: ShowPropertyAnimationEditorValue
  onClose: () => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement | null>(null)
  const onCloseRef = useRef(onClose)
  const [draft, setDraft] = useState<[DraftKeyframe, DraftKeyframe]>(() => draftFor(option, context.storageDurationMs))
  const [draftCommitted, setDraftCommitted] = useState(false)
  const ordered = track
    ? [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
    : draft
  const rect = anchor?.getBoundingClientRect()
  const left = Math.max(8, Math.min(
    typeof window === 'undefined' ? 8 : window.innerWidth - 286,
    (rect?.right ?? 286) - 278,
  ))
  const top = Math.max(8, Math.min(
    typeof window === 'undefined' ? 8 : window.innerHeight - 230,
    (rect?.bottom ?? 8) + 4,
  ))

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      firstFieldRef.current = popoverRef.current?.querySelector('input') ?? null
      firstFieldRef.current?.focus()
    }, 0)
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || anchor?.contains(target)) return
      onCloseRef.current()
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCloseRef.current()
      window.setTimeout(() => anchor?.focus(), 0)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [anchor])

  const commitDraft = (next: [DraftKeyframe, DraftKeyframe]) => {
    setDraft(next)
    if (draftCommitted) return
    const accepted = context.onChange({
      kind: 'add-track',
      target: option.target,
      initialValue: option.value,
      keyframes: next,
    }) !== false
    if (accepted) setDraftCommitted(true)
  }
  const changeKeyframe = (
    index: number,
    changes: Partial<Pick<ShowPropertyAnimationKeyframe, 'timeMs' | 'value' | 'easing'>>,
  ) => {
    if (track) {
      const keyframes = [...track.keyframes]
        .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
      const keyframe = keyframes[index]
      if (!keyframe) return
      context.onChange({
        kind: 'update-keyframe',
        trackId: track.id,
        keyframeId: keyframe.id,
        changes,
      })
      return
    }
    if (index !== 0 && index !== 1) return
    const next = draft.map((keyframe, candidateIndex) => (
      candidateIndex === index ? { ...keyframe, ...changes } : keyframe
    )) as [DraftKeyframe, DraftKeyframe]
    commitDraft(next)
  }
  const linked = option.target.kind === 'instance-time-scale' || option.target.kind === 'instance-control'

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-label={`${option.label} animation`}
      data-show-detail-owned-portal="true"
      className="fixed z-[130] w-[278px] overflow-hidden rounded-md border border-violet-300/35 bg-zinc-950 shadow-[0_14px_40px_-14px_rgba(0,0,0,0.95)]"
      style={{ left, top }}
    >
      <div className="flex h-7 items-center gap-1.5 border-b border-zinc-800 bg-violet-300/[0.06] px-2">
        <Diamond size={9} fill={track ? 'currentColor' : 'none'} aria-hidden className="text-violet-300" />
        <strong className="truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-violet-200">
          {option.label} animates
        </strong>
      </div>
      <div className="p-2">
        {ordered.map((keyframe, index) => {
          const isLast = index === ordered.length - 1
          const edge = index === 0 ? 'from' : isLast ? 'to' : `keyframe ${index + 1}`
          const display = index === 0 ? 'From' : isLast ? 'To' : `K${index + 1}`
          const keyframeId = track ? (keyframe as ShowPropertyAnimationKeyframe).id : String(index)
          return (
            <Fragment key={keyframeId}>
              <KeyframeRow
                edge={edge}
                display={display}
                option={option}
                keyframe={keyframe}
                context={context}
                onValueChange={(value) => changeKeyframe(index, { value })}
                onTimeChange={(seconds) => changeKeyframe(index, {
                  timeMs: showPropertyAnimationLocalTimeMs(context, seconds),
                })}
                onDelete={track && ordered.length > 2 && index > 0 && !isLast
                  // Interior keyframes only: an endpoint owns the value the
                  // track holds before its first and after its last keyframe,
                  // so deleting one silently rewrites the surrounding holds.
                  ? () => context.onChange({
                      kind: 'delete-keyframe',
                      trackId: track.id,
                      keyframeId: (keyframe as ShowPropertyAnimationKeyframe).id,
                    })
                  : undefined}
              />
              {!isLast && (
                // Easing belongs to the segment leaving this keyframe, so its
                // control sits between the two keyframes it connects.
                <label className="mb-1.5 grid grid-cols-[24px_minmax(0,1fr)_16px] items-center gap-1 text-[8px] uppercase tracking-[0.1em] text-zinc-600">
                  <span aria-hidden className="self-center text-center text-zinc-700">~</span>
                  <select
                    aria-label={`${option.label} animation easing${index > 0 ? ` after keyframe ${index + 1}` : ''}`}
                    value={showEasingOptionId(keyframe.easing)}
                    onChange={(event) => changeKeyframe(index, {
                      easing: showEasingFromOptionId(event.target.value),
                    })}
                    className="h-6 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-[9.5px] normal-case tracking-normal text-zinc-200 outline-none focus:border-violet-300/70"
                  >
                    {SHOW_EASING_OPTIONS.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                    ))}
                  </select>
                  <span aria-hidden />
                </label>
              )}
            </Fragment>
          )
        })}
        {linked && context.instanceUseCount > 1 && (
          <p className="mt-2 text-[8.5px] text-cyan-300/70">
            Affects {context.instanceUseCount} linked Clips
          </p>
        )}
      </div>
      <div className="flex min-h-7 items-center gap-1 border-t border-zinc-800 px-2 text-[8.5px] text-zinc-500">
        <span>Show-global time</span>
        {track && (
          <button
            type="button"
            aria-label={`Add ${option.label} keyframe`}
            onClick={() => {
              const insertion = keyframeInsertionFor(track, option)
              if (!insertion) return
              context.onChange({ kind: 'add-keyframe', trackId: track.id, keyframe: insertion })
            }}
            className="ml-auto flex h-5 items-center gap-1 rounded px-1 text-violet-300 hover:bg-violet-950/40 hover:text-violet-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet-300"
          >
            <Diamond size={9} aria-hidden /> Add keyframe
          </button>
        )}
        {track && (
          <button
            type="button"
            aria-label={`Remove ${option.label} animation`}
            onClick={() => {
              context.onChange({ kind: 'delete-track', trackId: track.id })
              onClose()
              window.setTimeout(() => anchor?.focus(), 0)
            }}
            className="flex h-5 items-center gap-1 rounded px-1 text-red-400 hover:bg-red-950/30 hover:text-red-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-red-300"
          >
            <Trash2 size={9} aria-hidden /> Remove
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * A new keyframe lands at the midpoint of the largest splittable time gap,
 * carrying the curve's evaluated value there. Linear segments are preferred
 * because splitting one leaves the rendered animation unchanged; splitting a
 * curved segment re-eases each half over its shorter interval, so it is the
 * fallback rather than the default. The value is clamped to the property's
 * bounds because valid easing curves may overshoot them mid-segment, and an
 * out-of-bounds keyframe would be rejected by validation.
 */
function keyframeInsertionFor(
  track: ShowPropertyAnimationTrack,
  option: ShowPropertyAnimationOption,
): DraftKeyframe | null {
  const ordered = [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  const largestGapIndex = (linearOnly: boolean): number => {
    let bestIndex = -1
    let bestGap = 1
    ordered.forEach((keyframe, index) => {
      if (index === 0) return
      if (linearOnly && ordered[index - 1].easing.curve !== 'linear') return
      const gap = keyframe.timeMs - ordered[index - 1].timeMs
      if (gap > bestGap) {
        bestGap = gap
        bestIndex = index
      }
    })
    return bestIndex
  }
  const bestIndex = largestGapIndex(true) >= 0 ? largestGapIndex(true) : largestGapIndex(false)
  if (bestIndex < 0) return null
  const left = ordered[bestIndex - 1]
  const timeMs = Math.round(left.timeMs + (ordered[bestIndex].timeMs - left.timeMs) / 2)
  return {
    timeMs,
    value: Math.min(option.max, Math.max(option.min, evaluateShowPropertyTrack(track, timeMs))),
    easing: structuredClone(left.easing),
  }
}

type DraftKeyframe = Omit<ShowPropertyAnimationKeyframe, 'id'>

function draftFor(
  option: ShowPropertyAnimationOption,
  storageDurationMs: number,
): [DraftKeyframe, DraftKeyframe] {
  return [
    { timeMs: 0, value: option.value, easing: { curve: 'linear' } },
    { timeMs: storageDurationMs, value: option.value, easing: { curve: 'linear' } },
  ]
}

function KeyframeRow({
  edge,
  display,
  option,
  keyframe,
  context,
  onValueChange,
  onTimeChange,
  onDelete,
}: {
  edge: string
  display: string
  option: ShowPropertyAnimationOption
  keyframe: DraftKeyframe
  context: ShowPropertyAnimationEditorValue
  onValueChange: (value: number) => void
  onTimeChange: (seconds: number) => void
  onDelete?: () => void
}) {
  const accessiblePrefix = `${option.label} animation ${edge}`
  return (
    <div className="mb-1.5 grid grid-cols-[24px_minmax(0,1fr)_13px_minmax(0,1fr)_16px] items-end gap-1 last:mb-0">
      <span className="self-center text-[8px] uppercase tracking-[0.1em] text-zinc-600">{display}</span>
      <AnimationValueField
        option={option}
        edge={edge}
        value={keyframe.value}
        onChange={onValueChange}
      />
      <span className="self-center text-center text-[8px] text-zinc-600">at</span>
      <TimeField
        label={`${accessiblePrefix} time`}
        ariaLabel={`${accessiblePrefix} time`}
        hideLabel
        value={showPropertyAnimationGlobalSeconds(context, keyframe.timeMs)}
        min={showPropertyAnimationGlobalSeconds(context, 0)}
        max={showPropertyAnimationGlobalSeconds(context, context.storageDurationMs)}
        step={0.001}
        compact
        variant="inspector"
        onChange={onTimeChange}
      />
      {onDelete ? (
        <button
          type="button"
          aria-label={`Delete ${accessiblePrefix}`}
          onClick={onDelete}
          className="grid size-5 place-items-center self-center rounded text-zinc-500 hover:bg-red-950/30 hover:text-red-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-red-300"
        >
          <Trash2 size={9} aria-hidden />
        </button>
      ) : (
        <span aria-hidden />
      )}
    </div>
  )
}

function AnimationValueField({
  option,
  edge,
  value,
  onChange,
}: {
  option: ShowPropertyAnimationOption
  edge: string
  value: number
  onChange: (value: number) => void
}) {
  const label = `${option.label} animation ${edge}`
  if (option.presentation === 'percentage') {
    return (
      <PercentageField
        label={label}
        ariaLabel={label}
        hideLabel
        value={value}
        min={option.min}
        max={option.max}
        step={option.step}
        compact
        variant="inspector"
        onChange={onChange}
      />
    )
  }
  if (option.presentation === 'multiplier') {
    return (
      <DomainNumberField
        label={label}
        ariaLabel={label}
        hideLabel
        presentation="multiplier"
        value={value}
        min={option.min}
        max={option.max}
        step={option.step}
        compact
        variant="inspector"
        onChange={onChange}
      />
    )
  }
  if (option.presentation === 'degrees') {
    return (
      <NumberField
        label={label}
        ariaLabel={`${label} degrees`}
        hideLabel
        value={value * 360}
        min={option.min * 360}
        max={option.max * 360}
        step={option.step * 360}
        suffix="°"
        compact
        variant="inspector"
        onChange={(degrees) => onChange(degrees / 360)}
      />
    )
  }
  return (
    <NumberField
      label={label}
      ariaLabel={label}
      hideLabel
      value={value}
      min={option.min}
      max={option.max}
      step={option.step}
      compact
      variant="inspector"
      onChange={onChange}
    />
  )
}
