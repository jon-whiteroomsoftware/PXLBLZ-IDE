import type { SlowMoPlan } from '@/engine/slowMo'
import { slowMoRateFromPosition } from '@/engine/slowMo'
import { DEFAULT_SLOW_MO_BREATHING, type SlowMoBreathingSettings } from '@/engine/slowMoBreathing'
import type { SlowMoBreathingTelemetry } from '@/engine/slowMoBreathingPlayback'
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
  telemetry: SlowMoBreathingTelemetry | null
  onRestart: () => void
}

export function SlowMoLab({ draft, onChange, declined, expanded, onExpandedChange, telemetry, onRestart }: SlowMoLabProps) {
  const breathing = draft.breathing ?? DEFAULT_SLOW_MO_BREATHING
  const changeBreathing = (edit: Partial<SlowMoBreathingSettings>) => onChange({ ...draft, breathing: { ...breathing, ...edit } })
  const trace = telemetry?.trace ?? []
  const startMs = trace[0]?.realMs ?? 0
  const spanMs = Math.max(1, (trace[trace.length - 1]?.realMs ?? 0) - startMs)
  const points = trace.map(point => `${((point.realMs - startMs) / spanMs * 100).toFixed(1)},${(18 - point.rate / (breathing.allowAboveOne ? 2 : 1) * 16).toFixed(1)}`).join(' ')
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
        <div className="slowmo-breathing" role="group" aria-label="Breathing lab">
          <label title="Breathing depth: fraction of the available range">
            dep <input type="range" aria-label="Breathing depth" min="0" max="1" step="0.01" value={breathing.depth}
              onChange={event => changeBreathing({ depth: Number(event.target.value) })} />
            <span className="slowmo-lab-value">{Math.round(breathing.depth * 100)}%</span>
          </label>
          <label title="Breathing period: real seconds per cycle">
            per <input type="range" aria-label="Breathing period" min="2" max="120" step="1" value={breathing.periodSeconds}
              onChange={event => changeBreathing({ periodSeconds: Number(event.target.value) })} />
            <span className="slowmo-lab-value">{breathing.periodSeconds}s</span>
          </label>
          <span className="slowmo-lab-buttons">
            <button type="button" aria-label="Bounded limits" title="Bounded limits: shrink amplitude to fit" aria-pressed={breathing.limits === 'bounded'} onClick={() => changeBreathing({ limits: 'bounded' })}>bnd</button>
            <button type="button" aria-label="Clipped limits" title="Clipped limits: flatten the wave at the limits" aria-pressed={breathing.limits === 'clipped'} onClick={() => changeBreathing({ limits: 'clipped' })}>clip</button>
          </span>
          <button type="button" aria-label="Allow above 1×" title="Allow rates above 1×, up to 2×" aria-pressed={breathing.allowAboveOne} onClick={() => changeBreathing({ allowAboveOne: !breathing.allowAboveOne })}>&gt;1×</button>
          <button type="button" aria-label="Dreamy uses Pattern seconds" title="Dreamy decay clock: real or Pattern seconds" aria-pressed={breathing.dreamyClock === 'pattern'} onClick={() => changeBreathing({ dreamyClock: breathing.dreamyClock === 'real' ? 'pattern' : 'real' })}>dr:{breathing.dreamyClock === 'real' ? 'real' : 'pat'}</button>
          <button type="button" aria-label="Restart cycle" title="Restart cycle without rewinding Pattern time" onClick={onRestart}>↻</button>
          <span className="slowmo-lab-readouts">
            <span aria-label="Breathing live rate" title="Live rate">{telemetry ? `${telemetry.rate.toFixed(3)}×` : '—×'}</span>
            <span aria-label="Breathing available amplitude" title="Available amplitude">±{telemetry ? telemetry.amplitude.toFixed(3) : '—'}×</span>
            <span aria-label="Pattern time against real time" title="Pattern seconds / real seconds">{telemetry ? `${(telemetry.patternMs / 1000).toFixed(1)}/${(telemetry.realMs / 1000).toFixed(1)}s` : '—/—s'}</span>
            <svg role="img" aria-label="Breathing rate trace" viewBox="0 0 100 20" width="100" height="20">
              <path d="M0 18H100" className="slowmo-trace-axis" />
              <polyline points={points} fill="none" className="slowmo-trace-line" />
            </svg>
          </span>
        </div>
        {declined && <p role="status" className="text-xs text-amber-400">{declined.message}</p>}
        </>}
      </div>
    </section>
  )
}
