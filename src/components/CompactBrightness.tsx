import { Sun } from 'lucide-react'
import { DeckSlider } from './DeckSlider'
import { formatPercentageValue } from '@/engine/percentageValue'
import './PatternPanel.css'

function formatBrightness(value: number): string {
  return formatPercentageValue(value < 0.1 ? value : Math.round(value * 100) / 100)
}

/** Shared presentation; each surface retains ownership of its brightness value. */
export function CompactBrightness({ value, onChange, ariaLabel = 'Brightness', testId, curve = 1, onSpace }: {
  value: number | null
  onChange: (value: number) => void
  ariaLabel?: string
  testId?: string
  curve?: 1 | 2
  onSpace?: () => void
}) {
  return <div className="panel-brightness" data-testid={testId} title={value === null ? 'Brightness not set — drag to set a value.' : `Brightness ${formatBrightness(value)}`}>
    <Sun size={13} aria-hidden className="text-zinc-400 shrink-0" />
    <DeckSlider label="brightness" ariaLabel={ariaLabel} value={value} min={0} max={1} step={0.01} presentation="percentage" format={formatBrightness} curve={curve} onSpace={onSpace} onChange={onChange} />
  </div>
}
