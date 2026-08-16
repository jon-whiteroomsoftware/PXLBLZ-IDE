import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { HelpHint } from '@/components/HelpHint'

// The shared dashboard-deck template (#198). These presentational primitives were
// extracted from the preview control deck so the preview deck and the live
// Controller panel render from one common layout vocabulary — section headers,
// the 2-col label/value grid, label/value cells, and read-only telemetry readouts.
// Making the template shared makes UI consistency *structural*: the two dashboards
// can't drift apart without changing this file. Pure presentation — every primitive
// is fed by props; what fills it (preview settings vs. live Controller state) is the
// caller's concern. No store reads, no engine imports.

// A help card for a deck section: a one-line framing of what the section *is*, then
// a label-keyed list of its controls. Brief, aimed at someone who already knows
// Pixelblaze — what each control does, not how it's implemented.
export function DeckSectionHint({
  heading,
  intro,
  items,
}: {
  heading?: string
  intro?: string
  items: [string, string][]
}) {
  return (
    <div className="flex flex-col gap-2 normal-case tracking-normal">
      {heading && <h5 className="font-semibold text-zinc-100 leading-snug">{heading}</h5>}
      {intro && <p className="text-zinc-300 leading-snug">{intro}</p>}
      <div className="flex flex-col gap-1.5">
        {items.map(([label, desc]) => (
          <div key={label} className="leading-snug">
            <span className="text-zinc-200">{label}</span>
            <span className="text-zinc-400"> — {desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// A labeled deck section (#174): an amber section header with an optional help hint.
// Sections own their own header + spacing; the grids inside set the columns.
const deckSectionExpandedByKey = new Map<string, boolean>()

export function resetDeckSectionPersistenceForTests(): void {
  deckSectionExpandedByKey.clear()
}

export function DeckSection({
  label,
  hint,
  collapsible = false,
  defaultExpanded = true,
  persistKey,
  summary,
  flushTop = false,
  children,
}: {
  label: string
  hint?: ReactNode
  collapsible?: boolean
  defaultExpanded?: boolean
  persistKey?: string
  summary?: ReactNode
  flushTop?: boolean
  children: ReactNode
}) {
  const [expanded, setExpandedState] = useState(
    persistKey && deckSectionExpandedByKey.has(persistKey)
      ? deckSectionExpandedByKey.get(persistKey)!
      : defaultExpanded,
  )
  const setExpanded = (next: boolean) => {
    if (persistKey) deckSectionExpandedByKey.set(persistKey, next)
    setExpandedState(next)
  }
  const contentVisible = !collapsible || expanded

  return (
    <div
      data-expanded={contentVisible}
      data-deck="section"
      className={`${flushTop ? 'mt-0 pt-0.5' : 'mt-0.5 pt-1'} ${contentVisible ? 'pb-1.5' : 'pb-0'}`}
    >
      {collapsible ? (
        <DeckDisclosureHeader
          label={label}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
          summary={expanded ? undefined : summary}
          hint={hint && (
            <HelpHint label={`About the ${label} section`} width={320}>
              {hint}
            </HelpHint>
          )}
          className={expanded || !summary
            ? `${expanded ? 'mb-1' : 'mb-0'} h-[18px]`
            : 'mb-0'}
        />
      ) : (
        <div
          className="mb-1 flex h-[18px] items-center gap-1.5"
          data-deck="section-header"
        >
          <h4 className="text-[10.5px] font-semibold text-structural uppercase tracking-wider">
            {label}
          </h4>
          {hint && (
            <HelpHint label={`About the ${label} section`} width={320}>
              {hint}
            </HelpHint>
          )}
        </div>
      )}
      {contentVisible && children}
    </div>
  )
}

export function DeckDisclosureHeader({
  label,
  expanded,
  onToggle,
  hint,
  summary,
  className = '',
}: {
  label: string
  expanded: boolean
  onToggle: () => void
  hint?: ReactNode
  summary?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex gap-1.5 ${summary ? 'items-start' : 'items-center'} ${className}`}
      data-deck="section-header"
    >
      <h4 className="min-w-0 flex-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={label}
          onClick={onToggle}
          className={`flex h-full w-full items-center gap-x-1 text-left text-[10.5px] font-semibold uppercase tracking-wider text-structural transition-colors hover:text-live ${summary ? 'flex-wrap gap-y-0.5' : ''}`}
        >
          <span className="shrink-0">{label}</span>
          <ChevronDown
            size={17}
            className={`shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
          />
          {summary && (
            <span
              className="order-last w-full shrink-0 whitespace-nowrap text-left text-[10.5px] font-normal normal-case tracking-normal"
              data-deck="section-summary"
              data-testid="deck-section-summary"
            >
              {summary}
            </span>
          )}
        </button>
      </h4>
      {hint}
    </div>
  )
}

// The deck's shared 2-col label/value grid. Slider cells (label above) and label/value
// cells share the same columns so the whole deck stays aligned. Slider rows keep a
// roomier 5px rhythm; compact label/value rows tighten to 3px.
export function DeckGrid({
  gapY = 'gap-y-[5px]',
  className = '',
  children,
}: {
  gapY?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-x-4 ${gapY} items-center ${className}`}
      data-deck="grid"
      data-gap={gapY}
    >
      {children}
    </div>
  )
}

// One label/value cell on the deck's shared grid: label flush left, the control flush
// right.
export function DeckCell({
  label,
  className = '',
  labelClassName = '',
  children,
}: {
  label: string
  className?: string
  /** Extra classes for the label span. Pass `shrink-0` on a row whose *value* is the
   *  payload and has to win the width fight — otherwise the label, being the only other
   *  shrinkable child, gets chewed down to "m.." once the value has already hit zero
   *  (#757). The default stays shrinkable: in the pattern-controls grid a long
   *  user-authored control label truncating is the right outcome. */
  labelClassName?: string
  children: ReactNode
}) {
  return (
    <div
      className={`flex min-w-0 items-center justify-between gap-2 leading-[1.3] ${className}`}
      data-deck="cell"
    >
      <span className={`text-zinc-400 truncate ${labelClassName}`}>{label}</span>
      {children}
    </div>
  )
}

// A stacked (two-line) field: label above, the control below on its own full-width
// line. The interactive counterpart to DeckStat (and the stacked sibling of the inline
// DeckCell) — use it for a control whose value can be too long for the cramped
// label-left/control-right cell, e.g. the map dropdown's long names (#253).
export function DeckField({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-[3px] ${className}`} data-deck="field">
      <span className="truncate text-zinc-400 leading-tight">{label}</span>
      {children}
    </div>
  )
}

// A read-only telemetry cell (fps/elapsed/layout/pattern): a DeckCell whose value is
// the live amber readout.
export function DeckTelemetry({ label, value }: { label: string; value: string }) {
  return (
    <DeckCell label={label}>
      <span className="text-live tabular-nums truncate">{value}</span>
    </DeckCell>
  )
}

// A stacked (two-line) read-only stat: label above, the live amber value below — the
// text counterpart to DeckSlider's stacked layout. Use it for a value that needs the
// full cell width (a long pattern name) where the one-line DeckTelemetry would clip.
export function DeckStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px]" data-deck="stat">
      <span className="truncate text-zinc-400 leading-tight">{label}</span>
      <span className="text-live truncate">{value}</span>
    </div>
  )
}
