import { useState, useRef, useEffect } from 'react'
import { usePreviewStore } from '@/store/previewStore'

const TIME_SCALES: { value: number; label: string }[] = [
  { value: 0.01, label: '0.01×' },
  { value: 0.1, label: '0.1×' },
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
  { value: 10, label: '10×' },
]

function nearestTimeScaleIndex(speed: number): number {
  let best = 0
  for (let i = 1; i < TIME_SCALES.length; i++) {
    if (Math.abs(TIME_SCALES[i].value - speed) < Math.abs(TIME_SCALES[best].value - speed)) best = i
  }
  return best
}

export function SpeedSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const speed = usePreviewStore((s) => s.speed)
  const setSpeed = usePreviewStore((s) => s.setSpeed)

  const currentIndex = nearestTimeScaleIndex(speed)

  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-label="Speed"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center justify-center h-6 px-1.5 rounded text-sm font-mono tabular-nums text-zinc-400 hover:text-amber-400/70 hover:bg-zinc-700 transition-colors"
      >
        {TIME_SCALES[currentIndex].label}
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Speed"
          className="absolute top-full right-0 mt-1 w-24 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl z-50 py-1 font-mono"
        >
          {TIME_SCALES.map((scale, i) => (
            <button
              key={scale.value}
              role="option"
              aria-selected={i === currentIndex}
              onClick={() => {
                setSpeed(scale.value)
                setIsOpen(false)
              }}
              className={`block w-full text-left px-3 py-1 text-xs tabular-nums transition-colors hover:bg-zinc-800 ${
                i === currentIndex ? 'text-amber-400' : 'text-zinc-300'
              }`}
            >
              {scale.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
