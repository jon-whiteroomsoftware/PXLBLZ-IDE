import { usePreviewStore } from '@/store/previewStore'
import { useMapStore, defaultPixelCountForDim } from '@/store/mapStore'
import { useEditorStore } from '@/store/editorStore'
import { clampPixelCount, cubeSideForCount } from '@/engine/camera'
import { squarePlaneDims } from '@/engine/maps'

// How the active count is laid out for display: 1D has no grid (null); 2D is the
// squared-up plane (width×height); 3D is the count-derived cube lattice
// (width×height×depth). Reflects the realized arrangement, so the 3D value is
// side³ even when the count snapped to the nearest cube.
function layoutFor(dim: 1 | 2 | 3, count: number): string | null {
  const n = clampPixelCount(count)
  if (dim === 2) {
    const { rows, cols } = squarePlaneDims(n)
    return `${cols}×${rows}`
  }
  if (dim === 3) {
    const side = cubeSideForCount(n)
    return `${side}×${side}×${side}`
  }
  return null
}

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

export function WatchPanel() {
  const watchedBuiltins = usePreviewStore((s) => s.watchedBuiltins)
  const watchedPatternVars = usePreviewStore((s) => s.watchedPatternVars)
  const watchValues = usePreviewStore((s) => s.watchValues)
  const fps = usePreviewStore((s) => s.fps)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const displayDim = useEditorStore((s) => s.displayDim)
  const activePixelCount = useMapStore((s) => s.activePixelCount)

  const hasPatternVars = watchedPatternVars.length > 0
  // The built-ins area always shows the fps + renderer readout. fps holds the
  // top-left cell and renderer the second-row-left cell; the watched built-ins
  // flow into the remaining cells, so the default (elapsed, pixelCount watched)
  // reads:
  //   fps        elapsed
  //   renderer   pixelCount
  // Any further watched built-ins wrap onto the rows below. (Dimension-agnostic
  // now — the old width×height "size" cell is gone; pixel count is the knob.)
  const fpsValue = fps === null ? '—' : fps.toFixed(1)
  const rendererValue = fidelity === 'fast' ? 'fast' : 'precise'
  const builtinCells: { name: string; value: string }[] = [{ name: 'fps', value: fpsValue }]
  if (watchedBuiltins[0] !== undefined) {
    builtinCells.push({ name: watchedBuiltins[0], value: formatValue(watchValues[watchedBuiltins[0]]) })
  }
  builtinCells.push({ name: 'renderer', value: rendererValue })
  for (let i = 1; i < watchedBuiltins.length; i++) {
    builtinCells.push({ name: watchedBuiltins[i], value: formatValue(watchValues[watchedBuiltins[i]]) })
  }
  // Read-only grid layout, shown right after pixelCount (1D has none). It maps
  // the count to its realized arrangement so the field reads how the pixels are
  // laid out — width×height in 2D, width×height×depth in 3D.
  const layoutValue = layoutFor(displayDim, activePixelCount ?? defaultPixelCountForDim(displayDim))
  if (layoutValue) {
    const pixelCountIdx = builtinCells.findIndex((c) => c.name === 'pixelCount')
    const layoutCell = { name: 'layout', value: layoutValue }
    if (pixelCountIdx === -1) builtinCells.push(layoutCell)
    else builtinCells.splice(pixelCountIdx + 1, 0, layoutCell)
  }

  return (
    <div className="font-mono text-xs border-t border-zinc-800 mt-2 pt-2 pb-3 pr-3">
      <section className="mb-3">
        <h4 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-1">
          Built-ins
        </h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {builtinCells.map((cell) => (
            <ReadoutCell key={cell.name} name={cell.name} value={cell.value} />
          ))}
        </div>
      </section>
      {hasPatternVars && (
        <section>
          <h4 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-1">
            Pattern Variables
          </h4>
          <WatchRows names={watchedPatternVars} values={watchValues} />
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

function WatchRows({ names, values }: { names: string[]; values: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
      {names.map((name) => (
        <div key={name} className="flex justify-between gap-2 min-w-0">
          <span className="text-zinc-400 truncate">{name}</span>
          <span className="text-amber-400 tabular-nums truncate">{formatValue(values[name])}</span>
        </div>
      ))}
    </div>
  )
}
