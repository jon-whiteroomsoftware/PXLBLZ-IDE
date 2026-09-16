import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import { ShowStagePreview } from './ShowStagePreview'
import { admitShowV2PilotGroupOccurrenceEdit, admitShowV2PilotClipSharingEdit, admitShowV2PilotPropertyEdit, admitShowV2PilotTransitionResize, type ShowV2PilotAdoptionReceipt } from '@/store/showV2PreparedEditAdmission'
import { ShowV2MarkerEditor } from './ShowV2MarkerEditor'
import { ShowV2ClipTimingEditor, ShowV2TimelineRows } from './ShowV2ClipTimingEditor'
import { ShowV2LayerEditor } from './ShowV2LayerEditor'
import { ShowV2AppearanceEditor } from './ShowV2AppearanceEditor'
import { ShowV2ClipSharingEditor } from './ShowV2ClipSharingEditor'
import { ShowV2PropertyEditor } from './ShowV2PropertyEditor'
import { ShowV2GroupCreationEditor } from './ShowV2GroupCreationEditor'
import { ShowV2GroupOccurrenceEditor } from './ShowV2GroupOccurrenceEditor'
import { buildShowV2TimelineEditorModel, selectedShowOrdinaryClipV2 } from '@/engine/showV2TimelineEditorModel'
import { qualifyShowV2PilotArtifacts } from '@/engine/showV2Pilot'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
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
  const undo = useShowStore(state => state.undoShowV2Pilot)
  const redo = useShowStore(state => state.redoShowV2Pilot)
  const reload = useShowStore(state => state.reloadShowV2Pilot)
  const patterns = usePatternStore(state => state.userPatterns)
  const maps = useMapStore(state => state.userMaps)
  const libraries = useLibraryStore(state => state.userLibraries)
  const profiles = useControllerProfileStore(state => state.profiles)
  const [status, setStatus] = useState('')
  const [selectedClipId, setSelectedClipId] = useState('')

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

  const transition = record?.composition.transitions[0]
  const stageMap = useMemo(() => {
    const selected = STOCK_MAPS.find(map => map.id === record?.stageMapId)
      ?? maps.find(map => map.id === record?.stageMapId && (map.generator !== 'custom' || (map.points?.length ?? 0) > 0))
    return selected && (selected.dim === 2 || selected.dim === 3) ? resolveMap(selected.id, maps) : null
  }, [record?.stageMapId, maps])
  const provider = getPersonalContentProvider()
  const editCapture = useMemo(() => {
    if (!record) return null
    const dependencies = { patterns, maps, libraries, profiles, stageMap }
    return { ...captureShowStageEditV2(record, dependencies), provider }
  }, [record, patterns, maps, libraries, profiles, stageMap, provider])
  const preview = editCapture?.prepared ?? null
  const timingModel = useMemo(() => editCapture ? buildShowV2TimelineEditorModel(editCapture) : { sources: [], rows: [] }, [editCapture])
  const selectedClip = record ? selectedShowOrdinaryClipV2(record, selectedClipId) : null
  const activeEditCapture = useRef(editCapture)
  useLayoutEffect(() => {
    activeEditCapture.current = editCapture
    return () => { activeEditCapture.current = null }
  }, [editCapture, showId])
  const isCurrentEditCapture = () => Boolean(editCapture && activeEditCapture.current === editCapture
    && getPersonalContentProvider() === editCapture.provider
    && useShowStore.getState().showV2Pilots[showId] === editCapture.record
    && usePatternStore.getState().userPatterns === editCapture.dependencies.patterns
    && useMapStore.getState().userMaps === editCapture.dependencies.maps
    && useLibraryStore.getState().userLibraries === editCapture.dependencies.libraries
    && useControllerProfileStore.getState().profiles === editCapture.dependencies.profiles)
  const isCurrentEditCompletion = (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => {
    const active = activeEditCapture.current
    if (!editCapture || !active || active.record.id !== showId || receipt.showId !== showId
      || active.dependencies.stageMap !== editCapture.dependencies.stageMap
      || usePatternStore.getState().userPatterns !== editCapture.dependencies.patterns
      || useMapStore.getState().userMaps !== editCapture.dependencies.maps
      || useLibraryStore.getState().userLibraries !== editCapture.dependencies.libraries
      || useControllerProfileStore.getState().profiles !== editCapture.dependencies.profiles
      || getPersonalContentProvider() !== receipt.provider) return false
    const state = useShowStore.getState()
    return phase === 'saved'
      ? state.showV2Pilots[showId] === receipt.record && (state.showRevisions[showId] ?? 0) === receipt.revision
      : state.showV2SaveFailure?.showId === showId && state.showV2SaveFailure.record === receipt.record
  }

  const qualificationGeneration = useRef(0)
  useLayoutEffect(() => {
    const generation = qualificationGeneration
    generation.current++
    return () => { generation.current++ }
  }, [preview, showId])

  const resizePending = useRef<{ showId: string } | null>(null)
  const [resizeBusyShowId, setResizeBusyShowId] = useState<string | null>(null)
  const resizeBusy = resizeBusyShowId === showId
  const [resizeFieldReset, setResizeFieldReset] = useState(0)
  const resize = async (durationMs: number) => {
    if (!editCapture || !transition || resizePending.current?.showId === showId) return
    const operation = { showId }
    resizePending.current = operation
    setResizeBusyShowId(showId)
    const adoption: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await admitShowV2PilotTransitionResize({
        showId, baseRevision: useShowStore.getState().showRevisions[showId] ?? 0,
        capture: editCapture, intent: { kind: 'resize-transition', transitionId: transition.id, durationMs },
        isCurrent: isCurrentEditCapture, onAdopted: receipt => { adoption.current = receipt },
      })
      const current = outcome.status === 'applied'
        ? adoption.current !== null && outcome.settlement === 'saved' && isCurrentEditCompletion(adoption.current, 'saved')
        : isCurrentEditCapture()
      if (!current) return
      if (outcome.status === 'refused') setResizeFieldReset(value => value + 1)
      setStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Transition is unchanged.' : `Saved v2 Transition at ${durationMs} ms.`)
    } catch (error) {
      const current = adoption.current ? isCurrentEditCompletion(adoption.current, 'save-failed') : isCurrentEditCapture()
      if (current) {
        setResizeFieldReset(value => value + 1)
        setStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
      }
    } finally {
      if (resizePending.current === operation) {
        resizePending.current = null
        setResizeBusyShowId(null)
      }
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
    if (preview?.status !== 'ready' || !record) return
    const captured = preview.bundle
    const dependencies = captured.identity.dependencies
    const generation = ++qualificationGeneration.current
    const provider = getPersonalContentProvider()
    const isCurrent = () => qualificationGeneration.current === generation
      && captured.identity.record === record
      && useShowStore.getState().showV2Pilots[showId] === record
      && usePatternStore.getState().userPatterns === dependencies.patterns
      && useMapStore.getState().userMaps === dependencies.maps
      && useLibraryStore.getState().userLibraries === dependencies.libraries
      && useControllerProfileStore.getState().profiles === dependencies.profiles
      && getPersonalContentProvider() === provider
    if (!isCurrent()) return
    try {
      const result = await qualifyShowV2PilotArtifacts(captured, { appVersion: 'v2-route-pilot' })
      if (isCurrent()) setStatus(`Reopened .pxlshow v2 and .epe (${result.pxlshowBytes.byteLength} bytes).`)
    } catch (error) {
      if (isCurrent()) setStatus(error instanceof Error ? error.message : 'Artifact qualification failed.')
    }
  }

  return (
    <div data-testid="show-v2-route-pilot" className="grid h-full min-h-0 grid-cols-1 bg-zinc-950 text-zinc-200 xl:grid-cols-[minmax(22rem,0.8fr)_minmax(26rem,1.2fr)]">
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
                  key={`${transition.id}:${resizeFieldReset}`}
                  label="Transition duration"
                  disabled={resizeBusy}
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
          {editCapture && <ShowV2ClipTimingEditor key={`timing:${editCapture.record.id}`} capture={editCapture} sources={timingModel.sources} selectedClipId={selectedClip?.id ?? ''} onSelectClip={setSelectedClipId} isCurrentCapture={isCurrentEditCapture} isCurrentCompletion={isCurrentEditCompletion} onStatus={setStatus} />}
          {editCapture && selectedClip && <ShowV2ClipSharingEditor key={`sharing:${editCapture.record.id}:${selectedClip.id}`} clipId={selectedClip.id} capture={editCapture} submitSharingEdit={request => admitShowV2PilotClipSharingEdit({ showId, baseRevision: useShowStore.getState().showRevisions[showId] ?? 0, capture: editCapture, ...request })} isCurrentCapture={isCurrentEditCapture} isCurrentCompletion={isCurrentEditCompletion} onStatus={setStatus} />}
          {editCapture && selectedClip && <ShowV2AppearanceEditor key={`appearance:${editCapture.record.id}:${selectedClip.id}`} clipId={selectedClip.id} capture={editCapture} isCurrentCapture={isCurrentEditCapture} isCurrentCompletion={isCurrentEditCompletion} onStatus={setStatus} />}
          {editCapture && <ShowV2LayerEditor key={`layers:${editCapture.record.id}`} capture={editCapture} isCurrentCapture={isCurrentEditCapture} isCurrentCompletion={isCurrentEditCompletion} onStatus={setStatus} />}
          {editCapture && <ShowV2PropertyEditor key={`properties:${editCapture.record.id}`} capture={editCapture} submitPropertyEdit={request => admitShowV2PilotPropertyEdit({ showId, baseRevision: useShowStore.getState().showRevisions[showId] ?? 0, capture: editCapture, ...request })} isCurrentCapture={isCurrentEditCapture} isCurrentCompletion={isCurrentEditCompletion} onStatus={setStatus} />}
          {editCapture && <ShowV2GroupCreationEditor key={`groups:${editCapture.record.id}`} capture={editCapture} isCurrentCapture={isCurrentEditCapture} isCurrentCompletion={isCurrentEditCompletion} onStatus={setStatus} />}
          {editCapture && <ShowV2GroupOccurrenceEditor key={`group-occurrences:${editCapture.record.id}`} capture={editCapture} submitGroupOccurrenceEdit={request => admitShowV2PilotGroupOccurrenceEdit({ showId, baseRevision: useShowStore.getState().showRevisions[showId] ?? 0, capture: editCapture, ...request })} isCurrentCapture={isCurrentEditCapture} isCurrentCompletion={isCurrentEditCompletion} onStatus={setStatus} />}
          {editCapture && <ShowV2MarkerEditor key={editCapture.record.id} capture={editCapture} isCurrentCapture={isCurrentEditCapture} isCurrentCompletion={isCurrentEditCompletion} onStatus={setStatus} />}
          <div className="mt-7 flex flex-wrap gap-2">
            <Button size="xs" variant="outline" disabled={!history?.past.length} onClick={() => void runHistory('undo')}>Undo</Button>
            <Button size="xs" variant="outline" disabled={!history?.future.length} onClick={() => void runHistory('redo')}>Redo</Button>
            <Button size="xs" variant="outline" onClick={() => void reopen()}>Reload saved v2</Button>
            <Button size="xs" variant="outline" disabled={preview?.status !== 'ready'} onClick={() => void qualifyArtifacts()}>Reopen artifacts</Button>
          </div>
          <output aria-live="polite" className={`mt-6 block text-sm leading-6 ${failure ? 'text-red-300' : 'text-zinc-400'}`}>
            {status || (record ? 'V2 record opened in memory.' : 'Opening v2 pilot…')}
          </output>
        </div>
      </section>
      <section className="flex min-h-[20rem] flex-col overflow-y-auto border-t border-zinc-800 p-3 xl:min-h-0 xl:border-l xl:border-t-0" aria-label="V2 Stage preview">
        <div className="min-h-[24rem] flex-1">
        {preview?.status === 'ready' ? (
          <ShowStagePreview kind="prepared-v2" bundle={preview.bundle} />
        ) : (
          <div role="status" className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
            {preview?.status === 'empty' ? 'Add content to preview or export this Show.' : preview?.status === 'refused' ? preview.message : 'Preparing Stage preview…'}
          </div>
        )}
        </div>
        {record && <ShowV2TimelineRows rows={timingModel.rows} showEndMs={record.composition.showEndMs} selectedClipId={selectedClip?.id ?? ''} onSelectClip={setSelectedClipId} />}
      </section>
    </div>
  )
}
