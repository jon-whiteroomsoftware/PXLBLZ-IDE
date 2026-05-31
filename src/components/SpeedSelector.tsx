import { usePreviewStore } from '@/store/previewStore'
import { DeckSelect } from '@/components/DeckSelect'

const TIME_SCALES: { value: number; label: string }[] = [
  { value: 0.01, label: '0.01×' },
  { value: 0.1, label: '0.1×' },
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
  { value: 10, label: '10×' },
]

function nearestTimeScale(speed: number): number {
  let best = 0
  for (let i = 1; i < TIME_SCALES.length; i++) {
    if (Math.abs(TIME_SCALES[i].value - speed) < Math.abs(TIME_SCALES[best].value - speed)) best = i
  }
  return TIME_SCALES[best].value
}

export function SpeedSelector() {
  const speed = usePreviewStore((s) => s.speed)
  const setSpeed = usePreviewStore((s) => s.setSpeed)

  return (
    <DeckSelect
      ariaLabel="Speed"
      value={nearestTimeScale(speed)}
      options={TIME_SCALES}
      onChange={setSpeed}
    />
  )
}
