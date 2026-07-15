import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ScanSearch, X } from 'lucide-react'
import type {
  SceneReadOnlyBridgeProjection,
  SceneXrayPropertyBeat,
} from '@/engine/showSceneReadOnlyProjection'

const EFFECT_COLOR = '#4fc4b0'
const PROPERTY_COLOR = '#a78bfa'

export function ShowSceneXray({
  detail,
  onInspect,
}: {
  detail: SceneReadOnlyBridgeProjection
  onInspect: () => void
}) {
  const duration = Math.max(1, detail.durationMs)
  return (
    <div
      role="group"
      aria-label={`${detail.sceneName} Scene X-ray, read only`}
      className="relative h-[36px] min-w-0 overflow-hidden border-x border-amber-300/25 bg-amber-300/[0.035] text-[8px] text-zinc-500"
    >
      <XrayStratum label="cuts">
        {detail.xray.cutReferences.map((reference) => (
          <i
            key={`${reference.kind}-${reference.localTimeMs}`}
            aria-hidden
            className="absolute inset-y-0 w-px bg-zinc-300/55"
            style={{ left: `${reference.localTimeMs / duration * 100}%` }}
          />
        ))}
      </XrayStratum>
      <XrayStratum label="fx">
        {detail.xray.effectActivity.map((activity) => (
          <i
            key={`${activity.sourceCellId}-${activity.effectId}`}
            aria-hidden
            className="absolute inset-y-[3px] min-w-px border-x border-emerald-300/50 bg-emerald-300/25"
            style={{
              left: `${activity.startMs / duration * 100}%`,
              width: `${Math.max(1, (activity.endMs - activity.startMs) / duration * 100)}%`,
            }}
          />
        ))}
      </XrayStratum>
      <XrayStratum label="properties">
        <PropertySparkline beats={detail.xray.propertyBeats} durationMs={duration} />
      </XrayStratum>
      <button
        type="button"
        aria-label={`Inspect ${detail.sceneName} in Super Detail`}
        title={`Inspect ${detail.sceneName} in Super Detail`}
        onClick={(event) => {
          event.stopPropagation()
          onInspect()
        }}
        className="absolute right-0.5 top-0.5 z-10 grid size-5 place-items-center rounded-sm bg-[#0b0d10]/90 text-zinc-400 shadow-[0_0_0_1px_rgba(82,82,91,.65)] transition-colors hover:text-amber-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300"
      >
        <ScanSearch size={11} aria-hidden />
      </button>
    </div>
  )
}

function XrayStratum({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid h-3 grid-cols-[42px_minmax(0,1fr)] border-b border-zinc-900/80 last:border-b-0">
      <span className="truncate border-r border-zinc-900/80 px-1 font-mono uppercase tracking-[0.08em]">{label}</span>
      <span className="relative min-w-0 overflow-hidden">{children}</span>
    </div>
  )
}

function PropertySparkline({ beats, durationMs }: { beats: SceneXrayPropertyBeat[]; durationMs: number }) {
  if (beats.length === 0) return null
  return (
    <>
      <svg aria-hidden viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <path d="M0 8 C18 8 24 3 42 4 S72 7 100 2" fill="none" stroke={PROPERTY_COLOR} strokeWidth="0.8" vectorEffect="non-scaling-stroke" opacity="0.7" />
      </svg>
      {beats.map((beat, index) => (
        <i
          key={`${beat.direction}-${beat.property}-${index}`}
          aria-hidden
          className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-300"
          style={{ left: `${beat.localTimeMs / durationMs * 100}%` }}
        />
      ))}
    </>
  )
}

export function ShowSceneSuperDetail({
  detail,
  onClose,
}: {
  detail: SceneReadOnlyBridgeProjection
  onClose: () => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    const onClickAway = (event: MouseEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClickAway)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClickAway)
    }
  }, [onClose])

  return createPortal(
    <section
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`${detail.sceneName} Super Detail`}
      className="fixed left-[clamp(8px,16vw,190px)] top-[clamp(56px,14vh,136px)] z-[90] flex max-h-[min(620px,calc(100vh-72px))] w-[min(720px,calc(100vw-clamp(16px,16vw,202px)))] flex-col overflow-hidden rounded-md border border-zinc-600 bg-[#090b0e]/[0.99] font-mono text-[10px] text-zinc-300 shadow-[0_24px_80px_-18px_rgba(0,0,0,.96),0_0_0_1px_rgba(230,184,92,.12)] backdrop-blur-sm"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-700 bg-[#11151a] px-3">
        <ScanSearch size={13} aria-hidden className="text-amber-200" />
        <h2 className="min-w-0 truncate text-[12px] font-semibold text-zinc-100">{detail.sceneName} · Super Detail</h2>
        <span className="rounded-sm border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-amber-200">Read only</span>
        <span className="ml-auto whitespace-nowrap tabular-nums text-[9px] text-zinc-500">
          Global {formatTimelineTime(detail.globalStartMs)}–{formatTimelineTime(detail.globalEndMs)}
        </span>
        <button
          type="button"
          aria-label="Close Super Detail"
          title="Close Super Detail (Escape)"
          onClick={onClose}
          className="grid size-6 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300"
        >
          <X size={13} aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="grid h-7 shrink-0 grid-cols-[112px_minmax(0,1fr)] border-b border-zinc-800">
          <span className="flex items-center border-r border-zinc-800 px-2 text-zinc-500">Boundary context</span>
          <span className="flex min-w-0 items-center gap-2 overflow-hidden px-2">
            <BoundaryBadge direction="in" boundary={detail.incomingBoundary} />
            <span className="truncate text-zinc-500">Local {formatTimelineTime(0)}–{formatTimelineTime(detail.durationMs)}</span>
            <BoundaryBadge direction="out" boundary={detail.outgoingBoundary} className="ml-auto" />
          </span>
        </div>
        <LocalRuler durationMs={detail.durationMs} />
        {detail.zones.map((zone) => (
          <div key={zone.zoneId} className="border-b border-zinc-800 last:border-b-0">
            <DetailTrack label={`${zone.zoneName} · ${zone.nominalPixelCount}px`} accent="#c9d0d7">
              {zone.placements.map((placement) => (
                <span
                  key={placement.id}
                  className={`absolute inset-y-1 border px-1.5 leading-5 ${placement.compiled ? 'border-slate-500 bg-slate-700/35 text-zinc-100' : 'border-dashed border-red-400/60 bg-red-400/10 text-red-200'}`}
                  style={{
                    left: `${placement.startMs / Math.max(1, detail.durationMs) * 100}%`,
                    width: `${Math.max(2, (placement.endMs - placement.startMs) / Math.max(1, detail.durationMs) * 100)}%`,
                  }}
                >
                  <span className="font-semibold">{placement.patternName}</span>
                  {placement.continuesFromPrevious && <span className="ml-2 text-cyan-300">continues in</span>}
                  {placement.continuesToNext && <span className="ml-2 text-cyan-300">continues out</span>}
                </span>
              ))}
            </DetailTrack>
            {zone.placements.some((placement) => placement.effectKinds.length > 0) && (
              <DetailTrack label="↳ effects" accent={EFFECT_COLOR} compact>
                {zone.placements.flatMap((placement) => placement.effectKinds.map((kind, index) => (
                  <span
                    key={`${placement.id}-${kind}-${index}`}
                    className="absolute inset-y-1 truncate border border-emerald-300/40 bg-emerald-300/10 px-1 text-emerald-200"
                    style={{
                      left: `${placement.startMs / Math.max(1, detail.durationMs) * 100}%`,
                      width: `${Math.max(2, (placement.endMs - placement.startMs) / Math.max(1, detail.durationMs) * 100)}%`,
                    }}
                  >
                    {kind}
                  </span>
                ))) }
              </DetailTrack>
            )}
          </div>
        ))}
        {detail.xray.propertyBeats.map((beat, index) => (
          <DetailTrack key={`${beat.direction}-${beat.property}-${index}`} label={`↳ ${beat.property}`} accent={PROPERTY_COLOR} compact>
            <PropertyBeatTrack beat={beat} durationMs={detail.durationMs} />
          </DetailTrack>
        ))}
        {detail.diagnostics.length > 0 && (
          <div role="status" className="border-t border-red-400/25 bg-red-400/[0.06] px-3 py-2 text-[9px] leading-4 text-red-200">
            {detail.diagnostics.join(' ')}
          </div>
        )}
      </div>
    </section>,
    document.body,
  )
}

function BoundaryBadge({ direction, boundary, className = '' }: {
  direction: 'in' | 'out'
  boundary: SceneReadOnlyBridgeProjection['incomingBoundary']
  className?: string
}) {
  return (
    <span className={`whitespace-nowrap border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[9px] text-amber-200 ${className}`}>
      {direction} · {boundary ? `${boundary.kind} ${formatDuration(boundary.durationMs)}` : 'none'}
    </span>
  )
}

function LocalRuler({ durationMs }: { durationMs: number }) {
  return (
    <div className="grid h-6 shrink-0 grid-cols-[112px_minmax(0,1fr)] border-b border-zinc-800 bg-[#0d1014] text-[9px] text-zinc-500">
      <span className="flex items-center border-r border-zinc-800 px-2 uppercase tracking-[0.1em]">Local time</span>
      <span className="flex items-center justify-between bg-[linear-gradient(to_right,transparent_49.8%,rgba(63,63,70,.7)_50%,transparent_50.2%)] px-1 tabular-nums">
        <i className="not-italic">0</i>
        <i className="not-italic">{formatDuration(durationMs / 2)}</i>
        <i className="not-italic">{formatDuration(durationMs)}</i>
      </span>
    </div>
  )
}

function DetailTrack({ label, accent, compact = false, children }: {
  label: string
  accent: string
  compact?: boolean
  children: ReactNode
}) {
  return (
    <div className={`grid grid-cols-[112px_minmax(0,1fr)] border-b border-zinc-800 last:border-b-0 ${compact ? 'h-6' : 'h-8'}`}>
      <span className="flex min-w-0 items-center truncate border-r border-zinc-800 px-2" style={{ color: accent }}>{label}</span>
      <span className="relative min-w-0 overflow-hidden">{children}</span>
    </div>
  )
}

function PropertyBeatTrack({ beat, durationMs }: { beat: SceneXrayPropertyBeat; durationMs: number }) {
  const start = beat.direction === 'incoming' ? 0 : Math.max(0, durationMs - beat.durationMs)
  const end = Math.min(durationMs, start + beat.durationMs)
  const left = start / Math.max(1, durationMs) * 100
  const width = Math.max(1, (end - start) / Math.max(1, durationMs) * 100)
  return (
    <span className="absolute inset-y-0" style={{ left: `${left}%`, width: `${width}%` }}>
      <svg aria-hidden viewBox="0 0 100 20" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <path d={beat.direction === 'incoming' ? 'M0 17 C35 17 60 5 100 3' : 'M0 3 C40 5 65 17 100 17'} fill="none" stroke={PROPERTY_COLOR} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <i aria-hidden className="absolute left-0 top-[14px] size-1 rounded-full bg-violet-300" />
      <i aria-hidden className="absolute right-0 top-[2px] size-1 rounded-full bg-violet-300" />
    </span>
  )
}

function formatTimelineTime(timeMs: number): string {
  const tenths = Math.max(0, Math.round(timeMs / 100))
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths % 10}`
}

function formatDuration(timeMs: number): string {
  const seconds = Math.max(0, timeMs / 1000)
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
    : `${Number(seconds.toFixed(1))}s`
}
