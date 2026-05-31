import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  if (Array.isArray(v)) {
    const items = (v as number[]).slice(0, 8).map((n) =>
      typeof n === 'number' ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : '?'
    )
    return items.join(', ') + (v.length > 8 ? ', …' : '')
  }
  return String(v)
}

// The Readout (#150): the least-prominent, read-only band at the bottom of the
// preview deck. Telemetry (fps + elapsed) is unconditional; the layout-dims cell
// shows only when there's a regular grid; and a single all-or-nothing turn-down
// reveals every exported pattern variable (no per-variable or sensor-builtin
// checkboxes anymore — those moved out with the deleted settings dialog).
export function Readout() {
  const watchPatternVars = usePreviewStore((s) => s.watchPatternVars)
  const setWatchPatternVars = usePreviewStore((s) => s.setWatchPatternVars)
  const watchValues = usePreviewStore((s) => s.watchValues)
  const fps = usePreviewStore((s) => s.fps)
  const elapsed = usePreviewStore((s) => s.elapsed)
  const layoutLabel = useEditorStore((s) => s.layoutLabel)
  const patternVars = useEditorStore((s) => s.patternVars)

  // Always-on telemetry cells, in reading order: fps · elapsed · (layout dims when a
  // regular grid is live). pixelCount is now an editable control in the deck above,
  // so it no longer echoes here.
  const cells: { name: string; value: string }[] = [
    { name: 'fps', value: fps === null ? '—' : fps.toFixed(1) },
    { name: 'elapsed', value: elapsed === null ? '—' : `${(elapsed / 1000).toFixed(1)}s` },
  ]
  if (layoutLabel) cells.push({ name: 'layout', value: layoutLabel })

  return (
    <div className="font-mono text-xs border-t border-zinc-800 mt-2 pt-2 pb-3 pr-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {cells.map((cell) => (
          <ReadoutCell key={cell.name} name={cell.name} value={cell.value} />
        ))}
      </div>

      {patternVars.length > 0 && (
        <section className="mt-3">
          <button
            aria-expanded={watchPatternVars}
            onClick={() => setWatchPatternVars(!watchPatternVars)}
            className="flex items-center gap-1 text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider hover:text-amber-400 transition-colors"
          >
            <span>{watchPatternVars ? '▾' : '▸'}</span>
            <span>Variables</span>
          </button>
          {watchPatternVars && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
              {patternVars.map((name) => (
                <ReadoutCell key={name} name={name} value={formatValue(watchValues[name])} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function ReadoutCell({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 min-w-0">
      <span className="text-zinc-400 truncate">{name}</span>
      <span className="text-amber-400 tabular-nums truncate">{value}</span>
    </div>
  )
}
