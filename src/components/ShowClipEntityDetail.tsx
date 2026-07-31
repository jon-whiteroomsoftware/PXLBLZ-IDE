import { useRef, useState, type ReactNode } from 'react'
import { NumberField } from './ui/number-field'
import { PercentageField } from './ui/percentage-field'
import { DomainNumberField } from './ui/domain-number-field'
import { TimeField } from './ui/time-field'
import { Grid2X2 } from 'lucide-react'
import { PatternCombobox, type PatternComboboxOption } from './PatternCombobox'
import { ShowEffectPalette, ShowEffectStack } from './ShowEffectsAuthoring'
import { ShowClipPlacementPad } from './ShowClipPlacementPad'
import { ShowPropertyAnimationAction } from './ShowPropertyAnimationEditor'
import {
  enableViewportForContent,
  type PlacementFocus,
} from '@/engine/showClipPlacementPad'
import {
  normalizeShowClipEvaluationPolicy,
  showClipInspectorCapabilities,
  type ShowClipInspectorPatch,
  type ShowClipInspectorValue,
} from '@/engine/showClipInspectorModel'
import {
  projectShowClipDetailTabs,
  recallShowClipDetailTab,
  rememberShowClipDetailTab,
  resolveShowClipDetailTab,
  type ShowClipDetailTabId,
} from '@/engine/showClipDetailTabs'
import type { AutomatablePatternControl } from '@/engine/showPatternControls'
import { formatPercentageValue } from '@/engine/percentageValue'
import type { ShowPropertyAnimationTarget } from '@/engine/personalContentRecords'

export interface ShowClipEntityDetailProps {
  value: ShowClipInspectorValue
  title: string
  readOnly: boolean
  patternOptions: PatternComboboxOption[]
  patternControls: AutomatablePatternControl[]
  layerOptions?: Array<{ value: string; label: string }>
  actions?: ReactNode
  structuralControls?: ReactNode
  embedded?: boolean
  /** Identity of the owning panel, so a pinned panel keeps its own tab. */
  panelKey?: string
  transformEnabled?: boolean
  stageDimensions?: 1 | 2 | 3
  onPatch: (patch: ShowClipInspectorPatch) => boolean | void | Promise<void>
  onPreviewPatch?: (patch: ShowClipInspectorPatch) => void
  onPreviewEnd?: () => void
  onPatternCommit?: () => void
  onMoveLayer?: (layerId: string) => void
}

/**
 * Placement values come from free dragging, so they carry float dust that fills
 * a narrow field with noise like 0.66666666. Rounded for display only - the
 * stored value keeps full precision, because content is centre-anchored and the
 * aperture corner-anchored, and rounding each would round them apart and break
 * the exact match the pad's edge magnets exist to produce.
 */
const shown = (value: number) => Math.round(value * 1000) / 1000

/**
 * Written out rather than interpolated because Tailwind only emits classes it
 * can see as literals. Brightness is always present, so one is the floor.
 */
const HEADER_COLUMN_CLASS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
}

export function ShowClipEntityDetail({
  value,
  title,
  readOnly,
  patternOptions,
  patternControls,
  layerOptions,
  actions,
  structuralControls,
  embedded = false,
  panelKey = 'transient',
  transformEnabled = true,
  stageDimensions = transformEnabled ? 2 : 1,
  onPatch,
  onPreviewPatch,
  onPreviewEnd,
  onPatternCommit,
  onMoveLayer,
}: ShowClipEntityDetailProps) {
  const capabilities = showClipInspectorCapabilities(value.scope)
  // Narrowed once so the header can both gate rendering and count its columns
  // from the same predicate.
  const localTiming = capabilities.localTiming && value.local !== undefined
  const showOpacity = capabilities.sourceOverOpacity && value.local !== undefined
  const headerFieldCount = 1 + (localTiming ? 2 : 0) + (showOpacity ? 1 : 0)
  const controlTargets = value.simulation.controlTargets
  const [placementFocus, setPlacementFocus] = useState<PlacementFocus>('content')
  const [effectChooserOpen, setEffectChooserOpen] = useState(false)
  const addEffectButtonRef = useRef<HTMLButtonElement>(null)
  const placementGroupRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const activePlacementFocus: PlacementFocus = value.viewport.enabled ? placementFocus : 'content'
  const selectPlacementFocus = (next: PlacementFocus) => setPlacementFocus(next)
  const selectPlacementSummary = (next: PlacementFocus) => {
    selectPlacementFocus(next)
    if (next === 'aperture' && !value.viewport.enabled) {
      void onPatch({
        viewport: enableViewportForContent({
          transform: value.transform,
          viewport: value.viewport,
          grid: 3,
        }),
      })
    }
  }
  const focusPlacementPad = () => placementGroupRef.current
    ?.querySelector<SVGSVGElement>('[role="application"]')
    ?.focus()
  const closeEffectChooser = () => {
    setEffectChooserOpen(false)
    window.setTimeout(() => addEffectButtonRef.current?.focus(), 0)
  }
  const focusAppliedEffect = (effectId?: string) => {
    window.setTimeout(() => {
      const target = effectId
        ? detailRef.current?.querySelector<HTMLElement>(`[data-show-effect-id="${effectId}"]`)
        : detailRef.current?.querySelector<HTMLElement>('[data-testid="show-effect-mirror"] button')
      target?.focus()
    }, 0)
  }

  /*
    Tabs (#642). The preference is session-scoped and keyed by panel, so a pinned
    comparison panel keeps its own tab. It is deliberately not per Clip: holding
    one facet still while stepping through Clips is the whole point.

    Only an explicit click writes the preference. The fallback for an
    inapplicable tab does not, so the chosen tab returns as soon as a Clip can
    show it again.
  */
  const [preferredTab, setPreferredTab] = useState<ShowClipDetailTabId | undefined>(
    () => recallShowClipDetailTab(panelKey),
  )
  const tabs = projectShowClipDetailTabs({ value, transformEnabled })
  const activeTab = resolveShowClipDetailTab(preferredTab, tabs)
  const selectTab = (tab: ShowClipDetailTabId) => {
    setPreferredTab(tab)
    rememberShowClipDetailTab(panelKey, tab)
  }
  const tabIdFor = (tab: ShowClipDetailTabId) => `clip-detail-tab-${panelKey}-${tab}`
  const panelId = `clip-detail-panel-${panelKey}`

  return (
    <section
      ref={detailRef}
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
        {/*
          The persistent zone (#641). Start and Duration are what an author moves
          constantly while composing; Brightness and Opacity describe the whole
          Clip rather than the Pattern, which is why they sit here and not beside
          Source pattern. One row, because two rows cost roughly 40px paid on
          every open.

          The column count follows the scope's real capabilities rather than a
          fixed four: a global-scope Clip has no local timing, and overlay is the
          only scope with source-over Opacity. A fixed grid would leave holes.
        */}
        <div
          data-testid="clip-header-fields"
          className={`grid min-w-0 items-end gap-x-2 ${HEADER_COLUMN_CLASS[headerFieldCount]}`}
        >
          {localTiming && value.local && (
            <div data-header-field="start">
              <TimeField
                label="Start"
                ariaLabel="Start seconds"
                value={value.local.startMs / 1_000}
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                step={0.001}
                disabled={readOnly}
                onPreview={(seconds) => onPreviewPatch?.({ local: { startMs: Math.round(seconds * 1_000) } })}
                onPreviewEnd={onPreviewEnd}
                onChange={(seconds) => onPatch({ local: { startMs: Math.round(seconds * 1_000) } })}
              />
            </div>
          )}
          {localTiming && value.local && (
            <div data-header-field="duration">
              <TimeField
                label="Duration"
                ariaLabel="Duration seconds"
                value={value.local.durationMs / 1_000}
                min={0.1}
                max={Number.MAX_SAFE_INTEGER}
                step={0.001}
                disabled={readOnly}
                onPreview={(seconds) => onPreviewPatch?.({ local: { durationMs: Math.round(seconds * 1_000) } })}
                onPreviewEnd={onPreviewEnd}
                onChange={(seconds) => onPatch({ local: { durationMs: Math.round(seconds * 1_000) } })}
              />
            </div>
          )}
          <div data-header-field="brightness">
            <PercentageField
              label="Brightness"
              ariaLabel="Brightness"
              labelAction={value.placementId ? (
                <ShowPropertyAnimationAction
                  target={{ kind: 'placement-view', placementId: value.placementId, property: 'brightness' }}
                />
              ) : undefined}
              value={value.view.brightness}
              min={0}
              max={1}
              step={0.01}
              disabled={readOnly}
              onPreview={(brightness) => onPreviewPatch?.({ view: { brightness } })}
              onPreviewEnd={onPreviewEnd}
              onChange={(brightness) => onPatch({ view: { brightness } })}
            />
          </div>
          {showOpacity && value.local && (
            <div data-header-field="opacity">
              <PercentageField
                label="Opacity"
                labelAction={value.placementId ? (
                  <ShowPropertyAnimationAction
                    target={{ kind: 'placement-opacity', placementId: value.placementId }}
                  />
                ) : undefined}
                value={value.local.opacity ?? 1}
                min={0}
                max={1}
                step={0.01}
                disabled={readOnly}
                onPreview={(opacity) => onPreviewPatch?.({ local: { opacity } })}
                onPreviewEnd={onPreviewEnd}
                onChange={(opacity) => onPatch({ local: { opacity } })}
              />
            </div>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Clip properties sections"
          data-testid="clip-detail-tabs"
          className="mt-2 flex border-y border-zinc-800/80"
          onKeyDown={(event) => {
            const available = tabs.filter((tab) => tab.applicable)
            const index = available.findIndex((tab) => tab.id === activeTab)
            const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
            const target = event.key === 'Home'
              ? available[0]
              : event.key === 'End'
                ? available[available.length - 1]
                : step
                  ? available[(index + step + available.length) % available.length]
                  : undefined
            if (!target) return
            event.preventDefault()
            selectTab(target.id)
            // The roving tab stop has to follow selection, or focus is left on a
            // tab that is now aria-selected=false with tabindex=-1.
            document.getElementById(tabIdFor(target.id))?.focus()
          }}
        >
          {tabs.filter((tab) => tab.applicable).map((tab) => (
            /*
              Deliberately not a <button>. ShowEditor wraps this panel in
              <fieldset disabled> for a read-only built-in Show, and a disabled
              fieldset disables descendant form controls - which would make Place,
              Effects and Playback permanently unreachable there. The disclosures
              this replaced were not form controls and stayed operable, so tabs
              must too: navigating a read-only panel is still reading, not editing.
            */
            <div
              key={tab.id}
              role="tab"
              id={tabIdFor(tab.id)}
              aria-selected={activeTab === tab.id}
              aria-controls={panelId}
              tabIndex={activeTab === tab.id ? 0 : -1}
              data-authored={tab.authored ? 'true' : undefined}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                selectTab(tab.id)
              }}
              className={`flex flex-1 cursor-pointer select-none items-center justify-center gap-1.5 py-1.5 text-[9.5px] tracking-[0.06em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300 ${
                activeTab === tab.id
                  ? 'border-b-[1.5px] border-cyan-300 text-cyan-300'
                  : 'border-b-[1.5px] border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
              {/* A dot means authored non-default state, not "has content" -
                  the latter would leave Pattern and Place permanently marked. */}
              {tab.authored && (
                <span aria-hidden className="size-[3px] rounded-full bg-current" />
              )}
              {tab.authored && <span className="sr-only">(has changes)</span>}
            </div>
          ))}
        </div>

        {/* A floor, not a fixed height: the panel must not resize as tabs change,
            but a takeover may still use the room below it. */}
        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabIdFor(activeTab)}
          data-active-tab={activeTab}
          className="min-h-[262px] pt-2"
        >

        {activeTab === 'pattern' && <div data-testid="clip-primary-fields" className="grid min-w-0 items-end gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className="block min-w-0 text-[9px] uppercase tracking-[0.1em] text-zinc-600">
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
          <DomainNumberField
            label="Speed"
            ariaLabel="Animation speed"
            labelAction={value.instanceId ? (
              <ShowPropertyAnimationAction
                target={{ kind: 'instance-time-scale', instanceId: value.instanceId }}
              />
            ) : undefined}
            presentation="multiplier"
            value={value.simulation.timeScale}
            min={0}
            max={4}
            step={0.1}
            disabled={readOnly}
            help="How quickly Pattern animation advances. Does not change Clip duration or frame rate."
            onPreview={(timeScale) => onPreviewPatch?.({ simulation: { timeScale } })}
            onPreviewEnd={onPreviewEnd}
            onChange={(timeScale) => onPatch({ simulation: { timeScale } })}
          />
        </div>}

        {activeTab === 'pattern' && capabilities.layerAssignment && layerOptions && (
          <label className="mt-2 block min-w-0 text-[9px] uppercase tracking-[0.1em] text-zinc-600 sm:w-1/2">
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

        {activeTab === 'place' && <div ref={placementGroupRef} role="group" aria-label="Clip Transform" className="min-w-0">
          <div className="grid min-w-0 grid-cols-[minmax(156px,228px)_minmax(112px,1fr)] items-start gap-2 pb-0.5">
            <ShowClipPlacementPad
              transform={value.transform}
              viewport={value.viewport}
              readOnly={readOnly}
              focus={activePlacementFocus}
              onFocusChange={selectPlacementFocus}
              onChange={onPatch}
              onPreview={onPreviewPatch}
              onPreviewEnd={onPreviewEnd}
            />
            <div className="grid min-w-0 gap-1">
              <PlacementRectangleSummary
                focus={activePlacementFocus}
                value={value}
                readOnly={readOnly}
                onSelect={selectPlacementSummary}
              />
              <ClipPlacementGeometry
                focus={activePlacementFocus}
                onFocusPad={focusPlacementPad}
                value={value}
                readOnly={readOnly}
                onPreviewPatch={onPreviewPatch}
                onPreviewEnd={onPreviewEnd}
                onPatch={onPatch}
              />
            </div>
          </div>
        </div>}

        {activeTab === 'effects' && (effectChooserOpen
          ? <ShowEffectPalette
              clip={{ patternName: value.patternName, effects: value.effects }}
              stageDimensions={stageDimensions}
              onApply={(application) => {
                if (application.target === 'placement-mirror') {
                  const committed = onPatch({ view: { mirror: application.mirror } })
                  if (committed !== false) void Promise.resolve(committed).then(() => focusAppliedEffect())
                  return
                }
                const effect = application.effect
                const committed = onPatch({ effects: [...value.effects, effect] })
                if (committed !== false) void Promise.resolve(committed).then(() => focusAppliedEffect(effect.id))
              }}
              onClose={closeEffectChooser}
            />
          : <ShowEffectStack
              effects={value.effects}
              mirror={value.view.mirror}
              animationPlacementId={value.placementId}
              disabled={readOnly}
              onChange={(effects) => onPatch({ effects })}
              onPreview={(effects) => onPreviewPatch?.({ effects })}
              onPreviewEnd={onPreviewEnd}
              onMirrorChange={(mirror) => onPatch({ view: { mirror } })}
              onAdd={() => {
                if (!readOnly) setEffectChooserOpen(true)
              }}
              addButtonRef={addEffectButtonRef}
            />)}

        <div data-testid="clip-control-trays">
          {activeTab === 'pattern' && patternControls.length > 0 && (
            <div className="mt-2 min-w-0 border-t border-zinc-800/80" aria-label="Pattern automation targets">
              <p className="py-1 text-[9px] uppercase tracking-[0.12em] text-cyan-300/80">Pattern controls</p>
              <div className="overflow-x-auto border-t border-zinc-800/70">
                <table aria-label="Pattern controls" className="w-full table-fixed border-collapse text-left text-[9px]">
                  <colgroup>
                    <col className="w-7" />
                    <col style={{ width: '24%' }} />
                    <col />
                    <col className="w-16" />
                    <col className="w-5" />
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
                            title={`${control.exportName} · Studio default ${formatPercentageValue(control.defaultValue)}`}
                          >
                            {control.exportName} · 0–100%
                          </td>
                          <td className="whitespace-nowrap py-0.5 [&_input]:!border-0">
                            {enabled ? (
                              <PercentageField
                                label={`${control.label} target`}
                                hideLabel
                                value={target}
                                min={control.min}
                                max={control.max}
                                step={0.01}
                                compact
                                disabled={readOnly}
                                onPreview={(next) => onPreviewPatch?.({
                                  simulation: { controlTargets: withControlTarget(controlTargets, control.exportName, next) },
                                })}
                                onPreviewEnd={onPreviewEnd}
                                onChange={(next) => onPatch({
                                  simulation: { controlTargets: withControlTarget(controlTargets, control.exportName, next) },
                                })}
                              />
                            ) : <span aria-hidden className="text-zinc-700">—</span>}
                          </td>
                          <td className="py-0.5 pl-1">
                            {enabled && value.instanceId && (
                              <ShowPropertyAnimationAction
                                target={{
                                  kind: 'instance-control',
                                  instanceId: value.instanceId,
                                  exportName: control.exportName,
                                }}
                                label={control.label}
                              />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'pattern' && structuralControls && (
            <div className="mt-2 min-w-0 border-t border-zinc-800/80">
              <p className="py-1 text-[9px] uppercase tracking-[0.12em] text-cyan-300/80">Pattern instance</p>
              {structuralControls}
            </div>
          )}

          {activeTab === 'playback' && (
            <div className="min-w-0" aria-label="Playback controls">
              <table aria-label="Playback controls" className="w-full table-fixed border-collapse text-left text-[9px]">
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
                            <TimeField
                              label="Strobe cadence seconds"
                              hideLabel
                              align="left"
                              value={value.presentation.cadenceMs / 1_000}
                              min={0.016}
                              max={60}
                              step={0.05}
                              compact
                              disabled={readOnly}
                              onPreview={(seconds) => onPreviewPatch?.({
                                presentation: { mode: 'strobe', cadenceMs: Math.round(seconds * 1_000) },
                              })}
                              onPreviewEnd={onPreviewEnd}
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
                          <PercentageField
                            label="Blink duty"
                            value={value.blink.duty}
                            min={0}
                            max={1}
                            step={0.01}
                            compact
                            disabled={readOnly}
                            onPreview={(duty) => onPreviewPatch?.({ blink: { ...value.blink!, duty } })}
                            onPreviewEnd={onPreviewEnd}
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
                    <td aria-hidden className="py-0.5 pr-2" />
                    <th scope="row" className="py-0.5 pr-3 text-[10px] font-medium text-zinc-300">
                      <span className="flex items-center gap-1">
                        <span className="truncate">Phase <span className="ml-1 text-[8px] font-normal text-zinc-700">0–1</span></span>
                        {value.placementId && (
                          <ShowPropertyAnimationAction
                            target={{ kind: 'placement-view', placementId: value.placementId, property: 'phase' }}
                          />
                        )}
                      </span>
                    </th>
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
            </div>
          )}
        </div>
        </div>
      </div>
    </section>
  )
}

function PlacementRectangleSummary({
  focus,
  value,
  readOnly,
  onSelect,
}: {
  focus: PlacementFocus
  value: ShowClipInspectorValue
  readOnly: boolean
  onSelect: (focus: PlacementFocus) => void
}) {
  const summaryFocus: PlacementFocus = focus === 'content' ? 'aperture' : 'content'
  const isAperture = summaryFocus === 'aperture'
  const summary = isAperture
    ? value.viewport.enabled
      ? `${shown(value.viewport.x)}, ${shown(value.viewport.y)} · ${shown(value.viewport.width)}×${shown(value.viewport.height)}`
      : 'Off · select to enable'
    : `${shown(value.transform.positionX)}, ${shown(value.transform.positionY)} · ${shown(value.transform.scaleX)}×${shown(value.transform.scaleY)}`
  const label = isAperture ? 'Aperture' : 'Content'
  return (
    <button
      type="button"
      aria-label={`${label} summary`}
      disabled={readOnly && isAperture && !value.viewport.enabled}
      onClick={() => onSelect(summaryFocus)}
      className="flex h-5 min-w-0 items-center gap-1 rounded border border-transparent px-1 text-left font-mono text-[8px] text-zinc-500 hover:border-zinc-800 hover:text-zinc-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300 disabled:cursor-default disabled:opacity-60"
    >
      <span className={`shrink-0 font-sans text-[7.5px] uppercase tracking-[0.08em] ${isAperture ? 'text-amber-300/75' : 'text-violet-300/75'}`}>
        {isAperture ? 'Ap' : 'Ct'}
      </span>
      <span className="min-w-0 truncate">{summary}</span>
    </button>
  )
}

/**
 * The fields edit the focused rectangle. The other rectangle stays visible in
 * the summary above, preserving comparison without spending a second field row.
 */
function ClipPlacementGeometry({
  focus,
  onFocusPad,
  value,
  readOnly,
  onPreviewPatch,
  onPreviewEnd,
  onPatch,
}: {
  focus: PlacementFocus
  onFocusPad: () => void
  value: ShowClipInspectorValue
  readOnly: boolean
  onPreviewPatch?: ShowClipEntityDetailProps['onPreviewPatch']
  onPreviewEnd?: ShowClipEntityDetailProps['onPreviewEnd']
  onPatch: ShowClipEntityDetailProps['onPatch']
}) {
  const content = focus === 'content'
  const prefix = content ? 'Content' : 'Viewport'
  const xLabel = content ? 'Content X' : 'Viewport X'
  const yLabel = content ? 'Content Y' : 'Viewport Y'
  const widthLabel = content ? 'Content Width' : 'Viewport Width'
  const heightLabel = content ? 'Content Height' : 'Viewport Height'
  const positionX = content ? value.transform.positionX : value.viewport.x
  const positionY = content ? value.transform.positionY : value.viewport.y
  const width = content ? value.transform.scaleX : value.viewport.width
  const height = content ? value.transform.scaleY : value.viewport.height
  const animationTarget = (
    property: 'positionX' | 'positionY' | 'rotation' | 'scaleX' | 'scaleY' | 'x' | 'y' | 'width' | 'height',
  ): ShowPropertyAnimationTarget | undefined => {
    if (!value.placementId) return undefined
    return content
      ? {
          kind: 'placement-transform',
          placementId: value.placementId,
          property: property as 'positionX' | 'positionY' | 'rotation' | 'scaleX' | 'scaleY',
        }
      : {
          kind: 'placement-viewport',
          placementId: value.placementId,
          property: property as 'x' | 'y' | 'width' | 'height',
        }
  }
  const animationAction = (
    property: Parameters<typeof animationTarget>[0],
    label: string,
  ) => {
    const target = animationTarget(property)
    return target ? <ShowPropertyAnimationAction target={target} label={label} /> : undefined
  }
  return (
    <div role="group" aria-label={`${content ? 'Content' : 'Aperture'} geometry`} className="grid min-w-0 gap-1">
      <ShowInspectorNumberField compact label="X" ariaLabel={xLabel} labelAction={animationAction(content ? 'positionX' : 'x', xLabel)} value={shown(positionX)} min={-4} max={4} step={0.01} reserveSuffixSpace padGrip={{ ariaLabel: `Use ${prefix} X on placement pad`, onClick: onFocusPad }} disabled={readOnly} onChange={(next) => onPatch(content ? { transform: { positionX: next } } : { viewport: { x: next } })} />
      <ShowInspectorNumberField compact label="Y" ariaLabel={yLabel} labelAction={animationAction(content ? 'positionY' : 'y', yLabel)} value={shown(positionY)} min={-4} max={4} step={0.01} reserveSuffixSpace padGrip={{ ariaLabel: `Use ${prefix} Y on placement pad`, onClick: onFocusPad }} disabled={readOnly} onChange={(next) => onPatch(content ? { transform: { positionY: next } } : { viewport: { y: next } })} />
      <DomainNumberField compact label="Width" ariaLabel={widthLabel} labelAction={animationAction(content ? 'scaleX' : 'width', widthLabel)} presentation="multiplier" value={shown(width)} min={0.01} max={8} step={0.01} reserveSuffixSpace disabled={readOnly} onPreview={(next) => onPreviewPatch?.(content ? { transform: { scaleX: next } } : { viewport: { width: next } })} onPreviewEnd={onPreviewEnd} onChange={(next) => onPatch(content ? { transform: { scaleX: next } } : { viewport: { width: next } })} />
      <DomainNumberField compact label="Height" ariaLabel={heightLabel} labelAction={animationAction(content ? 'scaleY' : 'height', heightLabel)} presentation="multiplier" value={shown(height)} min={0.01} max={8} step={0.01} reserveSuffixSpace disabled={readOnly} onPreview={(next) => onPreviewPatch?.(content ? { transform: { scaleY: next } } : { viewport: { height: next } })} onPreviewEnd={onPreviewEnd} onChange={(next) => onPatch(content ? { transform: { scaleY: next } } : { viewport: { height: next } })} />
      <ShowInspectorNumberField compact label="Rotation" ariaLabel={content ? 'Rotation degrees' : 'Viewport rotation'} labelAction={content ? animationAction('rotation', 'Rotation') : undefined} value={content ? shown(value.transform.rotation * 360) : 0} min={-2880} max={2880} step={1} suffix="°" reserveSuffixSpace disabled={readOnly || !content} help={content ? undefined : 'Aperture is axis-aligned'} onChange={(degrees) => onPatch({ transform: { rotation: degrees / 360 } })} />
    </div>
  )
}

// The shared decimal-textbox numeric field (#577, #656). Re-exported under the
// historical inspector name for existing call sites; it intentionally has the
// same textbox role and never restores native spinbutton behavior.
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
