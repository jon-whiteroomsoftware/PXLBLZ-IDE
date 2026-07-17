import type { ReactNode } from 'react'
import { applyShowEasing, normalizeShowEasing } from '@/engine/showEasing'
import { normalizeShowMotionTransition } from '@/engine/showMotionTransition'
import type { ShowBoundaryTransition, ShowSpatialShape } from '@/engine/personalContentRecords'
import { normalizeShowWipeSettings } from '@/engine/showWipe'

const OUTGOING = 'rgba(212,212,216,.56)'
const INCOMING = 'rgba(196,181,253,.66)'
const BRIGHT = 'rgba(244,244,245,.88)'
const DARK = '#080a0c'

export function ShowTransitionXrayPictogram({ transition }: { transition: ShowBoundaryTransition }) {
  const easing = normalizeShowEasing(transition.easing)
  const wipe = transition.kind === 'wipe' ? normalizeShowWipeSettings(transition) : null
  const motion = transition.kind === 'motion' ? normalizeShowMotionTransition(transition) : null
  const shape = transition.shape ?? 'circle'
  const revealMode = transition.revealMode ?? (transition.invert ? 'shrink-outgoing' : 'grow-incoming')
  return (
    <svg
      aria-hidden
      data-testid="transition-xray-pictogram"
      data-xray-transition-icon={transition.kind}
      data-transition-kind={transition.kind}
      data-easing={easing.curve}
      data-wipe-variant={wipe?.wipeVariant}
      data-direction={wipe?.direction ?? motion?.direction}
      data-dissolve-variant={transition.kind === 'dither' ? transition.dissolveVariant ?? 'pixel' : undefined}
      data-seed={transition.kind === 'dither' ? transition.seed ?? 0 : undefined}
      data-portal-shape={transition.kind === 'portal' ? shape : undefined}
      data-reveal-mode={transition.kind === 'portal' ? revealMode : undefined}
      data-center={transition.kind === 'portal' ? `${transition.centerX ?? 0.5},${transition.centerY ?? 0.5}` : undefined}
      data-rotation={transition.kind === 'portal' ? transition.rotation ?? 0 : undefined}
      data-motion-variant={motion?.motionVariant}
      data-anchor={motion ? `${motion.anchorX},${motion.anchorY}` : undefined}
      data-address-policy={motion?.addressPolicy}
      className="absolute inset-0 size-full"
      viewBox="0 0 100 36"
      preserveAspectRatio="none"
    >
      {transition.kind === 'wipe' && wipe ? <WipeGlyph settings={wipe} />
        : transition.kind === 'dither' ? <DissolveGlyph transition={transition} />
          : transition.kind === 'portal' ? <PortalGlyph transition={transition} shape={shape} revealMode={revealMode} />
            : transition.kind === 'motion' && motion ? <MotionGlyph settings={motion} />
              : transition.kind === 'fade-color' ? <FadeColorGlyph color={transition.color ?? '#000000'} />
                : <CrossfadeGlyph transition={transition} />}
    </svg>
  )
}

function CrossfadeGlyph({ transition }: { transition: ShowBoundaryTransition }) {
  return (
    <g style={{ mixBlendMode: 'screen' }}>
      <path data-crossfade-ramp="outgoing" d={crossfadeRampPath(transition, false)} fill={OUTGOING} />
      <path data-crossfade-ramp="incoming" d={crossfadeRampPath(transition, true)} fill={INCOMING} />
    </g>
  )
}

function crossfadeRampPath(transition: ShowBoundaryTransition, incoming: boolean): string {
  const samples = Array.from({ length: 17 }, (_, index) => {
    const progress = index / 16
    const eased = applyShowEasing(transition.easing, progress)
    const strength = incoming ? eased : 1 - eased
    return { x: progress * 100, halfHeight: Math.max(0.4, strength * 15) }
  })
  const top = samples.map(({ x, halfHeight }) => `${round(x)},${round(18 - halfHeight)}`)
  const bottom = [...samples].reverse().map(({ x, halfHeight }) => `${round(x)},${round(18 + halfHeight)}`)
  return `M ${top.join(' L ')} L ${bottom.join(' L ')} Z`
}

type WipeSettings = ReturnType<typeof normalizeShowWipeSettings>

function WipeGlyph({ settings }: { settings: WipeSettings }) {
  if (settings.wipeVariant === 'linear') {
    return (
      <g transform={`rotate(${round(settings.direction * 360)} 50 18)`}>
        <rect x="-22" y="4" width="25" height="28" fill="rgba(212,212,216,.05)" />
        <rect x="3" y="4" width="23" height="28" fill="rgba(212,212,216,.12)" />
        <rect x="26" y="4" width="24" height="28" fill="rgba(212,212,216,.25)" />
        <line x1="50" y1="1" x2="50" y2="35" stroke={BRIGHT} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <rect x="51" y="4" width="72" height="28" fill="rgba(196,181,253,.42)" />
      </g>
    )
  }
  if (settings.wipeVariant === 'split') {
    const horizontal = settings.orientation === 'horizontal'
    const center = settings.wipeMode === 'center-out'
    return horizontal ? (
      <>
        <rect x="5" y={center ? 11 : 4} width="90" height={center ? 14 : 28} fill={INCOMING} fillOpacity=".58" />
        {!center && <rect x="5" y="11" width="90" height="14" fill={DARK} />}
        <line x1="5" y1="11" x2="95" y2="11" stroke={BRIGHT} vectorEffect="non-scaling-stroke" />
        <line x1="5" y1="25" x2="95" y2="25" stroke={BRIGHT} vectorEffect="non-scaling-stroke" />
      </>
    ) : (
      <>
        <rect x={center ? 32 : 5} y="4" width={center ? 36 : 90} height="28" fill={INCOMING} fillOpacity=".58" />
        {!center && <rect x="32" y="4" width="36" height="28" fill={DARK} />}
        <line x1="32" y1="4" x2="32" y2="32" stroke={BRIGHT} vectorEffect="non-scaling-stroke" />
        <line x1="68" y1="4" x2="68" y2="32" stroke={BRIGHT} vectorEffect="non-scaling-stroke" />
      </>
    )
  }
  if (settings.wipeVariant === 'barn-doors') {
    const center = settings.wipeMode === 'center-out'
    return (
      <>
        <rect x="5" y="3" width="90" height="30" fill={center ? 'rgba(212,212,216,.08)' : INCOMING} fillOpacity=".55" />
        <rect x="29" y="8" width="42" height="20" rx="1" fill={center ? INCOMING : DARK} fillOpacity=".62" stroke={BRIGHT} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </>
    )
  }
  if (settings.wipeVariant === 'blinds') {
    const count = Math.min(8, Math.max(2, settings.count))
    const horizontal = settings.orientation === 'horizontal'
    return (
      <>
        {Array.from({ length: count }, (_, index) => {
          const span = (horizontal ? 30 : 90) / count
          return (
            <rect
              key={index}
              data-testid="wipe-blind"
              x={horizontal ? 5 : 5 + index * span}
              y={horizontal ? 3 + index * span : 3}
              width={horizontal ? 90 : Math.max(1, span * 0.58)}
              height={horizontal ? Math.max(1, span * 0.58) : 30}
              fill={index % 2 === 0 ? INCOMING : OUTGOING}
            />
          )
        })}
      </>
    )
  }
  if (settings.wipeVariant === 'clock') {
    const cx = 10 + settings.centerX * 80
    const cy = 4 + settings.centerY * 28
    const angle = (settings.clockwise ? 1 : -1) * settings.phase * 360 - 90
    return (
      <g transform={`rotate(${round(angle)} ${round(cx)} ${round(cy)})`}>
        <circle cx={cx} cy={cy} r="13" fill="rgba(196,181,253,.14)" stroke="rgba(196,181,253,.72)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={`M ${round(cx)} ${round(cy)} L ${round(cx)} ${round(cy - 13)} A 13 13 0 0 1 ${round(cx + 13)} ${round(cy)} Z`} fill="rgba(196,181,253,.58)" />
        <circle cx={cx} cy={cy} r="1.3" fill={BRIGHT} />
      </g>
    )
  }
  const count = Math.min(7, Math.max(3, settings.count))
  const cellWidth = 90 / count
  const cellHeight = 30 / count
  return (
    <>
      {Array.from({ length: count * count }, (_, index) => {
        const x = index % count
        const y = Math.floor(index / count)
        const checkerOn = (x + y) % 2 === 0
        return (
          <rect
            key={index}
            x={5 + x * cellWidth}
            y={3 + y * cellHeight}
            width={cellWidth}
            height={cellHeight}
            fill={settings.wipeVariant === 'checker' && checkerOn ? INCOMING : 'rgba(196,181,253,.12)'}
            stroke={settings.wipeVariant === 'grid' ? 'rgba(196,181,253,.48)' : 'none'}
            strokeWidth=".5"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </>
  )
}

function DissolveGlyph({ transition }: { transition: ShowBoundaryTransition }) {
  const variant = transition.dissolveVariant ?? 'pixel'
  const seed = transition.seed ?? 0
  if (variant === 'coherent-noise' || variant === 'soft-threshold') {
    const scale = Math.max(1, Math.min(32, transition.scale ?? 6))
    const count = Math.min(8, Math.max(3, Math.round(scale / 4) + 2))
    const softness = variant === 'soft-threshold' ? Math.max(0, Math.min(1, transition.softness ?? 0.15)) : 0
    return (
      <g data-dissolve-grain={variant}>
        {Array.from({ length: count }, (_, index) => (
          <ellipse
            key={index}
            cx={8 + seeded(seed, index, 1) * 84}
            cy={4 + seeded(seed, index, 2) * 28}
            rx={8 + seeded(seed, index, 3) * 18}
            ry={4 + seeded(seed, index, 4) * 9}
            fill={index % 2 === 0 ? INCOMING : OUTGOING}
            fillOpacity={variant === 'soft-threshold' ? 0.22 + softness * 0.28 : 0.35}
            stroke={variant === 'soft-threshold' ? 'rgba(196,181,253,.38)' : 'none'}
            strokeWidth={0.5 + softness * 1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    )
  }
  const blockSize = Math.max(1, Math.min(1024, Math.round(transition.blockSize ?? 8)))
  const size = variant === 'block' ? Math.min(8, 3 + Math.log2(blockSize) * 0.75) : 2.4
  const count = variant === 'block' ? 16 : 30
  return (
    <g data-dissolve-grain={variant}>
      {Array.from({ length: count }, (_, index) => (
        <rect
          key={index}
          x={3 + seeded(seed, index, 1) * (94 - size)}
          y={2 + seeded(seed, index, 2) * (32 - size)}
          width={size}
          height={Math.min(9, size * 1.35)}
          fill={seeded(seed, index, 3) > 0.48 ? INCOMING : OUTGOING}
          fillOpacity=".72"
        />
      ))}
    </g>
  )
}

function PortalGlyph({
  transition,
  shape,
  revealMode,
}: {
  transition: ShowBoundaryTransition
  shape: ShowSpatialShape
  revealMode: 'grow-incoming' | 'shrink-outgoing'
}) {
  const cx = 10 + clamp01(transition.centerX ?? 0.5) * 80
  const cy = 5 + clamp01(transition.centerY ?? 0.5) * 26
  const scale = Math.max(0.2, Math.min(1, transition.scale ?? 1))
  const aspect = Math.max(0.25, Math.min(4, transition.aspect ?? 1))
  const rotation = (transition.rotation ?? 0) * 360
  const radius = 12 * scale
  const fill = revealMode === 'grow-incoming' ? INCOMING : 'rgba(9,11,14,.88)'
  const stroke = revealMode === 'grow-incoming' ? BRIGHT : OUTGOING
  return (
    <>
      <rect x="2" y="2" width="96" height="32" fill={revealMode === 'shrink-outgoing' ? 'rgba(196,181,253,.22)' : 'rgba(212,212,216,.05)'} />
      <g transform={`translate(${round(cx)} ${round(cy)}) rotate(${round(rotation)}) scale(${round(radius * aspect)} ${round(radius)})`}>
        <PortalGeometry transition={transition} shape={shape} fill={fill} stroke={stroke} />
      </g>
    </>
  )
}

function PortalGeometry({
  transition,
  shape,
  fill,
  stroke,
}: {
  transition: ShowBoundaryTransition
  shape: ShowSpatialShape
  fill: string
  stroke: string
}): ReactNode {
  const shared = { fill, stroke, strokeWidth: 0.09, vectorEffect: 'non-scaling-stroke' as const, 'data-portal-geometry': shape }
  if (shape === 'circle' || shape === 'ellipse') return <ellipse {...shared} cx="0" cy="0" rx="1" ry="1" />
  if (shape === 'box') return <rect {...shared} x="-1" y="-1" width="2" height="2" />
  if (shape === 'rounded-box') return <rect {...shared} x="-1" y="-1" width="2" height="2" rx={Math.max(0.08, Math.min(0.8, transition.cornerRadius ?? 0.28))} />
  if (shape === 'diamond') return <polygon {...shared} points="0,-1 1,0 0,1 -1,0" />
  if (shape === 'cross') {
    const width = Math.max(0.1, Math.min(0.8, transition.crossWidth ?? 0.34))
    return <path {...shared} d={`M ${-width} -1 H ${width} V ${-width} H 1 V ${width} H ${width} V 1 H ${-width} V ${width} H -1 V ${-width} H ${-width} Z`} />
  }
  if (shape === 'ring') return <><ellipse {...shared} cx="0" cy="0" rx="1" ry="1" /><ellipse cx="0" cy="0" rx={Math.max(0.2, 1 - (transition.ringWidth ?? 0.28))} ry={Math.max(0.2, 1 - (transition.ringWidth ?? 0.28))} fill={DARK} /></>
  if (shape === 'heart') return <path {...shared} d="M 0 .9 C -.2 .55 -1 .18 -1 -.38 C -1 -.9 -.35 -1.05 0 -.52 C .35 -1.05 1 -.9 1 -.38 C 1 .18 .2 .55 0 .9 Z" />
  if (shape === 'crescent') return <><ellipse {...shared} cx="0" cy="0" rx="1" ry="1" /><ellipse cx={Math.max(0.15, Math.min(0.8, transition.crescentOffset ?? 0.45))} cy="-.1" rx=".78" ry=".9" fill={DARK} /></>
  if (shape === 'star') return <polygon {...shared} points={radialPoints(Math.max(3, Math.min(12, Math.round(transition.starPoints ?? 5))), Math.max(0.2, Math.min(0.8, transition.starInner ?? 0.45)))} />
  if (shape === 'polygon') return <polygon {...shared} points={radialPoints(Math.max(3, Math.min(8, Math.round(transition.polygonSides ?? 6))), 1)} />
  if (shape === 'cat-head') return <path {...shared} d="M -1 .65 L -.86 -.55 L -.43 -.25 Q 0 -.48 .43 -.25 L .86 -.55 L 1 .65 Q .5 1 0 .94 Q -.5 1 -1 .65 Z" />
  if (shape === 'cat-side-profile') return <path {...shared} d="M -.95 .65 L -.72 -.62 L -.3 -.25 Q .2 -.55 .65 -.12 L 1 .02 L .62 .27 Q .55 .86 -.05 .95 Q -.62 1 -.95 .65 Z" />
  return <path {...shared} d="M -1 .92 L -.76 -.82 L -.34 -.3 L 0 -.94 L .34 -.3 L .76 -.82 L 1 .92 Q .48 .62 0 .78 Q -.48 .62 -1 .92 Z" />
}

type MotionSettings = ReturnType<typeof normalizeShowMotionTransition>

function MotionGlyph({ settings }: { settings: MotionSettings }) {
  const angle = settings.direction * 360
  const dashed = settings.addressPolicy === 'wrap' ? '3 2' : undefined
  const anchorX = 10 + settings.anchorX * 80
  const anchorY = 5 + settings.anchorY * 26
  if (settings.motionVariant === 'content-grow' || settings.motionVariant === 'content-shrink' || settings.motionVariant === 'zoom-in' || settings.motionVariant === 'zoom-out') {
    const grows = settings.motionVariant === 'content-grow' || settings.motionVariant === 'zoom-in'
    const innerScale = Math.max(0.18, settings.contentScale)
    const innerWidth = 62 * innerScale
    const innerHeight = 24 * innerScale
    return (
      <>
        <rect x="19" y="6" width="62" height="24" fill={grows ? 'none' : INCOMING} fillOpacity=".2" stroke={OUTGOING} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <rect
          x={50 - innerWidth / 2}
          y={18 - innerHeight / 2}
          width={innerWidth}
          height={innerHeight}
          fill={grows ? INCOMING : DARK}
          fillOpacity=".55"
          stroke={BRIGHT}
          strokeDasharray={dashed}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          transform={settings.rotation ? `rotate(${round(settings.rotation * 360 * (settings.spinDirection === 'counterclockwise' ? -1 : 1))} 50 18)` : undefined}
        />
        <circle cx={anchorX} cy={anchorY} r="1.4" fill={BRIGHT} />
        <path d={grows ? 'M 38 18 H 25 M 25 18 L 30 14 M 25 18 L 30 22 M 62 18 H 75 M 75 18 L 70 14 M 75 18 L 70 22' : 'M 25 18 H 38 M 38 18 L 33 14 M 38 18 L 33 22 M 75 18 H 62 M 62 18 L 67 14 M 62 18 L 67 22'} fill="none" stroke={BRIGHT} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </>
    )
  }
  return (
    <g transform={`rotate(${round(angle)} 50 18)`}>
      {settings.motionVariant === 'reveal' ? (
        <>
          <rect x="52" y="6" width="40" height="24" fill={INCOMING} fillOpacity=".45" stroke={INCOMING} strokeDasharray={dashed} vectorEffect="non-scaling-stroke" />
          <rect x="8" y="6" width="40" height="24" fill="rgba(212,212,216,.16)" stroke={OUTGOING} vectorEffect="non-scaling-stroke" />
          <MotionArrow from={34} to={64} />
        </>
      ) : settings.motionVariant === 'push' ? (
        <>
          <rect x="5" y="6" width="42" height="24" fill="rgba(212,212,216,.18)" stroke={OUTGOING} strokeDasharray={dashed} vectorEffect="non-scaling-stroke" />
          <rect x="53" y="6" width="42" height="24" fill={INCOMING} fillOpacity=".42" stroke={INCOMING} strokeDasharray={dashed} vectorEffect="non-scaling-stroke" />
          <MotionArrow from={36} to={64} />
        </>
      ) : (
        <>
          <rect x="8" y="6" width="40" height="24" fill="rgba(212,212,216,.12)" stroke={OUTGOING} vectorEffect="non-scaling-stroke" />
          <rect x="52" y="6" width="40" height="24" fill={INCOMING} fillOpacity=".45" stroke={INCOMING} strokeDasharray={dashed} vectorEffect="non-scaling-stroke" />
          <MotionArrow from={36} to={64} />
        </>
      )}
    </g>
  )
}

function MotionArrow({ from, to }: { from: number; to: number }) {
  return <><line x1={from} y1="18" x2={to} y2="18" stroke={BRIGHT} vectorEffect="non-scaling-stroke" /><path d={`M ${to - 6} 13 L ${to} 18 L ${to - 6} 23`} fill="none" stroke={BRIGHT} vectorEffect="non-scaling-stroke" /></>
}

function FadeColorGlyph({ color }: { color: string }) {
  return (
    <>
      <polygon points="0,4 46,13 46,29 0,32" fill={OUTGOING} />
      <rect data-testid="fade-color-swatch" x="42" y="3" width="16" height="30" fill={color} opacity=".92" />
      <polygon points="54,13 100,4 100,32 54,29" fill={INCOMING} />
    </>
  )
}

function radialPoints(count: number, innerRadius: number): string {
  const points = innerRadius < 1 ? count * 2 : count
  return Array.from({ length: points }, (_, index) => {
    const radius = innerRadius < 1 && index % 2 === 1 ? innerRadius : 1
    const angle = -Math.PI / 2 + index / points * Math.PI * 2
    return `${round(Math.cos(angle) * radius)},${round(Math.sin(angle) * radius)}`
  }).join(' ')
}

function seeded(seed: number, index: number, salt: number): number {
  const value = Math.sin((seed + 1) * 12.9898 + (index + 1) * 78.233 + salt * 37.719) * 43758.5453
  return value - Math.floor(value)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function round(value: number): number {
  return Number(value.toFixed(3))
}
