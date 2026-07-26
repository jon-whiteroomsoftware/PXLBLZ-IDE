const INTERNAL_SCENE_TERM = /\bscenes?\b|scenes\[/i
const STATIC_CLIP_SCENE_CONSTRAINT = /one static, unkeyed placement (?:on|in) a single-zone routed Scene/gi

export function presentShowDiagnostic(message: string): string {
  const reframed = message.replace(
    STATIC_CLIP_SCENE_CONSTRAINT,
    'one static, unkeyed Clip on a single Zone for its full interval',
  )
  if (!INTERNAL_SCENE_TERM.test(reframed)) return reframed
  return 'Show compilation failed because one or more Clips have invalid timing, Layer, or boundary configuration.'
}
