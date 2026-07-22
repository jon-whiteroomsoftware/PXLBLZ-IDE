import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  BoxSelect,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Eye,
  Focus,
  Grid2X2,
  Layers3,
  Link2,
  Magnet,
  Map as MapIcon,
  Maximize2,
  Pause,
  Pin,
  Play,
  Plus,
  SkipBack,
  Sparkles,
  SplitSquareHorizontal,
  X,
  Zap,
} from 'lucide-react'

// PROTOTYPE - throwaway Show Editor overhaul interaction study.
// Run with npm run dev, then open ?prototype=show-overhaul&fixture=topology&variant=working.

type Variant = 'expanded' | 'working' | 'collapsed'
type Fixture = 'simple' | 'topology'

interface PrototypeClip {
  id: string
  name: string
  start: number
  duration: number
  color: 'cyan' | 'violet' | 'amber'
  badges?: string[]
  groupId?: string
}

interface PrototypeLayer {
  id: string
  name: string
  snap: boolean
  clips: PrototypeClip[]
}

interface PrototypeEffectSpan {
  name: string
  start: number
  duration: number
}

interface PrototypeAutomationLane {
  name: string
  color: string
  points: string
  beats: number[]
}

interface PrototypeLayerDetail {
  effects?: PrototypeEffectSpan[]
  automation?: PrototypeAutomationLane[]
}

interface PrototypeZone {
  id: string
  name: string
  icon: string
  color: string
  layers: PrototypeLayer[]
}

interface PrototypeLayout {
  id: string
  name: string
  start: number
  duration: number
  zones: PrototypeZone[]
  split?: boolean
}

interface Selection {
  kind: 'clip' | 'group' | 'boundary' | 'transition'
  id: string
  layoutId: string
  label: string
}

const TOTAL = 32
const control = 'inline-flex h-7 items-center gap-1.5 border border-[#2b3540] bg-[#121820] px-2 text-[9px] text-[#a5afba] hover:border-[#536170] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e4b85c] disabled:cursor-not-allowed disabled:opacity-35'
const cyanClip = 'border-[#67c7d6]/65 bg-[#16303a] text-[#d4f4f7]'
const violetClip = 'border-[#a78bfa]/55 bg-[#2b2342] text-[#eee7ff]'
const amberClip = 'border-[#e4b85c]/55 bg-[#3b2c18] text-[#fff0c5]'

const topologyLayouts: PrototypeLayout[] = [
  {
    id: 'quartet', name: 'Quartet', start: 0, duration: 12,
    zones: [
      { id: 'nw', name: 'North west', icon: 'NW', color: '#67c7d6', layers: [{ id: 'nw-1', name: 'Layer 1', snap: true, clips: [
        { id: 'aurora', name: 'Aurora weave', start: 0.5, duration: 4.8, color: 'cyan', badges: ['fx2'], groupId: 'echo' },
        { id: 'rings', name: 'Rings', start: 6.2, duration: 4.6, color: 'cyan', badges: ['linked'] },
      ] }] },
      { id: 'ne', name: 'North east', icon: 'NE', color: '#a78bfa', layers: [{ id: 'ne-1', name: 'Layer 1', snap: true, clips: [
        { id: 'comet', name: 'Comet loom', start: 1.2, duration: 4.4, color: 'violet', badges: ['linked'] },
        { id: 'flare', name: 'Flare', start: 7.1, duration: 2.8, color: 'violet' },
      ] }] },
      { id: 'sw', name: 'South west', icon: 'SW', color: '#e4b85c', layers: [{ id: 'sw-1', name: 'Layer 1', snap: true, clips: [
        { id: 'echo-a', name: 'Echo A', start: 0.5, duration: 4.8, color: 'amber', groupId: 'echo' },
      ] }] },
      { id: 'se', name: 'South east', icon: 'SE', color: '#4fc4b0', layers: [{ id: 'se-1', name: 'Layer 1', snap: true, clips: [
        { id: 'rain', name: 'Pixel rain', start: 4.4, duration: 6.3, color: 'cyan', badges: ['fx1'] },
      ] }] },
    ],
  },
  {
    id: 'full', name: 'Full stage', start: 12, duration: 8,
    zones: [{ id: 'full-zone', name: 'Full stage', icon: 'FS', color: '#67c7d6', layers: [
      { id: 'full-1', name: 'Layer 1', snap: true, clips: [
        { id: 'pulse', name: 'Pulse storm', start: 0.3, duration: 3.1, color: 'cyan', badges: ['freeze'] },
        { id: 'bloom', name: 'Portal bloom', start: 3.4, duration: 3.1, color: 'cyan', badges: ['fx3'] },
      ] },
      { id: 'full-2', name: 'Layer 2', snap: false, clips: [
        { id: 'strobe', name: 'Strobe accents', start: 1.2, duration: 4.2, color: 'amber', badges: ['strobe'] },
      ] },
    ] }],
  },
  {
    id: 'triptych', name: 'Triptych', start: 20, duration: 12,
    zones: [
      { id: 'left', name: 'Left', icon: 'L', color: '#67c7d6', layers: [{ id: 'left-1', name: 'Layer 1', snap: true, clips: [
        { id: 'left-wave', name: 'Wave field', start: 0.4, duration: 5.2, color: 'cyan' },
        { id: 'left-glow', name: 'Afterglow', start: 6.5, duration: 4.2, color: 'cyan' },
      ] }] },
      { id: 'center', name: 'Center', icon: 'C', color: '#a78bfa', layers: [{ id: 'center-1', name: 'Layer 1', snap: true, clips: [
        { id: 'center-rings', name: 'Concentric rings', start: 1, duration: 8.7, color: 'violet', badges: ['linked'] },
      ] }] },
      { id: 'right', name: 'Right', icon: 'R', color: '#e4b85c', layers: [
        { id: 'right-1', name: 'Layer 1', snap: true, clips: [{ id: 'right-echo', name: 'Echo B', start: 0.4, duration: 5.2, color: 'amber', groupId: 'echo' }] },
        { id: 'right-2', name: 'Layer 2', snap: false, clips: [{ id: 'right-spark', name: 'Spark veil', start: 5.8, duration: 4.7, color: 'violet', badges: ['viewport'] }] },
      ] },
    ],
  },
]

const simpleLayouts: PrototypeLayout[] = [{
  id: 'simple', name: 'Full stage', start: 0, duration: 32,
  zones: [{ id: 'simple-zone', name: 'Full stage', icon: 'FS', color: '#67c7d6', layers: [
    { id: 'simple-1', name: 'Layer 1', snap: true, clips: [
      { id: 'simple-a', name: 'Aurora weave', start: 1, duration: 8, color: 'cyan', badges: ['fx2'] },
      { id: 'simple-b', name: 'Portal bloom', start: 9, duration: 7, color: 'cyan' },
      { id: 'simple-c', name: 'Afterglow', start: 19, duration: 9, color: 'cyan', badges: ['linked'] },
    ] },
    { id: 'simple-2', name: 'Layer 2', snap: false, clips: [
      { id: 'simple-overlay', name: 'Spark veil', start: 5, duration: 12, color: 'violet', badges: ['viewport', 'fx1'] },
    ] },
  ] }],
}]

// Representative authored detail. These are nested beneath their owning Layer
// only when something exists to show; empty Layers do not reserve blank rails.
const layerDetails: Record<string, PrototypeLayerDetail> = {
  'nw-1': {
    effects: [
      { name: 'Glow', start: 0.7, duration: 2.2 },
      { name: 'Stutter', start: 3.4, duration: 1.35 },
    ],
    automation: [{ name: 'brightness', color: '#a78bfa', points: '0,8 20,7 36,2 58,6 76,3 100,5', beats: [20, 36, 58, 76] }],
  },
  'full-1': {
    effects: [
      { name: 'Freeze', start: 0.65, duration: 1.15 },
      { name: 'Bloom', start: 4.1, duration: 1.7 },
    ],
    automation: [
      { name: 'scale', color: '#67c7d6', points: '0,8 22,7 43,2 62,4 81,1 100,5', beats: [22, 43, 62, 81] },
      { name: 'rotation', color: '#e4b85c', points: '0,7 28,6 52,4 76,2 100,1', beats: [28, 52, 76] },
    ],
  },
  'center-1': {
    automation: [{ name: 'x position', color: '#a78bfa', points: '0,5 18,2 36,7 54,2 72,7 100,4', beats: [18, 36, 54, 72] }],
  },
  'simple-1': {
    effects: [{ name: 'Glow', start: 2.2, duration: 3.1 }],
    automation: [{ name: 'brightness', color: '#a78bfa', points: '0,8 24,3 47,6 71,2 100,5', beats: [24, 47, 71] }],
  },
}

function initialCollapsedZones(layouts: PrototypeLayout[], variant: Variant): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const layout of layouts) {
    if (layout.zones.length <= 1) continue
    for (const [index, zone] of layout.zones.entries()) {
      result[`${layout.id}:${zone.id}`] = variant === 'collapsed'
        || (variant === 'working' && (layout.id === 'quartet' ? index === 1 || index === 2 : index !== 1))
    }
  }
  return result
}

export function ShowEditorOverhaulPrototype() {
  const params = new URLSearchParams(window.location.search)
  const fixture = (params.get('fixture') === 'simple' ? 'simple' : 'topology') as Fixture
  const variantParam = params.get('variant')
  const variant = (['expanded', 'working', 'collapsed'].includes(variantParam ?? '')
    ? variantParam
    : variantParam === 'focus' ? 'working' : 'expanded') as Variant
  const layouts = fixture === 'simple' ? simpleLayouts : topologyLayouts
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(fixture === 'simple' ? 8.5 : 15.2)
  const [viewportDuration, setViewportDuration] = useState(24)
  const [zonesOpen, setZonesOpen] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dragDelta, setDragDelta] = useState(0)
  const [transitionOpen, setTransitionOpen] = useState(false)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [collapsedZones, setCollapsedZones] = useState<Record<string, boolean>>(() => initialCollapsedZones(layouts, variant))
  const restoreDetailsRef = useRef(false)

  const activeLayout = useMemo(() => {
    if (selection) return layouts.find((layout) => layout.id === selection.layoutId) ?? layouts[0]
    return layouts.find((layout) => position >= layout.start && position < layout.start + layout.duration) ?? layouts[layouts.length - 1]
  }, [layouts, position, selection])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setPosition((current) => (current + 0.08) % TOTAL), 80)
    return () => window.clearInterval(timer)
  }, [playing])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.matches('input, select, textarea, [contenteditable="true"]')) return
      if (event.code === 'Space') {
        event.preventDefault()
        setPlaying((value) => !value)
      }
      if (event.key.toLowerCase() === 'a') setPosition(0)
      if (event.key.toLowerCase() === 'i' && selection) setDetailsOpen((value) => !value)
      if (event.key === 'Escape') {
        if (transitionOpen) setTransitionOpen(false)
        else if (layoutMenuOpen) setLayoutMenuOpen(false)
        else if (detailsOpen) setDetailsOpen(false)
        else setSelection(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detailsOpen, layoutMenuOpen, selection, transitionOpen])

  const updateParams = (patch: { fixture?: Fixture; variant?: Variant }) => {
    const url = new URL(window.location.href)
    url.searchParams.set('prototype', 'show-overhaul')
    url.searchParams.set('fixture', patch.fixture ?? fixture)
    url.searchParams.set('variant', patch.variant ?? variant)
    window.location.href = url.toString()
  }

  const select = (next: Selection) => {
    setSelection(next)
    setDetailsOpen(true)
  }

  const beginClipPointer = (event: ReactPointerEvent<HTMLButtonElement>, clip: PrototypeClip, layout: PrototypeLayout) => {
    event.stopPropagation()
    const startX = event.clientX
    let moved = false
    restoreDetailsRef.current = detailsOpen && selection?.id === clip.id
    setSelection({ kind: clip.groupId ? 'group' : 'clip', id: clip.groupId ?? clip.id, layoutId: layout.id, label: clip.groupId ? 'Echo group' : clip.name })
    const move = (next: PointerEvent) => {
      const delta = next.clientX - startX
      if (!moved && Math.abs(delta) > 4) {
        moved = true
        setDragging(true)
        setDetailsOpen(false)
      }
      if (moved) setDragDelta(delta)
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      if (moved) {
        setDragging(false)
        setDragDelta(0)
        setDetailsOpen(restoreDetailsRef.current)
      } else setDetailsOpen(true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#070a0d] font-mono text-[#dbe0e6]">
      <header className="flex h-10 shrink-0 items-center border-b border-[#28323c] bg-[#0d1218] px-3 text-[10px]">
        <span className="border border-[#67c7d6]/40 bg-[#67c7d6]/10 px-2 py-1 font-semibold uppercase tracking-[0.12em] text-[#9adde4]">Prototype</span>
        <strong className="ml-3 text-[11px] text-zinc-100">Cathedral Signal</strong>
        <span className="ml-2 text-zinc-600">Show Editor overhaul</span>
        <span className="ml-auto hidden text-zinc-600 min-[680px]:inline">Changing topology · fixture data only</span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] max-[900px]:grid-cols-[minmax(0,1fr)_260px] max-[720px]:grid-cols-1 max-[720px]:grid-rows-[145px_minmax(0,1fr)]">
        <main className="relative flex min-h-0 min-w-0 flex-col border-r border-[#28323c] bg-[#090d11] max-[720px]:row-start-2">
          <Toolbar
            playing={playing}
            position={position}
            viewportDuration={viewportDuration}
            layouts={layouts}
            activeLayout={activeLayout}
            zonesOpen={zonesOpen}
            onPlaying={setPlaying}
            onPosition={setPosition}
            onFit={() => setViewportDuration(TOTAL)}
            onStart={() => setPosition(0)}
            onZones={() => setZonesOpen((value) => !value)}
            onInsertLayout={() => setLayoutMenuOpen(true)}
          />

          {zonesOpen && (
            <ZoneMapPopover
              layout={activeLayout}
              collapsedZones={collapsedZones}
              onToggle={(zoneId) => setCollapsedZones((current) => ({
                ...current,
                [`${activeLayout.id}:${zoneId}`]: !current[`${activeLayout.id}:${zoneId}`],
              }))}
              onClose={() => setZonesOpen(false)}
            />
          )}

          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-h-full" style={{ width: `${TOTAL / viewportDuration * 100}%`, minWidth: 720 }}>
              <Ruler position={position} onPosition={setPosition} />
              <Timeline
                layouts={layouts}
                fixture={fixture}
                activeLayoutId={activeLayout.id}
                collapsedZones={collapsedZones}
                selection={selection}
                dragging={dragging}
                dragDelta={dragDelta}
                onClipPointer={beginClipPointer}
                onSelection={select}
                onTransition={() => setTransitionOpen(true)}
                onToggleZone={(layoutId, zoneId) => setCollapsedZones((current) => ({
                  ...current,
                  [`${layoutId}:${zoneId}`]: !current[`${layoutId}:${zoneId}`],
                }))}
              />
            </div>
          </div>

          <footer className="flex h-6 shrink-0 items-center border-t border-[#28323c] bg-[#0c1117] px-2 text-[8px] text-zinc-600">
            <CircleDot size={9} className="mr-1 text-emerald-400" /> Preview ready
            <span className="ml-auto">{dragging ? `Moving · ${dragDelta > 0 ? '+' : ''}${(dragDelta / 28).toFixed(2)}s · Details hidden` : `${variantLabel(variant)} · ${activeLayout.name} under playhead`}</span>
          </footer>

          {detailsOpen && selection && !dragging && <EntityDetail selection={selection} onClose={() => setDetailsOpen(false)} />}
          {transitionOpen && <TransitionChooser onClose={() => setTransitionOpen(false)} />}
          {layoutMenuOpen && <LayoutInsertMenu position={position} onClose={() => setLayoutMenuOpen(false)} />}
        </main>

        <Stage layout={activeLayout} position={position} playing={playing} className="max-[720px]:row-start-1" />
      </div>

      <PrototypeSwitcher fixture={fixture} variant={variant} onChange={updateParams} />
    </div>
  )
}

function Toolbar({ playing, position, viewportDuration, layouts, activeLayout, zonesOpen, onPlaying, onPosition, onFit, onStart, onZones, onInsertLayout }: {
  playing: boolean
  position: number
  viewportDuration: number
  layouts: PrototypeLayout[]
  activeLayout: PrototypeLayout
  zonesOpen: boolean
  onPlaying: (value: boolean) => void
  onPosition: (value: number) => void
  onFit: () => void
  onStart: () => void
  onZones: () => void
  onInsertLayout: () => void
}) {
  return <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[#28323c] bg-[#0d1218] px-2">
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={() => onPlaying(!playing)} className={`${control} w-8 justify-center px-0`} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={12} /> : <Play size={12} />}</button>
      <button type="button" onClick={onStart} className={`${control} w-8 justify-center px-0`} aria-label="Go to Show start"><SkipBack size={12} /></button>
      <span className="ml-1 min-w-[70px] text-[10px] tabular-nums text-zinc-300 max-[620px]:hidden">{position.toFixed(2)} <i className="not-italic text-zinc-700">/ 32s</i></span>
    </div>

    <span className="h-5 w-px shrink-0 bg-[#28323c]" />
    <Navigator position={position} viewportDuration={viewportDuration} layouts={layouts} onPosition={onPosition} onFit={onFit} />
    <span className="h-5 w-px shrink-0 bg-[#28323c]" />

    <div className="flex shrink-0 items-center justify-end gap-1">
      <button type="button" onClick={onZones} aria-pressed={zonesOpen} className={`${control} ${zonesOpen ? 'border-[#67c7d6]/50 text-[#9adde4]' : ''}`} title={`Zones · ${activeLayout.name}`}><MapIcon size={11} /><span className="max-[860px]:hidden">Zones</span><ChevronDown size={9} /></button>
      <button type="button" className={control} title="Snap"><Magnet size={11} /><span className="hidden min-[1120px]:inline">Snap</span></button>
      <button type="button" className={control} title="Select"><BoxSelect size={11} /><span className="hidden min-[1120px]:inline">Select</span></button>
      <button type="button" onClick={onInsertLayout} className={control}><SplitSquareHorizontal size={11} /><span className="hidden min-[980px]:inline">Insert Layout</span></button>
      <button type="button" className={control}><Plus size={11} /><span className="hidden min-[860px]:inline">Add</span></button>
    </div>
  </div>
}

function Navigator({ position, viewportDuration, layouts, onPosition, onFit }: { position: number; viewportDuration: number; layouts: PrototypeLayout[]; onPosition: (value: number) => void; onFit: () => void }) {
  return <div className="flex min-w-[110px] flex-1 items-center gap-1.5">
    <button type="button" className="relative h-3 flex-1 overflow-hidden border border-[#2b3540] bg-[#06080a]" aria-label="Show Navigator" onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect()
      onPosition(Math.max(0, Math.min(TOTAL, (event.clientX - rect.left) / rect.width * TOTAL)))
    }}>
      {layouts.map((layout) => <span key={layout.id} className="absolute inset-y-0 border-r border-[#536170]/40 bg-[#67c7d6]/[0.07]" style={{ left: `${layout.start / TOTAL * 100}%`, width: `${layout.duration / TOTAL * 100}%` }} />)}
      <span className="absolute inset-y-[-1px] border border-[#e4b85c]/55 bg-[#e4b85c]/[0.08]" style={{ left: 0, width: `${viewportDuration / TOTAL * 100}%` }} />
      <span className="absolute inset-y-[-2px] w-px bg-[#ffe5a3]" style={{ left: `${position / TOTAL * 100}%` }} />
    </button>
    <button type="button" className="grid size-6 shrink-0 place-items-center text-zinc-600 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e4b85c] disabled:text-zinc-800" onClick={onFit} disabled={viewportDuration >= TOTAL} title="Fit entire Show" aria-label="Fit entire Show"><Maximize2 size={10} /></button>
  </div>
}

function Ruler({ position, onPosition }: { position: number; onPosition: (value: number) => void }) {
  return <div className="sticky top-0 z-40 grid h-7 min-w-[720px] grid-cols-[92px_minmax(0,1fr)] border-b border-[#34404b] bg-[#0a0f14]/95 backdrop-blur">
    <span className="flex items-center border-r border-[#28323c] px-2 text-[8px] uppercase tracking-[0.12em] text-zinc-600">Show time</span>
    <button type="button" className="relative cursor-crosshair" aria-label="Timeline ruler" onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect()
      onPosition(Math.max(0, Math.min(TOTAL, (event.clientX - rect.left) / rect.width * TOTAL)))
    }}>
      {[0, 4, 8, 12, 16, 20, 24, 28, 32].map((tick) => <span key={tick} className="absolute inset-y-0 border-l border-[#28323c] pl-1 pt-1 text-[8px] tabular-nums text-zinc-600" style={{ left: `${tick / TOTAL * 100}%` }}>{tick}s</span>)}
      <span className="absolute bottom-0 top-0 z-30 w-px bg-[#ffe5a3]" style={{ left: `${position / TOTAL * 100}%` }}><i className="absolute -left-[3px] top-0 size-1.5 rotate-45 bg-[#ffe5a3]" /></span>
      <span className="absolute bottom-0 top-0 left-[56.25%] border-l border-dashed border-[#a78bfa]/45"><i className="absolute -left-2 top-0 bg-[#251d35] px-1 text-[7px] not-italic text-[#c4b5fd]">hit</i></span>
    </button>
  </div>
}

function Timeline({ layouts, fixture, activeLayoutId, collapsedZones, selection, dragging, dragDelta, onClipPointer, onSelection, onTransition, onToggleZone }: {
  layouts: PrototypeLayout[]
  fixture: Fixture
  activeLayoutId: string
  collapsedZones: Record<string, boolean>
  selection: Selection | null
  dragging: boolean
  dragDelta: number
  onClipPointer: (event: ReactPointerEvent<HTMLButtonElement>, clip: PrototypeClip, layout: PrototypeLayout) => void
  onSelection: (selection: Selection) => void
  onTransition: () => void
  onToggleZone: (layoutId: string, zoneId: string) => void
}) {
  return <div className="relative min-h-[365px] min-w-[720px] bg-[linear-gradient(90deg,rgba(55,65,81,0.14)_1px,transparent_1px)] bg-[length:12.5%_100%] pl-[92px]">
    <div className="flex min-h-[365px] items-start">
      {layouts.map((layout, index) => <LayoutInterval
        key={layout.id}
        layout={layout}
        showLabel={fixture === 'topology'}
        active={layout.id === activeLayoutId}
        collapsedZones={collapsedZones}
        selection={selection}
        dragging={dragging}
        dragDelta={dragDelta}
        onClipPointer={onClipPointer}
        onSelection={onSelection}
        onTransition={onTransition}
        onToggleZone={onToggleZone}
        boundary={index > 0}
      />)}
    </div>
  </div>
}

function LayoutInterval({ layout, showLabel, active, collapsedZones, selection, dragging, dragDelta, onClipPointer, onSelection, onTransition, onToggleZone, boundary }: {
  layout: PrototypeLayout
  showLabel: boolean
  active: boolean
  collapsedZones: Record<string, boolean>
  selection: Selection | null
  dragging: boolean
  dragDelta: number
  onClipPointer: (event: ReactPointerEvent<HTMLButtonElement>, clip: PrototypeClip, layout: PrototypeLayout) => void
  onSelection: (selection: Selection) => void
  onTransition: () => void
  onToggleZone: (layoutId: string, zoneId: string) => void
  boundary: boolean
}) {
  return <section
    className={`relative shrink-0 border-r border-[#536170]/50 ${active ? 'bg-[#67c7d6]/[0.025]' : 'bg-[#090d11]/65'}`}
    style={{ width: `${layout.duration / TOTAL * 100}%`, minHeight: 365 }}
    aria-label={`${layout.name} Layout interval`}
  >
    {boundary && <button type="button" onClick={() => onSelection({ kind: 'boundary', id: `boundary-${layout.id}`, layoutId: layout.id, label: `Boundary before ${layout.name}` })} className="absolute -left-[5px] top-0 z-30 h-full w-[10px] cursor-ew-resize" aria-label={`Boundary before ${layout.name}`}><span className="absolute left-[4px] top-0 h-full w-px bg-[#e4b85c]/45" /></button>}
    {showLabel && <header className={`flex h-7 items-center gap-1.5 border-b border-[#34404b] bg-[#111820] px-2 text-[8px] ${active ? 'text-[#d4f4f7]' : 'text-zinc-500'}`}>
      <Grid2X2 size={9} className={active ? 'text-[#67c7d6]' : ''} />
      <strong className="truncate font-medium">{layout.name}</strong>
      <span className="ml-auto text-[7px] text-zinc-700">{layout.zones.length} zone{layout.zones.length === 1 ? '' : 's'}</span>
    </header>}
    {layout.zones.map((zone) => <ZoneRows
      key={zone.id}
      zone={zone}
      layout={layout}
      selection={selection}
      dragging={dragging}
      dragDelta={dragDelta}
      onClipPointer={onClipPointer}
      onTransition={onTransition}
      collapsed={Boolean(collapsedZones[`${layout.id}:${zone.id}`])}
      onToggle={() => onToggleZone(layout.id, zone.id)}
      hideZoneHeader={layout.zones.length === 1}
    />)}
  </section>
}

function ZoneRows({ zone, layout, selection, dragging, dragDelta, onClipPointer, onTransition, collapsed, onToggle, hideZoneHeader = false }: {
  zone: PrototypeZone
  layout: PrototypeLayout
  selection: Selection | null
  dragging: boolean
  dragDelta: number
  onClipPointer: (event: ReactPointerEvent<HTMLButtonElement>, clip: PrototypeClip, layout: PrototypeLayout) => void
  onTransition: () => void
  collapsed: boolean
  onToggle: () => void
  hideZoneHeader?: boolean
}) {
  if (collapsed && !hideZoneHeader) return <CollapsedZone zone={zone} layout={layout} onToggle={onToggle} />

  return <div className="border-b border-[#28323c]">
    {!hideZoneHeader && <button type="button" onClick={onToggle} className="sticky left-[92px] z-20 flex h-6 w-full items-center gap-1.5 border-b border-[#202a33] bg-[#0e151c]/95 px-1.5 text-left text-[9px] hover:bg-[#141d26]" style={{ color: zone.color }} aria-label={`Collapse ${zone.name}`}>
      <ChevronDown size={9} className="shrink-0 text-zinc-600" />
      <span className="grid size-4 place-items-center border border-current/40 bg-black/25 text-[6px] font-semibold">{zone.icon}</span>
      <strong className="truncate font-medium">{zone.name}</strong>
      <span className="ml-auto text-[7px] text-zinc-700">{zone.layers.length}L</span>
    </button>}
    {zone.layers.map((layer) => {
      const detail = layerDetails[layer.id]
      return <div key={layer.id} className="border-b border-[#202a33]/75 bg-black/[0.08]">
        <div className="relative h-9">
      {layer.clips.map((clip) => {
        const selected = selection?.id === clip.id || (clip.groupId && selection?.id === clip.groupId)
        const clipClass = clip.color === 'violet' ? violetClip : clip.color === 'amber' ? amberClip : cyanClip
        return <button
          type="button"
          key={clip.id}
          onPointerDown={(event) => onClipPointer(event, clip, layout)}
          className={`absolute bottom-1 top-1 z-10 min-w-3 overflow-hidden border px-1 text-left text-[8px] shadow-sm ${clipClass} ${selected ? 'ring-1 ring-[#ffe5a3] ring-offset-1 ring-offset-[#090d11]' : 'hover:brightness-125'} ${clip.groupId ? 'border-dashed' : ''}`}
          style={{ left: `${clip.start / layout.duration * 100}%`, width: `${clip.duration / layout.duration * 100}%`, transform: selected && dragging ? `translateX(${dragDelta}px)` : undefined }}
          title={`${clip.name} · ${clip.duration}s`}
        >
          <span className="truncate font-medium">{clip.name}</span>
          {clip.badges?.map((badge) => <i key={badge} className="ml-1 rounded-sm bg-black/30 px-0.5 text-[6px] not-italic text-white/60">{badge === 'linked' ? <Link2 size={6} className="inline" /> : badge}</i>)}
        </button>
      })}
      {layout.id === 'full' && layer.id === 'full-1' && <button type="button" onClick={(event) => { event.stopPropagation(); onTransition() }} className="absolute left-[42.5%] bottom-1 top-1 z-20 grid w-3 -translate-x-1/2 place-items-center border border-[#e4b85c]/55 bg-[#3b2c18] text-[#ffe5a3]" aria-label="Edit Cut"><Zap size={7} /></button>}
      {layer.clips.some((clip) => clip.groupId === 'echo') && <span className="pointer-events-none absolute inset-y-0 left-0 right-0 border-y border-dashed border-[#e4b85c]/30" />}
        </div>
        {detail?.effects && <EffectRail effects={detail.effects} layout={layout} />}
        {detail?.automation?.map((lane) => <AutomationRail key={lane.name} lane={lane} />)}
      </div>
    })}
  </div>
}

function EffectRail({ effects, layout }: { effects: PrototypeEffectSpan[]; layout: PrototypeLayout }) {
  return <div className="relative h-4 border-t border-[#202a33]/70 bg-[#10141a]" aria-label="Clip Effects timeline">
    <span className="absolute left-1 top-0.5 z-10 text-[6px] font-semibold uppercase tracking-[0.08em] text-[#e4b85c]">FX</span>
    {effects.map((effect) => <span key={`${effect.name}-${effect.start}`} className="absolute inset-y-[2px] overflow-hidden border-l border-r border-[#e4b85c]/35 bg-[#e4b85c]/10 px-1 text-[6px] leading-[11px] text-[#f3d58f]" style={{ left: `${effect.start / layout.duration * 100}%`, width: `${effect.duration / layout.duration * 100}%` }} title={`${effect.name} Effect`}>{effect.name}</span>)}
  </div>
}

function AutomationRail({ lane }: { lane: PrototypeAutomationLane }) {
  return <div className="relative h-4 overflow-hidden border-t border-[#202a33]/70 bg-[#0b1016]" aria-label={`${lane.name} property animation`}>
    <span className="absolute left-1 top-0.5 z-10 bg-[#0b1016]/85 pr-1 text-[6px] text-zinc-500">{lane.name}</span>
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
      <polyline points={lane.points} fill="none" stroke={lane.color} strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
    </svg>
    {lane.beats.map((beat) => <i key={beat} className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${beat}%`, backgroundColor: lane.color }} />)}
  </div>
}

function CollapsedZone({ zone, layout, onToggle }: { zone: PrototypeZone; layout: PrototypeLayout; onToggle: () => void }) {
  return <div className="border-b border-[#28323c] bg-[#0a0f14]">
    <button type="button" onClick={onToggle} className="flex h-5 w-full items-center gap-1 px-1.5 text-left text-[8px] hover:bg-[#141d26]" style={{ color: zone.color }} aria-label={`Expand ${zone.name}`}>
      <ChevronRight size={8} className="text-zinc-600" />
      <span className="grid size-3.5 place-items-center border border-current/40 text-[5px] font-semibold">{zone.icon}</span>
      <strong className="truncate font-medium">{zone.name}</strong>
      <span className="ml-auto text-[6px] text-zinc-700">collapsed · {zone.layers.length}L</span>
    </button>
    <div className="space-y-px border-t border-[#202a33] py-px">
      {zone.layers.map((layer) => {
        const detail = layerDetails[layer.id]
        return <div key={layer.id} className="relative h-2.5 overflow-hidden bg-white/[0.025]" title={`${layer.name} summary`}>
          {layer.clips.map((clip) => <span key={clip.id} className={`absolute inset-y-px overflow-hidden px-0.5 text-[5px] leading-[8px] ${clip.color === 'violet' ? 'bg-[#6d55a8]/55 text-violet-100' : clip.color === 'amber' ? 'bg-[#8a642a]/55 text-amber-100' : 'bg-[#2c7886]/55 text-cyan-50'}`} style={{ left: `${clip.start / layout.duration * 100}%`, width: `${clip.duration / layout.duration * 100}%` }}>{clip.name}</span>)}
          {detail?.automation?.map((lane) => <svg key={lane.name} viewBox="0 0 100 10" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden><polyline points={lane.points} fill="none" stroke={lane.color} strokeWidth="0.55" vectorEffect="non-scaling-stroke" /></svg>)}
          {detail?.effects?.map((effect) => <i key={`${effect.name}-${effect.start}`} className="absolute bottom-0 h-1 w-px bg-[#ffe5a3]" style={{ left: `${(effect.start + effect.duration / 2) / layout.duration * 100}%` }} title={effect.name} />)}
        </div>
      })}
    </div>
  </div>
}

function ZoneMapPopover({ layout, collapsedZones, onToggle, onClose }: { layout: PrototypeLayout; collapsedZones: Record<string, boolean>; onToggle: (id: string) => void; onClose: () => void }) {
  return <aside className="absolute left-2 top-12 z-[55] w-[278px] border border-[#536170] bg-[#0b1117]/[0.985] shadow-2xl shadow-black/80 backdrop-blur">
    <header className="flex h-8 items-center gap-1.5 border-b border-[#28323c] px-2 text-[9px]"><MapIcon size={10} className="text-[#67c7d6]" /><strong>{layout.name}</strong><span className="text-zinc-600">Zone Layout</span><button type="button" onClick={onClose} className="ml-auto text-zinc-600 hover:text-white" aria-label="Close Zone Map"><X size={10} /></button></header>
    <div className="p-1.5">
      {layout.zones.map((zone) => {
        const collapsed = Boolean(collapsedZones[`${layout.id}:${zone.id}`])
        const onlyZone = layout.zones.length === 1
        return <button type="button" key={zone.id} onClick={() => { if (!onlyZone) onToggle(zone.id) }} disabled={onlyZone} className="flex h-7 w-full items-center gap-1.5 px-1.5 text-left text-[8px] hover:bg-white/[0.04] disabled:cursor-default disabled:hover:bg-transparent" style={{ color: zone.color }}>
          {onlyZone ? <i className="w-2" /> : collapsed ? <ChevronRight size={8} /> : <ChevronDown size={8} />}
          <span className="grid size-4 place-items-center border border-current/40 text-[6px]">{zone.icon}</span>
          <span className="truncate">{zone.name}</span>
          <span className="ml-auto text-[7px] text-zinc-600">{onlyZone ? 'Only Zone' : collapsed ? 'Expand' : 'Collapse'}</span>
        </button>
      })}
      <button type="button" className={`${control} mt-1 w-full justify-center`}><Plus size={9} /> Add Zone</button>
    </div>
  </aside>
}

function EntityDetail({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  return <section className="absolute left-[clamp(12px,42%,calc(100%-320px))] top-[150px] z-50 w-[296px] border border-[#536170] bg-[#0c1117]/[0.985] text-[9px] shadow-2xl shadow-black/80 backdrop-blur" aria-label="Entity Details">
    <header className="flex h-7 items-center gap-1.5 border-b border-[#28323c] bg-[#121820] px-2">
      {selection.kind === 'boundary' ? <SplitSquareHorizontal size={10} className="text-[#e4b85c]" /> : selection.kind === 'group' ? <Layers3 size={10} className="text-[#e4b85c]" /> : <Grid2X2 size={10} className="text-[#67c7d6]" />}
      <strong className="truncate font-medium text-zinc-100">{selection.label}</strong>
      <span className="ml-auto text-[7px] uppercase tracking-[0.1em] text-zinc-600">{selection.kind}</span>
      <button type="button" className="text-zinc-600 hover:text-white" aria-label="Pin Details"><Pin size={9} /></button>
      <button type="button" onClick={onClose} className="text-zinc-600 hover:text-white" aria-label="Close Details"><X size={10} /></button>
    </header>
    <div className="grid grid-cols-4 gap-1.5 p-2">
      <DetailField label="Start" value={selection.kind === 'boundary' ? '12.000 s' : '4.023 s'} />
      <DetailField label="Duration" value={selection.kind === 'boundary' ? '—' : '5.000 s'} />
      <DetailField label="X" value="0%" />
      <DetailField label="Y" value="0%" />
      <DetailField label="Width" value="100%" />
      <DetailField label="Height" value="100%" />
      <DetailField label="Rotation" value="0°" />
      <DetailField label="Layer" value="1" />
    </div>
    <div className="flex border-t border-[#28323c] p-1.5">
      <button type="button" className={`${control} flex-1 justify-between`}>Pattern instance <span className="text-[#67c7d6]">Used by 2</span></button>
      <button type="button" className={`${control} ml-1 w-8 justify-center px-0`} aria-label="Add Effect"><Sparkles size={10} /></button>
    </div>
  </section>
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <label className="min-w-0 text-[7px] uppercase tracking-[0.08em] text-zinc-600"><span>{label}</span><input readOnly value={value} className="mt-0.5 h-6 w-full border border-[#28323c] bg-[#070a0d] px-1 text-[8px] normal-case tracking-normal text-zinc-300 outline-none focus:border-[#67c7d6]" /></label>
}

function TransitionChooser({ onClose }: { onClose: () => void }) {
  return <section className="absolute left-1/2 top-[170px] z-[60] w-[260px] -translate-x-1/2 border border-[#e4b85c]/50 bg-[#0c1117] shadow-2xl shadow-black/80">
    <header className="flex h-7 items-center gap-1.5 border-b border-[#28323c] px-2 text-[9px]"><Zap size={10} className="text-[#e4b85c]" /><strong>Edit Cut</strong><button type="button" onClick={onClose} className="ml-auto text-zinc-600 hover:text-white" aria-label="Close Transition chooser"><X size={10} /></button></header>
    <div className="grid grid-cols-3 gap-1.5 p-2">
      {['Crossfade', 'Wipe', 'Dissolve'].map((name) => <button type="button" key={name} className="h-12 border border-[#e4b85c]/30 bg-[#e4b85c]/[0.06] text-[8px] text-[#ffe5a3] hover:bg-[#e4b85c]/15"><span className="mx-auto mb-1 block h-2 w-10 bg-[linear-gradient(90deg,#67c7d6,transparent,#e4b85c)]" />{name}</button>)}
    </div>
    <div className="flex items-end gap-2 border-t border-[#28323c] p-2"><DetailField label="Duration · max 0.40s" value="0.400 s" /><button type="button" className={`${control} mb-0 w-24 justify-center border-[#e4b85c]/45 text-[#ffe5a3]`}>Apply</button></div>
    <button type="button" className="mx-2 mb-2 text-left text-[8px] text-[#e4b85c] hover:text-white">Need more room? Insert Time…</button>
  </section>
}

function LayoutInsertMenu({ position, onClose }: { position: number; onClose: () => void }) {
  return <section className="absolute right-3 top-12 z-[60] w-[294px] border border-[#67c7d6]/45 bg-[#0c1117] shadow-2xl shadow-black/80">
    <header className="flex h-8 items-center gap-1.5 border-b border-[#28323c] px-2 text-[9px]"><SplitSquareHorizontal size={10} className="text-[#67c7d6]" /><strong>Insert Layout at {position.toFixed(2)}s</strong><button type="button" onClick={onClose} className="ml-auto text-zinc-600 hover:text-white" aria-label="Close Layout insertion"><X size={10} /></button></header>
    <div className="p-2">
      <div className="grid grid-cols-[1fr_74px] gap-2"><label className="text-[7px] uppercase tracking-[0.08em] text-zinc-600">Layout source<select className="mt-1 h-7 w-full border border-[#28323c] bg-[#070a0d] px-1 text-[9px] normal-case text-zinc-300"><option>Blank Layout</option><option>Use named Layout…</option><option>Copy previous Layout</option><option>Duplicate interval</option></select></label><DetailField label="Duration" value="8.000 s" /></div>
      <div className="mt-2 border-l-2 border-[#67c7d6]/45 bg-[#67c7d6]/[0.05] p-2 text-[8px] leading-4 text-zinc-500">Splits 2 Clips · shifts later content 8s · creates entry and return boundaries</div>
      <button type="button" className={`${control} mt-2 w-full justify-center border-[#67c7d6]/45 text-[#9adde4]`}>Insert Layout Interval</button>
    </div>
  </section>
}

function Stage({ layout, position, playing, className = '' }: { layout: PrototypeLayout; position: number; playing: boolean; className?: string }) {
  return <aside className={`flex min-h-0 flex-col bg-[#0a0e13] ${className}`}>
    <header className="flex h-9 shrink-0 items-center border-b border-[#28323c] px-2 text-[8px] uppercase tracking-[0.12em] text-zinc-600">Stage <span className="ml-auto normal-case tracking-normal text-zinc-500">{layout.name} · {position.toFixed(2)}s</span></header>
    <div className="relative m-3 min-h-0 flex-1 overflow-hidden border border-[#28323c] bg-[radial-gradient(circle_at_50%_50%,#183d48_0,#171328_35%,#07090d_72%)]">
      <div className={`absolute inset-[12%] rounded-full border border-[#67c7d6]/40 bg-[conic-gradient(from_45deg,#67c7d600,#67c7d699,#a78bfa55,#e4b85c88,#67c7d600)] blur-[2px] ${playing ? 'animate-spin [animation-duration:9s]' : ''}`} />
      {layout.zones.length > 1 && <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${Math.min(2, layout.zones.length)},1fr)`, gridTemplateRows: `repeat(${Math.ceil(layout.zones.length / 2)},1fr)` }}>{layout.zones.map((zone) => <span key={zone.id} className="relative border border-dashed border-white/15"><i className="absolute left-1 top-1 bg-black/55 px-1 text-[7px] not-italic" style={{ color: zone.color }}>{zone.icon}</i></span>)}</div>}
    </div>
    <div className="flex h-9 shrink-0 items-center gap-1 border-t border-[#28323c] px-2"><button type="button" className={control}><Eye size={10} /> Zones</button><button type="button" className={control}><Focus size={10} /> Focus</button><span className="ml-auto text-[7px] text-emerald-400">Preview ready</span></div>
  </aside>
}

function PrototypeSwitcher({ fixture, variant, onChange }: { fixture: Fixture; variant: Variant; onChange: (patch: { fixture?: Fixture; variant?: Variant }) => void }) {
  return <div className="fixed bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 border border-[#536170] bg-[#0b1117]/95 p-1 text-[8px] shadow-2xl shadow-black/80 backdrop-blur">
    <span className="hidden px-1 uppercase tracking-[0.1em] text-zinc-700 min-[760px]:inline">Collapse preset</span>
    {(['expanded', 'working', 'collapsed'] as const).map((item) => <button type="button" key={item} onClick={() => onChange({ variant: item })} className={`h-6 border px-2 ${variant === item ? 'border-[#e4b85c]/60 bg-[#e4b85c]/10 text-[#ffe5a3]' : 'border-[#28323c] text-zinc-500 hover:text-white'}`}>{item === 'expanded' ? 'All expanded' : item === 'working' ? 'Working set' : 'All collapsed'}</button>)}
    <span className="mx-1 h-4 w-px bg-[#28323c]" />
    <button type="button" onClick={() => onChange({ fixture: fixture === 'simple' ? 'topology' : 'simple' })} className="h-6 border border-[#28323c] px-2 text-zinc-500 hover:text-white">{fixture === 'simple' ? 'Show 4→1→3' : 'Show simple'}</button>
  </div>
}

function variantLabel(variant: Variant): string {
  if (variant === 'working') return 'Working collapse preset'
  if (variant === 'collapsed') return 'All Zones collapsed'
  return 'All Zones expanded'
}
