import type { SlowMoPlan, SlowMoSettings } from '@/engine/slowMo'
import { PIXELBLAZE_VM_ARRAY_WORDS } from '@/engine/showVmResourceLedger'
import { DeckCell, DeckGrid, DeckTelemetry } from './Deck'
import { DeckSelect, type DeckOption } from './DeckSelect'

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
