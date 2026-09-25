import { presentShowDiagnostic } from './showDiagnosticPresentation'
import { installationCoverageBlockingMessage } from './showInstallationCoverage'
import { validateInstallationCoverageV2 } from './showInstallationCoverageV2'
import { portableTargetPixelBlocker, type CompiledShowState } from './showPreviewArtifact'
import { showV2DeliveryRefusal } from './showV2RouteDelivery'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import type { ShowEpeExport } from './showEpeExport'
import { assessShowCompilePressure, type ShowCompilePressureAssessment } from './showCompilePressure'
import { deliveredShowSourceBytes } from './showSourceInventory'
import {
  prepareShowControllerArtifact,
  type PreparedShowControllerArtifact,
  type ShowControllerCompatibilityContext,
} from './showControllerArtifact'
import type { ArtifactStampMeta } from './artifactStamp'
import type { MapRecord } from './personalContentRecords'
import type { ShowRecordV2 } from './showCompositionV2'
import {
  captureShowStageEditV2,
  type ShowPreparedStageDependenciesV2,
  type ShowPreparedStageResultV2,
} from './showPreparedStageV2'

/**
 * The v2 Show Controller delivery chain (#1129): compile, export, pressure and
 * Controller preparation, in the order the Show editor applies them. The editor
 * calls the four steps from its memos; Controller reconciliation calls the
 * composite from a record outside React. One owner, so both build the same
 * deliverable.
 */

export interface ShowV2ControllerTarget {
  mapDim: 1 | 2 | 3 | null
  firmwareVersion: string | undefined
  compatibility: ShowControllerCompatibilityContext
}

/** The delivery view of a prepared capture: its artifact, error and first delivery refusal. */
export function compileShowV2ForDelivery({ record, prepared, targetPixelCount }: {
  record: ShowRecordV2 | null | undefined
  prepared: ShowPreparedStageResultV2 | undefined
  targetPixelCount: number | null | undefined
}): CompiledShowState {
  const targetPixels = targetPixelCount ?? undefined
  // A prepared v2 Show uses the same ordered delivery refusals as the
  // route artifact builder. Before preparation, coverage can still surface.
  const artifactBlocker = prepared?.status === 'ready'
    ? showV2DeliveryRefusal(prepared.bundle)
      ?? portableTargetPixelBlocker(record?.outputContract.kind, targetPixels)
      ?? undefined
    : record
      ? installationCoverageBlockingMessage(validateInstallationCoverageV2(record))
        ?? portableTargetPixelBlocker(record.outputContract.kind, targetPixels)
        ?? undefined
      : undefined
  if (prepared?.status === 'ready') return { artifact: prepared.bundle.artifact, error: null, artifactBlocker }
  return { artifact: null, error: prepared?.status === 'refused' ? prepared.message : null, artifactBlocker }
}

/** The export the Show would deliver, or null when there is nothing to export. */
export function exportShowV2ForDelivery(
  record: ShowRecordV2 | null | undefined,
  compiled: Pick<CompiledShowState, 'artifact'>,
  userMaps: readonly MapRecord[],
): ShowEpeExport | null {
  if (!compiled.artifact) return null
  if (!record) return null
  const exported = buildShowEpeExportV2(record, compiled.artifact.code, {
    stampedAt: new Date(record.updatedAt),
    userMaps,
    attribution: compiled.artifact.attribution,
  })
  return exported.status === 'exported' ? exported : null
}

/** Compile pressure measured against the delivered source when there is one. */
export function assessShowV2DeliveryPressure(
  compiled: Pick<CompiledShowState, 'artifact'>,
  exported: ShowEpeExport | null,
): ShowCompilePressureAssessment | null {
  return compiled.artifact
    ? assessShowCompilePressure({
        deliveredSourceBytes: exported
          ? deliveredShowSourceBytes(exported.source)
          : compiled.artifact.summary.artifactBytes,
        budgetBytes: compiled.artifact.summary.measuredDeviceBudgetBytes,
        worstInstantRenderersPerPixel: compiled.artifact.summary.worstInstantRenderersPerPixel,
      })
    : null
}

/** The source the Controller receives, or the reason it cannot be prepared. */
export function prepareShowV2ForController(
  compiled: Pick<CompiledShowState, 'artifact' | 'artifactBlocker'>,
  exported: ShowEpeExport | null,
  controller: ShowV2ControllerTarget,
): { value: PreparedShowControllerArtifact | null; error: string | null } {
  if (compiled.artifactBlocker) {
    return { value: null, error: compiled.artifactBlocker }
  }
  if (!exported) return { value: null, error: null }
  try {
    const prepared = prepareShowControllerArtifact(
      exported.source,
      controller.mapDim,
      controller.firmwareVersion,
      controller.compatibility,
    )
    // Preparation can append a renderer adapter, so re-measure the source
    // the Controller actually receives (#63 review follow-up). Bytes only:
    // renderer pressure was already assessed in compilePressure above.
    const preparedPressure = compiled.artifact
      ? assessShowCompilePressure({
          deliveredSourceBytes: deliveredShowSourceBytes(prepared.source),
          budgetBytes: compiled.artifact.summary.measuredDeviceBudgetBytes,
          worstInstantRenderersPerPixel: 0,
        })
      : null
    if (preparedPressure?.status === 'blocked') {
      return { value: null, error: preparedPressure.blocks.join(' ') }
    }
    return { value: prepared, error: null }
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : 'Could not prepare Show for Controller',
    }
  }
}

export type ShowV2ControllerDelivery =
  | { status: 'ready'; source: string; artifactStamp: ArtifactStampMeta; prepared: PreparedShowControllerArtifact }
  | { status: 'refused'; stage: 'capture' | 'blocked' | 'export' | 'pressure' | 'prepare'; message: string }

/**
 * The whole chain for one record, checked in the editor's `deliveryBlocker`
 * order, with the text the editor shows for each refusal. Unlike the editor,
 * which raises a preflight dialog on Run, a prepared artifact that is
 * `blocked` refuses here at stage `prepare`, its warnings joined as the
 * message: reconciliation skips blocked artifacts as v1 does.
 */
export function prepareShowV2ControllerDelivery(input: {
  record: ShowRecordV2
  dependencies: ShowPreparedStageDependenciesV2
  targetPixelCount: number | null | undefined
  controller: ShowV2ControllerTarget
}): ShowV2ControllerDelivery {
  const capture = captureShowStageEditV2(input.record, input.dependencies)
  const { prepared } = capture
  if (prepared.status === 'refused') {
    return { status: 'refused', stage: 'capture', message: presentShowDiagnostic(prepared.message) }
  }
  if (prepared.status !== 'ready') {
    return { status: 'refused', stage: 'capture', message: 'Show is not ready to send' }
  }
  const compiled = compileShowV2ForDelivery({ record: input.record, prepared, targetPixelCount: input.targetPixelCount })
  if (compiled.artifactBlocker) {
    return { status: 'refused', stage: 'blocked', message: presentShowDiagnostic(compiled.artifactBlocker) }
  }
  const exported = exportShowV2ForDelivery(input.record, compiled, input.dependencies.maps)
  if (!exported) return { status: 'refused', stage: 'export', message: 'Show is not ready to send' }
  const pressure = assessShowV2DeliveryPressure(compiled, exported)
  if (pressure?.status === 'blocked') {
    return { status: 'refused', stage: 'pressure', message: pressure.blocks.join(' ') }
  }
  const controllerArtifact = prepareShowV2ForController(compiled, exported, input.controller)
  if (controllerArtifact.error) return { status: 'refused', stage: 'prepare', message: controllerArtifact.error }
  if (!controllerArtifact.value) return { status: 'refused', stage: 'prepare', message: 'Show is not ready to send' }
  if (controllerArtifact.value.blocked) {
    return {
      status: 'refused',
      stage: 'prepare',
      message: controllerArtifact.value.warnings.map(warning => warning.message).join(' '),
    }
  }
  const { value } = controllerArtifact
  return { status: 'ready', source: value.source, artifactStamp: value.artifactStamp, prepared: value }
}
