import type { Route } from '@/engine/routes'

export const studioWelcomeAcknowledgedKey = 'pxlblz:studio-welcome-acknowledged'

export type StudioAccessDecision = 'allow' | 'show-welcome' | 'sign-in'

export function decideStudioAccess(input: {
  route: Route
  personalWorkspaceResolved: boolean
  personalWorkspaceAuthenticated: boolean
  activeDemoName: string | null
  studioWelcomeAcknowledged: boolean
}): StudioAccessDecision {
  if (input.route.kind !== 'studio') return 'allow'
  if (!input.personalWorkspaceResolved || input.personalWorkspaceAuthenticated) return 'allow'
  if (input.activeDemoName !== null) return 'allow'
  return input.studioWelcomeAcknowledged ? 'sign-in' : 'show-welcome'
}
