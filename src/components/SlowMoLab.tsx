import type { SlowMoPlan, SlowMoSettings } from '@/engine/slowMo'
import { PIXELBLAZE_VM_ARRAY_WORDS } from '@/engine/showVmResourceLedger'
import { DeckCell, DeckGrid, DeckTelemetry } from './Deck'
import { DeckSelect, type DeckOption } from './DeckSelect'
import { DeckSlider } from './DeckSlider'

export interface SlowMoLabProps {
  settings: SlowMoSettings | null
  onChange: (settings: SlowMoSettings | null) => void
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

export function SlowMoLab({ settings, onChange, declined, arrayWords, onCopy }: SlowMoLabProps) {
  return (
    <section aria-label="Slow-mo lab" data-testid="slowmo-lab" className="space-y-2 my-2 col-span-full min-w-0">
      <fieldset disabled={settings === null} className="min-w-0">
        <legend className="text-xs text-zinc-500 mb-1">Tempo</legend>
        <DeckGrid>
          <DeckCell label="rate">
            <DeckSelect
              ariaLabel="Slow-mo rate"
              value={settings?.rate ?? 1}
              options={rates}
              onChange={(rate) => { if (settings) onChange({ ...settings, rate }) }}
              portaled
            />
          </DeckCell>
          <DeckCell label="step">
            <DeckSelect
              ariaLabel="Slow-mo step"
              value={settings?.stepMs ?? 16}
              options={steps}
              onChange={(stepMs) => { if (settings) onChange({ ...settings, stepMs }) }}
              portaled
            />
          </DeckCell>
        </DeckGrid>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="text-xs text-zinc-500 mb-1">In-between</legend>
        <DeckGrid>
          <DeckCell label="method">
            <DeckSelect
              ariaLabel="Slow-mo method"
              value={settings?.inBetween ?? 'off'}
              options={methods}
              onChange={(inBetween) => onChange(inBetween === 'off' ? null : settings
                ? { ...settings, inBetween }
                : { rate: 1, stepMs: 16, inBetween, stagger: { shape: 'sweep', width: 0 }, persistence: null })}
              portaled
            />
          </DeckCell>
        </DeckGrid>
        <fieldset aria-label="Stagger" className="min-w-0 mt-2" disabled={settings === null || settings.inBetween === 'clock'}>
          <DeckGrid>
            <DeckCell label="stagger">
              <DeckSelect
                ariaLabel="Slow-mo stagger"
                value={settings?.stagger.shape ?? 'sweep'}
                options={shapes}
                onChange={(shape) => {
                  if (settings && settings.inBetween !== 'clock') onChange({ ...settings, stagger: { ...settings.stagger, shape } })
                }}
                portaled
              />
            </DeckCell>
            <DeckSlider
              label="width"
              ariaLabel="Slow-mo stagger width"
              min={0}
              max={0.9}
              step={0.01}
              value={settings?.stagger.width ?? 0}
              format={(width) => width === 0 ? 'Off' : width.toFixed(2)}
              onChange={(width) => {
                if (settings && settings.inBetween !== 'clock') onChange({ ...settings, stagger: { ...settings.stagger, width } })
              }}
            />
          </DeckGrid>
        </fieldset>
      </fieldset>
      <fieldset disabled={settings === null} className="min-w-0">
        <legend className="text-xs text-zinc-500 mb-1">After-effect</legend>
        <DeckGrid>
          <DeckCell label="persistence">
            <DeckSelect
              ariaLabel="Slow-mo persistence"
              value={settings?.persistence != null ? 'on' : 'off'}
              options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
              onChange={(enabled) => {
                if (settings) onChange({ ...settings, persistence: enabled === 'on' ? { attackMs: 0, decayMs: 2000 } : null })
              }}
              portaled
            />
          </DeckCell>
        </DeckGrid>
        <fieldset disabled={settings?.persistence == null} className="min-w-0 mt-2">
          <DeckGrid>
            <DeckSlider
              label="attack ms"
              ariaLabel="Slow-mo attack"
              min={0}
              max={5000}
              step={1}
              value={settings?.persistence?.attackMs ?? 0}
              format={(value) => value.toFixed(0)}
              onChange={(attackMs) => {
                if (settings?.persistence) onChange({ ...settings, persistence: { ...settings.persistence, attackMs } })
              }}
            />
            <DeckSlider
              label="decay ms"
              ariaLabel="Slow-mo decay"
              min={0}
              max={10000}
              step={1}
              value={settings?.persistence?.decayMs ?? 2000}
              format={(value) => value.toFixed(0)}
              onChange={(decayMs) => {
                if (settings?.persistence) onChange({ ...settings, persistence: { ...settings.persistence, decayMs } })
              }}
            />
          </DeckGrid>
        </fieldset>
      </fieldset>
      <DeckGrid>
        <DeckTelemetry label="array words" value={`${arrayWords ?? '—'} / ${PIXELBLAZE_VM_ARRAY_WORDS}`} />
      </DeckGrid>
      {declined && <p role="status" className="text-xs text-amber-400">{declined.message}</p>}
      <button
        type="button"
        disabled={!onCopy}
        onClick={() => onCopy?.()}
        className="text-xs text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-default"
      >Copy generated code</button>
    </section>
  )
}
