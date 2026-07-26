const INTERNAL_SCENE_PATH = /\bscenes\[/gi
const INTERNAL_SCENE_ID_SUFFIX = /@scene-[^"\s]+/gi
const ADJACENT_SCENES = /\bboth adjacent scenes\b/gi
const SCENES_TERM = /\bscenes\b/gi
const SCENE_TERM = /\bscene\b/gi
const STATIC_CLIP_SCENE_CONSTRAINT = /one static, unkeyed placement (?:on|in) a single-zone routed Scene/gi

export function presentShowDiagnostic(message: string): string {
  return message
    .replace(INTERNAL_SCENE_ID_SUFFIX, '')
    .replace(
      STATIC_CLIP_SCENE_CONSTRAINT,
      'one static, unkeyed Clip on a single Zone for its full interval',
    )
    .replace(INTERNAL_SCENE_PATH, 'timeline[')
    .replace(ADJACENT_SCENES, 'both adjacent Clips')
    .replace(SCENES_TERM, 'Show intervals')
    .replace(SCENE_TERM, 'Show interval')
}
