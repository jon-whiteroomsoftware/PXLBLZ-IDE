import type { ShowClipInspectorValue } from './showClipInspectorModel'

/**
 * Tab partition for the Clip Entity Detail Panel (#642).
 *
 * The cut is by *ownership*, not by rarity. Pattern holds everything belonging
 * to the Pattern instance - source, clock, controls, sharing, Stutter - so a
 * change there may reach every Clip linked to that instance. Playback holds
 * only what describes how this one placement presents and evaluates it.
 *
 * That is why there is no "Advanced" tab: filing controls by how often they are
 * touched produced a drawer with seven unrelated things in it.
 */
export type ShowClipDetailTabId = 'pattern' | 'place' | 'effects' | 'playback'

export interface ShowClipDetailTab {
  id: ShowClipDetailTabId
  label: string
  /** False when the tab cannot exist for this Clip at all, e.g. Place off a 2D Stage. */
  applicable: boolean
  /** True when the Clip carries a non-default value this tab owns. */
  authored: boolean
}

const TAB_LABELS: Record<ShowClipDetailTabId, string> = {
  pattern: 'Pattern',
  place: 'Place',
  effects: 'Effects',
  playback: 'Playback',
}

const TAB_ORDER: ShowClipDetailTabId[] = ['pattern', 'place', 'effects', 'playback']

export interface ShowClipDetailTabInput {
  value: ShowClipInspectorValue
  /** The Stage is 2D. Placement is meaningless otherwise, so the tab disappears. */
  transformEnabled: boolean
}

function patternAuthored(value: ShowClipInspectorValue): boolean {
  const targets = value.simulation.controlTargets
  return value.simulation.timeScale !== 1
    || value.simulation.steppedClock !== undefined
    || Object.values(targets ?? {}).some((target) => target !== undefined)
}

function placeAuthored(value: ShowClipInspectorValue): boolean {
  const { positionX, positionY, rotation, scaleX, scaleY } = value.transform
  return positionX !== 0 || positionY !== 0 || rotation !== 0 || scaleX !== 1 || scaleY !== 1
    || value.viewport.enabled
}

function effectsAuthored(value: ShowClipInspectorValue): boolean {
  return value.effects.length > 0 || value.view.mirror
}

function playbackAuthored(value: ShowClipInspectorValue): boolean {
  return value.presentation.mode !== 'live'
    || value.blink !== undefined
    || value.view.phase !== 0
    || value.evaluationPolicy !== 'live'
}

const AUTHORED: Record<ShowClipDetailTabId, (value: ShowClipInspectorValue) => boolean> = {
  pattern: patternAuthored,
  place: placeAuthored,
  effects: effectsAuthored,
  playback: playbackAuthored,
}

export function projectShowClipDetailTabs({ value, transformEnabled }: ShowClipDetailTabInput): ShowClipDetailTab[] {
  return TAB_ORDER.map((id) => ({
    id,
    label: TAB_LABELS[id],
    applicable: id === 'place' ? transformEnabled : true,
    authored: AUTHORED[id](value),
  }))
}

/**
 * Which tab to show, given what the author last chose.
 *
 * Empty and inapplicable are deliberately different. An *empty* tab is still
 * worth landing on - the empty state is content, and holding still is the whole
 * value of scanning one facet across several Clips. Only an *unavailable* tab
 * forces a fallback, and the caller must not write that fallback back to the
 * preference, so the chosen tab returns when a Clip can show it again.
 */
export function resolveShowClipDetailTab(
  preferred: ShowClipDetailTabId | undefined,
  tabs: ShowClipDetailTab[],
): ShowClipDetailTabId {
  const chosen = tabs.find((tab) => tab.id === preferred)
  if (chosen?.applicable) return chosen.id
  return tabs.find((tab) => tab.applicable)?.id ?? 'pattern'
}

/**
 * Session-scoped tab memory, keyed by panel rather than by Clip.
 *
 * Per panel because a pinned panel and a transient one are two comparison
 * surfaces; changing the tab on one must not move the other. Not per Clip
 * because the point is to hold one facet still while stepping through Clips.
 * Not persisted, because this is a viewing preference and not authored content.
 */
const tabMemory = new Map<string, ShowClipDetailTabId>()

export function recallShowClipDetailTab(panelKey: string): ShowClipDetailTabId | undefined {
  return tabMemory.get(panelKey)
}

export function rememberShowClipDetailTab(panelKey: string, tab: ShowClipDetailTabId): void {
  tabMemory.set(panelKey, tab)
}

/** Test seam; the app never clears the memory during a session. */
export function resetShowClipDetailTabMemory(): void {
  tabMemory.clear()
}
