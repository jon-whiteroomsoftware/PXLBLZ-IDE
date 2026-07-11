import { useEffect, useSyncExternalStore } from 'react'
import { Check, Code2, Eye, Play, RotateCw, Save } from 'lucide-react'
import { ChipGlyph, ConnectGlyph } from '@/components/ControllerGlyphs'
import { PatternPushChoices } from '@/components/SendToController'
import { PushConfirmPopover } from '@/components/PushConfirmPopover'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { describeSendAction, describeSendToController, isAlreadyPushed } from '@/engine/sendToController'
import { requestControllerEntryOpen } from '@/components/controllerEntryEvents'
import { useControllerStore } from '@/store/controllerStore'
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
    })
  const runGate = describeSendToController({ status, compileStatus, alreadyPushed: runAlreadyPushed })
  const saveGate = describeSendToController({ status, compileStatus, alreadyPushed: saveAlreadyPushed })
  const target = active ? active.nickname || active.ip : 'Controller'
  const working = pushing || !!pushResult?.ok
  const patternWarnings = (preflight ?? []).filter((warning) => warning.kind.startsWith('pattern-'))

  const runPattern = () => {
    setSaveArmed(false)
    void useControllerStore.getState().requestPush()
  }

  const savePattern = () => {
    setSaveArmed(true)
    void useControllerStore.getState().requestPush()
  }

  const actionButtonClass =
    'inline-flex h-8 items-center justify-center gap-1.5 px-2.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-35'

  const hardwareGroup =
    status.kind !== 'connected' ? (
      <button
        type="button"
        onClick={requestControllerEntryOpen}
        className={`${actionButtonClass} flex-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100`}
      >
        <span className="text-zinc-500" aria-hidden>
          <ConnectGlyph />
        </span>
        Connect
      </button>
    ) : (
      <span className="inline-flex flex-1 items-stretch" title={target}>
        <span className="grid w-7 place-items-center text-zinc-500" aria-hidden>
          <ChipGlyph />
        </span>
        <button
          type="button"
          onClick={runPattern}
          disabled={!runGate.enabled || working}
          title={working ? 'Sending...' : runGate.enabled ? describeSendAction('run', target).tooltip : runGate.reason}
          className={`${actionButtonClass} flex-1 ${
            saveArmed ? 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200' : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
          }`}
        >
          {pushing && !saveArmed ? (
            <RotateCw size={13} className="animate-spin text-amber-400" aria-hidden />
          ) : pushResult?.ok && !saveArmed ? (
            <Check size={13} aria-hidden />
          ) : (
            <Play size={13} aria-hidden />
          )}
          Run
        </button>
        <button
          type="button"
          onClick={savePattern}
          disabled={!saveGate.enabled || working}
          title={working ? 'Sending...' : saveGate.enabled ? describeSendAction('save', target).tooltip : saveGate.reason}
          className={`${actionButtonClass} flex-1 border-l border-zinc-800 ${
            saveArmed ? 'text-amber-300 hover:bg-amber-500/10' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          {pushing && saveArmed ? (
            <RotateCw size={13} className="animate-spin text-amber-400" aria-hidden />
          ) : pushResult?.ok && saveArmed ? (
            <Check size={13} aria-hidden />
          ) : (
            <Save size={13} aria-hidden />
          )}
          Save
        </button>
      </span>
    )

  return (
    <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 font-mono">
      <div className="grid grid-cols-2 divide-x divide-zinc-800">
        <button
          type="button"
          aria-pressed={stageView === 'code'}
          onClick={onToggleStage}
          className={`${actionButtonClass} text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100`}
        >
          {stageView === 'code' ? <Eye size={13} aria-hidden /> : <Code2 size={13} aria-hidden />}
          {stageView === 'code' ? 'Preview' : 'Code'}
        </button>
        <PushConfirmPopover
          open={patternWarnings.length > 0}
          onCancel={cancelPush}
          title="Send pattern"
          testId="pattern-preflight-dialog"
          anchor={<span className="inline-flex min-w-0 items-stretch">{hardwareGroup}</span>}
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
    </div>
  )
}
