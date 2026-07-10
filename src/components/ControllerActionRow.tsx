import { useSyncExternalStore } from 'react'
import { Check, ChevronRight, Play, RotateCw, Save } from 'lucide-react'
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
import { useEditorStore } from '@/store/editorStore'
import { activePushKey, usePatternStore } from '@/store/patternStore'
import { useRouterStore } from '@/store/routerStore'

export function ControllerActionRow({
  profileHref,
  onProfile,
}: {
  profileHref: string
  onProfile: () => void
}) {
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
  const lastSavedSource = useControllerStore((state) => state.lastSavedSource)
  const lastPushedProfileSignature = useControllerStore((state) => state.lastPushedProfileSignature)
  const lastSavedProfileSignature = useControllerStore((state) => state.lastSavedProfileSignature)
  const controllerProfiles = useControllerProfileStore((state) => state.profiles)

  const patternName = activeDemoName
    ?? userPatterns.find((pattern) => pattern.id === activePatternId)?.name
    ?? null
  const controllerProfile = active
    ? findProfileForLiveController(controllerProfiles, active)
    : null
  const profileSignature = controllerProfileArtifactSignature(controllerProfile, patternId)
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
  })
  const target = active ? active.nickname || active.ip : 'Controller'

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
      return <RotateCw size={13} className="animate-spin text-amber-400" aria-hidden />
    }
    if (pushResult?.ok && saveArmed === (mode === 'save')) {
      return <Check size={13} aria-hidden />
    }
    return mode === 'save'
      ? <Save size={13} aria-hidden />
      : <Play size={13} aria-hidden />
  }

  const actionClass =
    'inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30'

  return (
    <div data-testid="controller-action-row" className="border-b border-seam px-3 py-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!view.run.enabled}
          title={view.run.enabled ? describeSendAction('run', target).tooltip : view.run.reason}
          onClick={() => send('run')}
          className={`${actionClass} bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80 hover:text-zinc-100`}
        >
          {glyph('run')}
          Run
        </button>
        <button
          type="button"
          disabled={!view.save.enabled}
          title={view.save.enabled ? describeSendAction('save', target).tooltip : view.save.reason}
          onClick={() => send('save')}
          className={`${actionClass} bg-zinc-800/80 text-zinc-300 hover:bg-amber-500/10 hover:text-amber-300`}
        >
          {glyph('save')}
          Save
        </button>
        <a
          href={profileHref}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            onProfile()
          }}
          className="ml-auto inline-flex h-7 items-center gap-0.5 px-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-100 focus:outline-none focus:text-zinc-100"
        >
          Profile
          <ChevronRight size={13} aria-hidden className="text-zinc-600" />
        </a>
      </div>
      <p className="mt-1 truncate text-[10px] leading-4 text-zinc-500" title={view.caption}>
        {view.caption}
      </p>
    </div>
  )
}
