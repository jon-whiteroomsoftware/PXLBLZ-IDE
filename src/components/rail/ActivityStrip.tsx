import { BookOpen, Braces, Cpu, FileCode2, Map as MapIcon, PanelLeftOpen, PanelsTopLeft } from 'lucide-react'
import type React from 'react'
import type { StudioEntityKind } from '@/engine/routes'
import { IDE_MICROTYPE } from '@/components/ui/ideMicrotype'

export type RailMode = StudioEntityKind

const ACTIVITY_ENTRIES: Array<{
  kind: RailMode
  label: string
  short: string
  icon: React.ReactNode
}> = [
  { kind: 'patterns', label: 'Patterns', short: 'PTRN', icon: <FileCode2 size={17} /> },
  { kind: 'maps', label: 'Maps', short: 'MAP', icon: <MapIcon size={17} /> },
  { kind: 'mixins', label: 'Mixins', short: 'MIXN', icon: <Braces size={17} /> },
  { kind: 'libraries', label: 'Libraries', short: 'LIB', icon: <BookOpen size={17} /> },
  { kind: 'controllers', label: 'Controllers', short: 'CTRL', icon: <Cpu size={17} /> },
  { kind: 'shows', label: 'Shows', short: 'SHOW', icon: <PanelsTopLeft size={17} /> },
]

export function ActivityStrip({
  mode,
  onModeChange,
  collapsed = false,
  onToggleCollapsed,
}: {
  mode: RailMode
  onModeChange: (mode: RailMode) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Studio activity"
      className="relative flex w-[46px] shrink-0 flex-col items-center border-r border-seam bg-zinc-950/35 py-2"
    >
      {ACTIVITY_ENTRIES.map((entry) => {
        const active = mode === entry.kind
        return (
          <div key={entry.kind} className="relative w-full">
            <button
              role="radio"
              aria-checked={active}
              aria-label={entry.label}
              title={entry.label}
              onClick={() => onModeChange(entry.kind)}
              className={[
                `mb-1 flex w-full flex-col items-center gap-0.5 px-1 py-1 font-semibold uppercase tracking-wide transition-colors ${IDE_MICROTYPE.required.sizeClassName}`,
                active
                  ? 'text-live'
                  : 'text-zinc-400 hover:bg-zinc-900/55 hover:text-zinc-200',
              ].join(' ')}
            >
              <span className={[
                'grid size-7 place-items-center rounded border transition-colors',
                active ? 'border-live/45 bg-live/10' : 'border-transparent',
              ].join(' ')}>
                {entry.icon}
              </span>
              <span>{entry.short}</span>
            </button>
            {collapsed && active && onToggleCollapsed && (
              <button
                type="button"
                aria-label="Expand library"
                title="Expand library"
                onClick={onToggleCollapsed}
                className={`absolute left-1/2 top-1 z-20 grid size-7 -translate-x-1/2 place-items-center rounded border border-zinc-700 bg-zinc-950 text-zinc-400 shadow-sm transition-colors hover:border-live/60 hover:bg-zinc-900 hover:text-live ${IDE_MICROTYPE.required.sizeClassName}`}
              >
                <PanelLeftOpen size={17} aria-hidden />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
