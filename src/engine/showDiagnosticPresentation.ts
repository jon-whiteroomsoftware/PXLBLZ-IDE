const INTERNAL_SCENE_PATH = /\bscenes\[/gi
const INTERNAL_SCENE_FIELD = /\.sceneId\b/gi
const INTERNAL_SCENE_ID_SUFFIX = /@scene-[A-Za-z0-9._-]+/gi
const MISSING_INTERNAL_SCENE = /Show composition scenes\[(\d+)\]\.sceneId: Scene "[^"]+" does not exist\./gi
const SCENE_EXIT_TOKEN = /\bscene-exit\b/gi
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
    .replace(INTERNAL_SCENE_PATH, 'timeline[')
    .replace(INTERNAL_SCENE_FIELD, '.intervalId')
    .replace(ADJACENT_SCENES, 'both adjacent Clips')
    .replace(SCENES_TERM, '$1Show intervals')
    .replace(SCENE_TERM, '$1Show interval')
}
