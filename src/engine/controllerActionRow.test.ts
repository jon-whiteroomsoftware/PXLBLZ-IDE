import {
  describeControllerActionRow,
  projectControllerProgramMenu,
} from './controllerActionRow'
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
  it.each(['Rebuilding Show...', 'Compile error', 'Artifact blocked', 'Pressure exceeded', 'Preparation failed', 'Show is not ready to send'])(
    'preserves the Show blocker: %s', (deliveryBlocker) => {
      const view = describeControllerActionRow({
        route: { kind: 'studio', entity: { kind: 'shows', id: 'show-1' } },
        subject: { kind: 'show', id: 'show-1', name: 'Stage', deliveryBlocker, runAlreadyPushed: true, saveAlreadyPushed: true },
        patternName: 'Retained', status: { kind: 'no-extension' }, compileStatus: 'broken',
        runAlreadyPushed: false, saveAlreadyPushed: false, working: false, programsRead: true, programCount: 2,
      })
      expect(view.run).toEqual({ enabled: false, reason: deliveryBlocker })
      expect(view.save).toEqual(view.run)
    },
  )

  it.each([[true, false], [false, true], [true, true], [false, false]])('keeps Show Run %s and Save %s independent of retained Pattern state', (runAlreadyPushed, saveAlreadyPushed) => {
    const view = describeControllerActionRow({
      route: { kind: 'studio', entity: { kind: 'shows', id: 'show-1' } },
      subject: { kind: 'show', id: 'show-1', name: 'Stage', deliveryBlocker: null, runAlreadyPushed, saveAlreadyPushed },
      patternName: 'Retained', status: connected, compileStatus: 'broken',
      runAlreadyPushed: !runAlreadyPushed, saveAlreadyPushed: !saveAlreadyPushed, working: false, programsRead: true, programCount: 2,
    })
    expect(view.run).toEqual(runAlreadyPushed ? { enabled: false, reason: 'No changes since the last send' } : { enabled: true })
    expect(view.save).toEqual(saveAlreadyPushed ? { enabled: false, reason: 'No changes since the last send' } : { enabled: true })
  })

  it.each<Route>([{ kind: 'studio', entity: { kind: 'shows', id: 'other' } }, { kind: 'studio', entity: { kind: 'patterns', id: 'pattern-1' } }, { kind: 'gallery' }, { kind: 'studio', entity: null }])('refuses a prepared Show on a mismatched route: $kind', (route) => {
    const view = describeControllerActionRow({
      route, subject: { kind: 'show', id: 'show-1', name: 'Stage', deliveryBlocker: null, runAlreadyPushed: false, saveAlreadyPushed: false },
      patternName: 'Retained', status: connected, compileStatus: 'good',
      runAlreadyPushed: false, saveAlreadyPushed: false, working: false, programsRead: true, programCount: 2,
    })
    expect(view.subject).toBeNull()
    expect(view.run).toEqual({ enabled: false, reason: 'Open a Pattern or Show to push it to this Controller' })
    expect(view.save).toEqual(view.run)
  })

  it('uses the prepared Show gate instead of the retained Pattern', () => {
    const view = describeControllerActionRow({
      route: { kind: 'studio', entity: { kind: 'shows', id: 'show-1' } },
      subject: { kind: 'show', id: 'show-1', name: 'Stage', deliveryBlocker: 'Rebuilding Show...', runAlreadyPushed: false, saveAlreadyPushed: false },
      patternName: 'Stale Pattern', status: connected, compileStatus: 'good',
      runAlreadyPushed: false, saveAlreadyPushed: false, working: false,
      programsRead: true, programCount: 2,
    })
    expect(view.subject).toBe('Stage')
    expect(view.run).toEqual({ enabled: false, reason: 'Rebuilding Show...' })
    expect(view.save).toEqual(view.run)
  })

  it('enables both verbs for a clean open Studio pattern and names their subject', () => {
    expect(describeControllerActionRow({
      route: studioPattern,
      patternName: 'Aurora Drift',
      status: connected,
      compileStatus: 'good',
      runAlreadyPushed: false,
      saveAlreadyPushed: false,
      working: false,
      programsRead: true,
      programCount: 2,
    })).toEqual({
      subject: 'Aurora Drift',
      run: { enabled: true },
      save: { enabled: true },
      switch: { enabled: true },
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
      programsRead: true,
      programCount: 2,
    })

    expect(view.subject).toBeNull()
    expect(view.run).toEqual({
      enabled: false,
      reason: 'Open a Pattern or Show to push it to this Controller',
    })
    expect(view.save).toEqual(view.run)
    expect(view.switch).toEqual({ enabled: true })
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
      programsRead: true,
      programCount: 2,
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
      programsRead: true,
      programCount: 2,
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
      programsRead: true,
      programCount: 2,
    })

    expect(view.subject).toBe('Aurora Drift')
    expect(view.run).toEqual({ enabled: false, reason: 'Sending…' })
    expect(view.save).toEqual(view.run)
    expect(view.switch).toEqual({
      enabled: false,
      reason: 'Wait for the current send to finish before switching Patterns',
    })
  })

  it('distinguishes an unread inventory from a Controller with no saved Patterns', () => {
    const unread = describeControllerActionRow({
      route: studioPattern,
      patternName: 'Aurora Drift',
      status: connected,
      compileStatus: 'good',
      runAlreadyPushed: false,
      saveAlreadyPushed: false,
      working: false,
      programsRead: false,
      programCount: 0,
    })
    const empty = describeControllerActionRow({
      route: studioPattern,
      patternName: 'Aurora Drift',
      status: connected,
      compileStatus: 'good',
      runAlreadyPushed: false,
      saveAlreadyPushed: false,
      working: false,
      programsRead: true,
      programCount: 0,
    })

    expect(unread.switch).toEqual({
      enabled: false,
      reason: 'Saved Patterns have not been read from this Controller',
    })
    expect(empty.switch).toEqual({
      enabled: false,
      reason: 'This Controller has no saved Patterns',
    })

    expect(describeControllerActionRow({
      route: studioPattern,
      patternName: 'Aurora Drift',
      status: connected,
      compileStatus: 'good',
      runAlreadyPushed: false,
      saveAlreadyPushed: false,
      working: false,
      programsRead: true,
      programCount: 0,
      hasRunOnlyActive: true,
    }).switch).toEqual({ enabled: true })

  })
})

describe('projectControllerProgramMenu', () => {
  const programs = [
    { id: 'z', name: 'zebra' },
    { id: 'a2', name: 'aurora' },
    { id: 'a1', name: 'Aurora' },
  ]

  it('sorts saved Patterns case-insensitively with a stable id tie-breaker', () => {
    expect(projectControllerProgramMenu({ programs, filter: '' }).rows).toEqual([
      { id: 'a1', name: 'Aurora', running: false, unsaved: false, disabled: false },
      { id: 'a2', name: 'aurora', running: false, unsaved: false, disabled: false },
      { id: 'z', name: 'zebra', running: false, unsaved: false, disabled: false },
    ])
  })

  it('pins an active run-only Pattern above filtered saved rows', () => {
    const view = projectControllerProgramMenu({
      programs,
      activeProgramId: 'run-only',
      programLabels: { 'run-only': 'Live Draft' },
      filter: 'aur',
    })

    expect(view.rows).toEqual([
      {
        id: 'run-only',
        name: 'Live Draft',
        running: true,
        unsaved: true,
        disabled: true,
      },
      { id: 'a1', name: 'Aurora', running: false, unsaved: false, disabled: false },
      { id: 'a2', name: 'aurora', running: false, unsaved: false, disabled: false },
    ])
  })

  it('marks a saved active Pattern and only offers filtering above eight entries', () => {
    expect(projectControllerProgramMenu({
      programs,
      activeProgramId: 'a2',
      filter: '',
    })).toMatchObject({
      showFilter: false,
      rows: [
        { id: 'a1', running: false },
        { id: 'a2', running: true },
        { id: 'z', running: false },
      ],
    })

    expect(projectControllerProgramMenu({
      programs: Array.from({ length: 9 }, (_, index) => ({
        id: String(index),
        name: `Pattern ${index}`,
      })),
      filter: '',
    }).showFilter).toBe(true)
  })
})
