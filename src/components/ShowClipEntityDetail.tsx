import { useState, type ReactNode } from 'react'
import { NumberField } from './ui/number-field'
import { Grid2X2 } from 'lucide-react'
import { PatternCombobox, type PatternComboboxOption } from './PatternCombobox'
import { ShowEffectStack } from './ShowEffectsAuthoring'
import {
  normalizeShowClipEvaluationPolicy,
  showClipInspectorCapabilities,
  type ShowClipInspectorPatch,
  type ShowClipInspectorValue,
} from '@/engine/showClipInspectorModel'
import type { AutomatablePatternControl } from '@/engine/showPatternControls'
import type { ShowCompiledCostMetadata } from '@/engine/showVisualToolkit'

export interface ShowClipEntityDetailProps {
  value: ShowClipInspectorValue
  title: string
  readOnly: boolean
  patternOptions: PatternComboboxOption[]
  patternControls: AutomatablePatternControl[]
  compiledCost?: ShowCompiledCostMetadata
  layerOptions?: Array<{ value: string; label: string }>
  actions?: ReactNode
  structuralControls?: ReactNode
  embedded?: boolean
  primaryOnly?: boolean
  advancedDefaultOpen?: boolean
  transformEnabled?: boolean
  onPatch: (patch: ShowClipInspectorPatch) => void
  onPatternCommit?: () => void
  onOpenEffects: () => void
  onMoveLayer?: (layerId: string) => void
}

export function ShowClipEntityDetail({
  value,
  title,
  readOnly,
  patternOptions,
  patternControls,
  compiledCost,
  layerOptions,
  actions,
  structuralControls,
  embedded = false,
  primaryOnly = false,
  advancedDefaultOpen = false,
  transformEnabled = true,
  onPatch,
  onPatternCommit,
  onOpenEffects,
  onMoveLayer,
}: ShowClipEntityDetailProps) {
  const capabilities = showClipInspectorCapabilities(value.scope)
  const controlTargets = value.simulation.controlTargets
  const hasAuthoredPatternControls = Object.values(controlTargets ?? {}).some((target) => target !== undefined)
  const [patternTrayOpen, setPatternTrayOpen] = useState(hasAuthoredPatternControls)
  const [placementOpen, setPlacementOpen] = useState(true)
  const [advancedTrayOpen, setAdvancedTrayOpen] = useState(
    advancedDefaultOpen
      || value.view.mirror
      || value.view.phase !== 0
      || value.evaluationPolicy !== 'live'
      || value.presentation.mode !== 'live'
      || value.blink !== undefined,
  )

  return (
    <section
      role={embedded ? undefined : 'region'}
      aria-label={embedded ? undefined : 'Clip properties'}
      data-entity-family="clip"
      className="overflow-hidden bg-transparent"
    >
      {!embedded && <header className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800/90 bg-zinc-950/65 py-1 pl-2.5 pr-10">
        <span className="grid size-6 shrink-0 place-items-center rounded border border-cyan-400/35 bg-cyan-400/10 text-cyan-300">
          <Grid2X2 size={13} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">Clip properties</h3>
          <p className="truncate text-[9px] text-zinc-600">{title}</p>
        </div>
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </header>}

      <div className={embedded ? '' : 'p-2.5'}>
        <div data-testid="clip-primary-fields" className="grid min-w-0 items-end gap-2 sm:grid-cols-5">
          <label className="block min-w-0 text-[9px] uppercase tracking-[0.1em] text-zinc-600 sm:col-span-3">
            Source pattern
            <PatternCombobox
              key={`${value.owner.kind}:${value.pattern.kind}:${value.pattern.id}`}
              ariaLabel="Source pattern"
              value={`${value.pattern.kind}:${value.pattern.id}`}
              options={patternOptions}
              disabled={readOnly}
              compact
              className="mt-1"
              onCommit={onPatternCommit}
              onChange={(nextValue) => {
                const option = patternOptions.find((candidate) => candidate.value === nextValue)
                const separator = nextValue.indexOf(':')
                const kind = nextValue.slice(0, separator)
                const id = nextValue.slice(separator + 1)
                if (!option || separator < 1 || (kind !== 'stock' && kind !== 'user') || !id) return
                onPatch({ pattern: { ref: { kind, id }, name: option.label } })
              }}
            />
          </label>
          <ShowInspectorNumberField
            label="Speed"
            ariaLabel="Animation speed"
            value={value.simulation.timeScale}
            min={0}
            max={4}
            step={0.1}
            suffix="×"
            disabled={readOnly}
            help="How quickly Pattern animation advances. Does not change Clip duration or frame rate."
            onChange={(timeScale) => onPatch({ simulation: { timeScale } })}
          />
          <ShowInspectorNumberField
            label="Bright"
            ariaLabel="Brightness"
            value={value.view.brightness}
            min={0}
            max={1}
            step={0.01}
            showNormalizedRange={false}
            disabled={readOnly}
            onChange={(brightness) => onPatch({ view: { brightness } })}
          />
        </div>

        {capabilities.localTiming && value.local && (
          <div data-testid="clip-local-fields" className={`mt-2 grid items-end gap-2 ${capabilities.sourceOverOpacity ? 'sm:grid-cols-4' : 'sm:grid-cols-5'}`}>
            <div data-field-span className={capabilities.sourceOverOpacity ? '' : 'sm:col-span-3'}>
              <ShowInspectorNumberField
                label="Start"
                ariaLabel="Start seconds"
                value={value.local.startMs / 1_000}
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                step={0.1}
                suffix="s"
                disabled={readOnly}
                onChange={(seconds) => onPatch({ local: { startMs: Math.round(seconds * 1_000) } })}
              />
            </div>
            <div data-field-span className={capabilities.sourceOverOpacity ? '' : 'sm:col-span-2'}>
              <ShowInspectorNumberField
                label="Duration"
                ariaLabel="Duration seconds"
                value={value.local.durationMs / 1_000}
                min={0.1}
                max={Number.MAX_SAFE_INTEGER}
                step={0.1}
                suffix="s"
                disabled={readOnly}
                onChange={(seconds) => onPatch({ local: { durationMs: Math.round(seconds * 1_000) } })}
              />
            </div>
            {capabilities.sourceOverOpacity && (
              <ShowInspectorNumberField
                label="Opacity"
                value={value.local.opacity ?? 1}
                min={0}
                max={1}
                step={0.01}
                disabled={readOnly}
                onChange={(opacity) => onPatch({ local: { opacity } })}
              />
            )}
            {capabilities.layerAssignment && layerOptions && (
              <label className="min-w-0 text-[9px] uppercase tracking-[0.1em] text-zinc-600">
                Layer
                <select
                  aria-label="Overlay target layer"
                  value={value.layerId}
                  disabled={readOnly}
                  onChange={(event) => onMoveLayer?.(event.target.value)}
                  className="mt-1 h-7 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-[10px] normal-case tracking-normal text-zinc-200 outline-none focus:border-cyan-400/60"
                >
                  {layerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        {transformEnabled && <details
          aria-label="Clip Transform"
          className="mt-2 min-w-0 border-t border-zinc-800/80"
          open={placementOpen}
          onToggle={(event) => setPlacementOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-cyan-300/80">Placement</summary>
          <div className="grid min-w-0 gap-2 pb-0.5">
            <ClipContentGeometry value={value} readOnly={readOnly} qualified onPatch={onPatch} />
            <label className="mt-1 flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-cyan-300/80">
              <span>Viewport</span>
              <input
                type="checkbox"
                aria-label="Viewport"
                checked={value.viewport.enabled}
                disabled={readOnly}
                className="h-3 w-3 accent-cyan-400"
                onChange={(event) => onPatch({ viewport: { enabled: event.target.checked } })}
              />
            </label>
            {value.viewport.enabled && (
              <fieldset aria-label="Viewport geometry" className="min-w-0">
                <div className="grid min-w-0 grid-cols-2 items-end gap-x-2 gap-y-1.5 sm:grid-cols-4">
                  <ShowInspectorNumberField label="X" ariaLabel="Viewport X" value={value.viewport.x} min={-4} max={4} step={0.01} disabled={readOnly} onChange={(x) => onPatch({ viewport: { x } })} />
                  <ShowInspectorNumberField label="Y" ariaLabel="Viewport Y" value={value.viewport.y} min={-4} max={4} step={0.01} disabled={readOnly} onChange={(y) => onPatch({ viewport: { y } })} />
                  <ShowInspectorNumberField label="Width" ariaLabel="Viewport Width" value={value.viewport.width} min={0.01} max={8} step={0.01} disabled={readOnly} onChange={(width) => onPatch({ viewport: { width } })} />
                  <ShowInspectorNumberField label="Height" ariaLabel="Viewport Height" value={value.viewport.height} min={0.01} max={8} step={0.01} disabled={readOnly} onChange={(height) => onPatch({ viewport: { height } })} />
                </div>
              </fieldset>
            )}
          </div>
        </details>}

        <ShowEffectStack
          effects={value.effects}
          mirror={value.view.mirror}
          compiledCost={compiledCost}
          onChange={(effects) => onPatch({ effects })}
          onMirrorChange={(mirror) => onPatch({ view: { mirror } })}
          onAdd={onOpenEffects}
        />

        {!primaryOnly && <div data-testid="clip-control-trays" className="mt-1.5">
          {patternControls.length > 0 && (
            <details
              className="min-w-0 border-t border-zinc-800/80"
              aria-label="Pattern automation targets"
              open={patternTrayOpen}
              onToggle={(event) => setPatternTrayOpen(event.currentTarget.open)}
            >
              <summary className="cursor-pointer py-1 text-[9px] uppercase tracking-[0.12em] text-cyan-300/80">Pattern controls</summary>
              <div className="overflow-x-auto border-t border-zinc-800/70">
                <table aria-label="Pattern controls" className="w-full table-fixed border-collapse text-left text-[9px]">
                  <colgroup>
                    <col className="w-7" />
                    <col style={{ width: '24%' }} />
                    <col />
                    <col className="w-8" />
                  </colgroup>
                  <thead className="text-[8px] uppercase tracking-[0.1em] text-zinc-700">
                    <tr>
                      <th className="py-0.5 pr-2"><span className="sr-only">Use</span></th>
                      <th className="whitespace-nowrap py-0.5 pr-3 font-normal">Control</th>
                      <th className="whitespace-nowrap py-0.5 pr-3 font-normal">Export</th>
                      <th className="whitespace-nowrap py-0.5 font-normal">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patternControls.map((control) => {
                      const target = controlTargets?.[control.exportName]
                      const enabled = target !== undefined
                      return (
                        <tr key={control.exportName} className="h-6 align-middle whitespace-nowrap">
                          <td className="py-0.5 pr-2">
                          <input
                            type="checkbox"
                            aria-label={`Set ${control.label} target`}
                            checked={enabled}
                            disabled={readOnly}
                            onChange={(event) => onPatch({
                              simulation: {
                                controlTargets: withControlTarget(
                                  controlTargets,
                                  control.exportName,
                                  event.target.checked ? control.defaultValue : undefined,
                                ),
                              },
                            })}
                            className="h-3 w-3 accent-cyan-400"
                          />
                          </td>
                          <th
                            scope="row"
                            className="truncate whitespace-nowrap py-0.5 pr-3 text-[10px] font-medium text-zinc-300"
                            title={control.label}
                          >
                            {control.label}
                          </th>
                          <td
                            className="truncate whitespace-nowrap py-0.5 pr-3 font-mono text-[8px] text-zinc-600"
                            title={`${control.exportName} · Studio default ${control.defaultValue}`}
                          >
                            {control.exportName} · {control.min}–{control.max}
                          </td>
                          <td className="whitespace-nowrap py-0.5 [&_input]:!border-0">
                            {enabled ? (
                              <ShowInspectorNumberField
                                label={`${control.label} target`}
                                hideLabel
                                value={target}
                                min={control.min}
                                max={control.max}
                                step={0.01}
                                compact
                                disabled={readOnly}
                                onChange={(next) => onPatch({
                                  simulation: { controlTargets: withControlTarget(controlTargets, control.exportName, next) },
                                })}
                              />
                            ) : <span aria-hidden className="text-zinc-700">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <details
            className="min-w-0 border-t border-zinc-800/80"
            aria-label="Advanced Clip controls"
            open={advancedTrayOpen}
            onToggle={(event) => setAdvancedTrayOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer py-1 text-[9px] uppercase tracking-[0.12em] text-zinc-500">Advanced clip controls</summary>
            <div className="border-t border-zinc-800/70">
              <table aria-label="Advanced clip controls" className="w-full table-fixed border-collapse text-left text-[9px]">
                <colgroup>
                  <col className="w-7" />
                  <col style={{ width: '24%' }} />
                  <col />
                </colgroup>
                <tbody>
                  {value.scope !== 'global' && <>
                    <tr className="h-6 whitespace-nowrap">
                      <td aria-hidden className="py-0.5 pr-2" />
                      <th scope="row" className="truncate py-0.5 pr-3 text-[10px] font-medium text-zinc-300">Presentation</th>
                      <td className="py-0.5">
                        <select
                          aria-label="Clip presentation"
                          value={value.presentation.mode}
                          disabled={readOnly}
                          onChange={(event) => {
                            const mode = event.target.value
                            onPatch({ presentation: mode === 'freeze'
                              ? { mode: 'freeze' }
                              : mode === 'strobe'
                                ? { mode: 'strobe', cadenceMs: 1_000 }
                                : { mode: 'live' } })
                          }}
                          className="h-5 w-full border-0 border-b border-zinc-800 bg-transparent px-1 text-[9px] text-zinc-200 outline-none focus:border-cyan-400/60 disabled:opacity-60"
                        >
                          <option value="live">Live</option>
                          <option value="freeze">Freeze</option>
                          <option value="strobe">Strobe</option>
                        </select>
                      </td>
                    </tr>
                    {value.presentation.mode === 'strobe' && <tr className="h-6 whitespace-nowrap">
                      <td aria-hidden className="py-0.5 pr-2" />
                      <th scope="row" className="truncate py-0.5 pr-3 text-[10px] font-medium text-zinc-300">Strobe cadence</th>
                      <td className="py-0.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="min-w-20 max-w-28 flex-1 [&_input]:!border-0">
                            <ShowInspectorNumberField
                              label="Strobe cadence seconds"
                              hideLabel
                              align="left"
                              value={value.presentation.cadenceMs / 1_000}
                              min={0.016}
                              max={60}
                              step={0.05}
                              suffix="s"
                              compact
                              disabled={readOnly}
                              onChange={(seconds) => onPatch({
                                presentation: { mode: 'strobe', cadenceMs: Math.round(seconds * 1_000) },
                              })}
                            />
                          </div>
                          <span className="truncate text-[8px] text-zinc-600">capture and hold</span>
                        </div>
                      </td>
                    </tr>}
                    <tr className="h-6 whitespace-nowrap">
                      <td className="py-0.5 pr-2">
                        <input
                          type="checkbox"
                          aria-label="Blink Clip output"
                          checked={value.blink !== undefined}
                          disabled={readOnly}
                          className="h-3 w-3 accent-cyan-400"
                          onChange={(event) => onPatch({
                            blink: event.target.checked ? { rateHz: 2, duty: 0.5, phase: 0 } : null,
                          })}
                        />
                      </td>
                      <th scope="row" className="truncate py-0.5 pr-3 text-[10px] font-medium text-zinc-300">Blink output</th>
                      <td className="truncate py-0.5 text-zinc-500">
                        Gate this Clip on and off
                      </td>
                    </tr>
                    {value.blink && <tr className="h-6 whitespace-nowrap">
                      <td aria-hidden className="py-0.5 pr-2" />
                      <th scope="row" className="truncate py-0.5 pr-3 text-[10px] font-medium text-zinc-300">Blink timing</th>
                      <td className="py-0.5">
                        <div className="grid grid-cols-3 gap-1.5 [&_input]:!border-0">
                          <ShowInspectorNumberField
                            label="Blink rate Hz"
                            value={value.blink.rateHz}
                            min={0.01}
                            max={60}
                            step={0.1}
                            suffix="Hz"
                            compact
                            disabled={readOnly}
                            onChange={(rateHz) => onPatch({ blink: { ...value.blink!, rateHz } })}
                          />
                          <ShowInspectorNumberField
                            label="Blink duty"
                            value={value.blink.duty}
                            min={0}
                            max={1}
                            step={0.01}
                            compact
                            disabled={readOnly}
                            onChange={(duty) => onPatch({ blink: { ...value.blink!, duty } })}
                          />
                          <ShowInspectorNumberField
                            label="Blink phase"
                            value={value.blink.phase}
                            min={0}
                            max={1}
                            step={0.01}
                            compact
                            disabled={readOnly}
                            onChange={(phase) => onPatch({ blink: { ...value.blink!, phase } })}
                          />
                        </div>
                      </td>
                    </tr>}
                  </>}
                  <tr className="h-6 whitespace-nowrap">
                    <td className="py-0.5 pr-2">
                      <input
                        type="checkbox"
                        aria-label="Mirror clip"
                        checked={value.view.mirror}
                        disabled={readOnly}
                        onChange={(event) => onPatch({ view: { mirror: event.target.checked } })}
                      />
                    </td>
                    <th scope="row" className="truncate py-0.5 pr-3 text-[10px] font-medium text-zinc-300">Mirror clip</th>
                    <td aria-hidden className="py-0.5" />
                  </tr>
                  <tr className="h-6 whitespace-nowrap">
                    <td aria-hidden className="py-0.5 pr-2" />
                    <th scope="row" className="truncate py-0.5 pr-3 text-[10px] font-medium text-zinc-300">Phase <span className="ml-1 text-[8px] font-normal text-zinc-700">0–1</span></th>
                    <td className="py-0.5 [&_input]:!border-0">
                      <ShowInspectorNumberField
                        label="Phase"
                        hideLabel
                        align="left"
                        value={value.view.phase}
                        min={0}
                        max={1}
                        step={0.01}
                        compact
                        disabled={readOnly}
                        onChange={(phase) => onPatch({ view: { phase } })}
                      />
                    </td>
                  </tr>
                  <tr className="h-6 whitespace-nowrap">
                    <td aria-hidden className="py-0.5 pr-2" />
                    <th scope="row" className="truncate py-0.5 pr-3 text-[10px] font-medium text-zinc-300">Evaluation</th>
                    <td className="py-0.5">
                      <select
                        aria-label="Clip evaluation"
                        value={value.evaluationPolicy}
                        disabled={readOnly}
                        title={value.evaluationPolicy === 'freeze-at-entry'
                          ? 'Capture one complete RGB traversal on entry, then replay it while the Pattern clock continues.'
                          : value.evaluationPolicy === 'rolling-refresh'
                            ? 'Update one quarter of pixels per frame and replay the rest. Maximum pixel age is three frames; the Pattern clock continues.'
                            : 'Evaluate the Pattern for every presented frame.'}
                        onChange={(event) => onPatch({
                          evaluationPolicy: normalizeShowClipEvaluationPolicy(
                            event.target.value as ShowClipInspectorValue['evaluationPolicy'],
                          ),
                        })}
                        className="h-5 w-full max-w-44 border-0 border-b border-zinc-800 bg-transparent px-1 text-[9px] text-zinc-200 outline-none focus:border-cyan-400/60 disabled:opacity-60"
                      >
                        <option value="live">Live</option>
                        <option value="freeze-at-entry">Freeze at entry</option>
                        <option value="rolling-refresh">Refresh (4 slices)</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
              {structuralControls}
            </div>
          </details>
        </div>}
      </div>
    </section>
  )
}

function ClipContentGeometry({
  value,
  readOnly,
  qualified = false,
  onPatch,
}: {
  value: ShowClipInspectorValue
  readOnly: boolean
  qualified?: boolean
  onPatch: (patch: ShowClipInspectorPatch) => void
}) {
  const aria = (label: string) => qualified ? `Content ${label}` : label
  return <div className="grid min-w-0 grid-cols-2 items-end gap-x-2 gap-y-1.5 sm:grid-cols-5">
    <ShowInspectorNumberField label="X" ariaLabel={aria('X')} value={value.transform.positionX} min={-4} max={4} step={0.01} disabled={readOnly} onChange={(positionX) => onPatch({ transform: { positionX } })} />
    <ShowInspectorNumberField label="Y" ariaLabel={aria('Y')} value={value.transform.positionY} min={-4} max={4} step={0.01} disabled={readOnly} onChange={(positionY) => onPatch({ transform: { positionY } })} />
    <ShowInspectorNumberField label="Width" ariaLabel={aria('Width')} value={value.transform.scaleX} min={0.01} max={8} step={0.01} disabled={readOnly} onChange={(scaleX) => onPatch({ transform: { scaleX } })} />
    <ShowInspectorNumberField label="Height" ariaLabel={aria('Height')} value={value.transform.scaleY} min={0.01} max={8} step={0.01} disabled={readOnly} onChange={(scaleY) => onPatch({ transform: { scaleY } })} />
    <ShowInspectorNumberField label="Rotation" ariaLabel="Rotation degrees" value={value.transform.rotation * 360} min={-2880} max={2880} step={1} suffix="deg" disabled={readOnly} onChange={(degrees) => onPatch({ transform: { rotation: degrees / 360 } })} />
  </div>
}

// The shared draft-buffered numeric field (#577). Re-exported under the
// historical inspector name for existing call sites.
export const ShowInspectorNumberField = NumberField

function withControlTarget(
  current: Record<string, number> | undefined,
  exportName: string,
  value: number | undefined,
): Record<string, number> | undefined {
  const next = { ...(current ?? {}) }
  if (value === undefined) delete next[exportName]
  else next[exportName] = value
  return Object.keys(next).length > 0 ? next : undefined
}
