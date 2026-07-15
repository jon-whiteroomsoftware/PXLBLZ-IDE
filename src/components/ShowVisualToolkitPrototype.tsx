import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Pause,
  Play,
  Plus,
  Redo2,
  Search,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react'
import {
  resolveShowToolkitParameters,
  type ShowToolkitKind,
  type ShowToolkitParameterDescriptor,
  type ShowToolkitParameterValue,
} from '@/engine/showVisualToolkit'
import {
  buildShowToolkitPresentationCatalogue,
  filterShowToolkitPresentationCatalogue,
  type ShowEffectPipelineStage,
  type ShowToolkitPresentationItem,
} from '@/engine/showVisualToolkitPresentation'

// PROTOTYPE: registry-backed interaction model for the production Show toolkit.
// Mounted only in development through ?prototype=visual-toolkit. Changes are local.

type Selection = 'clip' | 'boundary'

interface AppliedEffect {
  id: string
  key: string
  enabled: boolean
  expanded: boolean
}

const STAGES: Array<{ id: ShowEffectPipelineStage; label: string; detail: string }> = [
  { id: 'transform', label: 'Transform', detail: 'source coordinates' },
  { id: 'distort', label: 'Distort', detail: 'warped coordinates' },
  { id: 'address', label: 'Address', detail: 'clip or wrap' },
  { id: 'color-output', label: 'Color & output', detail: 'rendered pixels' },
]

const INITIAL_EFFECTS: AppliedEffect[] = [
  { id: 'fx-translate', key: 'effect:affine:translate', enabled: true, expanded: false },
  { id: 'fx-ripple', key: 'effect:distortion:ripple', enabled: true, expanded: true },
  { id: 'fx-wrap', key: 'effect:affine:wrap', enabled: true, expanded: false },
  { id: 'fx-hue', key: 'effect:output:hue', enabled: true, expanded: false },
]

const KIND_LABELS: Record<ShowToolkitKind, string> = {
  'property-animation': 'Animate',
  effect: 'Effects',
  transition: 'Transitions',
}

const surface = 'border border-zinc-800 bg-[#111216]'
const quietButton = 'border border-zinc-800 bg-[#15161a] text-zinc-500 hover:border-zinc-600 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-live'
const field = 'h-8 border border-zinc-700 bg-[#0c0d10] px-2 font-mono text-[10px] text-zinc-200 outline-none focus:border-live'
const label = 'font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600'

export function ShowVisualToolkitPrototype({ showName }: { showName: string }) {
  const [selection, setSelection] = useState<Selection>('clip')
  const [catalogueKind, setCatalogueKind] = useState<ShowToolkitKind>('effect')
  const [catalogueOpen, setCatalogueOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const [stageDimensions, setStageDimensions] = useState<1 | 2>(2)
  const [candidateKey, setCandidateKey] = useState('effect:distortion:ripple')
  const [effects, setEffects] = useState<AppliedEffect[]>(INITIAL_EFFECTS)
  const [transitionKey, setTransitionKey] = useState('transition:wipe:linear')
  const [animated, setAnimated] = useState(true)
  const [stressCase, setStressCase] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [values, setValues] = useState<Record<string, ShowToolkitParameterValue>>({
    amount: 0.18,
    frequency: 8,
    centerX: 0.5,
    centerY: 0.5,
    durationMs: 1200,
    easing: 'sine-in-out',
    direction: 0.25,
    edgePolicy: 'dither',
    feather: 0.08,
  })

  const catalogue = useMemo(
    () => buildShowToolkitPresentationCatalogue({ stageDimensions }),
    [stageDimensions],
  )
  const byKey = useMemo(() => new Map(catalogue.map((item) => [item.key, item])), [catalogue])
  const visibleItems = useMemo(() => filterShowToolkitPresentationCatalogue(catalogue, {
    kind: catalogueKind,
    query,
    compatibleOnly,
  }), [catalogue, catalogueKind, compatibleOnly, query])
  const candidate = byKey.get(candidateKey) ?? visibleItems[0] ?? catalogue[0]

  const chooseKind = (kind: ShowToolkitKind) => {
    setCatalogueKind(kind)
    const next = catalogue.find((item) => item.kind === kind)
    if (next) setCandidateKey(next.key)
  }

  const selectClip = () => {
    setSelection('clip')
    chooseKind('effect')
  }

  const selectBoundary = () => {
    setSelection('boundary')
    chooseKind('transition')
  }

  const addCandidate = () => {
    if (!candidate?.compatible) return
    if (candidate.kind === 'effect') {
      setEffects((current) => [
        ...current,
        { id: `fx-${candidate.variantId}-${current.length}`, key: candidate.key, enabled: true, expanded: true },
      ])
      setSelection('clip')
    } else if (candidate.kind === 'transition') {
      setTransitionKey(candidate.key)
      setSelection('boundary')
    } else {
      setAnimated(true)
      setSelection('clip')
    }
  }

  const exitPrototype = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('prototype')
    window.location.assign(url)
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#08090b] text-zinc-300">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-seam bg-[#0c0d10] px-3 font-mono">
        <span className="border border-live/30 bg-live/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-live">
          UI study
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] text-zinc-100">{showName}</div>
          <div className="text-[9px] text-zinc-600">Registry-backed · changes are not saved</div>
        </div>
        <div className="ml-auto hidden items-center gap-1 sm:flex">
          <button type="button" className={`grid size-7 place-items-center ${quietButton}`} aria-label="Undo"><Undo2 size={13} /></button>
          <button type="button" className={`grid size-7 place-items-center ${quietButton}`} aria-label="Redo"><Redo2 size={13} /></button>
          <span className="mx-1 h-4 w-px bg-zinc-800" />
          <span className="text-[9px] text-zinc-600">Stage</span>
          {([1, 2] as const).map((dimension) => (
            <button
              key={dimension}
              type="button"
              onClick={() => setStageDimensions(dimension)}
              className={`h-7 border px-2 text-[9px] ${stageDimensions === dimension ? 'border-live/50 bg-live/10 text-live' : quietButton}`}
            >
              {dimension}D
            </button>
          ))}
        </div>
        <button type="button" onClick={exitPrototype} className={`grid size-7 place-items-center ${quietButton}`} aria-label="Exit prototype">
          <X size={13} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto xl:overflow-hidden">
        <div className="grid min-h-full xl:h-full xl:grid-cols-[minmax(520px,1fr)_390px]">
          <main className="relative flex min-h-[660px] min-w-0 flex-col border-r border-seam xl:min-h-0">
            <div className="relative min-h-[330px] flex-1 overflow-hidden bg-[#07080a] p-3">
              <StagePreview candidate={catalogueOpen ? candidate : undefined} selection={selection} playing={playing} />
              <div className="absolute left-5 top-5 flex items-center gap-1 border border-zinc-800 bg-[#0b0c0f]/95 p-1 font-mono">
                <button
                  type="button"
                  onClick={() => setCatalogueOpen((open) => !open)}
                  className={`flex h-8 items-center gap-2 px-2 text-[10px] ${catalogueOpen ? 'bg-live text-zinc-950' : quietButton}`}
                >
                  <Plus size={13} /> Add
                </button>
                <button type="button" className={`flex h-8 items-center gap-2 px-2 text-[10px] ${quietButton}`}>
                  <Copy size={12} /> Copy look
                </button>
              </div>
              <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3 border border-zinc-800 bg-[#0b0c0f]/95 px-2 py-1.5 font-mono">
                <button
                  type="button"
                  onClick={() => setPlaying((current) => !current)}
                  className="grid size-7 place-items-center bg-live text-zinc-950 focus-visible:outline-2 focus-visible:outline-white"
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                </button>
                <span className="text-[10px] tabular-nums text-zinc-200">00:12.480</span>
                <span className="h-4 w-px bg-zinc-700" />
                <span className="text-[9px] text-zinc-500">256 px · {stageDimensions}D</span>
              </div>
            </div>

            <Timeline
              selection={selection}
              stressCase={stressCase}
              onSelectClip={selectClip}
              onSelectBoundary={selectBoundary}
            />

            {catalogueOpen && (
              <Catalogue
                kind={catalogueKind}
                query={query}
                compatibleOnly={compatibleOnly}
                items={visibleItems}
                candidate={candidate}
                onKind={chooseKind}
                onQuery={setQuery}
                onCompatibleOnly={setCompatibleOnly}
                onCandidate={setCandidateKey}
                onAdd={addCandidate}
                onClose={() => setCatalogueOpen(false)}
              />
            )}
          </main>

          <aside className="min-w-0 bg-[#0e0f12] xl:min-h-0 xl:overflow-auto" aria-label="Show selection inspector">
            <SelectionHeader selection={selection} onSelection={(next) => next === 'clip' ? selectClip() : selectBoundary()} />
            {selection === 'clip' ? (
              <ClipInspector
                effects={effects}
                byKey={byKey}
                animated={animated}
                stressCase={stressCase}
                values={values}
                onAnimated={setAnimated}
                onStressCase={setStressCase}
                onValues={setValues}
                onEffects={setEffects}
                onOpenCatalogue={() => { chooseKind('effect'); setCatalogueOpen(true) }}
              />
            ) : (
              <BoundaryInspector
                item={byKey.get(transitionKey)}
                values={values}
                onValues={setValues}
                onOpenCatalogue={() => { chooseKind('transition'); setCatalogueOpen(true) }}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

function StagePreview({ candidate, selection, playing }: {
  candidate?: ShowToolkitPresentationItem
  selection: Selection
  playing: boolean
}) {
  return (
    <div className="mx-auto grid h-full max-h-[620px] min-h-[300px] max-w-[840px] place-items-center">
      <div className="relative aspect-video w-[min(86%,760px)] overflow-hidden border border-zinc-700 bg-[#0a0b0e] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <div className="absolute inset-0 grid grid-cols-12 gap-[3px] p-5 opacity-90">
          {Array.from({ length: 96 }, (_, index) => (
            <span
              key={index}
              className="block min-h-1"
              style={{
                backgroundColor: index % 11 < 4 ? '#f59e0b' : index % 7 < 3 ? '#7c3aed' : '#0e7490',
                opacity: 0.16 + ((index * 17) % 70) / 100,
                transform: `translateY(${Math.sin(index * 0.8) * 6}px)`,
              }}
            />
          ))}
        </div>
        <div className="absolute inset-[17%] border border-live/60">
          <span className="absolute -left-1 -top-1 size-2 bg-live" />
          <span className="absolute -right-1 -top-1 size-2 bg-live" />
          <span className="absolute -bottom-1 -left-1 size-2 bg-live" />
          <span className="absolute -bottom-1 -right-1 size-2 bg-live" />
          <span className={`absolute left-[49%] top-[49%] size-3 -translate-x-1/2 -translate-y-1/2 border border-live bg-[#0a0b0e] ${playing ? 'animate-pulse' : ''}`} />
        </div>
        <div className="absolute bottom-2 left-2 border border-zinc-700 bg-[#090a0d]/90 px-2 py-1 font-mono text-[9px] text-zinc-400">
          {selection === 'boundary' ? 'Boundary preview' : 'Clip preview'}
          {candidate ? ` · trying ${candidate.label}` : ''}
        </div>
      </div>
    </div>
  )
}

function Timeline({ selection, stressCase, onSelectClip, onSelectBoundary }: {
  selection: Selection
  stressCase: boolean
  onSelectClip: () => void
  onSelectBoundary: () => void
}) {
  return (
    <section className="h-[220px] shrink-0 border-t border-seam bg-[#101115] p-3 font-mono">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className={label}>Timeline · Main</div>
          <div className="mt-1 text-[9px] text-zinc-600">Click a scene or its boundary to change inspector ownership.</div>
        </div>
        <div className="text-[9px] text-zinc-500">00:00 — 00:31</div>
      </div>
      <div className="relative h-7 border-b border-zinc-800 text-[8px] text-zinc-600">
        <span className="absolute left-0">00:00</span><span className="absolute left-1/3">00:10</span><span className="absolute left-2/3">00:20</span><span className="absolute right-0">00:30</span>
      </div>
      <div className="relative mt-3 flex h-20 items-stretch gap-1">
        <button type="button" className="w-[24%] border border-zinc-700 bg-[#171a20] p-2 text-left text-[10px] text-zinc-500">Warm-up</button>
        <button
          type="button"
          onClick={onSelectBoundary}
          className={`relative w-4 shrink-0 border ${selection === 'boundary' ? 'border-live bg-live/25' : 'border-cyan-800 bg-cyan-950'} focus-visible:outline-2 focus-visible:outline-live`}
          aria-label="Select boundary before Neon orchard"
        >
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[8px] text-cyan-300">Wipe</span>
        </button>
        <button
          type="button"
          onClick={onSelectClip}
          className={`relative flex-1 overflow-hidden border p-2 text-left ${selection === 'clip' ? 'border-live bg-live/10' : 'border-zinc-700 bg-[#1b1722]'} focus-visible:outline-2 focus-visible:outline-live`}
        >
          <span className="block text-[10px] text-zinc-100">Neon orchard</span>
          <span className="mt-1 block text-[8px] text-zinc-500">4 Effects · Brightness animated on entry</span>
          {stressCase && (
            <span className="absolute inset-x-0 bottom-0 flex h-3">
              <i className="w-[28%] border-r border-amber-500/60 bg-amber-500/20" />
              <i className="w-[34%] border-r border-amber-500/60 bg-amber-500/10" />
              <i className="flex-1 bg-amber-500/25" />
            </span>
          )}
        </button>
        <button type="button" className="w-[22%] border border-zinc-700 bg-[#171a20] p-2 text-left text-[10px] text-zinc-500">Afterglow</button>
        <span className="pointer-events-none absolute bottom-0 left-[47%] top-[-22px] w-px bg-live">
          <i className="absolute -left-1 top-0 h-2 w-2 rotate-45 bg-live" />
        </span>
      </div>
    </section>
  )
}

function Catalogue(props: {
  kind: ShowToolkitKind
  query: string
  compatibleOnly: boolean
  items: ShowToolkitPresentationItem[]
  candidate?: ShowToolkitPresentationItem
  onKind: (kind: ShowToolkitKind) => void
  onQuery: (query: string) => void
  onCompatibleOnly: (value: boolean) => void
  onCandidate: (key: string) => void
  onAdd: () => void
  onClose: () => void
}) {
  const families = [...new Set(props.items.map((item) => item.familyLabel))]
  return (
    <section className="fixed inset-x-3 bottom-3 top-14 z-20 flex min-h-0 border border-zinc-700 bg-[#101115] shadow-[0_20px_70px_rgba(0,0,0,0.65)] xl:absolute xl:bottom-[232px] xl:left-3 xl:right-auto xl:top-auto xl:max-h-[470px] xl:min-h-[330px] xl:w-[min(720px,calc(100%-24px))]" aria-label="Visual toolkit catalogue">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-zinc-800 p-2 font-mono">
          {(Object.keys(KIND_LABELS) as ShowToolkitKind[]).map((kind) => (
            <button key={kind} type="button" onClick={() => props.onKind(kind)} className={`h-8 px-2 text-[9px] uppercase tracking-[0.1em] ${props.kind === kind ? 'bg-live text-zinc-950' : quietButton}`}>
              {KIND_LABELS[kind]}
            </button>
          ))}
          <button type="button" onClick={props.onClose} className={`ml-auto grid size-8 place-items-center ${quietButton}`} aria-label="Close catalogue"><X size={13} /></button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col border-r border-zinc-800">
            <div className="flex gap-2 border-b border-zinc-800 p-2">
              <label className="relative min-w-0 flex-1">
                <Search className="absolute left-2 top-2 text-zinc-600" size={13} />
                <input value={props.query} onChange={(event) => props.onQuery(event.target.value)} className={`${field} w-full pl-7`} placeholder="Search 59 tools and presets" />
              </label>
              <label className="flex items-center gap-2 border border-zinc-800 px-2 font-mono text-[9px] text-zinc-500">
                <input type="checkbox" checked={props.compatibleOnly} onChange={(event) => props.onCompatibleOnly(event.target.checked)} className="accent-amber-400" /> compatible
              </label>
            </div>
            <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 p-2 font-mono">
              {families.map((family) => <span key={family} className="whitespace-nowrap border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500">{family}</span>)}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-px overflow-auto bg-zinc-800 sm:grid-cols-3">
              {props.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => props.onCandidate(item.key)}
                  className={`min-h-20 bg-[#111216] p-2 text-left hover:bg-[#181a20] focus-visible:outline-2 focus-visible:outline-live ${props.candidate?.key === item.key ? 'shadow-[inset_3px_0_0_#fbbf24] bg-[#1a1813]' : ''} ${item.compatible ? '' : 'opacity-45'}`}
                >
                  <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600">{item.familyLabel}</span>
                  <span className="mt-1 block text-[11px] font-medium text-zinc-100">{item.label}</span>
                  <span className="mt-1 line-clamp-2 text-[9px] leading-4 text-zinc-500">{item.compatible ? item.summary : item.compatibilityReason}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="hidden w-56 shrink-0 flex-col p-3 sm:flex">
            <span className={label}>Candidate preview</span>
            <div className="mt-3 grid aspect-video grid-cols-6 gap-1 border border-zinc-700 bg-[#090a0c] p-3">
              {Array.from({ length: 24 }, (_, index) => <i key={index} className={index % 3 === 0 ? 'bg-live/70' : index % 3 === 1 ? 'bg-violet-500/60' : 'bg-cyan-600/40'} />)}
            </div>
            <div className="mt-3 text-sm font-semibold text-zinc-100">{props.candidate?.label ?? 'No match'}</div>
            <p className="mt-1 text-[10px] leading-4 text-zinc-500">{props.candidate?.summary}</p>
            {props.candidate?.effectStage && <span className="mt-3 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">Stage · {props.candidate.effectStage}</span>}
            <button type="button" disabled={!props.candidate?.compatible} onClick={props.onAdd} className="mt-auto h-9 bg-live font-mono text-[10px] font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600">
              {props.kind === 'transition' ? 'Use on boundary' : props.kind === 'effect' ? 'Add Effect' : 'Animate on entry'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function SelectionHeader({ selection, onSelection }: { selection: Selection; onSelection: (selection: Selection) => void }) {
  return (
    <div className="sticky top-0 z-10 border-b border-seam bg-[#0e0f12] p-3">
      <div className="flex gap-1 font-mono">
        {(['clip', 'boundary'] as const).map((item) => (
          <button key={item} type="button" onClick={() => onSelection(item)} className={`h-8 flex-1 border text-[9px] uppercase tracking-[0.12em] ${selection === item ? 'border-live/60 bg-live/10 text-live' : quietButton}`}>
            {item === 'clip' ? 'Scene' : 'Boundary'}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <div className="text-sm font-semibold text-zinc-100">{selection === 'clip' ? 'Neon orchard' : 'Warm-up → Neon orchard'}</div>
        <div className="mt-1 font-mono text-[9px] text-zinc-600">{selection === 'clip' ? 'Scene · 12.0s · Main' : 'Boundary · starts 00:08.0'}</div>
      </div>
    </div>
  )
}

function ClipInspector(props: {
  effects: AppliedEffect[]
  byKey: Map<string, ShowToolkitPresentationItem>
  animated: boolean
  stressCase: boolean
  values: Record<string, ShowToolkitParameterValue>
  onAnimated: (value: boolean) => void
  onStressCase: (value: boolean) => void
  onValues: (values: Record<string, ShowToolkitParameterValue>) => void
  onEffects: (effects: AppliedEffect[]) => void
  onOpenCatalogue: () => void
}) {
  const toggleEffect = (id: string, patch: Partial<AppliedEffect>) => props.onEffects(props.effects.map((effect) => effect.id === id ? { ...effect, ...patch } : effect))
  return (
    <div className="p-3">
      <section className={surface}>
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <Sparkles size={13} className="text-live" />
          <span className="text-[11px] font-semibold text-zinc-100">Property animation</span>
          <label className="ml-auto flex items-center gap-2 font-mono text-[9px] text-zinc-500">
            On entry <input type="checkbox" checked={props.animated} onChange={(event) => props.onAnimated(event.target.checked)} className="accent-amber-400" />
          </label>
        </div>
        {props.animated && (
          <div className="p-3">
            <div className="flex items-center justify-between">
              <div><div className="text-[10px] text-zinc-200">Brightness</div><div className="mt-1 font-mono text-[9px] text-zinc-600">Previous scene → this scene</div></div>
              <div className="font-mono text-[10px] text-zinc-300"><span className="text-zinc-600">0.45</span> → 1.00</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label><span className={label}>Duration</span><input className={`${field} mt-1 w-full`} value="1200 ms" readOnly /></label>
              <label><span className={label}>Curve</span><select className={`${field} mt-1 w-full`} value="sine-in-out" onChange={() => undefined}><option value="sine-in-out">Sine in-out</option></select></label>
            </div>
            <button type="button" onClick={() => props.onStressCase(!props.stressCase)} className={`mt-3 w-full px-3 py-2 text-left font-mono text-[9px] ${props.stressCase ? 'border border-amber-500/50 bg-amber-500/10 text-amber-200' : quietButton}`}>
              {props.stressCase ? '3 changes require 3 structural scenes — is that acceptable?' : 'Test 3 value changes inside this scene'}
            </button>
            {props.stressCase && <p className="mt-2 text-[9px] leading-4 text-amber-200/70">Current model has no in-scene keyframes. Split creates two extra scene boundaries and changes the Show structure.</p>}
          </div>
        )}
      </section>

      <section className="mt-3">
        <div className="mb-2 flex items-center">
          <div><div className="text-[11px] font-semibold text-zinc-100">Effect stack</div><div className="mt-1 font-mono text-[8px] text-zinc-600">Signal flows top to bottom · one Pattern render</div></div>
          <button type="button" onClick={props.onOpenCatalogue} className={`ml-auto flex h-8 items-center gap-1 px-2 font-mono text-[9px] ${quietButton}`}><Plus size={12} /> Add</button>
        </div>
        <div className="border-x border-t border-zinc-800 bg-[#0b0c0f]">
          {STAGES.map((stage) => {
            const effects = props.effects.filter((effect) => props.byKey.get(effect.key)?.effectStage === stage.id)
            return (
              <div key={stage.id} className="border-b border-zinc-800">
                <div className="flex items-center gap-2 bg-[#0d0e11] px-2 py-1.5 font-mono">
                  <span className="size-1.5 bg-zinc-600" />
                  <span className="text-[8px] font-semibold uppercase tracking-[0.13em] text-zinc-500">{stage.label}</span>
                  <span className="text-[8px] text-zinc-700">{stage.detail}</span>
                  <span className="ml-auto text-[8px] tabular-nums text-zinc-700">{effects.length}</span>
                </div>
                {effects.length === 0 ? <div className="px-8 py-2 font-mono text-[8px] text-zinc-700">No Effect</div> : effects.map((effect) => {
                  const item = props.byKey.get(effect.key)
                  if (!item) return null
                  return (
                    <div key={effect.id} className={`border-t border-zinc-800/70 ${effect.enabled ? 'bg-[#131419]' : 'bg-[#0e0f12] opacity-55'}`}>
                      <div className="flex h-10 items-center gap-2 px-2">
                        <GripVertical size={13} className="text-zinc-700" />
                        <button type="button" onClick={() => toggleEffect(effect.id, { expanded: !effect.expanded })} className="grid size-6 place-items-center text-zinc-500" aria-label={`${effect.expanded ? 'Collapse' : 'Expand'} ${item.label}`}>{effect.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
                        <button type="button" onClick={() => toggleEffect(effect.id, { expanded: !effect.expanded })} className="min-w-0 flex-1 text-left"><span className="block truncate text-[10px] text-zinc-100">{item.label}</span><span className="block truncate font-mono text-[8px] text-zinc-600">{item.presetLabels[0] ?? STAGES.find((candidate) => candidate.id === item.effectStage)?.label ?? item.familyLabel}</span></button>
                        {effect.id === 'fx-ripple' && <span className="border border-violet-500/30 px-1.5 py-0.5 font-mono text-[7px] uppercase text-violet-300">animated</span>}
                        <button type="button" onClick={() => toggleEffect(effect.id, { enabled: !effect.enabled })} className="grid size-7 place-items-center text-zinc-500 hover:text-zinc-100" aria-label={`${effect.enabled ? 'Bypass' : 'Enable'} ${item.label}`}>{effect.enabled ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                      </div>
                      {effect.expanded && <ParameterEditor item={item} values={props.values} onValues={props.onValues} />}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 border border-zinc-800 bg-[#101115] px-3 py-2 font-mono text-[8px] text-zinc-600"><span className="size-1.5 bg-emerald-400" /> Fits current Stage budget <span className="ml-auto">1 render · smooth distortion</span></div>
      </section>
    </div>
  )
}

function BoundaryInspector(props: {
  item?: ShowToolkitPresentationItem
  values: Record<string, ShowToolkitParameterValue>
  onValues: (values: Record<string, ShowToolkitParameterValue>) => void
  onOpenCatalogue: () => void
}) {
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center"><div><div className="text-[11px] font-semibold text-zinc-100">Transition</div><div className="mt-1 font-mono text-[8px] text-zinc-600">One boundary object · not an Effect stack</div></div><button type="button" onClick={props.onOpenCatalogue} className={`ml-auto flex h-8 items-center gap-1 px-2 font-mono text-[9px] ${quietButton}`}><Plus size={12} /> Replace</button></div>
      <section className={surface}>
        <div className="border-b border-zinc-800 p-3"><span className={label}>{props.item?.familyLabel}</span><div className="mt-1 text-sm font-semibold text-zinc-100">{props.item?.label}</div><p className="mt-1 text-[9px] leading-4 text-zinc-500">{props.item?.summary}</p></div>
        {props.item && <ParameterEditor item={props.item} values={props.values} onValues={props.onValues} />}
      </section>
      <div className="mt-3 border border-zinc-800 bg-[#101115] p-3"><div className={label}>Boundary cost</div><div className="mt-2 flex justify-between font-mono text-[9px] text-zinc-400"><span>Pattern evaluation</span><span>edge-bounded blend</span></div><div className="mt-1 flex justify-between font-mono text-[9px] text-zinc-400"><span>Compatibility</span><span className="text-emerald-400">2D Stage</span></div></div>
    </div>
  )
}

function ParameterEditor({ item, values, onValues }: {
  item: ShowToolkitPresentationItem
  values: Record<string, ShowToolkitParameterValue>
  onValues: (values: Record<string, ShowToolkitParameterValue>) => void
}) {
  const parameters = resolveShowToolkitParameters(item.kind, item.familyId, item.variantId, values).slice(0, 5)
  return (
    <div className="border-t border-zinc-800/70 p-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {parameters.map((parameter) => <ParameterControl key={parameter.id} parameter={parameter} value={values[parameter.id] ?? parameter.defaultValue} onValue={(value) => onValues({ ...values, [parameter.id]: value })} />)}
      </div>
      {resolveShowToolkitParameters(item.kind, item.familyId, item.variantId, values).length > 5 && <button type="button" className="mt-3 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600 hover:text-zinc-300">Advanced parameters</button>}
    </div>
  )
}

function ParameterControl({ parameter, value, onValue }: {
  parameter: ShowToolkitParameterDescriptor
  value: ShowToolkitParameterValue
  onValue: (value: ShowToolkitParameterValue) => void
}) {
  if (parameter.kind === 'boolean') return <label className="col-span-2 flex h-8 items-center justify-between border border-zinc-800 px-2 font-mono text-[9px] text-zinc-500"><span>{parameter.label}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => onValue(event.target.checked)} className="accent-amber-400" /></label>
  if (parameter.kind === 'enum' || parameter.kind === 'easing') {
    const options = parameter.options ?? parameter.easingOptions?.map((option) => ({ value: option.id, label: option.label })) ?? []
    return <label><span className={label}>{parameter.label}</span><select className={`${field} mt-1 w-full`} value={String(value)} onChange={(event) => onValue(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  }
  if (parameter.kind === 'color') return <label><span className={label}>{parameter.label}</span><input type="color" className="mt-1 h-8 w-full border border-zinc-700 bg-[#0c0d10]" value={String(value)} onChange={(event) => onValue(event.target.value)} /></label>
  return (
    <label>
      <span className="flex items-center justify-between"><span className={label}>{parameter.label}</span><span className="font-mono text-[8px] text-zinc-500">{Number(value).toFixed(parameter.step && parameter.step < 1 ? 2 : 0)}{parameter.unit ?? ''}</span></span>
      <input type="range" className="mt-2 h-1 w-full accent-amber-400" min={parameter.min} max={parameter.max} step={parameter.step} value={Number(value)} onChange={(event) => onValue(Number(event.target.value))} />
    </label>
  )
}
