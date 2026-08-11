// The stuck-autosave glyph beside the compile badge (#810): amber when broken
// source pauses autosave ("won't save"), red when the persistence write is
// failing ("can't save"). Hidden whenever the buffer is durably saved or a
// clean edit is simply waiting for the next tick — the happy path renders
// nothing. Derivation lives in autosaveSync/saveStatus; this surface only
// subscribes and renders.
import { CloudOff } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore } from '@/store/patternStore'
import { useMapStore } from '@/store/mapStore'
import { useMixinStore } from '@/store/mixinStore'
import { useLibraryStore } from '@/store/libraryStore'
import { activeStuckSaveStatus } from '@/store/autosaveSync'
import { stuckSaveStatusLabel } from '@/engine/saveStatus'

export function SaveStatusBadge() {
  // Subscribe to every input of activeStuckSaveStatus so the imperative
  // derivation below re-runs when any of them changes.
  useEditorStore((s) => s.source)
  useEditorStore((s) => s.compileStatus)
  useEditorStore((s) => s.autosaveFailed)
  useEditorStore((s) => s.editorFlavor)
  useEditorStore((s) => s.isReadOnly)
  usePatternStore((s) => s.activePatternId)
  usePatternStore((s) => s.userPatterns)
  useMapStore((s) => s.editingMap)
  useMapStore((s) => s.userMaps)
  useMixinStore((s) => s.editingMixin)
  useMixinStore((s) => s.userMixins)
  useLibraryStore((s) => s.editingLibrary)
  useLibraryStore((s) => s.userLibraries)

  const stuck = activeStuckSaveStatus()
  if (!stuck) return null
  const label = stuckSaveStatusLabel(stuck.status, stuck.lastSavedAt)
  return (
    <span
      role="status"
      data-testid="save-status"
      data-state={stuck.status}
      title={label}
      className="inline-flex shrink-0 items-center"
    >
      <CloudOff
        size={13}
        aria-hidden
        className={stuck.status === 'wont-save' ? 'text-amber-400/85' : 'text-red-400/85'}
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}
