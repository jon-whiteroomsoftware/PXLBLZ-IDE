import { useEffect, useMemo, useState } from 'react'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { projectShowTimelineV2 } from '@/engine/showTimelineViewModelV2'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useLibraryStore } from '@/store/libraryStore'
import { resolveMap, STOCK_MAPS, useMapStore } from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'
import { ShowStagePreview } from './ShowStagePreview'
import { ShowTimelineReadOnlySurface } from './ShowTimelineReadOnlySurface'
import { ShowWorkspace } from './ShowWorkspace'

/**
 * The ordinary Show editor route holding a `ShowRecordV2`.
 *
 * Slice 1 of #1056 renders that record read-only: the timeline, Layout lane,
 * Markers, Show End and Stage preview all come from the version-agnostic view
 * model, and no mutating control is offered. The v1 route is untouched, and
 * this surface registers no agent binding, so no command sees a v2 record
 * (specification section 10).
 */
export function ShowEditorV2ReadOnly({ showId }: { showId: string }) {
  const record = useShowStore((state) => state.showV2Pilots[showId])
  const open = useShowStore((state) => state.openShowV2Pilot)
  const patterns = usePatternStore((state) => state.userPatterns)
  const maps = useMapStore((state) => state.userMaps)
  const libraries = useLibraryStore((state) => state.userLibraries)
  const profiles = useControllerProfileStore((state) => state.profiles)
  const [refusal, setRefusal] = useState<string | null>(null)

  useEffect(() => {
    if (record) return
    let live = true
    void open(showId).then((result) => {
      if (!live) return
      setRefusal(result.status === 'refused' ? result.issues[0]?.message ?? 'Conversion refused.' : null)
    }).catch((error: unknown) => {
      if (live) setRefusal(error instanceof Error ? error.message : 'Open failed.')
    })
    return () => { live = false }
  }, [open, record, showId])

  const stageMap = useMemo(() => {
    const selected = STOCK_MAPS.find((map) => map.id === record?.stageMapId)
      ?? maps.find((map) => (
        map.id === record?.stageMapId && (map.generator !== 'custom' || (map.points?.length ?? 0) > 0)
      ))
    return selected && (selected.dim === 2 || selected.dim === 3) ? resolveMap(selected.id, maps) : null
  }, [record?.stageMapId, maps])

  const prepared = useMemo(() => (
    record
      ? captureShowStageEditV2(record, { patterns, maps, libraries, profiles, stageMap }).prepared
      : null
  ), [record, patterns, maps, libraries, profiles, stageMap])

  const view = useMemo(() => (record ? projectShowTimelineV2(record) : null), [record])

  if (!record || !view) {
    return (
      <div role="status" className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
        {refusal ?? 'Opening this Show…'}
      </div>
    )
  }

  return (
    <ShowWorkspace
      previewAspect={1}
      timeline={(
        <ShowTimelineReadOnlySurface
          view={view}
          statusLine="Read only - this Show is stored in the v2 format; editing arrives with the next slice."
        />
      )}
      stage={prepared?.status === 'ready' ? (
        <ShowStagePreview kind="prepared-v2" bundle={prepared.bundle} />
      ) : (
        <div role="status" className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
          {prepared?.status === 'empty'
            ? 'Add content to preview or export this Show.'
            : prepared?.status === 'refused' ? prepared.message : 'Preparing Stage preview…'}
        </div>
      )}
    />
  )
}
