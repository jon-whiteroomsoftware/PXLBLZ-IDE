import { useLayoutEffect, useMemo, useRef } from 'react'
import { getPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import type { ShowV2PilotAdoptionReceipt, ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useLibraryStore } from '@/store/libraryStore'
import { resolveMap, STOCK_MAPS, useMapStore } from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'

export interface ShowV2EditCapture extends ShowV2PilotPreparedCapture {
  /** The provider the capture was taken against; a later swap makes the edit stale. */
  readonly provider: PersonalContentProvider
}

export interface ShowV2EditCaptureBinding {
  capture: ShowV2EditCapture | null
  /** Trusted route-lifetime and captured-dependency check the admission calls back into. */
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
}

/**
 * One prepared edit capture for a `ShowRecordV2` open on a route, with the
 * currency predicates the closed admission requires.
 *
 * The capture pins the record, its resolved dependencies and the active
 * provider together. Every predicate compares those exact identities, so an
 * edit planned against a superseded record, a swapped provider or an unmounted
 * route is refused rather than adopted.
 */
export function useShowV2EditCapture(showId: string): ShowV2EditCaptureBinding {
  const record = useShowStore((state) => state.showV2Pilots[showId])
  const patterns = usePatternStore((state) => state.userPatterns)
  const maps = useMapStore((state) => state.userMaps)
  const libraries = useLibraryStore((state) => state.userLibraries)
  const profiles = useControllerProfileStore((state) => state.profiles)
  const provider = getPersonalContentProvider()

  const stageMap = useMemo(() => {
    const selected = STOCK_MAPS.find((map) => map.id === record?.stageMapId)
      ?? maps.find((map) => (
        map.id === record?.stageMapId && (map.generator !== 'custom' || (map.points?.length ?? 0) > 0)
      ))
    return selected && (selected.dim === 2 || selected.dim === 3) ? resolveMap(selected.id, maps) : null
  }, [record?.stageMapId, maps])

  const capture = useMemo(() => (
    record
      ? { ...captureShowStageEditV2(record, { patterns, maps, libraries, profiles, stageMap }), provider }
      : null
  ), [record, patterns, maps, libraries, profiles, stageMap, provider])

  const active = useRef(capture)
  useLayoutEffect(() => {
    active.current = capture
    return () => { active.current = null }
  }, [capture, showId])

  const isCurrentCapture = () => Boolean(capture && active.current === capture
    && getPersonalContentProvider() === capture.provider
    && useShowStore.getState().showV2Pilots[showId] === capture.record
    && usePatternStore.getState().userPatterns === capture.dependencies.patterns
    && useMapStore.getState().userMaps === capture.dependencies.maps
    && useLibraryStore.getState().userLibraries === capture.dependencies.libraries
    && useControllerProfileStore.getState().profiles === capture.dependencies.profiles)

  const isCurrentCompletion = (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => {
    const current = active.current
    if (!capture || !current || current.record.id !== showId || receipt.showId !== showId
      || current.dependencies.stageMap !== capture.dependencies.stageMap
      || usePatternStore.getState().userPatterns !== capture.dependencies.patterns
      || useMapStore.getState().userMaps !== capture.dependencies.maps
      || useLibraryStore.getState().userLibraries !== capture.dependencies.libraries
      || useControllerProfileStore.getState().profiles !== capture.dependencies.profiles
      || getPersonalContentProvider() !== receipt.provider) return false
    const state = useShowStore.getState()
    return phase === 'saved'
      ? state.showV2Pilots[showId] === receipt.record && (state.showRevisions[showId] ?? 0) === receipt.revision
      : state.showV2SaveFailure?.showId === showId && state.showV2SaveFailure.record === receipt.record
  }

  return { capture, isCurrentCapture, isCurrentCompletion }
}
