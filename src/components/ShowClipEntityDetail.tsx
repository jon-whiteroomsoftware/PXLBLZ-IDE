import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react'
import { NumberField } from './ui/number-field'
import { BoundedNumberField } from './ui/bounded-number-field'
import { PercentageField } from './ui/percentage-field'
import { DomainNumberField } from './ui/domain-number-field'
import { AngleField } from './ui/angle-field'
import { TimeField } from './ui/time-field'
import { Grid2X2 } from 'lucide-react'
import { PatternCombobox, type PatternComboboxOption } from './PatternCombobox'
import { ShowEffectPalette, ShowEffectStack } from './ShowEffectsAuthoring'
import { ShowClipPlacementPad } from './ShowClipPlacementPad'
import {
  ShowPropertyAnimationAction,
  ShowPropertyAnimationOverview,
} from './ShowPropertyAnimationEditor'
import {
  enableViewportForContent,
  resolvePlacementPositionPresentation,
  resolvePlacementScalePresentation,
  type PlacementFocus,
} from '@/engine/showClipPlacementPad'
import { showClipViewportEffectiveEdge } from '@/engine/showClipViewport'
import type { ShowClipApertureShape } from '@/engine/personalContentRecords'
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
import type { ShowPropertyAnimationFieldLocation } from '@/engine/showPropertyAnimationEditorModel'
import type { ShowClipSummaryDestination } from '@/engine/showClipSummary'
import { useShowEntityDetailPanelHeight } from './ShowEntityDetailPanel'

export interface ShowClipEntityDetailProps {
  value: ShowClipInspectorValue
  title: string
  readOnly: boolean
  patternOptions: PatternComboboxOption[]
  patternControls: AutomatablePatternControl[]
  layerOptions?: Array<{ value: string; label: string }>
  actions?: ReactNode
  structuralControls?: ReactNode
  /** Extra controls that belong to the Pattern tab's scroll-owning body. */
  children?: ReactNode
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
  animationOverviewOpen?: boolean
  onAnimationOverviewClose?: (restoreSummaryFocus: boolean) => void
}

export interface ShowClipEntityDetailHandle {
  navigateToSummaryDestination: (destination: ShowClipSummaryDestination) => void
}

/**
 * Placement values come from free dragging, so they carry float dust that fills
 * a narrow field with noise like 0.66666666. Rounded for display only - the
 * stored value keeps full precision, because content is centre-anchored and the
 * aperture corner-anchored, and rounding each would round them apart and break
 * the exact match the pad's edge magnets exist to produce.
 */
const shown = (value: number) => Math.round(value * 1000) / 1000

type PlacementPreviewPatch = Pick<ShowClipInspectorPatch, 'transform' | 'viewport'>

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

const EMBEDDED_PANEL_HEIGHT: Record<ShowClipDetailTabId, number> = {
  pattern: 488,
  place: 496,
  effects: 488,
  playback: 360,
}

export const ShowClipEntityDetail = forwardRef<ShowClipEntityDetailHandle, ShowClipEntityDetailProps>(function ShowClipEntityDetail({
  value,
  title,
  readOnly,
  patternOptions,
  patternControls,
  layerOptions,
  actions,
  structuralControls,
  children,
  embedded = false,
  panelKey = 'transient',
  transformEnabled = true,
  stageDimensions = transformEnabled ? 2 : 1,
  onPatch,
  onPreviewPatch,
  onPreviewEnd,
  onPatternCommit,
  onMoveLayer,
  animationOverviewOpen = false,
  onAnimationOverviewClose,
}, ref) {
  const capabilities = showClipInspectorCapabilities(value.scope)
  // Narrowed once so the header can both gate rendering and count its columns
  // from the same predicate.
  const localTiming = capabilities.localTiming && value.local !== undefined
  const showOpacity = capabilities.sourceOverOpacity && value.local !== undefined
  const headerFieldCount = 1 + (localTiming ? 2 : 0) + (showOpacity ? 1 : 0)
  const controlTargets = value.simulation.controlTargets
  const [placementFocus, setPlacementFocus] = useState<PlacementFocus>('content')
  const [placementGrid, setPlacementGrid] = useState(3)
  const [placementPreview, setPlacementPreview] = useState<PlacementPreviewPatch | null>(null)
  const [effectChooserOpen, setEffectChooserOpen] = useState(false)
  const addEffectButtonRef = useRef<HTMLButtonElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const placementPreviewVersionRef = useRef(0)
  const placementCommitCountsRef = useRef(new Map<number, number>())
  const activePlacementFocus = placementFocus
  const previewTransform = placementPreview?.transform
    ? { ...value.transform, ...placementPreview.transform }
    : value.transform
  const previewViewport = placementPreview?.viewport
    ? { ...value.viewport, ...placementPreview.viewport }
    : value.viewport
  const previewPlacementPatch = (patch: ShowClipInspectorPatch) => {
    if (patch.transform || patch.viewport) {
      placementPreviewVersionRef.current += 1
      setPlacementPreview({ transform: patch.transform, viewport: patch.viewport })
    }
  }
  const endPlacementPreview = () => {
    // Placement gestures stay inside this dialog until their single commit.
    // Forwarding transient samples would rebuild the complete Show preview and
    // runtime for every pointer move (#680).
    const previewVersion = placementPreviewVersionRef.current
    // Bounded fields end preview immediately before commit, while pad gestures
    // commit immediately before ending preview. The microtask observes either
    // order without flashing the pad back to its previous controlled value.
    queueMicrotask(() => {
      if (
        placementPreviewVersionRef.current === previewVersion
        && !placementCommitCountsRef.current.has(previewVersion)
      ) setPlacementPreview(null)
    })
  }
  const commitPlacementPatch = (patch: ShowClipInspectorPatch) => {
    const previewVersion = placementPreviewVersionRef.current
    const commitCounts = placementCommitCountsRef.current
    commitCounts.set(previewVersion, (commitCounts.get(previewVersion) ?? 0) + 1)
    const finishCommit = () => {
      const remaining = (commitCounts.get(previewVersion) ?? 1) - 1
      if (remaining > 0) commitCounts.set(previewVersion, remaining)
      else commitCounts.delete(previewVersion)
      if (remaining === 0 && placementPreviewVersionRef.current === previewVersion) {
        setPlacementPreview(null)
      }
    }
    let committed: ReturnType<typeof onPatch>
    try {
      committed = onPatch(patch)
    } catch (error) {
      finishCommit()
      throw error
    }
    if (committed === false) {
      finishCommit()
      return false
    }
    void Promise.resolve(committed).then(finishCommit, finishCommit)
    return committed
  }

  const selectPlacementFocus = (next: PlacementFocus) => setPlacementFocus(next)
  const selectPlacementSummary = (next: PlacementFocus) => {
    selectPlacementFocus(next)
    if (next === 'aperture' && !value.viewport.enabled) {
      void onPatch({
        viewport: enableViewportForContent({
          transform: value.transform,
          viewport: value.viewport,
          grid: placementGrid,
        }),
      })
    }
  }
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
  useShowEntityDetailPanelHeight(
    embedded ? (animationOverviewOpen ? 488 : EMBEDDED_PANEL_HEIGHT[activeTab]) : undefined,
  )
  const selectTab = (tab: ShowClipDetailTabId) => {
    if (animationOverviewOpen) onAnimationOverviewClose?.(false)
    if (tab !== 'place') {
      placementPreviewVersionRef.current += 1
      setPlacementPreview(null)
    }
    setPreferredTab(tab)
    rememberShowClipDetailTab(panelKey, tab)
  }
  const navigateToAnimationField = (
    location: ShowPropertyAnimationFieldLocation,
    targetKey: string,
  ) => {
    const placeTarget = location === 'place'
    const placeApplicable = tabs.some((tab) => tab.id === 'place' && tab.applicable)
    if (placeTarget && !placeApplicable) {
      onAnimationOverviewClose?.(true)
      return
    }
    const viewportTarget = placeTarget && targetKey.startsWith('placement-viewport:')
    const reveal = viewportTarget && !value.viewport.enabled
      ? onPatch({
          viewport: enableViewportForContent({
            transform: value.transform,
            viewport: value.viewport,
            grid: placementGrid,
          }),
        })
      : undefined
    if (placeTarget) setPlacementFocus(viewportTarget ? 'aperture' : 'content')
    if (location !== 'header') {
      selectTab(location)
    } else {
      onAnimationOverviewClose?.(false)
    }
    const focusTarget = () => {
      const action = [...(detailRef.current?.querySelectorAll<HTMLElement>(
        '[data-show-property-animation-target]',
      ) ?? [])].find((candidate) => candidate.dataset.showPropertyAnimationTarget === targetKey)
      const field = action?.closest<HTMLElement>(
        '[data-header-field], tr, [data-show-effect-id], label, div',
      )
      field?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
        ?.focus()
    }
    if (reveal && typeof (reveal as Promise<void>).then === 'function') {
      void Promise.resolve(reveal).then(() => window.setTimeout(focusTarget, 0))
    } else {
      window.setTimeout(focusTarget, 0)
    }
  }
  const navigateToSummaryDestination = (destination: ShowClipSummaryDestination) => {
    const placeTarget = destination.location === 'place'
    const placeApplicable = tabs.some((tab) => tab.id === 'place' && tab.applicable)
    if (placeTarget && !placeApplicable) return
    if (placeTarget) {
      setPlacementFocus(destination.targetKey === 'viewport' ? 'aperture' : 'content')
    }
    if (destination.location === 'effects') setEffectChooserOpen(false)
    if (destination.location === 'header') {
      if (animationOverviewOpen) onAnimationOverviewClose?.(false)
    } else {
      selectTab(destination.location)
    }
    window.setTimeout(() => {
      const target = [...(detailRef.current?.querySelectorAll<HTMLElement>(
        '[data-show-clip-summary-target]',
      ) ?? [])].find((candidate) => candidate.dataset.showClipSummaryTarget === destination.targetKey)
      if (!target) return
      const focusable = target.dataset.showClipSummaryFocus === 'container'
        ? null
        : target.querySelector<HTMLElement>(
            'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [role="slider"]:not([aria-disabled="true"])',
          ) ?? target.querySelector<HTMLElement>('button:not(:disabled)')
      ;(focusable ?? target).focus()
    }, 0)
  }
  useImperativeHandle(ref, () => ({ navigateToSummaryDestination }))
  const tabIdFor = (tab: ShowClipDetailTabId) => `clip-detail-tab-${panelKey}-${tab}`
  const panelId = `clip-detail-panel-${panelKey}`

  return (
    <section
      ref={detailRef}
      role={embedded ? undefined : 'region'}
      aria-label={embedded ? undefined : 'Clip properties'}
      data-entity-family="clip"
      className={`${embedded ? 'flex min-h-0 flex-1 flex-col' : ''} overflow-hidden bg-transparent [&_label]:text-zinc-400`}
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

      <div className={embedded ? 'flex min-h-0 flex-1 flex-col' : 'p-2.5'}>
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
          <div
            data-header-field="brightness"
            data-show-clip-summary-target="brightness"
            tabIndex={-1}
          >
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
            <div
              data-header-field="opacity"
              data-show-clip-summary-target="opacity"
              tabIndex={-1}
            >
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
          className="mt-2 flex shrink-0 border-y border-zinc-800/80"
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

        {/* Effects needs a bounded body so its catalogue owns the only scrollbar.
            Other tabs retain their intrinsic layout and established overflow. */}
        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabIdFor(activeTab)}
          data-active-tab={activeTab}
          className={embedded
            ? activeTab === 'effects' && !animationOverviewOpen
              ? 'flex h-[clamp(180px,calc(100vh-250px),300px)] min-h-0 shrink-0 flex-col overflow-hidden pt-2'
              : activeTab === 'place'
                ? 'min-h-0 flex-1 overflow-hidden pt-2'
                : 'min-h-0 flex-1 overflow-y-auto pt-2'
            : activeTab === 'effects' && !animationOverviewOpen
              ? 'flex h-[clamp(180px,calc(100vh-250px),300px)] min-h-0 flex-col overflow-hidden pt-2'
              : activeTab === 'place'
                ? 'min-h-0 pt-2'
                : 'min-h-[262px] pt-2'}
        >

        {animationOverviewOpen ? (
          <ShowPropertyAnimationOverview
            onBack={() => onAnimationOverviewClose?.(true)}
            onNavigate={navigateToAnimationField}
          />
        ) : <>
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
          <div
            data-testid="clip-summary-target-speed"
            data-show-clip-summary-target="speed"
            tabIndex={-1}
          >
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
              // A transient time-scale preview rebuilds the complete Show
              // artifact for every drag sample, even while playback is paused.
              // The numeric draft and thumb already update locally; apply the
              // authored value once on release so this field stays responsive.
              onChange={(timeScale) => onPatch({ simulation: { timeScale } })}
            />
          </div>
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

        {activeTab === 'place' && <div role="group" aria-label="Clip Transform" className="min-w-0">
          <div
            data-testid="clip-placement-grid"
            className="grid min-w-0 items-start gap-2 pb-0.5"
            style={{ gridTemplateColumns: 'minmax(0, min(228px, calc(100% - 120px))) minmax(112px, 1fr)' }}
          >
            <ShowClipPlacementPad
              transform={previewTransform}
              viewport={previewViewport}
              readOnly={readOnly}
              focus={activePlacementFocus}
              onFocusChange={selectPlacementFocus}
              grid={placementGrid}
              onGridChange={setPlacementGrid}
              onChange={commitPlacementPatch}
              onPreview={previewPlacementPatch}
              onPreviewEnd={endPlacementPreview}
            />
            <div className="grid min-w-0 gap-1">
              <PlacementRectangleSummary
                focus={activePlacementFocus}
                value={value}
                readOnly={readOnly}
                onSelect={selectPlacementSummary}
              />
              <ClipPlacementGeometry
                grid={placementGrid}
                focus={activePlacementFocus}
                value={value}
                readOnly={readOnly}
                onPreviewPatch={previewPlacementPatch}
                onPreviewEnd={endPlacementPreview}
                onPatch={commitPlacementPatch}
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
                          <td
                            data-show-clip-summary-target={`control:${control.exportName}`}
                            tabIndex={-1}
                            className="whitespace-nowrap py-0.5 [&_input]:!border-0"
                          >
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

          {activeTab === 'pattern' && children}

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
                          <AngleField
                            kind="phase"
                            label="Blink phase"
                            value={value.blink.phase}
                            min={0}
                            max={1}
                            step={0.01}
                            compact
                            disabled={readOnly}
                            onPreview={(phase) => onPreviewPatch?.({ blink: { ...value.blink!, phase } })}
                            onPreviewEnd={onPreviewEnd}
                            onChange={(phase) => onPatch({ blink: { ...value.blink!, phase } })}
                          />
                        </div>
                      </td>
                    </tr>}
                  </>}
                  <tr
                    data-show-clip-summary-target="phase"
                    tabIndex={-1}
                    className="h-6 whitespace-nowrap"
                  >
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
                    <td className="py-0.5">
                      <AngleField
                        kind="phase"
                        label="Phase"
                        hideLabel
                        align="left"
                        value={value.view.phase}
                        min={0}
                        max={1}
                        step={0.01}
                        compact
                        disabled={readOnly}
                        onPreview={(phase) => onPreviewPatch?.({ view: { phase } })}
                        onPreviewEnd={onPreviewEnd}
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
        </>}
        </div>
      </div>
    </section>
  )
})

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
  grid,
  focus,
  value,
  readOnly,
  onPreviewPatch,
  onPreviewEnd,
  onPatch,
}: {
  grid: number
  focus: PlacementFocus
  value: ShowClipInspectorValue
  readOnly: boolean
  onPreviewPatch?: ShowClipEntityDetailProps['onPreviewPatch']
  onPreviewEnd?: ShowClipEntityDetailProps['onPreviewEnd']
  onPatch: ShowClipEntityDetailProps['onPatch']
}) {
  const content = focus === 'content'
  const positionPresentation = useMemo(() => resolvePlacementPositionPresentation(grid), [grid])
  const scalePresentation = useMemo(() => resolvePlacementScalePresentation(grid), [grid])
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
    fieldLabel?: string,
  ) => {
    const target = animationTarget(property)
    return target
      ? <ShowPropertyAnimationAction target={target} label={label} fieldLabel={fieldLabel} />
      : undefined
  }
  return (
    <div
      role="group"
      aria-label={`${content ? 'Content' : 'Aperture'} geometry`}
      data-show-clip-summary-target={content ? undefined : 'viewport'}
      tabIndex={content ? undefined : -1}
      className="grid min-w-0 gap-0.5"
    >
      <div className="min-w-0" data-show-clip-summary-target={content ? 'transform-position-x' : undefined} tabIndex={content ? -1 : undefined}>
        <BoundedNumberField compact label="X" ariaLabel={xLabel} labelAction={animationAction(content ? 'positionX' : 'x', xLabel, 'X')} presentation={positionPresentation} value={shown(positionX)} reserveSuffixSpace disabled={readOnly} onPreview={(next) => onPreviewPatch?.(content ? { transform: { positionX: next } } : { viewport: { x: next } })} onPreviewEnd={onPreviewEnd} onChange={(next) => onPatch(content ? { transform: { positionX: next } } : { viewport: { x: next } })} />
      </div>
      <div className="min-w-0" data-show-clip-summary-target={content ? 'transform-position-y' : undefined} tabIndex={content ? -1 : undefined}>
        <BoundedNumberField compact label="Y" ariaLabel={yLabel} labelAction={animationAction(content ? 'positionY' : 'y', yLabel, 'Y')} presentation={positionPresentation} value={shown(positionY)} reserveSuffixSpace disabled={readOnly} onPreview={(next) => onPreviewPatch?.(content ? { transform: { positionY: next } } : { viewport: { y: next } })} onPreviewEnd={onPreviewEnd} onChange={(next) => onPatch(content ? { transform: { positionY: next } } : { viewport: { y: next } })} />
      </div>
      <div className="min-w-0" data-show-clip-summary-target={content ? 'transform-scale-x' : undefined} tabIndex={content ? -1 : undefined}>
        <BoundedNumberField compact label="Width" ariaLabel={widthLabel} labelAction={animationAction(content ? 'scaleX' : 'width', widthLabel, 'Width')} presentation={scalePresentation} value={shown(width)} reserveSuffixSpace disabled={readOnly} onPreview={(next) => onPreviewPatch?.(content ? { transform: { scaleX: next } } : { viewport: { width: next } })} onPreviewEnd={onPreviewEnd} onChange={(next) => onPatch(content ? { transform: { scaleX: next } } : { viewport: { width: next } })} />
      </div>
      <div className="min-w-0" data-show-clip-summary-target={content ? 'transform-scale-y' : undefined} tabIndex={content ? -1 : undefined}>
        <BoundedNumberField compact label="Height" ariaLabel={heightLabel} labelAction={animationAction(content ? 'scaleY' : 'height', heightLabel, 'Height')} presentation={scalePresentation} value={shown(height)} reserveSuffixSpace disabled={readOnly} onPreview={(next) => onPreviewPatch?.(content ? { transform: { scaleY: next } } : { viewport: { height: next } })} onPreviewEnd={onPreviewEnd} onChange={(next) => onPatch(content ? { transform: { scaleY: next } } : { viewport: { height: next } })} />
      </div>
      <div className="min-w-0" data-show-clip-summary-target={content ? 'transform-rotation' : undefined} tabIndex={content ? -1 : undefined}>
        <AngleField compact kind="rotation" label="Rotation" ariaLabel={content ? 'Rotation' : 'Aperture rotation'} labelAction={content ? animationAction('rotation', 'Rotation') : undefined} value={content ? value.transform.rotation : value.viewport.rotation ?? 0} min={content ? -8 : -1} max={content ? 8 : 1} step={1 / 360} reserveSuffixSpace disabled={readOnly} onPreview={(rotation) => onPreviewPatch?.(content ? { transform: { rotation } } : { viewport: { rotation } })} onPreviewEnd={onPreviewEnd} onChange={(rotation) => onPatch(content ? { transform: { rotation } } : { viewport: { rotation } })} />
      </div>
      {!content && <>
        {/* The aperture silhouette and edge (#591). Shape and edge are durable
            styling on the Viewport, not frame geometry, so they live with the
            aperture-focused stack rather than the pad gestures. */}
        <label className="block min-w-0 text-[8px] uppercase tracking-[0.08em] text-zinc-600">
          Shape
          <select
            aria-label="Aperture shape"
            value={value.viewport.aperture ?? 'rectangle'}
            disabled={readOnly}
            onChange={(event) => onPatch({
              viewport: {
                aperture: event.target.value as ShowClipApertureShape,
              },
            })}
            className="mt-0.5 h-5 w-full border-0 border-b border-zinc-800 bg-transparent px-1 text-[9px] normal-case tracking-normal text-zinc-200 outline-none focus:border-cyan-400/60 disabled:opacity-60"
          >
            <optgroup label="Geometric">
              <option value="rectangle">Rectangle</option>
              <option value="ellipse">Ellipse</option>
              <option value="diamond">Diamond</option>
              <option value="ring">Ring</option>
              <option value="rounded-box">Rounded box</option>
              <option value="cross">Cross</option>
              <option value="polygon">Regular polygon</option>
            </optgroup>
            <optgroup label="Icons">
              <option value="heart">Heart</option>
              <option value="star">Star</option>
              <option value="crescent">Crescent</option>
              <option value="cloud">Cloud</option>
            </optgroup>
            <optgroup label="Signature">
              <option value="cat-head">Cat head</option>
              <option value="cat-side-profile">Side-profile cat</option>
              <option value="bastet">Bastet</option>
            </optgroup>
          </select>
        </label>
        <label className="block min-w-0 text-[8px] uppercase tracking-[0.08em] text-zinc-600">
          Mode
          <select
            aria-label="Aperture mode"
            value={value.viewport.invert ? 'cut-out' : 'admit'}
            disabled={readOnly}
            onChange={(event) => onPatch({
              viewport: { invert: event.target.value === 'cut-out' ? true : undefined },
            })}
            className="mt-0.5 h-5 w-full border-0 border-b border-zinc-800 bg-transparent px-1 text-[9px] normal-case tracking-normal text-zinc-200 outline-none focus:border-cyan-400/60 disabled:opacity-60"
          >
            <option value="admit">Admit inside</option>
            <option value="cut-out">Cut out</option>
          </select>
        </label>
        <label className="block min-w-0 text-[8px] uppercase tracking-[0.08em] text-zinc-600">
          Edge
          <select
            aria-label="Aperture edge"
            value={showClipViewportEffectiveEdge(value.viewport)}
            disabled={readOnly}
            onChange={(event) => onPatch({
              viewport: {
                edge: event.target.value === 'hard'
                  ? 'hard'
                  : event.target.value === 'dither' ? 'dither' : 'soft',
              },
            })}
            className="mt-0.5 h-5 w-full border-0 border-b border-zinc-800 bg-transparent px-1 text-[9px] normal-case tracking-normal text-zinc-200 outline-none focus:border-cyan-400/60 disabled:opacity-60"
          >
            <option value="soft">Soft</option>
            <option value="hard">Hard</option>
            <option value="dither">Dither</option>
          </select>
        </label>
        {showClipViewportEffectiveEdge(value.viewport) !== 'hard' && (
          <div className="min-w-0">
            <ShowInspectorNumberField
              compact
              label="Edge width"
              ariaLabel="Aperture edge width"
              value={value.viewport.feather ?? 0}
              min={0}
              max={1}
              step={0.01}
              disabled={readOnly}
              help="0 uses the automatic width from device density."
              onChange={(feather) => onPatch({
                viewport: { feather: feather > 0 ? feather : undefined },
              })}
            />
          </div>
        )}
        {value.viewport.aperture === 'ring' && (
          <div className="min-w-0">
            <ShowInspectorNumberField
              compact
              label="Ring width"
              ariaLabel="Aperture ring width"
              value={value.viewport.ringWidth ?? 0.25}
              min={0.05}
              max={1}
              step={0.01}
              disabled={readOnly}
              help="Band thickness as a fraction of the radius."
              onChange={(ringWidth) => onPatch({ viewport: { ringWidth } })}
            />
          </div>
        )}
        {value.viewport.aperture === 'rounded-box' && (
          <div className="min-w-0">
            <ShowInspectorNumberField
              compact
              label="Corner radius"
              ariaLabel="Aperture corner radius"
              value={value.viewport.cornerRadius ?? 0.25}
              min={0.05}
              max={1}
              step={0.01}
              disabled={readOnly}
              help="Corner rounding as a fraction of the half-side."
              onChange={(cornerRadius) => onPatch({ viewport: { cornerRadius } })}
            />
          </div>
        )}
        {value.viewport.aperture === 'cross' && (
          <div className="min-w-0">
            <ShowInspectorNumberField
              compact
              label="Arm width"
              ariaLabel="Aperture arm width"
              value={value.viewport.crossWidth ?? 0.32}
              min={0.1}
              max={0.9}
              step={0.01}
              disabled={readOnly}
              help="Arm width as a fraction of the frame half-extent."
              onChange={(crossWidth) => onPatch({ viewport: { crossWidth } })}
            />
          </div>
        )}
        {value.viewport.aperture === 'star' && <>
          <div className="min-w-0">
            <ShowInspectorNumberField
              compact
              label="Points"
              ariaLabel="Aperture star points"
              value={value.viewport.starPoints ?? 5}
              min={3}
              max={12}
              step={1}
              disabled={readOnly}
              onChange={(starPoints) => onPatch({ viewport: { starPoints } })}
            />
          </div>
          <div className="min-w-0">
            <ShowInspectorNumberField
              compact
              label="Inner radius"
              ariaLabel="Aperture star inner radius"
              value={value.viewport.starInner ?? 0.45}
              min={0.2}
              max={0.8}
              step={0.01}
              disabled={readOnly}
              onChange={(starInner) => onPatch({ viewport: { starInner } })}
            />
          </div>
        </>}
        {value.viewport.aperture === 'crescent' && (
          <div className="min-w-0">
            <ShowInspectorNumberField
              compact
              label="Cutout offset"
              ariaLabel="Aperture cutout offset"
              value={value.viewport.crescentOffset ?? 0.45}
              min={0.15}
              max={0.8}
              step={0.01}
              disabled={readOnly}
              help="Cutout offset as a fraction of the unit radius."
              onChange={(crescentOffset) => onPatch({ viewport: { crescentOffset } })}
            />
          </div>
        )}
        {value.viewport.aperture === 'polygon' && (
          <div className="min-w-0">
            <ShowInspectorNumberField
              compact
              label="Sides"
              ariaLabel="Aperture polygon sides"
              value={value.viewport.polygonSides ?? 6}
              min={3}
              max={8}
              step={1}
              disabled={readOnly}
              onChange={(polygonSides) => onPatch({ viewport: { polygonSides } })}
            />
          </div>
        )}
      </>}
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
