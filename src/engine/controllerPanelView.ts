// Pure presentation logic for the Controller panel telemetry (H6, issue #198).
// Maps the polled live state — active program id + the device's program list +
// reported FPS — into the read-only display strings the panel renders. No React,
// no transport specifics; the panel is a thin wrapper over this.

import type { ProgramListEntry } from './PixelblazeConnection'

export interface ControllerPanelTelemetry {
  /** Id of the program the Controller is currently running, if any. */
  activeProgramId?: string
  /** The Controller's stored program list, used to resolve the id to a name. */
  programs: ProgramListEntry[]
  /** Device-reported frame rate; `null` until a frame rate has been reported. */
  fps: number | null
}

export interface ControllerPanelView {
  /** Human label for the active pattern: its name, else the raw id, else '—'. */
  patternName: string
  /** FPS to one decimal, or '—' when not yet reported. */
  fpsLabel: string
}

const PLACEHOLDER = '—'

/** Describe the polled Controller state for the panel's read-only telemetry. */
export function describeControllerPanel({
  activeProgramId,
  programs,
  fps,
}: ControllerPanelTelemetry): ControllerPanelView {
  const match = activeProgramId
    ? programs.find((p) => p.id === activeProgramId)
    : undefined
  const patternName = match?.name ?? activeProgramId ?? PLACEHOLDER
  const fpsLabel = fps === null ? PLACEHOLDER : fps.toFixed(1)
  return { patternName, fpsLabel }
}
