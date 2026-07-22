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
  MoreHorizontal,
  Pause,
  Pin,
  Play,
  Plus,
  Search,
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

interface DetailPanel {
  selection: Selection
  x: number
  y: number
}

interface PrototypeAppliedEffect {
  id: string
  name: string
  summary: string
  stage: 'Transform' | 'Distort' | 'Address' | 'Color & output'
}

const initialEffectsByOwner: Record<string, PrototypeAppliedEffect[]> = {
  echo: [
    { id: 'glow', name: 'Glow', summary: '35% · animated', stage: 'Color & output' },
    { id: 'stutter', name: 'Stutter', summary: '4 Hz · stepped', stage: 'Address' },
  ],
  rings: [
    { id: 'glow', name: 'Glow', summary: '35% · animated', stage: 'Color & output' },
    { id: 'stutter', name: 'Stutter', summary: '4 Hz · stepped', stage: 'Address' },
  ],
  bloom: [
    { id: 'ripple', name: 'Ripple', summary: 'Amount 0.20', stage: 'Distort' },
    { id: 'bloom', name: 'Bloom', summary: '48% · animated', stage: 'Color & output' },
  ],
  rain: [{ id: 'posterize', name: 'Posterize', summary: '6 levels', stage: 'Color & output' }],
}

const effectCatalogue: PrototypeAppliedEffect[] = [
  { id: 'translate', name: 'Translate', summary: 'Move source coordinates', stage: 'Transform' },
  { id: 'rotate', name: 'Rotate', summary: 'Turn around placement center', stage: 'Transform' },
  { id: 'scale', name: 'Scale', summary: 'Resize source coordinates', stage: 'Transform' },
  { id: 'ripple', name: 'Ripple', summary: 'Radial coordinate displacement', stage: 'Distort' },
  { id: 'swirl', name: 'Swirl', summary: 'Rotate pixels by radius', stage: 'Distort' },
  { id: 'kaleidoscope', name: 'Kaleidoscope', summary: 'Reflect repeated wedges', stage: 'Distort' },
  { id: 'wrap', name: 'Wrap', summary: 'Repeat outside source bounds', stage: 'Address' },
  { id: 'invert', name: 'Invert', summary: 'Reverse output colors', stage: 'Color & output' },
  { id: 'posterize', name: 'Posterize', summary: 'Reduce color levels', stage: 'Color & output' },
]

const TOTAL = 32
const control = 'inline-flex h-8 items-center gap-2 rounded-[3px] px-2.5 text-[12px] font-medium text-[#aeb8c3] transition-colors hover:bg-white/[0.055] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f5f7fa] disabled:cursor-not-allowed disabled:opacity-30'
const iconControl = `${control} w-8 justify-center px-0`
const cyanClip = 'border-[#67c7d6]/55 bg-[#14272d] text-[#edfafd]'
const violetClip = 'border-[#a78bfa]/50 bg-[#252039] text-[#f4f0ff]'
const amberClip = 'border-[#e4b85c]/50 bg-[#302617] text-[#fff7dc]'

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
    zones: [{ id: 'full-zone', name: 'All pixels', icon: 'AP', color: '#67c7d6', layers: [
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
  const [detailPanels, setDetailPanels] = useState<DetailPanel[]>([])
  const [dragging, setDragging] = useState(false)
  const [dragDelta, setDragDelta] = useState(0)
  const [transitionOpen, setTransitionOpen] = useState(false)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [effectPaletteOwner, setEffectPaletteOwner] = useState<Selection | null>(null)
  const [effectsByOwner, setEffectsByOwner] = useState<Record<string, PrototypeAppliedEffect[]>>(() => Object.fromEntries(
    Object.entries(initialEffectsByOwner).map(([owner, effects]) => [owner, [...effects]]),
  ))
  const [collapsedZones, setCollapsedZones] = useState<Record<string, boolean>>(() => initialCollapsedZones(layouts, variant))
  const mainRef = useRef<HTMLElement>(null)
  const outsideDismissedDetailsRef = useRef<DetailPanel[]>([])

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
      if (event.key.toLowerCase() === 'i' && selection) {
        setDetailPanels((current) => {
          const exists = current.some((panel) => panel.selection.id === selection.id && panel.selection.kind === selection.kind)
          return exists ? current.filter((panel) => panel.selection.id !== selection.id || panel.selection.kind !== selection.kind) : [...current, { selection, x: 220, y: 132 }]
        })
      }
      if (event.key === 'Escape') {
        if (effectPaletteOwner) setEffectPaletteOwner(null)
        else if (zonesOpen) setZonesOpen(false)
        else if (transitionOpen) setTransitionOpen(false)
        else if (layoutMenuOpen) setLayoutMenuOpen(false)
        else if (detailPanels.length) setDetailPanels([])
        else setSelection(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detailPanels.length, effectPaletteOwner, layoutMenuOpen, selection, transitionOpen, zonesOpen])

  const updateParams = (patch: { fixture?: Fixture; variant?: Variant }) => {
    const url = new URL(window.location.href)
    url.searchParams.set('prototype', 'show-overhaul')
    url.searchParams.set('fixture', patch.fixture ?? fixture)
    url.searchParams.set('variant', patch.variant ?? variant)
    window.location.href = url.toString()
  }

  const openDetail = (next: Selection, x: number, y: number) => {
    setSelection(next)
    setDetailPanels((current) => {
      const others = current.filter((panel) => panel.selection.id !== next.id || panel.selection.kind !== next.kind)
      let placedX = x
      let placedY = y
      for (const panel of others) {
        if (Math.abs(panel.x - placedX) < 28 && Math.abs(panel.y - placedY) < 28) {
          placedX += 18
          placedY += 18
        }
      }
      return [...others, { selection: next, x: placedX, y: placedY }]
    })
  }

  const select = (next: Selection) => {
    openDetail(next, 220, 132)
  }

  const bringDetailToFront = (target: DetailPanel) => {
    setDetailPanels((current) => {
      const index = current.findIndex((panel) => panel.selection.id === target.selection.id && panel.selection.kind === target.selection.kind)
      if (index < 0 || index === current.length - 1) return current
      return [...current.slice(0, index), ...current.slice(index + 1), current[index]]
    })
  }

  const closeDetailsFromOutsidePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-entity-detail]')) {
      outsideDismissedDetailsRef.current = []
      return
    }
    outsideDismissedDetailsRef.current = detailPanels
    if (detailPanels.length) setDetailPanels([])
    setEffectPaletteOwner(null)
  }

  const applyPrototypeEffect = (effect: PrototypeAppliedEffect) => {
    if (!effectPaletteOwner) return
    const ownerId = effectPaletteOwner.id
    setEffectsByOwner((current) => {
      const existing = current[ownerId] ?? []
      if (existing.some((candidate) => candidate.id === effect.id)) return current
      return { ...current, [ownerId]: [...existing, effect] }
    })
    setEffectPaletteOwner(null)
  }

  const beginClipPointer = (event: ReactPointerEvent<HTMLButtonElement>, clip: PrototypeClip, layout: PrototypeLayout) => {
    event.stopPropagation()
    const startX = event.clientX
    let moved = false
    const nextSelection: Selection = { kind: clip.groupId ? 'group' : 'clip', id: clip.groupId ?? clip.id, layoutId: layout.id, label: clip.groupId ? 'Echo group' : clip.name }
    const dismissedDetails = outsideDismissedDetailsRef.current
    const wasOpen = dismissedDetails.some((panel) => panel.selection.id === nextSelection.id && panel.selection.kind === nextSelection.kind)
    const clipRect = event.currentTarget.getBoundingClientRect()
    const mainRect = mainRef.current?.getBoundingClientRect()
    const anchorX = mainRect ? Math.min(Math.max(8, clipRect.left - mainRect.left), Math.max(8, mainRect.width - 304)) : 220
    const anchorY = mainRect ? Math.min(Math.max(56, clipRect.bottom - mainRect.top + 7), Math.max(56, mainRect.height - 210)) : 132
    setSelection(nextSelection)
    const move = (next: PointerEvent) => {
      const delta = next.clientX - startX
      if (!moved && Math.abs(delta) > 4) {
        moved = true
        setDragging(true)
      }
      if (moved) setDragDelta(delta)
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      if (moved) {
        setDragging(false)
        setDragDelta(0)
        setDetailPanels(dismissedDetails)
      } else if (!wasOpen) openDetail(nextSelection, anchorX, anchorY)
      outsideDismissedDetailsRef.current = []
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }

  return (
    <div onPointerDownCapture={closeDetailsFromOutsidePointer} className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#080b0f] font-sans text-[#dce3ea]">
      <header className="flex h-12 shrink-0 items-center border-b border-[#26313b] bg-[#0b1016] px-4">
        <span className="rounded-[2px] border border-[#67c7d6]/30 bg-[#67c7d6]/[0.07] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8dd9e2]">Prototype</span>
        <strong className="ml-3 text-[17px] font-semibold tracking-[-0.015em] text-[#f2f5f8]">Cathedral Signal</strong>
        <span className="ml-2.5 text-[12px] text-[#66717c]">Show</span>
        <span className="ml-auto hidden font-mono text-[10px] text-[#59646f] min-[680px]:inline">Changing topology · fixture data</span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(320px,27vw,400px)] max-[980px]:grid-cols-[minmax(0,1fr)_280px] max-[720px]:grid-cols-1">
        <main ref={mainRef} className="relative flex min-h-0 min-w-0 flex-col border-r border-[#26313b] bg-[#090d12]">
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
              layouts={layouts}
              activeLayoutId={activeLayout.id}
              collapsedZones={collapsedZones}
              onToggle={(layoutId, zoneId) => setCollapsedZones((current) => ({
                ...current,
                [`${layoutId}:${zoneId}`]: !current[`${layoutId}:${zoneId}`],
              }))}
              onClose={() => setZonesOpen(false)}
            />
          )}

          <div data-testid="show-timeline-surface" className="min-h-0 flex-1 overflow-auto">
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

          <footer className="flex h-7 shrink-0 items-center border-t border-[#26313b] bg-[#0b1016] px-3 font-mono text-[10px] text-[#66717c]">
            <CircleDot size={9} className="mr-1.5 text-emerald-400" /> Preview ready
            <span className="ml-auto">{dragging ? `Moving · ${dragDelta > 0 ? '+' : ''}${(dragDelta / 28).toFixed(2)}s · Details hidden` : `${variantLabel(variant)} · ${activeLayout.name} under playhead`}</span>
          </footer>

          {!dragging && detailPanels.map((panel, index) => (
            <EntityDetail
              key={`${panel.selection.kind}:${panel.selection.id}`}
              panel={panel}
              layer={index}
              effects={effectsByOwner[panel.selection.id] ?? []}
              onAddEffect={() => setEffectPaletteOwner(panel.selection)}
              onActivate={() => bringDetailToFront(panel)}
              onClose={() => setDetailPanels((current) => current.filter((item) => item.selection.id !== panel.selection.id || item.selection.kind !== panel.selection.kind))}
            />
          ))}
          {effectPaletteOwner && <EffectPalettePrototype owner={effectPaletteOwner} applied={effectsByOwner[effectPaletteOwner.id] ?? []} onApply={applyPrototypeEffect} onClose={() => setEffectPaletteOwner(null)} />}
          {transitionOpen && <TransitionChooser onClose={() => setTransitionOpen(false)} />}
          {layoutMenuOpen && <LayoutInsertMenu position={position} onClose={() => setLayoutMenuOpen(false)} />}
        </main>

        <Stage layout={activeLayout} position={position} playing={playing} className="max-[720px]:hidden" />
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
  return <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#26313b] bg-[#0b1016] px-3">
    <div className="flex shrink-0 items-center gap-0.5">
      <button type="button" onClick={() => onPlaying(!playing)} className={iconControl} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
      <button type="button" onClick={onStart} className={iconControl} aria-label="Go to Show start"><SkipBack size={14} /></button>
      <span className="ml-2 min-w-[82px] font-mono text-[12px] tabular-nums text-[#e3e8ed] max-[640px]:min-w-[54px]">{position.toFixed(2)} <i className="not-italic text-[#59646f] max-[640px]:hidden">/ 32.00</i></span>
    </div>

    <span className="h-6 w-px shrink-0 bg-[#26313b]" />
    <Navigator position={position} viewportDuration={viewportDuration} layouts={layouts} onPosition={onPosition} onFit={onFit} />
    <span className="h-6 w-px shrink-0 bg-[#26313b]" />

    <div className="flex shrink-0 items-center justify-end gap-0.5">
      <button type="button" onClick={onZones} aria-pressed={zonesOpen} className={`${control} ${zonesOpen ? 'bg-[#67c7d6]/[0.09] text-[#9be0e7]' : ''}`} title={`Zones · ${activeLayout.name}`}><MapIcon size={14} /><span className="max-[1080px]:hidden">Zones</span><ChevronDown size={11} /></button>
      <button type="button" className={iconControl} title="Snap" aria-label="Snap"><Magnet size={14} /></button>
      <button type="button" className={iconControl} title="Select" aria-label="Select"><BoxSelect size={14} /></button>
      <button type="button" onClick={onInsertLayout} className={control} title="Insert Layout"><SplitSquareHorizontal size={14} /><span className="hidden min-[1160px]:inline">Insert Layout</span></button>
      <button type="button" className={control} title="Add"><Plus size={14} /><span className="hidden min-[1000px]:inline">Add</span></button>
      <button type="button" className={`${iconControl} min-[721px]:hidden`} title="Preview" aria-label="Preview"><Eye size={14} /></button>
      <button type="button" className={iconControl} title="More" aria-label="More"><MoreHorizontal size={15} /></button>
    </div>
  </div>
}

function Navigator({ position, viewportDuration, layouts, onPosition, onFit }: { position: number; viewportDuration: number; layouts: PrototypeLayout[]; onPosition: (value: number) => void; onFit: () => void }) {
  return <div className="flex min-w-[120px] flex-1 items-center gap-1 max-w-[360px]">
    <button type="button" className="relative h-4 flex-1 overflow-hidden rounded-[2px] bg-[#05080b] shadow-[inset_0_0_0_1px_#26313b]" aria-label="Show Navigator" onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect()
      onPosition(Math.max(0, Math.min(TOTAL, (event.clientX - rect.left) / rect.width * TOTAL)))
    }}>
      {layouts.map((layout) => <span key={layout.id} className="absolute inset-y-[3px] border-r border-[#66717c]/35 bg-[#67c7d6]/[0.08]" style={{ left: `${layout.start / TOTAL * 100}%`, width: `${layout.duration / TOTAL * 100}%` }} />)}
      <span className="absolute inset-y-[1px] rounded-[1px] border border-[#8b99a7]/55 bg-[#aeb8c3]/[0.09]" style={{ left: 0, width: `${viewportDuration / TOTAL * 100}%` }} />
      <span className="absolute inset-y-0 w-px bg-[#f0c96d]" style={{ left: `${position / TOTAL * 100}%` }} />
    </button>
    <button type="button" className="grid size-7 shrink-0 place-items-center rounded-[3px] text-[#74808b] hover:bg-white/[0.055] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white disabled:text-[#303942]" onClick={onFit} disabled={viewportDuration >= TOTAL} title="Fit entire Show" aria-label="Fit entire Show"><Maximize2 size={12} /></button>
  </div>
}

function Ruler({ position, onPosition }: { position: number; onPosition: (value: number) => void }) {
  return <div className="sticky top-0 z-40 h-8 min-w-[720px] border-b border-[#34404b] bg-[#0a0f14]/95 backdrop-blur">
    <button type="button" className="relative size-full cursor-crosshair font-mono" aria-label="Timeline ruler" onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect()
      onPosition(Math.max(0, Math.min(TOTAL, (event.clientX - rect.left) / rect.width * TOTAL)))
    }}>
      {[0, 4, 8, 12, 16, 20, 24, 28, 32].map((tick) => <span key={tick} className="absolute inset-y-0 border-l border-[#26313b] pl-1.5 pt-1.5 text-[10px] tabular-nums text-[#68737e]" style={{ left: `${tick / TOTAL * 100}%` }}>{tick}s</span>)}
      <span className="absolute bottom-0 top-0 z-30 w-px bg-[#f0c96d]" style={{ left: `${position / TOTAL * 100}%` }}><i className="absolute -left-[4px] top-0 size-2 rotate-45 bg-[#f0c96d]" /></span>
      <span className="absolute bottom-0 top-0 left-[56.25%] border-l border-dashed border-[#ad96f5]/50"><i className="absolute -left-2.5 top-0 bg-[#211c31] px-1.5 py-0.5 text-[10px] not-italic text-[#c9bcff]">hit</i></span>
      <span className="absolute right-1 top-1.5 text-[10px] uppercase tracking-[0.12em] text-[#4f5a65]">Show End</span>
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
  return <div className="relative min-h-[430px] min-w-[720px] bg-[linear-gradient(90deg,rgba(73,84,96,0.10)_1px,transparent_1px)] bg-[length:12.5%_100%]">
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
    className={`relative shrink-0 border-r border-[#52606d]/45 ${active ? 'bg-[#67c7d6]/[0.025]' : 'bg-[#090d12]/70'}`}
    style={{ width: `${layout.duration / TOTAL * 100}%`, minHeight: 365 }}
    aria-label={`${layout.name} Layout interval`}
  >
    {boundary && <button type="button" onClick={() => onSelection({ kind: 'boundary', id: `boundary-${layout.id}`, layoutId: layout.id, label: `Boundary before ${layout.name}` })} className="absolute -left-[5px] top-0 z-30 h-full w-[10px] cursor-ew-resize" aria-label={`Boundary before ${layout.name}`}><span className="absolute left-[4px] top-0 h-full w-px bg-[#e4b85c]/45" /></button>}
    {showLabel && <header className={`sticky left-0 z-20 flex h-8 items-center gap-2 border-b border-[#34404b] bg-[#0f161d]/95 px-2.5 ${active ? 'text-[#e9f8fa]' : 'text-[#8b96a1]'}`}>
      <Grid2X2 size={12} className={active ? 'text-[#67c7d6]' : 'text-[#59646f]'} />
      <strong className="truncate text-[13px] font-medium tracking-[-0.01em]">{layout.zones.length === 1 ? `${layout.name} · ${layout.zones[0].name}` : layout.name}</strong>
      <span className="ml-auto font-mono text-[10px] text-[#56616c]">{layout.zones.length}Z</span>
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

  return <div className="border-b border-[#26313b]" style={{ background: `linear-gradient(90deg, ${zone.color}0d, transparent 44%)`, boxShadow: `inset 2px 0 0 ${zone.color}88` }}>
    {!hideZoneHeader && <button type="button" onClick={onToggle} className="sticky left-0 z-20 flex h-8 w-full items-center gap-2 bg-[#0d141a]/90 px-2.5 text-left hover:bg-[#121b23]" style={{ color: zone.color }} aria-label={`Collapse ${zone.name}`}>
      <ChevronDown size={12} className="shrink-0 text-[#65717d]" />
      <span className="grid size-5 place-items-center rounded-[2px] bg-black/30 font-mono text-[10px] font-semibold ring-1 ring-current/30">{zone.icon}</span>
      <strong className="truncate text-[13px] font-medium tracking-[-0.01em]">{zone.name}</strong>
      <span className="ml-auto font-mono text-[10px] text-[#59646f]">{zone.layers.length}L</span>
    </button>}
    {zone.layers.map((layer) => {
      const detail = layerDetails[layer.id]
      return <div key={layer.id} className="border-b border-[#26313b]/65 bg-black/[0.055]">
        <div className="relative h-[36px]">
      {layer.clips.map((clip) => {
        const selected = selection?.id === clip.id || (clip.groupId && selection?.id === clip.groupId)
        const clipClass = clip.color === 'violet' ? violetClip : clip.color === 'amber' ? amberClip : cyanClip
        const accent = clip.color === 'violet' ? '#a78bfa' : clip.color === 'amber' ? '#e4b85c' : '#67c7d6'
        return <button
          type="button"
          key={clip.id}
          aria-label={clip.name}
          onPointerDown={(event) => onClipPointer(event, clip, layout)}
          className={`absolute bottom-[3px] top-[3px] z-10 min-w-4 overflow-hidden rounded-[2px] border px-2 text-left shadow-[0_1px_5px_rgba(0,0,0,0.32)] transition-[filter,transform] ${clipClass} ${selected ? 'ring-2 ring-[#67c7d6] ring-offset-1 ring-offset-[#090d12]' : 'hover:brightness-115'} ${clip.groupId ? 'border-dashed' : ''}`}
          style={{ left: `${clip.start / layout.duration * 100}%`, width: `${clip.duration / layout.duration * 100}%`, transform: selected && dragging ? `translateX(${dragDelta}px)` : undefined }}
          title={`${clip.name} · ${clip.duration}s`}
        >
          <span className="pointer-events-none absolute inset-0 opacity-35" style={{ background: `radial-gradient(circle at 22% 15%, ${accent}90, transparent 38%), linear-gradient(110deg, transparent 35%, ${accent}45 56%, transparent 75%)` }} />
          <span className="pointer-events-none absolute inset-y-0 left-0 w-[78%] bg-[linear-gradient(90deg,rgba(5,10,13,0.82)_0%,rgba(5,10,13,0.52)_58%,transparent_100%)]" />
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}55 65%, transparent)` }} />
          <span className="relative z-10 flex min-w-0 items-center gap-1.5">
            <span className="truncate py-0.5 pr-3 text-[13px] font-normal tracking-[-0.01em] text-shadow-[0_1px_3px_#000]">{clip.name}</span>
            {clip.badges?.map((badge) => <i key={badge} className="shrink-0 border-l border-white/20 pl-1.5 font-mono text-[10px] not-italic text-white/70 [filter:drop-shadow(0_1px_2px_#000)]" aria-label={badge === 'linked' ? 'Shared Pattern instance' : undefined} title={badge === 'linked' ? 'Shared Pattern instance' : undefined}>{badge === 'linked' ? <Link2 size={10} className="inline" /> : badge}</i>)}
          </span>
        </button>
      })}
      {layout.id === 'full' && layer.id === 'full-1' && <button type="button" onClick={(event) => { event.stopPropagation(); onTransition() }} className="absolute bottom-0 top-0 left-[42.5%] z-20 grid w-6 -translate-x-1/2 place-items-center text-[#f0c96d] focus-visible:outline-2 focus-visible:outline-white" aria-label="Edit Cut"><span className="grid h-8 w-2.5 place-items-center bg-[#271f12] shadow-[inset_1px_0_0_#e4b85c88,inset_-1px_0_0_#e4b85c88]"><Zap size={8} /></span></button>}
      {layer.clips.some((clip) => clip.groupId === 'echo') && <span className="pointer-events-none absolute inset-y-0 left-0 right-0 border-y border-dashed border-[#e4b85c]/30" />}
        </div>
        {detail?.effects && <EffectRail effects={detail.effects} layout={layout} />}
        {detail?.automation?.map((lane) => <AutomationRail key={lane.name} lane={lane} />)}
      </div>
    })}
  </div>
}

function EffectRail({ effects, layout }: { effects: PrototypeEffectSpan[]; layout: PrototypeLayout }) {
  return <div className="relative h-6 border-t border-[#26313b]/60 bg-[#0c1117]/80" aria-label="Clip Effects timeline">
    {effects.map((effect) => <span key={`${effect.name}-${effect.start}`} className="absolute inset-y-[3px] overflow-hidden border-x border-[#e4b85c]/30 bg-[#e4b85c]/[0.09] px-1.5 font-mono text-[10px] leading-[18px] text-[#e6ca86]" style={{ left: `${effect.start / layout.duration * 100}%`, width: `${effect.duration / layout.duration * 100}%` }} title={`${effect.name} Effect`}>{effect.name}</span>)}
  </div>
}

function AutomationRail({ lane }: { lane: PrototypeAutomationLane }) {
  return <div className="relative h-6 overflow-hidden border-t border-[#26313b]/60 bg-[#090e13]" aria-label={`${lane.name} property animation`}>
    <span className="absolute left-1.5 top-1 z-10 rounded-[2px] bg-[#090e13]/90 px-1 font-mono text-[10px] text-[#78838e]">{lane.name}</span>
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
      <polyline points={lane.points} fill="none" stroke={lane.color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
    {lane.beats.map((beat) => <i key={beat} className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#090e13]" style={{ left: `${beat}%`, backgroundColor: lane.color }} />)}
  </div>
}

function CollapsedZone({ zone, layout, onToggle }: { zone: PrototypeZone; layout: PrototypeLayout; onToggle: () => void }) {
  return <div className="border-b border-[#26313b] bg-[#0a1015]" style={{ boxShadow: `inset 2px 0 0 ${zone.color}88` }}>
    <button type="button" onClick={onToggle} className="relative h-8 w-full overflow-hidden text-left hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white" aria-label={`Expand ${zone.name}`}>
    <div className="absolute inset-0 grid gap-px py-1" style={{ gridTemplateRows: `repeat(${zone.layers.length}, minmax(0, 1fr))` }}>
      {zone.layers.map((layer) => {
        const detail = layerDetails[layer.id]
        return <div key={layer.id} className="relative min-h-0 overflow-hidden bg-white/[0.025]" title={`${layer.name} summary`}>
          {layer.clips.map((clip) => <span key={clip.id} className={`absolute inset-y-px overflow-hidden ${clip.color === 'violet' ? 'bg-[#8069bd]/65' : clip.color === 'amber' ? 'bg-[#9d7435]/65' : 'bg-[#398895]/65'}`} style={{ left: `${clip.start / layout.duration * 100}%`, width: `${clip.duration / layout.duration * 100}%` }} />)}
          {detail?.automation?.map((lane) => <svg key={lane.name} viewBox="0 0 100 10" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden><polyline points={lane.points} fill="none" stroke={lane.color} strokeWidth="0.55" vectorEffect="non-scaling-stroke" /></svg>)}
          {detail?.effects?.map((effect) => <i key={`${effect.name}-${effect.start}`} className="absolute bottom-0 h-1 w-px bg-[#ffe5a3]" style={{ left: `${(effect.start + effect.duration / 2) / layout.duration * 100}%` }} title={effect.name} />)}
        </div>
      })}
    </div>
      <span className="absolute inset-y-0 left-0 flex w-[154px] items-center gap-2 bg-[linear-gradient(90deg,#0a1015_78%,transparent)] px-2.5" style={{ color: zone.color }}>
        <ChevronRight size={12} className="shrink-0 text-[#65717d]" />
        <span className="grid size-5 shrink-0 place-items-center rounded-[2px] bg-black/35 font-mono text-[10px] font-semibold ring-1 ring-current/30">{zone.icon}</span>
        <strong className="truncate text-[12px] font-medium">{zone.name}</strong>
      </span>
      <span className="absolute right-2 top-2 font-mono text-[10px] text-[#65717d]">{zone.layers.length}L</span>
    </button>
  </div>
}

function ZoneMapPopover({ layouts, activeLayoutId, collapsedZones, onToggle, onClose }: { layouts: PrototypeLayout[]; activeLayoutId: string; collapsedZones: Record<string, boolean>; onToggle: (layoutId: string, zoneId: string) => void; onClose: () => void }) {
  return <aside className="absolute left-3 top-[58px] z-[55] w-[320px] overflow-hidden rounded-[3px] border border-[#52606d] bg-[#0b1117]/[0.985] shadow-[0_18px_55px_rgba(0,0,0,0.72)] backdrop-blur" aria-label="Zone Map">
    <header className="flex h-10 items-center gap-2 border-b border-[#26313b] px-3"><MapIcon size={14} className="text-[#67c7d6]" /><strong className="text-[14px] font-semibold">Zone Map</strong><span className="font-mono text-[10px] text-[#66717c]">Show structure</span><button type="button" onClick={onClose} className="ml-auto grid size-7 place-items-center rounded-[3px] text-[#66717c] hover:bg-white/[0.05] hover:text-white" aria-label="Close Zone Map"><X size={13} /></button></header>
    <div className="max-h-[420px] overflow-auto py-1.5">
      {layouts.map((layout) => <section key={layout.id} className={layout.id === activeLayoutId ? 'bg-[#67c7d6]/[0.035]' : ''}>
        <header className="flex h-8 items-center px-3">
          <strong className={`truncate text-[12px] font-medium ${layout.id === activeLayoutId ? 'text-[#dff7fa]' : 'text-[#8d98a3]'}`}>{layout.name}</strong>
          <span className="ml-auto font-mono text-[10px] text-[#59646f]">{layout.start.toFixed(0)}-{(layout.start + layout.duration).toFixed(0)}s</span>
        </header>
        {layout.zones.map((zone) => {
          const collapsed = Boolean(collapsedZones[`${layout.id}:${zone.id}`])
          const onlyZone = layout.zones.length === 1
          return <button type="button" key={zone.id} onClick={() => { if (!onlyZone) onToggle(layout.id, zone.id) }} disabled={onlyZone} className="flex h-9 w-full items-center gap-2 px-3 text-left hover:bg-white/[0.045] disabled:cursor-default disabled:hover:bg-transparent" style={{ color: zone.color }}>
            {onlyZone ? <i className="w-3" /> : collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span className="grid size-5 place-items-center rounded-[2px] bg-black/30 font-mono text-[10px] ring-1 ring-current/30">{zone.icon}</span>
            <span className="truncate text-[13px] font-medium">{zone.name}</span>
            <span className="ml-auto font-mono text-[10px] text-[#66717c]">{onlyZone ? 'only Zone' : collapsed ? 'collapsed' : `${zone.layers.length}L`}</span>
          </button>
        })}
      </section>)}
      <button type="button" className={`${control} mx-2 mt-1 w-[calc(100%_-_16px)] justify-center bg-white/[0.025]`}><Plus size={13} /> Add Layout or Zone</button>
    </div>
  </aside>
}

function EntityDetail({ panel, layer, effects, onAddEffect, onActivate, onClose }: { panel: DetailPanel; layer: number; effects: PrototypeAppliedEffect[]; onAddEffect: () => void; onActivate: () => void; onClose: () => void }) {
  const { selection } = panel
  return <section data-entity-detail onPointerDown={onActivate} className="absolute w-[296px] overflow-visible rounded-[3px] border border-[#52606d] bg-[#0c1117]/[0.985] shadow-[0_14px_42px_rgba(0,0,0,0.68)] backdrop-blur" style={{ left: panel.x, top: panel.y, zIndex: 50 + layer }} aria-label={`Entity Details · ${selection.label}`}>
    <i className="absolute -top-[5px] left-6 size-2.5 rotate-45 border-l border-t border-[#52606d] bg-[#0c1117]" aria-hidden />
    <header className="flex h-9 items-center gap-2 border-b border-[#26313b] px-2.5">
      {selection.kind === 'boundary' ? <SplitSquareHorizontal size={14} className="text-[#e4b85c]" /> : selection.kind === 'group' ? <Layers3 size={14} className="text-[#e4b85c]" /> : <Grid2X2 size={14} className="text-[#67c7d6]" />}
      <strong className="truncate text-[13px] font-semibold text-[#f2f5f8]">{selection.label}</strong>
      <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-[#66717c]">{selection.kind}</span>
      <button type="button" className="grid size-6 place-items-center rounded-[3px] text-[#66717c] hover:bg-white/[0.05] hover:text-white" aria-label="Pin Details"><Pin size={11} /></button>
      <button type="button" onPointerDown={(event) => { event.stopPropagation(); onClose() }} className="grid size-6 place-items-center rounded-[3px] text-[#66717c] hover:bg-white/[0.05] hover:text-white" aria-label={`Close ${selection.label} Details`}><X size={12} /></button>
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
    <section className="border-t border-[#26313b]" aria-label="Applied Effects">
      <header className="flex h-7 items-center gap-1.5 px-2">
        <Sparkles size={11} className="text-[#8dd9e2]" />
        <strong className="text-[12px] font-medium text-[#cbd4dc]">Effects</strong>
        <span className="font-mono text-[10px] text-[#66717c]">{effects.length}</span>
        <button type="button" onClick={onAddEffect} className="ml-auto grid size-6 place-items-center rounded-[3px] text-[#8dd9e2] hover:bg-[#67c7d6]/10 hover:text-white" aria-label="Add Effect" title="Add Effect"><Plus size={12} /></button>
      </header>
      {effects.length ? <div className="grid grid-cols-2 gap-1 px-1.5 pb-1.5">
        {effects.map((effect) => <button type="button" key={effect.id} className="flex min-w-0 items-center gap-1 rounded-[2px] border border-[#26313b] bg-white/[0.02] px-1.5 py-1 text-left hover:border-[#52606d]" aria-label={`Edit ${effect.name} Effect`}>
          <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium text-[#dce3ea]">{effect.name}</span><span className="block truncate font-mono text-[10px] text-[#66717c]">{effect.summary}</span></span>
          <ChevronRight size={11} className="shrink-0 text-[#59646f]" />
        </button>)}
      </div> : <p className="px-2 pb-2 text-[11px] text-[#66717c]">No Effects applied.</p>}
    </section>
    <div className="flex border-t border-[#26313b] p-1.5">
      <button type="button" className={`${control} flex-1 justify-between bg-white/[0.025]`}>Pattern instance <span className="font-mono text-[10px] text-[#67c7d6]">Used by 2</span></button>
    </div>
  </section>
}

function EffectPalettePrototype({ owner, applied, onApply, onClose }: { owner: Selection; applied: PrototypeAppliedEffect[]; onApply: (effect: PrototypeAppliedEffect) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState<PrototypeAppliedEffect['stage'] | 'All'>('All')
  const matches = effectCatalogue.filter((effect) => {
    const inStage = stage === 'All' || effect.stage === stage
    const search = query.trim().toLowerCase()
    return inStage && (!search || `${effect.name} ${effect.summary} ${effect.stage}`.toLowerCase().includes(search))
  })
  const stages: Array<PrototypeAppliedEffect['stage'] | 'All'> = ['All', 'Transform', 'Distort', 'Address', 'Color & output']

  return <section data-entity-detail role="dialog" aria-modal="false" aria-label="Add Effect" className="fixed left-1/2 top-[76px] z-[90] flex max-h-[min(510px,calc(100vh-92px))] w-[min(680px,calc(100vw-16px))] -translate-x-1/2 flex-col overflow-hidden rounded-[4px] border border-[#52606d] bg-[#0b1016]/[0.99] shadow-[0_24px_80px_rgba(0,0,0,0.78)] backdrop-blur">
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#26313b] px-3">
      <Sparkles size={15} className="text-[#8dd9e2]" />
      <div className="min-w-0"><strong className="block text-[14px] font-semibold text-[#f2f5f8]">Add Effect</strong><span className="block truncate text-[11px] text-[#66717c]">{owner.label} · choose an Effect, then edit it in Entity Details</span></div>
      <button type="button" onClick={onClose} className="ml-auto grid size-7 place-items-center rounded-[3px] text-[#66717c] hover:bg-white/[0.05] hover:text-white" aria-label="Close Effects catalogue"><X size={13} /></button>
    </header>
    <div className="flex shrink-0 items-center gap-2 border-b border-[#26313b] p-2.5">
      <label className="relative min-w-0 flex-1"><Search size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-[#66717c]" /><input autoFocus type="search" aria-label="Search Effects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Effects" className="h-8 w-full rounded-[3px] border border-[#34404b] bg-[#070a0d] pl-8 pr-2 text-[12px] text-[#dce3ea] outline-none focus:border-[#67c7d6]" /></label>
      <span className="font-mono text-[10px] text-[#66717c]">{applied.length} applied</span>
    </div>
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#26313b] px-2.5 py-2" aria-label="Effect stages">
      {stages.map((candidate) => <button type="button" key={candidate} onClick={() => setStage(candidate)} className={`h-7 shrink-0 rounded-[3px] px-2.5 text-[11px] ${stage === candidate ? 'bg-[#67c7d6]/15 text-[#bcecf1]' : 'text-[#7d8994] hover:bg-white/[0.04] hover:text-[#dce3ea]'}`}>{candidate}</button>)}
    </nav>
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-px overflow-auto bg-[#26313b] sm:grid-cols-2 lg:grid-cols-3">
      {matches.map((effect) => {
        const alreadyApplied = applied.some((candidate) => candidate.id === effect.id)
        return <button type="button" key={effect.id} disabled={alreadyApplied} onClick={() => onApply(effect)} className="flex h-16 min-w-0 items-center gap-2 bg-[#0e141b] px-3 text-left hover:bg-[#141d26] disabled:cursor-default disabled:opacity-40" aria-label={`${alreadyApplied ? 'Applied' : 'Add'} ${effect.name} Effect`}>
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#67c7d6]/20 bg-[#67c7d6]/[0.055] text-[#8dd9e2]"><Sparkles size={13} /></span>
          <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-[#e5ebf0]">{effect.name}</span><span className="block truncate text-[11px] text-[#77838e]">{effect.summary}</span><span className="block truncate font-mono text-[10px] text-[#58636d]">{effect.stage}{alreadyApplied ? ' · applied' : ''}</span></span>
        </button>
      })}
      {!matches.length && <p className="col-span-full p-8 text-center text-[12px] text-[#66717c]">No Effects match.</p>}
    </div>
    <footer className="flex h-10 shrink-0 items-center border-t border-[#26313b] px-3 text-[11px] text-[#66717c]">The Stage keeps previewing the selected clip. Applying an Effect returns focus to its summary card.</footer>
  </section>
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <label className="min-w-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[#73808b]"><span>{label}</span><input readOnly value={value} className="mt-0.5 h-7 w-full rounded-[2px] border border-[#26313b] bg-[#070a0d] px-1.5 font-mono text-[12px] normal-case tracking-normal text-[#dbe2e8] outline-none focus:border-[#67c7d6]" /></label>
}

function TransitionChooser({ onClose }: { onClose: () => void }) {
  return <section className="absolute left-1/2 top-[170px] z-[60] w-[310px] -translate-x-1/2 overflow-hidden rounded-[3px] border border-[#e4b85c]/45 bg-[#0c1117] shadow-[0_18px_55px_rgba(0,0,0,0.72)]">
    <header className="flex h-10 items-center gap-2 border-b border-[#26313b] px-3"><Zap size={14} className="text-[#e4b85c]" /><strong className="text-[14px] font-semibold">Edit Cut</strong><button type="button" onClick={onClose} className="ml-auto grid size-7 place-items-center rounded-[3px] text-[#66717c] hover:bg-white/[0.05] hover:text-white" aria-label="Close Transition chooser"><X size={13} /></button></header>
    <div className="grid grid-cols-3 gap-2 p-3">
      {['Crossfade', 'Wipe', 'Dissolve'].map((name) => <button type="button" key={name} className="h-16 rounded-[2px] bg-[#e4b85c]/[0.06] text-[12px] font-medium text-[#ffe5a3] ring-1 ring-[#e4b85c]/25 hover:bg-[#e4b85c]/15"><span className="mx-auto mb-2 block h-2.5 w-12 bg-[linear-gradient(90deg,#67c7d6,transparent,#e4b85c)]" />{name}</button>)}
    </div>
    <div className="flex items-end gap-2 border-t border-[#26313b] p-3"><DetailField label="Duration · max 0.40s" value="0.400 s" /><button type="button" className={`${control} mb-0 w-24 justify-center bg-[#e4b85c]/10 text-[#ffe5a3] ring-1 ring-[#e4b85c]/40`}>Apply</button></div>
    <button type="button" className="mx-3 mb-3 text-left text-[12px] text-[#e4b85c] hover:text-white">Need more room? Insert Time…</button>
  </section>
}

function LayoutInsertMenu({ position, onClose }: { position: number; onClose: () => void }) {
  return <section className="absolute right-3 top-[58px] z-[60] w-[340px] overflow-hidden rounded-[3px] border border-[#67c7d6]/40 bg-[#0c1117] shadow-[0_18px_55px_rgba(0,0,0,0.72)]">
    <header className="flex h-10 items-center gap-2 border-b border-[#26313b] px-3"><SplitSquareHorizontal size={14} className="text-[#67c7d6]" /><strong className="text-[14px] font-semibold">Insert Layout at {position.toFixed(2)}s</strong><button type="button" onClick={onClose} className="ml-auto grid size-7 place-items-center rounded-[3px] text-[#66717c] hover:bg-white/[0.05] hover:text-white" aria-label="Close Layout insertion"><X size={13} /></button></header>
    <div className="p-3">
      <div className="grid grid-cols-[1fr_92px] gap-3"><label className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#73808b]">Layout source<select className="mt-1 h-8 w-full rounded-[2px] border border-[#26313b] bg-[#070a0d] px-2 text-[12px] normal-case text-[#dbe2e8]"><option>Blank Layout</option><option>Use named Layout…</option><option>Copy previous Layout</option><option>Duplicate interval</option></select></label><DetailField label="Duration" value="8.000 s" /></div>
      <div className="mt-3 border-l-2 border-[#67c7d6]/45 bg-[#67c7d6]/[0.05] p-3 text-[12px] leading-5 text-[#8e9aa5]">Splits 2 Clips · shifts later content 8s · creates entry and return boundaries</div>
      <button type="button" className={`${control} mt-3 w-full justify-center bg-[#67c7d6]/[0.08] text-[#9adde4] ring-1 ring-[#67c7d6]/35`}>Insert Layout Interval</button>
    </div>
  </section>
}

function Stage({ layout, position, playing, className = '' }: { layout: PrototypeLayout; position: number; playing: boolean; className?: string }) {
  return <aside className={`flex min-h-0 flex-col bg-[#090d12] ${className}`}>
    <header className="flex h-10 shrink-0 items-center border-b border-[#26313b] px-3 text-[12px] font-medium text-[#98a3ad]">Stage <span className="ml-auto font-mono text-[10px] font-normal text-[#66717c]">{layout.name} · {position.toFixed(2)}s</span></header>
    <div className="relative m-3 min-h-0 flex-1 overflow-hidden rounded-[3px] bg-[radial-gradient(circle_at_50%_50%,#183d48_0,#171328_35%,#07090d_72%)] shadow-[inset_0_0_0_1px_#26313b]">
      <div className={`absolute inset-[12%] rounded-full border border-[#67c7d6]/40 bg-[conic-gradient(from_45deg,#67c7d600,#67c7d699,#a78bfa55,#e4b85c88,#67c7d600)] blur-[2px] ${playing ? 'animate-spin [animation-duration:9s]' : ''}`} />
      {layout.zones.length > 1 && <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${Math.min(2, layout.zones.length)},1fr)`, gridTemplateRows: `repeat(${Math.ceil(layout.zones.length / 2)},1fr)` }}>{layout.zones.map((zone) => <span key={zone.id} className="relative border border-dashed border-white/15"><i className="absolute left-2 top-2 rounded-[2px] bg-black/60 px-1.5 py-0.5 font-mono text-[10px] not-italic" style={{ color: zone.color }}>{zone.icon}</i></span>)}</div>}
    </div>
    <div className="flex h-11 shrink-0 items-center gap-1 border-t border-[#26313b] px-2"><button type="button" className={control}><Eye size={13} /> Zones</button><button type="button" className={control}><Focus size={13} /> Focus</button><span className="ml-auto font-mono text-[10px] text-emerald-400">Preview ready</span></div>
  </aside>
}

function PrototypeSwitcher({ fixture, variant, onChange }: { fixture: Fixture; variant: Variant; onChange: (patch: { fixture?: Fixture; variant?: Variant }) => void }) {
  return <div className="fixed bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-[4px] border border-[#52606d] bg-[#0b1117]/95 p-1 font-mono text-[10px] opacity-40 shadow-2xl shadow-black/80 backdrop-blur transition-opacity hover:opacity-100 focus-within:opacity-100">
    <span className="hidden px-1 uppercase tracking-[0.1em] text-zinc-700 min-[760px]:inline">Collapse preset</span>
    {(['expanded', 'working', 'collapsed'] as const).map((item) => <button type="button" key={item} onClick={() => onChange({ variant: item })} className={`h-6 rounded-[2px] px-2 ${variant === item ? 'bg-[#e4b85c]/10 text-[#ffe5a3] ring-1 ring-[#e4b85c]/50' : 'text-[#76818c] hover:bg-white/[0.05] hover:text-white'}`}>{item === 'expanded' ? 'All expanded' : item === 'working' ? 'Working set' : 'All collapsed'}</button>)}
    <span className="mx-1 h-4 w-px bg-[#28323c]" />
    <button type="button" onClick={() => onChange({ fixture: fixture === 'simple' ? 'topology' : 'simple' })} className="h-6 rounded-[2px] px-2 text-[#76818c] hover:bg-white/[0.05] hover:text-white">{fixture === 'simple' ? 'Show 4→1→3' : 'Show simple'}</button>
  </div>
}

function variantLabel(variant: Variant): string {
  if (variant === 'working') return 'Working collapse preset'
  if (variant === 'collapsed') return 'All Zones collapsed'
  return 'All Zones expanded'
}
