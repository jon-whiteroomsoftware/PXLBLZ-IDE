import { useState } from 'react'
import type { PreflightWarning } from '@/engine/preflight'
import type { RecommendedMapRemedy } from '@/engine/patternMapRemedy'
import { PreflightWarningList, pushPopoverButton } from '@/components/PushConfirmPopover'

const checkbox = 'h-3.5 w-3.5 shrink-0 accent-amber-400'

// The pattern-push popover body, mounted only while the popover is open (so its
// default-checked checkbox re-arms on every open). Supported/unknown combinations are
// push-past warnings; a known unsupported firmware combination disables plain Send.
// When the open demo carries a
// recommended map of the matching dimension (Option A), a checked-by-default checkbox
// offers to install it first — the pattern analogue of the map-push count remedy. Without
// a recommendation (user patterns, demos without one) there's no checkbox: a plain push.
export function PatternPushChoices({
  warnings,
  blocked,
  remedy,
  onCancel,
  confirmWithMap,
  confirmOnly,
}: {
  warnings: PreflightWarning[]
  blocked: boolean
  remedy: RecommendedMapRemedy | null
  onCancel: () => void
  confirmWithMap: () => Promise<void>
  confirmOnly: () => Promise<void>
}) {
  const [installMap, setInstallMap] = useState(true)
  const withMap = remedy !== null && installMap
  const canSend = !blocked || withMap
  const onSend = () => void (withMap ? confirmWithMap() : confirmOnly())

  return (
    <>
      <PreflightWarningList warnings={warnings} />

      {remedy && (
        <fieldset className="mt-3 space-y-1.5">
          <legend className="text-zinc-500">Recommended</legend>
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              className={checkbox}
              checked={installMap}
              onChange={(e) => setInstallMap(e.target.checked)}
            />
            Also install its map ({remedy.mapName})
          </label>
        </fieldset>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={pushPopoverButton.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={pushPopoverButton.action}
          disabled={!canSend}
          onClick={onSend}
        >
          {withMap ? 'Install & send' : blocked ? 'Unsupported' : 'Send anyway'}
        </button>
      </div>
    </>
  )
}
