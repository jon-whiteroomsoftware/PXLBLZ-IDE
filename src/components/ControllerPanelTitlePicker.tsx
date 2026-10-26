import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { describeSwitchGate } from '@/engine/controllerActionRow'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { findProfileForLiveController } from '@/engine/controllerProfilePassRecipe'
import { describeControllerSavedPrograms } from '@/engine/controllerSavedPrograms'
import {
  getControllerBindings,
  getControllerPushRecordsRevision,
  subscribeControllerPushRecordsRevision,
} from '@/engine/controllerMetadataStorage'
import type { BindingStore } from '@/engine/controllerBinding'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useRouterStore } from '@/store/routerStore'
import { useShowControllerDeliveryStore } from '@/store/showControllerDeliveryStore'
import { ControllerPanelTitle } from './ControllerPanelTitle'
import { ControllerProgramSwitch } from './ControllerProgramSwitch'

const EMPTY_PROGRAMS: ProgramListEntry[] = []

export function ControllerPanelTitlePicker() {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    onChange => provider.subscribe(onChange),
    () => provider.getStatus(),
  )
  const activeIp = useControllerStore(state => state.activeIp)
  const currentEntry = useControllerStore(state => state.activeIp ? state.controllers[state.activeIp] : undefined)
  const pushing = useControllerStore(state => state.pushing)
  const pushResult = useControllerStore(state => state.pushResult)
  const activeProgramId = useControllerPanelStore(state => state.activeProgramId)
  const programsByController = useControllerPanelStore(state => state.programsByController)
  const programs = activeIp ? programsByController[activeIp] ?? EMPTY_PROGRAMS : EMPTY_PROGRAMS
  const programsRead = !!activeIp && Object.prototype.hasOwnProperty.call(programsByController, activeIp)
  const profiles = useControllerProfileStore(state => state.profiles)
  const profile = currentEntry ? findProfileForLiveController(profiles, currentEntry) : null
  const route = useRouterStore(state => state.route)
  const publishedShow = useShowControllerDeliveryStore(state => state.delivery)
  const showDelivery = route.kind === 'studio' && route.entity?.kind === 'shows'
    && publishedShow?.subject.id === route.entity.id ? publishedShow : null
  const working = showDelivery
    ? showDelivery.pushing || showDelivery.succeeded
    : pushing || !!pushResult?.ok
  const revision = useSyncExternalStore(subscribeControllerPushRecordsRevision, getControllerPushRecordsRevision)
  // Snapshot identity includes the live session and inventory. Until a matching
  // read arrives, the menu can open as an unclassified device inventory.
  const scope = useMemo(() => ({ controllerId: activeIp ?? '', epoch: currentEntry?.liveEpoch, provider, profile, programs }), [activeIp, currentEntry?.liveEpoch, provider, profile, programs])
  const generation = useRef(0)
  const [snapshot, setSnapshot] = useState<{ scope: typeof scope; bindings: BindingStore } | null>(null)
  const refresh = useCallback(() => {
    const request = ++generation.current
    void getControllerBindings().then(bindings => {
      if (generation.current === request) setSnapshot({ scope, bindings })
    }, () => {
      if (generation.current === request) setSnapshot(null)
    })
  }, [scope])
  useEffect(() => {
    refresh()
    return () => { generation.current += 1 }
  }, [refresh, revision])
  const ownedProgramIds = useMemo(() => (
    profile && snapshot?.scope === scope
      ? describeControllerSavedPrograms({
          controllerId: scope.controllerId,
          programs,
          bindings: snapshot.bindings,
          profile,
          mapDim: currentEntry?.mapDim ?? null,
          studioPatterns: [],
          pushRecords: {},
        }).owned.map(row => row.programId)
      : []
  ), [profile, snapshot, scope, programs, currentEntry?.mapDim])
  const gate = describeSwitchGate({
    status,
    working,
    programsRead,
    programCount: programs.length,
    hasRunOnlyActive: programsRead && !!activeProgramId && !programs.some(program => program.id === activeProgramId),
  })

  return <ControllerProgramSwitch gate={gate} programs={programs} controllerId={activeIp ?? ''} ownedProgramIds={ownedProgramIds} onOpen={refresh}>
    <ControllerPanelTitle />
  </ControllerProgramSwitch>
}
