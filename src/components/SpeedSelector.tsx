import { usePreviewStore } from '@/store/previewStore'
import { writeCascadedOverride } from '@/store/settingsCascade'
import { DeckSelect } from '@/components/DeckSelect'
import { formatDomainNumber } from '@/engine/domainNumberPresentation'

const TIME_SCALES = [0.01, 0.1, 0.5, 1, 2, 4, 10].map((value) => ({
  value,
  label: formatDomainNumber('multiplier', value, 0.01),
}))

function nearestTimeScale(speed: number): number {
  let best = 0
  for (let i = 1; i < TIME_SCALES.length; i++) {
    if (Math.abs(TIME_SCALES[i].value - speed) < Math.abs(TIME_SCALES[best].value - speed)) best = i
  }
  return TIME_SCALES[best].value
}

export function SpeedSelector({ portaled = false }: { portaled?: boolean } = {}) {
  const speed = usePreviewStore((s) => s.speed)
  const setSpeed = usePreviewStore((s) => s.setSpeed)

  return (
    <DeckSelect
      ariaLabel="Speed"
      value={nearestTimeScale(speed)}
      options={TIME_SCALES}
      portaled={portaled}
      onChange={(v) => {
        setSpeed(v)
        writeCascadedOverride('speed', v)
      }}
    />
  )
}
