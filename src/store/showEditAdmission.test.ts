// @vitest-environment jsdom
import { createDefaultShow } from '@/engine/showModel'
import { applyShowCommand } from '@/engine/showCommands/registry'
import { buildShowFileBundle, parseShowFileBundle } from '@/engine/showFileBundle'
import { validateShowAuthoring } from '@/engine/showAuthoringValidation'
import { setPersonalContentProvider, resetPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { showCommandFixture } from '@/test/showCommandFixture'
import { showInitialState, useShowStore } from './showStore'

function providerFor(show: ShowRecord) {
  const records = new Map([[show.id, structuredClone(show)]])
  const updateShow = vi.fn(async (id: string, changes: Partial<ShowRecord>) => { records.set(id, { ...records.get(id)!, ...changes }) })
  const provider = {
    listShows: async () => [...records.values()], updateShow,
    deleteShow: async (id: string) => { records.delete(id) },
    createShow: async (record: ShowRecord) => { records.set(record.id, record) },
    setLastActive: async () => {},
  } as unknown as PersonalContentProvider
  setPersonalContentProvider(provider)
  return { records, updateShow, provider }
}
const intent = (operationId = 'op') => ({ operationId, payloadKey: 'rename', referenceContext: 'original', targets: ['target'] })
const state = () => useShowStore.getState()
const snapshot = () => structuredClone({ shows: state().shows, histories: state().showHistories, drafts: state().stockShowDrafts, failure: state().showSaveFailure })
const evaluate = (show: ShowRecord) => ({ ...show, name: 'Agent' })
const validate = () => true

beforeEach(() => { useShowStore.setState(showInitialState); resetPersonalContentProvider() })
afterEach(() => { resetPersonalContentProvider() })

it('refuses a stale request without touching the complete document, history or provider', async () => {
  const show = createDefaultShow('admission', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  await state().updateShow(show.id, { ...state().resolveEditableShow(show.id)!, name: 'Manual' })
  const before = snapshot()
  const result = state().admitShowEdit(pending.request, evaluate, validate)
  expect(result).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).toHaveBeenCalledTimes(1)
  expect(provider.records.get(show.id)?.name).toBe('Manual')
})

it.each(['hydrate', 'remove', 'undo', 'redo', 'aba'] as const)('invalidates pending work across %s', async (action) => {
  const show = createDefaultShow(`admission-${action}`, 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  await state().updateShow(show.id, { ...state().resolveEditableShow(show.id)!, name: 'Earlier' })
  if (action === 'redo') await state().undoShow(show.id)
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  if (action === 'hydrate') await state().loadShows()
  if (action === 'remove') await state().removeShow(show.id)
  if (action === 'undo') await state().undoShow(show.id)
  if (action === 'redo') await state().redoShow(show.id)
  if (action === 'aba') {
    await state().updateShow(show.id, { ...state().resolveEditableShow(show.id)!, name: 'Temporary' })
    await state().undoShow(show.id)
  }
  const before = snapshot()
  const writes = provider.updateShow.mock.calls.length
  expect(state().admitShowEdit(pending.request, evaluate, validate).status).toBe('refused')
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).toHaveBeenCalledTimes(writes)
})

it.each(['reset', 'undo', 'redo'] as const)('invalidates stock work across %s with no provider write', async (action) => {
  const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
  const show = STOCK_SHOWS[0].show
  const provider = providerFor(createDefaultShow('unrelated', 'Unrelated'))
  await state().updateShow(show.id, { ...show, name: 'Draft' })
  if (action === 'redo') await state().undoShow(show.id)
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  if (action === 'reset') state().resetStockShowDraft(show.id)
  if (action === 'undo') await state().undoShow(show.id)
  if (action === 'redo') await state().redoShow(show.id)
  const before = snapshot()
  expect(state().admitShowEdit(pending.request, evaluate, validate).status).toBe('refused')
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})

it('retires an editor session on explicit departure while a same-id reopen cannot revive it', async () => {
  const show = createDefaultShow('departure', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  await state().openShow(show.id)
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  await state().openShow(null)
  await state().openShow(show.id)
  const before = snapshot()
  expect(state().admitShowEdit(pending.request, evaluate, validate).status).toBe('retired')
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})

function deferred() {
  let resolve!: () => void
  let reject!: (cause: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

it('adopts once synchronously, records one complete history step and joins duplicates before and after save', async () => {
  const show = createDefaultShow('once', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  await state().updateShow(show.id, { ...state().resolveEditableShow(show.id)!, name: 'Manual' })
  const before = snapshot()
  const gate = deferred()
  const persist = provider.updateShow.getMockImplementation()!
  provider.updateShow.mockImplementationOnce(async (id, changes) => { await gate.promise; await persist(id, changes) })
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  expect(state().beginShowEdit(session, intent())).toBe(pending)
  const result = state().admitShowEdit(pending.request, evaluate, validate)
  expect(result).toMatchObject({ status: 'applied', settlement: 'saving' })
  const adopted = snapshot()
  expect(adopted.histories[show.id]).toEqual({ past: [...before.histories[show.id].past, before.shows[0]], future: [] })
  expect(adopted.shows[0]).toEqual({ ...before.shows[0], name: 'Agent', updatedAt: expect.any(Number) })
  expect(adopted.shows[0].updatedAt).toBeGreaterThan(before.shows[0].updatedAt)
  const mustNotEvaluate = vi.fn(() => { throw new Error('Duplicate evaluated') })
  expect(state().admitShowEdit(pending.request, mustNotEvaluate, validate)).toBe(result)
  expect(snapshot()).toEqual(adopted)
  gate.resolve()
  await vi.waitFor(() => expect(state().readShowEdit(session, 'op')?.settlement).toBe('saved'))
  expect(state().admitShowEdit(pending.request, mustNotEvaluate, validate).settlement).toBe('saved')
  expect(mustNotEvaluate).not.toHaveBeenCalled()
  expect(provider.updateShow).toHaveBeenCalledTimes(2)
  expect(provider.records.get(show.id)).toEqual({ ...adopted.shows[0], composition: null, stageMapId: null })
  await state().undoShow(show.id)
  expect(state().resolveEditableShow(show.id)).toEqual({ ...before.shows[0], updatedAt: expect.any(Number) })
  expect(state().showHistories[show.id]).toEqual({ past: before.histories[show.id].past, future: adopted.shows })
  await state().redoShow(show.id)
  const redone = state().resolveEditableShow(show.id)!
  await state().loadShows()
  expect(state().resolveEditableShow(show.id)).toEqual(redone)
})

it('admits, saves, undoes, redoes and reopens the exact four-Layer Show End transaction (#1029)', async () => {
  const show = showCommandFixture()
  for (const instance of show.composition!.patternInstances) {
    instance.pattern = { kind: 'stock', id: 'CometLoom' }
    instance.patternName = 'Comet Loom'
  }
  show.composition!.scenes[0].zones[0].main = show.composition!.scenes[0].zones[0].main
    .filter(placement => placement.id === 'clip-a')
  show.composition!.scenes[1].zones[0].main = [{
    id: 'clip-scene-2',
    instanceId: 'instance-b',
    startMs: 0,
    durationMs: 30_000,
    view: { mirror: false, phase: 0, brightness: 1 },
  }]
  show.composition!.scenes[1].zones[0].overlays = [{
    id: 'overlay-2', name: 'Overlay 1', placements: [],
  }]
  const provider = providerFor(show)
  await state().loadShows()
  const before = structuredClone(state().resolveEditableShow(show.id)!)
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, {
    operationId: 'four-layer-show-end',
    payloadKey: 'four-layer-show-end',
    referenceContext: 'current Show',
    targets: [],
  })

  const admittedCandidate = ((current: ShowRecord) => {
    let candidate = current
    const apply = (command: string, input: Record<string, unknown>) => {
      const outcome = applyShowCommand(candidate, command, input, {
        source: ref => DEMOS[ref.id],
        libraries: {},
      })
      if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues))
      candidate = outcome.record
      return outcome
    }
    const corners = [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]] as const
    const created = apply('create_layers', {
      schema_version: 1,
      layers: corners.map(([x, y]) => ({
        zone_id: 'zone-1',
        clips: [{
          start_ms: 0,
          duration_ms: 30_000,
          pattern: { kind: 'stock', id: 'CoronalMassEjection' },
          properties: {
            transform: { position_x: x, position_y: y, scale_x: 0.5, scale_y: 0.5 },
            aperture: { enabled: true, x: x + 0.25, y: y + 0.25, width: 0.5, height: 0.5, edge: 'soft', feather: 0.05 },
          },
        }],
      })),
    })
    const layerResults = created.changes[0].details?.layers as Array<{
      clipResults: Array<{ clipId: string }>
    }>
    const clipIds = layerResults.map(layer => layer.clipResults[0].clipId)
    const originalClipIds = [...new Set(current.composition!.scenes.flatMap(scene => (
      scene.zones.flatMap(zone => [
        ...zone.main,
        ...zone.overlays.flatMap(layer => layer.placements),
      ])
    )).map(placement => placement.logicalClipId ?? placement.id))]
    for (const clip_id of originalClipIds) {
      apply('remove_clip', { clip_id })
    }
    apply('remove_overlay_layer', {
      zone_id: 'zone-1',
      layer_index: 4,
    })
    apply('set_show_end', { end_ms: 30_000 })
    for (let index = 0; index < clipIds.length; index += 1) {
      const axis = index % 2
      const next = corners[(index + 1) % corners.length][axis]
      for (const owner of ['transform', 'viewport'] as const) {
        const offset = owner === 'viewport' ? 0.25 : 0
        const coordinate = axis === 0 ? 'x' : 'y'
        const target = owner === 'viewport'
          ? `viewport-${coordinate}`
          : `transform-position-${coordinate}`
        apply('add_property_track', {
          clip_id: clipIds[index],
          target,
          keyframes: [
            { time_ms: 0, value: corners[index][axis] + offset, easing: 'linear' },
            { time_ms: 15_000, value: next + offset, easing: 'linear' },
            { time_ms: 30_000, value: corners[index][axis] + offset, easing: 'linear' },
          ],
        })
      }
    }
    return candidate
  })(before)

  const receipt = state().admitShowEdit(pending.request, () => admittedCandidate, candidate => {
    const validation = validateShowAuthoring(candidate, { source: ref => DEMOS[ref.id] })
    return validation.valid
  })

  expect(receipt, JSON.stringify(receipt)).toMatchObject({ status: 'applied', settlement: 'saving' })
  await vi.waitFor(() => expect(state().readShowEdit(session, pending.request.operationId)?.settlement).toBe('saved'))
  const accepted = structuredClone(state().resolveEditableShow(show.id)!)
  const composition = accepted.composition!
  const tracks = composition.scenes.flatMap(scene => scene.propertyTracks ?? [])
  expect(accepted.scenes.map(scene => [scene.id, scene.durationMs])).toEqual([['scene-1', 30_000]])
  expect(composition.durationMs).toBe(30_000)
  expect(composition.patternInstances).toHaveLength(4)
  expect(composition.scenes[0].zones[0].overlays).toHaveLength(4)
  expect(tracks).toHaveLength(8)
  expect(tracks.flatMap(track => track.keyframes)).toHaveLength(24)
  expect(provider.records.get(show.id)).toEqual(accepted)
  expect(state().showHistories[show.id].past).toEqual([before])

  await state().undoShow(show.id)
  expect(state().resolveEditableShow(show.id)).toEqual({ ...before, updatedAt: expect.any(Number) })
  await state().redoShow(show.id)
  const redone = structuredClone(state().resolveEditableShow(show.id)!)
  expect(redone).toEqual({ ...accepted, updatedAt: expect.any(Number) })

  const { bundle } = buildShowFileBundle(redone, { patterns: [], maps: [] }, { appVersion: '1029-test' })
  const reopened = await parseShowFileBundle(new TextEncoder().encode(JSON.stringify(bundle)))
  expect(reopened.show).toEqual(redone)
  await state().loadShows()
  expect(state().resolveEditableShow(show.id)).toEqual(redone)
})

it.each(['current', 'newer-edit', 'undo', 'redo'] as const)('reports failed-save settlement after %s without inferring success from resolution', async (mode) => {
  const show = createDefaultShow(`failure-${mode}`, 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  await state().updateShow(show.id, { ...state().resolveEditableShow(show.id)!, name: 'Manual' })
  if (mode === 'redo') await state().undoShow(show.id)
  const durable = snapshot()
  const gate = deferred()
  provider.updateShow.mockImplementationOnce(async () => { await gate.promise })
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  state().admitShowEdit(pending.request, evaluate, validate)
  const candidate = state().resolveEditableShow(show.id)!
  let later: Promise<unknown> | undefined
  if (mode === 'newer-edit') later = state().updateShow(show.id, { ...candidate, name: 'Later' })
  if (mode === 'undo' || mode === 'redo') later = state().undoShow(show.id)
  if (mode === 'redo') {
    const undone = later
    later = state().redoShow(show.id)
    void undone
  }
  const newer = snapshot()
  const duringSave = state().beginShowEdit(session, intent('during-save'))
  gate.reject(new Error('offline'))
  await vi.waitFor(() => expect(state().readShowEdit(session, 'op')?.settlement).toBe(mode === 'current' ? 'rolled-back' : 'superseded'))
  await later
  if (mode === 'current') {
    expect(state().shows).toEqual(durable.shows)
    expect(state().showHistories).toEqual(durable.histories)
    expect(state().showSaveFailure).toEqual({ showId: show.id, record: candidate })
    expect(state().admitShowEdit(duringSave.request, evaluate, validate).reason).toBe('revision-conflict')
  } else {
    expect(snapshot()).toEqual(newer)
    expect(provider.records.get(show.id)).toEqual({ ...newer.shows[0], composition: null, stageMapId: null })
  }
  expect(state().admitShowEdit(pending.request, evaluate, validate).settlement).toBe(mode === 'current' ? 'rolled-back' : 'superseded')
  expect(provider.updateShow).toHaveBeenCalledTimes(mode === 'current' ? 2 : mode === 'redo' ? 5 : 3)
  expect(provider.records.get(show.id)).toEqual({ ...(mode === 'current' ? durable.shows[0] : newer.shows[0]), composition: null, stageMapId: null })
})

it('reports an in-memory stock draft without a personal save', async () => {
  const { STOCK_SHOWS } = await import('@/pixelblaze/stock/shows')
  const show = STOCK_SHOWS[0].show
  const provider = providerFor(createDefaultShow('unrelated-draft', 'Unrelated'))
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  expect(state().admitShowEdit(pending.request, evaluate, validate)).toMatchObject({ status: 'applied', settlement: 'draft' })
  const adopted = state().resolveEditableShow(show.id)!
  expect(adopted).toEqual({ ...show, name: 'Agent', updatedAt: expect.any(Number) })
  expect(state().showHistories[show.id]).toEqual({ past: [show], future: [] })
  expect(provider.updateShow).not.toHaveBeenCalled()
  expect(state().readShowEdit(session, 'op')?.settlement).toBe('draft')
})

it.each(['cancel', 'retire', 'remount', 'wrong-session', 'wrong-show', 'payload', 'unknown', 'capacity', 'invalid', 'async-validation', 'no-candidate'] as const)('preserves full state/history and produces no write for %s', async (mode) => {
  const show = createDefaultShow(`refuse-${mode}`, 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id, 1)
  let request = state().beginShowEdit(session, intent()).request
  if (mode === 'cancel') state().cancelShowEdit(session, 'op')
  if (mode === 'retire') state().retireShowEditSession(session)
  if (mode === 'remount') state().beginShowEditSession(show.id)
  if (mode === 'wrong-session') request = { ...request, sessionId: 'other' }
  if (mode === 'wrong-show') request = { ...request, showId: 'other' }
  if (mode === 'payload') request = { ...request, payloadKey: 'other' }
  if (mode === 'unknown') request = { ...request, operationId: 'unknown' }
  if (mode === 'capacity') {
    const refused = state().beginShowEdit(session, intent('overflow'))
    expect(refused.reason).toBe('capacity')
    request = refused.request
  }
  const before = snapshot()
  const finalValidate = mode === 'async-validation' ? (() => Promise.resolve(true)) as unknown as typeof validate : () => mode !== 'invalid'
  const result = state().admitShowEdit(request, mode === 'no-candidate' ? () => null : evaluate, finalValidate)
  expect(['refused', 'cancelled', 'retired']).toContain(result.status)
  expect(snapshot()).toEqual(before)
  await Promise.resolve()
  expect(provider.updateShow).not.toHaveBeenCalled()
  expect([...provider.records.values()]).toEqual([show])
})

it('does not count notice dismissal, same-reference update, exhausted history, same-name rename or absent draft reset as authored change', async () => {
  const show = createDefaultShow('noops', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  const before = snapshot()
  await state().updateShow(show.id, state().resolveEditableShow(show.id)!)
  await state().renameShow(show.id, 'Original')
  await state().undoShow(show.id)
  await state().redoShow(show.id)
  state().dismissShowSaveFailure()
  state().resetStockShowDraft(show.id)
  expect(snapshot()).toEqual(before)
  expect(state().showRevisions[show.id]).toBe(pending.request.baseRevision)
  expect(provider.updateShow).not.toHaveBeenCalled()
  state().cancelShowEdit(session, 'op')
})

it('lets an adopted save settle after session retirement without rebuilding its lost receipt', async () => {
  const show = createDefaultShow('late-save', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const gate = deferred()
  const persist = provider.updateShow.getMockImplementation()!
  provider.updateShow.mockImplementationOnce(async (id, changes) => { await gate.promise; await persist(id, changes) })
  const session = state().beginShowEditSession(show.id)
  const request = state().beginShowEdit(session, intent()).request
  state().admitShowEdit(request, evaluate, validate)
  const adopted = snapshot()
  state().retireShowEditSession(session)
  gate.resolve()
  await vi.waitFor(() => expect(provider.records.get(show.id)?.name).toBe('Agent'))
  expect(state().readShowEdit(session, 'op')).toBeUndefined()
  expect(state().admitShowEdit(request, evaluate, validate).status).toBe('retired')
  expect(snapshot()).toEqual(adopted)
  expect(provider.updateShow).toHaveBeenCalledTimes(1)
})

it('does not accept an old request when deletion recreates the same Show identity and content', async () => {
  const show = createDefaultShow('recreated', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const request = state().beginShowEdit(session, intent()).request
  await state().removeShow(show.id)
  await state().addShow(show)
  const before = snapshot()
  expect(state().admitShowEdit(request, evaluate, validate)).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
  expect(provider.records.get(show.id)).toEqual(show)
})

it('invalidates requests at deletion start even if provider deletion later fails', async () => {
  const show = createDefaultShow('deleting', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const gate = deferred()
  provider.provider.deleteShow = () => gate.promise
  const session = state().beginShowEditSession(show.id)
  const request = state().beginShowEdit(session, intent()).request
  const deletion = state().removeShow(show.id).catch(() => undefined)
  const before = snapshot()
  expect(state().admitShowEdit(request, evaluate, validate).status).toBe('refused')
  expect(state().beginShowEdit(session, intent('while-deleting')).reason).toBe('missing-show')
  gate.reject(new Error('offline'))
  await deletion
  expect(state().admitShowEdit(request, evaluate, validate).status).toBe('refused')
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})

it('rechecks revision after synchronous policy execution and preserves a reentrant manual edit', async () => {
  const show = createDefaultShow('reentrant', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const request = state().beginShowEdit(session, intent()).request
  let manual!: Promise<void>
  let before!: ReturnType<typeof snapshot>
  const result = state().admitShowEdit(request, (current) => {
    manual = state().updateShow(show.id, { ...current, name: 'Manual during policy' })
    before = snapshot()
    return evaluate(current)
  }, validate)
  expect(result.reason).toBe('revision-conflict')
  expect(snapshot()).toEqual(before)
  await manual
  expect(provider.updateShow).toHaveBeenCalledTimes(1)
  expect(provider.records.get(show.id)?.name).toBe('Manual during policy')
})

it.each([
  ['sessionId', 'other', 'retired', undefined],
  ['showId', 'other', 'refused', 'wrong-show'],
  ['operationId', 'other', 'refused', 'unknown-operation'],
  ['payloadKey', 'other', 'refused', 'identity-mismatch'],
  ['referenceContext', 'other', 'refused', 'identity-mismatch'],
  ['targets', ['other'], 'refused', 'identity-mismatch'],
  ['baseRevision', -1, 'refused', 'identity-mismatch'],
  ['retryOf', 'other', 'refused', 'identity-mismatch'],
] as const)('binds noncandidate completion to unchanged %s', async (key, value, status, reason) => {
  const show = createDefaultShow('completion-identity', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  await state().updateShow(show.id, { ...state().resolveEditableShow(show.id)!, name: 'Manual' })
  const before = snapshot()
  const result = state().completeShowEdit({ ...pending.request, [key]: value }, 'asked')
  expect(result.status).toBe(status)
  expect(result.reason).toBe(reason)
  expect(state().readShowEdit(session, 'op')).toBe(pending)
  expect(state().completeShowEdit(pending.request, 'asked')).toEqual({ request: pending.request, status: 'completed', completion: 'asked' })
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).toHaveBeenCalledTimes(1)
})

it.each(['cancelled', 'retired', 'applied', 'refused'] as const)('preserves %s when noncandidate completion arrives', async terminal => {
  const show = createDefaultShow('completion-terminal', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  if (terminal === 'cancelled') state().cancelShowEdit(session, 'op')
  if (terminal === 'retired') state().retireShowEditSession(session)
  if (terminal === 'applied') {
    state().admitShowEdit(pending.request, evaluate, validate)
    await vi.waitFor(() => expect(state().readShowEdit(session, 'op')?.settlement).toBe('saved'))
  }
  if (terminal === 'refused') state().admitShowEdit(pending.request, evaluate, () => false)
  const prior = state().readShowEdit(session, 'op')
  const before = snapshot()
  const records = structuredClone([...provider.records])
  const writes = provider.updateShow.mock.calls.length
  const result = state().completeShowEdit(pending.request, 'asked')
  expect(result.status).toBe(terminal)
  if (prior) expect(result).toBe(prior)
  expect(snapshot()).toEqual(before)
  expect([...provider.records]).toEqual(records)
  expect(provider.updateShow).toHaveBeenCalledTimes(writes)
})

it('refuses an unknown completion value without consuming the pending identity', async () => {
  const show = createDefaultShow('completion-value', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  const before = snapshot()
  expect(state().completeShowEdit(pending.request, 'invented' as never)).toMatchObject({ status: 'refused', reason: 'identity-mismatch' })
  expect(state().readShowEdit(session, 'op')).toBe(pending)
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})

it('retains a rich final-validator refusal without changing Show, history, or provider', async () => {
  const show = createDefaultShow('rich-final-refusal', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  const before = snapshot()
  const result = state().admitShowEdit(pending.request, evaluate, (() => ({
    valid: false,
    diagnostic: { stage: 'normalized', issues: [{ code: 'invalid-scene-duration', path: '["scene","scene-2","durationMs"]' }] },
  })) as never)
  expect(result).toMatchObject({
    status: 'refused', reason: 'invalid-candidate',
    diagnostic: { stage: 'normalized', issues: [{ code: 'invalid-scene-duration' }] },
  })
  expect(state().readShowEdit(session, 'op')).toBe(result)
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})

it.each([
  ['validator', () => evaluate, () => (() => { throw new Error('credential=validator-secret') })],
  ['admission', () => (() => { throw new Error('credential=evaluation-secret') }), () => validate],
] as const)('uses a controlled nonspecific diagnostic for unexpected %s failure', async (kind, makeEvaluate, makeValidate) => {
  const show = createDefaultShow(`unexpected-${kind}`, 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  const before = snapshot()
  const result = state().admitShowEdit(pending.request, makeEvaluate(), makeValidate())
  expect(result).toMatchObject({
    status: 'refused', reason: 'invalid-candidate',
    diagnostic: {
      stage: kind === 'validator' ? 'unexpected-validator-failure' : 'unexpected-admission-failure',
      issues: [{ code: kind === 'validator' ? 'validation-unavailable' : 'admission-unavailable' }],
    },
  })
  expect(JSON.stringify(result)).not.toContain('credential=')
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})

it.each([
  Promise.resolve(true),
  1,
  { valid: true, diagnostic: { stage: 'normalized', issues: [{ code: 'structure-invalid' }] } },
  { valid: true, extra: true },
  { valid: false, diagnostic: { stage: 'normalized', issues: [{ code: 'invented', message: 'secret' }] } },
])('fails closed for an unsupported validator result without exposing it: %j', async value => {
  const show = createDefaultShow(`unsupported-result-${Math.random()}`, 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  const before = snapshot()
  const result = state().admitShowEdit(pending.request, evaluate, (() => value) as never)
  expect(result).toMatchObject({
    status: 'refused', reason: 'invalid-candidate',
    diagnostic: { stage: 'unexpected-admission-failure', issues: [{ code: 'admission-unavailable' }] },
  })
  expect(JSON.stringify(result)).not.toContain('secret')
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})
