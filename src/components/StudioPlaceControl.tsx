import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  Cpu,
  FileCode2,
  Film,
  Map as MapIcon,
  type LucideIcon,
} from 'lucide-react'
import {
  STUDIO_PLACES,
  moveStudioPlaceFocus,
  studioPlaceDefinition,
  studioPlaceTypeaheadIndex,
  type StudioPlaceId,
} from '@/engine/studioPlaces'
import type { StudioEntityKind } from '@/engine/routes'

export type StudioPlaceDetails = Partial<Record<StudioEntityKind, string>>

const ICONS: Record<StudioPlaceId, LucideIcon> = {
  patterns: FileCode2,
  shows: Film,
  maps: MapIcon,
  controllers: Cpu,
  mixins: Braces,
  libraries: BookOpen,
  docs: BookOpen,
  'api-reference': Braces,
}

export function StudioPlaceControl({
  current,
  details,
  onSelect,
  onPreviewSpace,
}: {
  current: StudioPlaceId
  details: StudioPlaceDetails
  onSelect: (place: StudioPlaceId) => void
  onPreviewSpace: () => void
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, STUDIO_PLACES.findIndex((place) => place.id === current)))
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const typeaheadRef = useRef('')
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listboxId = useId()
  const definition = studioPlaceDefinition(current)
  const CurrentIcon = ICONS[current]

  useEffect(() => () => {
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current)
  }, [])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside)
    return () => window.removeEventListener('pointerdown', closeOutside)
  }, [open])

  function focusOption(index: number) {
    setActiveIndex(index)
    optionRefs.current[index]?.focus()
  }

  function openList(preferredIndex = STUDIO_PLACES.findIndex((place) => place.id === current)) {
    const index = Math.max(0, preferredIndex)
    setOpen(true)
    setActiveIndex(index)
    window.setTimeout(() => optionRefs.current[index]?.focus(), 0)
  }

  function closeList(returnFocus: boolean) {
    setOpen(false)
    typeaheadRef.current = ''
    if (returnFocus) triggerRef.current?.focus()
  }

  function choose(place: StudioPlaceId) {
    closeList(true)
    onSelect(place)
  }

  function handleOptionKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      focusOption(moveStudioPlaceFocus(index, event.key === 'ArrowDown' ? 1 : -1))
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      event.stopPropagation()
      focusOption(event.key === 'Home' ? 0 : STUDIO_PLACES.length - 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      choose(STUDIO_PLACES[index].id)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeList(true)
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return
    event.preventDefault()
    event.stopPropagation()
    typeaheadRef.current += event.key.toLocaleLowerCase()
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current)
    typeaheadTimerRef.current = setTimeout(() => { typeaheadRef.current = '' }, 500)
    const match = studioPlaceTypeaheadIndex(typeaheadRef.current, index)
    if (match !== null) focusOption(match)
  }

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0" data-studio-place-shortcuts="local">
      <button
        ref={triggerRef}
        type="button"
        aria-label={definition.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        data-studio-space-preview="true"
        title={`${definition.label} · ${definition.shortcut}`}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={(event) => {
          if (event.code === 'Space') {
            // A focused button's native Space activation would open the menu.
            // Claim it here and delegate the established Preview action instead.
            event.preventDefault()
            event.stopPropagation()
            onPreviewSpace()
          } else if (event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            if (open) closeList(true)
            else openList()
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            event.stopPropagation()
            openList(event.key === 'ArrowDown' ? 0 : STUDIO_PLACES.length - 1)
          }
        }}
        className="inline-flex h-[32px] shrink-0 items-center gap-2 rounded-[7px] border border-amber-400/35 bg-amber-400/[0.08] px-2 font-mono text-[13px] font-semibold tracking-[0.01em] text-zinc-100 transition-colors hover:border-amber-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 max-[430px]:gap-1 max-[430px]:px-1"
      >
        <CurrentIcon size={18} aria-hidden className="shrink-0 text-live" />
        <span>{definition.label}</span>
        <ChevronDown size={14} aria-hidden className={`shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Places"
          aria-activedescendant={`${listboxId}-${STUDIO_PLACES[activeIndex].id}`}
          className="absolute left-0 top-[36px] z-[70] w-[300px] rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 font-mono text-[11px] text-zinc-300 shadow-2xl shadow-black/60"
        >
          {STUDIO_PLACES.map((place, index) => {
            const Icon = ICONS[place.id]
            const selected = place.id === current
            const detail = place.group === 'reference' ? undefined : details[place.id as StudioEntityKind]
            const startsGroup = index === 2 || index === 6
            return (
              <div key={place.id}>
                {startsGroup && <div role="separator" className="mx-0.5 my-1 border-t border-zinc-800" />}
                {index === 6 && (
                  <div className="px-2 pb-1 pt-0.5 text-[9px] uppercase tracking-[0.14em] text-zinc-500">Reference</div>
                )}
                <button
                  ref={(element) => { optionRefs.current[index] = element }}
                  id={`${listboxId}-${place.id}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => choose(place.id)}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  className={`flex min-h-9 w-full items-start gap-2 rounded-[5px] px-2 py-1.5 text-left hover:bg-white/[0.05] focus:bg-white/[0.05] focus:outline-none ${selected ? 'text-live' : 'text-zinc-300'}`}
                >
                  <Icon size={14} aria-hidden className={`mt-0.5 shrink-0 ${selected ? 'text-live' : 'text-zinc-400'}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="font-medium">{place.label}</span>
                    {detail && <span className={`truncate text-[10.5px] font-normal ${selected ? 'text-amber-300/70' : 'text-zinc-500'}`}>{detail}</span>}
                  </span>
                  {selected && <Check size={12} aria-hidden className="mt-1 shrink-0 text-live" />}
                  <kbd className="mt-0.5 shrink-0 font-mono text-[10px] font-normal text-zinc-500">{place.shortcut}</kbd>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
