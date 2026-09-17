import { useLayoutEffect, useRef, useState } from 'react'
import { Code2, Download, RotateCw } from 'lucide-react'
import { ActionsMenu, type ActionsMenuItem } from './ActionsMenu'
import { downloadShowV2Epe, type ShowV2RouteArtifactState } from './useShowV2RouteArtifacts'

/**
 * The v2 route header's Show actions: View code and Download .epe (#1039).
 *
 * The v1 editor has offered both from its header since before Shows were
 * portable, and the flipped route had neither. They read the route's one
 * artifact build and hand the download to `downloadShowV2Epe`, the same
 * implementation the delivery panel's Export .epe calls, so both entry points
 * write the same bytes under the same filename the v1 exporter produces.
 */
export function ShowEditorV2ShowActions({
  delivery,
  onViewCode,
}: {
  delivery: ShowV2RouteArtifactState
  onViewCode: () => void
}) {
  const [exporting, setExporting] = useState(false)
  const [failed, setFailed] = useState(false)
  const live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])

  const exportEpe = () => {
    if (!delivery.bundle || exporting) return
    const bundle = delivery.bundle
    setExporting(true)
    setFailed(false)
    void downloadShowV2Epe(bundle)
      .catch(() => { if (live.current) setFailed(true) })
      .finally(() => { if (live.current) setExporting(false) })
  }

  const items: ActionsMenuItem[] = [
    {
      label: 'View code',
      icon: <Code2 size={13} className="text-zinc-500" aria-hidden />,
      disabled: !delivery.artifacts,
      onSelect: onViewCode,
    },
    {
      label: exporting ? 'Preparing' : failed ? 'Export failed' : 'Download .epe',
      icon: exporting
        ? <RotateCw size={13} className="animate-spin text-zinc-500" aria-hidden />
        : <Download size={13} className="text-zinc-500" aria-hidden />,
      disabled: !delivery.artifacts || exporting,
      onSelect: exportEpe,
    },
  ]
  return <ActionsMenu label="Show actions" items={items} portaled />
}
