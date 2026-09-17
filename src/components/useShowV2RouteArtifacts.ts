import { useMemo } from 'react'
import { bytesToBase64 } from '@/engine/RelayWebSocket'
import { downloadBrowserFile } from '@/engine/browserDownload'
import { makeProgramId } from '@/engine/bytecodePush'
import { buildPreviewJpeg } from '@/engine/previewThumbnailJpeg'
import { buildShowV2RouteArtifacts, type ShowV2RouteArtifacts } from '@/engine/showV2RouteDelivery'
import type { ShowPreparedStageBundleV2 } from '@/engine/showPreparedStageV2'
import type { ShowV2EditCapture } from './useShowV2EditCapture'

export const SHOW_V2_APP_VERSION = typeof __PXLBLZ_APP_VERSION__ === 'string' ? __PXLBLZ_APP_VERSION__ : 'dev'

export interface ShowV2RouteArtifactState {
  bundle: ShowPreparedStageBundleV2 | null
  artifacts: ShowV2RouteArtifacts | null
  /** Why there is nothing to deliver, when there is nothing to deliver. */
  blockedReason: string | null
}

/**
 * One artifact build per prepared capture, shared by the route header's Show
 * actions and the delivery panel beneath it (#1039).
 *
 * The header's View code and Download .epe are the same two entry points the v1
 * editor's Show actions menu offers, and they must describe the same compiled
 * Show the panel's inventory and Send to Controller do. Building this once and
 * handing it to both is what keeps that true - and keeps the compile off the
 * second consumer.
 */
export function useShowV2RouteArtifacts(capture: ShowV2EditCapture | null): ShowV2RouteArtifactState {
  const prepared = capture?.prepared ?? null
  const bundle = prepared?.status === 'ready' ? prepared.bundle : null
  const built = useMemo(
    () => (bundle ? buildShowV2RouteArtifacts(bundle, { appVersion: SHOW_V2_APP_VERSION }) : null),
    [bundle],
  )
  const artifacts = built?.status === 'ready' ? built.artifacts : null
  const blockedReason = prepared === null
    ? 'Preparing Show…'
    : prepared.status === 'refused'
      ? prepared.message
      : prepared.status === 'empty'
        ? 'Add content to the Show before sending it.'
        : built?.status === 'refused' ? built.message : null
  return { bundle, artifacts, blockedReason }
}

/**
 * Write the canonical `.epe` a Controller would receive, stamped with a fresh
 * program id and the preview image the firmware shows, exactly as the v1 route's
 * download does and under the same filename its exporter produces.
 *
 * One implementation for both entry points: the delivery panel's Export .epe and
 * the route header's Download .epe.
 */
export async function downloadShowV2Epe(bundle: ShowPreparedStageBundleV2): Promise<string> {
  const preview = await buildPreviewJpeg(bundle.artifact)
  if (!preview) throw new Error('Could not render the EPE preview image')
  const stamped = buildShowV2RouteArtifacts(bundle, {
    appVersion: SHOW_V2_APP_VERSION,
    exportedAt: new Date(bundle.record.updatedAt),
    id: makeProgramId(),
    preview: bytesToBase64(preview),
  })
  if (stamped.status === 'refused') throw new Error(stamped.message)
  downloadBrowserFile(stamped.artifacts.epe.filename, stamped.artifacts.epe.text, 'application/json')
  return `Exported ${stamped.artifacts.epe.filename}.`
}
