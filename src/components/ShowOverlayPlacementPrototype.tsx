import { useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  GripVertical,
  Layers3,
  Lock,
  Magnet,
  Maximize2,
  Pause,
  Play,
  Plus,
  Search,
  SkipBack,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  addOverlayClip,
  addOverlayLayer,
  createNeonOrchardOverlayState,
  duplicateOverlayPlacement,
  moveOverlayClip,
  removeOverlayPlacement,
  reorderOverlayLayer,
  resizeOverlayClip,
  resolveLayerDrag,
  selectOverlayLayer,
  selectOverlayPlacement,
  setPlacementInstancePolicy,
  summarizeOverlayCost,
  type OverlayPrototypeState,
  type PrototypeOverlayLayer,
  type PrototypePlacement,
} from '@/engine/showOverlayPlacementPrototypeState'

// PROTOTYPE ONLY: #458 Scene x Zone composition study.
// Route: ?prototype=timeline-dual&study=scene-overlays&variant=A|B|C

type Variant = 'A' | 'B' | 'C'
type TimelineDragMode = 'move' | 'start' | 'end'

const border = 'border border-[#34404b]'
const button = `${border} bg-[#141a20] text-[#aeb7c1] hover:border-[#586675] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e6b85c]`
const overlayColor = '#67c7d6'
const effectColor = '#4fc4b0'
const automationColor = '#a78bfa'

export function ShowOverlayPlacementPrototype() {
  const params = new URLSearchParams(window.location.search)
  const initialVariant = params.get('variant')
  const [variant, setVariantState] = useState<Variant>(initialVariant === 'B' || initialVariant === 'C' ? initialVariant : 'A')
  const [state, setState] = useState(createNeonOrchardOverlayState)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(3.2)
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [zonesVisible, setZonesVisible] = useState(true)
  const [placementsVisible, setPlacementsVisible] = useState(true)
  const [guidesVisible, setGuidesVisible] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const selected = state.placements.find((item) => item.id === state.selectedPlacementId) ?? state.placements[0]
  const selectedLayer = state.layers.find((item) => item.id === (selected?.layerId ?? state.selectedLayerId)) ?? state.layers[0]
  const cost = useMemo(() => summarizeOverlayCost(state), [state])
  const timelineRef = useRef<HTMLDivElement>(null)

  const setVariant = (next: Variant) => {
    setVariantState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.history.replaceState({}, '', url)
  }

  const selectPlacement = (id: string) => {
    setState((current) => selectOverlayPlacement(current, id))
    setInspectorOpen(true)
  }

  const beginTimelineDrag = (event: ReactPointerEvent, placement: PrototypePlacement, mode: TimelineDragMode) => {
    if (placement.role !== 'overlay' || !placement.layerId) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const initial = state
    const width = timelineRef.current?.getBoundingClientRect().width ?? 1
    const onMove = (nextEvent: PointerEvent) => {
      const deltaSeconds = (nextEvent.clientX - startX) / width * initial.sceneDuration
      if (mode === 'move') {
        const targetLayerId = resolveLayerDrag(initial.layers, placement.layerId!, nextEvent.clientY - startY)
        setState(moveOverlayClip(initial, placement.id, { proposedStart: placement.start + deltaSeconds, targetLayerId }))
      } else {
        setState(resizeOverlayClip(initial, placement.id, mode, deltaSeconds))
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const inspectorTop = variant === 'A'
    ? 116 + Math.max(0, state.layers.findIndex((layer) => layer.id === selected?.layerId)) * 32
    : variant === 'B' ? 132 : 154

  return (
    <div className="overlay-prototype flex h-screen min-h-0 flex-col overflow-hidden bg-[#090c10] text-[#e7eaf0]">
      <style>{prototypeStyles}</style>
      <header className="flex h-10 shrink-0 items-center border-b border-[#28313a] bg-[#0d1116] px-3 text-[11px]">
        <span className="border border-[#67c7d6]/45 bg-[#67c7d6]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9adde4]">Revised study</span>
        <strong className="ml-3 font-medium">Neon Orchard</strong>
        <span className="ml-2 text-[#929da9]">Scene × Zone composition · Option {variant}</span>
        <span className="ml-auto text-[10px] text-[#929da9]">Scene local · 8.0 s · prototype state</span>
      </header>

      <div className={`overlay-workspace ${libraryOpen ? '' : 'library-closed'} min-h-0 flex-1`}>
        {libraryOpen && <PrototypeLibrary onCollapse={() => setLibraryOpen(false)} />}

        <main className="overlay-center relative flex min-h-0 min-w-0 flex-col overflow-hidden border-x border-[#28313a] bg-[#0b0f13]">
          <ScopeBar onRestoreLibrary={() => setLibraryOpen(true)} libraryOpen={libraryOpen} />
          <Transport
            playing={playing}
            zoom={zoom}
            onPlaying={setPlaying}
            onZoom={setZoom}
            onAddClip={() => setState((current) => addOverlayClip(current))}
            onAddLayer={() => setState(addOverlayLayer)}
          />
          <div className="min-h-0 flex-1 overflow-auto pb-28">
            <TimelineHeader />
            <div ref={timelineRef} className="relative min-w-[720px]" style={{ width: `${Math.max(100, zoom * 32)}%` }}>
              <SceneTransitionRow />
              <VariantNote variant={variant} />
              {variant === 'A' && <LayerRail state={state} onState={setState} onSelect={selectPlacement} onDrag={beginTimelineDrag} guidesVisible={guidesVisible} />}
              {variant === 'B' && <FocusBands state={state} onState={setState} onSelect={selectPlacement} onDrag={beginTimelineDrag} guidesVisible={guidesVisible} />}
              {variant === 'C' && <FocusedLayerBridge state={state} onState={setState} onSelect={selectPlacement} onDrag={beginTimelineDrag} guidesVisible={guidesVisible} />}
              <MainClipRow state={state} onSelect={selectPlacement} />
              <AutomationRow placement={selected} />
              {state.snapGuideSeconds !== undefined && <div className="pointer-events-none absolute bottom-0 top-0 z-50 w-px bg-[#7ed9ca] shadow-[0_0_6px_#7ed9ca]" style={{ left: `calc(136px + (100% - 136px) * ${state.snapGuideSeconds / state.sceneDuration})` }}><span className="absolute -top-4 -translate-x-1/2 bg-[#17312f] px-1 font-mono text-[8px] text-[#a5eee3]">{state.snapGuideSeconds.toFixed(2)}</span></div>}
              <div className="pointer-events-none absolute bottom-0 top-0 left-[43%] z-40 w-px bg-[#e6b85c] shadow-[0_0_6px_#e6b85c]" />
            </div>
          </div>
          <div className="flex h-6 shrink-0 items-center border-t border-[#28313a] bg-[#0d1217] px-2 text-[9px] text-[#929da9]">
            <span>{state.sceneName} / {state.zoneName} · other zones remain visible only on Stage</span>
            <span className="ml-auto font-mono text-[#8fded2]">peak {cost.peakSources} sources · {cost.effectPasses} Effect passes</span>
          </div>
          {selected && inspectorOpen && <PlacementInspector
            placement={selected}
            layer={selectedLayer}
            top={inspectorTop}
            onClose={() => setInspectorOpen(false)}
            onDuplicate={() => setState((current) => duplicateOverlayPlacement(current, selected.id))}
            onRemove={() => setState((current) => removeOverlayPlacement(current, selected.id))}
            onInstancePolicy={(instancePolicy) => setState((current) => setPlacementInstancePolicy(current, selected.id, instancePolicy))}
          />}
        </main>

        <PrototypeStage
          state={state}
          selectedId={state.selectedPlacementId}
          playing={playing}
          zonesVisible={zonesVisible}
          placementsVisible={placementsVisible}
          guidesVisible={guidesVisible}
          onPlaying={setPlaying}
          onZonesVisible={setZonesVisible}
          onPlacementsVisible={setPlacementsVisible}
          onGuidesVisible={setGuidesVisible}
        />
      </div>

      <VariantSwitcher variant={variant} onVariant={setVariant} onReset={() => setState(createNeonOrchardOverlayState())} />
    </div>
  )
}

function PrototypeLibrary({ onCollapse }: { onCollapse: () => void }) {
  return <aside className="overlay-library min-h-0 flex-col bg-[#0d1116] text-[10px]">
    <div className="flex h-9 items-center gap-2 border-b border-[#28313a] px-2 text-[#929da9]"><Search size={12} /> Filter library<button type="button" onClick={onCollapse} className="ml-auto grid size-6 place-items-center hover:text-white" aria-label="Collapse library"><ChevronLeft size={13} /></button></div>
    <Label>Shows</Label>
    <div className="border-l-2 border-[#67c7d6] bg-[#67c7d6]/8 px-3 py-2 text-white">Neon Orchard<span className="block font-mono text-[9px] text-[#929da9]">00:48 · 5 Scenes · 4 zones</span></div>
    <Label>Patterns</Label>
    {['Neon Orchard', 'Pulse Canopy', 'Spark Veil', 'Comet Loom', 'Ripple Field', 'Portal Bloom'].map((name) => <button type="button" key={name} className="px-3 py-1.5 text-left text-[#aeb7c1] hover:bg-white/5 hover:text-white">{name}</button>)}
  </aside>
}

function Label({ children }: { children: ReactNode }) {
  return <span className="px-3 pb-1 pt-3 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#65717c]">{children}</span>
}

function ScopeBar({ onRestoreLibrary, libraryOpen }: { onRestoreLibrary: () => void; libraryOpen: boolean }) {
  return <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[#28313a] bg-[#10151b] px-2 text-[10px]">
    {!libraryOpen && <button type="button" onClick={onRestoreLibrary} className="mr-1 grid size-6 place-items-center text-[#929da9] hover:text-white" aria-label="Restore library"><ChevronRight size={13} /></button>}
    <button type="button" className={`mr-1 flex h-6 items-center gap-1 px-2 ${button}`}><ChevronLeft size={11} /> Show</button>
    <button type="button" className="text-[#aab4be] hover:text-white">Scene 2 · Orchard Wake</button><ChevronRight size={10} className="text-[#4e5964]" />
    <button type="button" className="flex items-center gap-1 border border-[#394550] bg-[#12181e] px-2 py-1 text-[#9ba6b0]">Quad layout <ChevronDown size={9} /></button><ChevronRight size={10} className="text-[#4e5964]" />
    <span className="flex items-center gap-1.5 border border-[#67c7d6]/45 bg-[#67c7d6]/10 px-2 py-1 text-[#b8e8ec]"><i className="size-1.5 bg-[#67c7d6]" /> Canopy · 840 px</span>
    <span className="ml-auto text-[9px] text-[#737f8a]">One Zone in focus · final Scene output remains on Stage</span>
  </div>
}

function Transport({ playing, zoom, onPlaying, onZoom, onAddClip, onAddLayer }: { playing: boolean; zoom: number; onPlaying: (value: boolean) => void; onZoom: (value: number) => void; onAddClip: () => void; onAddLayer: () => void }) {
  return <div className="overlay-transport grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[#28313a] bg-[#0e1318] px-2 text-[10px]">
    <div className="flex items-center gap-1"><button type="button" onClick={() => onPlaying(!playing)} className="grid size-7 place-items-center bg-[#e6b85c] text-[#101419]" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</button><button type="button" className={`grid size-7 place-items-center ${button}`} aria-label="Go to start"><SkipBack size={13} /></button><span className="ml-1 font-mono"><strong className="text-white">03.4</strong><span className="mx-1 text-[#596571]">/</span><span className="text-[#929da9]">08.0</span></span></div>
    <div className="flex items-center gap-1"><button type="button" onClick={() => onZoom(Math.max(1, zoom - 0.4))} className="grid size-7 place-items-center text-[#929da9] hover:text-[#e6b85c]" aria-label="Zoom out"><ZoomOut size={14} /></button><input type="range" aria-label="Timeline zoom" min="1" max="6" step="0.1" value={zoom} onChange={(event) => onZoom(Number(event.target.value))} className="w-24 accent-[#67c7d6]" /><button type="button" onClick={() => onZoom(Math.min(6, zoom + 0.4))} className="grid size-7 place-items-center text-[#929da9] hover:text-[#e6b85c]" aria-label="Zoom in"><ZoomIn size={14} /></button><span className="w-8 font-mono text-[#9adde4]">{zoom.toFixed(1)}×</span></div>
    <div className="flex items-center justify-end gap-1"><button type="button" className={`flex h-7 items-center gap-1 px-2 ${button}`}><Magnet size={12} /> Snap</button><button type="button" className={`flex h-7 items-center gap-1 px-2 ${button}`}><Maximize2 size={12} /> Fit</button><button type="button" onClick={onAddClip} className={`flex h-7 items-center gap-1 px-2 ${button}`}><Plus size={12} /> Clip</button><button type="button" onClick={onAddLayer} className="flex h-7 items-center gap-1 border border-[#67c7d6] bg-[#67c7d6]/12 px-2 text-[#b9edf1] hover:bg-[#67c7d6]/20"><Layers3 size={12} /> Layer</button></div>
  </div>
}

function TimelineHeader() {
  return <div className="sticky top-0 z-50 grid h-6 min-w-[720px] grid-cols-[136px_1fr] border-b border-[#34404b] bg-[#0d1217] text-[9px] text-[#7f8994]"><span className="flex items-center border-r border-[#34404b] px-2 font-semibold uppercase tracking-[0.09em]">Local time</span><span className="grid grid-cols-9 items-center font-mono">{['0', '1', '2', '3', '4', '5', '6', '7', '8 s'].map((tick) => <i key={tick} className="border-l border-[#252e37] pl-1 not-italic">{tick}</i>)}</span></div>
}

function SceneTransitionRow() {
  return <TimelineRow label={<span className="flex items-center gap-1">Transitions <Lock size={8} className="text-[#68747f]" aria-label="Read-only" /></span>} color="#7b8792" compact>
    <span className="absolute inset-y-1 left-0 w-[13%] border border-[#6f7b86]/35 bg-[#6f7b86]/10 px-1 text-[8px] text-[#a8b0b8]">IN · Crossfade</span>
    <span className="absolute inset-y-1 right-0 w-[12%] border border-[#6f7b86]/35 bg-[#6f7b86]/10 px-1 text-right text-[8px] text-[#a8b0b8]">Wipe · OUT</span>
  </TimelineRow>
}

function VariantNote({ variant }: { variant: Variant }) {
  const notes: Record<Variant, string> = {
    A: 'A · explicit layer rail — every layer is always visible; top is front',
    B: 'B · focus bands — selected layer expands; inactive layers retain timing context',
    C: 'C · focused layer bridge — compact stack chooses one full timing lane',
  }
  return <div className="border-b border-[#28313a] bg-[#0e1419] px-2 py-1 text-[9px] text-[#7f8994]">{notes[variant]}</div>
}

interface TimelineVariantProps {
  state: OverlayPrototypeState
  onState: Dispatch<SetStateAction<OverlayPrototypeState>>
  onSelect: (id: string) => void
  onDrag: (event: ReactPointerEvent, placement: PrototypePlacement, mode: TimelineDragMode) => void
  guidesVisible: boolean
}

function LayerRail(props: TimelineVariantProps) {
  return <div>{props.state.layers.map((layer) => <LayerTimelineRow key={layer.id} layer={layer} props={props} />)}</div>
}

function LayerTimelineRow({ layer, props }: { layer: PrototypeOverlayLayer; props: TimelineVariantProps }) {
  const placements = props.state.placements.filter((item) => item.layerId === layer.id)
  return <TimelineRow
    label={<LayerLabel layer={layer} selected={props.state.selectedLayerId === layer.id} onSelect={() => props.onState((state) => selectOverlayLayer(state, layer.id))} onMove={(direction) => props.onState((state) => reorderOverlayLayer(state, layer.id, direction))} />}
    color={overlayColor}
  >
    {props.guidesVisible && <OtherZoneGuides />}
    {placements.map((item) => <PlacementBar key={item.id} item={item} selected={props.state.selectedPlacementId === item.id} sceneDuration={props.state.sceneDuration} onSelect={props.onSelect} onDrag={props.onDrag} />)}
  </TimelineRow>
}

function FocusBands(props: TimelineVariantProps) {
  return <div>{props.state.layers.map((layer) => {
    const selected = props.state.selectedLayerId === layer.id
    const placements = props.state.placements.filter((item) => item.layerId === layer.id)
    return <TimelineRow key={layer.id} height={selected ? 34 : 20} compact={!selected} label={<LayerLabel layer={layer} selected={selected} onSelect={() => props.onState((state) => selectOverlayLayer(state, layer.id))} onMove={(direction) => props.onState((state) => reorderOverlayLayer(state, layer.id, direction))} />} color={overlayColor}>
      {props.guidesVisible && <OtherZoneGuides subtle={!selected} />}
      {placements.map((item) => <PlacementBar key={item.id} item={item} selected={props.state.selectedPlacementId === item.id} sceneDuration={props.state.sceneDuration} onSelect={props.onSelect} onDrag={props.onDrag} compact={!selected} />)}
    </TimelineRow>
  })}</div>
}

function FocusedLayerBridge(props: TimelineVariantProps) {
  const layer = props.state.layers.find((item) => item.id === props.state.selectedLayerId) ?? props.state.layers[0]
  const placements = props.state.placements.filter((item) => item.layerId === layer.id)
  return <div className="grid grid-cols-[136px_1fr] border-b border-[#34404b] bg-[#0c1116]">
    <div className="border-r border-[#34404b] p-1">
      {props.state.layers.map((item) => <button type="button" key={item.id} onClick={() => props.onState((state) => selectOverlayLayer(state, item.id))} className={`mb-1 flex h-6 w-full items-center gap-1 px-1 text-left text-[9px] ${item.id === layer.id ? 'bg-[#67c7d6]/18 text-[#c9f1f4] shadow-[inset_2px_0_#67c7d6]' : 'bg-[#151b22] text-[#9da8b3]'}`}><GripVertical size={9} className="text-[#68747f]" /><span className="min-w-0 flex-1 truncate">{item.name}</span></button>)}
    </div>
    <div className="relative min-h-[124px]">
      <div className="absolute inset-x-0 top-0 flex h-7 items-center border-b border-[#34404b] bg-[#10161c] px-2 text-[9px]"><i className="mr-1.5 size-1.5 bg-[#67c7d6]" /><strong className="text-[#c7d0d8]">{layer.name}</strong><span className="ml-2 text-[#77838e]">focused timing lane</span><button type="button" onClick={() => props.onState((state) => reorderOverlayLayer(state, layer.id, -1))} className="ml-auto grid size-5 place-items-center text-[#7f8b96] hover:text-white"><ArrowUp size={10} /></button><button type="button" onClick={() => props.onState((state) => reorderOverlayLayer(state, layer.id, 1))} className="grid size-5 place-items-center text-[#7f8b96] hover:text-white"><ArrowDown size={10} /></button></div>
      <div className="absolute inset-x-0 bottom-0 top-7 bg-[repeating-linear-gradient(90deg,transparent_0_calc(12.5%-1px),#202832_calc(12.5%-1px)_12.5%)]">
        {props.guidesVisible && <OtherZoneGuides />}
        {placements.map((item) => <PlacementBar key={item.id} item={item} selected={props.state.selectedPlacementId === item.id} sceneDuration={props.state.sceneDuration} onSelect={props.onSelect} onDrag={props.onDrag} top={18} />)}
        <span className="absolute bottom-2 left-2 text-[8px] text-[#6e7984]">Other layers remain summarized in the stack; drag vertically to reassign.</span>
      </div>
    </div>
  </div>
}

function LayerLabel({ layer, selected, onSelect, onMove }: { layer: PrototypeOverlayLayer; selected: boolean; onSelect: () => void; onMove: (direction: -1 | 1) => void }) {
  const beginReorder = (event: ReactPointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const onUp = (nextEvent: PointerEvent) => {
      const deltaY = nextEvent.clientY - startY
      if (Math.abs(deltaY) >= 12) onMove(deltaY < 0 ? -1 : 1)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointerup', onUp)
  }
  return <div className="group relative flex w-full min-w-0 items-center">
    <button type="button" onPointerDown={beginReorder} className="absolute -left-2.5 z-10 grid h-5 w-3 cursor-grab place-items-center bg-[#10151b] text-[#74818d] opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Drag ${layer.name} layer to reorder`} title="Drag layer to reorder"><GripVertical size={10} /></button>
    <button type="button" onClick={onSelect} className={`min-w-0 flex-1 truncate text-left ${selected ? 'text-[#d3f3f5]' : ''}`}>{layer.name}</button>
  </div>
}

function MainClipRow({ state, onSelect }: { state: OverlayPrototypeState; onSelect: (id: string) => void }) {
  return <TimelineRow label={`Main clips · ${state.zoneName}`} color="#aeb7c1">{state.placements.filter((item) => item.role === 'main').map((item) => <button type="button" key={item.id} onClick={() => onSelect(item.id)} style={timeStyle(item, state.sceneDuration)} className={`absolute inset-y-1 truncate border px-1.5 text-left text-[10px] ${state.selectedPlacementId === item.id ? 'border-white bg-[#2d3944] text-white' : 'border-[#4a5663] bg-[#19212a] text-[#d2d8de]'}`}>{item.label}<span className="ml-1 text-[8px] text-[#8d98a4]">MAIN</span></button>)}</TimelineRow>
}

function TimelineRow({ label, color, compact = false, height = 32, children }: { label: ReactNode; color: string; compact?: boolean; height?: number; children: ReactNode }) {
  return <div className="grid grid-cols-[136px_1fr] border-b border-[#2c3640]" style={{ height: compact ? height === 32 ? 23 : height : height }}><div className="flex min-w-0 items-center gap-1 border-r border-[#34404b] bg-[#10151b] px-2 text-[9px] text-[#a6afb9]"><i className="size-1.5 shrink-0" style={{ background: color }} />{typeof label === 'string' ? <span className="truncate">{label}</span> : label}</div><div className="relative bg-[repeating-linear-gradient(90deg,transparent_0_calc(12.5%-1px),#202832_calc(12.5%-1px)_12.5%)]">{children}</div></div>
}

function PlacementBar({ item, selected, sceneDuration, onSelect, onDrag, compact = false, top }: { item: PrototypePlacement; selected: boolean; sceneDuration: number; onSelect: (id: string) => void; onDrag: TimelineVariantProps['onDrag']; compact?: boolean; top?: number }) {
  return <button type="button" onClick={() => onSelect(item.id)} onPointerDown={(event) => beginBodyDrag(event, item, onDrag)} style={{ ...timeStyle(item, sceneDuration), top: top ?? (compact ? 3 : 4), height: compact ? 14 : 24 }} className={`absolute cursor-grab touch-none overflow-visible border text-left text-[9px] active:cursor-grabbing ${selected ? 'z-20 border-[#9adde4] bg-[#67c7d6]/28 text-white shadow-[0_0_0_1px_#67c7d6]' : 'border-[#67c7d6]/55 bg-[#67c7d6]/13 text-[#b9e8ec]'}`} title="Drag horizontally; pull past the lane threshold to move vertically"><span onPointerDown={(event) => onDrag(event, item, 'start')} className="absolute inset-y-0 -left-1 z-30 w-2 cursor-ew-resize" /><span className="block truncate px-1.5">{item.label}<i className="ml-1 not-italic text-[#8dced5]">{item.effects.length ? `${item.effects.length} FX` : ''}</i></span><span onPointerDown={(event) => onDrag(event, item, 'end')} className="absolute inset-y-0 -right-1 z-30 w-2 cursor-ew-resize" /></button>
}

function beginBodyDrag(event: ReactPointerEvent, item: PrototypePlacement, onDrag: TimelineVariantProps['onDrag']) {
  if ((event.target as HTMLElement).classList.contains('cursor-ew-resize')) return
  onDrag(event, item, 'move')
}

function OtherZoneGuides({ subtle = false }: { subtle?: boolean }) {
  return <div className={`pointer-events-none absolute inset-0 ${subtle ? 'opacity-35' : 'opacity-60'}`} aria-label="Read-only timing guides from other zones"><i className="absolute bottom-1 top-1 left-[19%] border-l border-dashed border-[#a78bfa]/50" /><i className="absolute bottom-1 top-1 left-[52%] border-l border-dashed border-[#4fc4b0]/50" /><i className="absolute bottom-1 top-1 left-[78%] border-l border-dashed border-[#a78bfa]/50" /></div>
}

function AutomationRow({ placement }: { placement?: PrototypePlacement }) {
  if (!placement) return null
  return <TimelineRow label={placement.role === 'overlay' ? `↳ opacity · ${placement.opacity.toFixed(2)}` : `↳ ${placement.instancePolicy} instance`} color={placement.role === 'overlay' ? automationColor : '#aeb7c1'} compact><svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-label="Read-only property summary"><path d={placement.role === 'overlay' ? 'M0 17 C 90 17, 120 4, 205 8 S 320 18, 410 6 S 520 12, 640 5' : 'M0 12 L640 12'} vectorEffect="non-scaling-stroke" fill="none" stroke={placement.role === 'overlay' ? automationColor : '#77828e'} strokeWidth="1" /><circle cx="205" cy="8" r="2" fill={automationColor} /><circle cx="410" cy="6" r="2" fill={automationColor} /></svg><span className="absolute right-1 top-1 text-[8px] text-[#8f99a5]">summary · edit in details</span></TimelineRow>
}

function PlacementInspector({ placement, layer, top, onClose, onDuplicate, onRemove, onInstancePolicy }: { placement: PrototypePlacement; layer: PrototypeOverlayLayer; top: number; onClose: () => void; onDuplicate: () => void; onRemove: () => void; onInstancePolicy: (instancePolicy: PrototypePlacement['instancePolicy']) => void }) {
  const isOverlay = placement.role === 'overlay'
  return <section className="overlay-inspector absolute z-[70] w-[342px] border border-[#5b6977] bg-[#12181f]/[0.98] text-[10px] shadow-2xl shadow-black/80 backdrop-blur" style={{ top, left: 'clamp(148px, 38%, calc(100% - 358px))' }}>
    <div className="flex h-8 items-center gap-2 border-b border-[#34404b] px-2"><i className="size-2" style={{ background: isOverlay ? overlayColor : '#aeb7c1' }} /><strong className="truncate text-[11px] text-white">{placement.label}</strong><span className="border border-[#3d4955] px-1 py-0.5 text-[8px] uppercase tracking-[0.08em] text-[#9da8b3]">{placement.role} clip</span><button type="button" onClick={onClose} className="ml-auto text-[#7f8a95] hover:text-white" aria-label="Close details">×</button></div>
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-2">
      <Readout label="Pattern" value={placement.patternName} locked /><Readout label="Zone" value={placement.zoneName} locked />
      <Readout label="Layer" value={isOverlay ? layer.name : 'Structural schedule'} /><Readout label="Effects" value={placement.effects.length ? placement.effects.join(' → ') : 'None'} color={effectColor} />
      <Editable label="Start" value={placement.start.toFixed(2)} suffix="s" /><Editable label="Duration" value={placement.duration.toFixed(2)} suffix="s" />
      {isOverlay && <><Editable label="Opacity" value={placement.opacity.toFixed(2)} /><InstancePolicy value={placement.instancePolicy} onChange={onInstancePolicy} /></>}
    </div>
    <div className="flex h-9 items-center gap-1 border-t border-[#34404b] px-2"><span className="mr-auto text-[#85909b]">Anchored to selected clip · editable fields are boxed</span>{isOverlay && <><button type="button" className={`flex h-6 items-center gap-1 px-1.5 ${button}`}><CopyPlus size={11} /> Clone to zone…</button><button type="button" onClick={onDuplicate} className={`grid size-6 place-items-center ${button}`} aria-label="Duplicate clip"><CopyPlus size={11} /></button><button type="button" onClick={onRemove} className="grid size-6 place-items-center border border-[#713f47] bg-[#2b171c] text-[#e89ca7] hover:bg-[#3a1c23]" aria-label="Remove clip"><Trash2 size={11} /></button></>}</div>
  </section>
}

function Readout({ label, value, color, locked = false }: { label: string; value: string; color?: string; locked?: boolean }) {
  return <div className="min-w-0"><span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#79848f]">{label}{locked && <Lock size={8} className="text-[#596571]" aria-label="Locked" />}</span><span className="mt-0.5 block truncate text-[#cbd1d8]" style={{ color }}>{value}</span></div>
}

function Editable({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return <label className="min-w-0"><span className="block text-[8px] font-semibold uppercase tracking-[0.08em] text-[#87939e]">{label}</span><span className="mt-0.5 flex h-6 items-center border border-[#40505d] bg-[#090d11] px-1.5"><input defaultValue={value} className="min-w-0 flex-1 bg-transparent font-mono text-[#e0e5ea] outline-none" />{suffix && <i className="not-italic text-[#74808b]">{suffix}</i>}</span></label>
}

function InstancePolicy({ value, onChange }: { value: PrototypePlacement['instancePolicy']; onChange: (value: PrototypePlacement['instancePolicy']) => void }) {
  return <fieldset className="min-w-0"><legend className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#87939e]">Entry behavior</legend><div className="mt-0.5 grid h-6 grid-cols-2 border border-[#40505d] bg-[#090d11] p-px">{(['Continue', 'Restart'] as const).map((option) => <button type="button" key={option} onClick={() => onChange(option)} aria-pressed={value === option} className={`text-[9px] ${value === option ? 'bg-[#34404b] text-white' : 'text-[#7f8b96] hover:text-white'}`}>{option}</button>)}</div></fieldset>
}

function PrototypeStage({ state, selectedId, playing, zonesVisible, placementsVisible, guidesVisible, onPlaying, onZonesVisible, onPlacementsVisible, onGuidesVisible }: { state: OverlayPrototypeState; selectedId: string; playing: boolean; zonesVisible: boolean; placementsVisible: boolean; guidesVisible: boolean; onPlaying: (playing: boolean) => void; onZonesVisible: (value: boolean) => void; onPlacementsVisible: (value: boolean) => void; onGuidesVisible: (value: boolean) => void }) {
  const activeOverlays = state.placements.filter((item) => item.role === 'overlay' && item.start <= 3.4 && item.start + item.duration > 3.4)
  return <aside className="overlay-stage flex min-h-0 flex-col bg-[#0d1116]">
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_25%_20%,#1d7e73_0_2%,transparent_3%),radial-gradient(circle_at_70%_38%,#844bc2_0_4%,transparent_5%),radial-gradient(circle_at_45%_75%,#c57635_0_3%,transparent_4%),radial-gradient(ellipse_at_center,#171922_0,#06090c_70%)]">
      <span className="absolute left-3 top-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#b8c0c8]">Stage · final Scene output</span>
      <div className="absolute inset-x-[8%] top-[13%] h-[70%] overflow-hidden border border-[#35414c]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(79,196,176,.07),transparent_45%,rgba(167,139,250,.08))]" />
        {zonesVisible && <>
          <DiagnosticZone className="left-0 top-0 h-1/2 w-1/2" label="Canopy · 840 px" selected />
          <DiagnosticZone className="right-0 top-0 h-1/2 w-1/2" label="Columns · 512 px" />
          <DiagnosticZone className="bottom-0 left-0 h-1/2 w-[62%]" label="Floor · 448 px" />
          <DiagnosticZone className="bottom-0 right-0 h-1/2 w-[38%]" label="Entry · 248 px" />
        </>}
        {placementsVisible && activeOverlays.map((item) => <div key={item.id} style={{ left: `${item.geometry.x * 50}%`, top: `${item.geometry.y * 50}%`, width: `${item.geometry.width * 50}%`, height: `${item.geometry.height * 50}%`, transform: `rotate(${item.geometry.rotation}deg)` }} className={`pointer-events-none absolute border border-dashed ${selectedId === item.id ? 'border-[#e1c7f4] bg-[#b58adb]/10 shadow-[0_0_0_1px_#b58adb]' : 'border-[#b58adb]/60 bg-[#b58adb]/[0.035]'}`}><span className="absolute left-0 top-0 bg-[#0d0912]/85 px-1 text-[7px] text-[#dfc9ef]">{item.label}</span></div>)}
      </div>
      <span className="absolute bottom-3 right-3 font-mono text-[9px] text-[#86919c]">2,048 px · 2D map</span>
    </div>
    <div className="border-t border-[#28313a] p-2 text-[9px]">
      <div className="flex items-center gap-2"><button type="button" onClick={() => onPlaying(!playing)} aria-label={playing ? 'Pause Stage' : 'Play Stage'} className="grid size-7 place-items-center bg-[#e6b85c] text-[#101419]">{playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</button><span className="font-mono text-[#f1cf88]">03.4</span><div className="ml-auto flex items-center gap-2"><Toggle active={zonesVisible} onClick={() => onZonesVisible(!zonesVisible)} label="Zones" /><Toggle active={placementsVisible} onClick={() => onPlacementsVisible(!placementsVisible)} label="Clips" /><Toggle active={guidesVisible} onClick={() => onGuidesVisible(!guidesVisible)} label="Guides" /></div></div>
      <p className="mt-2 leading-4 text-[#697580]">Stage shows every Zone. Diagnostics identify bounds; editing stays in the selected Zone timeline.</p>
    </div>
  </aside>
}

function DiagnosticZone({ className, label, selected = false }: { className: string; label: string; selected?: boolean }) {
  return <div className={`pointer-events-none absolute border ${className} ${selected ? 'border-[#6f9fc7] bg-[#6f9fc7]/[0.045] shadow-[inset_0_0_0_1px_rgba(111,159,199,.28)]' : 'border-[#66798a]/45 bg-[#8294a4]/[0.02]'}`}><span className={`absolute left-1 top-1 bg-[#080d11]/75 px-1 text-[7px] ${selected ? 'text-[#aacbe6]' : 'text-[#8795a1]'}`}>{label}</span></div>
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`flex h-5 items-center gap-1.5 text-[8px] ${active ? 'text-[#bdc8d2]' : 'text-[#5e6a75]'}`}><span>{label}</span><span className={`relative h-3 w-5 rounded-full border transition-colors ${active ? 'border-[#66808c] bg-[#38535d]' : 'border-[#303a43] bg-[#11171d]'}`}><i className={`absolute top-[2px] size-1.5 rounded-full transition-transform ${active ? 'translate-x-[10px] bg-[#b7d7dc]' : 'translate-x-[2px] bg-[#596570]'}`} /></span></button>
}

function VariantSwitcher({ variant, onVariant, onReset }: { variant: Variant; onVariant: (variant: Variant) => void; onReset: () => void }) {
  const labels: Record<Variant, string> = { A: 'Layer rail', B: 'Focus bands', C: 'Layer bridge' }
  return <div className="fixed bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center border border-[#536170] bg-[#0d1217] p-1 text-[10px] shadow-2xl shadow-black/80"><span className="flex h-7 items-center gap-1 px-2 font-semibold uppercase tracking-[0.08em] text-[#7ed9ca]"><Sparkles size={11} /> #458</span>{(['A', 'B', 'C'] as const).map((item) => <button type="button" key={item} onClick={() => onVariant(item)} className={`h-7 px-3 ${variant === item ? 'bg-[#67c7d6] text-[#101419]' : 'text-[#a2aab5] hover:bg-white/7 hover:text-white'}`}>{item} · {labels[item]}</button>)}<button type="button" onClick={onReset} className="ml-1 h-7 border-l border-[#34404b] px-2 text-[#929da9] hover:text-white">Reset</button></div>
}

function timeStyle(item: PrototypePlacement, duration: number) {
  return { left: `${item.start / duration * 100}%`, width: `${item.duration / duration * 100}%` }
}

const prototypeStyles = `
  .overlay-prototype { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .overlay-workspace { display: grid; grid-template-columns: 188px minmax(0, 1fr) 300px; }
  .overlay-workspace.library-closed { grid-template-columns: minmax(0, 1fr) 300px; }
  .overlay-library { display: flex; }
  .overlay-inspector::before { content: ''; position: absolute; left: 42px; top: -6px; width: 10px; height: 10px; transform: rotate(45deg); border-left: 1px solid #5b6977; border-top: 1px solid #5b6977; background: #12181f; }
  @media (max-width: 1100px) {
    .overlay-workspace, .overlay-workspace.library-closed { grid-template-columns: minmax(0, 1fr) 250px; }
    .overlay-library { display: none; }
    .overlay-inspector { width: 320px; }
  }
  @media (max-width: 760px) {
    .overlay-workspace, .overlay-workspace.library-closed { grid-template-columns: minmax(0, 1fr); grid-template-rows: 176px minmax(0, 1fr); }
    .overlay-stage { grid-row: 1; }
    .overlay-center { grid-row: 2; }
    .overlay-transport { grid-template-columns: 1fr auto; }
    .overlay-transport > :nth-child(2) { display: none; }
    .overlay-inspector { left: 8px !important; top: 118px !important; width: min(320px, calc(100% - 16px)); }
    .overlay-inspector::before { display: none; }
  }
`
