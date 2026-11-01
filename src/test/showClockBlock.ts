import { SHOW_CLOCK_LOOP_HOLD } from '@/engine/showClockEmit'

export { SHOW_CLOCK_LOOP_HOLD }

/**
 * The Show clock advance at the top of an artifact's `beforeRender`, read from
 * `expandedCode`: every line up to the `__pxlblz_show_elapsed_s` derivation,
 * plus the loop-point hold when the clock wraps.
 */
export function showClockBlock(expandedCode: string): string {
  const lines = expandedCode.slice(expandedCode.indexOf('export function beforeRender')).split('\n')
  const derived = lines.findIndex(line => line.trim().startsWith('__pxlblz_show_elapsed_s = '))
  if (derived < 0) throw new Error('No Show clock advance found in beforeRender.')
  const end = lines[derived + 1]?.trim().startsWith(SHOW_CLOCK_LOOP_HOLD) ? derived + 2 : derived + 1
  return lines.slice(1, end).join('\n')
}
