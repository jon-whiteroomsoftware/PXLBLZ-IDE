import { LIBRARIES } from '@/pixelblaze/libs'
import { SEED_PATTERN } from '@/pixelblaze/seedPattern'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore, SEED_PATTERN_ID } from '@/store/patternStore'

const LIBRARY_NAMES = Object.keys(LIBRARIES).sort()

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
      {label}
    </div>
  )
}

function ListItem({
  label,
  active,
  dim,
  onClick,
}: {
  label: string
  active: boolean
  dim?: string
  onClick: () => void
}) {
  return (
    <li
      onClick={onClick}
      className={[
        'px-3 py-1.5 cursor-pointer truncate select-none flex items-center gap-1.5',
        'hover:text-zinc-100 hover:bg-zinc-800',
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400',
      ].join(' ')}
    >
      {label}
      {dim && <span className="text-zinc-600 text-xs shrink-0">{dim}</span>}
    </li>
  )
}

export function PatternList() {
  const setSource = useEditorStore((s) => s.setSource)
  const setIsReadOnly = useEditorStore((s) => s.setIsReadOnly)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const setActiveLibrary = usePatternStore((s) => s.setActiveLibrary)
  const setActivePattern = usePatternStore((s) => s.setActivePattern)

  function openLibrary(name: string) {
    setActiveLibrary(name)
    setSource(LIBRARIES[name])
    setIsReadOnly(true)
  }

  function openSeedPattern() {
    setActivePattern(SEED_PATTERN_ID)
    setSource(SEED_PATTERN)
    setIsReadOnly(false)
  }

  return (
    <div className="flex flex-col h-full text-sm">
      <SectionHeader label="Libraries" />
      <ul>
        {LIBRARY_NAMES.map((name) => (
          <ListItem
            key={name}
            label={name}
            active={activeLibraryName === name}
            dim="read-only"
            onClick={() => openLibrary(name)}
          />
        ))}
      </ul>

      <SectionHeader label="Your Patterns" />
      <ul>
        <ListItem
          label="Seed Pattern"
          active={activePatternId === SEED_PATTERN_ID}
          onClick={openSeedPattern}
        />
      </ul>
    </div>
  )
}
