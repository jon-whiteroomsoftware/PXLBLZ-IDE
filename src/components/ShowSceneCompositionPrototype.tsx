import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers3,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'

// Second-round Scene-detail study: three dense arrangements inside one stable
// IDE frame, switchable with ?variant=A|B|C.

type Variant = 'A' | 'B' | 'C'
type Selection = 'rapid-cut' | 'overlay' | 'tail'

const VARIANTS: Array<{ id: Variant; name: string }> = [
  { id: 'A', name: 'Property shelf' },
  { id: 'B', name: 'Docked inspector' },
  { id: 'C', name: 'Inline command strip' },
]

const button = 'border border-zinc-800 bg-[#111216] text-zinc-500 hover:border-zinc-600 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-amber-300'

export function ShowSceneCompositionPrototype({ showName }: { showName: string }) {
  const initial = new URLSearchParams(window.location.search).get('variant')
  const [variant, setVariant] = useState<Variant>(initial === 'A' || initial === 'C' ? initial : 'B')
  const [selection, setSelection] = useState<Selection>('overlay')
  const [playing, setPlaying] = useState(false)

  const choose = (next: Variant) => {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.history.replaceState({}, '', url)
    setVariant(next)
  }
  const cycle = (direction: -1 | 1) => {
    const index = VARIANTS.findIndex((candidate) => candidate.id === variant)
    choose(VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length].id)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') cycle(-1)
      if (event.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const exit = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('prototype')
    url.searchParams.delete('variant')
    window.location.assign(url)
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#08090b] font-mono text-zinc-300">
      <TopBar showName={showName} onExit={exit} />
      <div className="flex min-h-0 flex-1">
        <LibraryRail />
        <main className="min-w-0 flex-1 border-x border-zinc-800 bg-[#090a0d]">
          {variant === 'A' && <PropertyShelf selection={selection} onSelection={setSelection} />}
          {variant === 'B' && <DockedInspector selection={selection} onSelection={setSelection} />}
          {variant === 'C' && <InlineCommandStrip selection={selection} onSelection={setSelection} />}
        </main>
        <PreviewPane playing={playing} onPlaying={setPlaying} />
      </div>
      <VariantSwitcher variant={variant} onCycle={cycle} />
    </div>
  )
}

function TopBar({ showName, onExit }: { showName: string; onExit: () => void }) {
  return (
    <header className="flex h-10 shrink-0 items-center border-b border-zinc-800 bg-[#0c0d10] px-2 text-[10px]">
      <span className="border border-amber-300/30 bg-amber-300/8 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-amber-300">UI study 2</span>
      <span className="ml-3 text-zinc-200">{showName}</span>
      <span className="ml-2 text-zinc-700">Scene detail inside the existing workspace</span>
      <div className="ml-auto flex items-center gap-1"><button type="button" className={`h-7 px-2 text-[9px] ${button}`}>Properties</button><button type="button" className={`h-7 px-2 text-[9px] ${button}`}>View code</button><button type="button" onClick={onExit} className={`grid size-7 place-items-center ${button}`} aria-label="Exit prototype"><X size={13} /></button></div>
    </header>
  )
}

function LibraryRail() {
  return (
    <aside className="hidden w-44 shrink-0 flex-col bg-[#0b0c0f] text-[9px] lg:flex">
      <div className="flex h-9 items-center gap-2 border-b border-zinc-800 px-2 text-zinc-500"><Search size={11} /><span>Filter Shows</span></div>
      <div className="border-b border-zinc-800 px-2 py-2 uppercase tracking-[0.13em] text-zinc-700">Shows</div>
      <button type="button" className="border-l-2 border-amber-300 bg-amber-300/5 px-3 py-2 text-left text-amber-100">Cathedral Signal<div className="mt-1 text-[8px] text-zinc-600">31.0 s · 5 Scenes</div></button>
      <button type="button" className="px-3 py-2 text-left text-zinc-500 hover:bg-zinc-900">Threshold Study</button>
      <button type="button" className="px-3 py-2 text-left text-zinc-500 hover:bg-zinc-900">Garden Loop</button>
      <div className="mt-auto border-t border-zinc-800 p-2 text-[8px] leading-4 text-zinc-700">The library remains global while one Scene is open.</div>
    </aside>
  )
}

function PropertyShelf({ selection, onSelection }: EditorVariantProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_108px]">
      <ScopeHeader detail="Properties stay in a compact horizontal shelf" />
      <Timeline selection={selection} onSelection={onSelection} />
      <section className="grid grid-cols-[170px_repeat(3,minmax(120px,1fr))] border-t border-zinc-800 bg-[#0d0e12] text-[9px]">
        <SelectionIdentity selection={selection} />
        <PropertyGroup title="Timing" rows={[['Starts', '00.180'], ['Ends', '01.400']]} />
        <PropertyGroup title="Placement" rows={[['Opacity', 'Animated · 3'], ['Scale', '82%']]} accent />
        <PropertyGroup title="Effects" rows={[['Stack', 'Scale · Opacity'], ['Entry', 'Continue']]} />
      </section>
    </div>
  )
}

function DockedInspector({ selection, onSelection }: EditorVariantProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <ScopeHeader detail="A narrow Inspector docks beside the local Timeline" />
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_220px]">
        <Timeline selection={selection} onSelection={onSelection} />
        <aside className="min-h-0 overflow-auto border-l border-zinc-800 bg-[#0d0e12] text-[9px]">
          <SelectionIdentity selection={selection} compact />
          <PropertyGroup title="Timing" rows={[['Starts', '00.180'], ['Ends', '01.400']]} />
          <PropertyGroup title="Placement" rows={[['Opacity', 'Animated · 3'], ['Scale', '82%'], ['Rotation', '−8°']]} accent />
          <PropertyGroup title="Effects" rows={[['1', 'Scale'], ['2', 'Opacity']]} />
          <PropertyGroup title="Pattern state" rows={[['Entry', 'Continue'], ['Speed', '0.70×']]} />
        </aside>
      </div>
    </div>
  )
}

function InlineCommandStrip({ selection, onSelection }: EditorVariantProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <ScopeHeader detail="Selection controls appear directly above the active lane" />
      <Timeline selection={selection} onSelection={onSelection} inlineControls />
    </div>
  )
}

interface EditorVariantProps { selection: Selection; onSelection: (selection: Selection) => void }

function ScopeHeader({ detail }: { detail: string }) {
  return (
    <div className="border-b border-amber-300/25 bg-[#0c0d10]">
      <div className="flex h-9 items-center px-2 text-[9px]"><button type="button" className={`flex h-6 items-center gap-1 px-2 ${button}`}><ChevronLeft size={11} /> Show</button><span className="ml-3 text-zinc-600">Cathedral Signal</span><ChevronRight size={10} className="mx-1 text-zinc-700" /><span className="text-amber-200">Neon orchard</span><span className="ml-2 border-l border-zinc-800 pl-2 text-amber-300/60">LOCAL 00:00.480 / 00:02.000</span><span className="ml-auto hidden text-zinc-700 xl:block">{detail}</span></div>
      <GlobalNavigator />
    </div>
  )
}

function GlobalNavigator() {
  return (
    <div className="grid h-7 grid-cols-[88px_minmax(0,1fr)] border-t border-zinc-900 bg-[#090c10] text-[8px]">
      <div className="border-r border-zinc-800 px-2 py-2 uppercase tracking-[0.12em] text-cyan-400/60">Show map</div>
      <div className="relative flex items-center gap-1 px-2"><span className="h-2.5 w-[18%] bg-zinc-800" /><span className="h-3.5 w-[36%] border border-amber-300/70 bg-amber-300/10" /><span className="h-2.5 w-[22%] bg-zinc-800" /><span className="h-2.5 flex-1 bg-zinc-800" /><span className="absolute left-[36%] top-0 h-full w-px bg-cyan-300" /></div>
    </div>
  )
}

function Timeline({ selection, onSelection, inlineControls = false }: EditorVariantProps & { inlineControls?: boolean }) {
  return (
    <section className="min-h-0 overflow-auto bg-[#090a0d]" aria-label="Scene-local Timeline">
      <div className="sticky top-0 z-20 grid h-9 min-w-[660px] grid-cols-[88px_minmax(0,1fr)] border-b border-zinc-800 bg-[#0d0e12] text-[8px] text-zinc-600"><div className="border-r border-zinc-800 px-2 py-3">LOCAL TIME</div><div className="flex items-center justify-between px-2"><span>0</span><span>250 ms</span><span>500 ms</span><span>1 s</span><span>1.5 s</span><span>2 s</span></div></div>
      <div className="relative min-w-[660px]">
        <Track label="All zones"><Clip left="0%" width="3%" label="O" /><Clip left="3%" width="3%" label="P" /><Clip left="6%" width="3%" label="O" selected={selection === 'rapid-cut'} onClick={() => onSelection('rapid-cut')} /><Clip left="9%" width="3.5%" label="P" /><Clip left="12.5%" width="87.5%" label="Neon orchard" selected={selection === 'tail'} onClick={() => onSelection('tail')} /></Track>
        <Track label="Overlay" icon={<Layers3 size={10} />}><button type="button" onClick={() => onSelection('overlay')} className={`absolute inset-y-1 border px-2 text-left text-[8px] ${selection === 'overlay' ? 'border-violet-200 bg-violet-400/25 text-violet-100' : 'border-violet-500/40 bg-violet-500/10 text-violet-300'}`} style={{ left: '9%', width: '61%' }}>Prismatic veil <span className="ml-2 text-violet-300/50">Scale · Opacity</span></button></Track>
        {inlineControls && selection === 'overlay' && <InlineControls />}
        <Track label="Opacity" icon={<SlidersHorizontal size={10} />}><div className="absolute left-[9%] right-[30%] top-1/2 h-px bg-violet-400/50" /><Keyframe left="9%" /><Keyframe left="25%" /><Keyframe left="70%" /></Track>
        <Track label="Left zone"><span className="absolute inset-y-1 left-[12.5%] right-0 border border-amber-500/20 bg-amber-400/5" /></Track>
        <Track label="Center zone"><span className="absolute inset-y-1 left-[12.5%] right-0 border border-amber-500/20 bg-amber-400/5" /></Track>
        <Track label="Right zone"><span className="absolute inset-y-1 left-[12.5%] right-0 border border-amber-500/20 bg-amber-400/5" /></Track>
        <div className="grid h-8 grid-cols-[88px_minmax(0,1fr)] border-b border-zinc-800"><div className="border-r border-zinc-800 px-2 py-2 text-[8px] text-zinc-700">OUTGOING</div><button type="button" className="m-1 w-28 border border-cyan-500/30 bg-cyan-400/8 text-[8px] text-cyan-300">Motion · 320 ms</button></div>
        <span className="pointer-events-none absolute bottom-0 left-[31%] top-0 z-10 w-px bg-amber-200"><span className="absolute -left-1 top-0 size-2 rotate-45 bg-amber-200" /></span>
      </div>
    </section>
  )
}

function Track({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <div className="grid h-12 grid-cols-[88px_minmax(0,1fr)] border-b border-zinc-800"><div className="flex items-center gap-1.5 border-r border-zinc-800 bg-[#0d0e12] px-2 text-[8px] text-zinc-600">{icon}{label}</div><div className="relative bg-[linear-gradient(to_right,transparent_24.8%,#27272a_25%,transparent_25.2%,transparent_49.8%,#27272a_50%,transparent_50.2%,transparent_74.8%,#27272a_75%,transparent_75.2%)]">{children}</div></div>
}

function Clip({ left, width, label, selected = false, onClick }: { left: string; width: string; label: string; selected?: boolean; onClick?: () => void }) {
  return <button type="button" onClick={onClick} className={`absolute inset-y-1 min-w-3 overflow-hidden border text-[8px] ${selected ? 'border-amber-100 bg-amber-300/30 text-amber-100' : 'border-amber-500/30 bg-amber-400/8 text-amber-200'}`} style={{ left, width }}>{label}</button>
}

function Keyframe({ left }: { left: string }) { return <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-violet-100 bg-violet-500" style={{ left }} /> }

function InlineControls() {
  return (
    <div className="grid h-9 grid-cols-[88px_minmax(0,1fr)] border-b border-violet-400/25 bg-[#0d0b12]"><div className="flex items-center border-r border-zinc-800 px-2 text-[8px] text-violet-300">Selection</div><div className="flex items-center gap-1 px-2 text-[8px]"><span className="text-zinc-600">Prismatic veil</span><CompactControl label="Start" value="00.180" /><CompactControl label="End" value="01.400" /><CompactControl label="Opacity" value="Animated" accent /><CompactControl label="Scale" value="82%" /><button type="button" className={`ml-auto h-6 px-2 ${button}`}>More…</button></div></div>
  )
}

function CompactControl({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <button type="button" className={`flex h-6 items-center gap-1 border border-zinc-800 bg-[#111216] px-2 ${accent ? 'text-violet-300' : 'text-zinc-400'}`}><span className="text-zinc-700">{label}</span>{value}<ChevronDown size={9} /></button> }

function SelectionIdentity({ selection, compact = false }: { selection: Selection; compact?: boolean }) {
  const overlay = selection === 'overlay'
  return <div className={`${compact ? 'border-b' : 'border-r'} border-zinc-800 p-3`}><div className="flex items-center gap-2 text-[9px] text-zinc-200">{overlay && <Sparkles size={11} className="text-violet-300" />}{overlay ? 'Prismatic veil' : selection === 'tail' ? 'Neon orchard' : 'Rapid cut 3'}</div><div className="mt-1 text-[8px] text-zinc-600">{overlay ? 'Overlay placement' : 'Base placement'} · All zones</div></div>
}

function PropertyGroup({ title, rows, accent = false }: { title: string; rows: Array<[string, string]>; accent?: boolean }) {
  return <section className="border-r border-zinc-800 p-2 last:border-r-0"><h2 className="mb-1 text-[8px] uppercase tracking-[0.12em] text-zinc-700">{title}</h2>{rows.map(([label, value]) => <button type="button" key={label} className="flex w-full border-t border-zinc-800 py-1.5 text-left"><span className="text-zinc-600">{label}</span><span className={`ml-auto ${accent ? 'text-violet-300' : 'text-zinc-300'}`}>{value}</span></button>)}</section>
}

function PreviewPane({ playing, onPlaying }: { playing: boolean; onPlaying: (playing: boolean) => void }) {
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col bg-[#0b0c0f] min-[880px]:flex" aria-label="Existing Stage preview pane">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#060709]"><div className="absolute inset-0 opacity-80" style={{ background: 'radial-gradient(circle at 40% 48%, #d59a3a 0 2.5%, transparent 3.5%), radial-gradient(circle at 57% 42%, #824fcb 0 4%, transparent 5%), radial-gradient(circle at 30% 58%, #2b9c9f 0 3%, transparent 4%), radial-gradient(ellipse at center, #171322 0, #08090b 65%)' }} /><div className="absolute inset-x-[14%] top-[16%] h-[58%] border border-zinc-800" /><div className="absolute left-3 top-3 text-[8px] uppercase tracking-[0.14em] text-zinc-600">Stage · Scene composite</div></div>
      <div className="border-t border-zinc-800 bg-[#0d0e12] p-2"><div className="flex items-center gap-2"><button type="button" onClick={() => onPlaying(!playing)} className="grid size-7 place-items-center bg-amber-300 text-zinc-950" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</button><span className="text-[9px] text-amber-200">LOCAL 00:00.480</span><span className="ml-auto text-[8px] text-zinc-600">256 px · 2D</span></div><div className="mt-2 h-1 bg-zinc-800"><div className="h-full w-1/4 bg-amber-300" /></div></div>
      <div className="grid grid-cols-2 gap-px border-t border-zinc-800 bg-zinc-800 text-[8px]"><button type="button" className="bg-[#0d0e12] p-2 text-zinc-500">Fit Stage</button><button type="button" className="bg-[#0d0e12] p-2 text-zinc-500">Focus Stage</button></div>
    </aside>
  )
}

function VariantSwitcher({ variant, onCycle }: { variant: Variant; onCycle: (direction: -1 | 1) => void }) {
  const current = VARIANTS.find((candidate) => candidate.id === variant)!
  return <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center border border-zinc-600 bg-zinc-950 p-1 text-[9px] shadow-2xl shadow-black/70"><button type="button" onClick={() => onCycle(-1)} className="grid size-7 place-items-center text-zinc-500 hover:bg-zinc-800 hover:text-white" aria-label="Previous design"><ChevronLeft size={13} /></button><div className="min-w-44 px-3 text-center"><span className="text-amber-300">{current.id}</span> — {current.name}</div><button type="button" onClick={() => onCycle(1)} className="grid size-7 place-items-center text-zinc-500 hover:bg-zinc-800 hover:text-white" aria-label="Next design"><ChevronRight size={13} /></button></div>
}
