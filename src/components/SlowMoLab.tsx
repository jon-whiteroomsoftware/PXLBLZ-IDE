import type { SlowMoPlan } from '@/engine/slowMo'
import { slowMoRateFromPosition } from '@/engine/slowMo'
import type { SlowMoDraft } from '@/engine/slowMoDraft'
import { DeckDisclosureHeader } from './Deck'
import { DeckSlider } from './DeckSlider'
import './SlowMoLab.css'

export interface SlowMoLabProps {
  draft: SlowMoDraft
  onChange: (draft: SlowMoDraft) => void
  declined: SlowMoPlan['declined'] | null
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onCopy?: () => void
  copyError?: string | null
}

export function SlowMoLab({ draft, onChange, declined, expanded, onExpandedChange, onCopy, copyError }: SlowMoLabProps) {
  return (
    <section aria-label="Slow-Mo" className="panel-section slowmo-section" data-expanded={expanded}>
      <DeckDisclosureHeader label="Slow-Mo" expanded={expanded} onToggle={() => onExpandedChange(!expanded)} summaryRow />
      <div className="panel-section-body">
        <div className="panel-fields">
          <DeckSlider
            label="speed"
            ariaLabel="Slow-mo speed"
            min={0}
            max={1}
            step={0.001}
            value={draft.position}
            format={(position) => `${Number(slowMoRateFromPosition(position).toFixed(3))}×`}
            onChange={(position) => onChange({ ...draft, position })}
          />
          <DeckSlider
            label="dreamy"
            ariaLabel="Slow-mo dreamy"
            min={0}
            max={1}
            step={0.001}
            value={draft.dreamy}
            presentation="percentage"
            onChange={(dreamy) => onChange({ ...draft, dreamy })}
          />
        </div>
        {declined && <p role="status" className="text-xs text-amber-400">{declined.message}</p>}
        {expanded && (
          <div className="mt-1">
            <button
              type="button"
              disabled={!onCopy}
              onClick={onCopy}
              className="text-xs text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-default"
            >Copy generated code</button>
            {copyError && <p role="status">{copyError}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
