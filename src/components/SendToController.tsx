import { useEffect, useState, useSyncExternalStore } from 'react'
import { PatternDeploymentActions } from '@/components/PatternDeploymentActions'
import { requestControllerEntryOpen } from '@/components/controllerEntryEvents'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore, activePushKey } from '@/store/patternStore'
import { describeSendToController, isAlreadyPushed, type SendMode } from '@/engine/sendToController'
import {
  controllerProfileArtifactSignature,
  findProfileForLiveController,
} from '@/engine/controllerProfilePassRecipe'
import type { PreflightWarning } from '@/engine/preflight'
import type { RecommendedMapRemedy } from '@/engine/patternMapRemedy'
import { trackEvent } from '@/analytics'
import {
  PushConfirmPopover,
  PreflightWarningList,
  pushPopoverButton,
} from '@/components/PushConfirmPopover'

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

// The editor-header "Send to Controller" action (H9 #201 → H10 #202; save mode #236,
// run-vs-save selector #238). One verb that plays *or* saves the open pattern on the
// connected Controller: the extension compiles the bundled artifact to bytecode and the
// page frames it over the existing socket. A sticky text Run/Save selector (#238) picks run-only
// (play) vs persisted (save) mode; the button glyph/tooltip reflect it.
//
// A thin shell over the pure gates: `describeSendToController` decides enablement and
// `isAlreadyPushed` the mode-split dirty gate; `requestPush` pushes straight through (a
// pattern push has no preflight — #239 removed the misleading preview-vs-device count
// warning; the device runs the pattern on its own pixels + map).

export function SendToController() {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )
  const compileStatus = useEditorStore((s) => s.compileStatus)
  const previewSource = useEditorStore((s) => s.previewSource)
  // The open pattern's push identity — a user pattern by id, a demo by its `demo:`
  // key — so the dirty gate (and the push itself) work for demos without forking.
  const patternId = usePatternStore(activePushKey)
  // Target the active Controller (#210): the gate + label key off its entry.
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
  const requestPush = useControllerStore((s) => s.requestPush)
  const confirmPatternPush = useControllerStore((s) => s.confirmPatternPush)
  const confirmPatternPushWithMap = useControllerStore((s) => s.confirmPatternPushWithMap)
  const cancelPush = useControllerStore((s) => s.cancelPush)
  const preflight = useControllerStore((s) => s.preflight)
  const patternMapRemedy = useControllerStore((s) => s.patternMapRemedy)
  const patternPushBlocked = useControllerStore((s) => s.patternPushBlocked)
  const clearPushResult = useControllerStore((s) => s.clearPushResult)

  // Hold the just-pushed check on screen (button inert) for a few seconds, then let
  // it settle back to the idle arrow — which the dirty gate then keeps disabled
  // until the pattern is edited again.
  useEffect(() => {
    if (!pushResult) return
    const t = setTimeout(clearPushResult, 3500)
    return () => clearTimeout(t)
  }, [pushResult, clearPushResult])

  // Run and Save are distinct acts, so each direct action has its own dirty gate.
  const controllerProfile = active
    ? findProfileForLiveController(controllerProfiles, active)
    : null
  const profileSignature = controllerProfileArtifactSignature(
    controllerProfile,
    patternId,
    { mapDim: active?.mapDim ?? null },
  )
  const alreadyPushed = (mode: SendMode) => (
    !!activeIp &&
    !!patternId &&
    isAlreadyPushed({
      mode,
      source: previewSource,
      lastRunSource: lastPushedSource[activeIp]?.[patternId],
      lastSavedSource: lastSavedSource[activeIp]?.[patternId],
      profileSignature,
      lastRunProfileSignature: lastPushedProfileSignature[activeIp]?.[patternId],
      lastSavedProfileSignature: lastSavedProfileSignature[activeIp]?.[patternId],
    })
  )

  const runGate = describeSendToController({
    status,
    compileStatus,
    alreadyPushed: alreadyPushed('run'),
  })
  const saveGate = describeSendToController({
    status,
    compileStatus,
    alreadyPushed: alreadyPushed('save'),
  })
  const target = active ? active.nickname || activeIp : null

  const send = (mode: SendMode) => {
    setSaveArmed(mode === 'save')
    trackEvent('send_to_controller', {
      mode,
      pattern_key: patternId,
      controller_phase: active?.phase ?? status.kind,
    })
    void requestPush()
  }

  const deploymentActions = (
    <PatternDeploymentActions
      connected={status.kind === 'connected'}
      controllerName={target}
      runGate={runGate}
      saveGate={saveGate}
      activeMode={saveArmed ? 'save' : 'run'}
      pushing={pushing}
      pushResult={pushResult}
      density="compact"
      onConnect={requestControllerEntryOpen}
      onRun={() => send('run')}
      onSave={() => send('save')}
    />
  )

  // A clean exact Pattern push goes straight through. Cross-dimensional renderer plans
  // open this popover with their adapter/fallback and firmware status; supported or
  // unknown cases may proceed, while known unsupported firmware is blocked.
  const patternWarnings = (preflight ?? []).filter((warning) => warning.kind.startsWith('pattern-'))
  return (
    <span className="ml-2 inline-flex h-6 min-w-0 items-stretch">
      <PushConfirmPopover
        open={patternWarnings.length > 0}
        onCancel={cancelPush}
        title="Send pattern"
        testId="pattern-preflight-dialog"
        anchor={deploymentActions}
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
    </span>
  )
}
