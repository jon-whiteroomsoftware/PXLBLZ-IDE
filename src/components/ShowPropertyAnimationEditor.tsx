import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Diamond, Trash2 } from 'lucide-react'
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
import { propertyTargetKey } from '@/engine/showPropertyAnimation'
import {
  showPropertyAnimationGlobalSeconds,
  showPropertyAnimationLocalTimeMs,
  type ShowPropertyAnimationChange,
  type ShowPropertyAnimationOption,
} from '@/engine/showPropertyAnimationEditorModel'

interface ShowPropertyAnimationEditorValue {
  options: ShowPropertyAnimationOption[]
  tracks: ShowPropertyAnimationTrack[]
  storageDurationMs: number
  showTimeOffsetMs: number
  instanceUseCount: number
  activeKey: string | null
  setActiveKey: (key: string | null) => void
  onChange: (change: ShowPropertyAnimationChange) => boolean | void
}

const ShowPropertyAnimationEditorContext = createContext<ShowPropertyAnimationEditorValue | null>(null)

export function ShowPropertyAnimationProvider({
  options,
  tracks,
  storageDurationMs,
  showTimeOffsetMs,
  instanceUseCount,
  onChange,
  children,
}: {
  options: ShowPropertyAnimationOption[]
  tracks: ShowPropertyAnimationTrack[]
  storageDurationMs: number
  showTimeOffsetMs: number
  instanceUseCount: number
  onChange: (change: ShowPropertyAnimationChange) => boolean | void
  children: ReactNode
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const value = useMemo(() => ({
    options,
    tracks,
    storageDurationMs,
    showTimeOffsetMs,
    instanceUseCount,
    activeKey,
    setActiveKey,
    onChange,
  }), [
    activeKey,
    instanceUseCount,
    onChange,
    options,
    showTimeOffsetMs,
    storageDurationMs,
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
    ? `Edit the two-point ${accessibleLabel} animation`
    : `Create a two-point ${accessibleLabel} ramp and open its editor`
  return (
    <>
      <button
        type="button"
        aria-label={animated ? `Edit ${accessibleLabel} animation` : `Animate ${accessibleLabel}`}
        aria-expanded={open}
        title={title}
        data-animated={animated ? 'true' : 'false'}
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
  const from = ordered[0]
  const to = ordered[1]
  const twoPointTrack = ordered.length === 2 && from && to
  const rect = anchor?.getBoundingClientRect()
  const left = Math.max(8, Math.min(
    typeof window === 'undefined' ? 8 : window.innerWidth - 258,
    (rect?.right ?? 258) - 250,
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
    index: 0 | 1,
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
      className="fixed z-[130] w-[250px] overflow-hidden rounded-md border border-violet-300/35 bg-zinc-950 shadow-[0_14px_40px_-14px_rgba(0,0,0,0.95)]"
      style={{ left, top }}
    >
      <div className="flex h-7 items-center gap-1.5 border-b border-zinc-800 bg-violet-300/[0.06] px-2">
        <Diamond size={9} fill={track ? 'currentColor' : 'none'} aria-hidden className="text-violet-300" />
        <strong className="truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-violet-200">
          {option.label} animates
        </strong>
      </div>
      {twoPointTrack ? (
        <div className="p-2">
          <KeyframeRow
            edge="from"
            option={option}
            keyframe={from}
            context={context}
            onValueChange={(value) => changeKeyframe(0, { value })}
            onTimeChange={(seconds) => changeKeyframe(0, {
              timeMs: showPropertyAnimationLocalTimeMs(context, seconds),
            })}
          />
          <KeyframeRow
            edge="to"
            option={option}
            keyframe={to}
            context={context}
            onValueChange={(value) => changeKeyframe(1, { value })}
            onTimeChange={(seconds) => changeKeyframe(1, {
              timeMs: showPropertyAnimationLocalTimeMs(context, seconds),
            })}
          />
          <label className="mt-2 block text-[8px] uppercase tracking-[0.1em] text-zinc-600">
            Easing
            <select
              aria-label={`${option.label} animation easing`}
              value={showEasingOptionId(from.easing)}
              onChange={(event) => changeKeyframe(0, {
                easing: showEasingFromOptionId(event.target.value),
              })}
              className="mt-1 h-6 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-[9.5px] normal-case tracking-normal text-zinc-200 outline-none focus:border-violet-300/70"
            >
              {SHOW_EASING_OPTIONS.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
              ))}
            </select>
          </label>
          {linked && context.instanceUseCount > 1 && (
            <p className="mt-2 text-[8.5px] text-cyan-300/70">
              Affects {context.instanceUseCount} linked Clips
            </p>
          )}
        </div>
      ) : (
        <p className="p-2 text-[9px] leading-4 text-zinc-400">
          This stored track has {ordered.length} keyframes. Use the Property animation list below to edit it without losing points.
        </p>
      )}
      <div className="flex min-h-7 items-center border-t border-zinc-800 px-2 text-[8.5px] text-zinc-500">
        <span>Show-global time</span>
        {track && (
          <button
            type="button"
            aria-label={`Remove ${option.label} animation`}
            onClick={() => {
              context.onChange({ kind: 'delete-track', trackId: track.id })
              onClose()
              window.setTimeout(() => anchor?.focus(), 0)
            }}
            className="ml-auto flex h-5 items-center gap-1 rounded px-1 text-red-400 hover:bg-red-950/30 hover:text-red-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-red-300"
          >
            <Trash2 size={9} aria-hidden /> Remove
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
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
  option,
  keyframe,
  context,
  onValueChange,
  onTimeChange,
}: {
  edge: 'from' | 'to'
  option: ShowPropertyAnimationOption
  keyframe: DraftKeyframe
  context: ShowPropertyAnimationEditorValue
  onValueChange: (value: number) => void
  onTimeChange: (seconds: number) => void
}) {
  const edgeLabel = edge === 'from' ? 'From' : 'To'
  const accessiblePrefix = `${option.label} animation ${edge}`
  return (
    <div className="mb-1.5 grid grid-cols-[24px_minmax(0,1fr)_13px_minmax(0,1fr)] items-end gap-1 last:mb-0">
      <span className="self-center text-[8px] uppercase tracking-[0.1em] text-zinc-600">{edgeLabel}</span>
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
  edge: 'from' | 'to'
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
