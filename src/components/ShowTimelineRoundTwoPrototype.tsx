import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Copy,
  CopyPlus,
  Eye,
  Hand,
  Layers3,
  Magnet,
  Map as MapIcon,
  Maximize2,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pin,
  Play,
  Search,
  ScanSearch,
  Scissors,
  SkipBack,
  Undo2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  buildShowToolkitPresentationCatalogue,
  type ShowToolkitPresentationItem,
} from '@/engine/showVisualToolkitPresentation'
import { SHOW_VISUAL_TOOLKIT_REGISTRY, type ShowToolkitKind } from '@/engine/showVisualToolkit'

// PROTOTYPE: Round 2 dual-model Timeline and visual-toolkit integration study.
// Switch with ?prototype=timeline-dual&round=2&model=codex|fable&scope=show|scene&fixture=atrium|cathedral.

type Model = 'codex' | 'fable'
type Scope = 'show' | 'scene'
type Fixture = 'atrium' | 'cathedral'
type Selection = 'transition' | 'scene' | 'clip' | 'effect' | 'keyframe' | 'zone'
type CatalogueMode = 'effect' | 'transition'

const effect = '#4fc4b0'
const automation = '#a78bfa'
const transition = '#e6b85c'
const continuation = '#67c7d6'
const control = 'border border-[#2a323c] bg-[#13181e] text-[#a2aab5] hover:border-[#4a5664] hover:text-[#e7eaf0] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e6b85c]'

export function ShowTimelineRoundTwoPrototype() {
  const params = new URLSearchParams(window.location.search)
  const finalMode = params.get('round') === 'final'
  const peakMode = finalMode && params.get('view') === 'peak'
  const [model, setModelState] = useState<Model>(params.get('model') === 'fable' ? 'fable' : 'codex')
  const [scope, setScopeState] = useState<Scope>(params.get('scope') === 'scene' ? 'scene' : 'show')
  const [fixture, setFixtureState] = useState<Fixture>(params.get('fixture') === 'cathedral' ? 'cathedral' : 'atrium')
  const [selection, setSelection] = useState<Selection>(scope === 'scene' ? 'effect' : 'transition')
  const [playing, setPlaying] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [detailOpen, setDetailOpen] = useState(!finalMode)
  const [overviewOpen, setOverviewOpen] = useState(true)
  const [showMapOpen, setShowMapOpen] = useState(true)
  const [zonesVisible, setZonesVisible] = useState(false)
  const [catalogueMode, setCatalogueMode] = useState<CatalogueMode | null>(null)
  const initialZoom = Number(params.get('zoom'))
  const [zoom, setZoomState] = useState(Number.isFinite(initialZoom) ? Math.max(1, Math.min(8, initialZoom)) : 3.2)
  const [sceneInspectorOpen, setSceneInspectorOpen] = useState(peakMode && scope === 'show')
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [lastAction, setLastAction] = useState('Show output ready')
  const timelineViewportRef = useRef<HTMLDivElement>(null)

  const writeParams = (next: { model?: Model; scope?: Scope; fixture?: Fixture }) => {
    const url = new URL(window.location.href)
    url.searchParams.set('round', finalMode ? 'final' : '2')
    url.searchParams.set('model', next.model ?? model)
    url.searchParams.set('scope', next.scope ?? scope)
    url.searchParams.set('fixture', next.fixture ?? fixture)
    window.history.replaceState({}, '', url)
  }

  const setModel = (next: Model) => {
    setModelState(next)
    setDetailOpen(true)
    writeParams({ model: next })
  }
  const setScope = (next: Scope) => {
    setScopeState(next)
    setSelection(next === 'scene' ? 'effect' : 'transition')
    setDetailOpen(true)
    setCatalogueMode(null)
    setSceneInspectorOpen(false)
    writeParams({ scope: next })
  }
  const setFixture = (next: Fixture) => {
    setFixtureState(next)
    writeParams({ fixture: next })
  }
  const select = (next: Selection) => {
    if (selection === next && detailOpen) setDetailOpen(false)
    else {
      setSelection(next)
      setDetailOpen(true)
    }
  }

  const setZoom = (next: number) => {
    const clamped = Math.max(1, Math.min(8, next))
    setZoomState(clamped)
    const url = new URL(window.location.href)
    url.searchParams.set('zoom', clamped.toFixed(1))
    window.history.replaceState({}, '', url)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape') {
        if (catalogueMode) setCatalogueMode(null)
        else if (sceneInspectorOpen) setSceneInspectorOpen(false)
        else if (detailOpen) setDetailOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [catalogueMode, detailOpen, sceneInspectorOpen])

  useLayoutEffect(() => {
    if (!finalMode || scope !== 'show') return
    const viewport = timelineViewportRef.current
    const scene = viewport?.querySelector<HTMLElement>('[data-final-selected-scene="true"]')
    if (!viewport || !scene) return
    const viewportBox = viewport.getBoundingClientRect()
    const sceneBox = scene.getBoundingClientRect()
    const drift = sceneBox.left + sceneBox.width / 2 - (viewportBox.left + viewportBox.width / 2)
    viewport.scrollLeft += drift
  }, [finalMode, fixture, scope, zoom])

  const showName = fixture === 'atrium' ? 'Atrium Loop' : 'Cathedral Signal'

  return (
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[#090c10] font-sans text-[#e7eaf0]">
      <header className="flex h-10 shrink-0 items-center border-b border-[#28313a] bg-[#0d1116] px-3 text-[11px]">
        <span className="border border-[#4fc4b0]/45 bg-[#4fc4b0]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7ed9ca]">{finalMode ? 'Final design asset' : 'Round 2 study'}</span>
        <span className="ml-3 font-medium">{showName}</span>
        <span className="ml-2 text-[#a2aab5]">Timeline + visual toolkit</span>
        <span className="ml-auto border-l border-[#28313a] pl-3 text-[10px] text-[#a2aab5]">{finalMode ? 'Approved hybrid' : model === 'fable' ? 'Fable revision' : 'Codex revision'} · {scope === 'show' ? 'Global Show' : 'Scene local'}{peakMode ? scope === 'show' ? ' · Super Detail' : ' · Peak detail' : ''}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        {libraryOpen ? <Library fixture={fixture} onCollapse={() => setLibraryOpen(false)} /> : (
          <button type="button" onClick={() => setLibraryOpen(true)} className="hidden w-7 shrink-0 flex-col items-center border-r border-[#28313a] bg-[#0d1116] pt-2 text-[#a2aab5] hover:text-white min-[900px]:flex" aria-label="Restore library"><PanelLeftOpen size={14} /><span className="mt-3 [writing-mode:vertical-rl] text-[10px] uppercase tracking-[0.12em]">Library</span></button>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col border-r border-[#28313a] bg-[#0b0f13]">
          {scope === 'scene' && <ScopeBar model={model} showMapOpen={showMapOpen} onShowMapOpen={setShowMapOpen} onBack={() => setScope('show')} />}
          {scope === 'scene' && (model === 'fable' || showMapOpen) && <ShowMap model={model} onCollapse={() => setShowMapOpen(false)} />}
          {finalMode ? <FinalToolbar scope={scope} playing={playing} zoom={zoom} snapEnabled={snapEnabled} selection={selection} onPlaying={setPlaying} onZoom={setZoom} onSnap={setSnapEnabled} onAction={setLastAction} /> : <Toolbar model={model} scope={scope} playing={playing} onPlaying={setPlaying} />}
          <div ref={timelineViewportRef} data-testid={finalMode ? 'final-timeline-viewport' : undefined} className="min-h-0 flex-1 overflow-auto">
            {finalMode && scope === 'show' ? (
              <FinalGlobalTimeline fixture={fixture} zoom={zoom} selection={selection} overviewOpen={overviewOpen} onOverviewOpen={setOverviewOpen} onInspect={() => setSceneInspectorOpen(true)} onSelect={select} />
            ) : finalMode && scope === 'scene' ? (
              <FinalSceneTimeline zoom={zoom} peak={peakMode} selection={selection} onSelect={select} />
            ) : scope === 'show' ? (
              <GlobalTimeline
                model={model}
                fixture={fixture}
                selection={selection}
                overviewOpen={overviewOpen}
                onOverviewOpen={setOverviewOpen}
                onSelect={select}
              />
            ) : (
              <SceneTimeline model={model} selection={selection} onSelect={select} />
            )}
          </div>
          <ViewportNavigator />
          {finalMode ? <FinalStatusBar message={lastAction} snapEnabled={snapEnabled} /> : <StatusBar model={model} />}

          {finalMode && sceneInspectorOpen && <FinalSceneInspector peak={peakMode} onClose={() => setSceneInspectorOpen(false)} onOpenScene={() => setScope('scene')} />}

          {detailOpen && (
            <EntityDetailPanel
              scope={scope}
              selection={selection}
              onClose={() => setDetailOpen(false)}
              onOpenCatalogue={setCatalogueMode}
              onEditBoundary={() => setScope('show')}
            />
          )}
          {catalogueMode && finalMode && (
            <CompactVisualPalette
              mode={catalogueMode}
              owner={catalogueMode === 'transition' ? 'Boundary after Portal Bloom' : 'PortalBloom · Canopy'}
              onClose={() => setCatalogueMode(null)}
              onApply={() => {
                setCatalogueMode(null)
                setSelection(catalogueMode === 'transition' ? 'transition' : 'effect')
                setDetailOpen(true)
                setLastAction(`${catalogueMode === 'transition' ? 'Transition' : 'Effect'} preview applied`)
              }}
            />
          )}
          {catalogueMode && !finalMode && (
            <VisualCatalogue
              mode={catalogueMode}
              owner={catalogueMode === 'transition' ? 'Boundary after Portal Bloom' : 'PortalBloom · Canopy'}
              onClose={() => setCatalogueMode(null)}
              onApply={() => {
                setCatalogueMode(null)
                setSelection(catalogueMode === 'transition' ? 'transition' : 'effect')
                setDetailOpen(true)
              }}
            />
          )}
        </main>

        <Stage
          scope={scope}
          playing={playing}
          zonesVisible={zonesVisible}
          previewing={catalogueMode !== null}
          onPlaying={setPlaying}
          onZonesVisible={setZonesVisible}
        />
      </div>

      {finalMode ? <FinalSwitcher scope={scope} fixture={fixture} onScope={setScope} onFixture={setFixture} /> : <RoundTwoSwitcher model={model} scope={scope} fixture={fixture} onModel={setModel} onScope={setScope} onFixture={setFixture} />}
    </div>
  )
}

function Library({ fixture, onCollapse }: { fixture: Fixture; onCollapse: () => void }) {
  return (
    <aside className="hidden w-[188px] shrink-0 flex-col border-r border-[#28313a] bg-[#0d1116] text-[11px] min-[900px]:flex">
      <div className="flex h-9 items-center gap-2 border-b border-[#28313a] px-2 text-[#a2aab5]"><Search size={13} /> <span>Filter library</span><button type="button" onClick={onCollapse} className="ml-auto grid size-6 place-items-center hover:text-white" aria-label="Collapse library"><PanelLeftClose size={13} /></button></div>
      <SectionLabel>Shows</SectionLabel>
      {['Atrium Loop', 'Cathedral Signal', 'Threshold Study', 'Garden Loop'].map((name) => (
        <button type="button" key={name} className={`border-l-2 px-3 py-2 text-left ${name.toLowerCase().startsWith(fixture) ? 'border-[#67c7d6] bg-[#67c7d6]/8 text-white' : 'border-transparent text-[#a2aab5] hover:bg-white/5 hover:text-white'}`}>
          {name}
          {name.toLowerCase().startsWith(fixture) && <span className="mt-0.5 block font-mono text-[10px] text-[#a2aab5]">{fixture === 'atrium' ? '04:36 · 6 Scenes · 4 zones' : '00:42 · 5 Scenes · 12 zones'}</span>}
        </button>
      ))}
      <SectionLabel>Patterns</SectionLabel>
      {['NebulaSphere', 'CometLoom', 'PortalBloom', 'RippleField', 'SparkVeil'].map((name) => <button type="button" key={name} className="px-3 py-1.5 text-left text-[#a2aab5] hover:bg-white/5 hover:text-white">{name}</button>)}
      <p className="mt-auto border-t border-[#28313a] p-2 text-[10px] leading-[1.35] text-[#a2aab5]">Collapse explicitly when horizontal Timeline space matters.</p>
    </aside>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="border-y border-[#28313a] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#a2aab5]">{children}</div>
}

function ScopeBar({ model, showMapOpen, onShowMapOpen, onBack }: { model: Model; showMapOpen: boolean; onShowMapOpen: (open: boolean) => void; onBack: () => void }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[#e6b85c]/25 bg-[#10151b] px-2 text-[10px]">
      <button type="button" onClick={onBack} className={`flex h-6 items-center gap-1 px-2 ${control}`}><ChevronLeft size={12} /> Show</button>
      <span className="text-[#a2aab5]">Scene 3</span><ChevronRight size={11} className="text-[#66717e]" /><strong className="font-medium text-[#f1cf88]">Strobe Break · 8.0 s</strong>
      <span className="ml-2 font-mono text-[#f1cf88]">LOCAL 01.240</span><span className="font-mono text-[#a2aab5]">SHOW 71.240</span>
      {model === 'codex' && <button type="button" onClick={() => onShowMapOpen(!showMapOpen)} className={`ml-auto h-6 px-2 ${control}`}>{showMapOpen ? 'Hide Show map' : 'Show map'}</button>}
      <span className={model === 'fable' ? 'ml-auto text-[#a2aab5]' : 'text-[#a2aab5]'}>Loop Scene</span>
    </div>
  )
}

function ShowMap({ model, onCollapse }: { model: Model; onCollapse: () => void }) {
  return (
    <div className="grid h-6 shrink-0 grid-cols-[136px_minmax(0,1fr)] border-b border-[#28313a] bg-[#0c1116] text-[10px]">
      <div className="flex items-center border-r border-[#28313a] px-2 font-semibold uppercase tracking-[0.08em] text-[#a2aab5]">Show map {model === 'fable' && <span className="ml-1 text-[#67c7d6]">interactive</span>}</div>
      <div className="relative flex items-center gap-px px-2">
        {[20, 12, 18, 17, 15, 18].map((width, index) => <button type="button" key={index} style={{ width: `${width}%` }} className={`h-2.5 ${index === 2 ? 'border border-[#e6b85c] bg-[#e6b85c]/20' : 'bg-[#303944] hover:bg-[#46515f]'}`} aria-label={`Scene ${index + 1}`} />)}
        <span className="absolute left-[37%] h-full w-px bg-[#67c7d6]" />
        {model === 'codex' && <button type="button" onClick={onCollapse} className="ml-auto px-1 text-[#a2aab5] hover:text-white" aria-label="Collapse Show map"><ChevronsLeft size={12} /></button>}
      </div>
    </div>
  )
}

function Toolbar({ model, scope, playing, onPlaying }: { model: Model; scope: Scope; playing: boolean; onPlaying: (playing: boolean) => void }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[#28313a] bg-[#10151b] px-2 text-[10px]">
      <button type="button" className={`grid size-7 place-items-center ${control}`} aria-label="Go to start"><SkipBack size={13} /></button>
      <button type="button" onClick={() => onPlaying(!playing)} className="grid size-7 place-items-center bg-[#e6b85c] text-[#11151a]" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button>
      <span className="ml-1 w-[128px] font-mono text-[11px] text-[#e7eaf0]">{scope === 'show' ? '01:12.4 / 04:36' : '01.240 / 08.000'}</span>
      <span className="mx-1 h-4 w-px bg-[#303944]" />
      <button type="button" className={`grid size-7 place-items-center ${control}`} aria-label="Zoom out"><ZoomOut size={13} /></button>
      <button type="button" className={`flex h-7 items-center gap-1 px-2 ${control}`}><Maximize2 size={12} /> Fit</button>
      <button type="button" className={`grid size-7 place-items-center ${control}`} aria-label="Zoom in"><ZoomIn size={13} /></button>
      <button type="button" className={`flex h-7 items-center gap-1 px-2 ${control}`}><Magnet size={12} /> Snap</button>
      <div className="ml-auto flex items-center gap-2 text-[#a2aab5]"><MousePointer2 size={12} /><span>Select</span><Hand size={12} /><span>{model === 'fable' ? 'H-drag' : 'Space-drag'}</span><Copy size={12} /><Undo2 size={12} /></div>
    </div>
  )
}

function FinalToolbar({ scope, playing, zoom, snapEnabled, selection, onPlaying, onZoom, onSnap, onAction }: { scope: Scope; playing: boolean; zoom: number; snapEnabled: boolean; selection: Selection; onPlaying: (playing: boolean) => void; onZoom: (zoom: number) => void; onSnap: (enabled: boolean) => void; onAction: (message: string) => void }) {
  const clipSelected = selection === 'clip'
  return (
    <div className="final-toolbar relative h-11 shrink-0 border-b border-[#28313a] bg-[#10151b] px-2 text-[10px]">
      <style>{`
        .final-toolbar { container-type: inline-size; display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: center; }
        .final-time-stack { display: none; }
        .final-zoom-slider { width: 124px; }
        @container (max-width: 820px) {
          .final-command-label { display: none; }
          .final-zoom-slider { width: 96px; }
          .final-command { width: 28px; padding-inline: 0; justify-content: center; }
        }
        @container (max-width: 640px) {
          .final-time-inline { display: none; }
          .final-time-stack { display: grid; }
          .final-zoom-slider { width: 72px; }
        }
      `}</style>
      <div className="flex min-w-0 items-center gap-1 justify-self-start">
        <button type="button" onClick={() => onPlaying(!playing)} className="grid size-8 place-items-center bg-[#e6b85c] text-[#11151a] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f7d78f]" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
        <button type="button" className={`grid size-7 place-items-center ${control}`} aria-label="Go to start"><SkipBack size={13} /></button>
        <span className="final-time-inline ml-1 whitespace-nowrap font-mono text-[11px] tabular-nums"><strong className="font-medium text-white">{scope === 'show' ? '01:12.4' : '01.2'}</strong><span className="mx-1.5 text-[#65717e]">/</span><span className="text-[#9ea7b2]">{scope === 'show' ? '04:36.0' : '08.0'}</span></span>
        <span className="final-time-stack ml-1 grid-cols-[8px_auto] items-center gap-x-1 font-mono text-[10px] leading-[1.05] tabular-nums"><i className="size-1.5 rotate-45 bg-[#e6b85c]" /><strong className="font-medium text-white">{scope === 'show' ? '01:12.4' : '01.2'}</strong><i className="h-2 w-px bg-[#65717e] justify-self-center" /><span className="text-[#8f99a5]">{scope === 'show' ? '04:36.0' : '08.0'}</span></span>
      </div>

      <div className="flex items-center gap-1 justify-self-center">
        <button type="button" onClick={() => onZoom(zoom - 0.5)} className="grid size-8 place-items-center text-[#919ca8] hover:bg-[#e6b85c]/8 hover:text-[#f2c96f] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e6b85c]" aria-label="Zoom out" title="Zoom out"><ZoomOut size={15} /></button>
        <label className="flex items-center"><span className="sr-only">Timeline zoom</span><input aria-label="Timeline zoom" type="range" min="1" max="8" step="0.1" value={zoom} onChange={(event) => onZoom(Number(event.target.value))} className="final-zoom-slider accent-[#67c7d6]" /></label>
        <button type="button" onClick={() => onZoom(zoom + 0.5)} className="grid size-8 place-items-center text-[#919ca8] hover:bg-[#e6b85c]/8 hover:text-[#f2c96f] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e6b85c]" aria-label="Zoom in" title="Zoom in"><ZoomIn size={15} /></button>
        <span className="ml-1 min-w-[38px] font-mono text-[11px] tabular-nums text-[#9adde4]">{zoom.toFixed(1)}×</span>
      </div>

      <div className="flex items-center gap-1 justify-self-end">
        <button type="button" onClick={() => onSnap(!snapEnabled)} className={`final-command flex h-7 items-center gap-1 px-2 ${snapEnabled ? 'border border-[#67c7d6] bg-[#67c7d6]/12 text-[#b9edf1]' : control}`} aria-pressed={snapEnabled} title="Toggle snapping"><Magnet size={12} /><span className="final-command-label">Snap</span></button>
        <button type="button" onClick={() => onZoom(1)} className={`final-command flex h-7 items-center gap-1 px-2 ${control}`} title="Fit Timeline"><Maximize2 size={12} /><span className="final-command-label">Fit</span></button>
        <button type="button" disabled={!clipSelected} onClick={() => onAction('Split selected clip at 01:12.4')} className={`final-command flex h-7 items-center gap-1 px-2 ${control} disabled:cursor-not-allowed disabled:opacity-35`} title={clipSelected ? 'Split at playhead' : 'Select a clip under the playhead to split'}><Scissors size={12} /><span className="final-command-label">Split</span></button>
        <button type="button" disabled={!clipSelected} onClick={() => onAction('Cloned clip · later content rippled forward')} className={`final-command flex h-7 items-center gap-1 px-2 ${control} disabled:cursor-not-allowed disabled:opacity-35`} title={clipSelected ? 'Clone after selected clip' : 'Select a clip to clone'}><CopyPlus size={12} /><span className="final-command-label">Clone</span></button>
      </div>
    </div>
  )
}

function FinalGlobalTimeline({ fixture, zoom, selection, overviewOpen, onOverviewOpen, onInspect, onSelect }: { fixture: Fixture; zoom: number; selection: Selection; overviewOpen: boolean; onOverviewOpen: (open: boolean) => void; onInspect: () => void; onSelect: (selection: Selection) => void }) {
  const zones = fixture === 'cathedral'
    ? ['Canopy', 'Columns', 'Floor', 'Entry', 'Arch L', 'Arch R', 'Gallery', 'Nave', 'Halo', 'Portal', 'West', 'East']
    : ['Canopy', 'Columns', 'Floor', 'Entry']
  const [expanded, setExpanded] = useState<number[]>([0])
  return (
    <FinalTimelineCanvas zoom={zoom}>
      <Ruler label="Show time" ticks={['0:56', '1:04', '1:12', '1:20', '1:28', '1:36', '1:44']} />
      <Track label="Scenes" height={30} sticky><FinalSceneBand selected={selection === 'scene'} overviewOpen={overviewOpen} onOverviewOpen={onOverviewOpen} onSelect={() => onSelect('scene')} /></Track>
      {overviewOpen && <Track label="↳ Scene X-ray · read-only" height={36} subordinate><FinalSceneXray onInspect={onInspect} /></Track>}
      <Track label="Transitions" icon={<Zap size={12} />} height={26} sticky><TransitionBand selected={selection === 'transition'} onSelect={() => onSelect('transition')} /></Track>
      {zones.map((zone, index) => {
        const isOpen = expanded.includes(index)
        return <div key={zone}>
          <Track label={<FinalZoneLabel name={zone} pixels={index === 0 ? 840 : 96 + index * 64} open={isOpen} onToggle={() => setExpanded((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} onSelect={() => onSelect('zone')} />} icon={<MapIcon size={12} />} height={30}>
            <DensePlacements fixture={fixture} index={index} microOverview={false} selected={selection === 'clip' && index === 0} onSelect={() => onSelect('clip')} />
          </Track>
          {isOpen && fixture === 'atrium' && index === 0 && <><Track label="↳ Effect activity" height={22} subordinate><EffectSpans selected={selection === 'effect'} onSelect={() => onSelect('effect')} /></Track><AutomationStack properties={['Brightness', 'Speed']} selected={selection === 'keyframe'} onSelect={() => onSelect('keyframe')} /></>}
          {isOpen && (fixture === 'cathedral' || index !== 0) && <Track label="↳ activity summary" height={18} subordinate><span className="absolute inset-y-1 left-[12%] right-[8%] bg-[repeating-linear-gradient(90deg,rgba(79,196,176,.55)_0_4px,transparent_4px_15px)]" /><span className="absolute right-2 top-0.5 text-[9px] text-[#9ea7b2]">{5 + index} placements · {index % 3} animated</span></Track>}
        </div>
      })}
      <Playhead left="43%" />
    </FinalTimelineCanvas>
  )
}

function FinalTimelineCanvas({ zoom, children }: { zoom: number; children: ReactNode }) {
  return <div className="relative bg-[#0b0f13]" style={{ width: Math.max(760, Math.round(760 * zoom)), minWidth: '100%', '--timeline-gutter': '136px' } as CSSProperties}>{children}</div>
}

function FinalSceneBand({ selected, overviewOpen, onOverviewOpen, onSelect }: { selected: boolean; overviewOpen: boolean; onOverviewOpen: (open: boolean) => void; onSelect: () => void }) {
  const items = [['Pulse Storm', 18], ['Strobe Break', 14], ['Portal Bloom', 26], ['Afterglow', 16], ['Night Drive', 16], ['Blackout', 10]] as const
  return <div className="absolute inset-0 flex">{items.map(([name, width], index) => <div key={name} data-final-selected-scene={index === 1 ? 'true' : undefined} style={{ width: `${width}%` }} className={`relative overflow-hidden border-r border-[#3a444f] ${selected && index === 1 ? 'bg-[#e6b85c]/15 text-white shadow-[inset_0_-2px_0_#e6b85c]' : 'bg-[#151b22] text-[#c8cdd5]'}`}>
    <button type="button" onClick={onSelect} className={`absolute inset-0 truncate px-1.5 text-left text-[10px] hover:bg-white/5 ${index === 1 ? 'pl-5' : ''}`}>{name}</button>
    {index === 1 && <button type="button" onClick={() => onOverviewOpen(!overviewOpen)} className="absolute inset-y-0 left-0 z-10 grid w-5 place-items-start pt-1 hover:bg-white/8" aria-label={overviewOpen ? 'Collapse Scene X-ray' : 'Expand Scene X-ray'}><ChevronDown size={11} className={overviewOpen ? '' : '-rotate-90'} /></button>}
    <span className="pointer-events-none absolute inset-x-1 bottom-1 flex h-1 gap-px">{Array.from({ length: Math.max(2, index + 2) }, (_, tick) => <i key={tick} className={tick % 2 ? 'flex-1 bg-[#a78bfa]/45' : 'flex-1 bg-[#4fc4b0]/45'} />)}</span>
  </div>)}</div>
}

function FinalSceneXray({ onInspect }: { onInspect: () => void }) {
  return <div className="absolute inset-y-1 left-[18%] w-[14%] min-w-[130px] border-x border-[#e6b85c]/45 bg-[#e6b85c]/5">
    <div className="grid h-full grid-rows-3 text-[9px] leading-none"><span className="relative border-b border-[#303944] pl-1 text-[#bec5ce]">cuts<i className="absolute inset-x-[18%] bottom-1 h-px bg-[repeating-linear-gradient(90deg,#9ca3af_0_2px,transparent_2px_16px)]" /></span><span className="relative border-b border-[#303944] pl-1 text-[#8fe1d3]">FX<i className="absolute bottom-1 left-[22%] h-1 w-[52%] bg-[#4fc4b0]/70" /></span><span className="relative pl-1 text-[#c9b8f6]">keys<i className="absolute bottom-1 left-[12%] h-1 w-[75%] bg-[repeating-linear-gradient(90deg,#a78bfa_0_3px,transparent_3px_22px)]" /></span></div>
    <button type="button" onClick={onInspect} className="absolute -right-7 top-0 grid size-6 place-items-center border border-[#536170] bg-[#151b22] text-[#d7dde4] hover:border-[#e6b85c] hover:text-white" aria-label="Inspect Scene detail" title="Inspect Scene detail"><ScanSearch size={13} /></button>
  </div>
}

function FinalZoneLabel({ name, pixels, open, onToggle, onSelect }: { name: string; pixels: number; open: boolean; onToggle: () => void; onSelect: () => void }) {
  return <span className="-mx-2 flex h-full min-w-0 flex-1 items-center"><button type="button" onClick={onToggle} className="grid h-full w-6 shrink-0 place-items-center text-[#9ea7b2] hover:bg-white/8 hover:text-white" aria-label={open ? `Collapse ${name} lanes` : `Expand ${name} lanes`}><ChevronDown size={11} className={open ? '' : '-rotate-90'} /></button><button type="button" onClick={onSelect} className="min-w-0 flex-1 truncate pr-2 text-left hover:text-white">{name} · {pixels}px</button></span>
}

function FinalSceneTimeline({ zoom, peak, selection, onSelect }: { zoom: number; peak: boolean; selection: Selection; onSelect: (selection: Selection) => void }) {
  return <FinalTimelineCanvas zoom={zoom}>
    <Ruler label="Local time" ticks={['0', '1.0', '2.0', '3.0', '4.0', '5.0', '6.0', '7.0', '8.0']} />
    <Track label="Incoming · read-only" icon={<Zap size={12} />} height={22} subordinate><BoundaryReference incoming selected={selection === 'transition'} onSelect={() => onSelect('transition')} /></Track>
    <Track label="Outgoing · read-only" icon={<Zap size={12} />} height={22} subordinate><BoundaryReference selected={selection === 'transition'} onSelect={() => onSelect('transition')} /></Track>
    <Track label="▾ Canopy · 840px" icon={<MapIcon size={12} />} height={30}><RapidCuts selected={selection === 'clip'} onSelect={() => onSelect('clip')} /></Track>
    <AutomationStack properties={['Brightness']} selected={selection === 'keyframe'} onSelect={() => onSelect('keyframe')} />
    <Track label="▾ Columns · 512px" icon={<MapIcon size={12} />} height={30}><SinglePlacement label="CometLoom" left="0%" width="100%" selected={selection === 'clip'} onSelect={() => onSelect('clip')} badges="fx2 · ~1" /></Track>
    <Track label="↳ Effect activity" height={22} subordinate><EffectSpans selected={selection === 'effect'} onSelect={() => onSelect('effect')} /></Track>
    <Track label="⧉ Overlay" icon={<Layers3 size={12} />} height={30}><SinglePlacement label="SparkVeil" left="25%" width="49%" selected={selection === 'clip'} onSelect={() => onSelect('clip')} badges="continues" overlay /></Track>
    <AutomationStack properties={['Opacity']} selected={selection === 'keyframe'} onSelect={() => onSelect('keyframe')} />
    <Track label={`${peak ? '▾' : '▸'} Floor · 640px`} icon={<MapIcon size={12} />} height={30}><SinglePlacement label="RippleField" left="0%" width="100%" selected={false} onSelect={() => onSelect('clip')} badges="fx2 · ~2" /></Track>
    {peak && <>
      <Track label="↳ Effect activity" height={22} subordinate><NamedEffectSpans first="Kaleidoscope" second="Bloom" selected={selection === 'effect'} onSelect={() => onSelect('effect')} /></Track>
      <AutomationStack properties={['Position X', 'Brightness']} selected={selection === 'keyframe'} onSelect={() => onSelect('keyframe')} />
      <Track label="▾ Entry · 96px" icon={<MapIcon size={12} />} height={30}><DenseLocalPlacements labels={['SignalGate', 'Flash', 'DoorwayEcho', 'Blackout']} selected={selection === 'clip'} onSelect={() => onSelect('clip')} /></Track>
      <Track label="↳ Effect activity" height={22} subordinate><NamedEffectSpans first="Threshold" second="Posterize" selected={selection === 'effect'} onSelect={() => onSelect('effect')} /></Track>
      <AutomationStack properties={['Speed']} selected={selection === 'keyframe'} onSelect={() => onSelect('keyframe')} />
      <Track label="▾ Arch L · 352px" icon={<MapIcon size={12} />} height={30}><DenseLocalPlacements labels={['NebulaRise', 'PrismHold', 'CometTail']} selected={selection === 'clip'} onSelect={() => onSelect('clip')} /></Track>
      <AutomationStack properties={['Opacity', 'Position Y']} selected={selection === 'keyframe'} onSelect={() => onSelect('keyframe')} />
    </>}
    <Playhead left="16%" />
  </FinalTimelineCanvas>
}

function NamedEffectSpans({ first, second, selected, onSelect }: { first: string; second: string; selected: boolean; onSelect: () => void }) {
  return <><button type="button" onClick={onSelect} className={`absolute inset-y-0.5 left-[12%] w-[34%] border px-1 text-left text-[10px] ${selected ? 'border-[#4fc4b0] bg-[#4fc4b0]/20 text-[#a7eadf]' : 'border-[#4fc4b0]/45 bg-[#4fc4b0]/10 text-[#8bdccc]'}`}>{first}</button><button type="button" onClick={onSelect} className="absolute inset-y-0.5 left-[52%] w-[32%] border border-[#4fc4b0]/45 bg-[#4fc4b0]/10 px-1 text-left text-[10px] text-[#8bdccc]">{second}</button></>
}

function DenseLocalPlacements({ labels, selected, onSelect }: { labels: string[]; selected: boolean; onSelect: () => void }) {
  const widths = labels.length === 4 ? [18, 9, 31, 42] : [28, 36, 36]
  return <>{labels.map((label, index) => {
    const itemLeft = widths.slice(0, index).reduce((total, width) => total + width, 0)
    return <button type="button" key={label} onClick={onSelect} style={{ left: `${itemLeft}%`, width: `${widths[index]}%` }} className={`absolute inset-y-0.5 min-w-[6px] truncate border px-1 text-left text-[10px] ${selected && index === 1 ? 'border-white bg-[#273542] text-white' : 'border-[#3b4652] bg-[#19212a] text-[#d7dbe1]'}`}>{label}</button>
  })}</>
}

function GlobalTimeline({ model, fixture, selection, overviewOpen, onOverviewOpen, onSelect }: { model: Model; fixture: Fixture; selection: Selection; overviewOpen: boolean; onOverviewOpen: (open: boolean) => void; onSelect: (selection: Selection) => void }) {
  const zones = fixture === 'cathedral'
    ? ['Canopy', 'Columns', 'Floor', 'Entry', 'Arch L', 'Arch R', 'Gallery', 'Nave', 'Halo', 'Portal', 'West', 'East']
    : ['Canopy', 'Columns', 'Floor', 'Entry']
  return (
    <TimelineCanvas>
      <Ruler label="Show time" ticks={['0:56', '1:04', '1:12', '1:20', '1:28', '1:36', '1:44']} />
      <Track label="Scenes" height={30} sticky>
        <SceneBand selected={selection === 'scene'} onSelect={() => onSelect('scene')} overviewOpen={overviewOpen} onOverviewOpen={onOverviewOpen} />
      </Track>
      {model === 'codex' && overviewOpen && (
        <Track label="↳ Scene X-ray · read-only" height={32} subordinate>
          <SceneXray />
        </Track>
      )}
      <Track label="Transitions" icon={<Zap size={12} />} height={26} sticky>
        <TransitionBand selected={selection === 'transition'} onSelect={() => onSelect('transition')} />
      </Track>
      {zones.map((zone, index) => (
        <div key={zone}>
          <Track label={`${index < 4 ? (index === 0 ? '▾' : '▸') : '▸'} ${zone} · ${index === 0 ? '840' : 96 + index * 64}px`} icon={<MapIcon size={12} />} height={30}>
            <DensePlacements fixture={fixture} index={index} microOverview={model === 'fable' && overviewOpen} selected={selection === 'clip' && index === 0} onSelect={() => onSelect('clip')} />
          </Track>
          {fixture === 'atrium' && index === 0 && (
            <>
              <Track label="↳ Effect activity" height={22} subordinate><EffectSpans selected={selection === 'effect'} onSelect={() => onSelect('effect')} /></Track>
              <AutomationStack properties={['Brightness', 'Speed']} selected={selection === 'keyframe'} onSelect={() => onSelect('keyframe')} />
            </>
          )}
        </div>
      ))}
      <Playhead left="43%" />
    </TimelineCanvas>
  )
}

function SceneTimeline({ model, selection, onSelect }: { model: Model; selection: Selection; onSelect: (selection: Selection) => void }) {
  return (
    <TimelineCanvas>
      <Ruler label="Local time" ticks={['0', '1.0', '2.0', '3.0', '4.0', '5.0', '6.0', '7.0', '8.0']} />
      {model === 'codex' ? (
        <>
          <Track label="Incoming · read-only" icon={<Zap size={12} />} height={22} subordinate><BoundaryReference incoming selected={selection === 'transition'} onSelect={() => onSelect('transition')} /></Track>
          <Track label="Outgoing · read-only" icon={<Zap size={12} />} height={22} subordinate><BoundaryReference selected={selection === 'transition'} onSelect={() => onSelect('transition')} /></Track>
        </>
      ) : (
        <Track label="Bounds · read-only" icon={<Zap size={12} />} height={24}><BoundaryReference combined selected={selection === 'transition'} onSelect={() => onSelect('transition')} /></Track>
      )}
      <Track label="▾ Canopy · 840px" icon={<MapIcon size={12} />} height={30}><RapidCuts selected={selection === 'clip'} onSelect={() => onSelect('clip')} /></Track>
      <AutomationStack properties={['Brightness']} />
      <Track label="▾ Columns · 512px" icon={<MapIcon size={12} />} height={30}><SinglePlacement label="CometLoom" left="0%" width="100%" selected={selection === 'clip'} onSelect={() => onSelect('clip')} badges="fx2 · ~1" /></Track>
      <Track label="↳ Effect activity" height={22} subordinate><EffectSpans selected={selection === 'effect'} onSelect={() => onSelect('effect')} /></Track>
      <Track label="⧉ Overlay" icon={<Layers3 size={12} />} height={30}><SinglePlacement label="SparkVeil" left="25%" width="49%" selected={selection === 'clip'} onSelect={() => onSelect('clip')} badges="continues" overlay /></Track>
      <AutomationStack properties={['Opacity']} selected={selection === 'keyframe'} onSelect={() => onSelect('keyframe')} />
      <Track label="▸ Floor · 640px" icon={<MapIcon size={12} />} height={30}><SinglePlacement label="RippleField" left="0%" width="100%" selected={false} onSelect={() => onSelect('clip')} badges="~1" /></Track>
      <Playhead left="16%" />
    </TimelineCanvas>
  )
}

function TimelineCanvas({ children }: { children: ReactNode }) {
  return <div className="relative min-w-[680px] bg-[#0b0f13]" style={{ '--timeline-gutter': '136px' } as CSSProperties}>{children}</div>
}

function Ruler({ label, ticks }: { label: string; ticks: string[] }) {
  return (
    <div className="sticky top-0 z-40 grid h-7 border-b border-[#303944] bg-[#11171d] font-mono text-[10px] text-[#a2aab5]" style={{ gridTemplateColumns: 'var(--timeline-gutter) minmax(0,1fr)' }}>
      <div className="sticky left-0 z-10 flex items-center border-r border-[#303944] bg-[#11171d] px-2 font-semibold uppercase tracking-[0.08em]">{label}</div>
      <div className="flex items-center justify-between bg-[linear-gradient(to_right,transparent_24.8%,#29313a_25%,transparent_25.2%,transparent_49.8%,#29313a_50%,transparent_50.2%,transparent_74.8%,#29313a_75%,transparent_75.2%)] px-2">{ticks.map((tick) => <span key={tick}>{tick}</span>)}</div>
    </div>
  )
}

function Track({ label, icon, height, subordinate = false, sticky = false, children }: { label: ReactNode; icon?: ReactNode; height: number; subordinate?: boolean; sticky?: boolean; children: ReactNode }) {
  return (
    <div className={`grid border-b border-[#273039] ${sticky ? 'sticky z-30' : ''}`} style={{ height, top: sticky ? 28 : undefined, gridTemplateColumns: 'var(--timeline-gutter) minmax(0,1fr)' }}>
      <div className={`sticky left-0 z-20 flex items-center gap-1.5 border-r border-[#303944] bg-[#10151b] px-2 ${subordinate ? 'pl-5 text-[10px] text-[#a2aab5]' : 'text-[11px] font-medium text-[#c8cdd5]'}`}>{icon}{label}</div>
      <div className="relative overflow-visible bg-[linear-gradient(to_right,transparent_24.85%,#242c34_25%,transparent_25.15%,transparent_49.85%,#242c34_50%,transparent_50.15%,transparent_74.85%,#242c34_75%,transparent_75.15%)]">{children}</div>
    </div>
  )
}

function SceneBand({ selected, overviewOpen, onOverviewOpen, onSelect }: { selected: boolean; overviewOpen: boolean; onOverviewOpen: (open: boolean) => void; onSelect: () => void }) {
  const scenes = [
    ['Pulse Storm', 20], ['Strobe Break', 12], ['Portal Bloom', 26], ['Afterglow', 17], ['Night Drive', 15], ['Blackout', 10],
  ] as const
  return <div className="absolute inset-0 flex">{scenes.map(([name, width], index) => <button type="button" key={name} onClick={() => { onSelect(); if (index === 1) onOverviewOpen(!overviewOpen) }} style={{ width: `${width}%` }} className={`relative overflow-hidden border-r border-[#3a444f] px-1.5 text-left text-[10px] ${selected && index === 1 ? 'bg-[#e6b85c]/15 text-white shadow-[inset_0_-2px_0_#e6b85c]' : 'bg-[#151b22] text-[#c8cdd5] hover:bg-[#1a222b]'}`}>
    <span className="block truncate">{name}</span>
    <span className="absolute inset-x-1 bottom-1 flex h-1 gap-px">{Array.from({ length: Math.max(2, index + 2) }, (_, tick) => <i key={tick} className={tick % 2 ? 'flex-1 bg-[#a78bfa]/45' : 'flex-1 bg-[#4fc4b0]/45'} />)}</span>
  </button>)}</div>
}

function SceneXray() {
  return (
    <div className="absolute inset-y-1 left-[20%] w-[12%] border-x border-[#e6b85c]/40 bg-[#e6b85c]/5">
      <div className="absolute inset-x-1 top-1 h-1.5 bg-[repeating-linear-gradient(90deg,#9ca3af_0_2px,transparent_2px_5px)] opacity-75" />
      <div className="absolute inset-x-1 top-3 h-1.5 bg-[repeating-linear-gradient(90deg,#4fc4b0_0_4px,transparent_4px_8px)] opacity-70" />
      <div className="absolute inset-x-1 bottom-1 h-1 bg-[repeating-linear-gradient(90deg,#a78bfa_0_1px,transparent_1px_4px)] opacity-80" />
      <span className="absolute left-full top-1 ml-1 whitespace-nowrap text-[10px] text-[#a2aab5]">beats + snap references</span>
    </div>
  )
}

function TransitionBand({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return (
    <>
      <button type="button" onClick={onSelect} className={`absolute inset-y-1 left-[17%] w-[8%] border px-1 font-mono text-[10px] ${selected ? 'border-[#e6b85c] bg-[#e6b85c]/20 text-[#f4d99f]' : 'border-[#e6b85c]/45 bg-[#e6b85c]/10 text-[#e8c77e]'}`}>≋ 2.0s</button>
      <button type="button" onClick={onSelect} className="absolute inset-y-1 left-[52%] w-[10%] border border-[#e6b85c]/45 bg-[#e6b85c]/10 px-1 font-mono text-[10px] text-[#e8c77e]">◎ 3.0s</button>
      <span className="absolute inset-y-1 left-[61%] grid w-8 place-items-center border border-dashed border-[#7d8998] text-[11px] text-[#a2aab5]">⇄</span>
    </>
  )
}

function DensePlacements({ fixture, index, microOverview, selected, onSelect }: { fixture: Fixture; index: number; microOverview: boolean; selected: boolean; onSelect: () => void }) {
  if (fixture === 'cathedral') {
    const names = ['Nebula', 'Comet', 'Portal', 'Ripple', 'Ember']
    return <div className="absolute inset-0 flex gap-px p-0.5">{[18, 21, 17, 25, 19].map((width, item) => <button type="button" key={item} onClick={onSelect} style={{ width: `${width}%` }} className="min-w-0 truncate border border-[#3b4652] bg-[#19212a] px-1 text-left text-[10px] text-[#d7dbe1] hover:border-[#667789]">{names[(item + index) % names.length]}{item === 2 && index % 3 === 0 ? ' fx2' : ''}</button>)}</div>
  }
  const rows = [
    [['NebulaSphere', 0, 20], ['StB×5', 20, 12], ['PortalBloom fx3', 32, 36], ['Afterglow', 68, 32]],
    [['CometLoom ⇕2', 0, 32], ['EmberDrift · continues→', 32, 44], ['NightRibbon', 76, 24]],
    [['CometLoom ⇕2', 0, 32], ['RippleField ~1', 32, 44], ['Prism', 76, 24]],
    [['TestPattern1D', 0, 20], ['PhantomStar', 20, 38], ['Doorway', 58, 42]],
  ] as const
  return <>{rows[index].map(([name, left, width], item) => <button type="button" key={name} onClick={onSelect} style={{ left: `${left}%`, width: `${width}%` }} className={`absolute inset-y-0.5 min-w-0 truncate border px-1 text-left text-[10px] ${selected && item === 2 ? 'border-white bg-[#24303b] text-white shadow-[inset_0_2px_0_#67c7d6]' : 'border-[#3b4652] bg-[#19212a] text-[#d7dbe1] hover:border-[#667789]'}`}>{name}</button>)}{microOverview && <span className="pointer-events-none absolute inset-y-1 left-[20%] w-[12%] bg-[repeating-linear-gradient(90deg,transparent_0_3px,rgba(167,139,250,.5)_3px_4px)]" />}{index === 1 && <span className="pointer-events-none absolute inset-y-0 left-[58%] w-px bg-[#67c7d6]"><i className="absolute -top-0.5 -left-2 whitespace-nowrap bg-[#0b0f13] px-0.5 text-[9px] text-[#8dd6e0]">continue</i></span>}</>
}

function EffectSpans({ selected = false, onSelect }: { selected?: boolean; onSelect?: () => void }) {
  return <><button type="button" onClick={onSelect} className={`absolute inset-y-0.5 left-[21%] w-[22%] border px-1 text-left text-[10px] ${selected ? 'border-[#4fc4b0] bg-[#4fc4b0]/20 text-[#a7eadf]' : 'border-[#4fc4b0]/45 bg-[#4fc4b0]/10 text-[#8bdccc]'}`}>Swirl</button><button type="button" onClick={onSelect} className="absolute inset-y-0.5 left-[43%] w-[31%] border border-[#4fc4b0]/45 bg-[#4fc4b0]/10 px-1 text-left text-[10px] text-[#8bdccc]">Posterize</button></>
}

function AutomationStack({ properties, selected = false, onSelect }: { properties: string[]; selected?: boolean; onSelect?: () => void }) {
  return (
    <div className="border-b border-[#273039]">
      {properties.map((property, index) => {
        const focused = selected && index === 0
        return (
          <div key={property} className="grid" style={{ height: focused ? 22 : 14, gridTemplateColumns: 'var(--timeline-gutter) minmax(0,1fr)' }}>
            <div className="sticky left-0 z-20 flex items-center border-r border-t border-[#273039] bg-[#10151b] pl-5 pr-2 text-[10px] text-[#b6adc9]">↳ {property}{focused && <span className="ml-auto text-[9px] text-[#d5c8fb]">focused</span>}</div>
            <div className="relative border-t border-[#273039] bg-[#0c1116]"><AutomationCurve selected={focused} compact={!focused} onSelect={onSelect} /></div>
          </div>
        )
      })}
    </div>
  )
}

function AutomationCurve({ selected = false, compact = false, onSelect }: { selected?: boolean; compact?: boolean; onSelect?: () => void }) {
  return (
    <button type="button" onClick={onSelect} className="absolute inset-0 w-full" aria-label="Select animated property for exact editing">
      <svg viewBox={compact ? '0 0 100 10' : '0 0 100 20'} preserveAspectRatio="none" className={`absolute inset-x-[8%] w-[84%] overflow-visible ${compact ? 'top-0.5 h-[10px]' : 'top-0.5 h-[18px]'}`}>
        <path d={compact ? 'M0 8 C12 8 12 2 25 2 S40 6 50 5 S67 1 78 3 S90 7 100 2' : 'M0 16 C12 16 12 4 25 4 S40 12 50 10 S67 2 78 7 S90 14 100 3'} fill="none" stroke={automation} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      {[18, 31, 50, 73].map((left, index) => <i key={left} style={{ left: `${left}%`, top: compact ? `${index % 2 ? 3 : 7}px` : `${index % 2 ? 4 : 12}px` }} className={`absolute -translate-x-1/2 border ${compact ? 'size-1 rounded-full border-[#a78bfa] bg-[#a78bfa]' : 'size-1.5 rotate-45'} ${selected && index === 2 ? 'border-white bg-[#a78bfa] ring-2 ring-[#a78bfa]/35' : compact ? '' : 'border-[#c4b5fd] bg-[#5f4b8b]'}`} />)}
      {!compact && <span className="absolute right-2 top-0.5 font-mono text-[10px] text-[#c4b5fd]">1.240s · 0.62</span>}
    </button>
  )
}

function BoundaryReference({ incoming = false, combined = false, selected, onSelect }: { incoming?: boolean; combined?: boolean; selected: boolean; onSelect: () => void }) {
  return (
    <>
      {(incoming || combined) && <button type="button" onClick={onSelect} className={`absolute inset-y-0.5 left-0 w-[18.75%] border px-1 text-left font-mono text-[10px] ${selected ? 'border-[#e6b85c] bg-[#e6b85c]/20 text-[#f4d99f]' : 'border-[#e6b85c]/45 bg-[#e6b85c]/10 text-[#e8c77e]'}`}>in · Wipe 1.5s</button>}
      {(!incoming || combined) && <button type="button" onClick={onSelect} className={`absolute inset-y-0.5 left-[75%] w-[25%] border px-1 text-left font-mono text-[10px] ${selected ? 'border-[#e6b85c] bg-[#e6b85c]/20 text-[#f4d99f]' : 'border-[#e6b85c]/45 bg-[#e6b85c]/10 text-[#e8c77e]'}`}>out · Crossfade 2.0s</button>}
    </>
  )
}

function RapidCuts({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  const cuts = [
    ['StrobeA', 0, 11.25], ['StB', 11.25, 2.5], ['SA', 13.75, 1.25], ['StB', 15, 1.8], ['SA', 16.8, 1.9], ['StrobeCooldown', 18.7, 81.3],
  ] as const
  return <>{cuts.map(([name, left, width], index) => <button type="button" key={`${name}-${index}`} onClick={onSelect} style={{ left: `${left}%`, width: `${width}%` }} className={`absolute inset-y-0.5 min-w-[5px] overflow-hidden border text-left text-[10px] ${selected && index === 2 ? 'border-white bg-[#273542] text-white' : 'border-[#3b4652] bg-[#19212a] text-[#d7dbe1]'}`}><span className="px-1">{name}</span></button>)}</>
}

function SinglePlacement({ label, left, width, selected, onSelect, badges, overlay = false }: { label: string; left: string; width: string; selected: boolean; onSelect: () => void; badges?: string; overlay?: boolean }) {
  return <button type="button" onClick={onSelect} style={{ left, width }} className={`absolute inset-y-0.5 truncate border px-1.5 text-left text-[10px] ${selected ? 'border-white bg-[#25313c] text-white' : overlay ? 'border-[#67c7d6]/55 border-dashed bg-[#67c7d6]/8 text-[#b6e7ec]' : 'border-[#3b4652] bg-[#19212a] text-[#d7dbe1]'}`}>{label}<span className="ml-2 font-mono text-[9px] text-[#a2aab5]">{badges}</span></button>
}

function Playhead({ left }: { left: string }) {
  return <span className="pointer-events-none absolute bottom-0 top-0 z-50 w-px bg-[#f2cd75]" style={{ left: `calc(var(--timeline-gutter) + (100% - var(--timeline-gutter)) * ${Number.parseFloat(left) / 100})` }}><i className="absolute -left-[4px] top-0 size-2 rotate-45 bg-[#f2cd75]" /></span>
}

function ViewportNavigator() {
  return <div className="grid h-5 shrink-0 grid-cols-[136px_minmax(0,1fr)] border-t border-[#28313a] bg-[#0f1419] text-[10px]"><span className="border-r border-[#28313a] px-2 py-0.5 text-[#a2aab5]">Viewport</span><div className="relative mx-2 my-1 bg-[#252d36]"><span className="absolute inset-y-0 left-[30%] w-[38%] border-x border-[#67c7d6] bg-[#67c7d6]/20" /></div></div>
}

function StatusBar({ model }: { model: Model }) {
  return <div className="flex h-7 shrink-0 items-center border-t border-[#28313a] bg-[#10151b] px-2 text-[10px] text-[#a2aab5]"><span className="size-1.5 rounded-full bg-[#4fc4b0]" /><span className="ml-2">Compiles · 6.1 KB · estimated 2N at active Transition</span><span className="ml-auto">{model === 'fable' ? 'Status chip · click to expand' : 'Show output ready'}</span></div>
}

function FinalStatusBar({ message, snapEnabled }: { message: string; snapEnabled: boolean }) {
  return <div className="flex h-7 shrink-0 items-center border-t border-[#28313a] bg-[#10151b] px-2 text-[10px] text-[#a2aab5]" role="status"><span className="size-1.5 rounded-full bg-[#4fc4b0]" /><span className="ml-2">Compiles · 6.1 KB · estimated 2N at active Transition</span><span className="ml-auto mr-3 text-[#c8ced6]">{message}</span><span className={snapEnabled ? 'text-[#9adde4]' : 'text-[#7f8994]'}>{snapEnabled ? 'Snap on' : 'Snap off'}</span></div>
}

function EntityDetailPanel({ scope, selection, onClose, onOpenCatalogue, onEditBoundary }: { scope: Scope; selection: Selection; onClose: () => void; onOpenCatalogue: (mode: CatalogueMode) => void; onEditBoundary: () => void }) {
  const isTransition = selection === 'transition'
  const isEffect = selection === 'effect'
  const isZone = selection === 'zone'
  const title = isTransition ? (scope === 'scene' ? 'Incoming Wipe · reference' : 'Wipe · Linear east') : isEffect ? 'Effect · Swirl' : selection === 'keyframe' ? 'Brightness keyframe' : selection === 'scene' ? 'Scene · Strobe Break' : isZone ? 'Zone · Canopy' : 'Placement · PortalBloom'
  const accent = isTransition ? transition : isEffect ? effect : selection === 'keyframe' ? automation : isZone ? '#9aa6b2' : continuation
  const top = scope === 'scene' ? (isTransition ? 160 : 292) : isTransition ? 168 : 250
  return (
    <section className="absolute z-[60] w-[304px] border border-[#4a5664] bg-[#151b22] shadow-[0_18px_50px_rgba(0,0,0,.58)]" style={{ top, left: '42%' }} aria-label="Entity Detail Panel">
      <span className="absolute -top-5 left-10 h-5 w-px" style={{ background: accent }} /><span className="absolute -top-[5px] left-[37px] size-2 rotate-45" style={{ background: accent }} />
      <div className="flex h-8 items-center border-b border-[#303944] px-2 text-[11px]" style={{ boxShadow: `inset 3px 0 0 ${accent}` }}><strong className="truncate font-medium">{title}</strong><button type="button" className="ml-auto grid size-6 place-items-center text-[#a2aab5] hover:text-white" aria-label="Pin panel"><Pin size={12} /></button><button type="button" onClick={onClose} className="grid size-6 place-items-center text-[#a2aab5] hover:text-white" aria-label="Close panel"><X size={13} /></button></div>
      <div className="grid grid-cols-[82px_1fr] gap-x-2 gap-y-1.5 p-2 text-[10px] leading-[1.25]">
        <PanelLabel>Owner</PanelLabel><PanelFact>{isTransition ? 'Boundary after Portal Bloom' : isZone ? 'Atrium routing layout' : 'PortalBloom · Canopy'}</PanelFact>
        <PanelLabel>{isTransition ? 'Duration' : isZone ? 'Nominal pixels' : 'Amount'}</PanelLabel>{isZone ? <PanelFact>840 px</PanelFact> : <PanelField>{isTransition ? '2.0 s' : '0.65'}</PanelField>}
        <PanelLabel>{isTransition ? 'Easing' : isZone ? 'Map assignment' : 'Radius'}</PanelLabel>{isZone ? <PanelFact>Canopy · active</PanelFact> : <PanelField>{isTransition ? 'Sine in-out' : '0.70'}</PanelField>}
        {!isTransition && !isZone && <><PanelLabel>Active span</PanelLabel><PanelFact>01.20–02.85 local</PanelFact></>}
        <PanelLabel>{isZone ? 'Stage' : 'Cost'}</PanelLabel><PanelFact>{isZone ? 'Highlight available' : isTransition ? 'Two sources · 2N' : 'One source · smooth'}</PanelFact>
      </div>
      <div className="flex gap-1 border-t border-[#303944] p-2">
        {scope === 'scene' && isTransition ? <button type="button" onClick={onEditBoundary} className="h-7 flex-1 bg-[#e6b85c] px-2 text-[10px] font-semibold text-[#14181d]">Edit boundary in Show</button> : isZone ? <button type="button" className="h-7 flex-1 bg-[#aab4bf] px-2 text-[10px] font-semibold text-[#11151a]">Show Zone on Stage</button> : <button type="button" onClick={() => onOpenCatalogue(isTransition ? 'transition' : 'effect')} className="h-7 flex-1 px-2 text-[10px] font-semibold text-[#11151a]" style={{ background: accent }}>{isTransition ? 'Replace Transition' : 'Add Effect'}</button>}
        <button type="button" className={`h-7 px-2 text-[10px] ${control}`}>Advanced</button>
      </div>
    </section>
  )
}

function PanelLabel({ children }: { children: ReactNode }) { return <span className="py-1 text-[#a2aab5]">{children}</span> }
function PanelFact({ children }: { children: ReactNode }) { return <span className="py-1 text-[#c7cdd5]">{children}</span> }
function PanelField({ children }: { children: ReactNode }) { return <button type="button" className="flex h-7 items-center justify-between border border-[#3a4652] bg-[#0f1419] px-2 text-left font-mono text-[10px] text-white">{children}<ChevronDown size={11} className="text-[#a2aab5]" /></button> }

function FinalSceneInspector({ peak, onClose, onOpenScene }: { peak: boolean; onClose: () => void; onOpenScene: () => void }) {
  return <section className="absolute top-[116px] z-[72] min-w-[360px] max-w-[650px] border border-[#667483] bg-[#11171d] shadow-[0_22px_70px_rgba(0,0,0,.72)]" style={{ left: 'clamp(12px, 18%, 180px)', width: 'min(650px, calc(100% - clamp(12px, 18%, 180px) - 12px))' }} aria-label="Scene detail inspector">
    <span className="absolute -top-5 left-[18%] h-5 w-px bg-[#e6b85c]" /><span className="absolute -top-[5px] size-2 rotate-45 bg-[#e6b85c]" style={{ left: 'calc(18% - 3px)' }} />
    <div className="flex h-9 items-center border-b border-[#38434e] px-2 text-[10px]"><ScanSearch size={13} className="mr-2 text-[#f0ca76]" /><strong className="text-[11px] text-white">Strobe Break · {peak ? 'Super Detail' : 'Scene detail'}</strong><span className="ml-2 rounded-sm bg-[#252e37] px-1.5 py-0.5 text-[#b6bec7]">Read-only</span><span className="ml-2 font-mono text-[#9ea7b2]">SHOW 1:10–1:18 · LOCAL 0–8s</span><button type="button" onClick={onOpenScene} className="ml-auto h-7 border border-[#e6b85c] bg-[#e6b85c]/12 px-2 font-semibold text-[#f1d18c] hover:bg-[#e6b85c]/20">Open Scene</button><button type="button" onClick={onClose} className="ml-1 grid size-7 place-items-center text-[#a2aab5] hover:text-white" aria-label="Close Scene inspector"><X size={13} /></button></div>
    <div className="grid h-6 grid-cols-[72px_repeat(9,minmax(0,1fr))] border-b border-[#303944] font-mono text-[9px] text-[#9ea7b2]"><span className="flex items-center border-r border-[#303944] px-2 uppercase tracking-[0.08em]">local</span>{['0', '1', '2', '3', '4', '5', '6', '7', '8'].map((tick) => <span key={tick} className="flex items-center border-r border-[#222a32] px-1">{tick}</span>)}</div>
    <InspectorRow label="bounds" accent={transition}><span className="absolute inset-y-1 left-0 w-[19%] border border-[#e6b85c]/55 bg-[#e6b85c]/10 px-1 text-[#efd08c]">in · Wipe</span><span className="absolute inset-y-1 right-0 w-[25%] border border-[#e6b85c]/55 bg-[#e6b85c]/10 px-1 text-[#efd08c]">out · Crossfade</span></InspectorRow>
    <InspectorRow label="canopy" accent="#c9d0d7"><span className="absolute inset-y-1 left-0 w-[11%] bg-[#293541] px-1">StrobeA</span><span className="absolute inset-y-1 left-[11%] w-[3%] bg-[#405063]" /><span className="absolute inset-y-1 left-[14%] w-[3%] bg-[#293541]" /><span className="absolute inset-y-1 left-[17%] w-[3%] bg-[#405063]" /><span className="absolute inset-y-1 left-[20%] right-0 bg-[#293541] px-1">StrobeCooldown</span></InspectorRow>
    <InspectorRow label="effects" accent={effect}><span className="absolute inset-y-1 left-[20%] w-[28%] border border-[#4fc4b0]/55 bg-[#4fc4b0]/10 px-1 text-[#99e3d7]">Swirl</span><span className="absolute inset-y-1 left-[48%] w-[35%] border border-[#4fc4b0]/55 bg-[#4fc4b0]/10 px-1 text-[#99e3d7]">Posterize</span></InspectorRow>
    <InspectorRow label="brightness" accent={automation}><AutomationCurve compact /></InspectorRow>
    <InspectorRow label="columns" accent="#c9d0d7"><span className="absolute inset-y-1 left-0 right-0 border border-[#3b4652] bg-[#202a34] px-1">CometLoom · continuing state</span></InspectorRow>
    {peak && <>
      <InspectorRow label="↳ effects" accent={effect}><span className="absolute inset-y-1 left-[20%] w-[28%] border border-[#4fc4b0]/55 bg-[#4fc4b0]/10 px-1 text-[#99e3d7]">Swirl</span><span className="absolute inset-y-1 left-[52%] w-[31%] border border-[#4fc4b0]/55 bg-[#4fc4b0]/10 px-1 text-[#99e3d7]">Posterize</span></InspectorRow>
      <InspectorRow label="↳ overlay" accent={continuation}><span className="absolute inset-y-1 left-[25%] w-[49%] border border-dashed border-[#67c7d6]/60 bg-[#67c7d6]/8 px-1 text-[#b6e7ec]">SparkVeil · continues</span></InspectorRow>
      <InspectorRow label="↳ opacity" accent={automation}><AutomationCurve compact /></InspectorRow>
      <InspectorRow label="floor" accent="#c9d0d7"><span className="absolute inset-y-1 left-0 right-0 border border-[#3b4652] bg-[#202a34] px-1">RippleField · fx2 · ~2</span></InspectorRow>
      <InspectorRow label="↳ effects" accent={effect}><span className="absolute inset-y-1 left-[12%] w-[34%] border border-[#4fc4b0]/55 bg-[#4fc4b0]/10 px-1 text-[#99e3d7]">Kaleidoscope</span><span className="absolute inset-y-1 left-[52%] w-[32%] border border-[#4fc4b0]/55 bg-[#4fc4b0]/10 px-1 text-[#99e3d7]">Bloom</span></InspectorRow>
      <InspectorRow label="↳ position X" accent={automation}><AutomationCurve compact /></InspectorRow>
      <InspectorRow label="↳ brightness" accent={automation}><AutomationCurve compact /></InspectorRow>
      <InspectorRow label="entry" accent="#c9d0d7"><span className="absolute inset-y-1 left-0 w-[18%] bg-[#293541] px-1">SignalGate</span><span className="absolute inset-y-1 left-[18%] w-[9%] bg-[#405063] px-1">Flash</span><span className="absolute inset-y-1 left-[27%] w-[31%] bg-[#293541] px-1">DoorwayEcho</span><span className="absolute inset-y-1 left-[58%] right-0 bg-[#202a34] px-1">Blackout</span></InspectorRow>
      <InspectorRow label="↳ effects" accent={effect}><span className="absolute inset-y-1 left-[20%] w-[28%] border border-[#4fc4b0]/55 bg-[#4fc4b0]/10 px-1 text-[#99e3d7]">Threshold</span><span className="absolute inset-y-1 left-[50%] w-[32%] border border-[#4fc4b0]/55 bg-[#4fc4b0]/10 px-1 text-[#99e3d7]">Posterize</span></InspectorRow>
      <InspectorRow label="↳ speed" accent={automation}><AutomationCurve compact /></InspectorRow>
    </>}
  </section>
}

function InspectorRow({ label, accent, children }: { label: string; accent: string; children: ReactNode }) {
  return <div className="grid h-7 grid-cols-[72px_minmax(0,1fr)] border-b border-[#273039] text-[10px]"><span className="flex items-center border-r border-[#303944] px-2" style={{ color: accent }}>{label}</span><span className="relative overflow-hidden">{children}</span></div>
}

function CompactVisualPalette({ mode, owner, onClose, onApply }: { mode: CatalogueMode; owner: string; onClose: () => void; onApply: () => void }) {
  const kind = mode as ShowToolkitKind
  const catalogue = useMemo(() => buildShowToolkitPresentationCatalogue({ stageDimensions: 2 }).filter((item) => item.kind === kind), [kind])
  const initialFamily = mode === 'transition' ? 'Wipe' : 'Distortion'
  const [family, setFamily] = useState(initialFamily)
  const [query, setQuery] = useState('')
  const [candidateKey, setCandidateKey] = useState(mode === 'transition' ? 'transition:wipe:linear' : 'effect:distortion:swirl')
  const families = [...new Set(catalogue.map((item) => item.familyLabel))]
  const visible = catalogue.filter((item) => (!query && item.familyLabel === family) || (query && item.searchText.includes(query.toLowerCase())))
  const candidate = catalogue.find((item) => item.key === candidateKey) ?? visible[0]
  const runtimeVariant = candidate && SHOW_VISUAL_TOOLKIT_REGISTRY.find((entry) => entry.kind === candidate.kind && entry.id === candidate.familyId)?.variants.find((variant) => variant.id === candidate.variantId)
  const accent = mode === 'transition' ? transition : effect
  return <section className="absolute top-[82px] z-[78] grid h-[350px] grid-cols-[116px_minmax(250px,1fr)_180px] border border-[#5a6876] bg-[#11171d] shadow-[0_24px_80px_rgba(0,0,0,.76)] max-[760px]:grid-cols-[108px_minmax(240px,1fr)]" style={{ left: 'clamp(16px, 10%, 120px)', width: 'min(640px, calc(100% - clamp(16px, 10%, 120px) - 16px))' }} aria-label={`${mode} palette`}>
    <div className="flex min-h-0 flex-col border-r border-[#303944] bg-[#0d1217]"><div className="border-b border-[#303944] p-2"><strong className="text-[10px] uppercase tracking-[0.09em]" style={{ color: accent }}>{mode === 'transition' ? 'Transitions' : 'Effects'}</strong><p className="mt-1 line-clamp-2 text-[9px] leading-[1.3] text-[#9ea7b2]">{owner}</p></div><nav className="min-h-0 flex-1 overflow-auto p-1">{families.map((item) => <button type="button" key={item} onClick={() => { setFamily(item); setQuery(''); const first = catalogue.find((entry) => entry.familyLabel === item); if (first) setCandidateKey(first.key) }} className={`mb-px flex h-7 w-full items-center px-2 text-left text-[10px] ${family === item && !query ? 'bg-white/9 text-white shadow-[inset_2px_0_0_#e6b85c]' : 'text-[#9ea7b2] hover:bg-white/5 hover:text-white'}`}>{item}</button>)}</nav></div>
    <div className="flex min-h-0 flex-col"><div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#303944] p-1.5"><label className="relative min-w-0 flex-1"><Search className="absolute left-2 top-1.5 text-[#9ea7b2]" size={12} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-7 w-full border border-[#3a4652] bg-[#0b1015] pl-7 pr-2 text-[10px] text-white outline-none focus:border-[#e6b85c]" placeholder={`Search ${catalogue.length}`} /></label><button type="button" onClick={onClose} className="grid size-7 place-items-center text-[#9ea7b2] hover:text-white" aria-label="Close palette"><X size={13} /></button></div><div className="min-h-0 flex-1 overflow-auto p-1">{visible.map((item) => <button type="button" key={item.key} onMouseEnter={() => setCandidateKey(item.key)} onFocus={() => setCandidateKey(item.key)} onClick={() => setCandidateKey(item.key)} className={`mb-px grid h-8 w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-1.5 px-1.5 text-left text-[10px] ${candidate?.key === item.key ? 'bg-[#24303a] text-white' : 'text-[#c7cdd5] hover:bg-white/6'}`}><span className="relative grid size-5 place-items-center border border-[#465361] bg-[#0b1015]"><i className="block size-2.5 rotate-45 border" style={{ borderColor: accent, borderRadius: item.familyId === 'shape-reveal' ? '50%' : 0 }} /></span><span className="truncate font-medium">{item.label}</span><span className="font-mono text-[9px] text-[#7f8a96]">2D</span></button>)}</div></div>
    <div className="flex min-h-0 flex-col border-l border-[#303944] bg-[#151b22] p-2 max-[760px]:hidden"><span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9ea7b2]">Hover preview</span><h2 className="mt-2 text-[13px] font-semibold text-white">{candidate?.label ?? 'No result'}</h2><p className="mt-1 text-[10px] leading-[1.4] text-[#b8c0c9]">{candidate?.summary}</p><div className="mt-3 h-12 overflow-hidden border border-[#3b4652] bg-[#0b1015] p-2"><span className="block h-full w-full bg-[repeating-linear-gradient(120deg,transparent_0_12px,rgba(79,196,176,.42)_12px_14px)] transition-transform duration-500 hover:translate-x-2" /></div><span className="mt-3 text-[9px] font-semibold uppercase tracking-[0.07em] text-[#9ea7b2]">Starting preset</span><div className="mt-1 flex flex-wrap gap-1">{(runtimeVariant?.presets ?? []).slice(0, 3).map((preset) => <button type="button" key={preset.id} className="border border-[#465361] bg-[#0f1419] px-1.5 py-1 text-[9px] text-[#d7dbe1] hover:border-[#e6b85c]">{preset.label}</button>)}{!runtimeVariant?.presets?.length && <span className="text-[9px] text-[#9ea7b2]">Default</span>}</div><p className="mt-auto text-[9px] leading-[1.35] text-[#8f99a5]">Stage previews this candidate temporarily. Exact parameters remain in Entity Details.</p><button type="button" onClick={onApply} className="mt-2 h-8 w-full text-[10px] font-semibold text-[#101419]" style={{ background: accent }}>{mode === 'transition' ? 'Use Transition' : 'Add Effect'}</button></div>
  </section>
}

function VisualCatalogue({ mode, owner, onClose, onApply }: { mode: CatalogueMode; owner: string; onClose: () => void; onApply: () => void }) {
  const kind = mode as ShowToolkitKind
  const catalogue = useMemo(() => buildShowToolkitPresentationCatalogue({ stageDimensions: 2 }).filter((item) => item.kind === kind), [kind])
  const initialFamily = mode === 'transition' ? 'Wipe' : 'Distortion'
  const [family, setFamily] = useState(initialFamily)
  const [query, setQuery] = useState('')
  const [candidateKey, setCandidateKey] = useState(mode === 'transition' ? 'transition:wipe:linear' : 'effect:distortion:swirl')
  const families = [...new Set(catalogue.map((item) => item.familyLabel))]
  const visible = catalogue.filter((item) => (!query && item.familyLabel === family) || (query && item.searchText.includes(query.toLowerCase())))
  const candidate = catalogue.find((item) => item.key === candidateKey) ?? visible[0]
  const runtimeVariant = candidate && SHOW_VISUAL_TOOLKIT_REGISTRY.find((entry) => entry.kind === candidate.kind && entry.id === candidate.familyId)?.variants.find((variant) => variant.id === candidate.variantId)
  return (
    <section className="absolute inset-3 z-[75] grid min-h-0 grid-cols-[138px_minmax(300px,1fr)_224px] border border-[#536170] bg-[#11171d] shadow-[0_24px_80px_rgba(0,0,0,.72)] max-[820px]:grid-cols-[118px_minmax(280px,1fr)]" aria-label={`${mode} catalogue`}>
      <div className="flex min-h-0 flex-col border-r border-[#303944] bg-[#0e1318]">
        <div className="border-b border-[#303944] p-2"><span className="text-[10px] font-semibold uppercase tracking-[0.09em]" style={{ color: mode === 'transition' ? transition : effect }}>{mode === 'transition' ? 'Transitions' : 'Effects'}</span><p className="mt-1 text-[10px] leading-[1.3] text-[#a2aab5]">{owner}</p></div>
        <nav className="min-h-0 flex-1 overflow-auto p-1.5">{families.map((item) => <button type="button" key={item} onClick={() => { setFamily(item); setQuery(''); const first = catalogue.find((entry) => entry.familyLabel === item); if (first) setCandidateKey(first.key) }} className={`mb-1 flex h-7 w-full items-center px-2 text-left text-[10px] ${family === item && !query ? 'bg-white/9 text-white shadow-[inset_2px_0_0_#e6b85c]' : 'text-[#a2aab5] hover:bg-white/5 hover:text-white'}`}>{item}</button>)}</nav>
        <button type="button" onClick={onClose} className="m-2 h-7 border border-[#3a4652] text-[10px] text-[#c7cdd5]">Cancel</button>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[#303944] p-2"><label className="relative min-w-0 flex-1"><Search className="absolute left-2 top-1.5 text-[#a2aab5]" size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-7 w-full border border-[#3a4652] bg-[#0c1116] pl-7 pr-2 text-[10px] text-white outline-none focus:border-[#e6b85c]" placeholder={`Search ${catalogue.length} ${mode}s and presets`} /></label><span className="text-[10px] text-[#a2aab5]">2D compatible</span><button type="button" onClick={onClose} className="grid size-7 place-items-center text-[#a2aab5] hover:text-white" aria-label="Close catalogue"><X size={14} /></button></div>
        <div className="grid min-h-0 flex-1 auto-rows-[92px] grid-cols-2 gap-px overflow-auto bg-[#0c1116] min-[1040px]:grid-cols-3">{visible.map((item) => <CatalogueTile key={item.key} item={item} selected={candidate?.key === item.key} onSelect={() => setCandidateKey(item.key)} />)}</div>
      </div>

      <div className="flex min-h-0 flex-col border-l border-[#303944] bg-[#151b22] p-3 max-[820px]:hidden">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a2aab5]">Candidate preview</span>
        <CandidateVisual item={candidate} />
        <h2 className="mt-3 text-[14px] font-semibold text-white">{candidate?.label ?? 'No result'}</h2>
        <p className="mt-1 text-[10px] leading-[1.4] text-[#b5bcc5]">{candidate?.summary}</p>
        <div className="mt-3 border-t border-[#303944] pt-2"><span className="text-[10px] font-semibold text-[#a2aab5]">Starting presets</span><div className="mt-2 flex flex-wrap gap-1">{(runtimeVariant?.presets ?? []).map((preset) => <button type="button" key={preset.id} className="border border-[#465361] bg-[#0f1419] px-2 py-1 text-[10px] text-[#d7dbe1] hover:border-[#e6b85c]">{preset.label}</button>)}{!runtimeVariant?.presets?.length && <span className="text-[10px] text-[#a2aab5]">Default parameters</span>}</div></div>
        <div className="mt-auto"><p className="mb-2 text-[10px] leading-[1.35] text-[#a2aab5]">Preview is temporary. Escape restores the saved Show.</p><button type="button" onClick={onApply} className="h-9 w-full text-[11px] font-semibold text-[#101419]" style={{ background: mode === 'transition' ? transition : effect }}>{mode === 'transition' ? 'Use on boundary' : 'Add Effect'}</button></div>
      </div>
    </section>
  )
}

function CatalogueTile({ item, selected, onSelect }: { item: ShowToolkitPresentationItem; selected: boolean; onSelect: () => void }) {
  const accent = item.kind === 'transition' ? transition : effect
  return <button type="button" onClick={onSelect} className={`relative bg-[#141a20] p-2 text-left hover:bg-[#1a222a] focus-visible:z-10 focus-visible:outline-2 ${selected ? 'bg-[#1c242c]' : ''}`} style={{ boxShadow: selected ? `inset 3px 0 0 ${accent}` : undefined }}><span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#a2aab5]">{item.familyLabel}</span><span className="mt-1 block text-[12px] font-medium text-white">{item.label}</span><span className="mt-1 line-clamp-2 text-[10px] leading-[1.3] text-[#b5bcc5]">{item.summary}</span><TileMark item={item} /></button>
}

function TileMark({ item }: { item: ShowToolkitPresentationItem }) {
  const color = item.kind === 'transition' ? transition : effect
  return <span className="absolute bottom-2 right-2 grid size-6 place-items-center border border-[#465361] bg-[#0b0f13]" aria-hidden><i className="block size-3 rotate-45 border" style={{ borderColor: color, borderRadius: item.familyId === 'shape-reveal' ? '50%' : 0 }} /></span>
}

function CandidateVisual({ item }: { item?: ShowToolkitPresentationItem }) {
  return <div className="relative mt-3 aspect-[4/3] overflow-hidden border border-[#465361] bg-[radial-gradient(circle_at_32%_40%,#4fc4b0_0_3%,transparent_4%),radial-gradient(circle_at_66%_55%,#a78bfa_0_4%,transparent_5%),#080c10]"><div className="absolute inset-3 border border-[#3a4652]" /><span className="absolute inset-y-0 left-[48%] w-px bg-[#e6b85c] shadow-[0_0_14px_#e6b85c]" /><span className="absolute bottom-2 left-2 bg-[#0b0f13]/90 px-1.5 py-1 text-[10px] text-[#f1d18c]">Previewing {item?.familyLabel} · {item?.label}</span></div>
}

function Stage({ scope, playing, zonesVisible, previewing, onPlaying, onZonesVisible }: { scope: Scope; playing: boolean; zonesVisible: boolean; previewing: boolean; onPlaying: (playing: boolean) => void; onZonesVisible: (visible: boolean) => void }) {
  return (
    <aside className="hidden w-[286px] shrink-0 flex-col bg-[#0d1116] min-[900px]:flex min-[1260px]:w-[304px]">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#070a0e]">
        <div className="absolute inset-0 opacity-90" style={{ background: 'radial-gradient(circle at 35% 42%, #d39a3b 0 2%, transparent 3%), radial-gradient(circle at 62% 38%, #7443ba 0 4%, transparent 5%), radial-gradient(circle at 48% 64%, #268f93 0 3%, transparent 4%), radial-gradient(ellipse at center, #151821 0, #070a0e 68%)' }} />
        <div className="absolute inset-x-[12%] top-[14%] h-[62%] border border-[#35414c]" />
        {zonesVisible && <><div className="absolute left-[12%] top-[14%] h-[31%] w-[44%] border border-[#67c7d6] bg-[#67c7d6]/15 p-1 text-[10px] font-semibold text-[#b7e7ec]">Canopy</div><div className="absolute right-[12%] top-[14%] h-[31%] w-[44%] border border-[#e6b85c] bg-[#e6b85c]/12 p-1 text-[10px] font-semibold text-[#f1d18c]">Columns</div><div className="absolute bottom-[24%] left-[12%] h-[31%] w-[55%] border border-[#a78bfa] bg-[#a78bfa]/12 p-1 text-[10px] font-semibold text-[#d5c8fb]">Floor</div></>}
        {previewing && <div className="absolute inset-5 border border-[#e6b85c]/60 bg-[#e6b85c]/5"><span className="absolute inset-y-0 left-1/2 w-px bg-[#e6b85c] shadow-[0_0_18px_#e6b85c]" /><span className="absolute bottom-2 left-2 bg-[#0b0f13]/90 px-2 py-1 text-[10px] text-[#f1d18c]">Temporary candidate preview</span></div>}
        <div className="absolute left-3 top-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b5bcc5]">Stage · {scope === 'show' ? 'Show output' : 'Scene composite'}</div>
        <div className="absolute bottom-3 right-3 font-mono text-[10px] text-[#a2aab5]">2,088 px · 2D</div>
      </div>
      <div className="border-t border-[#28313a] bg-[#10151b] p-2 text-[10px]"><div className="flex items-center gap-2"><button type="button" onClick={() => onPlaying(!playing)} className="grid size-7 place-items-center bg-[#e6b85c] text-[#11151a]" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button><span className="font-mono text-[#f1d18c]">{scope === 'show' ? '01:12.4' : 'LOCAL 01.240'}</span><button type="button" onClick={() => onZonesVisible(!zonesVisible)} className={`ml-auto flex h-7 items-center gap-1 px-2 ${zonesVisible ? 'border border-[#67c7d6] bg-[#67c7d6]/12 text-[#b7e7ec]' : control}`}><Eye size={12} /> {zonesVisible ? 'Hide zones' : 'Show zones'}</button></div><div className="mt-2 h-1 bg-[#303944]"><div className="h-full w-[43%] bg-[#e6b85c]" /></div></div>
    </aside>
  )
}

function RoundTwoSwitcher({ model, scope, fixture, onModel, onScope, onFixture }: { model: Model; scope: Scope; fixture: Fixture; onModel: (model: Model) => void; onScope: (scope: Scope) => void; onFixture: (fixture: Fixture) => void }) {
  const goRoundOne = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('round')
    window.location.href = url.toString()
  }
  return <div className="fixed bottom-3 left-1/2 z-[90] flex -translate-x-1/2 items-center border border-[#536170] bg-[#0d1217] p-1 text-[10px] shadow-2xl shadow-black/80"><button type="button" onClick={goRoundOne} className="h-7 px-2 text-[#a2aab5] hover:text-white">Round 1</button><span className="mx-1 h-5 w-px bg-[#303944]" />{(['codex', 'fable'] as const).map((item) => <button type="button" key={item} onClick={() => onModel(item)} className={`h-7 px-3 capitalize ${model === item ? 'bg-[#e6b85c] text-[#11151a]' : 'text-[#a2aab5] hover:bg-white/7 hover:text-white'}`}>{item}</button>)}<span className="mx-1 h-5 w-px bg-[#303944]" />{(['show', 'scene'] as const).map((item) => <button type="button" key={item} onClick={() => onScope(item)} className={`h-7 px-3 ${scope === item ? 'bg-[#67c7d6] text-[#101419]' : 'text-[#a2aab5] hover:bg-white/7 hover:text-white'}`}>{item === 'show' ? 'Global' : 'Scene local'}</button>)}<span className="mx-1 h-5 w-px bg-[#303944]" />{(['atrium', 'cathedral'] as const).map((item) => <button type="button" key={item} onClick={() => onFixture(item)} className={`h-7 px-2 capitalize ${fixture === item ? 'bg-[#25313b] text-white' : 'text-[#a2aab5] hover:text-white'}`}>{item}</button>)}</div>
}

function FinalSwitcher({ scope, fixture, onScope, onFixture }: { scope: Scope; fixture: Fixture; onScope: (scope: Scope) => void; onFixture: (fixture: Fixture) => void }) {
  return <div className="fixed bottom-3 left-1/2 z-[90] flex -translate-x-1/2 items-center border border-[#536170] bg-[#0d1217] p-1 text-[10px] shadow-2xl shadow-black/80"><span className="px-2 font-semibold uppercase tracking-[0.08em] text-[#7ed9ca]">Final</span><span className="mx-1 h-5 w-px bg-[#303944]" />{(['show', 'scene'] as const).map((item) => <button type="button" key={item} onClick={() => onScope(item)} className={`h-7 px-3 ${scope === item ? 'bg-[#67c7d6] text-[#101419]' : 'text-[#a2aab5] hover:bg-white/7 hover:text-white'}`}>{item === 'show' ? 'Global Show' : 'Scene local'}</button>)}<span className="mx-1 h-5 w-px bg-[#303944]" />{(['atrium', 'cathedral'] as const).map((item) => <button type="button" key={item} onClick={() => onFixture(item)} className={`h-7 px-2 capitalize ${fixture === item ? 'bg-[#25313b] text-white' : 'text-[#a2aab5] hover:text-white'}`}>{item}</button>)}</div>
}
