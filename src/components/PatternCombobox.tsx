import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { IDE_MICROTYPE } from '@/components/ui/ideMicrotype'
import { usePatternMruStore } from '@/store/patternMruStore'

export interface PatternComboboxOption {
  value: string
  label: string
  group: 'Personal' | 'Built-in'
}

// With ~10-12 rows visible before scrolling, a Recent section this deep keeps
// the next pick on screen most of the time without burying the full catalogue.
const RECENT_DISPLAY_LIMIT = 12

type DisplayOption = Omit<PatternComboboxOption, 'group'> & {
  group: PatternComboboxOption['group'] | 'Recent'
}

export function PatternCombobox({
  ariaLabel,
  value,
  options,
  placeholder = 'Find a Pattern...',
  disabled = false,
  compact = false,
  className = '',
  onChange,
  onCommit,
}: {
  ariaLabel: string
  value: string | null
  options: PatternComboboxOption[]
  placeholder?: string
  disabled?: boolean
  compact?: boolean
  className?: string
  onChange: (value: string) => void
  onCommit?: () => void
}) {
  const selected = options.find((option) => option.value === value)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const recentValues = usePatternMruStore((state) => state.values)
  const recordPatternUse = usePatternMruStore((state) => state.recordPatternUse)
  const filteredOptions = useMemo<DisplayOption[]>(() => {
    const search = query.trim().toLocaleLowerCase()
    if (!search || query === selected?.label) {
      // Untyped: recently used Patterns lead, newest first, then the full
      // catalogue in its usual grouped order without repeating them.
      const optionByValue = new Map(options.map((option) => [option.value, option]))
      const recent = recentValues
        .flatMap((candidate) => {
          const option = optionByValue.get(candidate)
          return option ? [{ ...option, group: 'Recent' as const }] : []
        })
        .slice(0, RECENT_DISPLAY_LIMIT)
      const recentSet = new Set(recent.map((option) => option.value))
      return [...recent, ...options.filter((option) => !recentSet.has(option.value))]
    }
    return options
      .filter((option) => option.label.toLocaleLowerCase().includes(search))
      .sort((left, right) => {
        const leftStarts = left.label.toLocaleLowerCase().startsWith(search)
        const rightStarts = right.label.toLocaleLowerCase().startsWith(search)
        if (leftStarts !== rightStarts) return leftStarts ? -1 : 1
        return left.label.localeCompare(right.label)
      })
  }, [options, query, selected?.label, recentValues])
  const showGroups = new Set(filteredOptions.map((option) => option.group)).size > 1

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  function choose(option: DisplayOption) {
    setQuery(option.label)
    setOpen(false)
    setActiveIndex(0)
    recordPatternUse(option.value)
    onChange(option.value)
    // Selection ends the editing session: release keyboard focus so transport
    // shortcuts (Space and friends) work immediately after picking.
    inputRef.current?.blur()
    window.setTimeout(() => onCommit?.(), 0)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => Math.min(filteredOptions.length - 1, open ? index + 1 : 0))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => Math.max(0, open ? index - 1 : filteredOptions.length - 1))
      return
    }
    if (event.key === 'Enter' && open && filteredOptions[activeIndex]) {
      event.preventDefault()
      choose(filteredOptions[activeIndex])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      setActiveIndex(0)
      // Abandoning the search also ends the editing session; the display
      // falls back to the current selection.
      inputRef.current?.blur()
    }
  }

  return (
    <div ref={containerRef} className={`relative w-full normal-case tracking-normal ${compact ? '' : 'mt-1'} ${className}`}>
      <input
        ref={inputRef}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={!disabled && open}
        aria-activedescendant={open && filteredOptions[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
        value={editing ? query : selected?.label ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        readOnly={!editing}
        onFocus={() => {
          // A selected Pattern name is never edited, only replaced: entering
          // the field starts a fresh search over the full catalogue.
          setEditing(true)
          setQuery('')
          setOpen(true)
          setActiveIndex(0)
        }}
        onBlur={() => {
          setEditing(false)
          setOpen(false)
          setActiveIndex(0)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActiveIndex(0)
        }}
        onKeyDown={handleKeyDown}
        className={`${compact ? 'h-5 pl-[5px] pr-[23px] text-[9px]' : 'h-7 pl-2 pr-7 text-xs'} w-full rounded border border-zinc-700 bg-zinc-900 text-zinc-200 outline-none focus:border-live/70 disabled:cursor-default disabled:border-zinc-800 disabled:bg-zinc-950/35 disabled:text-zinc-500 ${editing ? '' : 'cursor-pointer select-none'}`}
      />
      <Search size={compact ? 10 : 12} aria-hidden className={`pointer-events-none absolute right-2 ${compact ? 'top-[5px]' : 'top-2'} text-zinc-500`} />
      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${ariaLabel} matches`}
          // Keep focus in the input while interacting with the list (option
          // clicks and scrollbar drags), so blur only means leaving the field.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
        >
          {filteredOptions.length === 0 ? (
            <div className={`px-2 py-2 ${compact ? 'text-[10px]' : 'text-xs'} text-zinc-500`}>No matching Patterns</div>
          ) : filteredOptions.map((option, index) => {
            const previousGroup = filteredOptions[index - 1]?.group
            return (
              <div key={option.value}>
                {showGroups && option.group !== previousGroup && (
                  <div role="presentation" className={`px-2 pb-1 pt-2 font-semibold uppercase tracking-wider first:pt-1 ${IDE_MICROTYPE.required.className}`}>
                    {option.group}
                  </div>
                )}
                <button
                  id={`${listboxId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={`block w-full truncate px-2 text-left ${compact ? 'py-[3px] text-[10px]' : 'py-1 text-xs'} ${index === activeIndex
                    ? 'bg-zinc-800 text-zinc-100'
                    : option.value === value
                      ? 'text-live'
                      : 'text-zinc-300 hover:bg-zinc-800'}`}
                >
                  {option.label}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
