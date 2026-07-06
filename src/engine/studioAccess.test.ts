import { decideStudioAccess } from './studioAccess'

describe('decideStudioAccess', () => {
  it('allows non-studio routes', () => {
    expect(
      decideStudioAccess({
        route: { kind: 'gallery' },
        personalWorkspaceResolved: true,
        personalWorkspaceAuthenticated: false,
        activeDemoName: null,
        studioWelcomeAcknowledged: false,
      }),
    ).toBe('allow')
  })

  it('waits for the auth probe before gating Studio', () => {
    expect(
      decideStudioAccess({
        route: { kind: 'studio', entity: null },
        personalWorkspaceResolved: false,
        personalWorkspaceAuthenticated: false,
        activeDemoName: null,
        studioWelcomeAcknowledged: false,
      }),
    ).toBe('allow')
  })

  it('allows signed-in Studio access', () => {
    expect(
      decideStudioAccess({
        route: { kind: 'studio', entity: null },
        personalWorkspaceResolved: true,
        personalWorkspaceAuthenticated: true,
        activeDemoName: null,
        studioWelcomeAcknowledged: false,
      }),
    ).toBe('allow')
  })

  it('allows read-only demo handoff into Studio while signed out', () => {
    expect(
      decideStudioAccess({
        route: { kind: 'studio', entity: null },
        personalWorkspaceResolved: true,
        personalWorkspaceAuthenticated: false,
        activeDemoName: 'IridescentFibers',
        studioWelcomeAcknowledged: false,
      }),
    ).toBe('allow')
  })

  it('shows the one-time welcome before OAuth', () => {
    expect(
      decideStudioAccess({
        route: { kind: 'studio', entity: null },
        personalWorkspaceResolved: true,
        personalWorkspaceAuthenticated: false,
        activeDemoName: null,
        studioWelcomeAcknowledged: false,
      }),
    ).toBe('show-welcome')
  })

  it('skips the welcome after it has been acknowledged', () => {
    expect(
      decideStudioAccess({
        route: { kind: 'studio', entity: null },
        personalWorkspaceResolved: true,
        personalWorkspaceAuthenticated: false,
        activeDemoName: null,
        studioWelcomeAcknowledged: true,
      }),
    ).toBe('sign-in')
  })
})
