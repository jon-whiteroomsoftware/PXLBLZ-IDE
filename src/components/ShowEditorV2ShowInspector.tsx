import { useState } from 'react'
import type { ShowTimelineSelection } from '@/engine/showTimelineViewModel'
import {
  admitShowV2PilotInsertTime,
  admitShowV2PilotPropertyEdit,
  admitShowV2PilotSetShowEnd,
} from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'
import { ShowV2MarkerEditor } from './ShowV2MarkerEditor'
import { ShowV2PropertyEditor } from './ShowV2PropertyEditor'
import { ShowV2ShowTimingEditor } from './ShowV2ShowTimingEditor'
import type { ShowV2EditCaptureBinding } from './useShowV2EditCapture'

/**
 * The Show-scoped inspector beside the v2 timeline: Property tracks, Markers,
 * Show End and Insert Time.
 *
 * It holds no record. Every section plans its edit with a landed v2 model and
 * adopts it through the closed prepared-edit admission, so one accepted edit is
 * one history entry and a refusal writes nothing (specification section 9). A
 * track selected on an animation lane selects the same track here.
 */
export function ShowEditorV2ShowInspector({
  showId,
  binding,
  selection,
  onSelectionChange,
}: {
  showId: string
  binding: ShowV2EditCaptureBinding
  selection?: ShowTimelineSelection | null
  onSelectionChange?: (selection: ShowTimelineSelection | null) => void
}) {
  const { capture, isCurrentCapture, isCurrentCompletion } = binding
  const [status, setStatus] = useState('')
  const baseRevision = () => useShowStore.getState().showRevisions[showId] ?? 0

  if (!capture) {
    return (
      <section aria-label="Show inspector" data-testid="show-inspector-v2" className="bg-zinc-950 px-4 py-4 text-zinc-200">
        <output role="status" className="block text-sm text-zinc-500">Opening this Show…</output>
      </section>
    )
  }

  const context = () => ({ showId, baseRevision: baseRevision(), capture })

  return (
    <section
      aria-label="Show inspector"
      data-testid="show-inspector-v2"
      className="border-t border-zinc-800 bg-zinc-950 px-4 py-4 text-zinc-200"
    >
      <ShowV2ShowTimingEditor
        key={`timing:${capture.record.id}`}
        capture={capture}
        submitInsertTime={(request) => admitShowV2PilotInsertTime({ ...context(), ...request })}
        submitShowEnd={(request) => admitShowV2PilotSetShowEnd({ ...context(), ...request })}
        isCurrentCapture={isCurrentCapture}
        isCurrentCompletion={isCurrentCompletion}
        onStatus={setStatus}
      />
      <ShowV2PropertyEditor
        key={`properties:${capture.record.id}`}
        capture={capture}
        submitPropertyEdit={(request) => admitShowV2PilotPropertyEdit({ ...context(), ...request })}
        isCurrentCapture={isCurrentCapture}
        isCurrentCompletion={isCurrentCompletion}
        onStatus={setStatus}
        {...(selection?.kind === 'property-track' ? { selectedTrackId: selection.trackId } : {})}
        onSelectTrack={(trackId) => onSelectionChange?.(trackId ? { kind: 'property-track', trackId } : null)}
      />
      <ShowV2MarkerEditor
        key={`markers:${capture.record.id}`}
        capture={capture}
        isCurrentCapture={isCurrentCapture}
        isCurrentCompletion={isCurrentCompletion}
        onStatus={setStatus}
      />
      <output aria-live="polite" data-testid="show-inspector-v2-status" className="mt-4 block text-sm leading-6 text-zinc-400">
        {status || 'Edit the Show timing, Property tracks and Markers here.'}
      </output>
    </section>
  )
}
