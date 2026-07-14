import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleGauge,
  Clock3,
  Eye,
  Grid3X3,
  Layers3,
  Move,
  Palette,
  Play,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Waves,
  X,
  Zap,
} from 'lucide-react'

// PROTOTYPE: Three Show visual-toolkit layouts, switchable via ?variant=,
// mounted inside the existing Show editor with ?prototype=visual-toolkit.

type PrototypeVariant = 'A' | 'B' | 'C'
type ToolkitKind = 'transition' | 'effect' | 'animation'
type EdgePolicy = 'hard' | 'dither' | 'feather' | 'blend'

interface ToolkitState {
  kind: ToolkitKind
  family: string
  variant: string
  durationMs: number
  easing: string
  direction: number
  feather: number
  edgePolicy: EdgePolicy
  advancedOpen: boolean
}

const variantNames: Record<PrototypeVariant, string> = {
  A: 'Signal chain',
  B: 'Inspector rail',
  C: 'Canvas desk',
}

const kindOptions: Array<{ id: ToolkitKind; label: string; detail: string }> = [
  { id: 'transition', label: 'Transition', detail: 'Between scenes' },
  { id: 'effect', label: 'Effect', detail: 'On one source' },
  { id: 'animation', label: 'Property animation', detail: 'A value over time' },
]

const familyOptions: Record<ToolkitKind, Array<{ name: string; icon: typeof Waves }>> = {
  transition: [
    { name: 'Blend', icon: Layers3 },
    { name: 'Wipe', icon: ArrowRight },
    { name: 'Dissolve', icon: Sparkles },
    { name: 'Shape reveal', icon: Eye },
    { name: 'Motion', icon: Move },
  ],
  effect: [
    { name: 'Time', icon: Clock3 },
    { name: 'Geometry', icon: RotateCw },
    { name: 'Color', icon: Palette },
    { name: 'Mask', icon: Eye },
  ],
  animation: [
    { name: 'Opacity', icon: Eye },
    { name: 'Animation speed', icon: Play },
    { name: 'Pattern control', icon: SlidersHorizontal },
    { name: 'Effect parameter', icon: Zap },
  ],
}

const variantsByFamily: Record<string, string[]> = {
  Blend: ['Crossfade', 'Through black', 'Through white', 'Through color'],
  Wipe: ['Linear', 'Split', 'Barn doors', 'Blinds', 'Clock', 'Checker'],
  Dissolve: ['Pixel', 'Block', 'Coherent noise', 'Soft threshold'],
  'Shape reveal': ['Circle', 'Box', 'Heart', 'Star', 'Cat head', 'Bastet'],
  Motion: ['Cover', 'Reveal', 'Push', 'Content shrink', 'Content grow'],
  Time: ['Speed', 'Phase', 'Hold', 'Repeat'],
  Geometry: ['Translate', 'Rotate', 'Scale', 'Shear', 'Wrap'],
  Color: ['Brightness', 'Hue', 'Saturation', 'Contrast', 'Posterize'],
  Mask: ['Crop', 'Shape', 'Strobe', 'Density'],
  Opacity: ['Opacity'],
  'Animation speed': ['Animation speed'],
  'Pattern control': ['Speed', 'Density', 'Palette'],
  'Effect parameter': ['Angle', 'Scale', 'Feather'],
}

const initialState: ToolkitState = {
  kind: 'transition',
  family: 'Wipe',
  variant: 'Linear',
  durationMs: 1200,
  easing: 'Ease in-out',
  direction: 90,
  feather: 8,
  edgePolicy: 'dither',
  advancedOpen: false,
}

const panel = 'border border-zinc-800/90 bg-[#111115]'
const inset = 'border border-zinc-800/80 bg-zinc-950/65'
const eyebrow = 'font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600'
const control = 'h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-200 outline-none focus:border-live focus:ring-1 focus:ring-live/40'

export function ShowVisualToolkitPrototype({ showName }: { showName: string }) {
  const [variant, setVariant] = useState<PrototypeVariant>(() => readVariant())
  const [state, setState] = useState<ToolkitState>(initialState)

  useEffect(() => {
    const onPopState = () => setVariant(readVariant())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const selectVariant = (next: PrototypeVariant) => {
    const url = new URL(window.location.href)
    url.searchParams.set('prototype', 'visual-toolkit')
    url.searchParams.set('variant', next)
    window.history.replaceState(null, '', url)
    setVariant(next)
  }

  const exitPrototype = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('prototype')
    url.searchParams.delete('variant')
    window.location.assign(url)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      const variants: PrototypeVariant[] = ['A', 'B', 'C']
      const current = variants.indexOf(variant)
      const delta = event.key === 'ArrowLeft' ? -1 : 1
      selectVariant(variants[(current + delta + variants.length) % variants.length])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const chooseKind = (kind: ToolkitKind) => {
    const family = familyOptions[kind][0].name
    setState((current) => ({
      ...current,
      kind,
      family,
      variant: variantsByFamily[family][0],
    }))
  }

  const chooseFamily = (family: string) => {
    setState((current) => ({ ...current, family, variant: variantsByFamily[family][0] }))
  }

  const updateState = (patch: Partial<ToolkitState>) => setState((current) => ({ ...current, ...patch }))

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#08080a] font-mono text-xs text-zinc-400">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-seam bg-[#0d0d10] px-3">
        <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-300">
          UI prototype
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] text-zinc-200">{showName}</div>
          <div className="text-[9px] text-zinc-600">Visual toolkit · read-only synthetic state</div>
        </div>
        <button
          type="button"
          onClick={exitPrototype}
          className="ml-auto flex h-7 items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/80 px-2 text-[10px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-live"
        >
          <X size={12} aria-hidden />
          Exit prototype
        </button>
      </header>

      <div className="@container min-h-0 flex-1 overflow-auto">
        {variant === 'A' && (
          <VariantSignalChain state={state} updateState={updateState} chooseKind={chooseKind} chooseFamily={chooseFamily} />
        )}
        {variant === 'B' && (
          <VariantInspectorRail state={state} updateState={updateState} chooseKind={chooseKind} chooseFamily={chooseFamily} />
        )}
        {variant === 'C' && (
          <VariantCanvasDesk state={state} updateState={updateState} chooseKind={chooseKind} chooseFamily={chooseFamily} />
        )}
      </div>

      <PrototypeSwitcher variant={variant} state={state} onChange={selectVariant} />
    </div>
  )
}

function VariantSignalChain({
  state,
  updateState,
  chooseKind,
  chooseFamily,
}: PrototypeProps) {
  return (
    <main className="@container mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-3 p-3 pb-24">
      <div className="flex flex-col gap-2 @min-[700px]:flex-row @min-[700px]:items-end @min-[700px]:justify-between">
        <div>
          <div className={eyebrow}>A · Signal chain</div>
          <h1 className="mt-1 font-sans text-lg font-semibold text-zinc-100">Follow the pixel from Pattern to output.</h1>
        </div>
        <p className="max-w-md font-sans text-xs leading-5 text-zinc-500 @min-[700px]:text-right">
          The selected object owns the desk. Cost stays attached to the exact stage that creates it.
        </p>
      </div>

      <Timeline selectedLabel={`${state.family} · ${state.variant}`} compact />
      <SignalPath state={state} chooseKind={chooseKind} />

      <div className="grid gap-3 @min-[820px]:grid-cols-[220px_minmax(0,1fr)]">
        <section className={`${panel} min-w-0`} aria-label="Toolkit family">
          <PanelTitle overline={labelForKind(state.kind)} title="Choose a family" />
          <div className="grid grid-cols-2 gap-1.5 p-2">
            {familyOptions[state.kind].map(({ name, icon: Icon }) => (
              <button
                key={name}
                type="button"
                onClick={() => chooseFamily(name)}
                className={`min-h-16 rounded border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-live ${
                  state.family === name
                    ? 'border-live/60 bg-live/10 text-live'
                    : 'border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:border-zinc-600 hover:text-zinc-200'
                }`}
              >
                <Icon size={14} aria-hidden />
                <span className="mt-2 block text-[10px] font-medium">{name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={`${panel} min-w-0`} aria-label="Look and timing controls">
          <PanelTitle overline={state.family} title={state.variant} aside={<CostBadge edgePolicy={state.edgePolicy} />} />
          <div className="grid gap-3 p-3 @min-[620px]:grid-cols-[minmax(180px,.8fr)_minmax(260px,1.2fr)]">
            <VariantPicker state={state} updateState={updateState} presentation="list" />
            <div className="space-y-3">
              <LookControls state={state} updateState={updateState} />
              <TimingControls state={state} updateState={updateState} />
            </div>
          </div>
        </section>

        <section className={`${panel} min-w-0 @min-[820px]:col-span-2`} aria-label="Output and cost">
          <PanelTitle overline="Output" title="What the Controller does" />
          <div className="space-y-3 p-3">
            <StagePreview state={state} size="small" />
            <CostDisclosure state={state} updateState={updateState} />
          </div>
        </section>
      </div>
    </main>
  )
}

function VariantInspectorRail({
  state,
  updateState,
  chooseKind,
  chooseFamily,
}: PrototypeProps) {
  return (
    <main className="grid min-h-full pb-20 @min-[660px]:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0 border-r border-seam bg-[#09090b] p-3">
        <div className="mb-3">
          <div>
            <div className={eyebrow}>B · Inspector rail</div>
            <h1 className="mt-1 font-sans text-lg font-semibold text-zinc-100">Keep the timeline dominant.</h1>
          </div>
          <div className="mt-2 flex w-fit max-w-full flex-wrap rounded border border-zinc-800 bg-zinc-950 p-0.5">
            {kindOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseKind(item.id)}
                className={`rounded px-2.5 py-1.5 text-[9px] ${state.kind === item.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <Timeline selectedLabel={`${state.family} · ${state.variant}`} />
        <div className="mt-3 grid gap-3">
          <StagePreview state={state} size="large" />
          <div className={`${panel} p-3`}>
            <div className={eyebrow}>Selection</div>
            <div className="mt-2 text-sm text-zinc-100">Orchard → Ultraviolet</div>
            <p className="mt-2 font-sans text-xs leading-5 text-zinc-500">
              Boundary 02 owns this {labelForKind(state.kind).toLowerCase()}. The preview remains visible while the rail scrolls.
            </p>
            <div className="mt-4">
              <SignalPath state={state} chooseKind={chooseKind} compact />
            </div>
          </div>
        </div>
      </section>

      <aside className="min-w-0 bg-[#101013] @min-[660px]:h-[calc(100vh-44px)] @min-[660px]:overflow-auto" aria-label="Contextual inspector prototype">
        <div className="sticky top-0 z-10 border-b border-zinc-800 bg-[#151519]/95 p-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded border border-live/40 bg-live/10 text-live"><ArrowRight size={14} /></span>
            <div className="min-w-0">
              <div className={eyebrow}>{labelForKind(state.kind)} properties</div>
              <div className="truncate text-[11px] text-zinc-200">{state.family} · {state.variant}</div>
            </div>
            <CostBadge edgePolicy={state.edgePolicy} />
          </div>
        </div>

        <div className="space-y-2 p-2.5">
          <InspectorSection title="Type" open>
            <div className="grid grid-cols-2 gap-1.5">
              {familyOptions[state.kind].map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => chooseFamily(name)}
                  className={`flex h-9 items-center gap-2 rounded border px-2 text-[10px] ${state.family === name ? 'border-live/50 bg-live/10 text-live' : 'border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:text-zinc-200'}`}
                >
                  <Icon size={12} /> {name}
                </button>
              ))}
            </div>
            <VariantPicker state={state} updateState={updateState} presentation="select" />
          </InspectorSection>
          <InspectorSection title="Look" open>
            <LookControls state={state} updateState={updateState} />
          </InspectorSection>
          <InspectorSection title="Timing" open>
            <TimingControls state={state} updateState={updateState} />
          </InspectorSection>
          <InspectorSection title="Edge and cost" open>
            <CostDisclosure state={state} updateState={updateState} />
          </InspectorSection>
        </div>
      </aside>
    </main>
  )
}

function VariantCanvasDesk({
  state,
  updateState,
  chooseKind,
  chooseFamily,
}: PrototypeProps) {
  const families = familyOptions[state.kind]
  return (
    <main className="@container flex min-h-full flex-col gap-2 p-2.5 pb-24">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-2">
        <div className="mr-2">
          <div className={eyebrow}>C · Canvas desk</div>
          <h1 className="mt-0.5 font-sans text-base font-semibold text-zinc-100">Choose by looking, refine by listening.</h1>
        </div>
        {kindOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => chooseKind(item.id)}
            className={`rounded-full border px-3 py-1.5 text-[10px] ${state.kind === item.id ? 'border-live/60 bg-live/10 text-live' : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-200'}`}
          >
            {item.label}
          </button>
        ))}
        <div className="ml-auto min-w-[230px]">
          <SignalPath state={state} chooseKind={chooseKind} compact />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-2 @min-[680px]:grid-cols-[minmax(0,1fr)_310px]">
        <section className="grid min-h-[570px] min-w-0 grid-rows-[minmax(320px,1fr)_auto_auto] gap-2">
          <StagePreview state={state} size="hero" />
          <Timeline selectedLabel={`${state.family} · ${state.variant}`} compact />
          <div className={`${panel} overflow-hidden`}>
            <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
              <Grid3X3 size={13} className="text-zinc-600" />
              <span className={eyebrow}>Visual library</span>
              <span className="text-[9px] text-zinc-700">Pick a family, then a look</span>
            </div>
            <div className="flex gap-2 overflow-x-auto p-2">
              {families.map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => chooseFamily(name)}
                  className={`group min-w-28 rounded border p-2 text-left ${state.family === name ? 'border-live/60 bg-live/10' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-600'}`}
                >
                  <div className="relative h-14 overflow-hidden rounded border border-zinc-800 bg-gradient-to-br from-emerald-950 via-zinc-950 to-fuchsia-950">
                    <span className="absolute inset-y-0 left-1/2 w-px rotate-12 bg-live/70" />
                    <Icon className="absolute bottom-2 right-2 text-zinc-400" size={15} />
                  </div>
                  <span className={`mt-2 block text-[10px] ${state.family === name ? 'text-live' : 'text-zinc-400'}`}>{name}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className={`${panel} min-w-0`} aria-label="Channel strip controls">
          <PanelTitle overline={labelForKind(state.kind)} title={`${state.family} · ${state.variant}`} aside={<CostBadge edgePolicy={state.edgePolicy} />} />
          <div className="space-y-4 p-3">
            <div>
              <div className={eyebrow}>Look</div>
              <VariantPicker state={state} updateState={updateState} presentation="select" />
              <div className="mt-3"><LookControls state={state} updateState={updateState} /></div>
            </div>
            <div className="border-t border-zinc-800 pt-4">
              <div className={eyebrow}>Timing</div>
              <div className="mt-2"><TimingControls state={state} updateState={updateState} /></div>
            </div>
            <div className="border-t border-zinc-800 pt-4">
              <div className={eyebrow}>Controller load</div>
              <div className="mt-2"><CostDisclosure state={state} updateState={updateState} /></div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

interface PrototypeProps {
  state: ToolkitState
  updateState: (patch: Partial<ToolkitState>) => void
  chooseKind: (kind: ToolkitKind) => void
  chooseFamily: (family: string) => void
}

function PanelTitle({ overline, title, aside }: { overline: string; title: string; aside?: React.ReactNode }) {
  return (
    <header className="flex h-11 items-center gap-2 border-b border-zinc-800/90 bg-zinc-950/55 px-3">
      <div className="min-w-0">
        <div className={eyebrow}>{overline}</div>
        <div className="truncate text-[11px] text-zinc-200">{title}</div>
      </div>
      {aside && <div className="ml-auto">{aside}</div>}
    </header>
  )
}

function SignalPath({ state, chooseKind, compact = false }: { state: ToolkitState; chooseKind: (kind: ToolkitKind) => void; compact?: boolean }) {
  const steps = [
    { id: null, label: 'Pattern', value: 'Neon Orchard' },
    { id: 'effect' as const, label: 'Effects', value: state.kind === 'effect' ? `${state.family} · ${state.variant}` : 'None' },
    { id: 'transition' as const, label: 'Boundary', value: state.kind === 'transition' ? `${state.family} · ${state.variant}` : 'Wipe · Linear' },
    { id: null, label: 'Output', value: '512 px' },
  ]
  return (
    <div className={`${compact ? '' : `${panel} p-2`} grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-1`} aria-label="Pixel signal chain">
      {steps.map((step, index) => (
        <div className="contents" key={step.label}>
          <button
            type="button"
            disabled={step.id === null}
            onClick={() => step.id && chooseKind(step.id)}
            className={`min-w-0 rounded border px-2 py-1.5 text-left ${step.id && state.kind === step.id ? 'border-live/60 bg-live/10' : 'border-zinc-800 bg-zinc-950/65'} disabled:cursor-default`}
          >
            <span className="block text-[8px] uppercase tracking-[0.12em] text-zinc-700">{step.label}</span>
            <span className={`block truncate text-[9px] ${step.id && state.kind === step.id ? 'text-live' : 'text-zinc-400'}`}>{step.value}</span>
          </button>
          {index < steps.length - 1 && <span className="h-px w-3 bg-gradient-to-r from-zinc-700 to-live/60" aria-hidden />}
        </div>
      ))}
    </div>
  )
}

function Timeline({ selectedLabel, compact = false }: { selectedLabel: string; compact?: boolean }) {
  return (
    <section className={`${panel} overflow-hidden`} aria-label="Synthetic Show timeline">
      <div className="grid grid-cols-[96px_1.25fr_.8fr_1.4fr] border-b border-zinc-800 bg-zinc-950/70 text-[9px]">
        <div className="px-2 py-2 uppercase tracking-[0.1em] text-zinc-700">Scenes</div>
        <div className="border-l border-zinc-800 px-2 py-2 text-zinc-400">01 · Orchard</div>
        <div className="border-l border-zinc-800 px-2 py-2 text-live">02 · Turn</div>
        <div className="border-l border-zinc-800 px-2 py-2 text-zinc-400">03 · Ultraviolet</div>
      </div>
      <div className={`relative grid grid-cols-[96px_1.25fr_.8fr_1.4fr] ${compact ? 'h-16' : 'h-28'}`}>
        <div className="flex flex-col justify-center border-r border-zinc-800 bg-[#151519] px-2">
          <span className="text-[10px] text-zinc-300">All pixels</span>
          <span className="mt-1 text-[8px] text-zinc-700">512 px · 2D</span>
        </div>
        <div className="m-2 rounded border-l-2 border-emerald-400/70 bg-emerald-950/30 px-2 py-2 text-[9px] text-zinc-300">Neon Orchard</div>
        <div className="relative m-2 rounded border border-live/60 bg-[repeating-linear-gradient(135deg,rgba(251,191,36,.16)_0_5px,rgba(251,191,36,.04)_5px_10px)] p-2 text-center text-[8px] uppercase tracking-[0.08em] text-live">
          <span className="absolute left-1/2 top-0 h-full w-px bg-live/80" />
          <span className="relative bg-zinc-950/75 px-1">{selectedLabel}</span>
        </div>
        <div className="m-2 rounded border-l-2 border-fuchsia-400/70 bg-fuchsia-950/25 px-2 py-2 text-[9px] text-zinc-300">Ultraviolet Bloom</div>
        <span className="pointer-events-none absolute bottom-0 left-[47%] top-0 w-px bg-live shadow-[0_0_8px_rgba(251,191,36,.6)]" />
      </div>
    </section>
  )
}

function StagePreview({ state, size }: { state: ToolkitState; size: 'small' | 'large' | 'hero' }) {
  const background = useMemo(() => previewBackground(state), [state])
  const height = size === 'small' ? 'h-36' : size === 'large' ? 'h-72' : 'min-h-[340px] h-full'
  return (
    <div className={`${inset} relative overflow-hidden rounded ${height}`} aria-label="Synthetic transition preview">
      <div className="absolute inset-0 transition-[background] duration-300" style={{ background }} />
      <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle,rgba(255,255,255,.35)_0_1px,transparent_1.5px)] [background-size:14px_14px]" />
      <div className="absolute inset-x-3 top-3 flex items-center justify-between">
        <span className="rounded border border-white/10 bg-black/55 px-2 py-1 text-[8px] uppercase tracking-[0.12em] text-white/60">Stage preview</span>
        <span className="rounded border border-white/10 bg-black/55 px-2 py-1 text-[8px] text-live">48%</span>
      </div>
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
        <div className="rounded border border-white/10 bg-black/60 px-2 py-1">
          <div className="text-[8px] uppercase tracking-[0.1em] text-white/35">Selected</div>
          <div className="text-[10px] text-white/80">{state.family} · {state.variant}</div>
        </div>
        <button type="button" className="grid size-8 place-items-center rounded-full border border-live/50 bg-black/65 text-live hover:bg-live/10 focus-visible:outline-2 focus-visible:outline-live" aria-label="Play synthetic preview">
          <Play size={13} fill="currentColor" />
        </button>
      </div>
    </div>
  )
}

function VariantPicker({ state, updateState, presentation }: { state: ToolkitState; updateState: PrototypeProps['updateState']; presentation: 'list' | 'select' }) {
  const options = variantsByFamily[state.family] ?? [state.variant]
  if (presentation === 'select') {
    return (
      <label className="mt-2 block">
        <span className="mb-1 block text-[9px] uppercase tracking-[0.1em] text-zinc-600">Variant</span>
        <select aria-label="Variant" className={control} value={state.variant} onChange={(event) => updateState({ variant: event.target.value })}>
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
    )
  }
  return (
    <div>
      <div className={eyebrow}>Variant</div>
      <div className="mt-2 space-y-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => updateState({ variant: option })}
            className={`flex h-8 w-full items-center rounded border px-2 text-left text-[10px] ${state.variant === option ? 'border-live/50 bg-live/10 text-live' : 'border-zinc-800 bg-zinc-950/55 text-zinc-500 hover:text-zinc-200'}`}
          >
            <span className={`mr-2 size-1.5 rounded-full ${state.variant === option ? 'bg-live' : 'bg-zinc-700'}`} />
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function LookControls({ state, updateState }: { state: ToolkitState; updateState: PrototypeProps['updateState'] }) {
  return (
    <div className="space-y-3">
      <RangeField label="Direction" value={state.direction} min={0} max={360} suffix="°" onChange={(direction) => updateState({ direction })} />
      <RangeField label="Feather" value={state.feather} min={0} max={32} suffix=" px" onChange={(feather) => updateState({ feather })} />
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-[0.1em] text-zinc-600">
          <span>Edge</span><span className="normal-case tracking-normal text-zinc-500">quality / cost</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {(['hard', 'dither', 'feather', 'blend'] as EdgePolicy[]).map((policy) => (
            <button
              key={policy}
              type="button"
              onClick={() => updateState({ edgePolicy: policy })}
              className={`rounded border px-1 py-1.5 text-[8px] capitalize ${state.edgePolicy === policy ? 'border-live/50 bg-live/10 text-live' : 'border-zinc-800 bg-zinc-950/50 text-zinc-600 hover:text-zinc-300'}`}
            >
              {policy}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function TimingControls({ state, updateState }: { state: ToolkitState; updateState: PrototypeProps['updateState'] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1.25fr]">
      <label>
        <span className="mb-1 block text-[9px] uppercase tracking-[0.1em] text-zinc-600">Duration</span>
        <div className="relative">
          <input
            type="number"
            min={0}
            step={100}
            value={state.durationMs}
            onChange={(event) => updateState({ durationMs: Number(event.target.value) })}
            className={`${control} pr-9 text-right`}
          />
          <span className="pointer-events-none absolute right-2 top-2 text-[9px] text-zinc-600">ms</span>
        </div>
      </label>
      <label>
        <span className="mb-1 block text-[9px] uppercase tracking-[0.1em] text-zinc-600">Easing</span>
        <select className={control} value={state.easing} onChange={(event) => updateState({ easing: event.target.value })}>
          <option>Linear</option>
          <option>Ease in</option>
          <option>Ease out</option>
          <option>Ease in-out</option>
          <option>Custom Bezier</option>
          <option>Steps</option>
          <option>Back out</option>
        </select>
      </label>
      <div className="sm:col-span-2">
        <EasingCurve easing={state.easing} />
      </div>
    </div>
  )
}

function RangeField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.1em] text-zinc-600">
        <span>{label}</span><b className="font-medium normal-case tracking-normal text-zinc-300">{value}{suffix}</b>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-1.5 w-full accent-live" />
    </label>
  )
}

function EasingCurve({ easing }: { easing: string }) {
  const path = easing === 'Linear'
    ? 'M 7 47 L 153 7'
    : easing === 'Ease in'
      ? 'M 7 47 C 85 47, 102 7, 153 7'
      : easing === 'Ease out'
        ? 'M 7 47 C 45 7, 82 7, 153 7'
        : easing === 'Steps'
          ? 'M 7 47 H 43 V 37 H 80 V 27 H 116 V 17 H 153 V 7'
          : easing === 'Back out'
            ? 'M 7 47 C 48 47, 78 -6, 113 10 C 132 18, 141 7, 153 7'
            : 'M 7 47 C 45 47, 112 7, 153 7'
  return (
    <div className={`${inset} flex h-16 items-center gap-2 rounded px-2`}>
      <svg viewBox="0 0 160 54" className="h-12 min-w-0 flex-1" role="img" aria-label={`${easing} curve`}>
        <path d="M 7 47 H 153 M 7 7 V 47" fill="none" stroke="#3f3f46" strokeWidth="1" />
        <path d={path} fill="none" stroke="#fbbf24" strokeWidth="2" />
        <circle cx="7" cy="47" r="2.5" fill="#fbbf24" />
        <circle cx="153" cy="7" r="2.5" fill="#fbbf24" />
      </svg>
      <div className="w-20 text-[8px] leading-4 text-zinc-600">0 → 1<br /><span className="text-zinc-400">{easing}</span></div>
    </div>
  )
}

function CostBadge({ edgePolicy }: { edgePolicy: EdgePolicy }) {
  const expensive = edgePolicy === 'blend'
  const bounded = edgePolicy === 'feather'
  return (
    <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[8px] uppercase tracking-[0.1em] ${
      expensive ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : bounded ? 'border-sky-500/40 bg-sky-500/10 text-sky-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    }`}>
      <span className={`size-1.5 rounded-full ${expensive ? 'bg-amber-400' : bounded ? 'bg-sky-400' : 'bg-emerald-400'}`} />
      {expensive ? '2× render' : bounded ? 'bounded' : 'efficient'}
    </span>
  )
}

function CostDisclosure({ state, updateState }: { state: ToolkitState; updateState: PrototypeProps['updateState'] }) {
  const math = state.edgePolicy === 'blend' ? '2N' : state.edgePolicy === 'feather' ? 'N + E' : 'N'
  const count = state.edgePolicy === 'blend' ? '1,024' : state.edgePolicy === 'feather' ? '~576' : '512'
  return (
    <div className={`${inset} rounded p-2.5`}>
      <div className="flex items-start gap-2">
        <CircleGauge size={15} className="mt-0.5 text-emerald-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-zinc-300">{count} Pattern evaluations</span>
            <code className="text-[10px] text-live">{math}</code>
          </div>
          <p className="mt-1 font-sans text-[10px] leading-4 text-zinc-600">At 512 output pixels, per frame.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => updateState({ advancedOpen: !state.advancedOpen })}
        className="mt-2 flex w-full items-center justify-between border-t border-zinc-800 pt-2 text-[9px] text-zinc-500"
      >
        <span>{state.advancedOpen ? 'Hide resource detail' : 'Why this cost?'}</span><ChevronDown size={11} className={state.advancedOpen ? 'rotate-180' : ''} />
      </button>
      {state.advancedOpen && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[8px]">
          <div className="rounded bg-zinc-900 p-1.5"><span className="block text-zinc-700">Memory</span><b className="font-medium text-zinc-400">+3 scalar</b></div>
          <div className="rounded bg-zinc-900 p-1.5"><span className="block text-zinc-700">Code</span><b className="font-medium text-zinc-400">+184 B</b></div>
          <div className="rounded bg-zinc-900 p-1.5"><span className="block text-zinc-700">Coverage</span><b className="font-medium text-zinc-400">100%</b></div>
        </div>
      )}
    </div>
  )
}

function InspectorSection({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className={`${panel} group`} open={open}>
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-2.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500 hover:text-zinc-200">
        <ChevronDown size={11} className="transition-transform group-open:rotate-180" />
        {title}
      </summary>
      <div className="border-t border-zinc-800 p-2.5">{children}</div>
    </details>
  )
}

function PrototypeSwitcher({ variant, state, onChange }: { variant: PrototypeVariant; state: ToolkitState; onChange: (variant: PrototypeVariant) => void }) {
  const variants: PrototypeVariant[] = ['A', 'B', 'C']
  const current = variants.indexOf(variant)
  const cycle = (delta: number) => onChange(variants[(current + delta + variants.length) % variants.length])
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-600 bg-zinc-950/95 p-1 shadow-2xl shadow-black backdrop-blur">
      <button type="button" onClick={() => cycle(-1)} className="grid size-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-live" aria-label="Previous prototype variant">
        <ArrowLeft size={14} />
      </button>
      <div className="min-w-40 px-2 text-center">
        <div className="text-[10px] font-semibold text-zinc-100">{variant} · {variantNames[variant]}</div>
        <div className="text-[8px] text-zinc-600">← → switch · {state.family}/{state.variant}</div>
      </div>
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-full px-2 py-1 text-[8px] uppercase tracking-[0.1em] text-zinc-600 hover:bg-zinc-800 hover:text-zinc-200">State</summary>
        <pre className="absolute bottom-10 right-0 w-72 overflow-auto rounded border border-zinc-700 bg-zinc-950 p-3 text-left text-[9px] leading-4 text-zinc-400 shadow-2xl">{JSON.stringify(state, null, 2)}</pre>
      </details>
      <button type="button" onClick={() => cycle(1)} className="grid size-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-live" aria-label="Next prototype variant">
        <ArrowRight size={14} />
      </button>
    </div>
  )
}

function labelForKind(kind: ToolkitKind): string {
  return kindOptions.find((item) => item.id === kind)?.label ?? kind
}

function readVariant(): PrototypeVariant {
  const value = new URLSearchParams(window.location.search).get('variant')?.toUpperCase()
  return value === 'B' || value === 'C' ? value : 'A'
}

function previewBackground(state: ToolkitState): string {
  const orchard = 'radial-gradient(circle at 24% 28%, rgba(49,220,121,.88) 0 4%, transparent 15%), radial-gradient(circle at 60% 73%, rgba(18,135,90,.9) 0 10%, transparent 28%), #04110a'
  const ultraviolet = 'radial-gradient(circle at 72% 34%, rgba(217,70,239,.92) 0 5%, transparent 20%), radial-gradient(circle at 38% 68%, rgba(91,33,182,.95) 0 14%, transparent 32%), #10051a'
  if (state.family === 'Shape reveal') {
    return `radial-gradient(circle at 52% 48%, transparent 0 27%, rgba(251,191,36,.95) 27.5% 28%, transparent 28.5%), radial-gradient(circle at 52% 48%, rgba(88,28,135,.92) 0 28%, transparent 28.5%), ${orchard}`
  }
  if (state.family === 'Dissolve') {
    return `radial-gradient(circle, rgba(216,70,239,.8) 0 18%, transparent 20%) 0 0 / 22px 22px, ${orchard}`
  }
  if (state.family === 'Blend') {
    return `linear-gradient(${state.direction}deg, rgba(4,17,10,.35), rgba(80,7,104,.65)), ${orchard}`
  }
  if (state.family === 'Motion') {
    return `linear-gradient(90deg, transparent 0 45%, rgba(251,191,36,.9) 45.3% 45.7%, transparent 46%), linear-gradient(90deg, rgba(4,17,10,.95) 0 45%, rgba(65,12,90,.95) 46%), ${ultraviolet}`
  }
  return `linear-gradient(${state.direction}deg, transparent 0 48%, rgba(251,191,36,.95) 48.5% 49%, rgba(76,13,104,.88) 50% 100%), ${orchard}`
}
