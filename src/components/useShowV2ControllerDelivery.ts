import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { trackEvent } from '@/analytics'
import { assessShowCompilePressure } from '@/engine/showCompilePressure'
import { buildShowControllerCompatibilityContext } from '@/engine/showControllerCompatibilityContext'
import { prepareShowControllerArtifact, type PreparedShowControllerArtifact } from '@/engine/showControllerArtifact'
import { controllerProfileArtifactSignature, findProfileForLiveController } from '@/engine/controllerProfilePassRecipe'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { deliveredShowSourceBytes } from '@/engine/showSourceInventory'
import { isAlreadyPushed, type SendMode } from '@/engine/sendToController'
import { showDeliveryInvalidationMessage } from '@/engine/showControllerDelivery'
import { buildPreviewJpeg } from '@/engine/previewThumbnailJpeg'
import type { ShowPreparedStageBundleV2 } from '@/engine/showPreparedStageV2'
import type { ShowV2RouteArtifacts } from '@/engine/showV2RouteDelivery'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import {
  useControllerStore,
  type GeneratedArtifactControllerSession,
} from '@/store/controllerStore'
import { STOCK_MAPS, useMapStore } from '@/store/mapStore'
import { useShowControllerDelivery } from './useShowControllerDelivery'

/**
 * Publishes the v2 editor route's Send-to-Controller capability (#1056
 * slice 6), so the Controller panel's own action row drives a v2 record
 * exactly as it drives a v1 one.
 *
 * Preparation reads the same canonical `.epe` the export writes, compares it
 * against the connected Controller's observed map and firmware through the
 * landed comparison, and re-measures the prepared source because preparation
 * can append a renderer adapter. A delivery whose Controller session changed
 * between preparation and confirmation is refused rather than sent.
 */
export function useShowV2ControllerDelivery(input: {
  showId: string
  name: string
  bundle: ShowPreparedStageBundleV2 | null
  artifacts: ShowV2RouteArtifacts | null
  /** Why no delivery exists at all, when the record cannot be prepared. */
  blockedReason: string | null
}): { blocker: string | null; prepared: PreparedShowControllerArtifact | null } {
  const { showId, name, bundle, artifacts, blockedReason } = input
  const artifactId = `show:${showId}`
  const profiles = useControllerProfileStore((state) => state.profiles)
  const userMaps = useMapStore((state) => state.userMaps)
  const activeIp = useControllerStore((state) => state.activeIp)
  const activeController = useControllerStore((state) => (state.activeIp ? state.controllers[state.activeIp] : undefined))
  const pushing = useControllerStore((state) => state.pushing)
  const pushGeneratedArtifact = useControllerStore((state) => state.pushGeneratedArtifact)
  const reportArtifactPushFailure = useControllerStore((state) => state.reportArtifactPushFailure)
  const clearArtifactPushResult = useControllerStore((state) => state.clearArtifactPushResult)
  const pushResult = useControllerStore((state) => (
    state.artifactPushResult?.artifactId === artifactId ? state.artifactPushResult : null
  ))
  const lastPushedSource = useControllerStore((state) => state.lastPushedSource)
  const lastSavedSource = useControllerStore((state) => state.lastSavedSource)
  const lastPushedProfileSignature = useControllerStore((state) => state.lastPushedProfileSignature)
  const lastSavedProfileSignature = useControllerStore((state) => state.lastSavedProfileSignature)
  const lastRunProgramId = useControllerStore((state) => state.lastRunProgramId)
  const activeProgramId = useControllerPanelStore((state) => state.activeProgramId)

  const [mode, setMode] = useState<SendMode>('run')
  // The delivery a warning confirmation is waiting on. It is state, not a ref,
  // because the published capability describes it every render.
  const [pending, setPending] = useState<{ mode: SendMode; delivery: ShowV2DeliverySnapshot } | null>(null)
  const [preparingSave, setPreparingSave] = useState(false)
  const snapshotRef = useRef<ShowV2DeliverySnapshot | null>(null)

  const activeProfile = useMemo(() => (
    activeController ? findProfileForLiveController(profiles, activeController) ?? undefined : profiles[0]
  ), [activeController, profiles])
  const installedMap = activeController?.phase === 'live'
    ? activeController.installedMap
    : activeProfile?.lastKnownInstalledMap
  const compatibility = useMemo(
    () => buildShowControllerCompatibilityContext(activeProfile, userMaps, installedMap, STOCK_MAPS),
    [activeProfile, installedMap, userMaps],
  )

  const prepared = useMemo(
    () => prepareForController(artifacts, activeController?.mapDim ?? null, activeController?.firmwareVersion, compatibility),
    [activeController?.firmwareVersion, activeController?.mapDim, artifacts, compatibility],
  )

  const controllerStatus = getControllerProvider().getStatus()
  const connectedId = controllerStatus.kind === 'connected' ? controllerStatus.controller.id : null
  const connectedAddress = controllerStatus.kind === 'connected' ? controllerStatus.controller.address : null
  const liveEpoch = activeController?.liveEpoch ?? 0
  const session = useMemo<GeneratedArtifactControllerSession | null>(() => (
    connectedId && connectedAddress ? { id: connectedId, address: connectedAddress, liveEpoch } : null
  ), [connectedAddress, connectedId, liveEpoch])

  const snapshot = useMemo<ShowV2DeliverySnapshot | null>(() => (
    bundle && artifacts && session && prepared.value
      ? { showId, name, controllerIp: activeIp, controllerSession: session, artifacts, bundle, prepared: prepared.value }
      : null
  ), [activeIp, artifacts, bundle, name, prepared.value, session, showId])

  useLayoutEffect(() => {
    snapshotRef.current = snapshot
    return () => { snapshotRef.current = null }
  }, [snapshot])
  // A confirmation pinned to a delivery the route has superseded cannot be
  // confirmed, so it is not offered as pending either.
  const activePending = pending && pending.delivery === snapshot ? pending : null

  const blocker = blockedReason ?? prepared.error ?? (snapshot ? null : 'Show is not ready to send')
  const preparedSource = prepared.value?.source ?? ''
  const profileSignature = controllerProfileArtifactSignature(activeProfile, artifactId, {
    mapDim: activeController?.mapDim ?? null,
  })
  const alreadySent = (sendMode: SendMode) => isAlreadyPushed({
    mode: sendMode,
    source: preparedSource,
    lastRunSource: activeIp ? lastPushedSource[activeIp]?.[artifactId] : undefined,
    lastSavedSource: activeIp ? lastSavedSource[activeIp]?.[artifactId] : undefined,
    profileSignature,
    lastRunProfileSignature: activeIp ? lastPushedProfileSignature[activeIp]?.[artifactId] : undefined,
    lastSavedProfileSignature: activeIp ? lastSavedProfileSignature[activeIp]?.[artifactId] : undefined,
    lastRunProgramId: activeIp ? lastRunProgramId[activeIp]?.[artifactId] : undefined,
    activeProgramId,
  })

  const invalidationMessage = (delivery: ShowV2DeliverySnapshot): string | null => {
    const controllerState = useControllerStore.getState()
    const deliveryController = delivery.controllerIp ? controllerState.controllers[delivery.controllerIp] : undefined
    return showDeliveryInvalidationMessage({
      controllerIp: delivery.controllerIp,
      activeIp: controllerState.activeIp,
      phase: deliveryController?.phase,
      liveEpoch: deliveryController?.liveEpoch ?? 0,
      expectedLiveEpoch: delivery.controllerSession.liveEpoch,
      currentSnapshot: delivery === snapshotRef.current && delivery.showId === showId,
    })
  }

  const send = async (sendMode: SendMode, delivery: ShowV2DeliverySnapshot | null) => {
    if (!delivery) { setPending(null); return }
    const invalid = invalidationMessage(delivery)
    if (invalid) {
      reportArtifactPushFailure({ ok: false, message: invalid, artifactId: `show:${delivery.showId}`, mode: sendMode })
      setPending(null)
      return
    }
    setPending(null)
    setMode(sendMode)
    setPreparingSave(sendMode === 'save')
    try {
      const previewImage = sendMode === 'save'
        ? (await buildPreviewJpeg(delivery.bundle.artifact).catch(() => null)) ?? undefined
        : undefined
      const stillValid = invalidationMessage(delivery)
      if (stillValid) {
        reportArtifactPushFailure({ ok: false, message: stillValid, artifactId: `show:${delivery.showId}`, mode: sendMode })
        return
      }
      trackEvent('send_to_controller', {
        mode: sendMode,
        pattern_key: `show:${delivery.showId}`,
        controller_phase: activeController?.phase ?? controllerStatus.kind,
      })
      await pushGeneratedArtifact({
        artifactId: `show:${delivery.showId}`,
        source: delivery.prepared.source,
        name: delivery.name,
        persist: sendMode === 'save',
        compilePressure: {
          budgetBytes: delivery.bundle.artifact.summary.measuredDeviceBudgetBytes,
          worstInstantRenderersPerPixel: delivery.bundle.artifact.summary.worstInstantRenderersPerPixel,
        },
        artifactStamp: delivery.prepared.artifactStamp,
        expectedControllerSession: delivery.controllerSession,
        ...(previewImage ? { previewImage } : {}),
      })
    } finally {
      setPreparingSave(false)
    }
  }

  useShowControllerDelivery({
    subject: {
      kind: 'show',
      id: showId,
      name,
      deliveryBlocker: blocker,
      runAlreadyPushed: alreadySent('run'),
      saveAlreadyPushed: alreadySent('save'),
    },
    mode,
    pushing: pushing || preparingSave,
    succeeded: Boolean(pushResult?.ok),
    failure: pushResult && !pushResult.ok ? pushResult : null,
    dismissFailure: clearArtifactPushResult,
    pending: activePending !== null,
    warnings: activePending?.delivery.prepared.warnings ?? prepared.value?.warnings ?? [],
    blocked: activePending?.delivery.prepared.blocked ?? prepared.value?.blocked ?? true,
    request: (sendMode) => {
      if (!snapshot) return
      setMode(sendMode)
      if (snapshot.prepared.warnings.length > 0) {
        setPending({ mode: sendMode, delivery: snapshot })
        return
      }
      void send(sendMode, snapshot)
    },
    confirm: async () => { if (activePending) await send(activePending.mode, activePending.delivery) },
    cancel: () => setPending(null),
  })

  return { blocker, prepared: prepared.value }
}

/**
 * What the Controller receives for this artifact, or why it cannot: the landed
 * preparation, then a re-measure, because preparation can append a renderer
 * adapter and change the delivered byte count.
 */
function prepareForController(
  artifacts: ShowV2RouteArtifacts | null,
  mapDim: 1 | 2 | 3 | null,
  firmwareVersion: string | undefined,
  compatibility: ReturnType<typeof buildShowControllerCompatibilityContext>,
): { value: PreparedShowControllerArtifact | null; error: string | null } {
  if (!artifacts) return { value: null, error: null }
  try {
    const value = prepareShowControllerArtifact(artifacts.epe.source, mapDim, firmwareVersion, compatibility)
    const pressure = assessShowCompilePressure({
      deliveredSourceBytes: deliveredShowSourceBytes(value.source),
      budgetBytes: artifacts.budgetBytes,
      worstInstantRenderersPerPixel: 0,
    })
    if (pressure.status === 'blocked') return { value: null, error: pressure.blocks.join(' ') }
    return { value, error: null }
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : 'Could not prepare Show for Controller' }
  }
}

interface ShowV2DeliverySnapshot {
  showId: string
  name: string
  controllerIp: string | null
  controllerSession: GeneratedArtifactControllerSession
  artifacts: ShowV2RouteArtifacts
  bundle: ShowPreparedStageBundleV2
  prepared: PreparedShowControllerArtifact
}
