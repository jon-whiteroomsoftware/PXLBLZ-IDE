import { useState, useRef, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'

const PRIMARY_BUILTIN_VARS = ['elapsed', 'pixelCount']

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
const ADVANCED_BUILTIN_VARS = [
  'energyAverage',
  'light',
  'maxFrequency',
  'maxFrequencyMagnitude',
  'frequencyData',
  'accelerometer',
  'analogInputs',
]

function WatchCheckbox({
  name,
  checked,
  onChange,
}: {
  name: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer min-w-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-amber-500 shrink-0"
      />
      <span className="text-xs text-zinc-300 truncate" title={name}>{name}</span>
    </label>
  )
}

export function PreviewSettings() {
  const [isOpen, setIsOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const brightness = usePreviewStore((s) => s.brightness)
  const setBrightness = usePreviewStore((s) => s.setBrightness)
  const speed = usePreviewStore((s) => s.speed)
  const setSpeed = usePreviewStore((s) => s.setSpeed)
  const diffusion = usePreviewStore((s) => s.grid.diffusion)
  const gridRows = usePreviewStore((s) => s.grid.rows)
  const gridCols = usePreviewStore((s) => s.grid.cols)
  const setGrid = usePreviewStore((s) => s.setGrid)
  const watchedBuiltins = usePreviewStore((s) => s.watchedBuiltins)
  const setWatchedBuiltins = usePreviewStore((s) => s.setWatchedBuiltins)
  const watchedPatternVars = usePreviewStore((s) => s.watchedPatternVars)
  const setWatchedPatternVars = usePreviewStore((s) => s.setWatchedPatternVars)
  const patternVars = useEditorStore((s) => s.patternVars)

  const [draftRows, setDraftRows] = useState(String(gridRows))
  const [draftCols, setDraftCols] = useState(String(gridCols))

  function commitGridSize() {
    const rows = Math.max(1, parseInt(draftRows, 10) || gridRows)
    const cols = Math.max(1, parseInt(draftCols, 10) || gridCols)
    setDraftRows(String(rows))
    setDraftCols(String(cols))
    setGrid({ rows, cols })
  }

  function toggleBuiltin(name: string) {
    setWatchedBuiltins(
      watchedBuiltins.includes(name)
        ? watchedBuiltins.filter((v) => v !== name)
        : [...watchedBuiltins, name]
    )
  }

  function togglePatternVar(name: string) {
    setWatchedPatternVars(
      watchedPatternVars.includes(name)
        ? watchedPatternVars.filter((v) => v !== name)
        : [...watchedPatternVars, name]
    )
  }

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
        className="flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-amber-400/70 hover:bg-zinc-800 transition-colors"
      >
        <Settings size={18} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Preview settings panel"
          className="absolute top-full right-0 mt-1 w-72 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl z-50 p-3 font-mono"
        >
          {/* Display */}
          <section>
            <h3 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-3">
              Display
            </h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Brightness</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Diffusion</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={diffusion}
                  onChange={(e) => setGrid({ diffusion: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </label>
            </div>
          </section>

          {/* Speed */}
          <section className="mt-4">
            <div className="flex justify-between mb-3">
              <h3 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider">
                Speed
              </h3>
              <span className="text-xs text-amber-400 tabular-nums leading-none">
                {TIME_SCALES[nearestTimeScaleIndex(speed)].label}
              </span>
            </div>
            <input
              aria-label="Speed"
              type="range"
              min={0}
              max={TIME_SCALES.length - 1}
              step={1}
              value={nearestTimeScaleIndex(speed)}
              onChange={(e) => setSpeed(TIME_SCALES[Number(e.target.value)].value)}
              className="w-full accent-amber-500"
            />
          </section>

          {/* Grid Size */}
          <section className="mt-4">
            <h3 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-3">
              Grid Size
            </h3>
            <div className="flex items-center gap-2">
              <input
                aria-label="Grid columns"
                type="number"
                min={1}
                value={draftCols}
                onChange={(e) => setDraftCols(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitGridSize()}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-zinc-500">×</span>
              <input
                aria-label="Grid rows"
                type="number"
                min={1}
                value={draftRows}
                onChange={(e) => setDraftRows(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitGridSize()}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={commitGridSize}
                className="px-2 py-1 text-xs rounded border border-amber-500 text-amber-500 hover:bg-amber-500/10 transition-colors"
              >
                OK
              </button>
            </div>
          </section>

          {/* Watch */}
          <section className="mt-4">
            <h3 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-2">
              Watch
            </h3>

            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Built-ins</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-2">
              {PRIMARY_BUILTIN_VARS.map((name) => (
                <WatchCheckbox
                  key={name}
                  name={name}
                  checked={watchedBuiltins.includes(name)}
                  onChange={() => toggleBuiltin(name)}
                />
              ))}
            </div>
            <button
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 mb-1 transition-colors"
            >
              <span>{advancedOpen ? '▾' : '▸'}</span>
              <span>Advanced</span>
            </button>
            {advancedOpen && (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-3 pl-2">
                {ADVANCED_BUILTIN_VARS.map((name) => (
                  <WatchCheckbox
                    key={name}
                    name={name}
                    checked={watchedBuiltins.includes(name)}
                    onChange={() => toggleBuiltin(name)}
                  />
                ))}
              </div>
            )}

            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Variables</p>
            {patternVars.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {patternVars.map((name) => (
                  <WatchCheckbox
                    key={name}
                    name={name}
                    checked={watchedPatternVars.includes(name)}
                    onChange={() => togglePatternVar(name)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 italic">No exported variables</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
