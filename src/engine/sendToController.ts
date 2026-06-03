// Pure gating logic for the "Send to Controller" action (H9, issue #201). Decides
// whether the editor-header Send button is enabled, and — when it isn't — the
// reason to surface. No React, no transport specifics; the button is a thin shell
// over this.
//
// Send is gated on two conditions (the H9 lens): a Controller is connected, AND
// the open pattern's dimensionality matches the Controller's installed map. The
// map dimensionality comes from reading the installed pixel map back through the
// provider seam (getPixelMap) — an unconfirmed firmware capability (H13) pulled
// forward here. When it can't be read (mapDim === null) we deliberately do NOT
// block: we can't prove a mismatch, and a permanently-disabled Send would be worse
// than letting a confident user push. So the dimensionality check applies only
// when the map dimension is actually known.

import type { ControllerStatus } from './ControllerProvider'

/** A pattern/map coordinate dimension, or null when it isn't known. */
export type MapDimension = 1 | 2 | 3 | null

/** Derive a pixel map's dimensionality from its coordinate tuples: the arity of
 *  the first point (1/2/3). Returns null for an empty/absent/malformed map. */
export function mapDimension(map: number[][] | null | undefined): MapDimension {
  if (!map || map.length === 0) return null
  const first = map[0]
  if (!Array.isArray(first)) return null
  const d = first.length
  return d === 1 || d === 2 || d === 3 ? d : null
}

export interface SendGateInput {
  /** Current Controller connection status. */
  status: ControllerStatus
  /** The open pattern's native (coordinate) dimensionality. */
  patternDim: 1 | 2 | 3
  /** The connected Controller's installed-map dimensionality, or null if unknown. */
  mapDim: MapDimension
  /** Editor compile state — a broken pattern can't be compiled or pushed. Defaults
   *  to 'good' when omitted (the H9 gate predates this). */
  compileStatus?: 'good' | 'broken'
  /** True when the open pattern's current source already matches what was last
   *  pushed to this Controller — nothing to send until it's edited. Defaults false. */
  alreadyPushed?: boolean
}

export interface SendGate {
  /** Whether the Send button is actionable. */
  enabled: boolean
  /** Why it's disabled — surfaced as the button's tooltip. Absent when enabled. */
  reason?: string
}

/** Decide whether Send-to-Controller is enabled, and why not when it isn't. */
export function describeSendToController({
  status,
  patternDim,
  mapDim,
  compileStatus = 'good',
  alreadyPushed = false,
}: SendGateInput): SendGate {
  if (status.kind !== 'connected') {
    return { enabled: false, reason: 'Connect a Controller to send' }
  }
  if (compileStatus !== 'good') {
    return { enabled: false, reason: "Fix the pattern's errors before sending" }
  }
  if (mapDim !== null && mapDim !== patternDim) {
    return {
      enabled: false,
      reason: `Pattern is ${patternDim}D but the Controller's map is ${mapDim}D`,
    }
  }
  if (alreadyPushed) {
    return { enabled: false, reason: 'No changes since the last send' }
  }
  return { enabled: true }
}
