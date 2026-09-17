import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import * as stage from '../engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { applyShowCommandV2 } from '../engine/showCommandsV2/registry'
import {
  showV2OutputContractCommand,
  showV2StageMapCommand,
  showV2TrailsCommand,
  showV2ZoneCommand,
} from '../engine/showV2ShowPropertiesEditorModel'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotShowMetadata } from './showV2PreparedEditAdmission'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

/**
 * The Show-metadata surface's admission: output contract, Stage map, Zone
 * metadata and Trails, each through the one `showCommandsV2` owner an agent
 * calls, adopted by the closed prepared-edit dispatch.
 */
function setup() {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('fixture')
  const record = converted.record
  record.composition.transitions = []
  record.composition.clips = record.composition.clips.slice(0, 1)
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  const dependencies = {
    patterns: [{ id: 'voice', name: 'Voice', src: 'export function render2D(i,x,y){rgb(1,0,0)}', controls: {}, updatedAt: 1 }],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'show-metadata-test', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const context = () => {
    const current = useShowStore.getState().showV2Pilots[record.id]
    const provider = getPersonalContentProvider()
    return {
      showId: record.id,
      baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
      capture: { record: current, dependencies, prepared: stage.prepareShowStageV2(current, dependencies) },
      isCurrent: () => getPersonalContentProvider() === provider,
      onAdopted: vi.fn(),
    }
  }
  return { record, context, write, saved: () => saved }
}

function noEffects(result: Awaited<ReturnType<typeof admitShowV2PilotShowMetadata>>) {
  expect(result.affected).toEqual([])
}

it('adopts one output-contract change as one preparation, one history entry and one save', async () => {
  const { record, context, write, saved } = setup()
  const before = structuredClone(record)
  const captured = context()
  const prepare = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    const outcome = await admitShowV2PilotShowMetadata({
      ...captured,
      intent: showV2OutputContractCommand({ kind: 'installation', pixelCount: 300, mapId: null }),
    })
    expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved' })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(record).toEqual(before)
    expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([before])
    expect(saved().outputContract).toMatchObject({ kind: 'installation', pixelCount: 300, outputMapId: null })
    expect(saved().stageMapId).toBe(null)
  } finally { prepare.mockRestore() }
})

it('writes exactly what the registry command writes for the same input', async () => {
  const { record, context, saved } = setup()
  const intent = showV2ZoneCommand(record.zones[0].id, { name: 'Stage left' })
  const direct = applyShowCommandV2(structuredClone(record), intent.command, intent.input)
  expect(direct.status).toBe('changed')
  await admitShowV2PilotShowMetadata({ ...context(), intent })
  expect(saved().zones).toEqual(direct.record.zones)
})

it('reports the command owner\'s own affected identities', async () => {
  const { record, context } = setup()
  const outcome = await admitShowV2PilotShowMetadata({
    ...context(),
    intent: showV2ZoneCommand(record.zones[0].id, { nominalPixelCount: 24 }),
  })
  expect(outcome).toMatchObject({ status: 'applied', affected: [record.zones[0].id] })
})

it('turns Trails on at the authored retention and back off', async () => {
  const { record, context, saved } = setup()
  await admitShowV2PilotShowMetadata({ ...context(), intent: showV2TrailsCommand({ enabled: true, retention: 0.25 }) })
  expect(saved().outputEffects).toEqual([{ id: 'trails', kind: 'trails', retention: 0.25 }])
  await admitShowV2PilotShowMetadata({ ...context(), intent: showV2TrailsCommand({ enabled: false }) })
  expect(saved().outputEffects).toEqual([])
  expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(2)
})

it('keeps an already-satisfied request a true no-op with no preparation, history or save', async () => {
  const { record, context, write } = setup()
  const captured = context()
  const prepare = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    const outcome = await admitShowV2PilotShowMetadata({
      ...captured,
      intent: showV2ZoneCommand(record.zones[0].id, { name: record.zones[0].name }),
    })
    expect(outcome.status).toBe('unchanged')
    noEffects(outcome)
    expect(prepare).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
    expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  } finally { prepare.mockRestore() }
})

it('carries the command owner\'s own refusal and writes nothing', async () => {
  const { record, context, write } = setup()
  useShowStore.setState({ showV2Pilots: { [record.id]: { ...record, zones: [...record.zones, { id: 'spare', name: 'Spare', nominalPixelCount: 8 }] } } })
  const captured = context()
  const outcome = await admitShowV2PilotShowMetadata({
    ...captured,
    intent: showV2ZoneCommand(record.zones[0].id, { name: 'Spare' }),
  })
  expect(outcome).toMatchObject({ status: 'refused', source: 'owner', code: 'duplicate-name' })
  expect(outcome.status === 'refused' && outcome.message).toContain('Spare')
  noEffects(outcome)
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(captured.capture.record)
})

const malformed: unknown[] = [
  null,
  {},
  [],
  { command: 'update_zone' },
  { command: 'update_zone', input: null },
  { command: 'update_zone', input: {}, extra: 1 },
  // A command outside the Show-metadata allowlist may not reach this surface.
  { command: 'remove_clips', input: { clip_ids: ['clip-a'] } },
  { command: 'set_show_end', input: { end_ms: 1_000 } },
  { command: 'rename_show', input: { name: 'Renamed' } },
]
it.each(malformed.map((intent, index) => ({ intent, index })))('refuses malformed Show-metadata intent $index before preparation', async ({ intent }) => {
  const { record, context, write } = setup()
  const captured = context()
  const prepare = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    const outcome = await admitShowV2PilotShowMetadata({ ...captured, intent: intent as never })
    expect(outcome).toMatchObject({ status: 'refused', source: 'owner', code: 'invalid-intent' })
    noEffects(outcome)
    expect(prepare).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  } finally { prepare.mockRestore() }
})

it('refuses an invalid command argument with the registry\'s own issue', async () => {
  const { context, write } = setup()
  const outcome = await admitShowV2PilotShowMetadata({
    ...context(),
    intent: { command: 'update_zone', input: { zone_id: 'absent', name: 'Anything' } },
  })
  expect(outcome).toMatchObject({ status: 'refused', source: 'owner', code: 'unknown-id' })
  expect(write).not.toHaveBeenCalled()
})

it('re-resolves a newly named Stage map instead of preparing against the captured one', async () => {
  const { context, saved } = setup()
  const captured = context()
  const prepare = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    const outcome = await admitShowV2PilotShowMetadata({ ...captured, intent: showV2StageMapCommand('plane') })
    expect(outcome.status).toBe('applied')
    expect(saved().stageMapId).toBe('plane')
    const [, dependencies] = prepare.mock.calls[0]
    expect(dependencies.stageMap).not.toBe(null)
    expect(dependencies.stageMap?.id).toBe('plane')
  } finally { prepare.mockRestore() }
})

it('refuses a Stage map this workspace cannot resolve rather than falling back', async () => {
  const { record, context, write } = setup()
  const captured = context()
  const prepare = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    const outcome = await admitShowV2PilotShowMetadata({ ...captured, intent: showV2StageMapCommand('gone') })
    expect(outcome).toMatchObject({ status: 'refused', source: 'admission', code: 'unsupported-pilot-record' })
    expect(outcome.status === 'refused' && outcome.message).toContain('gone')
    noEffects(outcome)
    expect(prepare).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  } finally { prepare.mockRestore() }
})

it.each(['record', 'revision', 'provider', 'route'] as const)('refuses a stale captured submission after %s replacement', async partition => {
  const { record, context, write } = setup()
  const captured = context()
  if (partition === 'record') useShowStore.setState({ showV2Pilots: { [record.id]: { ...record, name: 'External' } } })
  if (partition === 'revision') useShowStore.setState({ showRevisions: { [record.id]: 1 } })
  if (partition === 'provider') setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'external' })
  if (partition === 'route') captured.isCurrent = () => false
  const current = useShowStore.getState().showV2Pilots[record.id]
  const outcome = await admitShowV2PilotShowMetadata({
    ...captured,
    intent: showV2ZoneCommand(record.zones[0].id, { name: 'Renamed' }),
  })
  expect(outcome).toMatchObject({ status: 'refused', source: 'admission', code: 'stale-edit' })
  noEffects(outcome)
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(current)
})
