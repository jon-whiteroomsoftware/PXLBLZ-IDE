import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { getControllerMetadataStorage } from '@/engine/controllerMetadataStorage'
import { canonicalControllerDeviceId, sameControllerDeviceId } from '@/engine/controllerIdentity'
import { statusMatchesConnectedController } from '@/engine/ControllerProvider'
import { importControllerPattern } from '@/engine/controllerPatternImportExecution'
import { controllerPatternImportPolicy, readControllerPatternImportLedger } from '@/engine/controllerPatternImport'
import { controllerProfileArtifactSignature } from '@/engine/controllerProfilePassRecipe'
import { waitForControllerProfileWrites } from '@/engine/controllerProfileWriteQueue'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { artifactHash } from '@/engine/artifactStamp'
import { compileLibraries } from '@/engine/libraries'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { useControllerStore } from './controllerStore'
import { useControllerProfileStore } from './controllerProfileStore'
import { useWorkspaceStore } from './workspaceStore'
import { useLibraryStore } from './libraryStore'
import { usePatternStore } from './patternStore'

export type SavedControllerPatternImportInput = {
  profileId: string; controllerId: string; controllerDeviceId: string; programId: string
  assertViewCurrent: () => void
}

/** Capture the host capabilities once; the engine owns the durable transaction. */
export async function importSavedControllerPattern(input: SavedControllerPatternImportInput): Promise<{
  patternId: string; programId: string; complete: true
}> {
  const provider = getControllerProvider()
  const personalContent = getPersonalContentProvider()
  const metadataStorage = getControllerMetadataStorage()
  const live = useControllerStore.getState().controllers[input.controllerId]
  const epoch = live?.liveEpoch
  const mapDim = live?.mapDim ?? null
  const status = provider.getStatus()
  const deviceId = canonicalControllerDeviceId(input.controllerDeviceId)
  const authenticated = useWorkspaceStore.getState().personalWorkspaceAuthenticated
  const assertCurrent = () => {
    const current = useControllerStore.getState()
    const entry = current.controllers[input.controllerId]
    const profile = useControllerProfileStore.getState().profiles.find((p) => p.id === input.profileId)
    const currentStatus = provider.getStatus()
    try {
      input.assertViewCurrent()
      if (!authenticated || !useWorkspaceStore.getState().personalWorkspaceAuthenticated
        || getControllerProvider() !== provider || getPersonalContentProvider() !== personalContent
        || getControllerMetadataStorage() !== metadataStorage || personalContent.id === 'demo'
        || metadataStorage.id === 'demo' || current.activeIp !== input.controllerId
        || !entry || entry.phase !== 'live' || entry.liveEpoch !== epoch || (entry.mapDim ?? null) !== mapDim
        || !sameControllerDeviceId(entry.deviceId, deviceId) || !sameControllerDeviceId(profile?.deviceId, deviceId)
        || status.kind !== 'connected' || currentStatus.kind !== 'connected'
        || currentStatus.controller.address !== input.controllerId
        || !statusMatchesConnectedController(status.controller, currentStatus)
        || !sameControllerDeviceId(currentStatus.controller.deviceId, deviceId)) throw new Error('Invalidated import')
    } catch {
      throw new Error('Controller session or account changed. Retry on the same Controller.')
    }
  }
  const read = async <T>(action: () => Promise<T>) => {
    assertCurrent()
    try { return await action() } finally { assertCurrent() }
  }
  const signature = (patternId: string) => {
    assertCurrent()
    const profile = useControllerProfileStore.getState().profiles.find((p) => p.id === input.profileId)!
    return controllerProfileArtifactSignature(profile, patternId, { mapDim })
  }
  const libraries = compileLibraries(LIBRARIES, useLibraryStore.getState().userLibraries)
  assertCurrent()
  let published = false
  const publish = (record: Awaited<ReturnType<typeof personalContent.listPatterns>>[number]) => {
    assertCurrent()
    usePatternStore.setState((state) => ({ userPatterns: state.userPatterns.some((p) => p.id === record.id)
      ? state.userPatterns.map((p) => p.id === record.id ? record : p) : [record, ...state.userPatterns] }))
    published = true
  }
  const result = await importControllerPattern({ programId: input.programId, controllerDeviceId: deviceId }, {
    provider, personalContent, metadataStorage, controllerId: input.controllerId,
    mapDim, firmwareVersion: live?.firmwareVersion, libraries, assertCurrent,
    allocatePatternId: newPersonalContentId, now: Date.now, waitForProfileWrites: waitForControllerProfileWrites,
    loadProfile: async (patternId) => {
      const profiles = await read(() => personalContent.listControllerProfiles())
      const profile = profiles.find((p) => p.id === input.profileId)
      if (!profile || !sameControllerDeviceId(profile.deviceId, deviceId)) throw new Error('Controller profile could not be confirmed')
      return { profile, signature: controllerProfileArtifactSignature(profile, patternId, { mapDim }) }
    },
    assertProfileCurrent: (patternId, expected) => {
      if (signature(patternId) !== expected) throw new Error('Controller profile changed')
    },
    resolveKnownSource: async (saved) => {
      const banner = saved.stamp
      if (!banner || banner.kind !== 'pattern' || !saved.storedArtifact
        || banner.hash !== artifactHash(saved.storedArtifact.sourceCode)) return undefined
      if (banner.id.startsWith('demo:')) {
        const name = banner.id.slice(5)
        return Object.prototype.hasOwnProperty.call(DEMOS, name) ? { originId: banner.id, source: DEMOS[name], libraries } : undefined
      }
      const records = await read(() => personalContent.listPatterns())
      const candidate = records.find((p) => p.id === banner.id)
      if (!candidate) return undefined
      if (!metadataStorage.getPatternImports) throw new Error('Controller import storage is unavailable')
      const ledger = readControllerPatternImportLedger(await read(() => metadataStorage.getPatternImports!()))
      return controllerPatternImportPolicy(ledger, candidate.id).applyProfile
        ? { originId: candidate.id, source: candidate.src, libraries } : undefined
    },
    onPatternVerified: publish,
  })
  assertCurrent()
  if (!published) {
    const record = (await read(() => personalContent.listPatterns())).find((p) => p.id === result.patternId)
    if (!record) throw new Error('Imported Pattern could not be read')
    publish(record)
  }
  return result
}
