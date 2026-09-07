import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { formatWatchValue, isWatchArrayValue } from '@/engine/watchValue'
import { useEffect } from 'react'
import { PictureInPicture2 } from 'lucide-react'
import { usePanelPreferencesStore, usePanelSection } from '@/store/panelPreferencesStore'
import { describeVariablesReadout } from '@/engine/previewPanel'
import { PanelReadout } from '@/components/PanelReadout'
import { DeckDisclosureHeader, DeckSection } from '@/components/Deck'

// Variables (#150): the bottom-most deck section — a single all-or-nothing turn-down
// that reveals every exported pattern variable (no per-variable or sensor-builtin
// checkboxes; those went out with the deleted settings dialog). Split out of the
// Readout so it sits below the author's pattern controls.
export function Variables({ mode }: { mode?: string } = {}) {
  const [expanded, setExpanded] = usePanelSection(mode ?? 'pattern', 'Variables')
  const overlay = usePanelPreferencesStore(s => s.overlays[mode ?? 'pattern'] ?? false)
  const setOverlay = usePanelPreferencesStore(s => s.setOverlay)
  const watchPatternVars = usePreviewStore((s) => s.watchPatternVars)
  const setWatchPatternVars = usePreviewStore((s) => s.setWatchPatternVars)
  const watchValues = usePreviewStore((s) => s.watchValues)
  const patternVars = useEditorStore((s) => s.patternVars)
  useEffect(() => {
    if (!mode) return
    setWatchPatternVars(true)
    return () => setWatchPatternVars(false)
  }, [mode, setWatchPatternVars])

  if (patternVars.length === 0) return null

  if (mode) return (
    <DeckSection label="Variables" collapsible summaryRow expanded={expanded} onExpandedChange={setExpanded}
      summary={<PanelReadout items={describeVariablesReadout(patternVars, watchValues)} />}
      actions={<button type="button" aria-label="Variables on canvas" title="Variables on canvas" aria-pressed={overlay} className={`panel-overlay-toggle ${overlay ? 'text-live' : 'text-zinc-500'}`} onClick={() => setOverlay(mode, !overlay)}><PictureInPicture2 size={12} aria-hidden /></button>}
    >
      <VariableValues />
    </DeckSection>
  )

  return (
    <section
      data-expanded={watchPatternVars}
      className={`font-mono text-xs mt-1 pt-1.5 pr-3 ${watchPatternVars ? 'pb-3' : 'pb-0'}`}
    >
      <DeckDisclosureHeader
        label="Watch variables"
        expanded={watchPatternVars}
        onToggle={() => setWatchPatternVars(!watchPatternVars)}
      />
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

function VariableValues({ overlay = false }: { overlay?: boolean }) {
  const names = useEditorStore(s => s.patternVars)
  const values = usePreviewStore(s => s.watchValues)
  return <div className={overlay ? 'panel-canvas-values' : 'panel-variable-values'}>{names.map(name => <div key={name} className={isWatchArrayValue(values[name]) ? 'panel-array-value' : ''}><span className="text-zinc-400 truncate" title={name}>{name}</span><span className="text-live tabular-nums" title={formatWatchValue(values[name])}>{formatWatchValue(values[name])}</span></div>)}</div>
}

export function VariablesCanvasReadout({ mode }: { mode: string }) {
  const [expanded] = usePanelSection(mode, 'Variables')
  const enabled = usePanelPreferencesStore(s => s.overlays[mode] ?? false)
  const names = useEditorStore(s => s.patternVars)
  if (!enabled || expanded || names.length === 0) return null
  return <div className="panel-canvas-readout" data-testid="variables-canvas-readout"><VariableValues overlay /></div>
}
