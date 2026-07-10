import { ChevronDown } from 'lucide-react'
import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { formatWatchValue, isWatchArrayValue } from '@/engine/watchValue'

// Variables (#150): the bottom-most deck section — a single all-or-nothing turn-down
// that reveals every exported pattern variable (no per-variable or sensor-builtin
// checkboxes; those went out with the deleted settings dialog). Split out of the
// Readout so it sits below the author's pattern controls.
export function Variables() {
  const watchPatternVars = usePreviewStore((s) => s.watchPatternVars)
  const setWatchPatternVars = usePreviewStore((s) => s.setWatchPatternVars)
  const watchValues = usePreviewStore((s) => s.watchValues)
  const patternVars = useEditorStore((s) => s.patternVars)

  if (patternVars.length === 0) return null

  return (
    <section className="font-mono text-xs mt-1 pt-1.5 pb-3 pr-3">
      <button
        aria-expanded={watchPatternVars}
        onClick={() => setWatchPatternVars(!watchPatternVars)}
        className="flex items-center gap-1 text-[11px] font-semibold text-structural uppercase tracking-wider hover:text-live transition-colors"
      >
        <span>Watch variables</span>
        <ChevronDown
          size={17}
          className={`shrink-0 transition-transform ${watchPatternVars ? '' : '-rotate-90'}`}
        />
      </button>
      {watchPatternVars && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
          {patternVars.map((name) => {
            const value = watchValues[name]
            return (
              <div
                key={name}
                className={`${isWatchArrayValue(value) ? 'col-span-2' : ''} grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-w-0`}
              >
                <span className="text-zinc-400 truncate" title={name}>{name}</span>
                <span className="text-live tabular-nums whitespace-nowrap">
                  {formatWatchValue(value)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
