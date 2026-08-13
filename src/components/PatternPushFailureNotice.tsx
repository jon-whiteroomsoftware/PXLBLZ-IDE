import { SaveFailureNotice } from './SaveFailureNotice'
import { useControllerStore } from '@/store/controllerStore'
import { activePushKey, usePatternStore } from '@/store/patternStore'

export function PatternPushFailureNotice({ compact = false }: { compact?: boolean }) {
  const patternId = usePatternStore(activePushKey)
  const result = useControllerStore((state) => state.artifactPushResult)
  const dismiss = useControllerStore((state) => state.clearArtifactPushResult)
  if (!patternId || !result || result.ok || result.artifactId !== patternId) return null

  const action = result.mode === 'save' ? 'Save' : 'Run'
  return (
    <SaveFailureNotice
      kind="action"
      testId="pattern-push-failure"
      message={`${action} failed: ${result.message}`}
      onDismiss={dismiss}
      dismissLabel={`Dismiss ${action} failure`}
      compact={compact}
    />
  )
}
