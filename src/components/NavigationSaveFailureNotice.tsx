// The Studio-level bar for a draft whose navigation-time flush failed after
// its editor was already left (#810): the buffer is gone, so the held copy in
// editorStore.navigationSaveFailure is the only one. Retry re-attempts the
// id-addressed write (dropped if the record has advanced past the held
// timestamp); Dismiss discards the draft. Renders nothing while every
// navigation flush has landed.
import { useEditorStore } from '@/store/editorStore'
import { retryNavigationSaveFailure } from '@/store/autosaveSync'
import { SaveFailureNotice } from '@/components/SaveFailureNotice'

export function NavigationSaveFailureNotice() {
  const failure = useEditorStore((s) => s.navigationSaveFailure)
  const setNavigationSaveFailure = useEditorStore((s) => s.setNavigationSaveFailure)
  if (!failure) return null
  return (
    <SaveFailureNotice
      testId="navigation-save-failure"
      message={`Couldn't save "${failure.name}" before switching. The unsaved edits are held here.`}
      onRetry={() => void retryNavigationSaveFailure()}
      onDismiss={() => setNavigationSaveFailure(null)}
    />
  )
}
