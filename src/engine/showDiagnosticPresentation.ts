const INTERNAL_SCENE_PATH = /\bscenes\[/gi
const INTERNAL_SCENE_FIELD = /\.sceneId\b/gi
const INTERNAL_SCENE_ID_SUFFIX = /@scene-[A-Za-z0-9._-]+/gi
const MISSING_INTERNAL_SCENE = /Show composition scenes\[(\d+)\]\.sceneId: Scene "[^"]+" does not exist\./gi
const SCENE_EXIT_TOKEN = /\bscene-exit\b/gi
const SCENE_LOCAL_PLACEMENT_BOUND = /\b(Main|Overlay) placement must stay inside positive Scene-local time\b/gi
const ADJACENT_SCENES = /\bboth adjacent scenes\b/gi
const SCENES_TERM = /(^|[^-\w])scenes(?=$|[^-\w])/gi
const SCENE_TERM = /(^|[^-\w])scene(?=$|[^-\w])/gi
const STATIC_CLIP_SCENE_CONSTRAINT = /one static, unkeyed placement (?:on|in) a single-zone routed Scene/gi

export function presentShowDiagnostic(message: string): string {
  return message
    .replace(
      MISSING_INTERNAL_SCENE,
      'Show composition timeline[$1].intervalId: Referenced Show interval does not exist.',
    )
    .replace(INTERNAL_SCENE_ID_SUFFIX, '')
    .replace(
      STATIC_CLIP_SCENE_CONSTRAINT,
      'one static, unkeyed Clip on a single Zone for its full interval',
    )
    .replace(SCENE_EXIT_TOKEN, 'interval-end')
    .replace(SCENE_LOCAL_PLACEMENT_BOUND, '$1 Clip must stay inside its Show interval')
    .replace(INTERNAL_SCENE_PATH, 'timeline[')
    .replace(INTERNAL_SCENE_FIELD, '.intervalId')
    .replace(ADJACENT_SCENES, 'both adjacent Clips')
    .replace(SCENES_TERM, '$1Show intervals')
    .replace(SCENE_TERM, '$1Show interval')
}

/** Keep the persistent bottom tray scannable; full diagnostics remain in titles. */
export function presentShowTrayDiagnostic(message: string): string {
  const presented = presentShowDiagnostic(message)
  let match = presented.match(/^Routing layout "([^"]+)" leaves ([\d,]+) of [\d,]+ physical pixels unassigned;/)
  if (match) return `Layout "${match[1]}": ${match[2]} pixels render black.`

  match = presented.match(/^Routing layout "([^"]+)" assigns overlapping pixels /)
  if (match) return `Layout "${match[1]}": overlapping Clips; first wins.`

  match = presented.match(/^Freeze at entry for clip "([^"]+)" fell back to Live/)
  if (match) return `Freeze "${match[1]}" fell back to Live.`

  match = presented.match(/^Refresh for clip "([^"]+)" fell back to Live/)
  if (match) return `Refresh "${match[1]}" fell back to Live.`

  match = presented.match(/^Rolling Refresh for clip "([^"]+)" fell back to Live/)
  if (match) return `Rolling Refresh "${match[1]}" fell back to Live.`

  match = presented.match(/^Whole Show arrays require ([\d,]+) VM words, [\d,]+ over the ([\d,]+)-word budget\./)
  if (match) return `VM arrays: ${match[1]} / ${match[2]} words.`

  match = presented.match(/^Whole Show code declares ([\d,]+) persistent globals, [\d,]+ over the ([\d,]+)-global limit\./)
  if (match) return `Globals: ${match[1]} / ${match[2]}.`

  match = presented.match(/^Show output contract requests ([\d,]+) pixels; compiled Shows support at most ([\d,]+)\./)
  if (match) return `Output: ${match[1]} px exceeds ${match[2]} px.`

  if (presented.startsWith('Trails output Effect was disabled')) return 'Trails fell back to Live.'
  if (presented.startsWith('Snapshot/live crossfade fell back')) return 'Snapshot crossfade fell back to Live.'
  if (presented.startsWith('Snapshot/live cache ')) return 'Snapshot crossfade fell back to Live.'

  return presented
}
