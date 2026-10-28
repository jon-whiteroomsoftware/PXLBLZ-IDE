import type { SlowMoPlan, SlowMoSettings } from '@/engine/slowMo'
import type { SlowMoDraft } from '@/engine/slowMoDraft'
import './SlowMoLab.css'
import { PIXELBLAZE_VM_ARRAY_WORDS } from '@/engine/showVmResourceLedger'
import { DeckCell, DeckGrid, DeckTelemetry } from './Deck'
import { DeckSelect, type DeckOption } from './DeckSelect'
import { DeckSlider } from './DeckSlider'

export interface SlowMoLabProps {
  draft: SlowMoDraft
  onChange: (draft: SlowMoDraft) => void
  declined: SlowMoPlan['declined'] | null
  arrayWords: number | null
  onCopy?: () => void
}

const rates: DeckOption<number>[] = [1, 2, 4, 8, 16, 32].map((divisor) => ({
  value: 1 / divisor, label: divisor === 1 ? '1' : `1/${divisor}`,
}))
const steps: DeckOption<number>[] = [16, 32].map((value) => ({ value, label: `${value} ms` }))
const shapes: DeckOption<SlowMoSettings['stagger']['shape']>[] = [
  { value: 'sweep', label: 'Sweep' },
  { value: 'radial', label: 'Radial' },
  { value: 'scatter', label: 'Scatter' },
]
const methods: DeckOption<SlowMoSettings['inBetween'] | 'off'>[] = [
  { value: 'off', label: 'Off' },
  { value: 'clock', label: 'Clock' },
  { value: 'hold', label: 'Hold' },
  { value: 'blend', label: 'Blend' },
  { value: 'eased', label: 'Eased' },
]

export function SlowMoLab({ draft, onChange, declined, arrayWords, onCopy }: SlowMoLabProps) {
  return (
    <section aria-label="Slow-mo lab" data-testid="slowmo-lab" className="slowmo-lab my-2 col-span-full min-w-0">
      <fieldset className="slowmo-lab-tempo min-w-0">
        <legend className="text-xs text-zinc-500 mb-1">Tempo</legend>
        <DeckGrid>
          <DeckCell label="rate">
            <DeckSelect
              ariaLabel="Slow-mo rate"
              value={draft.rate}
              options={rates}
              onChange={(rate) => onChange({ ...draft, rate })}
              portaled
            />
          </DeckCell>
          <DeckCell label="step">
            <DeckSelect
              ariaLabel="Slow-mo step"
              value={draft.stepMs}
              options={steps}
              onChange={(stepMs) => onChange({ ...draft, stepMs })}
              portaled
            />
          </DeckCell>
        </DeckGrid>
      </fieldset>
      <div className="slowmo-lab-groups">
        <fieldset className="min-w-0">
          <legend className="text-xs text-zinc-500 mb-1">In-between</legend>
          <DeckGrid>
            <DeckCell label="method">
              <DeckSelect
                ariaLabel="Slow-mo method"
                value={draft.inBetween}
                options={methods}
                onChange={(inBetween) => onChange({ ...draft, inBetween })}
                portaled
              />
            </DeckCell>
          </DeckGrid>
          <fieldset aria-label="Stagger" className="slowmo-lab-stagger min-w-0" disabled={draft.inBetween === 'clock'}>
            <DeckGrid>
              <DeckCell label="stagger">
                <DeckSelect
                  ariaLabel="Slow-mo stagger"
                  value={draft.stagger.shape}
                  options={shapes}
                  onChange={(shape) => {
                    onChange({ ...draft, stagger: { ...draft.stagger, shape } })
                  }}
                  portaled
                />
              </DeckCell>
              <DeckSlider
                className="slowmo-lab-slider"
                label="width"
                ariaLabel="Slow-mo stagger width"
                min={0}
                max={0.9}
                step={0.01}
                value={draft.stagger.width}
                format={(width) => width === 0 ? 'Off' : width.toFixed(2)}
                onChange={(width) => {
                  onChange({ ...draft, stagger: { ...draft.stagger, width } })
                }}
              />
            </DeckGrid>
          </fieldset>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs text-zinc-500 mb-1">After-effect</legend>
          <DeckGrid>
            <DeckCell label="persistence">
              <DeckSelect
                ariaLabel="Slow-mo persistence"
                value={draft.persistence.enabled ? 'on' : 'off'}
                options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
                onChange={(enabled) => {
                  onChange({ ...draft, persistence: { ...draft.persistence, enabled: enabled === 'on' } })
                }}
                portaled
              />
            </DeckCell>
            <DeckSlider
              className="slowmo-lab-slider"
              label="attack ms"
              ariaLabel="Slow-mo attack"
              min={0}
              max={5000}
              step={1}
              value={draft.persistence.attackMs}
              format={(value) => value.toFixed(0)}
              onChange={(attackMs) => {
                onChange({ ...draft, persistence: { ...draft.persistence, attackMs } })
              }}
            />
            <DeckSlider
              className="slowmo-lab-slider"
              label="decay ms"
              ariaLabel="Slow-mo decay"
              min={0}
              max={10000}
              step={1}
              value={draft.persistence.decayMs}
              format={(value) => value.toFixed(0)}
              onChange={(decayMs) => {
                onChange({ ...draft, persistence: { ...draft.persistence, decayMs } })
              }}
            />
          </DeckGrid>
        </fieldset>
      </div>
      <div className="slowmo-lab-footer">
        <DeckGrid>
          <DeckTelemetry label="array words" value={`${arrayWords ?? '—'} / ${PIXELBLAZE_VM_ARRAY_WORDS}`} />
        </DeckGrid>
        <button
          type="button"
          disabled={!onCopy}
          onClick={() => onCopy?.()}
          className="text-xs text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-default"
        >Copy generated code</button>
      </div>
      {declined && <p role="status" className="text-xs text-amber-400">{declined.message}</p>}
    </section>
  )
}
