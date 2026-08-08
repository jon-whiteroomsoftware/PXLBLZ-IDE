import { useEffect, useSyncExternalStore } from 'react'
import { PatternDeploymentActions } from '@/components/PatternDeploymentActions'
import { PatternActionsMenu } from '@/components/PatternActionsMenu'
import { PatternPushChoices } from '@/components/SendToController'
import { PushConfirmPopover } from '@/components/PushConfirmPopover'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { describeSendToController, isAlreadyPushed } from '@/engine/sendToController'
import { requestControllerEntryOpen } from '@/components/controllerEntryEvents'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useEditorStore } from '@/store/editorStore'
import { activePushKey, usePatternStore } from '@/store/patternStore'
import {
  controllerProfileArtifactSignature,
  findProfileForLiveController,
} from '@/engine/controllerProfilePassRecipe'

type PatternDetailActionBarProps = {
  stageView: 'preview' | 'code'
  onToggleStage: () => void
}

export function PatternDetailActionBar({ stageView, onToggleStage }: PatternDetailActionBarProps) {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )
  const compileStatus = useEditorStore((s) => s.compileStatus)
  const previewSource = useEditorStore((s) => s.previewSource)
  const patternId = usePatternStore(activePushKey)
  const activeIp = useControllerStore((s) => s.activeIp)
  const active = useControllerStore((s) => (s.activeIp ? s.controllers[s.activeIp] : undefined))
  const pushing = useControllerStore((s) => s.pushing)
  const pushResult = useControllerStore((s) => s.pushResult)
  const lastPushedSource = useControllerStore((s) => s.lastPushedSource)
  const lastRunProgramId = useControllerStore((s) => s.lastRunProgramId)
  const lastSavedSource = useControllerStore((s) => s.lastSavedSource)
  const lastPushedProfileSignature = useControllerStore((s) => s.lastPushedProfileSignature)
  const lastSavedProfileSignature = useControllerStore((s) => s.lastSavedProfileSignature)
  const controllerProfiles = useControllerProfileStore((s) => s.profiles)
  const saveArmed = useControllerStore((s) => s.saveArmed)
  const setSaveArmed = useControllerStore((s) => s.setSaveArmed)
  const confirmPatternPush = useControllerStore((s) => s.confirmPatternPush)
  const confirmPatternPushWithMap = useControllerStore((s) => s.confirmPatternPushWithMap)
  const cancelPush = useControllerStore((s) => s.cancelPush)
  const preflight = useControllerStore((s) => s.preflight)
  const patternMapRemedy = useControllerStore((s) => s.patternMapRemedy)
  const patternPushBlocked = useControllerStore((s) => s.patternPushBlocked)
  const clearPushResult = useControllerStore((s) => s.clearPushResult)
  const activeProgramId = useControllerPanelStore((s) => s.activeProgramId)

  const controllerProfile = active
    ? findProfileForLiveController(controllerProfiles, active)
    : null
  const profileSignature = controllerProfileArtifactSignature(
    controllerProfile,
    patternId,
    { mapDim: active?.mapDim ?? null },
  )

  useEffect(() => {
    if (!pushResult) return
    const t = setTimeout(clearPushResult, 3500)
    return () => clearTimeout(t)
  }, [pushResult, clearPushResult])

  const runAlreadyPushed =
    !!activeIp &&
    !!patternId &&
    isAlreadyPushed({
      mode: 'run',
      source: previewSource,
      lastRunSource: lastPushedSource[activeIp]?.[patternId],
      lastSavedSource: lastSavedSource[activeIp]?.[patternId],
      profileSignature,
      lastRunProfileSignature: lastPushedProfileSignature[activeIp]?.[patternId],
      lastSavedProfileSignature: lastSavedProfileSignature[activeIp]?.[patternId],
      lastRunProgramId: lastRunProgramId[activeIp]?.[patternId],
      activeProgramId,
    })
  const saveAlreadyPushed =
    !!activeIp &&
    !!patternId &&
    isAlreadyPushed({
      mode: 'save',
      source: previewSource,
      lastRunSource: lastPushedSource[activeIp]?.[patternId],
      lastSavedSource: lastSavedSource[activeIp]?.[patternId],
      profileSignature,
      lastRunProfileSignature: lastPushedProfileSignature[activeIp]?.[patternId],
      lastSavedProfileSignature: lastSavedProfileSignature[activeIp]?.[patternId],
      lastRunProgramId: lastRunProgramId[activeIp]?.[patternId],
      activeProgramId,
    })
  const runGate = describeSendToController({ status, compileStatus, alreadyPushed: runAlreadyPushed })
  const saveGate = describeSendToController({ status, compileStatus, alreadyPushed: saveAlreadyPushed })
  const patternWarnings = (preflight ?? []).filter((warning) => warning.kind.startsWith('pattern-'))

  const runPattern = () => {
    setSaveArmed(false)
    void useControllerStore.getState().requestPush()
  }

  const savePattern = () => {
    setSaveArmed(true)
    void useControllerStore.getState().requestPush()
  }

  const hardwareGroup = (
    <PatternDeploymentActions
      connected={status.kind === 'connected'}
      controllerName={active ? active.nickname || active.ip : null}
      runGate={runGate}
      saveGate={saveGate}
      activeMode={saveArmed ? 'save' : 'run'}
      pushing={pushing}
      pushResult={pushResult}
      fill
      onConnect={requestControllerEntryOpen}
      onRun={runPattern}
      onSave={savePattern}
    />
  )

  return (
    <div className="flex min-w-0 items-stretch gap-1 font-mono">
      <PatternActionsMenu
        copied={false}
        compileBroken={false}
        stageView={stageView}
        density="regular"
        side="above"
        onToggleStage={onToggleStage}
      />
      <PushConfirmPopover
        open={patternWarnings.length > 0}
        onCancel={cancelPush}
        title="Send pattern"
        testId="pattern-preflight-dialog"
        className="min-w-0 flex-1"
        anchor={<span className="flex min-w-0 w-full items-stretch">{hardwareGroup}</span>}
      >
        <PatternPushChoices
          warnings={patternWarnings}
          blocked={patternPushBlocked}
          remedy={patternMapRemedy}
          onCancel={cancelPush}
          confirmWithMap={confirmPatternPushWithMap}
          confirmOnly={confirmPatternPush}
        />
      </PushConfirmPopover>
    </div>
  )
}
