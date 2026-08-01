import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ShowClipEntityDetail,
  type ShowClipEntityDetailProps,
} from './ShowClipEntityDetail'
import type { ShowClipInspectorValue } from '@/engine/showClipInspectorModel'
import { resetShowClipDetailTabMemory } from '@/engine/showClipDetailTabs'
import { buildShowPropertyAnimationOptions } from '@/engine/showPropertyAnimationEditorModel'
import { ShowPropertyAnimationProvider } from './ShowPropertyAnimationEditor'
import type { ShowPropertyAnimationTrack } from '@/engine/personalContentRecords'

function value(scope: ShowClipInspectorValue['scope']): ShowClipInspectorValue {
  const scene = scope !== 'global'
  const overlay = scope === 'scene-overlay'
  return {
    scope,
    owner: scope === 'global'
      ? { kind: 'global', cellId: 'cell-1' }
      : overlay
        ? { kind: 'scene-overlay', sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-1', placementId: 'placement-1' }
        : { kind: 'scene-main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-1' },
    pattern: { kind: 'stock', id: 'TestPattern1D' },
    patternName: 'TestPattern1D',
    evaluationPolicy: 'live',
    presentation: { mode: 'live' },
    simulation: { timeScale: 1, timeOffsetMs: 0, controlTargets: { sliderSpeed: 0.4 } },
    view: { mirror: false, phase: 0.25, brightness: 0.8 },
    transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    viewport: { enabled: false, x: 0, y: 0, width: 1, height: 1 },
    effects: [],
    ...(scene ? {
      placementId: 'placement-1',
      instanceId: 'instance-1',
      local: { startMs: 1_000, durationMs: 2_000, ...(overlay ? { opacity: 0.75 } : {}) },
    } : {}),
    ...(overlay ? { layerId: 'layer-1' } : {}),
  }
}

const commonProps = (scope: ShowClipInspectorValue['scope'], onPatch = vi.fn()): ShowClipEntityDetailProps => ({
  value: value(scope),
  title: 'TestPattern1D · main · Scene 1',
  readOnly: false,
  patternOptions: [
    { value: 'stock:TestPattern1D', label: 'TestPattern1D', group: 'Built-in' },
    { value: 'stock:CometLoom', label: 'CometLoom', group: 'Built-in' },
  ],
  patternControls: [{ exportName: 'sliderSpeed', label: 'Speed', min: 0, max: 1, defaultValue: 0.5 }],
  layerOptions: scope === 'scene-overlay'
    ? [{ value: 'layer-1', label: 'Front' }, { value: 'layer-2', label: 'Back' }]
    : undefined,
  onPatch,
  onMoveLayer: vi.fn(),
})

/**
 * #642 moved the body behind tabs, so a test touching Place, Effects or Playback
 * must go to that tab first. Header fields need no tab.
 */
function showTab(name: 'Pattern' | 'Place' | 'Effects' | 'Playback') {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }))
}

// The remembered tab is session-scoped, so it would otherwise leak between cases.
beforeEach(resetShowClipDetailTabMemory)

describe('Clip detail label contrast (#660)', () => {
  it('promotes every form label to the readable text tier', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-overlay')} />)

    expect(screen.getByRole('region', { name: 'Clip properties' }))
      .toHaveClass('[&_label]:text-zinc-400')
  })
})

describe('Clip detail tabs (#642)', () => {
  it('keeps the tabs operable inside a disabled fieldset, as a read-only Show renders them', () => {
    // ShowEditor wraps the panel body in <fieldset disabled> for a built-in
    // Show. A disabled fieldset disables descendant form controls, so tabs must
    // not be form controls: reading a read-only Clip is still reading.
    render(
      <fieldset disabled>
        <ShowClipEntityDetail {...commonProps('scene-main')} />
      </fieldset>,
    )

    showTab('Effects')
    expect(screen.getByRole('tab', { name: /^Effects/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Clip Effects' })).toBeInTheDocument()
    const addEffect = screen.getByRole('button', { name: 'Add Effect' })
    expect(addEffect).toBeDisabled()
    fireEvent.click(addEffect)
    expect(screen.queryByRole('region', { name: 'Add Effect' })).not.toBeInTheDocument()

    showTab('Place')
    expect(screen.getByRole('group', { name: 'Clip Transform' })).toBeInTheDocument()
  })

  it('moves focus with selection so the roving tab stop stays in sync', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)
    const tablist = screen.getByRole('tablist')

    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    const place = screen.getByRole('tab', { name: /^Place/ })
    expect(place).toHaveAttribute('aria-selected', 'true')
    expect(place).toHaveAttribute('tabindex', '0')
    expect(document.activeElement).toBe(place)
  })

  it('mounts placement only with its tab instead of preserving a second floating layer', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    showTab('Place')
    expect(screen.getByRole('application', { name: /Placement pad/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Clip placement' })).not.toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(screen.queryByRole('application', { name: /Placement pad/ })).not.toBeInTheDocument()
    showTab('Place')
    expect(screen.getByRole('application', { name: /Placement pad/ })).toBeInTheDocument()
  })

  it('rests on Pattern and shows one panel at a time', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.replace('(has changes)', '')))
      .toEqual(['Pattern', 'Place', 'Effects', 'Playback'])
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('tab', { name: /^Pattern/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('wires the tab to its panel and keeps a roving tab stop', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    const pattern = screen.getByRole('tab', { name: /^Pattern/ })
    const place = screen.getByRole('tab', { name: /^Place/ })
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', pattern.id)
    expect(pattern).toHaveAttribute('tabindex', '0')
    expect(place).toHaveAttribute('tabindex', '-1')
  })

  it('moves between tabs with the arrow keys and Home/End', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)
    const tablist = screen.getByRole('tablist')

    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: /^Place/ })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(tablist, { key: 'End' })
    expect(screen.getByRole('tab', { name: /^Playback/ })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(tablist, { key: 'Home' })
    expect(screen.getByRole('tab', { name: /^Pattern/ })).toHaveAttribute('aria-selected', 'true')

    // Wraps rather than dead-ending.
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: /^Playback/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('dots only the tabs carrying authored non-default state', () => {
    const props = commonProps('scene-main')
    render(<ShowClipEntityDetail
      {...props}
      value={{ ...props.value, view: { ...props.value.view, mirror: true } }}
    />)

    expect(screen.getByRole('tab', { name: /^Effects/ })).toHaveAttribute('data-authored', 'true')
    expect(screen.getByRole('tab', { name: /^Place/ })).not.toHaveAttribute('data-authored')
  })

  it('holds the chosen tab across Clips, and falls back without forgetting it', () => {
    const props = commonProps('scene-main')
    const { rerender, unmount } = render(<ShowClipEntityDetail {...props} />)
    showTab('Place')

    // A different Clip in the same panel keeps the facet in view.
    rerender(<ShowClipEntityDetail {...props} value={{ ...props.value, patternName: 'Other' }} />)
    expect(screen.getByRole('tab', { name: /^Place/ })).toHaveAttribute('aria-selected', 'true')

    // Closing and reopening the panel keeps it too.
    unmount()
    render(<ShowClipEntityDetail {...props} />)
    expect(screen.getByRole('tab', { name: /^Place/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('falls back off a 2D Stage without losing the preference', () => {
    const props = commonProps('scene-main')
    const first = render(<ShowClipEntityDetail {...props} />)
    showTab('Place')
    first.unmount()

    // Each render gets its own handle; reusing the first leaves a panel mounted
    // and the later queries then match across two panels.
    const second = render(<ShowClipEntityDetail {...props} transformEnabled={false} />)
    expect(screen.getByRole('tab', { name: /^Pattern/ })).toHaveAttribute('aria-selected', 'true')
    second.unmount()

    // Place returns for the next Clip that can show it.
    render(<ShowClipEntityDetail {...props} />)
    expect(screen.getByRole('tab', { name: /^Place/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('gives a pinned panel its own tab so comparison panels do not move together', () => {
    const props = commonProps('scene-main')
    const pinned = render(<ShowClipEntityDetail {...props} panelKey="pinned" />)
    showTab('Effects')
    pinned.unmount()

    render(<ShowClipEntityDetail {...props} panelKey="transient" />)
    expect(screen.getByRole('tab', { name: /^Pattern/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('persistent Clip header fields (#641)', () => {
  const headerFields = () => [...screen.getByTestId('clip-header-fields').querySelectorAll('[data-header-field]')]
    .map((field) => field.getAttribute('data-header-field'))

  it('carries Start, Duration, Brightness and Opacity on one row for an overlay Clip', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-overlay')} />)

    expect(headerFields()).toEqual(['start', 'duration', 'brightness', 'opacity'])
    expect(screen.getByTestId('clip-header-fields')).toHaveClass('grid-cols-4')
  })

  it('drops Opacity for a main-layer Clip without leaving a hole', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    expect(headerFields()).toEqual(['start', 'duration', 'brightness'])
    expect(screen.getByTestId('clip-header-fields')).toHaveClass('grid-cols-3')
  })

  it('keeps only Brightness when the scope has no local timing', () => {
    render(<ShowClipEntityDetail {...commonProps('global')} />)

    expect(headerFields()).toEqual(['brightness'])
    expect(screen.getByTestId('clip-header-fields')).toHaveClass('grid-cols-1')
  })

  it('spells the header labels out in full', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-overlay')} />)
    const header = screen.getByTestId('clip-header-fields')

    expect(header).toHaveTextContent('Duration')
    expect(header).toHaveTextContent('Brightness')
    expect(header.textContent).not.toMatch(/\bDur\b/)
    expect(header.textContent).not.toMatch(/\bBright\b/)
  })

  it('leaves Source pattern and Speed in the body, and never repeats a header field', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-overlay')} />)

    const primaryFields = screen.getByTestId('clip-primary-fields')
    expect(primaryFields).toContainElement(screen.getByRole('combobox', { name: 'Source pattern' }))
    expect(primaryFields).toContainElement(screen.getByRole('textbox', { name: 'Animation speed exact multiplier' }))

    expect(screen.getAllByRole('textbox', { name: 'Brightness exact percentage' })).toHaveLength(1)
    expect(screen.getAllByLabelText(/Brightness/i)).toHaveLength(1)
    expect(screen.getAllByRole('textbox', { name: 'Start seconds exact time' })).toHaveLength(1)
    expect(screen.getAllByRole('textbox', { name: 'Opacity exact percentage' })).toHaveLength(1)
    expect(screen.queryByTestId('clip-local-fields')).not.toBeInTheDocument()
  })

  it('still commits header edits through the same patches', () => {
    const onPatch = vi.fn()
    render(<ShowClipEntityDetail {...commonProps('scene-overlay', onPatch)} />)

    const brightness = screen.getByRole('textbox', { name: 'Brightness exact percentage' })
    fireEvent.change(brightness, { target: { value: '35%' } })
    fireEvent.blur(brightness)
    expect(onPatch).toHaveBeenCalledWith({ view: { brightness: 0.35 } })

    const opacity = screen.getByRole('textbox', { name: 'Opacity exact percentage' })
    fireEvent.change(opacity, { target: { value: '50%' } })
    fireEvent.blur(opacity)
    expect(onPatch).toHaveBeenCalledWith({ local: { opacity: 0.5 } })
  })
})

describe('shared Clip Entity Detail sections (#498)', () => {
  it('gives Source Pattern the wide column beside Speed (#592, #610, #641)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    const primaryFields = screen.getByTestId('clip-primary-fields')
    const sourceField = screen.getByRole('combobox', { name: 'Source pattern' }).closest('label')

    expect(primaryFields).toHaveClass('sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]')
    expect(sourceField).not.toHaveClass('sm:col-span-3')
  })

  it.each([
    ['global', false, false, false],
    ['scene-main', true, false, false],
    ['scene-overlay', true, true, true],
  ] as const)('renders the capability matrix for %s', (scope, localTiming, layer, opacity) => {
    render(<ShowClipEntityDetail {...commonProps(scope)} />)
    expect(screen.getByRole('combobox', { name: 'Source pattern' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Animation speed exact multiplier' })).toHaveValue('1')
    expect(screen.getByRole('textbox', { name: 'Brightness exact percentage' })).toBeInTheDocument()
    expect(Boolean(screen.queryByRole('textbox', { name: 'Start seconds exact time' }))).toBe(localTiming)
    expect(Boolean(screen.queryByRole('combobox', { name: 'Overlay target layer' }))).toBe(layer)
    expect(Boolean(screen.queryByRole('textbox', { name: 'Opacity exact percentage' }))).toBe(opacity)
  })

  it('keeps the full control names accessible behind compact visible labels (#63)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    const speed = screen.getByRole('textbox', { name: 'Animation speed exact multiplier' })
    const brightness = screen.getByRole('textbox', { name: 'Brightness exact percentage' })
    expect(speed.closest('div')).toHaveTextContent('Speed')
    expect(speed.closest('div')).not.toHaveTextContent('Animation speed')
    // #641 spells the header labels out; "Bright" was the old compact form.
    expect(screen.getByText('Brightness')).toBeInTheDocument()
    expect(brightness).toHaveValue('80')
    expect(brightness.parentElement?.parentElement).not.toHaveTextContent('0–1')
  })

  it('commits shared Pattern, simulation, view, and control patches', () => {
    const onPatch = vi.fn()
    render(<ShowClipEntityDetail {...commonProps('scene-main', onPatch)} />)

    const pattern = screen.getByRole('combobox', { name: 'Source pattern' })
    fireEvent.focus(pattern)
    fireEvent.change(pattern, { target: { value: 'comet' } })
    fireEvent.click(screen.getByRole('option', { name: 'CometLoom' }))
    expect(onPatch).toHaveBeenCalledWith({ pattern: { ref: { kind: 'stock', id: 'CometLoom' }, name: 'CometLoom' } })

    const speed = screen.getByRole('textbox', { name: 'Animation speed exact multiplier' })
    fireEvent.change(speed, { target: { value: '0x' } })
    fireEvent.blur(speed)
    expect(onPatch).toHaveBeenCalledWith({ simulation: { timeScale: 0 } })

    const brightness = screen.getByRole('textbox', { name: 'Brightness exact percentage' })
    fireEvent.change(brightness, { target: { value: '35%' } })
    fireEvent.blur(brightness)
    expect(onPatch).toHaveBeenCalledWith({ view: { brightness: 0.35 } })

    showTab('Playback')
    const phase = screen.getByRole('textbox', { name: 'Phase exact phase' })
    fireEvent.change(phase, { target: { value: '0.5' } })
    fireEvent.blur(phase)
    expect(onPatch).toHaveBeenCalledWith({ view: { phase: 0.5 } })

    fireEvent.change(screen.getByRole('combobox', { name: 'Clip evaluation' }), {
      target: { value: 'freeze-at-entry' },
    })
    expect(onPatch).toHaveBeenCalledWith({ evaluationPolicy: 'freeze-at-entry' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Clip evaluation' }), {
      target: { value: 'rolling-refresh' },
    })
    expect(onPatch).toHaveBeenCalledWith({ evaluationPolicy: 'rolling-refresh' })

    showTab('Pattern')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    expect(onPatch).toHaveBeenCalledWith({ simulation: { controlTargets: undefined } })
  })

  it('keeps placement-owned Hue phase visible and editable in composition Clips (#586)', () => {
    const onPatch = vi.fn()
    render(<ShowClipEntityDetail {...commonProps('scene-main', onPatch)} />)

    showTab('Playback')
    const phase = screen.getByRole('textbox', { name: 'Phase exact phase' })
    expect(phase).toHaveValue('0.25')
    fireEvent.change(phase, { target: { value: '0.5' } })
    fireEvent.blur(phase)
    expect(onPatch).toHaveBeenCalledWith({ view: { phase: 0.5 } })
  })

  it('labels and commits Live, Freeze, Strobe, and Blink as Clip presentation controls (#586)', () => {
    const onPatch = vi.fn()
    const props = commonProps('scene-main', onPatch)
    const { rerender } = render(<ShowClipEntityDetail {...props} />)
    showTab('Playback')

    const presentation = screen.getByRole('combobox', { name: 'Clip presentation' })
    expect(Array.from(presentation.querySelectorAll('option')).map((option) => option.textContent)).toEqual([
      'Live', 'Freeze', 'Strobe',
    ])
    fireEvent.change(presentation, { target: { value: 'strobe' } })
    expect(onPatch).toHaveBeenCalledWith({ presentation: { mode: 'strobe', cadenceMs: 1_000 } })

    rerender(<ShowClipEntityDetail
      {...props}
      value={{ ...props.value, presentation: { mode: 'strobe', cadenceMs: 1_000 } }}
    />)
    const cadence = screen.getByRole('textbox', { name: 'Strobe cadence seconds exact time' })
    fireEvent.change(cadence, { target: { value: '0.5' } })
    fireEvent.blur(cadence)
    expect(onPatch).toHaveBeenCalledWith({ presentation: { mode: 'strobe', cadenceMs: 500 } })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Blink Clip output' }))
    expect(onPatch).toHaveBeenCalledWith({ blink: { rateHz: 2, duty: 0.5, phase: 0 } })
  })

  it('authors the first-class Transform in placement units while displaying rotation in degrees (#529)', () => {
    const onPatch = vi.fn()
    render(<ShowClipEntityDetail {...commonProps('scene-main', onPatch)} />)

    showTab('Place')
    expect(screen.getByRole('group', { name: 'Clip Transform' })).toBeInTheDocument()
    const positionX = screen.getByRole('textbox', { name: 'Content X exact position' })
    fireEvent.change(positionX, { target: { value: '0.25' } })
    fireEvent.blur(positionX)
    expect(onPatch).toHaveBeenCalledWith({ transform: { positionX: 0.25 } })

    const width = screen.getByRole('textbox', { name: 'Content Width exact multiplier' })
    expect(width).toHaveValue('1')
    expect(screen.getByRole('textbox', { name: 'Content Height exact multiplier' })).toHaveValue('1')
    fireEvent.change(width, { target: { value: '1.5x' } })
    fireEvent.blur(width)
    expect(onPatch).toHaveBeenCalledWith({ transform: { scaleX: 1.5 } })

    const rotation = screen.getByRole('textbox', { name: 'Rotation exact rotation' })
    fireEvent.change(rotation, { target: { value: '90' } })
    fireEvent.blur(rotation)
    expect(onPatch).toHaveBeenCalledWith({ transform: { rotation: 0.25 } })
  })

  it('switches the five-field geometry stack between Content and Aperture (#63, #646)', () => {
    const onPatch = vi.fn()
    const props = commonProps('scene-main', onPatch)
    const { rerender } = render(<ShowClipEntityDetail {...props} />)
    showTab('Place')

    expect(screen.getByRole('textbox', { name: 'Content X exact position' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aperture summary' })).toHaveTextContent('Off')

    rerender(<ShowClipEntityDetail
      {...props}
      value={{ ...props.value, viewport: { enabled: true, x: 0, y: 0, width: 1, height: 1 } }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' }))
    expect(screen.queryByRole('textbox', { name: 'Content X exact position' })).not.toBeInTheDocument()

    const viewportX = screen.getByRole('textbox', { name: 'Viewport X exact position' })
    fireEvent.change(viewportX, { target: { value: '0.25' } })
    fireEvent.blur(viewportX)
    expect(onPatch).toHaveBeenCalledWith({ viewport: { x: 0.25 } })
  })

  it('keeps the unfocused rectangle summary level with the inline pad toolbar (#646)', () => {
    const props = commonProps('scene-main')
    render(<ShowClipEntityDetail {...props} />)

    showTab('Place')
    const placement = screen.getByRole('group', { name: 'Clip Transform' })
    expect(within(placement).getByTestId('placement-pad-toolbar')).toHaveClass('h-5')
    expect(within(placement).getByRole('button', { name: 'Aperture summary' })).toHaveClass('h-5')
    expect(screen.getByRole('application', { name: /Placement pad/ })).toBeInTheDocument()
    expect(screen.queryByTestId('show-clip-placement-popover')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reserves one suffix gutter on every active geometry row (#646)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)
    showTab('Place')
    const geometry = screen.getByRole('group', { name: 'Content geometry' })
    const gutters = geometry.querySelectorAll('[data-placement-suffix-gutter]')
    expect(gutters).toHaveLength(5)
    expect([...gutters].map((gutter) => gutter.textContent)).toEqual(['', '', 'x', 'x', '°'])
  })

  it('links the X/Y slider window and detents to the selected placement grid (#633)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)
    showTab('Place')
    fireEvent.change(screen.getByRole('combobox', { name: 'Grid' }), { target: { value: '4' } })
    const xGrip = screen.getByRole('button', {
      name: 'Adjust with position slider',
      description: 'Content X',
    })
    fireEvent.keyDown(xGrip, { key: 'Enter' })
    const detents = document.querySelectorAll('[data-testid="bounded-number-detent"]')
    expect(detents).toHaveLength(17)
    const labels = Array.from(document.querySelectorAll('[data-testid="bounded-number-detent-label"]'))
      .map((element) => element.textContent)
    expect(labels).toEqual(['-2', '-1', '0', '1', '2'])
  })

  it('opens independent X and Y sliders while retaining the adjacent placement pad (#661)', () => {
    const onPatch = vi.fn()
    const onPreviewPatch = vi.fn()
    render(
      <ShowClipEntityDetail
        {...commonProps('scene-main', onPatch)}
        onPreviewPatch={onPreviewPatch}
      />,
    )
    showTab('Place')

    const pad = screen.getByRole('application', { name: /Placement pad/ })
    const content = pad.querySelector('[aria-label="Move content"]')
    expect(content).not.toBeNull()
    const committedX = content?.getAttribute('x')
    const xGrip = screen.getByRole('button', {
      name: 'Adjust with position slider',
      description: 'Content X',
    })
    fireEvent.keyDown(xGrip, { key: 'Enter' })
    const xSlider = screen.getByRole('slider', {
      name: 'Position slider',
      description: 'Content X',
    })
    fireEvent.keyDown(xSlider, { key: 'ArrowRight' })
    expect(content).not.toHaveAttribute('x', committedX)
    expect(onPreviewPatch).toHaveBeenLastCalledWith({ transform: { positionX: 0.005 } })
    expect(onPatch).not.toHaveBeenCalled()
    fireEvent.keyDown(xSlider, { key: 'Enter' })
    expect(onPatch).toHaveBeenLastCalledWith({ transform: { positionX: 0.005 } })

    const yGrip = screen.getByRole('button', {
      name: 'Adjust with position slider',
      description: 'Content Y',
    })
    fireEvent.keyDown(yGrip, { key: 'Enter' })
    expect(screen.getByRole('slider', {
      name: 'Position slider',
      description: 'Content Y',
    })).toBeInTheDocument()
  })

  it('keeps a newer axis preview when an earlier placement save finishes (#661)', async () => {
    let finishFirstSave: (() => void) | undefined
    const firstSave = new Promise<void>((resolve) => {
      finishFirstSave = resolve
    })
    const onPatch = vi.fn().mockReturnValueOnce(firstSave)
    render(<ShowClipEntityDetail {...commonProps('scene-main', onPatch)} />)
    showTab('Place')

    const content = screen.getByRole('application', { name: /Placement pad/ })
      .querySelector('[aria-label="Move content"]')
    expect(content).not.toBeNull()

    fireEvent.keyDown(screen.getByRole('button', {
      name: 'Adjust with position slider',
      description: 'Content X',
    }), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('slider', {
      name: 'Position slider',
      description: 'Content X',
    }), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('slider', {
      name: 'Position slider',
      description: 'Content X',
    }), { key: 'Enter' })

    fireEvent.keyDown(screen.getByRole('button', {
      name: 'Adjust with position slider',
      description: 'Content Y',
    }), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('slider', {
      name: 'Position slider',
      description: 'Content Y',
    }), { key: 'ArrowRight' })
    const previewY = content?.getAttribute('y')

    await act(async () => finishFirstSave?.())

    expect(content).toHaveAttribute('y', previewY)
  })

  it('keeps a preview while another same-generation commit finishes (#661)', async () => {
    let finishFirstSave: (() => void) | undefined
    const firstSave = new Promise<void>((resolve) => {
      finishFirstSave = resolve
    })
    const onPatch = vi.fn()
      .mockReturnValueOnce(firstSave)
      .mockReturnValueOnce(false)
    render(<ShowClipEntityDetail {...commonProps('scene-main', onPatch)} />)
    showTab('Place')

    const content = screen.getByRole('application', { name: /Placement pad/ })
      .querySelector('[aria-label="Move content"]')
    fireEvent.keyDown(screen.getByRole('button', {
      name: 'Adjust with position slider',
      description: 'Content X',
    }), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('slider', {
      name: 'Position slider',
      description: 'Content X',
    }), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('slider', {
      name: 'Position slider',
      description: 'Content X',
    }), { key: 'Enter' })
    const previewX = content?.getAttribute('x')

    const rotation = screen.getByRole('textbox', { name: 'Rotation exact rotation' })
    fireEvent.change(rotation, { target: { value: '90' } })
    fireEvent.blur(rotation)

    expect(content).toHaveAttribute('x', previewX)
    await act(async () => finishFirstSave?.())
  })

  it('renders additional Pattern controls inside the active tab body', () => {
    render(
      <ShowClipEntityDetail {...commonProps('global')}>
        <div data-testid="extra-pattern-controls">Global controls</div>
      </ShowClipEntityDetail>,
    )

    expect(screen.getByRole('tabpanel')).toContainElement(screen.getByTestId('extra-pattern-controls'))
    showTab('Playback')
    expect(screen.queryByTestId('extra-pattern-controls')).not.toBeInTheDocument()
  })

  it('reaches Placement through its own tab rather than a disclosure (#63, #642)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    // Pattern is the resting tab, so placement is not rendered at all.
    expect(screen.queryByRole('textbox', { name: 'Content X exact position' })).not.toBeInTheDocument()

    showTab('Place')
    expect(screen.getByRole('group', { name: 'Clip Transform' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Content X exact position' })).toBeVisible()

    showTab('Pattern')
    expect(screen.queryByRole('textbox', { name: 'Content X exact position' })).not.toBeInTheDocument()
  })

  it('does not offer the 2D Transform group for an incompatible Stage (#529)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} transformEnabled={false} />)

    expect(screen.queryByRole('group', { name: 'Clip Transform' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /^Place/ })).not.toBeInTheDocument()
  })

  it('gives authored Mirror one fixed first home in the Transform Effect stage (#543, #645)', () => {
    const onPatch = vi.fn()
    const props = commonProps('scene-main', onPatch)
    render(<ShowClipEntityDetail
      {...props}
      value={{
        ...props.value,
        view: { ...props.value.view, mirror: true },
        effects: [{ id: 'translate', kind: 'translate', x: 0.2, y: 0.1 }],
      }}
    />)

    showTab('Playback')
    expect(screen.queryByRole('checkbox', { name: 'Mirror clip' })).not.toBeInTheDocument()
    showTab('Effects')
    const mirrorRow = screen.getByTestId('show-effect-mirror')
    const translateRow = screen.getByTestId('show-effect-translate')
    expect(mirrorRow.compareDocumentPosition(translateRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(mirrorRow).getByText('Always first')).toBeInTheDocument()
    expect(within(mirrorRow).queryByRole('button', { name: /Drag/ })).not.toBeInTheDocument()
    expect(within(mirrorRow).getByRole('button', { name: 'More actions for Mirror Effect' })).toBeVisible()
  })

  it('presents Pattern and advanced controls as flat readable tables', () => {
    render(<ShowClipEntityDetail {...commonProps('global')} />)

    const patternTable = screen.getByRole('table', { name: 'Pattern controls' })
    expect(patternTable).toHaveTextContent('Speed')
    expect(patternTable).toHaveTextContent('sliderSpeed')
    expect(patternTable).toHaveTextContent('0–100%')
    expect(screen.getByRole('combobox', { name: 'Source pattern' })).toHaveClass(
      'h-5',
      'pl-[5px]',
      'pr-[23px]',
    )
    expect(screen.getByRole('textbox', { name: 'Animation speed exact multiplier' }).parentElement).toHaveClass('h-5')
    expect(screen.getByRole('textbox', { name: 'Speed target exact percentage' }).parentElement)
      .toHaveClass('h-5', 'border', 'border-zinc-700')

    showTab('Playback')
    expect(screen.getByRole('table', { name: 'Playback controls' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Mirror clip' })).not.toBeInTheDocument()
    const phaseRow = screen.getByRole('textbox', { name: 'Phase exact phase' }).closest('tr')
    expect(phaseRow?.children[1]).toHaveTextContent('Phase')
    expect(phaseRow?.children[2]).toContainElement(screen.getByRole('textbox', { name: 'Phase exact phase' }))
    expect(screen.getByRole('textbox', { name: 'Phase exact phase' })).toHaveClass('text-left')
    expect(screen.getByRole('button', { name: 'Adjust with phase slider' })).toBeInTheDocument()
  })

  it('keeps Pattern controls on one unruled line with a compact Value column (#63)', () => {
    render(<ShowClipEntityDetail {...commonProps('global')} />)

    expect(screen.getByText('Pattern controls')).toBeInTheDocument()
    expect(screen.queryByText('Add or edit pattern controls')).not.toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Pattern controls' })
    const columns = table.querySelectorAll('col')
    expect(columns[1]).toHaveStyle({ width: '24%' })
    expect(columns[3]).toHaveClass('w-16')
    expect(table.querySelector('tbody')).not.toHaveClass('divide-y')

    const row = screen.getByRole('row', { name: /Set Speed target/ })
    expect(row).toHaveClass('h-6')
    expect(within(row).getByRole('rowheader', { name: 'Speed' })).toHaveClass('truncate', 'whitespace-nowrap')
    expect(row.querySelector<HTMLElement>('[title^="sliderSpeed"]')).toHaveClass('truncate', 'whitespace-nowrap')
    expect(screen.getByRole('textbox', { name: 'Speed target exact percentage' }).closest('td')).toHaveClass(
      'whitespace-nowrap',
      '[&_input]:!border-0',
    )
  })

  it('matches Advanced Clip control rows to the compact three-column rhythm (#63)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    showTab('Playback')
    const table = screen.getByRole('table', { name: 'Playback controls' })
    const columns = table.querySelectorAll('col')
    expect(columns).toHaveLength(3)
    expect(columns[0]).toHaveClass('w-7')
    expect(columns[1]).toHaveStyle({ width: '24%' })
    expect(table.querySelector('tbody')).not.toHaveClass('divide-y')

    const rows = table.querySelectorAll('tbody tr')
    expect(rows.length).toBeGreaterThan(0)
    rows.forEach((row) => expect(row).toHaveClass('h-6', 'whitespace-nowrap'))

    const blink = screen.getByRole('checkbox', { name: 'Blink Clip output' })
    const blinkRow = blink.closest('tr')
    expect(blinkRow?.children[0]).toContainElement(blink)
    expect(blinkRow?.children[1]).toHaveTextContent('Blink output')

    expect(screen.queryByRole('checkbox', { name: 'Mirror clip' })).not.toBeInTheDocument()
  })

  it.each(['global', 'scene-main', 'scene-overlay'] as const)(
    'commits the same shared view and Effect actions for %s',
    (scope) => {
      const onPatch = vi.fn()
      const props = commonProps(scope, onPatch)
      render(<ShowClipEntityDetail
        {...props}
        value={{ ...props.value, view: { ...props.value.view, mirror: true } }}
      />)

      const brightness = screen.getByRole('textbox', { name: 'Brightness exact percentage' })
      fireEvent.change(brightness, { target: { value: '45%' } })
      fireEvent.blur(brightness)
      showTab('Effects')
      fireEvent.click(screen.getByRole('button', { name: 'More actions for Mirror Effect' }))
      expect(screen.getAllByRole('menuitem')).toHaveLength(1)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Mirror Effect' }))
      fireEvent.click(screen.getByRole('button', { name: 'Add Effect' }))
      fireEvent.click(screen.getByRole('button', { name: 'Add Mirror Effect' }))

      expect(onPatch).toHaveBeenCalledWith({ view: { brightness: 0.45 } })
      expect(onPatch).toHaveBeenCalledWith({ view: { mirror: false } })
      expect(onPatch).toHaveBeenCalledWith({ view: { mirror: true } })
    },
  )

  it('owns the Add Effect takeover and restores focus to Add on Back', async () => {
    const props = commonProps('scene-main')
    render(<ShowClipEntityDetail {...props} />)
    showTab('Effects')
    const add = screen.getByRole('button', { name: 'Add Effect' })
    fireEvent.click(add)

    expect(screen.queryByRole('dialog', { name: 'Add Effect' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Add Effect' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Effects' }))

    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add Effect' })).toHaveFocus())
  })

  it('bounds the tab body and gives Add Effect one intentional scroll surface (#659)', () => {
    const props = commonProps('scene-main')
    render(<ShowClipEntityDetail {...props} />)
    showTab('Effects')

    const tabpanel = screen.getByRole('tabpanel')
    expect(tabpanel).toHaveClass(
      'h-[clamp(180px,calc(100vh-250px),300px)]',
      'min-h-0',
      'overflow-hidden',
    )
    expect(screen.getByRole('region', { name: 'Clip Effects' }))
      .toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto')

    fireEvent.click(screen.getByRole('button', { name: 'Add Effect' }))

    expect(tabpanel).toHaveClass('overflow-hidden')
    expect(screen.getByRole('region', { name: 'Add Effect' })).toHaveClass('min-h-0', 'flex-1')
    expect(screen.getByTestId('show-effect-choice-list')).toHaveClass('overflow-y-auto')
  })

  it('does not impose the Effects scroll container on the Pattern tab (#659 regression)', () => {
    const props = commonProps('scene-main')
    render(<ShowClipEntityDetail {...props} />)

    expect(screen.getByRole('tabpanel')).toHaveClass('min-h-[262px]')
    expect(screen.getByRole('tabpanel')).not.toHaveClass(
      'h-[clamp(180px,calc(100vh-250px),300px)]',
      'overflow-y-auto',
    )
  })

  it('lets a header field consume Escape while the Add Effect takeover is open', () => {
    const props = commonProps('scene-main')
    render(<ShowClipEntityDetail {...props} />)
    showTab('Effects')
    fireEvent.click(screen.getByRole('button', { name: 'Add Effect' }))
    const brightness = screen.getByRole('textbox', { name: 'Brightness exact percentage' })
    fireEvent.focus(brightness)
    fireEvent.change(brightness, { target: { value: 'invalid' } })

    fireEvent.keyDown(brightness, { key: 'Escape' })

    expect(brightness).toHaveValue('80')
    expect(screen.getByRole('region', { name: 'Add Effect' })).toBeInTheDocument()
  })

  it('commits local timing, opacity, and layer assignment only for an overlay', () => {
    const onPatch = vi.fn()
    const onMoveLayer = vi.fn()
    render(<ShowClipEntityDetail {...commonProps('scene-overlay', onPatch)} onMoveLayer={onMoveLayer} />)

    const duration = screen.getByRole('textbox', { name: 'Duration seconds exact time' })
    fireEvent.change(duration, { target: { value: '75.5' } })
    fireEvent.blur(duration)
    expect(onPatch).toHaveBeenCalledWith({ local: { durationMs: 75_500 } })

    const opacity = screen.getByRole('textbox', { name: 'Opacity exact percentage' })
    fireEvent.change(opacity, { target: { value: '40%' } })
    fireEvent.blur(opacity)
    expect(onPatch).toHaveBeenCalledWith({ local: { opacity: 0.4 } })

    fireEvent.change(screen.getByRole('combobox', { name: 'Overlay target layer' }), { target: { value: 'layer-2' } })
    expect(onMoveLayer).toHaveBeenCalledWith('layer-2')
  })

  it('previews one detented Start scrub and commits it once on release', () => {
    const onPatch = vi.fn()
    const onPreviewPatch = vi.fn()
    const onPreviewEnd = vi.fn()
    render(
      <ShowClipEntityDetail
        {...commonProps('scene-main', onPatch)}
        onPreviewPatch={onPreviewPatch}
        onPreviewEnd={onPreviewEnd}
      />,
    )

    const grip = screen.getByRole('button', { name: 'Adjust with time slider', description: 'Start seconds' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 9, clientX: 209, clientY: 110 })
    expect(screen.getAllByTestId('bounded-number-detent')).toHaveLength(31)
    fireEvent.pointerMove(grip, { pointerId: 9, clientX: 229, clientY: 110 })
    fireEvent.pointerMove(grip, { pointerId: 9, clientX: 239, clientY: 110 })

    expect(onPreviewPatch).toHaveBeenCalledTimes(2)
    expect(onPreviewPatch.mock.calls[1][0].local.startMs)
      .toBeGreaterThan(onPreviewPatch.mock.calls[0][0].local.startMs)
    expect(onPatch).not.toHaveBeenCalled()

    fireEvent.pointerUp(grip, { pointerId: 9, clientX: 239, clientY: 110 })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onPatch).toHaveBeenCalledOnce()
    expect(onPatch).toHaveBeenCalledWith(onPreviewPatch.mock.calls[1][0])
  })
})

describe('per-parameter animation affordances (#648)', () => {
  it('puts an accessible diamond beside every rendered animatable Clip parameter', () => {
    const props = commonProps('scene-overlay')
    const animatedValue: ShowClipInspectorValue = {
      ...props.value,
      viewport: { enabled: true, x: 0.1, y: 0.2, width: 0.8, height: 0.7 },
      effects: [{ id: 'cut', kind: 'threshold', threshold: 0.4, amount: 0.5 }],
    }
    render(
      <ShowPropertyAnimationProvider
        options={buildShowPropertyAnimationOptions(animatedValue)}
        tracks={[]}
        storageDurationMs={4_000}
        showTimeOffsetMs={10_000}
        instanceUseCount={2}
        onChange={vi.fn()}
      >
        <ShowClipEntityDetail {...props} value={animatedValue} />
      </ShowPropertyAnimationProvider>,
    )

    expect(screen.getByRole('button', { name: 'Animate Brightness' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Animate Opacity' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Animate Animation speed' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Animate Speed' })).toBeVisible()

    showTab('Place')
    for (const label of ['Content X', 'Content Y', 'Content Width', 'Content Height', 'Rotation']) {
      expect(screen.getByRole('button', { name: `Animate ${label}` })).toBeVisible()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' }))
    for (const label of ['Viewport X', 'Viewport Y', 'Viewport Width', 'Viewport Height']) {
      expect(screen.getByRole('button', { name: `Animate ${label}` })).toBeVisible()
    }

    showTab('Effects')
    expect(screen.getByRole('button', { name: 'Animate Threshold Amount' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Animate Threshold Threshold' })).toBeVisible()

    showTab('Playback')
    expect(screen.getByRole('button', { name: 'Animate Phase' })).toBeVisible()
  })

  it('does not reveal an unavailable Place field or mutate its viewport (#649 review)', () => {
    const onPatch = vi.fn()
    const onAnimationOverviewClose = vi.fn()
    const props = commonProps('scene-main', onPatch)
    const viewportTrack: ShowPropertyAnimationTrack = {
      id: 'viewport-width',
      target: {
        kind: 'placement-viewport',
        placementId: 'placement-1',
        property: 'width',
      },
      keyframes: [
        { id: 'from', timeMs: 0, value: 1, easing: { curve: 'linear' } },
        { id: 'to', timeMs: 2_000, value: 0.8, easing: { curve: 'linear' } },
      ],
    }

    render(
      <ShowPropertyAnimationProvider
        options={buildShowPropertyAnimationOptions(props.value)}
        tracks={[viewportTrack]}
        storageDurationMs={2_000}
        showTimeOffsetMs={1_000}
        instanceUseCount={1}
        onChange={vi.fn()}
      >
        <ShowClipEntityDetail
          {...props}
          transformEnabled={false}
          animationOverviewOpen
          onAnimationOverviewClose={onAnimationOverviewClose}
        />
      </ShowPropertyAnimationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Go to Viewport width field' }))

    expect(onPatch).not.toHaveBeenCalled()
    expect(onAnimationOverviewClose).toHaveBeenCalledWith(true)
  })
})

describe('placement field display (#617)', () => {
  it('rounds float dust out of the fields without touching what is stored', () => {
    const onPatch = vi.fn()
    const props = commonProps('scene-main', onPatch)
    render(<ShowClipEntityDetail
      {...props}
      value={{
        ...props.value,
        transform: { ...props.value.transform, positionX: -0.21488423 },
        viewport: { enabled: true, x: 0, y: 0, width: 2 / 3, height: 1 },
      }}
    />)
    showTab('Place')

    expect(screen.getByRole('textbox', { name: 'Content X exact position' })).toHaveValue('-0.215')
    fireEvent.click(screen.getByRole('button', { name: 'Aperture summary' }))
    expect(screen.getByRole('textbox', { name: 'Viewport Width exact multiplier' })).toHaveValue('0.67')
    // Display only: nothing is written back just for being rendered.
    expect(onPatch).not.toHaveBeenCalled()
  })
})
