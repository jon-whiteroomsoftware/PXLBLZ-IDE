import { afterEach, expect, it, vi } from 'vitest'
import { importSavedControllerPattern } from './controllerPatternImportActions'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import { demoPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { demoControllerMetadataStorage, resetControllerMetadataStorage, setControllerMetadataStorage } from '@/engine/controllerMetadataStorage'
import { useControllerStore, controllerInitialState } from './controllerStore'
import { defaultControllerProfile, useControllerProfileStore, controllerProfileInitialState } from './controllerProfileStore'
import { patternInitialState, usePatternStore } from './patternStore'
import { useWorkspaceStore, workspaceInitialState } from './workspaceStore'
import { makeProgramId } from '@/engine/bytecodePush'
import { decodePbp, encodePbp } from '@/engine/pbpEncode'
import { recoverSavedProgram } from '@/engine/controllerSavedProgramRead'
import { stampArtifact } from '@/engine/artifactStamp'
import { bundleWithPasses } from '@/engine/passEngine'
import { controllerProfilePassRecipe } from '@/engine/controllerProfilePassRecipe'
import { createControllerPatternImportPlan, assessControllerPatternImport, readControllerPatternImportLedger } from '@/engine/controllerPatternImport'
import type { PatternRecord } from '@/engine/personalContentRecords'
import type { BindingStore } from '@/engine/controllerBinding'
import type { ControllerPushRecords } from '@/engine/controllerPushRecord'
import { queueControllerProfileWrite } from '@/engine/controllerProfileWriteQueue'
import { DEMOS } from '@/pixelblaze/stock/patterns'

const ip = '192.0.2.1'
const deviceId = 'pixelblaze_pb32_000000000abc'
const slot = makeProgramId(() => 0)
const source = 'export function render(i) { rgb(0.8, 0.4, 0.2) }'
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function fixture(authored = false) {
  const profile = defaultControllerProfile({ id: 'profile', deviceId, now: 1 })
  profile.inputs = [{ id: 'pot', name: 'Pot', pin: 35, signal: 'analog', smoothing: 1, fallback: 0.25, invert: false }]
  profile.globalTransforms = profile.globalTransforms.map((t) => t.type === 'hardware-brightness'
    ? { ...t, enabled: true, inputId: 'pot' } : t)
  const body = authored ? bundleWithPasses(source, {}, []).code : source
  const bytes = encodePbp({ id: slot, name: 'Origin', byteCode: new Uint8Array(8),
    sourceCode: stampArtifact(body, { kind: 'pattern', id: 'origin', name: 'Origin', transforms: authored ? [] : ['hardware-brightness'] }) })
  const programs = new Map([[slot, bytes], ['unrelated', bytes.slice()]])
  class Provider extends NullControllerProvider {
    status: ControllerStatus = { kind: 'connected', controller: { id: ip, address: ip, deviceId } }
    getStatus() { return this.status }
    compile = vi.fn(async (_source: string) => new Uint8Array(8))
    saveProgram = vi.fn(async (pbp: Uint8Array, target: { id: string }) => { programs.set(target.id, pbp.slice()) })
    getActiveProgramBytecodeSize = vi.fn(async () => 8)
    pushBytecode = vi.fn(async () => {})
    readSavedProgram = vi.fn(async (id: string) => {
      const result = recoverSavedProgram(id, programs.get(id)!)
      return result.ok ? result.value : null
    })
  }
  const provider = new Provider()
  const origin: PatternRecord = { id: 'origin', name: 'Origin', src: source, controls: {}, updatedAt: 1 }
  const accounts = new Map([[origin.id, origin]])
  let ledger = readControllerPatternImportLedger(undefined)
  let bindings: BindingStore = {}
  let pushRecords: ControllerPushRecords = {}
  const storage = { ...demoControllerMetadataStorage, id: 'account',
    getPatternImports: vi.fn(async () => structuredClone(ledger)),
    setPatternImports: vi.fn(async (next: typeof ledger) => { ledger = structuredClone(next) }),
    getControllerBindings: vi.fn(async () => structuredClone(bindings)),
    setControllerBindings: vi.fn(async (next: BindingStore) => { bindings = structuredClone(next) }),
    getPushRecords: vi.fn(async () => structuredClone(pushRecords)),
    setPushRecords: vi.fn(async (next: ControllerPushRecords) => { pushRecords = structuredClone(next) }),
  }
  const personal = { ...demoPersonalContentProvider, id: 'account',
    listPatterns: vi.fn(async () => structuredClone([...accounts.values()])),
    createPattern: vi.fn(async (record: PatternRecord) => { accounts.set(record.id, structuredClone(record)) }),
    listControllerProfiles: vi.fn(async () => [structuredClone(profile)]),
  }
  setControllerProvider(provider)
  setPersonalContentProvider(personal)
  setControllerMetadataStorage(storage)
  useWorkspaceStore.setState({ personalWorkspaceAuthenticated: true })
  usePatternStore.setState({ userPatterns: [origin] })
  useControllerProfileStore.setState({ profiles: [profile] })
  useControllerStore.setState({ activeIp: ip, controllers: { [ip]: { ip, deviceId, phase: 'live', liveEpoch: 1, mapDim: 1 } } })
  const input = { profileId: profile.id, controllerId: ip, controllerDeviceId: 'pixelblaze_pb32_abc', programId: slot, assertViewCurrent: vi.fn() }
  return { profile, provider, personal, storage, input, accounts, programs, bytes,
    ledger: () => ledger, bindings: () => bindings,
    setLedger: (next: typeof ledger) => { ledger = next } }
}
afterEach(() => {
  resetControllerProvider(); resetPersonalContentProvider(); resetControllerMetadataStorage()
  useWorkspaceStore.setState(workspaceInitialState)
  usePatternStore.setState(patternInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  useControllerStore.setState(controllerInitialState)
})

it('imports exact slot bytes to a fresh editable Pattern and merges without another POST', async () => {
  const f = fixture()
  const result = await importSavedControllerPattern(f.input)
  expect(result.patternId).not.toBe('origin')
  expect(f.accounts.size).toBe(2)
  expect(f.programs.size).toBe(2)
  expect(f.programs.get(slot)).toEqual(f.bytes)
  expect(f.accounts.get(result.patternId)?.src).toBe(decodePbp(f.bytes)!.sourceCode)
  expect(f.bindings()[ip][result.patternId]).toBe(slot)
  expect(f.ledger().byPatternId[result.patternId]).toMatchObject({ sourceMode: 'stored-artifact', stage: 'complete', controllerDeviceId: deviceId })
  expect(usePatternStore.getState().userPatterns.map((p) => p.id)).toEqual([result.patternId, 'origin'])
  expect(f.personal.createPattern).toHaveBeenCalledTimes(1)
  usePatternStore.setState({ userPatterns: [] })
  expect(await importSavedControllerPattern(f.input)).toEqual(result)
  expect(usePatternStore.getState().userPatterns.map((p) => p.id)).toEqual([result.patternId])
  expect(f.personal.createPattern).toHaveBeenCalledTimes(1)
})

it('recovers exact canonical personal source and applies the current profile', async () => {
  const f = fixture(true)
  const result = await importSavedControllerPattern(f.input)
  expect(f.ledger().byPatternId[result.patternId].sourceMode).toBe('authored-verified')
  expect(f.accounts.get(result.patternId)?.src).toBe(source)
  const recipe = controllerProfilePassRecipe(f.profile, source, result.patternId)
  expect(recipe.length).toBeGreaterThan(0)
  expect(f.provider.compile.mock.calls[0][0]).toContain('analogRead(35)')
})

it.each([false, true])('imports a fresh destination for demo provenance (canonical=%s)', async (canonical) => {
  const f = fixture()
  const body = canonical ? bundleWithPasses(DEMOS.TestPattern1D, {}, []).code : source
  const bytes = encodePbp({ id: slot, name: 'Stock origin', byteCode: new Uint8Array(8),
    sourceCode: stampArtifact(body, { kind: 'pattern', id: 'demo:TestPattern1D', name: 'Test Pattern 1D',
      transforms: canonical ? [] : ['hardware-brightness'] }) })
  f.programs.set(slot, bytes)
  const result = await importSavedControllerPattern(f.input)
  expect(result.patternId).not.toBe('demo:TestPattern1D')
  expect(result.patternId).not.toBe('TestPattern1D')
  expect(f.accounts.size).toBe(2)
  expect(f.personal.createPattern).toHaveBeenCalledTimes(1)
  expect(f.bindings()[ip][result.patternId]).toBe(slot)
  expect(f.ledger().byPatternId[result.patternId]).toMatchObject({
    stage: 'complete', sourceMode: canonical ? 'authored-verified' : 'stored-artifact',
  })
  if (!canonical) expect(f.programs.get(slot)).toEqual(bytes)
})

it('never treats a stored-artifact personal origin as authored recovery', async () => {
  const f = fixture(true)
  const assessment = await assessControllerPatternImport({ programId: slot, pbp: f.bytes })
  if (!assessment.ok) throw new Error(assessment.message)
  const plan = await createControllerPatternImportPlan({ assessment, patternId: 'origin',
    controllerDeviceId: 'another-device', programId: slot, now: 1, existingNames: [] })
  f.setLedger({ version: 1, byPatternId: { origin: plan.receipt } })
  const result = await importSavedControllerPattern(f.input)
  expect(f.ledger().byPatternId[result.patternId].sourceMode).toBe('stored-artifact')
  expect(f.provider.compile).not.toHaveBeenCalled()
  expect(f.programs.get(slot)).toEqual(f.bytes)
})

it.each(['provider', 'epoch', 'map', 'personal', 'metadata', 'auth', 'view'] as const)(
  'retires deferred profile work on changed %s before any mutation', async (change) => {
    const f = fixture(true)
    const loaded = deferred<ReturnType<typeof f.personal.listControllerProfiles> extends Promise<infer P> ? P : never>()
    const entered = deferred<void>()
    f.personal.listControllerProfiles.mockImplementation(async () => { entered.resolve(); return loaded.promise })
    const pending = importSavedControllerPattern(f.input)
    await entered.promise
    if (change === 'provider') setControllerProvider(new NullControllerProvider())
    if (change === 'epoch' || change === 'map') useControllerStore.setState((state) => ({ controllers: {
      [ip]: { ...state.controllers[ip], ...(change === 'epoch' ? { liveEpoch: 2 } : { mapDim: 2 }) },
    } }))
    if (change === 'personal') setPersonalContentProvider({ ...f.personal })
    if (change === 'metadata') setControllerMetadataStorage({ ...f.storage })
    if (change === 'auth') useWorkspaceStore.setState({ personalWorkspaceAuthenticated: false })
    if (change === 'view') f.input.assertViewCurrent.mockImplementation(() => { throw new Error('retired view') })
    loaded.resolve([f.profile])
    await expect(pending).rejects.toThrow('Controller session or account changed. Retry on the same Controller.')
    expect(f.personal.createPattern).not.toHaveBeenCalled()
    expect(f.provider.saveProgram).not.toHaveBeenCalled()
    expect(f.storage.setPatternImports).not.toHaveBeenCalled()
    expect(f.accounts.size).toBe(1)
    expect(f.programs.get(slot)).toEqual(f.bytes)
  })

it('guards after the durable profile-write barrier', async () => {
  const f = fixture(true)
  const barrier = deferred<void>()
  const entered = deferred<void>()
  const queued = queueControllerProfileWrite(f.profile.id, async () => { entered.resolve(); await barrier.promise })
  await entered.promise
  const pending = importSavedControllerPattern(f.input)
  f.input.assertViewCurrent.mockImplementation(() => { throw new Error('retired') })
  barrier.resolve()
  await queued
  await expect(pending).rejects.toThrow('Controller session or account changed')
  expect(f.provider.saveProgram).not.toHaveBeenCalled()
})

it('requires the captured connected provider to name the selected transport address', async () => {
  const f = fixture()
  f.provider.status = { kind: 'connected', controller: { id: 'different', address: '192.0.2.2', deviceId } }
  await expect(importSavedControllerPattern(f.input)).rejects.toThrow('Controller session or account changed')
  expect(f.provider.readSavedProgram).not.toHaveBeenCalled()
  expect(f.provider.saveProgram).not.toHaveBeenCalled()
})
