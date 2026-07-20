import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type { ShowCell, ShowClipEffect } from '@/engine/personalContentRecords'
import {
  createShowEffectApplication,
  duplicateShowClipEffect,
  moveShowClipEffectWithinStage,
  showClipEffectParameterValue,
  showClipEffectParameters,
  showClipEffectPresentationKey,
  showClipEffectStage,
  updateShowClipEffectParameter,
} from '@/engine/showEffectAuthoring'
import type { ShowEffectApplication } from '@/engine/showEffectAuthoring'
import { SHOW_VISUAL_TOOLKIT_REGISTRY, type ShowCompiledCostMetadata } from '@/engine/showVisualToolkit'
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
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const [activeItem, setActiveItem] = useState<ShowToolkitPresentationItem | null>(null)
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
  const inspectItem = (item: ShowToolkitPresentationItem) => {
    if (!item.compatible) return
    setActiveItem(item)
  }
  const applyItem = (item: ShowToolkitPresentationItem, presetId?: string) => {
    if (!item.compatible) return
    onApply(createShowEffectApplication(item, clip.effects ?? [], presetId))
    close()
  }

  useEffect(() => {
    searchRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  // The open palette owns this keyboard lifecycle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeVariant = activeItem
    ? SHOW_VISUAL_TOOLKIT_REGISTRY
      .find((family) => family.kind === 'effect' && family.id === activeItem.familyId)
      ?.variants.find((variant) => variant.id === activeItem.variantId)
    : undefined

  return createPortal(
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Add Effect"
      className="fixed left-1/2 top-[76px] z-[90] flex max-h-[min(500px,calc(100vh-92px))] w-[min(680px,calc(100vw-16px))] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-zinc-700 bg-[#0b0c0f]/[0.985] shadow-[0_24px_80px_-18px_rgba(0,0,0,0.98)] backdrop-blur-sm"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800 px-2.5">
        <Sparkles size={13} className="text-cyan-300" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-200">Add Effect</h3>
          <p className="truncate text-[9px] text-zinc-600">{clip.patternName} · choose an Effect, then edit it in Clip properties</p>
        </div>
        <button type="button" onClick={close} className="ml-auto grid size-6 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close Effects palette"><X size={13} /></button>
      </header>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 p-2">
        <label className="relative min-w-0 flex-1">
          <Search size={12} className="pointer-events-none absolute left-2 top-2 text-zinc-600" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            aria-label="Search Effects"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Effects and presets"
            className="h-7 w-full rounded border border-zinc-700 bg-zinc-950 pl-7 pr-2 text-[10px] text-zinc-200 outline-none focus:border-cyan-400/60"
          />
        </label>
        <label className="flex h-7 shrink-0 items-center gap-1.5 rounded border border-zinc-800 px-2 text-[9px] text-zinc-500">
          <input type="checkbox" checked={compatibleOnly} onChange={(event) => setCompatibleOnly(event.target.checked)} className="size-3 accent-cyan-400" />
          compatible
        </label>
      </div>
      <nav className="scrollbar-hidden flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-800 px-2 py-1.5" aria-label="Effect families">
        <button type="button" onClick={() => setFamilyId(null)} className={`h-6 rounded px-2 text-[9px] ${familyId === null ? 'bg-cyan-400/15 text-cyan-200' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'}`}>All</button>
        {families.map((family) => (
          <button key={family.id} type="button" onClick={() => setFamilyId(family.id)} className={`h-6 rounded px-2 text-[9px] ${familyId === family.id ? 'bg-cyan-400/15 text-cyan-200' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'}`}>{family.label}</button>
        ))}
      </nav>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-px overflow-auto bg-zinc-800 sm:grid-cols-2 lg:grid-cols-3">
        {effectItems.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-label={`Add ${item.label} Effect`}
            disabled={!item.compatible}
            onPointerEnter={() => inspectItem(item)}
            onFocus={() => inspectItem(item)}
            onClick={() => applyItem(item)}
            className="show-effect-choice group flex h-10 min-w-0 items-center gap-2 bg-[#101115] px-2 text-left hover:bg-[#171920] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            title={item.compatible ? item.summary : item.compatibilityReason ?? undefined}
          >
            <EffectMnemonic kind={item.variantId} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-medium text-zinc-100">{item.label}</span>
              <span className="block truncate text-[8px] text-zinc-600">{item.familyLabel} · {stageLabel(item.effectStage)}</span>
            </span>
          </button>
        ))}
        {effectItems.length === 0 && <p className="col-span-full p-6 text-center text-[10px] text-zinc-600">No Effects match.</p>}
      </div>
      <footer className="min-h-12 shrink-0 border-t border-zinc-800 bg-zinc-950/75 px-2.5 py-2">
        {activeItem ? (
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[9px] text-zinc-400" title={activeItem.summary}>{activeItem.summary}</p>
            <span className="shrink-0 text-[8px] uppercase tracking-wide text-zinc-600">{activeItem.costPolicies.join(' · ')}</span>
            {activeVariant?.presets?.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyItem(activeItem, preset.id)}
                className="h-6 shrink-0 rounded border border-zinc-700 px-2 text-[8px] text-zinc-300 hover:border-cyan-400/50 hover:text-cyan-200"
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : <p className="text-[9px] text-zinc-600">Hover or focus an Effect to see details. Click to apply.</p>}
      </footer>
    </section>,
    document.body,
  )
}

export function ShowEffectStack({
  effects,
  mirror = false,
  compiledCost,
  onChange,
  onMirrorChange,
  onAdd,
}: {
  effects: readonly ShowClipEffect[]
  mirror?: boolean
  compiledCost?: ShowCompiledCostMetadata
  onChange: (effects: ShowClipEffect[]) => void
  onMirrorChange?: (mirror: boolean) => void
  onAdd: () => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const catalogue = useMemo(() => buildShowToolkitPresentationCatalogue({ stageDimensions: 2 }), [])
  const byKey = useMemo(() => new Map(catalogue.map((item) => [item.key, item])), [catalogue])

  return (
    <section className="mt-2 overflow-hidden rounded border border-cyan-400/15 bg-cyan-400/[0.025]" aria-label="Clip Effects">
      <header className="flex h-6 items-center gap-1.5 border-b border-zinc-800 px-1.5">
        <Sparkles size={10} className="text-cyan-300" aria-hidden />
        <div className="text-[9px] font-semibold text-zinc-300">Effects</div>
        <span
          className="text-[8px] text-zinc-600"
          title="The active Effect stack is compiled into one Pixelblaze Pattern render."
        >
          Cost: 1 Pattern render
        </span>
        <button type="button" onClick={onAdd} className="ml-auto flex h-5 items-center gap-1 rounded border border-zinc-700 px-1.5 text-[8px] text-zinc-400 hover:border-cyan-400/50 hover:text-cyan-200"><Plus size={9} /> Add</button>
      </header>
      {STAGES.map((stage) => {
        const stageEffects = effects.filter((effect) => showClipEffectStage(effect) === stage.id)
        const hasMirror = mirror && stage.id === 'transform'
        if (stageEffects.length === 0 && !hasMirror) return null
        return (
          <div key={stage.id} data-testid="show-effect-stage" className="border-b border-zinc-800/80 last:border-b-0">
            <div className="flex h-6 items-center gap-1.5 bg-zinc-950/55 px-2 text-[8px] uppercase tracking-[0.1em] text-zinc-600">
              <span className="size-1.5 rounded-full bg-cyan-400/50" />
              {stage.label}
              <span className="normal-case tracking-normal text-zinc-700">{stage.detail}</span>
            </div>
            {hasMirror && (
              <div data-testid="show-effect-mirror" className="border-t border-zinc-800/60 bg-[#101115]">
                <div className="flex h-8 items-center gap-1 px-1.5">
                  <span className="grid size-6 shrink-0 place-items-center text-cyan-400/70"><EffectMnemonic kind="mirror" /></span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-200">Mirror</span>
                  <span className="hidden text-[8px] text-zinc-700 sm:inline">single-source</span>
                  <IconButton label="Remove Mirror Effect" onClick={() => onMirrorChange?.(false)}><Trash2 size={11} /></IconButton>
                </div>
              </div>
            )}
            {stageEffects.map((effect, index) => {
              const item = byKey.get(showClipEffectPresentationKey(effect))
              const expanded = expandedId === effect.id
              const canEarlier = index > 0
              const canLater = index < stageEffects.length - 1
              return (
                <div key={effect.id} data-testid={`show-effect-${effect.id}`} className="border-t border-zinc-800/60 bg-[#101115]">
                  <div className="flex h-8 items-center gap-1 px-1.5">
                    <button type="button" onClick={() => setExpandedId(expanded ? null : effect.id)} className="grid size-6 shrink-0 place-items-center text-zinc-600 hover:text-zinc-200" aria-label={`Edit ${item?.label ?? effect.kind} Effect`} data-show-effect-id={effect.id}>
                      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-200">{item?.label ?? effect.kind}</span>
                    <span className="hidden text-[8px] text-zinc-700 sm:inline">{item?.costPolicies.join(' · ')}</span>
                    <IconButton label={`Move ${item?.label ?? effect.kind} Effect earlier`} disabled={!canEarlier} onClick={() => onChange(moveShowClipEffectWithinStage(effects, effect.id, -1))}><ArrowUp size={11} /></IconButton>
                    <IconButton label={`Move ${item?.label ?? effect.kind} Effect later`} disabled={!canLater} onClick={() => onChange(moveShowClipEffectWithinStage(effects, effect.id, 1))}><ArrowDown size={11} /></IconButton>
                    <IconButton label={`Duplicate ${item?.label ?? effect.kind} Effect`} onClick={() => onChange(duplicateShowClipEffect(effects, effect.id))}><Copy size={11} /></IconButton>
                    <IconButton label={`Remove ${item?.label ?? effect.kind} Effect`} onClick={() => onChange(effects.filter((candidate) => candidate.id !== effect.id))}><Trash2 size={11} /></IconButton>
                  </div>
                  {expanded && (
                    <div className="grid grid-cols-2 gap-1.5 border-t border-zinc-800/60 p-2 sm:grid-cols-3">
                      {showClipEffectParameters(effect).map((parameter) => (
                        <label key={parameter.id} className="text-[8px] uppercase tracking-wide text-zinc-600">
                          <span className="flex items-center justify-between gap-2">
                            <span>{parameter.label}</span>
                            {parameter.min === 0 && parameter.max === 1 && <span className="font-mono tracking-normal text-zinc-700" title="Normalized value from zero to one">0–1</span>}
                          </span>
                          {parameter.kind === 'color' ? (
                            <input
                              type="color"
                              aria-label={parameter.label}
                              value={String(showClipEffectParameterValue(effect, parameter.id))}
                              onChange={(event) => onChange(effects.map((candidate) => candidate.id === effect.id
                                ? updateShowClipEffectParameter(candidate, parameter.id, event.target.value)
                                : candidate))}
                              className="mt-1 h-7 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-950 p-0.5 outline-none focus:border-cyan-400/60"
                            />
                          ) : (
                            <EffectParameterField
                              label={parameter.label}
                              value={Number(showClipEffectParameterValue(effect, parameter.id))}
                              min={parameter.min}
                              max={parameter.max}
                              step={parameter.step}
                              onCommit={(value) => onChange(effects.map((candidate) => candidate.id === effect.id
                                ? updateShowClipEffectParameter(candidate, parameter.id, value)
                                : candidate))}
                            />
                          )}
                        </label>
                      ))}
                      {showClipEffectParameters(effect).length === 0 && <p className="col-span-full text-[9px] text-zinc-600">No parameters. Wrap changes the address policy for transformed coordinates.</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {compiledCost && (
        <details className="border-t border-zinc-800 bg-zinc-950/45">
          <summary className="cursor-pointer px-2 py-1.5 text-[8px] uppercase tracking-[0.1em] text-zinc-600">Advanced compiled cost</summary>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-zinc-800 px-2 py-2 text-[8px] text-zinc-500 sm:grid-cols-3">
            <span>Pattern evaluations <b className="text-zinc-300">{compiledCost.cpu.patternEvaluations.formula}</b></span>
            <span>Affine/frame <b className="text-zinc-300">{compiledCost.cpu.effects.affineOperationsPerFrame}</b></span>
            <span>Distort ops/px <b className="text-zinc-300">{compiledCost.cpu.effects.distortionScalarOpsPerEvaluatedPixel}</b></span>
            <span>Color ops/px <b className="text-zinc-300">{compiledCost.cpu.effects.colorScalarOpsPerEvaluatedPixel}</b></span>
            <span>Generated scalars <b className="text-zinc-300">{compiledCost.memory.generatedScalarGlobals}</b></span>
            <span
              aria-label={`Generated UTF-8 source, ${compiledCost.code.artifactBytes} bytes, ${Math.round(compiledCost.code.budgetRatio * 100)}% source-size proxy against the observed ${compiledCost.code.budgetBytes.toLocaleString('en-US')}-byte compiled-bytecode activation ceiling. This is not remaining Controller capacity.`}
              title={`Source-size proxy against the observed ${compiledCost.code.budgetBytes.toLocaleString('en-US')}-byte compiled-bytecode activation ceiling; not remaining Controller capacity.`}
            >
              <span>Generated UTF-8 source</span>{' '}
              <b className="text-zinc-300">{compiledCost.code.artifactBytes} B · {Math.round(compiledCost.code.budgetRatio * 100)}% source-size proxy</b>
            </span>
          </div>
        </details>
      )}
    </section>
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
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(String(value))
  }, [value])

  const commit = (raw: string) => {
    focused.current = false
    const parsed = Number(raw)
    const lower = min ?? Number.NEGATIVE_INFINITY
    const upper = max ?? Number.POSITIVE_INFINITY
    const next = Number.isFinite(parsed) ? Math.max(lower, Math.min(upper, parsed)) : value
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft}
      onFocus={() => { focused.current = true }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(String(value))
          event.currentTarget.blur()
        }
      }}
      className="mt-1 h-7 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right text-[10px] tabular-nums text-zinc-200 outline-none focus:border-cyan-400/60"
    />
  )
}

function IconButton({ label, disabled = false, onClick, children }: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-6 shrink-0 place-items-center rounded text-zinc-600 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-20">{children}</button>
}

function stageLabel(stage: ShowEffectPipelineStage | null): string {
  return STAGES.find((candidate) => candidate.id === stage)?.label ?? 'Effect'
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
