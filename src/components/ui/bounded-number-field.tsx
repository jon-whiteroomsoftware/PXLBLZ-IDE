import { createPortal } from 'react-dom'
import { GripVertical } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  clampPercentageValue,
  percentageSliderPlacement,
  percentageValueFromPointer,
  type PercentageSliderPlacement,
} from '@/engine/percentageValue'

export interface BoundedNumberPresentation {
  kindLabel: string
  suffix?: string
  min: number
  max: number
  step: number
  neutralPosition?: number
  format: (value: number) => string
  parse: (draft: string) => number | null
  formatDraft?: (value: number) => string
  parseDraft?: (draft: string) => number | null
  toSliderPosition: (value: number) => number
  fromSliderPosition: (position: number) => number
}

export interface BoundedNumberFieldProps {
  label: string
  ariaLabel?: string
  value: number
  presentation: BoundedNumberPresentation
  help?: string
  hideLabel?: boolean
  compact?: boolean
  align?: 'left' | 'right'
  disabled?: boolean
  variant?: 'inspector' | 'editor'
  onPreview?: (value: number) => void
  onPreviewEnd?: () => void
  onChange: (value: number) => void
}

export function BoundedNumberField({
  label,
  ariaLabel,
  value,
  presentation,
  help,
  hideLabel = false,
  compact = false,
  align,
  disabled = false,
  variant = 'inspector',
  onPreview,
  onPreviewEnd,
  onChange,
}: BoundedNumberFieldProps) {
  const {
    kindLabel,
    suffix,
    min,
    max,
    step,
    neutralPosition,
    format,
    parse,
    formatDraft = format,
    parseDraft = parse,
    toSliderPosition,
    fromSliderPosition,
  } = presentation
  const inputId = useId()
  const canonicalValue = formatDraft(value)
  const [draft, setDraft] = useState(canonicalValue)
  const [slider, setSlider] = useState<(PercentageSliderPlacement & { pinned: boolean }) | null>(null)
  const [sliderValue, setSliderValue] = useState(value)
  const sliderValueRef = useRef(value)
  const sliderPointerIdRef = useRef<number | null>(null)
  const focusedRef = useRef(false)
  const dirtyRef = useRef(false)
  const sliderRef = useRef<HTMLInputElement>(null)
  const previewActiveRef = useRef(false)
  const onPreviewEndRef = useRef(onPreviewEnd)
  const pointerSessionRef = useRef<{
    pointerId: number
    startX: number
    currentValue: number
    moved: boolean
    placement: PercentageSliderPlacement
  } | null>(null)

  useEffect(() => {
    if (!focusedRef.current) setDraft(canonicalValue)
  }, [canonicalValue])

  useEffect(() => {
    onPreviewEndRef.current = onPreviewEnd
  }, [onPreviewEnd])

  useEffect(() => () => {
    if (previewActiveRef.current) onPreviewEndRef.current?.()
  }, [])

  const endPreview = () => {
    if (!previewActiveRef.current) return
    previewActiveRef.current = false
    onPreviewEndRef.current?.()
  }
  const revert = () => {
    dirtyRef.current = false
    setDraft(canonicalValue)
  }
  const commit = (raw: string) => {
    focusedRef.current = false
    if (!dirtyRef.current) {
      setDraft(canonicalValue)
      return
    }
    const parsed = parseDraft(raw)
    if (parsed === null) {
      revert()
      return
    }
    const bounded = clampPercentageValue(parsed, min, max)
    dirtyRef.current = false
    setDraft(formatDraft(bounded))
    if (bounded !== value) onChange(bounded)
  }
  const onExactKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      focusedRef.current = false
      event.currentTarget.value = canonicalValue
      revert()
      event.currentTarget.blur()
    }
  }
  const previewSliderValue = (next: number) => {
    previewActiveRef.current = true
    sliderValueRef.current = next
    setSliderValue(next)
    setDraft(formatDraft(next))
    onPreview?.(next)
  }
  const closeSlider = () => {
    pointerSessionRef.current = null
    setSlider(null)
  }
  const cancelSlider = () => {
    endPreview()
    sliderValueRef.current = value
    setSliderValue(value)
    setDraft(canonicalValue)
    closeSlider()
  }
  const commitSlider = (next: number) => {
    endPreview()
    sliderValueRef.current = next
    setSliderValue(next)
    setDraft(formatDraft(next))
    closeSlider()
    if (next !== value) onChange(next)
  }
  const placeSlider = (anchor: DOMRect, pointerX: number) => percentageSliderPlacement({
    pointerX,
    anchorTop: anchor.top,
    anchorBottom: anchor.bottom,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    value: toSliderPosition(value),
    min: 0,
    max: 1,
  })
  const valueFromPointer = (pointerX: number, placement: PercentageSliderPlacement) => {
    const position = percentageValueFromPointer(
      pointerX,
      placement.trackLeft,
      placement.trackWidth,
      0,
      1,
      0.001,
    )
    return Number(clampPercentageValue(fromSliderPosition(position), min, max).toFixed(10))
  }
  const openSlider = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    const rect = event.currentTarget.getBoundingClientRect()
    const placement = placeSlider(rect, event.clientX)
    pointerSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      currentValue: value,
      moved: false,
      placement,
    }
    sliderValueRef.current = value
    setSliderValue(value)
    setSlider({ ...placement, pinned: false })
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveSlider = (event: PointerEvent<HTMLButtonElement>) => {
    const session = pointerSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    if (!session.moved && Math.abs(event.clientX - session.startX) < 3) return
    session.moved = true
    const next = valueFromPointer(event.clientX, session.placement)
    if (next === session.currentValue) return
    session.currentValue = next
    previewSliderValue(next)
  }
  const releaseSlider = (event: PointerEvent<HTMLButtonElement>) => {
    const session = pointerSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    pointerSessionRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (session.moved) {
      commitSlider(session.currentValue)
      return
    }
    setSlider((current) => current ? { ...current, pinned: true } : current)
    window.setTimeout(() => sliderRef.current?.focus(), 0)
  }
  const openPinnedSlider = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const placement = placeSlider(rect, rect.left + rect.width / 2)
    pointerSessionRef.current = null
    sliderValueRef.current = value
    setSliderValue(value)
    setSlider({ ...placement, pinned: true })
    window.setTimeout(() => sliderRef.current?.focus(), 0)
  }

  const inspector = variant === 'inspector'
  const resolvedAlign = align ?? (inspector ? 'right' : 'left')
  const labelClass = inspector
    ? 'min-w-0 text-[9px] uppercase tracking-[0.1em] text-zinc-600'
    : `min-w-0 uppercase text-zinc-600 ${compact ? 'text-[9px] tracking-[0.08em]' : 'text-[10px]'}`
  const fieldHeight = inspector ? 'h-5' : compact ? 'h-6' : 'h-7'
  const fieldBackground = inspector || compact ? 'bg-zinc-950' : 'bg-zinc-900'
  const textSize = inspector ? (compact ? 'text-[9px]' : 'text-[9.5px]') : (compact ? 'text-[9.5px]' : 'text-xs')

  return (
    <div className={labelClass} title={help}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : ''}>{label}</label>
      <span className={`${hideLabel ? '' : 'mt-1'} flex min-w-0 items-center gap-1`}>
        <span className={`${fieldHeight} ${fieldBackground} flex min-w-0 flex-1 overflow-hidden rounded border border-zinc-700 focus-within:border-cyan-400/60`}>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            aria-label={`${ariaLabel ?? label} exact ${kindLabel}`}
            title={help}
            value={draft}
            disabled={disabled}
            onFocus={() => {
              focusedRef.current = true
              dirtyRef.current = false
            }}
            onChange={(event) => {
              dirtyRef.current = true
              setDraft(event.currentTarget.value)
            }}
            onBlur={(event) => commit(event.currentTarget.value)}
            onKeyDown={onExactKeyDown}
            className={`min-w-0 flex-1 bg-transparent px-1.5 tabular-nums normal-case tracking-normal text-zinc-200 outline-none disabled:cursor-default disabled:opacity-60 ${textSize} ${resolvedAlign === 'left' ? 'text-left' : 'text-right'}`}
          />
          <button
            type="button"
            aria-label={`Adjust ${ariaLabel ?? label} with slider`}
            aria-expanded={slider !== null}
            disabled={disabled}
            onPointerDown={openSlider}
            onPointerMove={moveSlider}
            onPointerUp={releaseSlider}
            onKeyDown={openPinnedSlider}
            onPointerCancel={cancelSlider}
            onLostPointerCapture={() => {
              if (pointerSessionRef.current) cancelSlider()
            }}
            className="grid w-[18px] shrink-0 touch-none place-items-center border-l border-zinc-700 text-zinc-600 hover:bg-zinc-800 hover:text-cyan-300 focus:outline-none focus-visible:bg-zinc-800 focus-visible:text-cyan-300 disabled:cursor-default disabled:opacity-40"
          >
            <GripVertical size={12} aria-hidden />
          </button>
        </span>
        {suffix && (
          <span
            aria-hidden
            data-unit-suffix={suffix}
            className="shrink-0 text-[10px] normal-case tracking-normal text-zinc-500"
          >
            {suffix}
          </span>
        )}
      </span>
      {slider && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="false"
          aria-label={`${ariaLabel ?? label} slider controls`}
          className="fixed z-[120] flex items-center rounded-md border border-cyan-400/35 bg-zinc-950 px-4 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          style={{ left: slider.left, top: slider.top, width: slider.width, height: slider.height }}
        >
          <div className="relative flex w-full items-center">
            {neutralPosition !== undefined && (
              <span
                data-testid="domain-number-neutral"
                aria-hidden
                className="pointer-events-none absolute top-1/2 z-10 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-cyan-200/75 shadow-[0_0_4px_rgba(165,243,252,0.55)]"
                style={{ left: `${neutralPosition * 100}%` }}
              />
            )}
            <input
              ref={sliderRef}
              type="range"
              aria-label={`${ariaLabel ?? label} ${kindLabel} slider`}
              aria-valuetext={format(sliderValue)}
              min={0}
              max={1}
              step={0.001}
              value={toSliderPosition(sliderValue)}
              onPointerDown={(event) => {
                sliderPointerIdRef.current = event.pointerId
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onInput={(event) => previewSliderValue(Number(
                clampPercentageValue(
                  fromSliderPosition(Number(event.currentTarget.value)),
                  min,
                  max,
                ).toFixed(10),
              ))}
              onPointerUp={(event) => {
                if (sliderPointerIdRef.current !== event.pointerId) return
                sliderPointerIdRef.current = null
                event.currentTarget.releasePointerCapture(event.pointerId)
                commitSlider(sliderValueRef.current)
              }}
              onPointerCancel={() => {
                sliderPointerIdRef.current = null
                cancelSlider()
              }}
              onLostPointerCapture={() => {
                if (sliderPointerIdRef.current === null) return
                sliderPointerIdRef.current = null
                cancelSlider()
              }}
              onBlur={() => {
                if (slider.pinned && sliderPointerIdRef.current === null) {
                  commitSlider(sliderValueRef.current)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.stopPropagation()
                  commitSlider(sliderValueRef.current)
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  cancelSlider()
                  return
                }
                const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp'
                  ? step
                  : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                    ? -step
                    : null
                const next = event.key === 'Home'
                  ? min
                  : event.key === 'End'
                    ? max
                    : delta === null
                      ? null
                      : clampPercentageValue(sliderValue + delta, min, max)
                if (next === null) return
                event.preventDefault()
                event.stopPropagation()
                previewSliderValue(Number(next.toFixed(10)))
              }}
              className="w-full accent-cyan-400"
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
