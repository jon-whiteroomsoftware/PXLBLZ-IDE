import type { SlowMoPlan } from '@/engine/slowMo'
import { formatSlowMoAmount } from '@/engine/slowMo'
import { formatPercentageValue } from '@/engine/percentageValue'
import { DeckDisclosureHeader } from './Deck'
import { DeckSlider } from './DeckSlider'
import { PanelReadout } from './PanelReadout'
import './SlowMoLab.css'

export interface SlowMoLabProps {
  slowMo: number
  dreamy: number
  onSlowMoChange: (value: number) => void
  onDreamyChange: (value: number) => void
  onSpace?: () => void
  declined: SlowMoPlan['declined'] | null
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

export function SlowMoLab({
  slowMo,
  dreamy,
  onSlowMoChange,
  onDreamyChange,
  onSpace,
  declined,
  expanded,
  onExpandedChange,
}: SlowMoLabProps) {
  return (
    <section aria-label="Wrappers" className="panel-section slowmo-section" data-expanded={expanded}>
      <DeckDisclosureHeader
        label="Wrappers"
        tag="preview only"
        expanded={expanded}
        onToggle={() => onExpandedChange(!expanded)}
        summaryRow
        summary={!expanded && <>
          <PanelReadout items={[
            { label: 'slow-mo', value: formatSlowMoAmount(slowMo) },
            { label: 'dreamy', value: formatPercentageValue(dreamy) },
          ]} />
          {declined && <span role="status" className="text-amber-400">{declined.message}</span>}
        </>}
      />
      <div className="panel-section-body" hidden={!expanded}>
        {expanded && <>
          <div className="panel-fields">
            <DeckSlider
              label="slow-mo"
              ariaLabel="Slow-mo"
              min={0}
              max={1}
              step={0.001}
              value={slowMo}
              format={formatSlowMoAmount}
              onSpace={onSpace}
              onChange={onSlowMoChange}
            />
            <DeckSlider
              label="dreamy"
              ariaLabel="Dreamy"
              min={0}
              max={1}
              step={0.001}
              value={dreamy}
              presentation="percentage"
              onSpace={onSpace}
              onChange={onDreamyChange}
            />
          </div>
          {declined && <p role="status" className="text-xs text-amber-400">{declined.message}</p>}
        </>}
      </div>
    </section>
  )
}
