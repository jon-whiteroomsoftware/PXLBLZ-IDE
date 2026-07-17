import { PIXELBLAZE_ARRAY_HEADER_WORDS } from './showVmResourceLedger'

export const SHOW_RENDER_TARGET_PLANE_NAMES = [
  '__pxlblz_show_rt_plane_0',
  '__pxlblz_show_rt_plane_1',
  '__pxlblz_show_rt_plane_2',
] as const

const SHOW_RENDER_TARGET_ROLE_CHANNELS = {
  'stage-rgb': { r: 0, g: 1, b: 2 },
  'sample-xy': { x: 0, y: 1 },
  'scalar-field': { value: 0 },
  'previous-rgb': { r: 0, g: 1, b: 2 },
} as const

export type ShowRenderTargetRole = keyof typeof SHOW_RENDER_TARGET_ROLE_CHANNELS
export type ShowRenderTargetChannel<R extends ShowRenderTargetRole> = keyof (typeof SHOW_RENDER_TARGET_ROLE_CHANNELS)[R] & string

export interface ShowRenderTargetPlan<R extends ShowRenderTargetRole = ShowRenderTargetRole> {
  elementCount: number
  planeCount: 3
  words: number
  activeRole: R
  planes: typeof SHOW_RENDER_TARGET_PLANE_NAMES
  binding: {
    role: R
    channels: (typeof SHOW_RENDER_TARGET_ROLE_CHANNELS)[R]
  }
}

export interface ShowRenderTargetArenaSummary {
  elementCount: number
  planeCount: 3
  words: number
  emitted: boolean
  activeRole: ShowRenderTargetRole | null
  roleBindings: Array<{
    role: ShowRenderTargetRole
    channels: Record<string, 0 | 1 | 2>
  }>
}

export function describeShowRenderTargetArena(
  pixelCount: number,
  emitted = true,
  activeRole: ShowRenderTargetRole | null = null,
): ShowRenderTargetArenaSummary {
  const elementCount = normalizeElementCount(pixelCount)
  return {
    elementCount,
    planeCount: SHOW_RENDER_TARGET_PLANE_NAMES.length,
    words: SHOW_RENDER_TARGET_PLANE_NAMES.length * (elementCount + PIXELBLAZE_ARRAY_HEADER_WORDS),
    emitted,
    activeRole,
    roleBindings: (Object.entries(SHOW_RENDER_TARGET_ROLE_CHANNELS) as Array<[
      ShowRenderTargetRole,
      Record<string, 0 | 1 | 2>,
    ]>).map(([role, channels]) => ({ role, channels })),
  }
}

export function planShowRenderTargetArena<R extends ShowRenderTargetRole>(
  pixelCount: number,
  activeRole: R,
): ShowRenderTargetPlan<R> {
  const elementCount = normalizeElementCount(pixelCount)
  return {
    elementCount,
    planeCount: SHOW_RENDER_TARGET_PLANE_NAMES.length,
    words: SHOW_RENDER_TARGET_PLANE_NAMES.length * (elementCount + PIXELBLAZE_ARRAY_HEADER_WORDS),
    activeRole,
    planes: SHOW_RENDER_TARGET_PLANE_NAMES,
    binding: {
      role: activeRole,
      channels: SHOW_RENDER_TARGET_ROLE_CHANNELS[activeRole],
    },
  }
}

export function emitShowRenderTargetRead<R extends ShowRenderTargetRole>(
  plan: ShowRenderTargetPlan<R>,
  channel: ShowRenderTargetChannel<R>,
  indexExpression: string,
): string {
  return `${planeName(plan, channel)}[${indexExpression}]`
}

export function emitShowRenderTargetWrite<R extends ShowRenderTargetRole>(
  plan: ShowRenderTargetPlan<R>,
  channel: ShowRenderTargetChannel<R>,
  indexExpression: string,
  valueExpression: string,
): string {
  return `${emitShowRenderTargetRead(plan, channel, indexExpression)} = ${valueExpression}`
}

/** Emits the one compiler-owned physical arena shared by every Show cache role. */
export function emitShowRenderTargetArenaSource(pixelCount: number): string {
  const elementCount = normalizeElementCount(pixelCount)
  return SHOW_RENDER_TARGET_PLANE_NAMES
    .map((name) => `var ${name} = array(${elementCount})`)
    .join('\n')
}

function normalizeElementCount(pixelCount: number): number {
  return Number.isFinite(pixelCount) ? Math.max(0, Math.floor(pixelCount)) : 0
}

function planeName<R extends ShowRenderTargetRole>(
  plan: ShowRenderTargetPlan<R>,
  channel: ShowRenderTargetChannel<R>,
): string {
  const planeIndex = (plan.binding.channels as Record<string, number>)[channel]
  if (planeIndex === undefined) throw new Error(`Render-target role ${plan.activeRole} has no ${channel} channel.`)
  return plan.planes[planeIndex]
}
