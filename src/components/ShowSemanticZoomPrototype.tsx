import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Hand,
  Magnet,
  Map as MapIcon,
  Maximize2,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Search,
  SkipBack,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

// PROTOTYPE: Three semantic-zoom behaviors on the production-density Show frame.
// Switch with ?prototype=timeline-dual&study=semantic-zoom&variant=A|B|C.

type Variant = 'A' | 'B' | 'C'
type Fixture = 'atrium' | 'cathedral'
type Selection = 'scene' | 'xray' | 'transition' | 'placement' | 'zone' | null
type ZoomPhase = 'summary' | 'xray' | 'detail'

const variants: Array<{ key: Variant; name: string; description: string }> = [
  { key: 'A', name: 'Explicit X-ray', description: 'Zoom changes geometry; disclosure controls detail.' },
  { key: 'B', name: 'Progressive X-ray', description: 'The X-ray reveals more information as it becomes legible.' },
  { key: 'C', name: 'Focus bridge', description: 'High zoom approaches local time without leaving Global Show.' },
]

const scenes = [
  ['Pulse Storm', 18],
  ['Strobe Break', 14],
  ['Portal Bloom', 26],
  ['Afterglow', 16],
  ['Night Drive', 16],
  ['Blackout', 10],
] as const

const control = 'border border-[#35404b] bg-[#11171d] text-[#b4bcc6] hover:border-[#657281] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e7b952]'

export function ShowSemanticZoomPrototype() {
  const params = new URLSearchParams(window.location.search)
  const initialVariant = params.get('variant')
  const initialZoom = Number(params.get('zoom'))
  const [variant, setVariantState] = useState<Variant>(initialVariant === 'B' || initialVariant === 'C' ? initialVariant : 'A')
  const [fixture, setFixtureState] = useState<Fixture>(params.get('fixture') === 'cathedral' ? 'cathedral' : 'atrium')
  const [zoom, setZoomState] = useState(Number.isFinite(initialZoom) ? Math.max(1, Math.min(8, initialZoom)) : 2.4)
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [xrayOpen, setXrayOpen] = useState(true)
  const [selection, setSelection] = useState<Selection>(null)
  const [selectedZone, setSelectedZone] = useState('Canopy')
  const timelineViewportRef = useRef<HTMLDivElement>(null)

  const phase: ZoomPhase = zoom < 2.5 ? 'summary' : zoom < 5 ? 'xray' : 'detail'
  const currentVariant = variants.find((item) => item.key === variant) ?? variants[0]

  const writeParams = (next: { variant?: Variant; fixture?: Fixture; zoom?: number }) => {
    const url = new URL(window.location.href)
    url.searchParams.set('prototype', 'timeline-dual')
    url.searchParams.set('study', 'semantic-zoom')
    url.searchParams.set('variant', next.variant ?? variant)
    url.searchParams.set('fixture', next.fixture ?? fixture)
    url.searchParams.set('zoom', (next.zoom ?? zoom).toFixed(1))
    window.history.replaceState({}, '', url)
  }

  const setVariant = (next: Variant) => {
    setVariantState(next)
    setSelection(null)
    setXrayOpen(true)
    writeParams({ variant: next })
  }

  const setFixture = (next: Fixture) => {
    setFixtureState(next)
    writeParams({ fixture: next })
  }

  const setZoom = (next: number) => {
    const clamped = Math.max(1, Math.min(8, next))
    setZoomState(clamped)
    writeParams({ zoom: clamped })
  }

  const select = (next: Exclude<Selection, null>) => {
    setSelection((current) => current === next ? null : next)
  }

  const selectZone = (zone: string) => {
    if (selection === 'zone' && selectedZone === zone) {
      setSelection(null)
      return
    }
    setSelectedZone(zone)
    setSelection('zone')
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape') setSelection(null)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const index = variants.findIndex((item) => item.key === variant)
        const delta = event.key === 'ArrowLeft' ? -1 : 1
        setVariant(variants[(index + delta + variants.length) % variants.length].key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useLayoutEffect(() => {
    const viewport = timelineViewportRef.current
    const scene = viewport?.querySelector<HTMLElement>('[data-selected-scene="true"]')
    if (!viewport || !scene) return
    const viewportBox = viewport.getBoundingClientRect()
    const sceneBox = scene.getBoundingClientRect()
    const centerDrift = (sceneBox.left + sceneBox.width / 2) - (viewportBox.left + viewportBox.width / 2)
    viewport.scrollLeft += centerDrift
  }, [zoom, variant, fixture])

  return (
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[#090c10] font-sans text-[#e7eaf0]">
      <header className="flex h-10 shrink-0 items-center border-b border-[#28313a] bg-[#0d1116] px-3 text-[11px]">
        <span className="border border-[#67c7d6]/50 bg-[#67c7d6]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9addE4]">Semantic zoom study</span>
        <strong className="ml-3 font-medium">{fixture === 'atrium' ? 'Atrium Loop' : 'Cathedral Signal'}</strong>
        <span className="ml-2 text-[#aab2bc]">Strobe Break selected</span>
        <span className="ml-auto text-[10px] text-[#aab2bc]">{variant} · {currentVariant.name}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        {libraryOpen ? <StudyLibrary fixture={fixture} onCollapse={() => setLibraryOpen(false)} /> : (
          <button type="button" onClick={() => setLibraryOpen(true)} className="hidden w-7 shrink-0 flex-col items-center border-r border-[#28313a] bg-[#0d1116] pt-2 text-[#aab2bc] hover:text-white min-[900px]:flex" aria-label="Restore library"><PanelLeftOpen size={14} /><span className="mt-3 [writing-mode:vertical-rl] text-[10px] uppercase tracking-[0.12em]">Library</span></button>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col border-r border-[#28313a] bg-[#0b0f13]">
          <div className="flex h-7 shrink-0 items-center border-b border-[#28313a] bg-[#0e141a] px-2 text-[10px]">
            <strong className="text-[#d7dce2]">{currentVariant.name}</strong>
            <span className="ml-2 text-[#9ea7b2]">{currentVariant.description}</span>
            <span className="ml-auto font-mono text-[#f1cb7b]">{variant === 'A' ? 'GLOBAL · GEOMETRY ONLY' : phase === 'summary' ? 'GLOBAL SUMMARY' : phase === 'xray' ? 'GLOBAL X-RAY' : variant === 'C' ? 'GLOBAL · FOCUS BRIDGE' : 'GLOBAL · DETAIL'}</span>
          </div>

          <ZoomToolbar variant={variant} zoom={zoom} phase={phase} playing={playing} onPlaying={setPlaying} onZoom={setZoom} />

          <div ref={timelineViewportRef} data-testid="timeline-viewport" className="min-h-0 flex-1 overflow-auto">
            <SemanticTimeline variant={variant} fixture={fixture} zoom={zoom} phase={phase} xrayOpen={xrayOpen} selection={selection} onXrayOpen={setXrayOpen} onSelect={select} onZoneSelect={selectZone} />
          </div>

          <ViewportNavigator zoom={zoom} />
          <div className="flex h-7 shrink-0 items-center border-t border-[#28313a] bg-[#10151b] px-2 text-[10px] text-[#aab2bc]"><span className="size-1.5 rounded-full bg-[#4fc4b0]" /><span className="ml-2">Global time retained · internal beats are snap references</span><span className="ml-auto">Zoom {zoom.toFixed(1)}×</span></div>

          {selection && <StudyEntityPanel selection={selection} zoneName={selectedZone} fixture={fixture} onClose={() => setSelection(null)} />}
        </main>

        <StudyStage playing={playing} onPlaying={setPlaying} />
      </div>

      <StudySwitcher variant={variant} fixture={fixture} onVariant={setVariant} onFixture={setFixture} />
    </div>
  )
}

function StudyLibrary({ fixture, onCollapse }: { fixture: Fixture; onCollapse: () => void }) {
  return (
    <aside className="hidden w-[188px] shrink-0 flex-col border-r border-[#28313a] bg-[#0d1116] text-[11px] min-[900px]:flex">
      <div className="flex h-9 items-center gap-2 border-b border-[#28313a] px-2 text-[#aab2bc]"><Search size={13} /><span>Filter library</span><button type="button" onClick={onCollapse} className="ml-auto grid size-6 place-items-center hover:text-white" aria-label="Collapse library"><PanelLeftClose size={13} /></button></div>
      <SectionLabel>Shows</SectionLabel>
      {['Atrium Loop', 'Cathedral Signal', 'Threshold Study', 'Garden Loop'].map((name) => {
        const active = name.toLowerCase().startsWith(fixture)
        return <button type="button" key={name} className={`border-l-2 px-3 py-2 text-left ${active ? 'border-[#67c7d6] bg-[#67c7d6]/8 text-white' : 'border-transparent text-[#aab2bc] hover:bg-white/5 hover:text-white'}`}>{name}{active && <span className="mt-0.5 block font-mono text-[10px] text-[#aab2bc]">{fixture === 'atrium' ? '04:36 · 6 Scenes · 4 zones' : '00:42 · 5 Scenes · 12 zones'}</span>}</button>
      })}
      <SectionLabel>Patterns</SectionLabel>
      {['NebulaSphere', 'CometLoom', 'PortalBloom', 'RippleField', 'SparkVeil'].map((name) => <button type="button" key={name} className="px-3 py-1.5 text-left text-[#aab2bc] hover:bg-white/5 hover:text-white">{name}</button>)}
      <p className="mt-auto border-t border-[#28313a] p-2 text-[10px] leading-[1.4] text-[#aab2bc]">Shared library behavior. Shows simply benefit most from reclaiming its width.</p>
    </aside>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="border-y border-[#28313a] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#aab2bc]">{children}</div>
}

function ZoomToolbar({ variant, zoom, phase, playing, onPlaying, onZoom }: { variant: Variant; zoom: number; phase: ZoomPhase; playing: boolean; onPlaying: (playing: boolean) => void; onZoom: (zoom: number) => void }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[#28313a] bg-[#10151b] px-2 text-[10px]">
      <button type="button" className={`grid size-7 place-items-center ${control}`} aria-label="Go to start"><SkipBack size={13} /></button>
      <button type="button" onClick={() => onPlaying(!playing)} className="grid size-7 place-items-center bg-[#e7b952] text-[#101419]" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button>
      <span className="ml-1 w-[126px] font-mono text-[11px]">01:12.4 / 04:36</span>
      <span className="mx-1 h-4 w-px bg-[#303944]" />
      <button type="button" onClick={() => onZoom(zoom - 0.5)} className={`grid size-7 place-items-center ${control}`} aria-label="Zoom out"><ZoomOut size={13} /></button>
      <label className="flex items-center gap-2"><span className="sr-only">Timeline zoom</span><input aria-label="Timeline zoom" type="range" min="1" max="8" step="0.1" value={zoom} onChange={(event) => onZoom(Number(event.target.value))} className="w-36 accent-[#67c7d6]" /></label>
      <button type="button" onClick={() => onZoom(zoom + 0.5)} className={`grid size-7 place-items-center ${control}`} aria-label="Zoom in"><ZoomIn size={13} /></button>
      <button type="button" onClick={() => onZoom(1)} className={`flex h-7 items-center gap-1 px-2 ${control}`}><Maximize2 size={12} /> Fit</button>
      <span className="ml-1 min-w-16 font-mono text-[#9addE4]">{zoom.toFixed(1)}×</span>
      <span className="border-l border-[#303944] pl-2 text-[#aab2bc]">{variant === 'A' ? 'Same X-ray · beats spread with scale' : phase === 'summary' ? 'Scene compact' : phase === 'xray' ? 'Scene readable' : 'Scene dominates viewport'}</span>
      <div className="ml-auto flex items-center gap-2 text-[#aab2bc]"><MousePointer2 size={12} /><span>Select</span><Hand size={12} /><span>Space-drag</span><Magnet size={12} /><span>Snap</span></div>
    </div>
  )
}

function SemanticTimeline({ variant, fixture, zoom, phase, xrayOpen, selection, onXrayOpen, onSelect, onZoneSelect }: { variant: Variant; fixture: Fixture; zoom: number; phase: ZoomPhase; xrayOpen: boolean; selection: Selection; onXrayOpen: (open: boolean) => void; onSelect: (selection: Exclude<Selection, null>) => void; onZoneSelect: (zone: string) => void }) {
  const width = Math.round(760 * zoom)
  const focusBridge = variant === 'C' && phase === 'detail' && xrayOpen
  const [expandedZones, setExpandedZones] = useState<number[]>([0])
  const zones = fixture === 'cathedral'
    ? ['Canopy', 'Columns', 'Floor', 'Entry', 'Arch L', 'Arch R', 'Gallery', 'Nave', 'Halo', 'Portal', 'West', 'East']
    : ['Canopy', 'Columns', 'Floor', 'Entry']

  return (
    <div className="relative min-w-full bg-[#0b0f13]" style={{ width, '--timeline-gutter': '136px' } as CSSProperties}>
      <Ruler label="Show time" ticks={zoom >= 5 ? ['1:08', '1:10', '1:12', '1:14', '1:16', '1:18', '1:20'] : ['0:56', '1:04', '1:12', '1:20', '1:28', '1:36', '1:44']} />
      <Track label="Scenes" height={30} sticky>
        <SceneBand selected={selection === 'scene'} open={xrayOpen} onOpen={() => onXrayOpen(!xrayOpen)} onSelect={() => onSelect('scene')} />
      </Track>
      {xrayOpen && !focusBridge && <SceneXray variant={variant} phase={phase} selected={selection === 'xray'} onSelect={() => onSelect('xray')} />}
      {focusBridge && <FocusBridge selected={selection === 'xray'} onSelect={() => onSelect('xray')} />}
      <Track label="Transitions" icon={<Zap size={12} />} height={26} sticky><TransitionBand selected={selection === 'transition'} onSelect={() => onSelect('transition')} /></Track>
      <div className={focusBridge ? 'opacity-55' : ''}>
        {zones.map((zone, index) => (
          <div key={zone}>
            <Track label={<ZoneLabel name={zone} pixelCount={96 + index * 64} expanded={expandedZones.includes(index)} onToggle={() => setExpandedZones((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} onSelect={() => onZoneSelect(zone)} />} icon={<MapIcon size={12} />} height={30}>
              <PlacementBand fixture={fixture} zoneIndex={index} selected={selection === 'placement' && index === 0} onSelect={() => onSelect('placement')} />
            </Track>
            {expandedZones.includes(index) && fixture === 'atrium' && index === 0 && <>
              <Track label="↳ Effect activity" height={22} subordinate><EffectBand /></Track>
              <AutomationLane label="↳ Brightness" amplified />
              <AutomationLane label="↳ Speed" />
            </>}
            {expandedZones.includes(index) && (fixture === 'cathedral' || index !== 0) && <ZoneActivityLane zoneIndex={index} />}
          </div>
        ))}
      </div>
      <Playhead left={25} />
    </div>
  )
}

function Ruler({ label, ticks }: { label: string; ticks: string[] }) {
  return <div className="sticky top-0 z-40 grid h-7 border-b border-[#303944] bg-[#11171d] font-mono text-[10px] text-[#aab2bc]" style={{ gridTemplateColumns: 'var(--timeline-gutter) minmax(0,1fr)' }}><div className="sticky left-0 z-10 flex items-center border-r border-[#303944] bg-[#11171d] px-2 font-semibold uppercase tracking-[0.08em]">{label}</div><div className="flex items-center justify-between bg-[linear-gradient(to_right,transparent_24.8%,#29313a_25%,transparent_25.2%,transparent_49.8%,#29313a_50%,transparent_50.2%,transparent_74.8%,#29313a_75%,transparent_75.2%)] px-2">{ticks.map((tick) => <span key={tick}>{tick}</span>)}</div></div>
}

function Track({ label, icon, height, subordinate = false, sticky = false, children }: { label: ReactNode; icon?: ReactNode; height: number; subordinate?: boolean; sticky?: boolean; children: ReactNode }) {
  return <div className={`grid border-b border-[#273039] ${sticky ? 'sticky z-30' : ''}`} style={{ height, top: sticky ? 28 : undefined, gridTemplateColumns: 'var(--timeline-gutter) minmax(0,1fr)' }}><div className={`sticky left-0 z-20 flex items-center gap-1.5 border-r border-[#303944] bg-[#10151b] px-2 ${subordinate ? 'pl-5 text-[10px] text-[#aab2bc]' : 'text-[11px] font-medium text-[#ced4db]'}`}>{icon}{label}</div><div className="relative overflow-visible bg-[linear-gradient(to_right,transparent_24.85%,#242c34_25%,transparent_25.15%,transparent_49.85%,#242c34_50%,transparent_50.15%,transparent_74.85%,#242c34_75%,transparent_75.15%)]">{children}</div></div>
}

function ZoneLabel({ name, pixelCount, expanded, onToggle, onSelect }: { name: string; pixelCount: number; expanded: boolean; onToggle: () => void; onSelect: () => void }) {
  return <span className="-mx-2 flex h-full min-w-0 flex-1 items-center"><button type="button" onClick={onToggle} className="grid h-full w-6 shrink-0 place-items-center text-[#aab2bc] hover:bg-white/8 hover:text-white" aria-label={expanded ? `Collapse ${name} lanes` : `Expand ${name} lanes`}><ChevronDown size={11} className={expanded ? '' : '-rotate-90'} /></button><button type="button" onClick={onSelect} className="min-w-0 flex-1 truncate pr-2 text-left hover:text-white" aria-label={`Select Zone ${name}`}>{name} · {pixelCount}px</button></span>
}

function ZoneActivityLane({ zoneIndex }: { zoneIndex: number }) {
  return <Track label="↳ activity summary" height={18} subordinate><span className="absolute inset-y-1 left-[18%] w-[14%] bg-[repeating-linear-gradient(90deg,rgba(79,196,176,.65)_0_4px,transparent_4px_13px)]" /><span className="absolute inset-y-1 left-[47%] w-[24%] bg-[repeating-linear-gradient(90deg,rgba(167,139,250,.55)_0_2px,transparent_2px_11px)]" /><span className="absolute right-2 top-0.5 text-[10px] text-[#aab2bc]">{4 + zoneIndex} placements · {zoneIndex % 3} animated</span></Track>
}

function SceneBand({ selected, open, onOpen, onSelect }: { selected: boolean; open: boolean; onOpen: () => void; onSelect: () => void }) {
  return <div className="absolute inset-0 flex">{scenes.map(([name, width], index) => <div key={name} data-selected-scene={index === 1 ? 'true' : undefined} style={{ width: `${width}%` }} className={`relative overflow-hidden border-r border-[#3a444f] ${index === 1 ? 'bg-[#e7b952]/12 text-white shadow-[inset_0_-2px_0_#e7b952]' : selected ? 'bg-[#19212a] text-[#d4dae1]' : 'bg-[#151b22] text-[#c8cdd5]'}`}>
    <button type="button" onClick={onSelect} className={`absolute inset-0 truncate px-1.5 text-left text-[10px] ${index === 1 ? 'pl-5' : ''}`} aria-label={`Select Scene ${name}`}>{name}</button>
    {index === 1 && <button type="button" onClick={onOpen} className="absolute inset-y-0 left-0 z-10 grid w-5 place-items-start pt-1 hover:bg-white/8" aria-label={open ? 'Collapse Scene X-ray' : 'Expand Scene X-ray'}><ChevronDown size={11} className={open ? '' : '-rotate-90'} /></button>}
    <span className="pointer-events-none absolute inset-x-1 bottom-1 flex h-1 gap-px" aria-label="Scene activity summary">{Array.from({ length: Math.max(2, index + 2) }, (_, tick) => <i key={tick} className={tick % 2 ? 'flex-1 bg-[#a78bfa]/60' : 'flex-1 bg-[#4fc4b0]/60'} />)}</span>
  </div>)}</div>
}

function SceneXray({ variant, phase, selected, onSelect }: { variant: Variant; phase: ZoomPhase; selected: boolean; onSelect: () => void }) {
  const progressive = variant === 'B'
  const height = progressive ? phase === 'summary' ? 28 : phase === 'xray' ? 40 : 64 : 32
  const label = progressive && phase === 'detail' ? 'Scene X-ray · detailed' : 'Scene X-ray · read-only'
  return (
    <Track label={label} height={height} subordinate>
      <button type="button" onClick={onSelect} className={`absolute inset-y-1 left-[18%] w-[14%] overflow-hidden border-x text-left ${selected ? 'border-[#e7b952] bg-[#e7b952]/12' : 'border-[#e7b952]/40 bg-[#e7b952]/5'}`}>
        {variant === 'A' ? <FixedXray /> : progressive && phase === 'detail' ? <DetailedXray /> : <CompactXray labeled={progressive && phase !== 'summary'} />}
      </button>
      <span className="absolute left-[32.5%] top-1 whitespace-nowrap px-1 text-[10px] text-[#aab2bc]">{progressive ? phase === 'summary' ? 'activity silhouette' : phase === 'xray' ? 'beats · Effects · automation' : 'named beats become snap guides' : 'same signal · zoom spreads snap targets · Open Scene to edit'}</span>
    </Track>
  )
}

function FixedXray() {
  return <div className="grid h-full grid-rows-3 text-[10px] leading-none"><span className="relative border-b border-[#303944] pl-1 text-[#bec5ce]">cuts<i className="absolute inset-x-[18%] bottom-1 h-px bg-[repeating-linear-gradient(90deg,#9ca3af_0_2px,transparent_2px_16px)]" /></span><span className="relative border-b border-[#303944] pl-1 text-[#8fe1d3]">FX<i className="absolute bottom-1 left-[22%] h-1 w-[52%] bg-[#4fc4b0]/70" /></span><span className="relative pl-1 text-[#c9b8f6]">keys<i className="absolute bottom-1 left-[12%] h-1 w-[75%] bg-[repeating-linear-gradient(90deg,#a78bfa_0_3px,transparent_3px_22px)]" /></span></div>
}

function CompactXray({ labeled }: { labeled: boolean }) {
  return <><span className="absolute inset-x-1 top-[18%] h-1.5 bg-[repeating-linear-gradient(90deg,#9ca3af_0_2px,transparent_2px_7px)]" /><span className="absolute inset-x-1 top-[48%] h-1.5 bg-[repeating-linear-gradient(90deg,#4fc4b0_0_5px,transparent_5px_11px)]" /><span className="absolute inset-x-1 bottom-[14%] h-1 bg-[repeating-linear-gradient(90deg,#a78bfa_0_2px,transparent_2px_8px)]" />{labeled && <span className="absolute right-1 top-0.5 bg-[#0b0f13]/90 px-1 text-[10px] text-[#d6dbe1]">8.0 s</span>}</>
}

function DetailedXray() {
  return <div className="grid h-full grid-rows-3 text-[10px]"><span className="relative border-b border-[#303944] pl-1 text-[#bec5ce]">cuts<i className="absolute inset-x-[18%] bottom-1 h-1 bg-[repeating-linear-gradient(90deg,#9ca3af_0_2px,transparent_2px_9px)]" /></span><span className="relative border-b border-[#303944] pl-1 text-[#8fe1d3]">FX<i className="absolute bottom-1 left-[22%] h-1 w-[52%] bg-[#4fc4b0]/70" /></span><span className="relative pl-1 text-[#c9b8f6]">opacity<i className="absolute bottom-1 left-[12%] h-1 w-[75%] bg-[repeating-linear-gradient(90deg,#a78bfa_0_3px,transparent_3px_13px)]" /></span></div>
}

function FocusBridge({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return (
    <Track label="Scene focus · local lens" height={164} subordinate>
      <button type="button" onClick={onSelect} className={`absolute inset-y-1 left-[18%] w-[14%] min-w-[430px] overflow-hidden border text-left ${selected ? 'border-[#e7b952] bg-[#11171d]' : 'border-[#536170] bg-[#0e141a]'}`}>
        <div className="flex h-7 items-center border-b border-[#3a444f] px-2 text-[10px]"><strong className="text-[#f1cb7b]">Strobe Break · local 0–8 s</strong><span className="ml-2 text-[#aab2bc]">global 1:10–1:18</span><span className="ml-auto border border-[#536170] px-2 py-1 text-white">Open Scene</span></div>
        <div className="grid h-6 grid-cols-9 border-b border-[#303944] px-2 font-mono text-[10px] text-[#aab2bc]">{['0', '1', '2', '3', '4', '5', '6', '7', '8'].map((tick) => <span key={tick}>{tick}</span>)}</div>
        <FocusRow label="bounds" color="#e7b952"><span className="absolute inset-y-1 left-0 w-[18%] border border-[#e7b952]/50 bg-[#e7b952]/10 px-1">in · Wipe</span><span className="absolute inset-y-1 right-0 w-[25%] border border-[#e7b952]/50 bg-[#e7b952]/10 px-1">out · Fade</span></FocusRow>
        <FocusRow label="canopy" color="#c8cdd5"><span className="absolute inset-y-1 left-0 w-[14%] bg-[#26313c] px-1">StrobeA</span><span className="absolute inset-y-1 left-[14%] w-[5%] bg-[#344354]" /><span className="absolute inset-y-1 left-[19%] w-[7%] bg-[#26313c]" /><span className="absolute inset-y-1 left-[26%] right-0 bg-[#26313c] px-1">StrobeCooldown</span></FocusRow>
        <FocusRow label="FX" color="#4fc4b0"><span className="absolute inset-y-1 left-[20%] w-[28%] border border-[#4fc4b0]/60 bg-[#4fc4b0]/12 px-1 text-[#9ae5d8]">Swirl</span><span className="absolute inset-y-1 left-[48%] w-[35%] border border-[#4fc4b0]/60 bg-[#4fc4b0]/12 px-1 text-[#9ae5d8]">Posterize</span></FocusRow>
        <FocusRow label="bright" color="#a78bfa"><MiniCurve /></FocusRow>
      </button>
      <span className="absolute left-[32.5%] top-2 whitespace-nowrap px-1 text-[10px] text-[#f1cb7b]">Global frame retained · local controls embedded</span>
    </Track>
  )
}

function FocusRow({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  return <div className="grid h-[25px] grid-cols-[48px_minmax(0,1fr)] border-b border-[#273039] text-[10px]"><span className="flex items-center border-r border-[#303944] px-1" style={{ color }}>{label}</span><span className="relative">{children}</span></div>
}

function TransitionBand({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return <><button type="button" onClick={onSelect} className={`absolute inset-y-1 left-[15%] w-[7%] border px-1 font-mono text-[10px] ${selected ? 'border-[#e7b952] bg-[#e7b952]/20 text-[#f6dc9f]' : 'border-[#e7b952]/45 bg-[#e7b952]/10 text-[#e8c77e]'}`}>≋ 2.0s</button><button type="button" onClick={onSelect} className="absolute inset-y-1 left-[53%] w-[9%] border border-[#e7b952]/45 bg-[#e7b952]/10 px-1 font-mono text-[10px] text-[#e8c77e]">◎ 3.0s</button></>
}

function PlacementBand({ fixture, zoneIndex, selected, onSelect }: { fixture: Fixture; zoneIndex: number; selected: boolean; onSelect: () => void }) {
  if (fixture === 'cathedral') {
    const names = ['Nebula', 'Comet', 'Portal', 'Ripple', 'Ember']
    return <div className="absolute inset-0 flex gap-px p-0.5">{[18, 14, 26, 22, 20].map((width, item) => <button type="button" key={item} onClick={onSelect} style={{ width: `${width}%` }} className="min-w-0 truncate border border-[#3b4652] bg-[#19212a] px-1 text-left text-[10px] text-[#d7dbe1]">{names[(item + zoneIndex) % names.length]}{item === 2 && zoneIndex % 3 === 0 ? ' fx2' : ''}</button>)}</div>
  }
  const names = zoneIndex === 0 ? ['NebulaSphere', 'StB×5', 'PortalBloom fx3', 'Afterglow'] : zoneIndex === 1 ? ['CometLoom ⇕2', 'Strobe Break', 'EmberDrift', 'NightRibbon'] : zoneIndex === 2 ? ['↳ CometLoom span', 'RippleField', 'Prism', 'Glow'] : ['TestPattern1D', 'PhantomStar', 'Doorway', 'Blackout']
  const widths = [18, 14, 42, 26]
  return <div className="absolute inset-0 flex gap-px p-0.5">{widths.map((width, item) => <button type="button" key={item} onClick={onSelect} style={{ width: `${width}%` }} className={`min-w-0 truncate border px-1 text-left text-[10px] ${selected && item === 2 ? 'border-white bg-[#263441] text-white' : zoneIndex === 2 && item === 0 ? 'border-[#67c7d6]/55 border-t-0 bg-[#16242b] text-[#a9e2e7]' : 'border-[#3b4652] bg-[#19212a] text-[#d7dbe1]'}`}>{names[item]}</button>)}</div>
}

function EffectBand() {
  return <><span className="absolute inset-y-0.5 left-[20%] w-[24%] border border-[#4fc4b0]/55 bg-[#4fc4b0]/12 px-1 text-[10px] text-[#9ae5d8]">Swirl</span><span className="absolute inset-y-0.5 left-[44%] w-[30%] border border-[#4fc4b0]/55 bg-[#4fc4b0]/12 px-1 text-[10px] text-[#9ae5d8]">Posterize</span></>
}

function AutomationLane({ label, amplified = false }: { label: string; amplified?: boolean }) {
  return <div className="grid h-[15px] border-b border-[#273039]" style={{ gridTemplateColumns: 'var(--timeline-gutter) minmax(0,1fr)' }}><div className="sticky left-0 z-20 flex items-center border-r border-[#303944] bg-[#10151b] pl-5 pr-2 text-[10px] text-[#c5b7ea]">{label}{amplified && <span className="ml-auto text-[9px] text-[#aab2bc]">gain</span>}</div><div className="relative bg-[#0c1116]"><MiniCurve /></div></div>
}

function MiniCurve() {
  return <><svg viewBox="0 0 100 12" preserveAspectRatio="none" className="absolute inset-x-[6%] top-0.5 h-[11px] w-[88%] overflow-visible"><path d="M0 9 C12 9 15 2 28 2 S42 10 53 7 S68 1 80 4 S92 9 100 2" fill="none" stroke="#a78bfa" strokeWidth="1" vectorEffect="non-scaling-stroke" /></svg>{[19, 31, 53, 77].map((left) => <i key={left} style={{ left: `${left}%` }} className="absolute top-[5px] size-1 -translate-x-1/2 rounded-full bg-[#a78bfa]" />)}</>
}

function Playhead({ left }: { left: number }) {
  return <span className="pointer-events-none absolute bottom-0 top-0 z-50 w-px bg-[#f2cd75]" style={{ left: `calc(var(--timeline-gutter) + (100% - var(--timeline-gutter)) * ${left / 100})` }}><i className="absolute -left-[4px] top-0 size-2 rotate-45 bg-[#f2cd75]" /></span>
}

function ViewportNavigator({ zoom }: { zoom: number }) {
  const width = Math.max(12, 100 / zoom)
  return <div className="grid h-5 shrink-0 grid-cols-[136px_minmax(0,1fr)] border-t border-[#28313a] bg-[#0f1419] text-[10px]"><span className="border-r border-[#28313a] px-2 py-0.5 text-[#aab2bc]">Viewport</span><div className="relative mx-2 my-1 bg-[#252d36]"><span className="absolute inset-y-0 border-x border-[#67c7d6] bg-[#67c7d6]/20" style={{ left: `${Math.min(24, 25 - width / 2)}%`, width: `${width}%` }} /></div></div>
}

function StudyEntityPanel({ selection, zoneName, fixture, onClose }: { selection: Exclude<Selection, null>; zoneName: string; fixture: Fixture; onClose: () => void }) {
  const isZone = selection === 'zone'
  const title = selection === 'scene' ? 'Scene · Strobe Break' : selection === 'xray' ? 'Scene X-ray · Strobe Break' : selection === 'transition' ? 'Transition · Linear east' : isZone ? `Zone · ${zoneName}` : 'Placement · PortalBloom'
  const behavior = selection === 'xray' ? 'Read-only · snap references' : isZone ? 'Routing target · owns lanes' : 'Editable selection'
  const factLabel = isZone ? 'Map layout' : 'Scene time'
  const factValue = isZone ? `${fixture === 'atrium' ? 'Atrium' : 'Cathedral'} · current routing` : '1:10.000–1:18.000'
  const action = selection === 'xray' || selection === 'scene' ? 'Open Scene' : isZone ? 'Show Zone on Stage' : 'Edit exact properties'
  return <section className="absolute left-[42%] top-[176px] z-[70] w-[304px] border border-[#536170] bg-[#151b22] text-[10px] shadow-[0_16px_50px_rgba(0,0,0,.7)]" aria-label="Entity Detail Panel"><div className="flex h-9 items-center border-b border-[#303944] px-2"><strong className="text-[11px] text-white">{title}</strong><button type="button" onClick={onClose} className="ml-auto grid size-6 place-items-center text-[#aab2bc] hover:text-white" aria-label="Close Entity Detail Panel"><X size={13} /></button></div><div className="grid grid-cols-[82px_minmax(0,1fr)] gap-x-2 gap-y-2 p-3"><span className="text-[#aab2bc]">Scope</span><span>{isZone ? 'Show Zone' : 'Global Show'}</span><span className="text-[#aab2bc]">Behavior</span><span>{behavior}</span><span className="text-[#aab2bc]">{factLabel}</span><span className="font-mono">{factValue}</span></div><button type="button" className="m-2 mt-0 h-8 w-[calc(100%-16px)] bg-[#67c7d6] font-semibold text-[#101419]">{action}</button></section>
}

function StudyStage({ playing, onPlaying }: { playing: boolean; onPlaying: (playing: boolean) => void }) {
  return <aside className="hidden w-[286px] shrink-0 flex-col bg-[#0d1116] min-[900px]:flex min-[1260px]:w-[304px]"><div className="relative min-h-0 flex-1 overflow-hidden bg-[#070a0e]"><div className="absolute inset-0 opacity-90" style={{ background: 'radial-gradient(circle at 35% 42%, #d39a3b 0 2%, transparent 3%), radial-gradient(circle at 62% 38%, #7443ba 0 4%, transparent 5%), radial-gradient(circle at 48% 64%, #268f93 0 3%, transparent 4%), radial-gradient(ellipse at center, #151821 0, #070a0e 68%)' }} /><div className="absolute inset-x-[12%] top-[14%] h-[62%] border border-[#35414c]" /><div className="absolute left-3 top-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#bec5ce]">Stage · Show output</div><div className="absolute bottom-3 right-3 font-mono text-[10px] text-[#aab2bc]">2,088 px · 2D</div></div><div className="border-t border-[#28313a] bg-[#10151b] p-2 text-[10px]"><div className="flex items-center gap-2"><button type="button" onClick={() => onPlaying(!playing)} className="grid size-7 place-items-center bg-[#e7b952] text-[#11151a]" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button><span className="font-mono text-[#f1cb7b]">01:12.4</span><button type="button" className={`ml-auto flex h-7 items-center gap-1 px-2 ${control}`}><Eye size={12} /> Show zones</button></div><div className="mt-2 h-1 bg-[#303944]"><div className="h-full w-[43%] bg-[#e7b952]" /></div></div></aside>
}

function StudySwitcher({ variant, fixture, onVariant, onFixture }: { variant: Variant; fixture: Fixture; onVariant: (variant: Variant) => void; onFixture: (fixture: Fixture) => void }) {
  const index = variants.findIndex((item) => item.key === variant)
  const previous = variants[(index - 1 + variants.length) % variants.length].key
  const next = variants[(index + 1) % variants.length].key
  return <div className="fixed bottom-3 left-1/2 z-[90] flex -translate-x-1/2 items-center border border-[#657281] bg-[#0d1217] p-1 text-[10px] shadow-2xl shadow-black/80"><button type="button" onClick={() => onVariant(previous)} className="grid size-7 place-items-center text-[#c6cdd5] hover:bg-white/8 hover:text-white" aria-label="Previous variant"><ChevronLeft size={14} /></button><span className="min-w-[176px] px-3 text-center"><strong className="text-[#f1cb7b]">{variant}</strong><span className="ml-2 text-white">{variants[index].name}</span></span><button type="button" onClick={() => onVariant(next)} className="grid size-7 place-items-center text-[#c6cdd5] hover:bg-white/8 hover:text-white" aria-label="Next variant"><ChevronRight size={14} /></button><span className="mx-1 h-5 w-px bg-[#303944]" />{(['atrium', 'cathedral'] as const).map((item) => <button type="button" key={item} onClick={() => onFixture(item)} className={`h-7 px-2 capitalize ${fixture === item ? 'bg-[#26323c] text-white' : 'text-[#aab2bc] hover:text-white'}`}>{item}</button>)}</div>
}
