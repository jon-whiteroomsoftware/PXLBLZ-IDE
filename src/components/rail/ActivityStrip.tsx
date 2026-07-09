import { BookOpen, Braces, Cpu, FileCode2, Images, Map as MapIcon, PanelsTopLeft } from 'lucide-react'
import type React from 'react'
import type { StudioEntityKind } from '@/engine/routes'

export type RailMode = StudioEntityKind

const ACTIVITY_ENTRIES: Array<{
  kind: RailMode
  label: string
  short: string
  icon: React.ReactNode
}> = [
  { kind: 'patterns', label: 'Patterns', short: 'PTRN', icon: <FileCode2 size={17} /> },
  { kind: 'maps', label: 'Maps', short: 'MAPS', icon: <MapIcon size={17} /> },
  { kind: 'mixins', label: 'Mixins', short: 'MIXN', icon: <Braces size={17} /> },
  { kind: 'libraries', label: 'Libraries', short: 'LIBS', icon: <BookOpen size={17} /> },
  { kind: 'controllers', label: 'Controllers', short: 'CTRL', icon: <Cpu size={17} /> },
  { kind: 'shows', label: 'Shows', short: 'SHOW', icon: <PanelsTopLeft size={17} /> },
]

export function ActivityStrip({
  mode,
  onModeChange,
  onCatalog,
}: {
  mode: RailMode
  onModeChange: (mode: RailMode) => void
  onCatalog: () => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Studio activity"
      className="flex w-[46px] shrink-0 flex-col items-center border-r border-seam bg-zinc-950/35 py-2"
    >
      {ACTIVITY_ENTRIES.map((entry) => {
        const active = mode === entry.kind
        return (
          <button
            key={entry.kind}
            role="radio"
            aria-checked={active}
            aria-label={entry.label}
            title={entry.label}
            onClick={() => onModeChange(entry.kind)}
            className={[
              'mb-1 flex w-full flex-col items-center gap-0.5 px-1 py-1 text-[9px] font-semibold uppercase tracking-wide transition-colors',
              active
                ? 'text-live'
                : 'text-zinc-600 hover:bg-zinc-900/55 hover:text-zinc-300',
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
        )
      })}
      <button
        type="button"
        aria-label="Catalog"
        title="Catalog"
        onClick={onCatalog}
        className="mt-auto flex w-full flex-col items-center gap-0.5 px-1 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600 transition-colors hover:bg-zinc-900/55 hover:text-zinc-300"
      >
        <span className="grid size-7 place-items-center rounded border border-transparent">
          <Images size={17} />
        </span>
        <span>CTLG</span>
      </button>
    </div>
  )
}
