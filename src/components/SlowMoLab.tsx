import type { SlowMoPlan } from '@/engine/slowMo'
import { slowMoRateFromPosition } from '@/engine/slowMo'
import type { SlowMoDraft } from '@/engine/slowMoDraft'
import { formatPercentageValue } from '@/engine/percentageValue'
import { DeckDisclosureHeader } from './Deck'
import { DeckSlider } from './DeckSlider'
import { PanelReadout } from './PanelReadout'
import './SlowMoLab.css'

export interface SlowMoLabProps {
  draft: SlowMoDraft
  onChange: (draft: SlowMoDraft) => void
  declined: SlowMoPlan['declined'] | null
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

export function SlowMoLab({ draft, onChange, declined, expanded, onExpandedChange }: SlowMoLabProps) {
  return (
    <section aria-label="Slow-Mo" className="panel-section slowmo-section" data-expanded={expanded}>
      <DeckDisclosureHeader label="Slow-Mo" expanded={expanded} onToggle={() => onExpandedChange(!expanded)} summaryRow
        summary={!expanded && <>
          <PanelReadout items={[
            { label: 'speed', value: `${Number(slowMoRateFromPosition(draft.position).toFixed(3))}×` },
            { label: 'dreamy', value: formatPercentageValue(draft.dreamy) },
          ]} />
          {declined && <span role="status" className="text-amber-400">{declined.message}</span>}
        </>}
      />
      <div className="panel-section-body" hidden={!expanded}>
        {expanded && <>
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
        </>}
      </div>
    </section>
  )
}
