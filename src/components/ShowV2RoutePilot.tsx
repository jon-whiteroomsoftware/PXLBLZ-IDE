import { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { ShowStagePreview } from './ShowStagePreview'
import { isValidatedEmptyShowV2 } from '@/engine/showMarkerRouteModel'
import { ShowV2MarkerEditor } from './ShowV2MarkerEditor'
import { editShowTransitionV2 } from '@/engine/showTransitionsV2'
import { qualifyShowV2PilotArtifacts } from '@/engine/showV2Pilot'
import { prepareShowStageV2 } from '@/engine/showPreparedStageV2'
import { useShowStore } from '@/store/showStore'
import { usePatternStore } from '@/store/patternStore'
import { useMapStore, resolveMap, STOCK_MAPS } from '@/store/mapStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'

export function ShowV2RoutePilot({ showId }: { showId: string }) {
  const record = useShowStore(state => state.showV2Pilots[showId])
  const history = useShowStore(state => state.showV2Histories[showId])
  const failure = useShowStore(state => state.showV2SaveFailure?.showId === showId ? state.showV2SaveFailure : null)
  const open = useShowStore(state => state.openShowV2Pilot)
  const update = useShowStore(state => state.updateShowV2Pilot)
  const undo = useShowStore(state => state.undoShowV2Pilot)
  const redo = useShowStore(state => state.redoShowV2Pilot)
  const reload = useShowStore(state => state.reloadShowV2Pilot)
  const patterns = usePatternStore(state => state.userPatterns)
  const maps = useMapStore(state => state.userMaps)
  const libraries = useLibraryStore(state => state.userLibraries)
  const profiles = useControllerProfileStore(state => state.profiles)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (record) return
    let live = true
    void open(showId).then(result => {
      if (!live) return
      if (result.status === 'refused') setStatus(result.issues[0]?.message ?? 'Conversion refused.')
      else setStatus('V2 record opened in memory.')
    }).catch(error => live && setStatus(error instanceof Error ? error.message : 'Open failed.'))
    return () => { live = false }
  }, [open, record, showId])

  const emptyContent = record ? isValidatedEmptyShowV2(record) : false
  const transition = record?.composition.transitions[0]
  const preview = useMemo(() => {
    if (!record) return null
    const selected = STOCK_MAPS.find(map => map.id === record.stageMapId)
      ?? maps.find(map => map.id === record.stageMapId && (map.generator !== 'custom' || (map.points?.length ?? 0) > 0))
    const stageMap = selected && (selected.dim === 2 || selected.dim === 3) ? resolveMap(selected.id, maps) : null
    return prepareShowStageV2(record, { patterns, maps, libraries, profiles, stageMap })
  }, [record, patterns, maps, libraries, profiles])

  const resize = async (durationMs: number) => {
    if (!record || !transition) return
    const result = editShowTransitionV2(record, { kind: 'resize-transition', transitionId: transition.id, durationMs })
    if (result.status !== 'changed') {
      setStatus(result.status === 'unchanged' ? 'Transition is unchanged.' : result.message)
      return
    }
    try {
      await update(showId, result.record)
      setStatus(`Saved v2 Transition at ${durationMs} ms.`)
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
    }
  }

  const runHistory = async (direction: 'undo' | 'redo') => {
    const changed = direction === 'undo' ? await undo(showId) : await redo(showId)
    setStatus(changed ? `${direction === 'undo' ? 'Undo' : 'Redo'} saved.` : `Nothing to ${direction}.`)
  }

  const reopen = async () => {
    const reopened = await reload(showId)
    setStatus(reopened ? 'Reloaded v2 bytes from the provider.' : 'No saved v2 record was found.')
  }

  const qualifyArtifacts = async () => {
    if (!record) return
    try {
      const result = await qualifyShowV2PilotArtifacts(record, { patterns, maps, libraries }, { appVersion: 'v2-route-pilot' })
      setStatus(`Reopened .pxlshow v2 and .epe (${result.pxlshowBytes.byteLength} bytes).`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Artifact qualification failed.')
    }
  }

  return (
    <div data-testid="show-v2-route-pilot" className="grid h-full min-h-0 grid-cols-1 bg-zinc-950 text-zinc-200 lg:grid-cols-[minmax(22rem,0.8fr)_minmax(26rem,1.2fr)]">
      <section className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7">
        <div className="mx-auto max-w-xl">
          <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800 pb-3">
            <h1 className="font-mono text-base font-semibold">V2 route qualification</h1>
            <output className="font-mono text-xs tabular-nums text-zinc-500">{record ? `revision ${record.updatedAt}` : 'loading'}</output>
          </div>
          <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Show</dt><dd className="truncate">{record?.name ?? showId}</dd>
            <dt className="text-zinc-500">Format</dt><dd>{record ? `v${record.version}` : '—'}</dd>
            <dt className="text-zinc-500">Transition</dt><dd>{transition?.kind ?? 'None'}</dd>
          </dl>
          {transition && (
            <div className="mt-7">
              <div className="w-44">
                <NumberField
                  label="Transition duration"
                  value={transition.durationMs}
                  min={1}
                  step={1}
                  suffix="ms"
                  variant="editor"
                  onChange={durationMs => void resize(durationMs)}
                />
              </div>
            </div>
          )}
          {record && <ShowV2MarkerEditor key={record.id} record={record} onStatus={setStatus} />}
          <div className="mt-7 flex flex-wrap gap-2">
            <Button size="xs" variant="outline" disabled={!history?.past.length} onClick={() => void runHistory('undo')}>Undo</Button>
            <Button size="xs" variant="outline" disabled={!history?.future.length} onClick={() => void runHistory('redo')}>Redo</Button>
            <Button size="xs" variant="outline" onClick={() => void reopen()}>Reload saved v2</Button>
            <Button size="xs" variant="outline" disabled={!record || emptyContent} onClick={() => void qualifyArtifacts()}>Reopen artifacts</Button>
          </div>
          <output aria-live="polite" className={`mt-6 block text-sm leading-6 ${failure ? 'text-red-300' : 'text-zinc-400'}`}>
            {status || (record ? 'V2 record opened in memory.' : 'Opening v2 pilot…')}
          </output>
        </div>
      </section>
      <section className="min-h-[20rem] border-t border-zinc-800 p-3 lg:min-h-0 lg:border-l lg:border-t-0" aria-label="V2 Stage preview">
        {preview?.status === 'ready' ? (
          <ShowStagePreview kind="prepared-v2" bundle={preview.bundle} />
        ) : (
          <div role="status" className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
            {preview?.status === 'empty' ? 'Add content to preview or export this Show.' : preview?.status === 'refused' ? preview.message : 'Preparing Stage preview…'}
          </div>
        )}
      </section>
    </div>
  )
}
