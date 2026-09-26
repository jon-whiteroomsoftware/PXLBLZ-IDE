import { describe, expect, it } from 'vitest'
import { createDefaultShow, updateShowBoundaryTransition, updateShowCellAdaptations } from './showModel'
import {
  projectGlobalShowClipSummary,
  projectShowClipTimelineSummary,
  showClipSummaryDestination,
  showClipInlineSummary,
} from './showClipSummary'

describe('Show Clip summary', () => {
  it.each([
    ['playback', 'time-scale', { location: 'pattern', targetKey: 'speed', destinationLabel: 'Pattern Speed field' }],
    ['playback', 'stepped-clock', { location: 'pattern', targetKey: 'stutter', destinationLabel: 'Pattern Stutter control' }],
    ['controls', 'control:sliderSpeed', { location: 'pattern', targetKey: 'control:sliderSpeed', destinationLabel: 'Pattern control' }],
    ['view', 'brightness', { location: 'header', targetKey: 'brightness', destinationLabel: 'Clip header Brightness field' }],
    ['view', 'opacity', { location: 'header', targetKey: 'opacity', destinationLabel: 'Clip header Opacity field' }],
    ['view', 'mirror', { location: 'effects', targetKey: 'mirror', destinationLabel: 'Effects Mirror row' }],
    ['view', 'phase', { location: 'playback', targetKey: 'phase', destinationLabel: 'Playback Phase field' }],
    ['view', 'transform-position-x', { location: 'place', targetKey: 'transform-position-x', destinationLabel: 'Place Position X field' }],
    ['view', 'viewport', { location: 'place', targetKey: 'viewport', destinationLabel: 'Place Viewport fields' }],
    ['view', 'viewport-width', { location: 'place', targetKey: 'viewport', destinationLabel: 'Place Viewport fields' }],
    ['effects', 'effect:threshold', { location: 'effects', targetKey: 'effect:threshold', destinationLabel: 'Effects row' }],
  ] as const)('maps the %s/%s summary fact to its owning surface (#650)', (kind, itemId, expected) => {
    expect(showClipSummaryDestination(kind, itemId)).toEqual(expected)
  })

  it.each([
    ['playback', 'restart'],
    ['playback', 'time-offset'],
    ['playback', 'light-shutter'],
    ['animation', 'animation:time-scale'],
    ['view', 'unknown'],
  ] as const)('leaves %s/%s plain when the tabbed inspector has no destination (#650)', (kind, itemId) => {
    expect(showClipSummaryDestination(kind, itemId)).toBeNull()
  })

  it('keeps a newly animated flat value visible after an identical set value (#666 review)', () => {
    const previous = [{
      kind: 'view' as const,
      label: 'View',
      items: [{ id: 'brightness', label: 'Brightness', value: '50%' }],
    }]
    const current = [{
      kind: 'view' as const,
      label: 'View',
      items: [{ id: 'brightness', label: 'Brightness', value: '50%', animated: true }],
    }]

    expect(projectShowClipTimelineSummary(current, previous)[0].items[0].showValue).toBe(true)
    expect(projectShowClipTimelineSummary(previous, current)[0].items[0].showValue).toBe(true)
    expect(projectShowClipTimelineSummary(current, current)[0].items[0].showValue).toBe(false)
  })

  it('keeps default-valued Effects silent on the Clip row (#666 review)', () => {
    const show = createDefaultShow('show-default-effect-summary', 'Default effect summary', 1_000)
    show.cells[0].effects = [
      { id: 'hue', kind: 'hue', turns: 0 },
      { id: 'ripple', kind: 'ripple', amount: 0, frequency: 8, phase: 0, centerX: 0.5, centerY: 0.5 },
    ]

    const effects = projectGlobalShowClipSummary(show, show.cells[0].id)
      .find((section) => section.kind === 'effects')?.items

    // The Detail summary keeps the complete values; the Clip row contracts
    // an all-default Effect to its section glyph alone.
    expect(effects).toEqual([
      expect.objectContaining({ label: 'Hue', value: '0t', timelineValue: '' }),
      expect.objectContaining({ label: 'Ripple', timelineValue: '' }),
    ])
  })

  it('separates static playback, Pattern controls, view, Effects, and animation facts', () => {
    let show = createDefaultShow('show-clip-summary', 'Clip summary', 1_000)
    const cellId = show.cells[0].id
    show = updateShowCellAdaptations(show, cellId, { timeScale: 0.35, brightness: 0.8 })
    show.cells[0] = {
      ...show.cells[0],
      controlTargets: { sliderSpeed: 0.28, sliderSharpness: 0.42 },
      effects: [
        { id: 'scale', kind: 'scale', x: 0.8, y: 0.8 },
        { id: 'hue', kind: 'hue', turns: 0.1 },
      ],
    }
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        timeScale: { fromByCellId: { [cellId]: 0.7 }, durationMs: 1_000 },
      },
    })

    const summary = projectGlobalShowClipSummary(show, cellId, {
      sliderSpeed: 'Speed',
      sliderSharpness: 'Sharpness',
    })

    expect(summary.map((section) => section.kind)).toEqual([
      'playback',
      'controls',
      'view',
      'effects',
      'animation',
    ])
    expect(summary.find((section) => section.kind === 'playback')?.items).toContainEqual(
      expect.objectContaining({ label: 'Animation speed', value: '0.35x' }),
    )
    expect(summary.find((section) => section.kind === 'controls')?.items).toEqual([
      expect.objectContaining({ label: 'Speed', value: '28%' }),
      expect.objectContaining({ label: 'Sharpness', value: '42%' }),
    ])
    expect(summary.find((section) => section.kind === 'view')?.items).toContainEqual(
      expect.objectContaining({ label: 'Brightness', value: '80%' }),
    )
    expect(summary.find((section) => section.kind === 'effects')?.items.map((item) => item.label)).toEqual([
      'Scale',
      'Hue',
    ])
    expect(summary.find((section) => section.kind === 'animation')?.items).toContainEqual(
      expect.objectContaining({ label: 'Animation speed', value: 'animated' }),
    )
    expect(showClipInlineSummary(summary)).toBe(
      'Animation speed 0.35x · Speed 28% · Sharpness 42% · Brightness 80% · Scale x 0.8x, y 0.8x · Hue 0.1t · Animation speed animated',
    )
  })

  it('returns a quiet defaults label when the Clip has no authored modifications', () => {
    const show = createDefaultShow('show-default-clip-summary', 'Default Clip summary', 1_000)
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)

    expect(summary).toEqual([])
    expect(showClipInlineSummary(summary)).toBe('defaults')
  })

  it('compacts high-precision animation speed without mutating the stored value', () => {
    const show = createDefaultShow('show-speed-summary-precision', 'Speed summary precision', 1_000)
    show.cells[0].adaptations.timeScale = 2.507072

    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)
    const speed = summary.find((section) => section.kind === 'playback')?.items[0]

    expect(speed).toEqual(expect.objectContaining({ label: 'Animation speed', value: '2.51x' }))
    expect(show.cells[0].adaptations.timeScale).toBe(2.507072)
  })

  it('formats explicitly classified Effect scalars in their authored domain units', () => {
    const show = createDefaultShow('show-effect-percent-summary', 'Effect percentages', 1_000)
    show.cells[0].effects = [
      { id: 'fade', kind: 'opacity', opacity: 0.25 },
      { id: 'hue', kind: 'hue', turns: 0.1 },
      { id: 'size', kind: 'scale', x: 2.507072, y: 0.75 },
      {
        id: 'edge', kind: 'vignette', amount: 1, radius: 0.35, softness: 0.35,
        centerX: 0.5, centerY: 0.5, aspect: 16 / 9,
      },
    ]

    const effects = projectGlobalShowClipSummary(show, show.cells[0].id)
      .find((section) => section.kind === 'effects')?.items

    expect(effects).toEqual([
      expect.objectContaining({ label: 'Opacity', value: '25%' }),
      expect.objectContaining({ label: 'Hue', value: '0.1t' }),
      expect.objectContaining({
        label: 'Scale',
        value: 'x 2.51x, y 0.75x',
        // The Clip row shows values only; names live in Clip Detail (#63).
        timelineValue: '2.51×0.75x',
      }),
      expect.objectContaining({ label: 'Vignette', value: expect.stringContaining('Aspect 16:9') }),
    ])
  })

  it('summarizes canonical Transform placement and animation separately from Effects (#529)', () => {
    let show = createDefaultShow('show-transform-summary', 'Transform summary', 1_000)
    const cellId = show.cells[1].id
    show.cells[1] = {
      ...show.cells[1],
      transform: { positionX: 0.25, positionY: 0, rotation: 0.25, scaleX: 2.507072, scaleY: 1 },
    }
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        transform: { positionX: { fromByCellId: { [cellId]: 0 } } },
      },
    })

    const summary = projectGlobalShowClipSummary(show, cellId)
    expect(summary.find((section) => section.kind === 'view')?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Position x', value: '0.25' }),
      expect.objectContaining({ label: 'Rotation', value: '90°' }),
      expect.objectContaining({ label: 'Scale x', value: '2.51x' }),
    ]))
    expect(summary.find((section) => section.kind === 'animation')?.items).toContainEqual(
      expect.objectContaining({ label: 'Position x', value: 'animated' }),
    )
  })

  it('shows timeline values only when a fact is introduced or changes from the preceding Clip (#548)', () => {
    let show = createDefaultShow('show-clip-summary-deltas', 'Clip summary deltas', 1_000)
    show = updateShowCellAdaptations(show, show.cells[0].id, { timeScale: 0.35, brightness: 0.8 })
    show = updateShowCellAdaptations(show, show.cells[1].id, { timeScale: 0.35, brightness: 0.8 })
    const first = projectGlobalShowClipSummary(show, show.cells[0].id)
    const unchanged = projectGlobalShowClipSummary(show, show.cells[1].id)

    expect(projectShowClipTimelineSummary(first, null).flatMap((section) => section.items)).toEqual([
      expect.objectContaining({ id: 'time-scale', value: '0.35x', showValue: true }),
      expect.objectContaining({ id: 'brightness', value: '80%', showValue: true }),
    ])
    expect(projectShowClipTimelineSummary(unchanged, first).flatMap((section) => section.items)).toEqual([
      expect.objectContaining({ id: 'time-scale', showValue: false }),
      expect.objectContaining({ id: 'brightness', showValue: false }),
    ])

    show = updateShowCellAdaptations(show, show.cells[1].id, { timeScale: 0.5 })
    const changed = projectGlobalShowClipSummary(show, show.cells[1].id)
    expect(projectShowClipTimelineSummary(changed, first).flatMap((section) => section.items)).toEqual([
      expect.objectContaining({ id: 'time-scale', value: '0.5x', showValue: true }),
      expect.objectContaining({ id: 'brightness', value: '80%', showValue: false }),
    ])
  })

  it('contracts multi-parameter Effect values without changing the complete summary (#548)', () => {
    const show = createDefaultShow('show-clip-summary-effect-contract', 'Effect contractions', 1_000)
    show.cells[0] = {
      ...show.cells[0],
      effects: [{
        id: 'ripple',
        kind: 'ripple',
        amount: 0.32,
        frequency: 4,
        phase: 0,
        centerX: 0.5,
        centerY: 0.5,
      }],
    }
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)
    const effect = summary.find((section) => section.kind === 'effects')?.items[0]
    const timelineEffect = projectShowClipTimelineSummary(summary, null)
      .find((section) => section.kind === 'effects')?.items[0]

    expect(effect?.value).toBe('Amount 0.32, Frequency 4, Phase 0t, Center x 0.5, Center y 0.5')
    // The Clip row keeps only parameters authored away from their defaults,
    // as values only - names live in Clip Detail (#666, #63).
    expect(timelineEffect?.displayValue).toBe('.32 / 4')
  })
  it('pairs Transform axes on the Clip row under one glyph (#63)', () => {
    const show = createDefaultShow('show-clip-summary-pairs', 'Clip summary pairs', 1_000)
    show.cells[0] = {
      ...show.cells[0],
      transform: { positionX: -0.25, positionY: 0.25, rotation: 0.125, scaleX: 0.5, scaleY: 0.5 },
    }
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)
    const view = projectShowClipTimelineSummary(summary, null).find((section) => section.kind === 'view')

    expect(view?.items.map((item) => [item.id, item.displayValue, item.glyph])).toEqual([
      ['transform-position', '-.25,.25', 'move'],
      ['transform-rotation', '45°', 'rotate'],
      ['transform-scale', '.5x', 'scale'],
    ])
    // Clip Detail and the tooltip keep every axis as its own fact.
    expect(showClipInlineSummary(summary)).toBe(
      'Position x -0.25 · Position y 0.25 · Rotation 45° · Scale x 0.5x · Scale y 0.5x',
    )
  })

  it('keeps both axes in a pair when only one is authored or they differ (#63)', () => {
    const show = createDefaultShow('show-clip-summary-pair-axes', 'Clip summary pair axes', 1_000)
    show.cells[0] = {
      ...show.cells[0],
      transform: { positionX: 0, positionY: 0.25, rotation: 0, scaleX: 0.5, scaleY: 0.75 },
    }
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)
    const view = projectShowClipTimelineSummary(summary, null).find((section) => section.kind === 'view')

    expect(view?.items.map((item) => [item.id, item.displayValue])).toEqual([
      ['transform-position', '0,.25'],
      ['transform-scale', '.5×.75x'],
    ])
  })

  it('shows a pair when either axis changes from the preceding Clip (#63)', () => {
    const show = createDefaultShow('show-clip-summary-pair-delta', 'Clip summary pair delta', 1_000)
    show.cells[0] = { ...show.cells[0], transform: { positionX: 0.1, positionY: 0.2, rotation: 0, scaleX: 1, scaleY: 1 } }
    show.cells[1] = { ...show.cells[1], transform: { positionX: 0.1, positionY: 0.3, rotation: 0, scaleX: 1, scaleY: 1 } }
    const first = projectGlobalShowClipSummary(show, show.cells[0].id)
    const second = projectGlobalShowClipSummary(show, show.cells[1].id)

    const unchanged = projectShowClipTimelineSummary(first, first).find((section) => section.kind === 'view')
    expect(unchanged?.items[0]).toEqual(expect.objectContaining({ id: 'transform-position', showValue: false }))
    const changed = projectShowClipTimelineSummary(second, first).find((section) => section.kind === 'view')
    expect(changed?.items[0]).toEqual(expect.objectContaining({ id: 'transform-position', displayValue: '.1,.3', showValue: true }))
  })

  it('renders the Viewport as an origin pair and size, or off (#63)', () => {
    const show = createDefaultShow('show-clip-summary-viewport', 'Clip summary viewport', 1_000)
    show.cells[0] = { ...show.cells[0], viewport: { enabled: true, x: 0, y: 0.5, width: 0.25, height: 0.5 } }
    show.cells[1] = { ...show.cells[1], viewport: { enabled: false, x: 0, y: 0.5, width: 0.25, height: 0.5 } }
    const on = projectShowClipTimelineSummary(projectGlobalShowClipSummary(show, show.cells[0].id), null)
      .find((section) => section.kind === 'view')?.items[0]
    const off = projectShowClipTimelineSummary(projectGlobalShowClipSummary(show, show.cells[1].id), null)
      .find((section) => section.kind === 'view')?.items[0]

    expect(on).toEqual(expect.objectContaining({ id: 'viewport', displayValue: '0,.5 .25×.5', glyph: 'viewport' }))
    expect(off).toEqual(expect.objectContaining({ id: 'viewport', displayValue: 'off', glyph: 'viewport-off' }))
  })

  it('assigns Clip row glyphs per fact family and leaves boolean facts glyph-only (#63)', () => {
    let show = createDefaultShow('show-clip-summary-glyphs', 'Clip summary glyphs', 1_000)
    show = updateShowCellAdaptations(show, show.cells[0].id, { timeScale: 1.5, brightness: 0.8, mirror: true })
    show.cells[0] = { ...show.cells[0], controlTargets: { sliderSpeed: 0.4, sliderWidth: 0.75 } }
    const items = projectShowClipTimelineSummary(projectGlobalShowClipSummary(show, show.cells[0].id), null)
      .flatMap((section) => section.items)

    expect(items.map((item) => [item.id, item.displayValue, item.glyph])).toEqual([
      ['time-scale', '1.5x', 'clock'],
      ['control:sliderSpeed', '40%', 'controls'],
      ['control:sliderWidth', '75%', 'controls'],
      ['brightness', '80%', 'sun'],
      ['mirror', '', 'mirror'],
    ])
  })
  it('contracts the light shutter and start offset on the Clip row (#63)', () => {
    let show = createDefaultShow('show-clip-summary-shutter', 'Clip summary shutter', 1_000)
    show = updateShowCellAdaptations(show, show.cells[0].id, {
      timeOffsetMs: 500,
      lightShutter: { rateHz: 8, duty: 0.5, phase: 0, clockBehavior: 'continue' },
    })
    show = updateShowCellAdaptations(show, show.cells[1].id, {
      timeOffsetMs: 250,
      lightShutter: { rateHz: 8, duty: 0.5, phase: 0.25, clockBehavior: 'freeze' },
    })
    const rows = [show.cells[0].id, show.cells[1].id].map((cellId) => (
      projectShowClipTimelineSummary(projectGlobalShowClipSummary(show, cellId), null)
        .find((section) => section.kind === 'playback')?.items
        .map((item) => [item.id, item.displayValue, item.glyph])
    ))

    // Defaults (phase 0, continuing clock) stay silent; freeze reads as a snowflake.
    expect(rows[0]).toEqual([
      ['time-offset', '+500ms', 'clock'],
      ['light-shutter', '8Hz 50%', 'shutter'],
    ])
    expect(rows[1]).toEqual([
      ['time-offset', '+250ms', 'clock'],
      ['light-shutter', '8Hz 50% φ.25 ❄', 'shutter'],
    ])
    // The complete summary keeps the long form.
    expect(showClipInlineSummary(projectGlobalShowClipSummary(show, show.cells[1].id))).toBe(
      'Start offset 250 ms · Light shutter 8 Hz, 50% on, phase 0.25, freeze clock',
    )
  })
  it('pairs two-axis Effect parameters and keeps colours as hex tokens on the Clip row (#63)', () => {
    const show = createDefaultShow('show-clip-summary-effect-pairs', 'Effect pairs', 1_000)
    show.cells[0] = {
      ...show.cells[0],
      effects: [
        { id: 'translate', kind: 'translate', x: 0.2, y: 0 },
        { id: 'scale', kind: 'scale', x: 0.5, y: 0.5 },
        { id: 'shear', kind: 'shear', x: 0.1, y: 0.3 },
        { id: 'pixelate', kind: 'pixelate', amount: 1, columns: 8, rows: 12 },
        { id: 'chroma', kind: 'chroma-key', color: '#ff0000', tolerance: 0.12, softness: 0.05 },
      ],
    }
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)
    const effects = projectShowClipTimelineSummary(summary, null)
      .find((section) => section.kind === 'effects')?.items.map((item) => item.displayValue)

    // A pair prints both axes even when one is at its default; a uniform
    // scale collapses to one value; pixelate reads as a grid size.
    expect(effects).toEqual(['.2,0', '.5x', '.1,.3', '100% / 8×12', '#ff0000 / 12%'])
    expect(showClipInlineSummary(summary)).toContain('Translate x 0.2, y 0')
  })
})
