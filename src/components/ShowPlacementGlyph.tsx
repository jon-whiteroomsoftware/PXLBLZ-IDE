import { useId } from 'react'
import { recognizableRatio } from '@/engine/domainNumberPresentation'
import type { ShowClipTransform, ShowClipViewport } from '@/engine/personalContentRecords'
import { contentRectFromTransform, viewportRect } from '@/engine/showClipPlacementPad'

// A notional read of a Clip's placement, sized for a collapsed inspector row,
// so it must survive at ~32px and carries no colour of its own.
//
// Three things want reading: the Zone, the content, and the viewport. Drawn as
// three outlines they blur together, and worse, the Zone and a near-full
// viewport land on the same pixels. So each gets a different kind of mark: the
// Zone is a plate, the content a shape, the viewport a brightness boundary.

export type ShowPlacementGlyphView = 'combined' | 'placement' | 'aperture'

export interface ShowPlacementGlyphProps {
  transform: ShowClipTransform
  /** Omitted or disabled leaves the content undimmed. */
  viewport?: ShowClipViewport | null
  /**
   * `combined` carries all three marks. `placement` answers only "where is the
   * picture", `aperture` only "what survives" - a matched pair for when one box
   * cannot hold it.
   */
  view?: ShowPlacementGlyphView
  size?: number
  className?: string
}

const OVERSCAN = 0.16

export function ShowPlacementGlyph({
  transform,
  viewport = null,
  view = 'combined',
  size = 32,
  className,
}: ShowPlacementGlyphProps) {
  const clipId = useId()
  const span = 1 + OVERSCAN * 2
  const project = (unit: number) => (unit + OVERSCAN) / span * size
  const extent = (unit: number) => (unit / span) * size

  const box = contentRectFromTransform(transform)
  const left = project(box.left)
  const top = project(box.top)
  const width = extent(box.width)
  const height = extent(box.height)
  const rotation = `rotate(${transform.rotation * 360} ${left + width / 2} ${top + height / 2})`

  // `placement` deliberately ignores the viewport; `aperture` needs one, and
  // falls back to the whole Zone so the pair stays comparable.
  const active = viewport?.enabled ? viewportRect(viewport) : null
  const shown = view === 'placement' ? null : active ?? (view === 'aperture' ? { left: 0, top: 0, width: 1, height: 1 } : null)
  const summary = describeShowPlacement({ transform, viewport, view })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={summary}
    >
      <title>{summary}</title>
      <defs>
        <clipPath id={`${clipId}-frame`}>
          <rect x="0" y="0" width={size} height={size} />
        </clipPath>
        {shown && (
          <clipPath id={`${clipId}-window`}>
            <rect x={project(shown.left)} y={project(shown.top)} width={extent(shown.width)} height={extent(shown.height)} />
          </clipPath>
        )}
      </defs>

      <g clipPath={`url(#${clipId}-frame)`}>
        {/* The Zone as a plate, so it reads as ground rather than a third outline. */}
        <rect x={project(0)} y={project(0)} width={extent(1)} height={extent(1)} fill="currentColor" fillOpacity="0.12" />

        <g transform={rotation}>
          <rect x={left} y={top} width={width} height={height} fill="currentColor" fillOpacity={shown ? 0.1 : 0.72} />
        </g>

        {shown && (
          <>
            <g clipPath={`url(#${clipId}-window)`}>
              <g transform={rotation}>
                <rect x={left} y={top} width={width} height={height} fill="currentColor" fillOpacity="0.95" />
              </g>
            </g>
            <rect
              x={project(shown.left)}
              y={project(shown.top)}
              width={extent(shown.width)}
              height={extent(shown.height)}
              fill="none"
              stroke="currentColor"
              strokeDasharray="2 1.5"
            />
          </>
        )}

        {/* Drawn last so the Zone stays the frame of reference even when the
            content covers or overflows it. */}
        <rect
          x={project(0)}
          y={project(0)}
          width={extent(1)}
          height={extent(1)}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.5"
        />
      </g>
    </svg>
  )
}

/** The same read in words, for the summary row and the glyph's own label. */
export function describeShowPlacement({
  transform,
  viewport = null,
  view = 'combined',
}: Pick<ShowPlacementGlyphProps, 'transform' | 'viewport' | 'view'>): string {
  const size = transform.scaleX === transform.scaleY
    ? transform.scaleX === 1 ? 'Full Zone' : `${formatRatio(transform.scaleX)} size`
    : `${formatRatio(transform.scaleX)} by ${formatRatio(transform.scaleY)}`
  const where = transform.positionX === 0 && transform.positionY === 0
    ? 'centered'
    : `offset ${transform.positionX >= 0 ? 'right' : 'left'} ${Math.abs(transform.positionX).toFixed(2)}, ${transform.positionY >= 0 ? 'down' : 'up'} ${Math.abs(transform.positionY).toFixed(2)}`
  const turned = transform.rotation === 0 ? '' : `, turned ${Math.round(transform.rotation * 360)} degrees`
  const placement = `${size}, ${where}${turned}`
  if (view === 'placement') return placement
  if (!viewport?.enabled) return view === 'aperture' ? 'No aperture: the whole Zone is visible' : `${placement} · no aperture`
  const window = describeWindow(viewport)
  return view === 'aperture' ? window : `${placement} · ${window}`
}

/** Prefers a shape people would say out loud; exact values live in the fields. */
function describeWindow(viewport: ShowClipViewport): string {
  const wholeZone = viewport.x <= 0.001 && viewport.y <= 0.001
    && viewport.width >= 0.999 && viewport.height >= 0.999
  if (wholeZone) return 'aperture over the whole Zone'
  const covers = (value: number, extent: number, low: string, high: string) => {
    if (value <= 0.001 && extent >= 0.999) return null
    if (value <= 0.001) return `${low} ${formatRatio(extent)}`
    if (value + extent >= 0.999) return `${high} ${formatRatio(extent)}`
    return null
  }
  const horizontal = covers(viewport.x, viewport.width, 'left', 'right')
  const vertical = covers(viewport.y, viewport.height, 'top', 'bottom')
  if (horizontal && !vertical) return `${horizontal} visible`
  if (vertical && !horizontal) return `${vertical} visible`
  if (horizontal && vertical) return `${horizontal} by ${vertical} visible`
  return `aperture ${formatRatio(viewport.width)} by ${formatRatio(viewport.height)}`
}

function formatRatio(value: number): string {
  const ratio = recognizableRatio(value)
  if (!ratio) return `${value.toFixed(2)}x`
  const [numerator, denominator] = ratio.split(':').map(Number)
  if (denominator === 1) return numerator === 1 ? 'full' : `${numerator}x`
  if (numerator === 1 && denominator === 2) return 'half'
  if (numerator === 1 && denominator === 3) return 'a third'
  if (numerator === 2 && denominator === 3) return 'two-thirds'
  if (numerator === 1 && denominator === 4) return 'a quarter'
  if (numerator === 3 && denominator === 4) return 'three-quarters'
  return `${numerator}/${denominator}`
}
