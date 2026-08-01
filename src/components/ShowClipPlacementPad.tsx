import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { ShowClipTransform, ShowClipViewport } from '@/engine/personalContentRecords'
import {
  anchorContent,
  applyContentFit,
  contentRectFromTransform,
  enableViewportForContent,
  frameContent,
  moveContentCentre,
  moveViewportTo,
  nudgeContent,
  nudgeViewport,
  placementCornerAnchor,
  placementPadView,
  PLACEMENT_GRID_DIVISORS,
  resizeContentToAnchor,
  resizeViewportToAnchor,
  rotateContent,
  setViewportRect,
  sweepViewport,
  viewportRect,
  zoomContent,
  type PlacementCorner,
  type PlacementFocus,
  type PlacementPadContext,
  type PlacementPadResult,
} from '@/engine/showClipPlacementPad'

// The Clip placement pad (#617). Content and the viewport overlap constantly,
// and exactly once their edges match, so an editing focus decides which one
// gestures act on. The unfocused rectangle dims and goes inert but keeps
// acting as a magnet, which is what makes an exact match reachable by hand.

// The viewBox stays stable so gesture math is independent of rendered size.
// CSS owns the physical size: the inline surface fills its responsive column.
const PAD = 384
const CONTENT = '#a78bfa'
const APERTURE = '#e6b85c'
const CORNERS: readonly PlacementCorner[] = ['nw', 'ne', 'sw', 'se']

type DragKind =
  | { kind: 'content-move'; grabX: number; grabY: number }
  | { kind: 'content-corner'; anchor: { x: number; y: number } }
  | { kind: 'content-rotate' }
  | { kind: 'viewport-move'; grabX: number; grabY: number; carry: boolean }
  | { kind: 'viewport-corner'; anchor: { x: number; y: number } }
  | { kind: 'viewport-sweep'; originX: number; originY: number }

export interface ShowClipPlacementPadProps {
  transform: ShowClipTransform
  viewport: ShowClipViewport
  readOnly?: boolean
  focus?: PlacementFocus
  onFocusChange?: (focus: PlacementFocus) => void
  /** Controlled grid divisor; the owner can share it with the X/Y fields (#633). */
  grid?: number
  onGridChange?: (grid: number) => void
  /** Commits a value. Called once per gesture, not once per pointer move. */
  onChange: (patch: { transform?: ShowClipTransform; viewport?: ShowClipViewport }) => void
  /** Continuous feedback during a gesture. Falls back to onChange when absent. */
  onPreview?: (patch: { transform?: ShowClipTransform; viewport?: ShowClipViewport }) => void
  onPreviewEnd?: () => void
}

export function ShowClipPlacementPad({
  transform: committedTransform,
  viewport: committedViewport,
  readOnly = false,
  focus: controlledFocus,
  onFocusChange,
  grid: controlledGrid,
  onGridChange,
  onChange,
  onPreview,
  onPreviewEnd,
}: ShowClipPlacementPadProps) {
  const [uncontrolledGrid, setUncontrolledGrid] = useState(3)
  const grid = controlledGrid ?? uncontrolledGrid
  const setGrid = (next: number) => {
    setUncontrolledGrid(next)
    onGridChange?.(next)
  }
  const [uncontrolledFocus, setUncontrolledFocus] = useState<PlacementFocus>('content')
  // The pad is controlled, and preview does not flow back through props, so a
  // gesture would show nothing until release without holding its own value.
  const [live, setLive] = useState<PlacementPadResult | null>(null)
  const surface = useRef<SVGSVGElement>(null)
  const drag = useRef<DragKind | null>(null)
  const pending = useRef<PlacementPadResult | null>(null)

  const transform = live?.transform ?? committedTransform
  const viewport = live?.viewport ?? committedViewport
  const context: PlacementPadContext = { transform, viewport, grid }
  const apertureOn = viewport.enabled
  const focus = controlledFocus ?? uncontrolledFocus
  const active = focus
  const contentFocused = active === 'content'
  const apertureFocused = active === 'aperture'
  const apertureVisible = apertureOn || apertureFocused
  const contentActive = contentFocused && !readOnly
  const apertureActive = apertureFocused && !readOnly

  const box = contentRectFromTransform(transform)
  const window = viewportRect(viewport)
  const view = placementPadView(apertureVisible && !apertureOn
    ? { ...context, viewport: { ...viewport, enabled: true } }
    : context)
  const extent = view.max - view.min
  const toPad = (unit: number) => (unit - view.min) / extent * PAD
  const toUnit = (pad: number) => pad / PAD * extent + view.min
  const span = (unit: number) => unit / extent * PAD
  const chooseFocus = (next: PlacementFocus) => {
    setUncontrolledFocus(next)
    onFocusChange?.(next)
  }

  const apply = (result: PlacementPadResult) => {
    if (result.transform || result.viewport) onChange(result)
  }

  /**
   * Pointer gestures fire continuously, so they preview and commit once on
   * release. Committing every move would flood undo history and the autosave.
   */
  const previewResult = (result: PlacementPadResult) => {
    if (!result.transform && !result.viewport) return
    pending.current = result
    setLive((current) => ({ ...current, ...result }))
    onPreview?.(result)
  }

  const commitPending = () => {
    const result = pending.current
    pending.current = null
    setLive(null)
    if (!result) return
    onChange(result)
    onPreviewEnd?.()
  }

  const pointerUnit = (event: { clientX: number; clientY: number }) => {
    const rect = surface.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: toUnit((event.clientX - rect.left) / rect.width * PAD),
      y: toUnit((event.clientY - rect.top) / rect.height * PAD),
    }
  }

  const beginDrag = (event: ReactPointerEvent, next: DragKind) => {
    if (readOnly) return
    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
    drag.current = next
  }

  // Reaching the surface means the pointer went down on bare pad, which is the
  // only place a fresh cell sweep can start.
  const onSurfaceDown = (event: ReactPointerEvent) => {
    if (drag.current || !apertureActive) return
    const point = pointerUnit(event)
    beginDrag(event, { kind: 'viewport-sweep', originX: point.x, originY: point.y })
    previewResult(sweepViewport(context, point.x, point.y, point.x, point.y))
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const gesture = drag.current
    if (!gesture) return
    const point = pointerUnit(event)
    if (gesture.kind === 'content-move') {
      previewResult(moveContentCentre(context, point.x - gesture.grabX, point.y - gesture.grabY))
    } else if (gesture.kind === 'content-corner') {
      previewResult(resizeContentToAnchor(context, gesture.anchor, point.x, point.y, { uniform: apertureOn || event.shiftKey }))
    } else if (gesture.kind === 'content-rotate') {
      const angle = Math.atan2(point.y - (box.top + box.height / 2), point.x - (box.left + box.width / 2))
      const turns = (angle / (Math.PI * 2) + 0.25) % 1
      previewResult(rotateContent(context, event.shiftKey ? Math.round(turns * 24) / 24 : turns))
    } else if (gesture.kind === 'viewport-sweep') {
      previewResult(sweepViewport(context, gesture.originX, gesture.originY, point.x, point.y))
    } else if (gesture.kind === 'viewport-corner') {
      previewResult(resizeViewportToAnchor(context, gesture.anchor, point.x, point.y))
    } else {
      previewResult(moveViewportTo(context, point.x - gesture.grabX, point.y - gesture.grabY, { carryContent: gesture.carry }))
    }
  }

  const endDrag = () => {
    drag.current = null
    commitPending()
  }

  const onKeyDown = (event: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
    if (readOnly) return
    const step = event.shiftKey ? 0.1 : 0.01
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    apply(active === 'content'
      ? nudgeContent(context, move[0], move[1])
      : nudgeViewport(context, move[0], move[1]))
  }

  const rotation = `rotate(${transform.rotation * 360} ${toPad(box.left + box.width / 2)} ${toPad(box.top + box.height / 2)})`

  return (
    <div className="grid min-w-0 gap-1">
      <div data-testid="placement-pad-toolbar" className="flex h-5 min-w-0 flex-nowrap items-center gap-0.5">
        <span className="flex h-5 min-w-0 overflow-hidden rounded border border-zinc-700">
          <FocusSegment
            ariaLabel="Content"
            active={active === 'content'}
            colour={CONTENT}
            shortLabel="Ct"
            onClick={() => chooseFocus('content')}
          >
            Content
          </FocusSegment>
          <FocusSegment
            ariaLabel="Aperture"
            active={active === 'aperture'}
            colour={APERTURE}
            shortLabel="Ap"
            onClick={() => {
              if (!apertureOn) {
                if (readOnly) return
                chooseFocus('aperture')
                onChange({ viewport: enableViewportForContent(context) })
              } else if (active === 'aperture') {
                if (readOnly) return
                chooseFocus('content')
                onChange({ viewport: { ...viewport, enabled: false } })
              } else {
                chooseFocus('aperture')
              }
            }}
          >
            Aperture
          </FocusSegment>
        </span>
        <label className="flex items-center gap-1 text-[10px] text-zinc-500">
          <span className="sr-only">Grid</span>
          <select
            aria-label="Grid"
            value={grid}
            disabled={readOnly}
            onChange={(event) => setGrid(Number(event.target.value))}
            className="h-5 w-9 rounded border border-zinc-700 bg-zinc-950 px-0.5 text-[8px] text-zinc-200 outline-none focus:border-cyan-400/60"
          >
            {PLACEMENT_GRID_DIVISORS.map((divisor) => (
              <option key={divisor} value={divisor}>{divisor === 0 ? 'Free' : `${divisor}×`}</option>
            ))}
          </select>
        </label>

        <span className="ml-auto flex min-w-0 gap-0.5">
          {apertureFocused
            ? <>
                <PadAction disabled={readOnly} onClick={() => apply(frameContent(context))}>Frame</PadAction>
                <PadAction disabled={readOnly} title="Full Zone" onClick={() => apply(setViewportRect(context, { left: 0, top: 0, width: 1, height: 1 }))}>Full</PadAction>
              </>
            : <>
                <PadAction disabled={readOnly} onClick={() => apply(applyContentFit(context, 'fit'))}>Fit</PadAction>
                <PadAction disabled={readOnly} onClick={() => apply(applyContentFit(context, 'fill'))}>Fill</PadAction>
                <PadAction ariaLabel="Reset content" title="Reset content" disabled={readOnly} onClick={() => apply(applyContentFit(context, 'reset'))}>↺</PadAction>
              </>}
        </span>
        <button
          type="button"
          aria-label="Placement help"
          data-placement-help
          title={!apertureVisible
            ? 'Drag the content or its corners. Grid lines magnetize edges; Shift keeps corner resizing square.'
            : apertureFocused
              ? apertureOn
                ? 'Drag the Aperture or its corners; drag bare pad to sweep cells. Alt-drag carries Content.'
                : 'This retained Aperture is off. Editing it on the pad enables it.'
              : 'Drag Content or its corners. Its edges magnetize to the Aperture and Zone; only Content rotates.'}
          className="grid size-5 shrink-0 place-items-center rounded text-[9px] text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300"
        >
          ?
        </button>
      </div>

      <div className="grid min-w-[156px] gap-1">
        <svg
          ref={surface}
          viewBox={`0 0 ${PAD} ${PAD}`}
          tabIndex={readOnly ? -1 : 0}
          role="application"
          aria-label={`Placement pad. Arrow keys nudge the ${active === 'content' ? 'content' : 'aperture'} rectangle.`}
          className="aspect-square w-full touch-none rounded border border-zinc-800 bg-zinc-950 outline-none focus-visible:border-cyan-400/60"
          onPointerDown={onSurfaceDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        >
        <rect x={toPad(0)} y={toPad(0)} width={span(1)} height={span(1)} fill="#18181b" stroke="#3f3f46" />
        <text x={toPad(0)} y={toPad(0) - 5} fill="#71717a" fontSize="10" fontFamily="ui-monospace, monospace">0, 0</text>
        <text x={toPad(1)} y={toPad(1) + 13} textAnchor="end" fill="#71717a" fontSize="10" fontFamily="ui-monospace, monospace">1, 1</text>

        {grid > 0 && Array.from({ length: grid - 1 }, (_, index) => {
          const at = toPad((index + 1) / grid)
          const magnet = !apertureVisible
          return (
            <g key={index} stroke={magnet ? '#52525b' : '#3f3f46'} strokeDasharray={magnet ? undefined : '2 4'}>
              <line x1={at} y1={toPad(0)} x2={at} y2={toPad(1)} />
              <line x1={toPad(0)} y1={at} x2={toPad(1)} y2={at} />
            </g>
          )
        })}

        <g transform={rotation}>
          <rect
            x={toPad(box.left)}
            y={toPad(box.top)}
            width={span(box.width)}
            height={span(box.height)}
            fill={CONTENT}
            fillOpacity="0.16"
            stroke={CONTENT}
            strokeWidth="1.5"
            strokeOpacity={contentActive ? 1 : 0.4}
            className={contentActive ? 'cursor-move' : undefined}
            pointerEvents={contentActive ? undefined : 'none'}
            aria-label="Move content"
            onPointerDown={(event) => {
              const point = pointerUnit(event)
              beginDrag(event, { kind: 'content-move', grabX: point.x - (box.left + box.width / 2), grabY: point.y - (box.top + box.height / 2) })
            }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          />
          {/* Stands in for the picture. Asymmetric top to bottom, so it reads
              orientation under rotation and shows how much is cropped away. */}
          <g
            transform={`translate(${toPad(box.left)} ${toPad(box.top)}) scale(${span(box.width)} ${span(box.height)})`}
            fill={CONTENT}
            fillOpacity="0.3"
            pointerEvents="none"
          >
            <circle cx="0.5" cy="0.295" r="0.19" />
            <path d="M0.13,1 C0.13,0.64 0.29,0.47 0.5,0.47 C0.71,0.47 0.87,0.64 0.87,1 Z" />
          </g>
        </g>

        {/* The scrim sits above the content so masked content reads as masked.
            Handles are re-raised above it so they stay grabbable. */}
        {apertureVisible && <>
          {apertureOn && <path
              d={`M0,0H${PAD}V${PAD}H0Z M${toPad(window.left)},${toPad(window.top)}V${toPad(window.top + window.height)}H${toPad(window.left + window.width)}V${toPad(window.top)}Z`}
              fill="#09090b"
              fillOpacity="0.72"
              fillRule="evenodd"
              pointerEvents="none"
            />}
          <rect x={toPad(0)} y={toPad(0)} width={span(1)} height={span(1)} fill="none" stroke="#52525b" pointerEvents="none" />
          <rect
            x={toPad(window.left)}
            y={toPad(window.top)}
            width={span(window.width)}
            height={span(window.height)}
            fill="none"
            stroke={APERTURE}
            strokeWidth="1.5"
            strokeOpacity={apertureActive ? 1 : 0.4}
            strokeDasharray="6 3"
            pointerEvents="none"
          />
          <rect
            x={toPad(window.left)}
            y={toPad(window.top)}
            width={span(window.width)}
            height={span(window.height)}
            fill="transparent"
            stroke="transparent"
            strokeWidth="14"
            className={apertureActive ? 'cursor-move' : undefined}
            pointerEvents={apertureActive ? undefined : 'none'}
            aria-label="Move aperture"
            onPointerDown={(event) => {
              const point = pointerUnit(event)
              beginDrag(event, { kind: 'viewport-move', grabX: point.x - window.left, grabY: point.y - window.top, carry: event.altKey })
            }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          />
          <text x={toPad(window.left) + 5} y={toPad(window.top + window.height) - 5} fill={APERTURE} fontSize="10" pointerEvents="none">
            {apertureOn ? 'Aperture' : 'Aperture (off)'}
          </text>
          {apertureActive && <g>{CORNERS.map((corner) => (
            <rect
              key={corner}
              x={toPad(corner === 'nw' || corner === 'sw' ? window.left : window.left + window.width) - 4}
              y={toPad(corner === 'nw' || corner === 'ne' ? window.top : window.top + window.height) - 4}
              width="8"
              height="8"
              fill="#09090b"
              stroke={APERTURE}
              strokeWidth="1.5"
              className={corner === 'nw' || corner === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}
              aria-label={`Resize aperture ${corner}`}
              onPointerDown={(event) => beginDrag(event, { kind: 'viewport-corner', anchor: placementCornerAnchor(window, corner) })}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
            />
          ))}</g>}
        </>}

        {contentActive && <g transform={rotation}>
          <circle
            cx={toPad(box.left + box.width / 2)}
            cy={toPad(box.top) - 16}
            r="5"
            fill="#09090b"
            stroke={CONTENT}
            strokeWidth="1.5"
            className="cursor-grab"
            aria-label="Rotate content"
            onPointerDown={(event) => beginDrag(event, { kind: 'content-rotate' })}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
          />
          {CORNERS.map((corner) => (
            <rect
              key={corner}
              x={toPad(corner === 'nw' || corner === 'sw' ? box.left : box.left + box.width) - 4}
              y={toPad(corner === 'nw' || corner === 'ne' ? box.top : box.top + box.height) - 4}
              width="8"
              height="8"
              fill="#09090b"
              stroke={CONTENT}
              strokeWidth="1.5"
              className={corner === 'nw' || corner === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}
              aria-label={`Resize content ${corner}`}
              onPointerDown={(event) => beginDrag(event, { kind: 'content-corner', anchor: placementCornerAnchor(box, corner) })}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
            />
          ))}
        </g>}
        </svg>
        {contentActive && !readOnly && (
          <div data-testid="placement-pad-footer" className="flex items-start justify-between gap-1">
            <div className="rounded bg-zinc-950 p-0.5">
              <AnchorPad disabled={readOnly} onAnchor={(column, row) => apply(anchorContent(context, column, row))} />
            </div>
            <div className="flex h-5 items-center overflow-hidden rounded border border-zinc-700 bg-zinc-950">
              <button type="button" aria-label="Zoom out" onClick={() => apply(zoomContent(context, transform.scaleX - 0.1))} className="size-5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">−</button>
              <output aria-label="Zoom level" className="w-8 border-x border-zinc-800 text-center font-mono text-[8px] text-zinc-300">{transform.scaleX.toFixed(1)}×</output>
              <button type="button" aria-label="Zoom in" onClick={() => apply(zoomContent(context, transform.scaleX + 0.1))} className="size-5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">+</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FocusSegment({
  ariaLabel,
  active,
  colour,
  shortLabel,
  onClick,
  children,
}: {
  ariaLabel: string
  active: boolean
  colour: string
  shortLabel: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      aria-pressed={active}
      style={active ? { borderColor: colour, color: colour } : undefined}
      className={`h-[18px] min-w-0 border-r border-zinc-700 px-1 text-[8px] last:border-r-0 ${active ? 'bg-white/5' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
    >
      <span className="hidden min-[480px]:inline">{children}</span>
      <span aria-hidden className="min-[480px]:hidden">{shortLabel}</span>
    </button>
  )
}

function PadAction({ onClick, disabled = false, ariaLabel, title, children }: { onClick: () => void; disabled?: boolean; ariaLabel?: string; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-5 rounded border border-zinc-700 bg-zinc-900 px-1 text-[8px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function AnchorPad({ disabled, onAnchor }: { disabled: boolean; onAnchor: (column: 0 | 1 | 2, row: 0 | 1 | 2) => void }) {
  return (
    <div className="grid shrink-0 grid-cols-3 gap-0.5" role="group" aria-label="Anchor">
      {([0, 1, 2] as const).map((row) => ([0, 1, 2] as const).map((column) => (
        <button
          key={`${column}-${row}`}
          type="button"
          disabled={disabled}
          aria-label={`Anchor column ${column + 1} row ${row + 1}`}
          onClick={() => onAnchor(column, row)}
          className="size-3 border border-zinc-700 bg-zinc-900 hover:border-cyan-400/60 disabled:opacity-50"
        />
      )))}
    </div>
  )
}
