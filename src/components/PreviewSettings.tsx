import { useState, useRef, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { usePreviewStore } from '@/store/previewStore'

export function PreviewSettings() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const brightness = usePreviewStore((s) => s.brightness)
  const setBrightness = usePreviewStore((s) => s.setBrightness)
  const glowAmount = usePreviewStore((s) => s.grid.glowAmount)
  const setGrid = usePreviewStore((s) => s.setGrid)

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
        aria-label="Preview settings"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
      >
        <Settings size={13} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Preview settings panel"
          className="absolute top-full right-0 mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl z-50 p-3"
        >
          <section>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              Display
            </h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Brightness</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full accent-zinc-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Glow</span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={glowAmount}
                  onChange={(e) => setGrid({ glowAmount: Number(e.target.value) })}
                  className="w-full accent-zinc-400"
                />
              </label>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
