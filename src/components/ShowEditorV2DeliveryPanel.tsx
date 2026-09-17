import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { downloadBrowserFile } from '@/engine/browserDownload'
import { buildShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { qualifyShowV2PilotArtifacts } from '@/engine/showV2Pilot'
import { buildShowV2RouteSummary } from '@/engine/showV2RouteDelivery'
import { useShowStore } from '@/store/showStore'
import { Button } from './ui/button'
import { ShowArtifactInventoryBody } from './ShowArtifactInventoryPopover'
import { useShowV2ControllerDelivery } from './useShowV2ControllerDelivery'
import type { ShowV2EditCaptureBinding } from './useShowV2EditCapture'
import { downloadShowV2Epe, SHOW_V2_APP_VERSION as APP_VERSION, type ShowV2RouteArtifactState } from './useShowV2RouteArtifacts'

/**
 * The v2 editor route's Show summary, artifact inventory, exports and
 * Controller delivery (#1056 slice 6).
 *
 * Everything reads the one prepared capture the route owns, so the numbers
 * here, the Stage preview above and the bytes a Controller receives all
 * describe the same compiled Show. The panel writes no record: its only
 * mutation is the Show's own name, which goes through the landed store owner.
 */
export function ShowEditorV2DeliveryPanel({
  showId,
  binding,
  delivery,
}: {
  showId: string
  binding: ShowV2EditCaptureBinding
  /** The one artifact build the route owns; the header's Show actions read it too. */
  delivery: ShowV2RouteArtifactState
}) {
  const { capture, isCurrentCapture } = binding
  const reload = useShowStore((state) => state.reloadShowV2Pilot)
  const [status, setStatus] = useState('')
  const generation = useRef(0)
  const live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])

  const record = capture?.record ?? null
  const summary = useMemo(() => (record ? buildShowV2RouteSummary(record) : null), [record])
  const { bundle, artifacts, blockedReason } = delivery
  useShowV2ControllerDelivery({
    showId,
    name: record?.name ?? 'Show',
    bundle,
    artifacts,
    blockedReason,
  })

  /**
   * One command's outcome, published only if it is still the newest one this
   * panel started and the route still holds the capture it read. A completion
   * that arrives after the record, its dependencies or the provider changed
   * describes a Show that is no longer on screen, so it says nothing.
   *
   * `Reload saved v2` replaces the record itself, so it asks for the newest
   * operation only.
   */
  const run = async (label: string, work: () => Promise<string>, options: { readsCapture?: boolean } = {}) => {
    const readsCapture = options.readsCapture ?? true
    const token = ++generation.current
    const current = () => live.current && generation.current === token && (!readsCapture || isCurrentCapture())
    try {
      const message = await work()
      if (current()) setStatus(message)
    } catch (error) {
      if (current()) setStatus(error instanceof Error ? `${label} failed: ${error.message}` : `${label} failed.`)
    }
  }

  const exportShowFile = () => run('Export', async () => {
    if (!record || !capture) throw new Error('This Show is not open.')
    const { filename, bundle: file } = buildShowFileBundle(record, {
      patterns: capture.dependencies.patterns,
      maps: capture.dependencies.maps,
      libraries: capture.dependencies.libraries,
    }, { appVersion: APP_VERSION })
    const bytes = await serializeShowFileBundle(file)
    downloadBrowserFile(filename, Uint8Array.from(bytes), 'application/gzip')
    return `Exported ${filename} (${bytes.byteLength} bytes).`
  })

  const exportEpe = () => run('Export', async () => {
    if (!bundle || !artifacts) throw new Error(blockedReason ?? 'This Show cannot be exported yet.')
    return downloadShowV2Epe(bundle)
  })

  const reopenArtifacts = () => run('Reopen', async () => {
    if (!bundle) throw new Error(blockedReason ?? 'This Show cannot be exported yet.')
    const result = await qualifyShowV2PilotArtifacts(bundle, { appVersion: APP_VERSION })
    return `Reopened .pxlshow v2 and .epe (${result.pxlshowBytes.byteLength} bytes).`
  })

  const reloadSaved = () => run('Reload', async () => {
    const reopened = await reload(showId)
    return reopened ? 'Reloaded v2 bytes from the provider.' : 'No saved v2 record was found.'
  }, { readsCapture: false })

  return (
    <section
      aria-label="Show summary and delivery"
      data-testid="show-editor-v2-delivery"
      className="border-t border-zinc-800 px-3 py-3 text-zinc-300"
    >
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Show</h2>
      {summary && (
        <dl
          data-testid="show-editor-v2-summary"
          data-show-record-version={summary.recordVersion}
          className="mt-2 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-[11px]"
        >
          <dt className="text-zinc-500">Format</dt><dd>v{summary.recordVersion}</dd>
          <dt className="text-zinc-500">Show End</dt><dd className="tabular-nums">{(summary.showEndMs / 1_000).toFixed(2)}s</dd>
          <dt className="text-zinc-500">Content</dt>
          <dd className="tabular-nums">
            {summary.zoneCount} {summary.zoneCount === 1 ? 'Zone' : 'Zones'} · {summary.layerCount}{' '}
            {summary.layerCount === 1 ? 'Layer' : 'Layers'} · {summary.effectiveClipCount}{' '}
            {summary.effectiveClipCount === 1 ? 'Clip' : 'Clips'} · {summary.patternInstanceCount}{' '}
            {summary.patternInstanceCount === 1 ? 'Pattern instance' : 'Pattern instances'}
          </dd>
          <dt className="text-zinc-500">Timeline</dt>
          <dd className="tabular-nums">
            {summary.transitionCount} {summary.transitionCount === 1 ? 'Transition' : 'Transitions'} ·{' '}
            {summary.layoutOccurrenceCount} Zone Layout{summary.layoutOccurrenceCount === 1 ? '' : 's'} ·{' '}
            {summary.markerCount} Marker{summary.markerCount === 1 ? '' : 's'} · {summary.groupOccurrenceCount} Group
            {summary.groupOccurrenceCount === 1 ? '' : 's'}
          </dd>
        </dl>
      )}

      <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Artifact</h3>
      {artifacts ? (
        <div className="mt-2">
          <p
            data-testid="show-editor-v2-artifact-gauge"
            className="mb-1.5 font-mono text-[10px] tabular-nums text-zinc-400"
          >
            {formatBytes(artifacts.deliveredBytes)} / {formatBytes(artifacts.budgetBytes)} · VM{' '}
            {artifacts.vmWords.used.toLocaleString('en-US')}/{artifacts.vmWords.budget.toLocaleString('en-US')} words ·
            up to {artifacts.renderers.controller.worst} copies
          </p>
          <ShowArtifactInventoryBody
            inventory={artifacts.inventory}
            model={artifacts.model}
            vmWords={artifacts.vmWords}
            renderers={artifacts.renderers}
            structure={artifacts.structure}
          />
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-500">{blockedReason ?? 'Preparing Show…'}</p>
      )}

      <div role="group" aria-label="Show artifacts" className="mt-4 flex flex-wrap gap-2">
        <Button size="xs" variant="outline" disabled={!record} onClick={() => void exportShowFile()}>
          Export .pxlshow
        </Button>
        <Button size="xs" variant="outline" disabled={!artifacts} onClick={() => void exportEpe()}>
          Export .epe
        </Button>
        <Button size="xs" variant="outline" disabled={!bundle} onClick={() => void reopenArtifacts()}>
          Reopen artifacts
        </Button>
        <Button size="xs" variant="outline" onClick={() => void reloadSaved()}>
          Reload saved v2
        </Button>
      </div>
      <output
        aria-live="polite"
        data-testid="show-editor-v2-delivery-status"
        className="mt-2 block min-h-4 text-[11px] leading-4 text-zinc-400"
      >
        {status}
      </output>
    </section>
  )
}

function formatBytes(bytes: number): string {
  return bytes < 1_024 ? `${bytes} B` : `${(bytes / 1_024).toFixed(1)} kB`
}
