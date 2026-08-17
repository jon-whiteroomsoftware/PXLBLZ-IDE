import { useId, useSyncExternalStore } from 'react'
import { Check, Play, RotateCw, Save } from 'lucide-react'
import { controlIcon, transportIcon } from '@/components/iconScale'
import { DisabledReasonTip } from '@/components/ui/disabled-reason'
import { trackEvent } from '@/analytics'
import { describeControllerActionRow } from '@/engine/controllerActionRow'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  controllerProfileArtifactSignature,
  findProfileForLiveController,
} from '@/engine/controllerProfilePassRecipe'
import { describeSendAction, isAlreadyPushed, type SendMode } from '@/engine/sendToController'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { useEditorStore } from '@/store/editorStore'
import { activePushKey, usePatternStore } from '@/store/patternStore'
import { useRouterStore } from '@/store/routerStore'
import { ControllerProgramSwitch } from './ControllerProgramSwitch'

export function ControllerActionRow() {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )
  const route = useRouterStore((state) => state.route)
  const compileStatus = useEditorStore((state) => state.compileStatus)
  const previewSource = useEditorStore((state) => state.previewSource)
  const patternId = usePatternStore(activePushKey)
  const activePatternId = usePatternStore((state) => state.activePatternId)
  const activeDemoName = usePatternStore((state) => state.activeDemoName)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const activeIp = useControllerStore((state) => state.activeIp)
  const active = useControllerStore((state) => (
    state.activeIp ? state.controllers[state.activeIp] : undefined
  ))
  const pushing = useControllerStore((state) => state.pushing)
  const pushResult = useControllerStore((state) => state.pushResult)
  const saveArmed = useControllerStore((state) => state.saveArmed)
  const setSaveArmed = useControllerStore((state) => state.setSaveArmed)
  const lastPushedSource = useControllerStore((state) => state.lastPushedSource)
  const lastRunProgramId = useControllerStore((state) => state.lastRunProgramId)
  const lastSavedSource = useControllerStore((state) => state.lastSavedSource)
  const lastPushedProfileSignature = useControllerStore((state) => state.lastPushedProfileSignature)
  const lastSavedProfileSignature = useControllerStore((state) => state.lastSavedProfileSignature)
  const controllerProfiles = useControllerProfileStore((state) => state.profiles)
  const activeProgramId = useControllerPanelStore((state) => state.activeProgramId)
  const programsByController = useControllerPanelStore((state) => state.programsByController)
  const programs = activeIp ? programsByController[activeIp] ?? [] : []
  const programsRead = !!activeIp
    && Object.prototype.hasOwnProperty.call(programsByController, activeIp)

  const patternName = activeDemoName
    ?? userPatterns.find((pattern) => pattern.id === activePatternId)?.name
    ?? null
  const controllerProfile = active
    ? findProfileForLiveController(controllerProfiles, active)
    : null
  const profileSignature = controllerProfileArtifactSignature(
    controllerProfile,
    patternId,
    { mapDim: active?.mapDim ?? null },
  )
  const alreadyPushed = (mode: SendMode) => (
    !!activeIp
    && !!patternId
    && isAlreadyPushed({
      mode,
      source: previewSource,
      lastRunSource: lastPushedSource[activeIp]?.[patternId],
      lastSavedSource: lastSavedSource[activeIp]?.[patternId],
      profileSignature,
      lastRunProfileSignature: lastPushedProfileSignature[activeIp]?.[patternId],
      lastSavedProfileSignature: lastSavedProfileSignature[activeIp]?.[patternId],
      lastRunProgramId: lastRunProgramId[activeIp]?.[patternId],
      activeProgramId,
    })
  )
  const working = pushing || !!pushResult?.ok
  const view = describeControllerActionRow({
    route,
    patternName,
    status,
    compileStatus,
    runAlreadyPushed: alreadyPushed('run'),
    saveAlreadyPushed: alreadyPushed('save'),
    working,
    programsRead,
    programCount: programs.length,
    hasRunOnlyActive: programsRead
      && !!activeProgramId
      && !programs.some((program) => program.id === activeProgramId),
  })
  const target = active ? active.nickname || active.ip : 'Controller'
  // Gate reasons reach keyboard and assistive-tech users (#875): a gated verb
  // stays focusable under `aria-disabled` and describes itself through the
  // shared tip; only an in-flight send uses `disabled`.
  const runReasonId = useId()
  const saveReasonId = useId()
  const runGated = !view.run.enabled && !working
  const saveGated = !view.save.enabled && !working

  const send = (mode: SendMode) => {
    setSaveArmed(mode === 'save')
    trackEvent('send_to_controller', {
      mode,
      pattern_key: patternId,
      controller_phase: active?.phase ?? status.kind,
    })
    void useControllerStore.getState().requestPush()
  }

  const glyph = (mode: SendMode) => {
    if (pushing && saveArmed === (mode === 'save')) {
      return <RotateCw {...controlIcon} className="animate-spin text-amber-400" aria-hidden />
    }
    if (pushResult?.ok && saveArmed === (mode === 'save')) {
      return <Check {...controlIcon} aria-hidden />
    }
    return mode === 'save'
      ? <Save {...controlIcon} aria-hidden />
      : <Play {...transportIcon} aria-hidden />
  }

  const actionClass =
    'inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 aria-disabled:cursor-not-allowed aria-disabled:opacity-30'

  return (
    <div data-testid="controller-action-row" className="relative border-b border-seam px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <span className="relative inline-flex">
          <button
            type="button"
            disabled={working}
            aria-disabled={runGated || undefined}
            aria-describedby={runGated ? runReasonId : undefined}
            title={view.run.enabled ? describeSendAction('run', target).tooltip : working ? view.run.reason : undefined}
            onClick={() => { if (!runGated) send('run') }}
            className={`${actionClass} bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80 hover:text-zinc-100 aria-disabled:hover:bg-zinc-800/80 aria-disabled:hover:text-zinc-300`}
          >
            {glyph('run')}
            Run
          </button>
          {runGated && <DisabledReasonTip id={runReasonId}>{view.run.reason}</DisabledReasonTip>}
        </span>
        <span className="relative inline-flex">
          <button
            type="button"
            disabled={working}
            aria-disabled={saveGated || undefined}
            aria-describedby={saveGated ? saveReasonId : undefined}
            title={view.save.enabled ? describeSendAction('save', target).tooltip : working ? view.save.reason : undefined}
            onClick={() => { if (!saveGated) send('save') }}
            className={`${actionClass} bg-zinc-800/80 text-zinc-300 hover:bg-amber-500/10 hover:text-amber-300 aria-disabled:hover:bg-zinc-800/80 aria-disabled:hover:text-zinc-300`}
          >
            {glyph('save')}
            Save
          </button>
          {saveGated && <DisabledReasonTip id={saveReasonId}>{view.save.reason}</DisabledReasonTip>}
        </span>
        <span
          className="ml-1.5 min-w-16 flex-1 basis-20 truncate text-[10px] text-zinc-500"
          title={view.subject ?? undefined}
        >
          {view.subject ?? '—'}
        </span>
        <ControllerProgramSwitch
          gate={view.switch}
          programs={programs}
          actionClass={actionClass}
          controllerId={activeIp ?? ''}
        />
      </div>
    </div>
  )
}
