import { useEffect, useState, type ReactNode } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Grid2X2,
  Hand,
  Layers3,
  Magnet,
  Map as MapIcon,
  Maximize2,
  MousePointer2,
  PanelBottom,
  Pause,
  Pin,
  Play,
  Search,
  SkipBack,
  SlidersHorizontal,
  Undo2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

// PROTOTYPE: independent Fable and Codex production-density Timeline proposals.
// Switch with ?prototype=timeline-dual&model=fable|codex&scope=show|scene.

type ProposalModel = 'fable' | 'codex'
type TimelineScope = 'show' | 'scene'
type Selection = 'clip' | 'portal' | 'scene' | 'keyframe' | 'multi'

const control = 'border border-zinc-800 bg-[#101217] text-zinc-500 hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-300'

export function ShowTimelineDualModelPrototype() {
  const params = new URLSearchParams(window.location.search)
  const [model, setModelState] = useState<ProposalModel>(params.get('model') === 'fable' ? 'fable' : 'codex')
  const [scope, setScopeState] = useState<TimelineScope>(params.get('scope') === 'scene' ? 'scene' : 'show')
  const [selection, setSelection] = useState<Selection>(scope === 'scene' ? 'keyframe' : 'clip')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [compact, setCompact] = useState(false)
  const [canopyOpen, setCanopyOpen] = useState(true)

  const setParams = (nextModel: ProposalModel, nextScope: TimelineScope) => {
    const url = new URL(window.location.href)
    url.searchParams.set('model', nextModel)
    url.searchParams.set('scope', nextScope)
    window.history.replaceState({}, '', url)
  }
  const setModel = (next: ProposalModel) => {
    setModelState(next)
    setInspectorOpen(true)
    setParams(next, scope)
  }
  const setScope = (next: TimelineScope) => {
    setScopeState(next)
    setSelection(next === 'scene' ? 'keyframe' : 'clip')
    setInspectorOpen(true)
    setParams(model, next)
  }
  const select = (next: Selection) => {
    if (model === 'codex' && selection === next) setInspectorOpen((open) => !open)
    else {
      setSelection(next)
      setInspectorOpen(true)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape' && inspectorOpen) setInspectorOpen(false)
      if (event.key.toLowerCase() === 'i') setInspectorOpen((open) => !open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [inspectorOpen])

  return (
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[#07080a] font-mono text-zinc-300">
      <header className="flex h-[38px] shrink-0 items-center border-b border-zinc-800 bg-[#0b0c0f] px-2 text-[10px]">
        <span className="border border-sky-400/35 bg-sky-400/8 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-sky-300">dual-model study</span>
        <span className="ml-3 text-zinc-200">Atrium Loop</span>
        <span className="ml-2 text-zinc-700">production-density Timeline redline</span>
        <span className="ml-auto border-l border-zinc-800 pl-3 text-[8px] uppercase tracking-[0.12em] text-zinc-600">{model === 'fable' ? 'Fable proposal' : 'Codex proposal'} · {scope === 'show' ? 'Global Show' : 'Scene local'}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <LibraryPane />
        <main className="relative min-w-0 flex-1 border-x border-zinc-800">
          {model === 'codex' ? (
            <CodexProposal
              scope={scope}
              selection={selection}
              inspectorOpen={inspectorOpen}
              playing={playing}
              onPlaying={setPlaying}
              onSelect={select}
              onCloseInspector={() => setInspectorOpen(false)}
              onScope={setScope}
            />
          ) : (
            <FableProposal
              scope={scope}
              selection={selection}
              playing={playing}
              compact={compact}
              canopyOpen={canopyOpen}
              onPlaying={setPlaying}
              onSelect={select}
              onScope={setScope}
              onCompact={setCompact}
              onCanopyOpen={setCanopyOpen}
            />
          )}
        </main>
        <StagePane scope={scope} playing={playing} onPlaying={setPlaying} />
      </div>

      <CompareSwitcher model={model} scope={scope} onModel={setModel} onScope={setScope} />
    </div>
  )
}

function LibraryPane() {
  return (
    <aside className="hidden w-[184px] shrink-0 flex-col bg-[#0a0b0e] text-[9px] min-[980px]:flex">
      <div className="flex h-8 items-center gap-2 border-b border-zinc-800 px-2 text-zinc-600"><Search size={11} /> Filter library</div>
      <div className="border-b border-zinc-800 px-2 py-2 text-[8px] uppercase tracking-[0.14em] text-zinc-700">Shows</div>
      <button type="button" className="border-l-2 border-sky-300 bg-sky-300/5 px-3 py-2 text-left text-sky-100">Atrium Loop<div className="mt-1 text-[8px] text-zinc-600">04:36 · 6 Scenes · 4 zones</div></button>
      {['Cathedral Signal', 'Threshold Study', 'Garden Loop'].map((name) => <button type="button" key={name} className="px-3 py-2 text-left text-zinc-500 hover:bg-zinc-900">{name}</button>)}
      <div className="border-y border-zinc-800 px-2 py-2 text-[8px] uppercase tracking-[0.14em] text-zinc-700">Patterns</div>
      {['NebulaSphere', 'CometLoom', 'PortalBloom', 'RippleField'].map((name) => <button type="button" key={name} className="px-3 py-1.5 text-left text-zinc-600 hover:bg-zinc-900 hover:text-zinc-300">{name}</button>)}
      <div className="mt-auto border-t border-zinc-800 p-2 text-[8px] leading-4 text-zinc-700">Global library remains visible in both Timeline scopes.</div>
    </aside>
  )
}

interface ProposalProps {
  scope: TimelineScope
  selection: Selection
  playing: boolean
  onPlaying: (playing: boolean) => void
  onSelect: (selection: Selection) => void
  onScope: (scope: TimelineScope) => void
}

function CodexProposal({ scope, selection, inspectorOpen, playing, onPlaying, onSelect, onCloseInspector, onScope }: ProposalProps & { inspectorOpen: boolean; onCloseInspector: () => void }) {
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#08090c]">
      <TimelineToolbar model="codex" scope={scope} playing={playing} onPlaying={onPlaying} onScope={onScope} />
      <div className="min-h-0 flex-1 overflow-auto">
        {scope === 'show'
          ? <CodexGlobalTimeline selection={selection} onSelect={onSelect} />
          : <CodexSceneTimeline selection={selection} onSelect={onSelect} />}
      </div>
      <Navigator />
      <CompileBar />
      {inspectorOpen && <QuickInspector scope={scope} selection={selection} onClose={onCloseInspector} />}
    </div>
  )
}

function FableProposal({ scope, selection, playing, compact, canopyOpen, onPlaying, onSelect, onScope, onCompact, onCanopyOpen }: ProposalProps & { compact: boolean; canopyOpen: boolean; onCompact: (compact: boolean) => void; onCanopyOpen: (open: boolean) => void }) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(190px,1fr)_6px_280px_26px] bg-[#08090c]">
      <TimelineToolbar model="fable" scope={scope} playing={playing} compact={compact} onCompact={onCompact} onPlaying={onPlaying} onScope={onScope} />
      <div className="min-h-0 overflow-auto">
        {scope === 'show'
          ? <FableGlobalTimeline selection={selection} compact={compact} canopyOpen={canopyOpen} onSelect={onSelect} onCanopyOpen={onCanopyOpen} />
          : <FableSceneTimeline selection={selection} compact={compact} onSelect={onSelect} />}
        <Navigator />
      </div>
      <div className="cursor-row-resize border-y border-zinc-700 bg-[repeating-linear-gradient(90deg,#30323a_0_2px,transparent_2px_6px)] opacity-50" title="Property dock resize handle" />
      <PropertyDock scope={scope} selection={selection} />
      <CompileBar />
    </div>
  )
}

function TimelineToolbar({ model, scope, playing, compact = false, onCompact, onPlaying, onScope }: { model: ProposalModel; scope: TimelineScope; playing: boolean; compact?: boolean; onCompact?: (compact: boolean) => void; onPlaying: (playing: boolean) => void; onScope: (scope: TimelineScope) => void }) {
  return (
    <div className="shrink-0 border-b border-zinc-800 bg-[#0c0d11]">
      {scope === 'scene' && (
        <div className="flex h-7 items-center border-b border-amber-300/25 px-2 text-[9px]">
          <button type="button" onClick={() => onScope('show')} className={`flex h-5 items-center gap-1 px-1.5 ${control}`}><ChevronLeft size={10} /> Show</button>
          <span className="ml-2 text-zinc-600">Scene 3</span><ChevronRight size={9} className="mx-1 text-zinc-700" /><span className="text-amber-200">Strobe Break · 8.0 s</span>
          <span className="ml-2 text-amber-300/55">LOCAL 00:01.240</span><span className="ml-2 text-zinc-700">show 01:11.240</span>
          <span className="ml-auto text-zinc-600">Loop Scene</span>
        </div>
      )}
      {scope === 'scene' && <ShowMap />}
      <div className="flex h-[34px] items-center gap-1 px-2 text-[9px]">
        <button type="button" className={`grid size-6 place-items-center ${control}`} aria-label="Go to start"><SkipBack size={11} /></button>
        <button type="button" onClick={() => onPlaying(!playing)} className="grid size-6 place-items-center bg-amber-300 text-zinc-950" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}</button>
        <span className="w-[105px] tabular-nums text-zinc-300">{scope === 'show' ? '01:12.4 / 04:36' : '00:01.240 / 08.0'}</span>
        <span className="mx-1 h-4 w-px bg-zinc-800" />
        <button type="button" className={`grid size-6 place-items-center ${control}`} aria-label="Zoom out"><ZoomOut size={11} /></button>
        <button type="button" className={`flex h-6 items-center gap-1 px-2 ${control}`}><Maximize2 size={10} /> Fit</button>
        <button type="button" className={`grid size-6 place-items-center ${control}`} aria-label="Zoom in"><ZoomIn size={11} /></button>
        <button type="button" className={`flex h-6 items-center gap-1 px-2 text-zinc-200 ${control}`}><Magnet size={10} /> Snap</button>
        {model === 'fable' && <button type="button" onClick={() => onCompact?.(!compact)} className={`ml-1 flex h-6 items-center gap-1 px-2 ${control}`}><PanelBottom size={10} /> {compact ? 'Compact 36' : 'Cozy 48'}</button>}
        <div className="ml-auto flex items-center gap-1 text-zinc-600"><MousePointer2 size={10} /><span>Select</span><Hand size={10} className="ml-1" /><span>Space-drag</span><Copy size={10} className="ml-1" /><Undo2 size={10} /></div>
      </div>
    </div>
  )
}

function ShowMap() {
  return (
    <div className="grid h-5 grid-cols-[132px_minmax(0,1fr)] border-b border-zinc-900 bg-[#090a0d] text-[8px]">
      <div className="border-r border-zinc-800 px-2 py-1.5 uppercase tracking-[0.12em] text-sky-400/55">Show map</div>
      <div className="relative flex items-center gap-px px-2"><span className="h-2 w-[16%] bg-zinc-800" /><span className="h-2 w-[22%] bg-zinc-800" /><span className="h-3 w-[9%] border border-amber-300/70 bg-amber-300/15" /><span className="h-2 w-[20%] bg-zinc-800" /><span className="h-2 w-[15%] bg-zinc-800" /><span className="h-2 flex-1 bg-zinc-800" /><span className="absolute left-[42%] h-full w-px bg-sky-300" /></div>
    </div>
  )
}

function CodexGlobalTimeline({ selection, onSelect }: { selection: Selection; onSelect: (selection: Selection) => void }) {
  return (
    <TimelineCanvas gutter={132}>
      <Ruler label="SHOW TIME" ticks={['00:56', '01:04', '01:12', '01:20', '01:28', '01:36']} />
      <Track label="SCENES" height={26}><SceneBlocks selected={selection === 'scene'} onSelect={() => onSelect('scene')} compact /></Track>
      <Track label="TRANSITIONS" icon={<Zap size={10} />} height={24}><TransitionBlocks selected={selection === 'portal'} onSelect={() => onSelect('portal')} /></Track>
      <Track label="LEFT · 840px" icon={<MapIcon size={10} />} height={30}><ClipBlocks selected={selection === 'clip'} onSelect={() => onSelect('clip')} /></Track>
      <Track label="↳ opacity" icon={<SlidersHorizontal size={9} />} height={22} subordinate><Keyframes selected={false} /></Track>
      <Track label="CENTER · 512px" icon={<MapIcon size={10} />} height={30}><ClipBlocks second selected={false} onSelect={() => onSelect('clip')} /></Track>
      <Track label="RIGHT · 640px" icon={<MapIcon size={10} />} height={30}><ClipBlocks third selected={selection === 'multi'} onSelect={() => onSelect('multi')} /></Track>
      <Track label="ENTRY · 96px" icon={<MapIcon size={10} />} height={30}><ClipBlocks fourth selected={false} onSelect={() => onSelect('clip')} /></Track>
      <Playhead left="43%" />
    </TimelineCanvas>
  )
}

function CodexSceneTimeline({ selection, onSelect }: { selection: Selection; onSelect: (selection: Selection) => void }) {
  return (
    <TimelineCanvas gutter={132}>
      <Ruler label="LOCAL TIME" ticks={['0', '125 ms', '250 ms', '500 ms', '1 s', '1.5 s', '2 s']} />
      <Track label="BASE · ALL" height={30}><RapidCuts selected={selection === 'clip'} onSelect={() => onSelect('clip')} /></Track>
      <Track label="OVERLAY" icon={<Layers3 size={10} />} height={30}><OverlayClip selected={selection === 'clip'} onSelect={() => onSelect('clip')} /></Track>
      <Track label="↳ opacity" icon={<SlidersHorizontal size={9} />} height={22} subordinate><Keyframes selected={selection === 'keyframe'} onSelect={() => onSelect('keyframe')} /></Track>
      <Track label="LEFT zone" height={22} subordinate><Coverage /></Track>
      <Track label="CENTER zone" height={22} subordinate><Coverage /></Track>
      <Track label="RIGHT zone" height={22} subordinate><Coverage /></Track>
      <Track label="OUTGOING" icon={<Zap size={10} />} height={24}><button type="button" onClick={() => onSelect('portal')} className="absolute inset-y-1 right-2 w-28 border border-sky-400/35 bg-sky-400/10 text-[8px] text-sky-300">Motion · 320 ms</button></Track>
      <Playhead left="31%" />
    </TimelineCanvas>
  )
}

function FableGlobalTimeline({ selection, compact, canopyOpen, onSelect, onCanopyOpen }: { selection: Selection; compact: boolean; canopyOpen: boolean; onSelect: (selection: Selection) => void; onCanopyOpen: (open: boolean) => void }) {
  const primary = compact ? 36 : 48
  return (
    <TimelineCanvas gutter={160}>
      <Ruler label="" ticks={['01:00', '01:10', '01:20', '01:30', '01:40', '01:50']} />
      <Track label="SCENES" height={24}><SceneBlocks selected={selection === 'scene'} onSelect={() => onSelect('scene')} /></Track>
      <Track label="TRANSITIONS" icon={<Zap size={10} />} height={28}><TransitionBlocks selected={selection === 'portal'} onSelect={() => onSelect('portal')} /></Track>
      <Track label={canopyOpen ? '▾ CANOPY · 840px' : '▸• CANOPY · 840px'} icon={<MapIcon size={10} />} height={primary} onLabelClick={() => onCanopyOpen(!canopyOpen)}><ClipBlocks selected={selection === 'clip'} onSelect={() => onSelect('clip')} badges={!compact} /></Track>
      {canopyOpen && <><Track label="↳ speed" height={22} subordinate><TargetBlocks color="violet" /></Track><Track label="↳ bright" height={22} subordinate><TargetBlocks color="amber" /></Track><Track label="↳ Speed" height={22} subordinate><TargetBlocks color="cyan" /></Track></>}
      <Track label="▸ COLUMNS · 512px" icon={<MapIcon size={10} />} height={primary}><ClipBlocks second selected={false} onSelect={() => onSelect('clip')} badges={!compact} /></Track>
      <Track label="▸ FLOOR · 640px" icon={<MapIcon size={10} />} height={primary}><ClipBlocks third selected={selection === 'multi'} onSelect={() => onSelect('multi')} badges={!compact} /></Track>
      <Track label="▸ ENTRY · 96px" icon={<MapIcon size={10} />} height={primary}><ClipBlocks fourth selected={false} onSelect={() => onSelect('clip')} badges={!compact} /></Track>
      <Playhead left="43%" />
    </TimelineCanvas>
  )
}

function FableSceneTimeline({ selection, compact, onSelect }: { selection: Selection; compact: boolean; onSelect: (selection: Selection) => void }) {
  const primary = compact ? 36 : 48
  return (
    <TimelineCanvas gutter={160}>
      <Ruler label="" ticks={['1.000', '1.200', '1.400', '1.600', '1.800', '2.000']} />
      <Track label="OUTGOING" icon={<Zap size={10} />} height={28}><button type="button" onClick={() => onSelect('portal')} className="absolute inset-y-1 right-1 w-24 border border-sky-400/35 bg-sky-400/10 text-[8px] text-sky-300">≋ xfade 2.0s</button></Track>
      <Track label="▾ CANOPY · 840px" icon={<MapIcon size={10} />} height={primary}><RapidCuts selected={selection === 'clip'} onSelect={() => onSelect('clip')} /></Track>
      <Track label="↳ bright" height={22} subordinate><Keyframes /></Track>
      <Track label="▾ COLUMNS · 512px" icon={<MapIcon size={10} />} height={primary}><ClipBlocks second selected={false} onSelect={() => onSelect('clip')} badges={!compact} /></Track>
      <Track label="↳ fx" height={22} subordinate><EffectSpans /></Track>
      <Track label="⧉ overlay" icon={<Layers3 size={10} />} height={36}><OverlayClip selected={selection === 'clip'} onSelect={() => onSelect('clip')} /></Track>
      <Track label="↳ opacity" height={22} subordinate><Keyframes selected={selection === 'keyframe'} onSelect={() => onSelect('keyframe')} curve /></Track>
      <Track label="▸ FLOOR · 640px" icon={<MapIcon size={10} />} height={primary}><ClipBlocks third selected={false} onSelect={() => onSelect('clip')} badges={!compact} /></Track>
      <Playhead left="43%" />
    </TimelineCanvas>
  )
}

function TimelineCanvas({ gutter, children }: { gutter: number; children: ReactNode }) {
  return <div className="relative min-w-[660px] bg-[#08090c]" style={{ '--timeline-gutter': `${gutter}px` } as React.CSSProperties}>{children}</div>
}

function Ruler({ label, ticks }: { label: string; ticks: string[] }) {
  return <div className="sticky top-0 z-30 grid h-6 border-b border-zinc-800 bg-[#0d0f13] text-[8px] text-zinc-600" style={{ gridTemplateColumns: 'var(--timeline-gutter) minmax(0,1fr)' }}><div className="sticky left-0 z-10 flex items-center border-r border-zinc-800 bg-[#0d0f13] px-2 uppercase tracking-[0.12em]">{label}</div><div className="flex items-center justify-between bg-[linear-gradient(to_right,transparent_16.55%,#20232b_16.65%,transparent_16.75%)] px-2 tabular-nums">{ticks.map((tick) => <span key={tick}>{tick}</span>)}</div></div>
}

function Track({ label, icon, height, subordinate = false, onLabelClick, children }: { label: string; icon?: ReactNode; height: number; subordinate?: boolean; onLabelClick?: () => void; children: ReactNode }) {
  const Label = onLabelClick ? 'button' : 'div'
  return <div className="grid border-b border-zinc-800/80" style={{ height, gridTemplateColumns: 'var(--timeline-gutter) minmax(0,1fr)' }}><Label type={onLabelClick ? 'button' : undefined} onClick={onLabelClick} className={`sticky left-0 z-20 flex items-center gap-1.5 border-r border-zinc-800 bg-[#0c0d11] px-2 text-left ${subordinate ? 'pl-5 text-[8px] text-zinc-600' : 'text-[9px] text-zinc-400'}`}>{icon}{label}</Label><div className="relative overflow-visible bg-[linear-gradient(to_right,transparent_24.85%,#1d2027_25%,transparent_25.15%,transparent_49.85%,#1d2027_50%,transparent_50.15%,transparent_74.85%,#1d2027_75%,transparent_75.15%)]">{children}</div></div>
}

function SceneBlocks({ selected, compact = false, onSelect }: { selected: boolean; compact?: boolean; onSelect: () => void }) {
  const items = [['Pulse Storm', 0, 25], ['Strobe Break', 25, 12], ['Portal Bloom', 37, 27], ['Afterglow', 64, 36]] as const
  return <>{items.map(([name, left, width], index) => <button type="button" key={name} onClick={onSelect} className={`absolute inset-y-0 overflow-hidden border-r border-zinc-700 px-2 text-left text-[8px] ${selected && index === 2 ? 'bg-amber-300/15 text-amber-100 shadow-[inset_0_-2px_#fde68a]' : 'bg-zinc-800/35 text-zinc-400'}`} style={{ left: `${left}%`, width: `${width}%` }}>{name}{!compact && <span className="ml-1 text-zinc-600">◇{index + 1}</span>}</button>)}</>
}

function TransitionBlocks({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return <><span className="absolute inset-y-1 left-[24%] w-[5%] border border-violet-400/35 bg-violet-400/10 text-center text-[8px] text-violet-300">≋</span><span className="absolute inset-y-1 left-[35%] w-[4%] border border-zinc-700 text-center text-[8px] text-zinc-600">✂</span><button type="button" onClick={onSelect} className={`absolute inset-y-1 left-[61%] w-[11%] border text-[8px] ${selected ? 'border-amber-200 bg-amber-300/20 text-amber-100' : 'border-sky-400/35 bg-sky-400/10 text-sky-300'}`}>◎ portal</button><span className="absolute inset-y-1 left-[73%] w-[5%] border border-dashed border-emerald-400/30 text-center text-[8px] text-emerald-300">⇄</span></>
}

function ClipBlocks({ selected, onSelect, second = false, third = false, fourth = false, badges = false }: { selected: boolean; onSelect: () => void; second?: boolean; third?: boolean; fourth?: boolean; badges?: boolean }) {
  const name = second ? 'CometLoom' : third ? 'RippleField' : fourth ? 'PhantomStar' : 'PortalBloom'
  const left = second ? 8 : third ? 37 : fourth ? 65 : 38
  const width = second ? 49 : third ? 46 : fourth ? 30 : 46
  return <button type="button" onClick={onSelect} className={`absolute inset-y-[3px] flex min-w-0 items-center border-l-2 border-sky-400 bg-[#11161d] px-2 text-left ${selected ? 'ring-1 ring-amber-200 text-white' : 'text-zinc-300 hover:bg-[#151b24]'}`} style={{ left: `${left}%`, width: `${width}%` }}><Grid2X2 size={10} className="mr-1 shrink-0 text-zinc-600" /><span className="truncate text-[9px] font-semibold">{name}</span>{badges && <span className="ml-auto hidden text-[8px] text-zinc-600 min-[1120px]:inline">fx3 · ~anim</span>}</button>
}

function RapidCuts({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return <><button type="button" onClick={onSelect} className={`absolute inset-y-[3px] left-0 w-[12%] border border-amber-500/35 bg-amber-400/8 text-[8px] ${selected ? 'ring-1 ring-amber-100' : ''}`}>Strobe A</button>{[12, 16, 20, 24].map((left, i) => <button type="button" key={left} onClick={onSelect} className="absolute inset-y-[3px] w-[4%] min-w-3 border border-amber-500/35 bg-amber-400/12 text-[8px] text-amber-200" style={{ left: `${left}%` }}>{i % 2 ? 'A' : 'B'}</button>)}<button type="button" onClick={onSelect} className="absolute inset-y-[3px] left-[28%] right-0 border border-amber-500/25 bg-amber-400/6 px-2 text-left text-[8px] text-amber-200">Strobe cooldown · fx1</button></>
}

function OverlayClip({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`absolute inset-y-[3px] left-[14%] w-[61%] border border-violet-400/45 border-t-2 bg-violet-400/12 px-2 text-left text-[8px] text-violet-200 ${selected ? 'ring-1 ring-violet-100' : ''}`}>SparkVeil · fx2 · ~anim</button>
}

function Keyframes({ selected = false, onSelect, curve = false }: { selected?: boolean; onSelect?: () => void; curve?: boolean }) {
  return <><span className={`absolute left-[14%] right-[20%] top-1/2 h-px ${curve ? 'bg-[linear-gradient(90deg,#6d28d9,#c4b5fd,#7c3aed)]' : 'bg-violet-400/35'}`} />{[14, 31, 55, 74].map((left, index) => <button type="button" key={left} onClick={onSelect} aria-label={`Keyframe ${index + 1}`} className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-violet-100 bg-violet-500 ${selected && index === 1 ? 'ring-2 ring-amber-200 ring-offset-1 ring-offset-[#08090c]' : ''}`} style={{ left: `${left}%` }} />)}</>
}

function Coverage() { return <span className="absolute inset-y-[6px] left-[28%] right-[8%] border border-amber-400/15 bg-amber-400/5" /> }

function TargetBlocks({ color }: { color: 'violet' | 'amber' | 'cyan' }) {
  const colors = color === 'violet' ? 'bg-violet-400/10 text-violet-200' : color === 'amber' ? 'bg-amber-400/10 text-amber-200' : 'bg-cyan-400/10 text-cyan-200'
  return <><span className={`absolute inset-y-0 left-0 w-[25%] px-2 py-1 text-[8px] ${colors}`}>0.8×</span><span className="absolute inset-y-0 left-[25%] w-[3%] bg-[linear-gradient(135deg,transparent_45%,#a78bfa_46%_54%,transparent_55%)]" /><span className={`absolute inset-y-0 left-[28%] right-0 px-2 py-1 text-[8px] ${colors}`}>1.0×</span></>
}

function EffectSpans() { return <><span className="absolute inset-y-0 left-[8%] w-[32%] border-r border-zinc-700 bg-pink-400/8 px-2 py-1 text-[8px] text-pink-300">Swirl</span><span className="absolute inset-y-0 left-[40%] w-[35%] bg-sky-400/8 px-2 py-1 text-[8px] text-sky-300">Posterize</span></> }

function Playhead({ left }: { left: string }) { return <span className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-amber-200" style={{ left: `calc(var(--timeline-gutter) + (100% - var(--timeline-gutter)) * ${Number.parseFloat(left) / 100})` }}><span className="absolute -left-[4px] top-0 size-2 rotate-45 bg-amber-200" /></span> }

function Navigator() { return <div className="grid h-[22px] shrink-0 grid-cols-[132px_minmax(0,1fr)] border-t border-zinc-800 bg-[#0b0c10] text-[8px]"><span className="border-r border-zinc-800 px-2 py-1.5 text-zinc-700">VIEWPORT</span><span className="relative m-1 border border-zinc-800 bg-zinc-950"><span className="absolute inset-y-0 left-[22%] w-[38%] border-x border-sky-400/60 bg-sky-400/10"><i className="absolute inset-y-0 left-0 w-1 bg-sky-300/70" /><i className="absolute inset-y-0 right-0 w-1 bg-sky-300/70" /></span></span></div> }

function QuickInspector({ scope, selection, onClose }: { scope: TimelineScope; selection: Selection; onClose: () => void }) {
  const title = selection === 'portal' ? 'Portal Transition' : selection === 'keyframe' ? 'Opacity keyframe' : selection === 'multi' ? '3 Pattern clips' : scope === 'scene' ? 'SparkVeil overlay' : 'PortalBloom'
  const icon = selection === 'portal' ? <Zap size={11} /> : selection === 'keyframe' ? <SlidersHorizontal size={11} /> : <Grid2X2 size={11} />
  return (
    <section className="absolute left-[42%] top-[182px] z-50 w-[292px] border border-amber-200/50 bg-[#101116] text-[9px] shadow-2xl shadow-black/80 max-[900px]:left-4" aria-label={`${title} Quick Inspector`}>
      <header className="flex h-[26px] items-center gap-2 border-b border-zinc-700 bg-[#17171c] px-2 text-zinc-100">{icon}<span className="truncate">{title}</span><span className="ml-auto text-[8px] uppercase tracking-[0.1em] text-zinc-600">{selection === 'portal' ? 'Transition' : selection === 'keyframe' ? 'Keyframe' : selection === 'multi' ? 'Selection' : 'Pattern'}</span><button type="button" className="text-zinc-600 hover:text-white" aria-label="Pin Inspector"><Pin size={10} /></button><button type="button" onClick={onClose} className="text-zinc-600 hover:text-white" aria-label="Close Inspector"><X size={10} /></button></header>
      {selection === 'portal' ? <><InspectorRow a="Duration" av="3.0 s" b="Easing" bv="In-out" /><InspectorRow a="Shape" av="Star · 5" b="Feather" bv="0.12 ◆" /><InspectorRow a="Center" av=".50 / .42" b="Scale" bv="1.20" /><InspectorRow a="Motion" av="Grow" b="Spin" bv="0.5/s" /><InspectorWide label="Advanced / cost" value="2 renderers in feather band  ›" /></> : selection === 'keyframe' ? <><InspectorRow a="Time" av="1.240 s" b="Value" bv="62%" /><InspectorRow a="Easing" av="Ease out" b="Keys" bv="5" /><InspectorWide label="Neighbors" value="◂ 1.050    1.410 ▸" /><InspectorWide label="Property" value="Opacity · SparkVeil  ›" /></> : selection === 'multi' ? <><InspectorRow a="Start" av="Mixed" b="Duration" bv="Mixed" /><InspectorRow a="Opacity" av="— mixed" b="Speed" bv="0.70×" /><InspectorWide label="Batch" value="Move · Copy · Delete" /></> : <><InspectorRow a="Start" av="00.180" b="End" bv="01.400" /><InspectorRow a="Entry" av="Continue" b="Speed" bv="0.70×" /><InspectorRow a="Opacity" av="Animated · 3◆" b="Scale" bv="82%" /><InspectorWide label="Effects" value="Scale › Opacity  ›" /><InspectorWide label="Advanced / cost" value="1 renderer · portable  ›" /></>}
    </section>
  )
}

function InspectorRow({ a, av, b, bv }: { a: string; av: string; b: string; bv: string }) { return <div className="grid h-6 grid-cols-[52px_1fr_52px_1fr] items-center border-b border-zinc-800 px-2"><span className="text-zinc-600">{a}</span><button type="button" className="text-left text-zinc-200">{av}</button><span className="text-zinc-600">{b}</span><button type="button" className="text-right text-zinc-200">{bv}</button></div> }
function InspectorWide({ label, value }: { label: string; value: string }) { return <button type="button" className="flex h-6 w-full items-center border-b border-zinc-800 px-2 text-left last:border-0"><span className="text-zinc-600">{label}</span><span className="ml-auto text-zinc-300">{value}</span></button> }

function PropertyDock({ scope, selection }: { scope: TimelineScope; selection: Selection }) {
  const title = selection === 'portal' ? 'Transition · Portal — after Portal Bloom' : selection === 'keyframe' ? 'Keyframe · Opacity — SparkVeil overlay' : selection === 'multi' ? '3 Pattern clips' : scope === 'scene' ? 'Overlay · SparkVeil' : 'Pattern clip · PortalBloom'
  return <section className="min-h-0 overflow-hidden bg-[#0d0e12] text-[9px]" aria-label={`${title} properties`}><header className="flex h-8 items-center gap-2 border-b border-zinc-700 px-2 text-zinc-200">{selection === 'portal' ? <Zap size={11} /> : <Grid2X2 size={11} />}<span>{title}</span><span className="ml-auto text-zinc-600">Reset</span><span className="text-zinc-600">Delete</span><span className="ml-2 text-zinc-700">▁</span><span className="text-amber-300">▄</span><span className="text-zinc-700">█</span></header><div className="flex h-[248px] overflow-x-auto">{selection === 'portal' ? <><DockGroup title="Timing" rows={[['Duration', '3.0 s'], ['Easing', 'Ease in-out'], ['Property ramps', '2 ›']]} /><DockGroup title="Shape" rows={[['Shape', 'Star'], ['Points', '5'], ['Inner', '0.45'], ['Aspect', '1.00']]} /><DockGroup title="Placement" rows={[['Center X', '0.50'], ['Center Y', '0.42'], ['Scale', '1.20'], ['Invert', 'Off']]} /><DockGroup title="Motion" rows={[['Rotation', '0°'], ['Spin', '0.5/s'], ['Reveal', 'Grow']]} /><DockGroup title="Edge" rows={[['Feather', '0.12 ◆'], ['Policy', 'Blend']]} /><DockGroup title="Cost" rows={[['Renderers', '2 in band'], ['Estimate', '1.4×']]} /></> : selection === 'keyframe' ? <><DockGroup title="Keyframe" rows={[['Time', '1.240 s'], ['Value', '62%'], ['Easing', 'Ease out']]} /><DockGroup title="Neighbors" rows={[['Previous', '1.050'], ['Next', '1.410']]} /><DockGroup title="Property" rows={[['Name', 'Opacity'], ['Keys', '5'], ['Curve editor', 'Open ›']]} /></> : <><DockGroup title="Identity & timing" rows={[['Pattern', 'PortalBloom'], ['Start', '01:08'], ['Duration', '28 s'], ['Entry', 'Continue']]} /><DockGroup title="Adaptations" rows={[['Speed', '0.70×'], ['Brightness', '80%'], ['Opacity', 'Animated']]} /><DockGroup title="Effects" rows={[['1', 'Swirl'], ['2', 'Posterize'], ['Add Effect', '+']]} /><DockGroup title="Advanced / cost" rows={[['Renderer', '1'], ['Compatibility', 'Portable'], ['Restart', 'Off']]} /></>}</div></section>
}

function DockGroup({ title, rows }: { title: string; rows: Array<[string, string]> }) { return <section className="w-[236px] shrink-0 border-r border-zinc-800 p-2"><h2 className="mb-1 text-[8px] uppercase tracking-[0.14em] text-zinc-700">{title}</h2>{rows.map(([label, value]) => <button type="button" key={label} className="grid h-7 w-full grid-cols-[92px_minmax(0,1fr)] items-center border-t border-zinc-800 text-left"><span className="text-zinc-600">{label}</span><span className="truncate text-right text-zinc-200">{value}</span></button>)}</section> }

function CompileBar() { return <div className="flex h-[26px] shrink-0 items-center gap-4 border-t border-zinc-800 bg-[#0b0c0f] px-2 text-[8px] text-zinc-600"><span className="text-emerald-400">● compiled</span><span>9.4 KB / ~16 KB</span><span>1 renderer/px steady</span><span className="text-amber-300">portal band: 2 renderers</span><span className="ml-auto text-zinc-400">Controller ready</span></div> }

function StagePane({ scope, playing, onPlaying }: { scope: TimelineScope; playing: boolean; onPlaying: (playing: boolean) => void }) {
  return <aside className="hidden w-[240px] shrink-0 flex-col bg-[#0a0b0e] min-[880px]:flex min-[1180px]:w-[304px]" aria-label="Existing Stage"><div className="relative min-h-0 flex-1 overflow-hidden bg-[#050608]"><div className="absolute inset-0 opacity-90" style={{ background: 'radial-gradient(circle at 35% 42%, #d39a3b 0 2%, transparent 3%), radial-gradient(circle at 62% 38%, #7443ba 0 4%, transparent 5%), radial-gradient(circle at 48% 64%, #268f93 0 3%, transparent 4%), radial-gradient(ellipse at center, #15121f 0, #07080a 68%)' }} /><div className="absolute inset-x-[12%] top-[14%] h-[62%] border border-zinc-800"><span className="absolute left-0 top-1/3 h-px w-full bg-zinc-800/70" /><span className="absolute left-1/2 top-0 h-full w-px bg-zinc-800/70" /></div><div className="absolute left-3 top-3 text-[8px] uppercase tracking-[0.14em] text-zinc-600">Stage · {scope === 'show' ? 'Show output' : 'Scene composite'}</div><div className="absolute bottom-3 right-3 text-[8px] text-zinc-700">2,088 px · 2D</div></div><div className="border-t border-zinc-800 bg-[#0d0e12] p-2"><div className="flex items-center gap-2"><button type="button" onClick={() => onPlaying(!playing)} className="grid size-7 place-items-center bg-amber-300 text-zinc-950" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</button><span className="text-[9px] tabular-nums text-amber-200">{scope === 'show' ? '01:12.4' : 'LOCAL 01.240'}</span><span className="ml-auto text-[8px] text-zinc-600">Fit Stage</span></div><div className="mt-2 h-1 bg-zinc-800"><div className="h-full w-[43%] bg-amber-300" /></div></div></aside>
}

function CompareSwitcher({ model, scope, onModel, onScope }: { model: ProposalModel; scope: TimelineScope; onModel: (model: ProposalModel) => void; onScope: (scope: TimelineScope) => void }) {
  return <div className="fixed bottom-3 left-1/2 z-[80] flex -translate-x-1/2 items-center border border-zinc-600 bg-zinc-950 p-1 text-[9px] shadow-2xl shadow-black/80"><span className="px-2 text-[8px] uppercase tracking-[0.12em] text-zinc-700">Model</span>{(['codex', 'fable'] as const).map((item) => <button type="button" key={item} onClick={() => onModel(item)} className={`h-7 px-3 capitalize ${model === item ? 'bg-amber-300 text-zinc-950' : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'}`}>{item}</button>)}<span className="mx-1 h-5 w-px bg-zinc-700" /><span className="px-2 text-[8px] uppercase tracking-[0.12em] text-zinc-700">Scope</span>{(['show', 'scene'] as const).map((item) => <button type="button" key={item} onClick={() => onScope(item)} className={`h-7 px-3 capitalize ${scope === item ? 'bg-sky-300 text-zinc-950' : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'}`}>{item === 'show' ? 'Global Show' : 'Scene local'}</button>)}</div>
}
