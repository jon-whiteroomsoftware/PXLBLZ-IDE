import { describeControllerActionRow } from './controllerActionRow'
import type { Route } from './routes'

const connected = {
  kind: 'connected' as const,
  controller: { id: 'c1', address: '10.0.0.5', deviceId: 'c1', name: 'Desk' },
}
const studioPattern: Route = {
  kind: 'studio',
  entity: { kind: 'patterns', id: 'pattern-1' },
}

describe('describeControllerActionRow', () => {
  it('enables both verbs for a clean open Studio pattern and names their subject', () => {
    expect(describeControllerActionRow({
      route: studioPattern,
      patternName: 'Aurora Drift',
      status: connected,
      compileStatus: 'good',
      runAlreadyPushed: false,
      saveAlreadyPushed: false,
      working: false,
    })).toEqual({
      subject: 'Aurora Drift',
      run: { enabled: true },
      save: { enabled: true },
    })
  })

  it.each<Route>([
    { kind: 'gallery' },
    { kind: 'pattern-detail', slug: 'aurora-drift' },
    { kind: 'studio', entity: { kind: 'shows', id: 'show-1' } },
  ])('disables stale pattern state outside the Studio pattern surface: $kind', (route) => {
    const view = describeControllerActionRow({
      route,
      patternName: 'Aurora Drift',
      status: connected,
      compileStatus: 'good',
      runAlreadyPushed: false,
      saveAlreadyPushed: false,
      working: false,
    })

    expect(view.subject).toBeNull()
    expect(view.run).toEqual({
      enabled: false,
      reason: 'Open a pattern to push it to this Controller',
    })
    expect(view.save).toEqual(view.run)
  })

  it('keeps run and save dirty state independent', () => {
    const view = describeControllerActionRow({
      route: studioPattern,
      patternName: 'Aurora Drift',
      status: connected,
      compileStatus: 'good',
      runAlreadyPushed: true,
      saveAlreadyPushed: false,
      working: false,
    })

    expect(view.run).toEqual({ enabled: false, reason: 'No changes since the last send' })
    expect(view.save).toEqual({ enabled: true })
  })

  it('keeps the pattern subject visible while a compile failure gates both actions', () => {
    const view = describeControllerActionRow({
      route: studioPattern,
      patternName: 'Broken Glass',
      status: connected,
      compileStatus: 'broken',
      runAlreadyPushed: false,
      saveAlreadyPushed: false,
      working: false,
    })

    expect(view.subject).toBe('Broken Glass')
    expect(view.run).toEqual({
      enabled: false,
      reason: "Fix the pattern's errors before sending",
    })
    expect(view.save).toEqual(view.run)
  })

  it('disables both verbs while either push mode is working', () => {
    const view = describeControllerActionRow({
      route: studioPattern,
      patternName: 'Aurora Drift',
      status: connected,
      compileStatus: 'good',
      runAlreadyPushed: false,
      saveAlreadyPushed: false,
      working: true,
    })

    expect(view.subject).toBe('Aurora Drift')
    expect(view.run).toEqual({ enabled: false, reason: 'Sending…' })
    expect(view.save).toEqual(view.run)
  })
})
