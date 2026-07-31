import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { useNumberFieldDraft } from '@/components/ui/number-field'
import { PercentageField } from '@/components/ui/percentage-field'
import { DomainNumberField } from '@/components/ui/domain-number-field'
import { ColorField } from '@/components/ui/color-field'
import { ShowPropertyAnimationAction } from '@/components/ShowPropertyAnimationEditor'
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  GripVertical,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { ShowCell, ShowClipEffect } from '@/engine/personalContentRecords'
import {
  createShowEffectApplication,
  duplicateShowClipEffect,
  moveShowClipEffectToStagePosition,
  moveShowClipEffectWithinStage,
  showClipEffectParameterValue,
  showClipEffectParameters,
  showClipEffectPresentationKey,
  showClipEffectStage,
  updateShowClipEffectParameter,
} from '@/engine/showEffectAuthoring'
import type { ShowEffectApplication } from '@/engine/showEffectAuthoring'
import { contractTimelineParameterLabel } from '@/engine/showClipSummary'
import { SHOW_VISUAL_TOOLKIT_REGISTRY } from '@/engine/showVisualToolkit'
import {
  buildShowToolkitPresentationCatalogue,
  filterShowToolkitPresentationCatalogue,
  type ShowEffectPipelineStage,
  type ShowToolkitPresentationItem,
} from '@/engine/showVisualToolkitPresentation'

const STAGES: Array<{ id: ShowEffectPipelineStage; label: string; detail: string }> = [
  { id: 'transform', label: 'Transform', detail: 'source coordinates' },
  { id: 'distort', label: 'Distort', detail: 'warped coordinates' },
  { id: 'address', label: 'Address', detail: 'clip or wrap' },
  { id: 'color-output', label: 'Color & output', detail: 'rendered pixels' },
]

export function ShowEffectPalette({
  clip,
  stageDimensions,
  onApply,
  onClose,
}: {
  clip: Pick<ShowCell, 'patternName' | 'effects'>
  stageDimensions: 1 | 2 | 3
  onApply: (application: ShowEffectApplication) => void
  onClose: () => void
}) {
  const paletteRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const idPrefix = useId()
  const [query, setQuery] = useState('')
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const [activeItem, setActiveItem] = useState<ShowToolkitPresentationItem | null>(null)
  const [dismissedItemKey, setDismissedItemKey] = useState<string | null>(null)
  const catalogue = useMemo(
    () => buildShowToolkitPresentationCatalogue({ stageDimensions }),
    [stageDimensions],
  )
  const effectItems = useMemo(() => filterShowToolkitPresentationCatalogue(catalogue, {
    kind: 'effect',
    query,
    compatibleOnly,
  }).filter((item) => familyId === null || item.familyId === familyId), [catalogue, compatibleOnly, familyId, query])
  const families = useMemo(() => SHOW_VISUAL_TOOLKIT_REGISTRY.filter((family) => family.kind === 'effect'), [])

  const close = onClose
  const inspectItem = (item: ShowToolkitPresentationItem, source: 'focus' | 'pointer') => {
    if (!item.compatible) return
    if (source === 'focus' && dismissedItemKey === item.key) return
    setDismissedItemKey(null)
    setActiveItem(item)
  }
  const applyItem = (item: ShowToolkitPresentationItem, presetId?: string) => {
    if (!item.compatible) return
    close()
    onApply(createShowEffectApplication(item, clip.effects ?? [], presetId))
  }

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const activeVariant = activeItem
    ? SHOW_VISUAL_TOOLKIT_REGISTRY
      .find((family) => family.kind === 'effect' && family.id === activeItem.familyId)
      ?.variants.find((variant) => variant.id === activeItem.variantId)
    : undefined
  const activeDetailId = `${idPrefix}-choice-detail`

  return (
    <section
      ref={paletteRef}
      role="region"
      aria-label="Add Effect"
      data-testid="show-effect-takeover"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        if (activeItem) {
          const variantId = activeItem.variantId
          setDismissedItemKey(activeItem.key)
          setActiveItem(null)
          window.setTimeout(() => paletteRef.current
            ?.querySelector<HTMLElement>(`[data-show-effect-choice="${variantId}"]`)
            ?.focus(), 0)
          return
        }
        close()
      }}
    >
      <header className="mb-1.5 flex h-5 shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={close}
          aria-label="Back to Effects"
          className="flex h-5 items-center gap-1 rounded pr-1.5 text-[9px] text-cyan-300 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300"
        >
          <ArrowLeft size={11} aria-hidden />
          Back
        </button>
        <Sparkles size={10} className="text-cyan-300" aria-hidden />
        <h3 className="text-[9.5px] font-semibold text-zinc-400">Add Effect</h3>
      </header>
      <label className="relative mb-1 min-w-0 shrink-0">
        <Search size={11} className="pointer-events-none absolute left-2 top-1.5 text-zinc-600" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search Effects"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setDismissedItemKey(null)
            setActiveItem(null)
          }}
          placeholder="Search Effects and presets"
          className="h-6 w-full rounded border border-zinc-700 bg-zinc-950 pl-7 pr-2 text-[9.5px] text-zinc-200 outline-none focus:border-cyan-400/70"
        />
      </label>
      <div className="mb-1 flex shrink-0 flex-wrap gap-1" aria-label="Effect filters">
        <button
          type="button"
          aria-pressed={familyId === null}
          onClick={() => {
            setFamilyId(null)
            setDismissedItemKey(null)
            setActiveItem(null)
          }}
          className={`h-5 rounded-full border px-2 text-[8px] ${familyId === null ? 'border-transparent bg-cyan-400/15 text-cyan-200' : 'border-zinc-800 text-zinc-500 hover:text-zinc-200'}`}
        >
          All
        </button>
        {families.map((family) => (
          <button
            key={family.id}
            type="button"
            aria-pressed={familyId === family.id}
            onClick={() => {
              setFamilyId(family.id)
              setDismissedItemKey(null)
              setActiveItem(null)
            }}
            className={`h-5 rounded-full border px-2 text-[8px] ${familyId === family.id ? 'border-transparent bg-cyan-400/15 text-cyan-200' : 'border-zinc-800 text-zinc-500 hover:text-zinc-200'}`}
          >
            {family.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={compatibleOnly}
          onClick={() => {
            setCompatibleOnly((current) => !current)
            setDismissedItemKey(null)
            setActiveItem(null)
          }}
          className={`ml-auto flex h-5 items-center gap-1 rounded-full border border-dashed px-2 text-[8px] ${compatibleOnly ? 'border-cyan-400/30 text-cyan-200' : 'border-zinc-700 text-zinc-500 hover:text-zinc-200'}`}
        >
          {compatibleOnly && <Check size={9} aria-hidden />}
          Compatible
        </button>
      </div>
      {activeItem && (
        <div
          id={activeDetailId}
          data-testid="show-effect-choice-detail"
          className="flex min-h-7 shrink-0 items-center gap-1.5 border-y border-cyan-400/20 bg-cyan-400/[0.035] px-1.5 py-0.5"
        >
          <p className="min-w-0 flex-1 truncate text-[8.5px] leading-3 text-zinc-400" title={activeItem.summary}>
            {activeItem.summary}
          </p>
          <span className="shrink-0 text-[7px] uppercase tracking-wide text-zinc-600">
            {activeItem.costPolicies.join(' · ')}
          </span>
          {activeVariant?.presets?.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyItem(activeItem, preset.id)}
              className="h-5 shrink-0 rounded border border-zinc-700 px-1.5 text-[8px] text-zinc-300 hover:border-cyan-400/50 hover:text-cyan-200"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <div
        data-testid="show-effect-choice-list"
        className="min-h-0 flex-1 overflow-y-auto border-t border-zinc-800/80"
      >
        {STAGES.map((stage) => {
          const stageItems = effectItems.filter((item) => item.effectStage === stage.id)
          if (stageItems.length === 0) return null
          return (
            <section key={stage.id} role="group" aria-label={`${stage.label} Effects`}>
              <h4
                className="sticky top-0 z-[1] flex h-4 items-center gap-1 bg-[#08080a]/95 px-1 text-[8px] font-medium uppercase tracking-[0.1em] text-zinc-600 backdrop-blur"
                title={stage.detail}
              >
                <span className="h-px w-2 bg-cyan-400/40" aria-hidden />
                {stage.label}
              </h4>
              <div data-testid="show-effect-stage-grid" className="grid grid-cols-2">
                {stageItems.map((item) => {
                  const expanded = activeItem?.key === item.key
                  return (
                    <div key={item.key} className={expanded ? 'border-l-2 border-cyan-300/70 bg-cyan-400/[0.045]' : ''}>
                      <button
                        id={`${idPrefix}-choice-${item.variantId}`}
                        data-show-effect-choice={item.variantId}
                        type="button"
                        aria-label={`Add ${item.label} Effect`}
                        aria-expanded={expanded}
                        aria-controls={expanded ? activeDetailId : undefined}
                        disabled={!item.compatible}
                        onPointerEnter={() => inspectItem(item, 'pointer')}
                        onFocus={() => inspectItem(item, 'focus')}
                        onClick={() => applyItem(item)}
                        className="show-effect-choice group flex h-7 w-full min-w-0 items-center gap-2 border-b border-zinc-800/55 px-1 text-left hover:bg-[#171920] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                        title={item.compatible ? item.summary : item.compatibilityReason ?? undefined}
                      >
                        <EffectMnemonic kind={item.variantId} />
                        <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-zinc-100">{item.label}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
        {effectItems.length === 0 && <p className="p-6 text-center text-[10px] text-zinc-600">No Effects match.</p>}
      </div>
    </section>
  )
}

export function ShowEffectStack({
  effects,
  mirror = false,
  animationPlacementId,
  onChange,
  onPreview,
  onPreviewEnd,
  onMirrorChange,
  onAdd,
  addButtonRef,
  disabled = false,
}: {
  effects: readonly ShowClipEffect[]
  mirror?: boolean
  animationPlacementId?: string
  onChange: (effects: ShowClipEffect[]) => void
  onPreview?: (effects: ShowClipEffect[]) => void
  onPreviewEnd?: () => void
  onMirrorChange?: (mirror: boolean) => void
  onAdd: () => void
  addButtonRef?: Ref<HTMLButtonElement>
  disabled?: boolean
}) {
  const catalogue = useMemo(() => buildShowToolkitPresentationCatalogue({ stageDimensions: 2 }), [])
  const byKey = useMemo(() => new Map(catalogue.map((item) => [item.key, item])), [catalogue])
  const draggedEffectRef = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ effectId: string; edge: 'before' | 'after' } | null>(null)

  const draggedEffect = () => effects.find((effect) => effect.id === draggedEffectRef.current)
  const dropEdge = (event: React.DragEvent<HTMLElement>): 'before' | 'after' => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
  }

  return (
    <section className="mt-2 overflow-hidden rounded border border-cyan-400/15 bg-cyan-400/[0.025]" aria-label="Clip Effects">
      <header className="flex h-6 items-center gap-1.5 border-b border-zinc-800 px-1.5">
        <Sparkles size={10} className="text-cyan-300" aria-hidden />
        <div className="text-[9px] font-semibold text-zinc-300">Effects</div>
        <button
          ref={addButtonRef}
          type="button"
          aria-label="Add Effect"
          disabled={disabled}
          onClick={(event) => {
            if (event.currentTarget.matches(':disabled')) return
            onAdd()
          }}
          className="ml-auto flex h-5 items-center gap-1 rounded border border-zinc-700 px-1.5 text-[8px] text-zinc-400 hover:border-cyan-400/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Plus size={9} />
          Add
        </button>
      </header>
      {STAGES.map((stage) => {
        const stageEffects = effects.filter((effect) => showClipEffectStage(effect) === stage.id)
        const hasMirror = mirror && stage.id === 'transform'
        if (stageEffects.length === 0 && !hasMirror) return null
        return (
          <div key={stage.id} data-testid="show-effect-stage" className="border-b border-zinc-800/80 last:border-b-0">
            <div className="flex h-4 items-center gap-1 bg-zinc-950/55 px-2 text-[8px] font-medium uppercase tracking-[0.1em] text-zinc-600" title={stage.detail}>
              <span className="h-px w-2 bg-cyan-400/40" aria-hidden />
              {stage.label}
            </div>
            {hasMirror && (
              <div
                data-testid="show-effect-mirror"
                data-fixed="true"
                data-show-clip-summary-target="mirror"
                data-show-clip-summary-focus="container"
                tabIndex={-1}
                className="grid min-h-8 grid-cols-[24px_minmax(0,1fr)_24px] items-center gap-1 border-l-2 border-t border-l-amber-400/55 border-t-zinc-800/60 bg-amber-400/[0.035] px-1 py-1"
              >
                <span className="grid size-6 shrink-0 place-items-center text-amber-300/80"><EffectMnemonic kind="mirror" /></span>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[10px] text-zinc-200">Mirror</span>
                  <span className="shrink-0 rounded border border-amber-400/20 bg-amber-400/[0.06] px-1 py-0.5 text-[7px] font-medium uppercase tracking-[0.08em] text-amber-300/70">
                    Always first
                  </span>
                </div>
                <EffectActionsMenu
                  label="Mirror"
                  actions={[{
                    label: 'Remove Mirror Effect',
                    disabled: false,
                    icon: <Trash2 size={11} />,
                    run: () => onMirrorChange?.(false),
                  }]}
                />
              </div>
            )}
            {stageEffects.map((effect, index) => {
              const item = byKey.get(showClipEffectPresentationKey(effect))
              const label = item?.label ?? effect.kind
              const canEarlier = index > 0
              const canLater = index < stageEffects.length - 1
              const parameters = showClipEffectParameters(effect)
              const contractLabels = parameters.length >= 5
              const activeDrop = dropTarget?.effectId === effect.id ? dropTarget.edge : null
              return (
                <div
                  key={effect.id}
                  data-testid={`show-effect-${effect.id}`}
                  data-effect-stage={stage.id}
                  data-show-clip-summary-target={`effect:${effect.id}`}
                  data-show-clip-summary-focus="container"
                  tabIndex={-1}
                  className={`group relative grid min-h-8 grid-cols-[24px_minmax(0,1fr)_24px] items-center gap-1 border-t bg-[#101115] px-1 py-1 ${activeDrop === 'before' ? 'border-t-cyan-300' : 'border-t-zinc-800/60'} ${activeDrop === 'after' ? 'after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-cyan-300' : ''}`}
                  onDragOver={(event) => {
                    const source = draggedEffect()
                    if (!source || source.id === effect.id || showClipEffectStage(source) !== stage.id) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDropTarget({ effectId: effect.id, edge: dropEdge(event) })
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const sourceId = draggedEffectRef.current ?? event.dataTransfer.getData('application/x-pxlblz-effect')
                    const source = effects.find((candidate) => candidate.id === sourceId)
                    setDropTarget(null)
                    draggedEffectRef.current = null
                    if (!source || showClipEffectStage(source) !== stage.id) return
                    const nextEffects = moveShowClipEffectToStagePosition(effects, source.id, effect.id, dropEdge(event))
                    if (nextEffects.some((candidate, candidateIndex) => candidate.id !== effects[candidateIndex]?.id)) {
                      onChange(nextEffects)
                    }
                  }}
                >
                  <button
                    type="button"
                    draggable
                    tabIndex={-1}
                    aria-label={`Drag ${label} Effect to reorder`}
                    title={`Drag ${label} Effect to reorder within ${stage.label}`}
                    className="grid size-6 cursor-grab place-items-center rounded text-zinc-600 opacity-0 hover:bg-zinc-800 hover:text-zinc-200 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300 active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100"
                    onDragStart={(event) => {
                      draggedEffectRef.current = effect.id
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('application/x-pxlblz-effect', effect.id)
                    }}
                    onDragEnd={() => {
                      draggedEffectRef.current = null
                      setDropTarget(null)
                    }}
                  >
                    <GripVertical size={12} aria-hidden />
                  </button>
                  <div className="flex min-w-0 flex-wrap items-end gap-x-1 gap-y-0.5">
                    <span className="w-[68px] shrink-0 self-center truncate text-[10px] text-zinc-200" title={`${label} Effect`}>{label}</span>
                    {parameters.map((parameter) => {
                      const parameterValue = Number(showClipEffectParameterValue(effect, parameter.id))
                      const updateEffects = (next: number) => effects.map((candidate) => candidate.id === effect.id
                        ? updateShowClipEffectParameter(candidate, parameter.id, next)
                        : candidate)
                      const visibleLabel = contractLabels ? contractTimelineParameterLabel(parameter.label) : parameter.label
                      const animationAction = animationPlacementId && parameter.kind === 'number'
                        ? (
                            <ShowPropertyAnimationAction
                              target={{
                                kind: 'placement-effect',
                                placementId: animationPlacementId,
                                effectId: effect.id,
                                effectKind: effect.kind,
                                parameterId: parameter.id,
                              }}
                              label={`${label} ${parameter.label}`}
                            />
                          )
                        : undefined
                      if (parameter.kind === 'color') {
                        return (
                          <div key={parameter.id} className="w-[104px] shrink-0 text-[8px] uppercase tracking-wide text-zinc-600" title={parameter.label}>
                            <span aria-hidden>{visibleLabel}</span>
                            <ColorField
                              label={parameter.label}
                              hideLabel
                              compact
                              value={String(showClipEffectParameterValue(effect, parameter.id))}
                              onPreview={(value) => onPreview?.(effects.map((candidate) => candidate.id === effect.id
                                ? updateShowClipEffectParameter(candidate, parameter.id, value)
                                : candidate))}
                              onPreviewEnd={onPreviewEnd}
                              onChange={(value) => onChange(effects.map((candidate) => candidate.id === effect.id
                                ? updateShowClipEffectParameter(candidate, parameter.id, value)
                                : candidate))}
                            />
                          </div>
                        )
                      }
                      if (parameter.presentation === 'percentage') {
                        return (
                          <div key={parameter.id} className="w-[66px] shrink-0" title={parameter.label}>
                            <PercentageField
                              label={visibleLabel}
                              ariaLabel={parameter.label}
                              labelAction={animationAction}
                              help={parameter.label}
                              value={parameterValue}
                              min={parameter.min ?? 0}
                              max={parameter.max ?? 1}
                              step={parameter.step ?? 0.01}
                              variant="inspector"
                              compact
                              onPreview={(next) => onPreview?.(updateEffects(next))}
                              onPreviewEnd={onPreviewEnd}
                              onChange={(next) => onChange(updateEffects(next))}
                            />
                          </div>
                        )
                      }
                      if (parameter.presentation === 'multiplier' || parameter.presentation === 'ratio') {
                        return (
                          <div key={parameter.id} className="w-[66px] shrink-0" title={parameter.label}>
                            <DomainNumberField
                              label={visibleLabel}
                              ariaLabel={parameter.label}
                              labelAction={animationAction}
                              help={parameter.label}
                              presentation={parameter.presentation}
                              value={parameterValue}
                              min={parameter.min ?? 0}
                              max={parameter.max ?? 1}
                              step={parameter.step ?? 0.01}
                              variant="inspector"
                              compact
                              onPreview={(next) => onPreview?.(updateEffects(next))}
                              onPreviewEnd={onPreviewEnd}
                              onChange={(next) => onChange(updateEffects(next))}
                            />
                          </div>
                        )
                      }
                      return (
                        <div key={parameter.id} className="w-[52px] shrink-0 text-[8px] uppercase tracking-wide text-zinc-600" title={parameter.label}>
                          <span className="flex h-4 items-center justify-between gap-1" title={parameter.label}>
                            <span aria-hidden>{visibleLabel}</span>
                            {animationAction}
                          </span>
                          <EffectParameterField
                            label={parameter.label}
                            value={parameterValue}
                            min={parameter.min}
                            max={parameter.max}
                            step={parameter.step}
                            onCommit={(value) => onChange(effects.map((candidate) => candidate.id === effect.id
                              ? updateShowClipEffectParameter(candidate, parameter.id, value)
                              : candidate))}
                          />
                        </div>
                      )
                    })}
                    {parameters.length === 0 && <p className="self-center text-[8px] text-zinc-600" title="Wrap changes the address policy for transformed coordinates.">No parameters</p>}
                  </div>
                  <EffectActionsMenu
                    effectId={effect.id}
                    label={label}
                    actions={[
                      { label: `Move ${label} Effect earlier`, disabled: !canEarlier, icon: <ArrowUp size={11} />, run: () => onChange(moveShowClipEffectWithinStage(effects, effect.id, -1)) },
                      { label: `Move ${label} Effect later`, disabled: !canLater, icon: <ArrowDown size={11} />, run: () => onChange(moveShowClipEffectWithinStage(effects, effect.id, 1)) },
                      { label: `Duplicate ${label} Effect`, disabled: false, icon: <Copy size={11} />, run: () => onChange(duplicateShowClipEffect(effects, effect.id)) },
                      { label: `Remove ${label} Effect`, disabled: false, icon: <Trash2 size={11} />, run: () => onChange(effects.filter((candidate) => candidate.id !== effect.id)) },
                    ]}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </section>
  )
}

function EffectActionsMenu({
  effectId,
  label,
  actions,
}: {
  effectId?: string
  label: string
  actions: Array<{
    label: string
    disabled: boolean
    icon: React.ReactNode
    run: () => void
  }>
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 4, top: 4 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return
    const bounds = trigger.getBoundingClientRect()
    const menuHeight = actions.length * 24 + 8
    setPosition({
      left: Math.max(4, Math.min(window.innerWidth - 164, bounds.right - 160)),
      top: bounds.bottom + menuHeight <= window.innerHeight ? bounds.bottom + 2 : Math.max(4, bounds.top - menuHeight - 2),
    })
    const focusTimer = window.setTimeout(() => itemRefs.current.find((item) => item && !item.disabled)?.focus(), 0)
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('pointerdown', closeOnPointerDown)
    }
  }, [open, actions.length])

  const closeAndFocus = () => {
    setOpen(false)
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }
  const moveFocus = (currentIndex: number, direction: -1 | 1) => {
    for (let offset = 1; offset <= actions.length; offset += 1) {
      const index = (currentIndex + direction * offset + actions.length) % actions.length
      const target = itemRefs.current[index]
      if (target && !target.disabled) {
        target.focus()
        return
      }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More actions for ${label} Effect`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-show-effect-id={effectId}
        title={`More actions for ${label} Effect`}
        onClick={() => setOpen((value) => !value)}
        className="grid size-6 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300"
      >
        <MoreHorizontal size={13} aria-hidden />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${label} Effect`}
          data-show-detail-owned-portal="true"
          className="fixed z-[110] w-40 overflow-hidden rounded border border-zinc-700 bg-zinc-950 p-1 shadow-xl"
          style={position}
          onKeyDown={(event) => {
            const index = itemRefs.current.indexOf(event.target as HTMLButtonElement)
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              closeAndFocus()
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              moveFocus(index, event.key === 'ArrowDown' ? 1 : -1)
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault()
              const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled))
              enabled[event.key === 'Home' ? 0 : enabled.length - 1]?.focus()
            }
          }}
        >
          {actions.map((action, index) => (
            <button
              key={action.label}
              ref={(node) => { itemRefs.current[index] = node }}
              type="button"
              role="menuitem"
              aria-label={action.label}
              disabled={action.disabled}
              onClick={() => {
                action.run()
                closeAndFocus()
              }}
              className="flex h-6 w-full items-center gap-2 rounded px-2 text-left text-[9px] text-zinc-300 hover:bg-zinc-800 focus-visible:bg-zinc-800 focus-visible:outline-none disabled:text-zinc-700"
            >
              {action.icon}
              {action.label.replace(` ${label} Effect`, '')}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

function EffectParameterField({ label, value, min, max, step, onCommit }: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onCommit: (value: number) => void
}) {
  const { inputProps } = useNumberFieldDraft({ value, min, max, onChange: onCommit })
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      {...inputProps}
      className="mt-0.5 h-5 w-full rounded border border-zinc-700 bg-zinc-950 px-1 text-right text-[9px] tabular-nums text-zinc-200 outline-none focus:border-cyan-400/60"
    />
  )
}


const EFFECT_MNEMONIC_MOTION: Record<string, string> = {
  opacity: 'fade',
  brightness: 'brightness',
  hue: 'cycle',
  saturation: 'saturation',
  contrast: 'contrast',
  invert: 'invert',
  threshold: 'threshold',
  'luma-key': 'threshold',
  'chroma-key': 'threshold',
  posterize: 'steps',
  vignette: 'scale',
  'color-map': 'cycle',
  mirror: 'mirror',
  translate: 'translate',
  rotate: 'rotate',
  scale: 'scale',
  shear: 'shear',
  wrap: 'wrap',
  ripple: 'ripple',
  swirl: 'rotate',
  bulge: 'scale',
  pixelate: 'steps',
  kaleidoscope: 'rotate',
}

function EffectMnemonic({ kind }: { kind: string }) {
  const motion = EFFECT_MNEMONIC_MOTION[kind] ?? 'fade'
  return (
    <svg
      viewBox="0 0 26 14"
      className="show-effect-mnemonic h-3.5 w-7 shrink-0 overflow-visible text-cyan-400/70"
      data-effect-mnemonic={kind}
      data-effect-motion={motion}
      aria-hidden
    >
      <g
        data-effect-motion-part
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {effectMnemonicShape(kind)}
      </g>
    </svg>
  )
}

function effectMnemonicShape(kind: string): React.ReactNode {
  switch (kind) {
    case 'opacity':
      return <><path d="M2 3 H24" opacity=".3" /><path d="M2 7 H24" opacity=".65" /><path d="M2 11 H24" /></>
    case 'brightness':
      return <><circle cx="13" cy="7" r="2.6" /><path d="M13 1 V2.5 M13 11.5 V13 M7 7 H5.5 M20.5 7 H19 M8.8 2.8 L9.9 3.9 M16.1 10.1 L17.2 11.2 M17.2 2.8 L16.1 3.9 M9.9 10.1 L8.8 11.2" /></>
    case 'hue':
      return <><path d="M4 10 A9 9 0 0 1 8 3" /><path d="M9.5 2.2 A9 9 0 0 1 17 3" opacity=".7" /><path d="M18.3 4 A9 9 0 0 1 22 10" opacity=".4" /><path d="M4 10 H22" /></>
    case 'saturation':
      return <><circle cx="6" cy="7" r="3" opacity=".25" /><circle cx="13" cy="7" r="3" opacity=".6" /><circle cx="20" cy="7" r="3" /></>
    case 'contrast':
      return <><path d="M2 10 L10 8 L16 6 L24 4" opacity=".35" /><path d="M2 11 L10 10 L16 3 L24 2" /></>
    case 'invert':
      return <><circle cx="13" cy="7" r="5" /><path d="M13 2 A5 5 0 0 0 13 12 Z" fill="currentColor" stroke="none" /><path d="M13 2 V12" /></>
    case 'threshold':
      return <path d="M2 11 H11 V3 H24" />
    case 'luma-key':
      return <><path d="M2 11 H9 V7 H16 V3 H24" /><circle cx="9" cy="7" r="1.5" fill="currentColor" stroke="none" /></>
    case 'chroma-key':
      return <><circle cx="6" cy="7" r="3" /><circle cx="13" cy="7" r="3" opacity=".55" /><circle cx="20" cy="7" r="3" opacity=".25" /><path d="M10 3 L16 11 M16 3 L10 11" /></>
    case 'posterize':
      return <path d="M2 11 H7 V8 H12 V6 H17 V3 H24" />
    case 'vignette':
      return <><ellipse cx="13" cy="7" rx="10" ry="5" opacity=".25" /><ellipse cx="13" cy="7" rx="6" ry="3" opacity=".6" /><circle cx="13" cy="7" r="1.2" fill="currentColor" stroke="none" /></>
    case 'color-map':
      return <><path d="M2 10 C6 2 9 2 13 7 S20 12 24 4" /><path d="M2 12 H8 M10 12 H16 M18 12 H24" opacity=".45" /></>
    case 'mirror':
      return <><path d="M13 1 V13" opacity=".45" /><path d="M3 7 H10 M7 3 L3 7 L7 11 M23 7 H16 M19 3 L23 7 L19 11" /></>
    case 'translate':
      return <path d="M2 7 H23 M18 3 L23 7 L18 11" />
    case 'rotate':
      return <><path d="M20 5 A7 7 0 1 0 20 9" /><path d="M18 3 L21 5 L18 7" /></>
    case 'scale':
      return <><path d="M12 7 H3 M3 7 L7 3 M3 7 L7 11 M14 7 H23 M23 7 L19 3 M23 7 L19 11" /></>
    case 'shear':
      return <path d="M7 2 H22 L18 12 H3 Z M9 4 L6 10 M14 4 L11 10 M19 4 L16 10" />
    case 'wrap':
      return <><path d="M2 4 H19 C24 4 24 10 19 10 H6" /><path d="M9 7 L6 10 L9 13" /></>
    case 'ripple':
      return <path d="M1 7 C5 1 9 13 13 7 S21 1 25 7" />
    case 'swirl':
      return <path d="M13 2 C21 2 23 12 15 12 C8 12 7 5 13 5 C17 5 18 9 14 9" />
    case 'bulge':
      return <><path d="M7 2 C2 5 2 9 7 12 M19 2 C24 5 24 9 19 12" /><circle cx="13" cy="7" r="1.5" /></>
    case 'pixelate':
      return <><path d="M2 3 H8 V9 H2 Z M10 5 H16 V11 H10 Z M18 2 H24 V8 H18 Z" /></>
    case 'kaleidoscope':
      return <><path d="M13 1 L17 7 L13 13 L9 7 Z M13 1 L9 7 L3 4 Z M17 7 L23 10 L13 13" /><circle cx="13" cy="7" r="1" /></>
    default:
      return <path d="M2 11 L8 7 L13 9 L19 3 L24 5" />
  }
}
