// The Studio-level bars for drafts whose navigation-time flush failed after
// their editor was already left (#810): each held draft in
// editorStore.navigationSaveFailures is the only copy of those edits. Retry
// re-attempts the id-addressed write (dropped if the record has advanced past
// the held timestamp); Dismiss discards that draft. Renders nothing while
// every navigation flush has landed.
import { useEditorStore } from '@/store/editorStore'
import { dismissNavigationSaveFailure, retryNavigationSaveFailure } from '@/store/autosaveSync'
import { SaveFailureNotice } from '@/components/SaveFailureNotice'

export function NavigationSaveFailureNotice() {
  const failures = useEditorStore((s) => s.navigationSaveFailures)
  if (failures.length === 0) return null
  return (
    <>
      {failures.map((draft) => (
        <SaveFailureNotice
          key={`${draft.flavor}:${draft.id}`}
          testId="navigation-save-failure"
          message={`Couldn't save "${draft.name}" before switching. The unsaved edits are held here.`}
          onRetry={() => void retryNavigationSaveFailure(draft.flavor, draft.id)}
          onDismiss={() => dismissNavigationSaveFailure(draft.flavor, draft.id)}
        />
      ))}
    </>
  )
}
