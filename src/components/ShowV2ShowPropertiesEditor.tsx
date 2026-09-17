import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { PercentageField } from './ui/percentage-field'
import { MAX_PORTABLE_PREVIEW_PIXELS } from '@/engine/showOutputContract'
import {
  buildShowV2ShowPropertiesModel,
  showV2OutputContractCommand,
  showV2StageMapCommand,
  showV2TrailsCommand,
  showV2ZoneCommand,
  type ShowV2MapChoice,
  type ShowV2ShowMetadataCommand,
} from '@/engine/showV2ShowPropertiesEditorModel'
import {
  admitShowV2PilotShowMetadata,
  type ShowV2PilotAdoptionReceipt,
  type ShowV2PilotPreparedCapture,
} from '@/store/showV2PreparedEditAdmission'
import { STOCK_MAPS, useMapStore } from '@/store/mapStore'
import { showV2StageMapAvailable } from '@/store/showV2StageMap'
import { useShowStore } from '@/store/showStore'

const selectStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'

/**
 * The Show's own output properties on the v2 route: the output contract, the
 * Stage map, Zone metadata and the Trails output Effect (#1039).
 *
 * Before this the flipped route had none of them, so a person could choose a
 * Portable contract and a reference pixel count at creation and never see or
 * change either again, while an agent could author all four. Every control here
 * submits one `showCommandsV2` command through the closed prepared-edit
 * admission, so the editor and the agent are one writer: one accepted edit is
 * one history entry and one save, and a refusal - a duplicate Zone name, a
 * Stage map this workspace cannot resolve - writes nothing and keeps the record
 * identity.
 *
 * The output contract is applied as one complete choice rather than field by
 * field, because a Portable contract names a 2D reference map: drafting the
 * kind, the map and the count together lets a person see the map list narrow
 * before anything is written, instead of the surface quietly choosing another
 * map to keep an intermediate state valid.
 */
export function ShowV2ShowPropertiesEditor({ capture, isCurrentCapture, isCurrentCompletion, onStatus }: {
  capture: ShowV2PilotPreparedCapture
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const record = capture.record
  const userMaps = useMapStore(state => state.userMaps)
  const catalogue = useMemo<ShowV2MapChoice[]>(() => (
    [...STOCK_MAPS, ...userMaps].map(map => ({ id: map.id, name: map.name, dim: map.dim }))
  ), [userMaps])
  const model = buildShowV2ShowPropertiesModel(record, catalogue)
  const stageMapOptions = useMemo(
    () => catalogue.filter(map => showV2StageMapAvailable(map.id, userMaps)),
    [catalogue, userMaps],
  )

  const [busy, setBusy] = useState(false)
  const [reset, setReset] = useState(0)
  const [zoneId, setZoneId] = useState('')
  const [draftKind, setDraftKind] = useState(model.contract.kind)
  const [draftMapId, setDraftMapId] = useState(model.contract.mapId ?? '')
  const [draftPixels, setDraftPixels] = useState(model.contract.pixelCount)
  const pending = useRef(false)
  const live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  // The contract draft follows the record: an accepted edit, an Undo or another
  // client's write all leave the draft describing the Show that is open.
  const applied = `${model.contract.kind}:${model.contract.mapId ?? ''}:${model.contract.pixelCount}`
  const seeded = useRef(applied)
  useLayoutEffect(() => {
    if (seeded.current === applied) return
    seeded.current = applied
    setDraftKind(model.contract.kind)
    setDraftMapId(model.contract.mapId ?? '')
    setDraftPixels(model.contract.pixelCount)
  }, [applied, model.contract.kind, model.contract.mapId, model.contract.pixelCount])

  const zone = record.zones.find(candidate => candidate.id === zoneId)
  const available = !busy
    && (capture.inputCapture ? capture.inputCapture.status === 'qualified' : capture.prepared.status !== 'refused')
  // A Portable contract names a 2D reference map, so the draft list narrows
  // with the drafted kind rather than with what is stored.
  const draftMapOptions = draftKind === 'portable-2d' ? catalogue.filter(map => map.dim === 2) : catalogue
  const draftMapEligible = !draftMapId || draftMapOptions.some(map => map.id === draftMapId)

  const submit = async (intent: ShowV2ShowMetadataCommand): Promise<boolean> => {
    if (pending.current || !available) return false
    pending.current = true
    setBusy(true)
    const adoption: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await admitShowV2PilotShowMetadata({
        showId: record.id,
        baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
        capture,
        intent,
        isCurrent: () => live.current && isCurrentCapture(),
        onAdopted: receipt => { adoption.current = receipt },
      })
      const current = outcome.status === 'applied'
        ? adoption.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adoption.current, 'saved')
        : isCurrentCapture()
      if (!live.current || !current) return false
      if (outcome.status !== 'applied') setReset(value => value + 1)
      onStatus(outcome.status === 'refused'
        ? outcome.message
        : outcome.status === 'unchanged' ? 'Show properties are unchanged.' : 'Show properties saved.')
      return outcome.status === 'applied'
    } catch (error) {
      const current = adoption.current ? isCurrentCompletion(adoption.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) {
        setReset(value => value + 1)
        onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
      }
      return false
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }

  return (
    <section aria-label="Show properties" data-testid="show-v2-show-properties" className="mt-7 space-y-3">
      <h2 className="text-sm font-medium text-zinc-200">Show properties</h2>
      <p
        title="Show output summary"
        data-testid="show-v2-output-summary"
        className="rounded-sm border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-xs text-zinc-300"
      >
        {model.contract.summary}
      </p>

      <form
        className="space-y-3"
        onSubmit={event => {
          event.preventDefault()
          void submit(showV2OutputContractCommand({
            kind: draftKind,
            pixelCount: draftPixels,
            mapId: draftMapId || null,
          }))
        }}
      >
        <label className="block text-xs text-zinc-400">
          Output contract
          <select
            aria-label="Output contract"
            className={selectStyle}
            value={draftKind}
            disabled={!available}
            onChange={event => setDraftKind(event.target.value as typeof draftKind)}
          >
            <option value="portable-2d">Portable · Resolution-independent 2D</option>
            <option value="installation">Installation · Exact physical output</option>
          </select>
        </label>
        <label className="block text-xs text-zinc-400">
          {draftKind === 'portable-2d' ? 'Reference map' : 'Output map'}
          <select
            aria-label={draftKind === 'portable-2d' ? 'Reference map' : 'Output map'}
            className={selectStyle}
            value={draftMapEligible ? draftMapId : ''}
            disabled={!available}
            onChange={event => setDraftMapId(event.target.value)}
          >
            <option value="">No map</option>
            {draftMapOptions.map(map => <option key={map.id} value={map.id}>{map.name}</option>)}
          </select>
        </label>
        <NumberField
          key={`pixels:${applied}:${reset}`}
          label={draftKind === 'portable-2d' ? 'Preview pixels' : 'Pixels'}
          ariaLabel={draftKind === 'portable-2d' ? 'Portable reference pixels' : 'Installation pixels'}
          value={draftPixels}
          min={1}
          max={MAX_PORTABLE_PREVIEW_PIXELS}
          step={1}
          variant="editor"
          disabled={!available}
          onChange={setDraftPixels}
        />
        <Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available}>
          Apply output contract
        </Button>
        <p className="text-xs text-zinc-500">
          Portable stays resolution independent across compatible 2D mapped surfaces; Installation is the
          exact physical output promise. Applying a contract also moves the Stage map to its map.
        </p>
      </form>

      <label className="block text-xs text-zinc-400">
        Stage map
        <select
          aria-label="Stage map"
          className={selectStyle}
          value={model.stageMapMissing ? '' : model.stageMapId ?? ''}
          disabled={!available}
          onChange={event => void submit(showV2StageMapCommand(event.target.value || null))}
        >
          <option value="">{model.stageMapMissing ? `Missing map (${model.stageMapId})` : 'No map'}</option>
          {stageMapOptions.map(map => <option key={map.id} value={map.id}>{map.name}</option>)}
        </select>
      </label>
      <p className="text-xs text-zinc-500">
        What the Stage previews and compiles against. A map this workspace cannot resolve is refused
        rather than replaced.
      </p>

      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300">Zone Map</h3>
        <label className="block text-xs text-zinc-400">
          Zone
          <select
            aria-label="Zone"
            className={selectStyle}
            value={zone?.id ?? ''}
            disabled={busy}
            onChange={event => setZoneId(event.target.value)}
          >
            <option value="">Choose Zone</option>
            {model.zones.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {zone && (
          <>
            <form
              key={`zone:${zone.id}:${zone.name}:${reset}`}
              className="flex flex-wrap items-end gap-2"
              onSubmit={event => {
                event.preventDefault()
                void submit(showV2ZoneCommand(zone.id, { name: String(new FormData(event.currentTarget).get('name') ?? '') }))
              }}
            >
              <label className="min-w-0 flex-1 text-xs text-zinc-400">
                Zone name
                <input aria-label="Zone name" name="name" required defaultValue={zone.name} className={selectStyle} disabled={busy} />
              </label>
              <Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available}>
                Rename Zone
              </Button>
            </form>
            <NumberField
              key={`zone-pixels:${zone.id}:${zone.nominalPixelCount}:${reset}`}
              label="Zone pixels"
              ariaLabel="Zone nominal pixel count"
              value={zone.nominalPixelCount}
              min={1}
              step={1}
              variant="editor"
              disabled={!available}
              onChange={next => void submit(showV2ZoneCommand(zone.id, { nominalPixelCount: next }))}
            />
          </>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300">Show output</h3>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            aria-label="Enable Trails"
            type="checkbox"
            checked={model.trails.enabled}
            disabled={!available}
            onChange={event => void submit(showV2TrailsCommand({ enabled: event.target.checked }))}
            className="accent-live"
          />
          Trails
        </label>
        {model.trails.enabled && (
          <PercentageField
            key={`trails:${model.trails.retention}:${reset}`}
            label="Retention"
            ariaLabel="Trails retention"
            min={0}
            max={1}
            step={0.015625}
            value={model.trails.retention}
            disabled={!available}
            onChange={retention => void submit(showV2TrailsCommand({ enabled: true, retention }))}
          />
        )}
        <p className="text-xs text-zinc-500">
          Retains brighter linear-RGB pixels from the previous frame.
        </p>
      </div>
    </section>
  )
}
