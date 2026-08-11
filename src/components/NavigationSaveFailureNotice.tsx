// The Studio-level bars for edits lost to failed navigation flushes (#810):
// the buffer had already moved on when the save failed, so the edit is gone.
// Each bar states which record's edit was lost and offers Dismiss; nothing is
// retained or retried (draft retention with Retry is #818). Renders nothing
// while every navigation flush has landed.
import { useEditorStore } from '@/store/editorStore'
import { dismissNavigationSaveLoss } from '@/store/autosaveSync'
import { SaveFailureNotice } from '@/components/SaveFailureNotice'

export function NavigationSaveFailureNotice() {
  const losses = useEditorStore((s) => s.navigationSaveLosses)
  if (losses.length === 0) return null
  return (
    <>
      {losses.map((loss) => (
        <SaveFailureNotice
          key={`${loss.flavor}:${loss.id}`}
          testId="navigation-save-failure"
          message={`Couldn't save "${loss.name}" before switching. That edit wasn't saved.`}
          onDismiss={() => dismissNavigationSaveLoss(loss.flavor, loss.id)}
        />
      ))}
    </>
  )
}
