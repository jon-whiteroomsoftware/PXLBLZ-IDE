import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ShowClipEntityDetail,
  type ShowClipEntityDetailProps,
} from './ShowClipEntityDetail'
import type { ShowClipInspectorValue } from '@/engine/showClipInspectorModel'

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
  onOpenEffects: vi.fn(),
  onMoveLayer: vi.fn(),
})

describe('shared Clip Entity Detail sections (#498)', () => {
  it('gives Source Pattern the wide column shared with Start timing (#592)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    const primaryFields = screen.getByTestId('clip-primary-fields')
    const localFields = screen.getByTestId('clip-local-fields')
    const sourceField = screen.getByRole('combobox', { name: 'Source pattern' }).closest('label')
    const startField = screen.getByRole('spinbutton', { name: 'Start seconds' }).closest('[data-field-span]')
    const durationField = screen.getByRole('spinbutton', { name: 'Duration seconds' }).closest('[data-field-span]')

    expect(primaryFields).toHaveClass('sm:grid-cols-5')
    expect(localFields).toHaveClass('sm:grid-cols-5')
    expect(sourceField).toHaveClass('sm:col-span-3')
    expect(startField).toHaveClass('sm:col-span-3')
    expect(durationField).toHaveClass('sm:col-span-2')
  })

  it.each([
    ['global', false, false, false],
    ['scene-main', true, false, false],
    ['scene-overlay', true, true, true],
  ] as const)('renders the capability matrix for %s', (scope, localTiming, layer, opacity) => {
    render(<ShowClipEntityDetail {...commonProps(scope)} />)
    expect(screen.getByRole('combobox', { name: 'Source pattern' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Animation speed' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Brightness' })).toBeInTheDocument()
    expect(Boolean(screen.queryByRole('spinbutton', { name: 'Start seconds' }))).toBe(localTiming)
    expect(Boolean(screen.queryByRole('combobox', { name: 'Overlay target layer' }))).toBe(layer)
    expect(Boolean(screen.queryByRole('spinbutton', { name: 'Opacity' }))).toBe(opacity)
  })

  it('keeps the full control names accessible behind compact visible labels (#63)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    const speed = screen.getByRole('spinbutton', { name: 'Animation speed' })
    const brightness = screen.getByRole('spinbutton', { name: 'Brightness' })
    expect(speed.closest('label')).toHaveTextContent('Speed')
    expect(speed.closest('label')).not.toHaveTextContent('Animation speed')
    expect(brightness.closest('label')).toHaveTextContent('Bright')
    expect(brightness.closest('label')).not.toHaveTextContent('Brightness')
    expect(brightness.closest('label')).not.toHaveTextContent('0–1')
  })

  it('commits shared Pattern, simulation, view, and control patches', () => {
    const onPatch = vi.fn()
    render(<ShowClipEntityDetail {...commonProps('scene-main', onPatch)} />)

    const pattern = screen.getByRole('combobox', { name: 'Source pattern' })
    fireEvent.focus(pattern)
    fireEvent.change(pattern, { target: { value: 'comet' } })
    fireEvent.click(screen.getByRole('option', { name: 'CometLoom' }))
    expect(onPatch).toHaveBeenCalledWith({ pattern: { ref: { kind: 'stock', id: 'CometLoom' }, name: 'CometLoom' } })

    const brightness = screen.getByRole('spinbutton', { name: 'Brightness' })
    fireEvent.change(brightness, { target: { value: '0.35' } })
    fireEvent.blur(brightness)
    expect(onPatch).toHaveBeenCalledWith({ view: { brightness: 0.35 } })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mirror clip' }))
    expect(onPatch).toHaveBeenCalledWith({ view: { mirror: true } })

    fireEvent.change(screen.getByRole('combobox', { name: 'Clip evaluation' }), {
      target: { value: 'freeze-at-entry' },
    })
    expect(onPatch).toHaveBeenCalledWith({ evaluationPolicy: 'freeze-at-entry' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Clip evaluation' }), {
      target: { value: 'rolling-refresh' },
    })
    expect(onPatch).toHaveBeenCalledWith({ evaluationPolicy: 'rolling-refresh' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Set Speed target' }))
    expect(onPatch).toHaveBeenCalledWith({ simulation: { controlTargets: undefined } })
  })

  it('keeps placement-owned Hue phase visible and editable in composition Clips (#586)', () => {
    const onPatch = vi.fn()
    render(<ShowClipEntityDetail {...commonProps('scene-main', onPatch)} />)

    const phase = screen.getByRole('spinbutton', { name: 'Phase' })
    expect(phase).toHaveValue(0.25)
    fireEvent.change(phase, { target: { value: '0.5' } })
    fireEvent.blur(phase)
    expect(onPatch).toHaveBeenCalledWith({ view: { phase: 0.5 } })
  })

  it('labels and commits Live, Freeze, Strobe, and Blink as Clip presentation controls (#586)', () => {
    const onPatch = vi.fn()
    const props = commonProps('scene-main', onPatch)
    const { rerender } = render(<ShowClipEntityDetail {...props} />)
    fireEvent.click(screen.getByText('Advanced clip controls'))

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
    const cadence = screen.getByRole('spinbutton', { name: 'Strobe cadence seconds' })
    fireEvent.change(cadence, { target: { value: '0.5' } })
    fireEvent.blur(cadence)
    expect(onPatch).toHaveBeenCalledWith({ presentation: { mode: 'strobe', cadenceMs: 500 } })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Blink Clip output' }))
    expect(onPatch).toHaveBeenCalledWith({ blink: { rateHz: 2, duty: 0.5, phase: 0 } })
  })

  it('authors the first-class Transform in placement units while displaying rotation in degrees (#529)', () => {
    const onPatch = vi.fn()
    render(<ShowClipEntityDetail {...commonProps('scene-main', onPatch)} />)

    expect(screen.getByRole('group', { name: 'Clip Transform' })).toBeInTheDocument()
    const positionX = screen.getByRole('spinbutton', { name: 'Content X' })
    fireEvent.change(positionX, { target: { value: '0.25' } })
    fireEvent.blur(positionX)
    expect(onPatch).toHaveBeenCalledWith({ transform: { positionX: 0.25 } })

    const rotation = screen.getByRole('spinbutton', { name: 'Rotation degrees' })
    fireEvent.change(rotation, { target: { value: '90' } })
    fireEvent.blur(rotation)
    expect(onPatch).toHaveBeenCalledWith({ transform: { rotation: 0.25 } })
  })

  it('uses the Viewport heading itself as the placement disclosure (#63)', () => {
    const onPatch = vi.fn()
    const props = commonProps('scene-main', onPatch)
    const { rerender } = render(<ShowClipEntityDetail {...props} />)

    const placement = screen.getByRole('group', { name: 'Clip Transform' })
    const contentX = screen.getByRole('spinbutton', { name: 'Content X' })
    const viewportToggle = screen.getByRole('checkbox', { name: 'Viewport' })
    expect(within(placement).queryByText('Content')).not.toBeInTheDocument()
    expect(viewportToggle.previousElementSibling).toHaveTextContent('Viewport')
    expect(screen.queryByRole('group', { name: 'Viewport geometry' })).not.toBeInTheDocument()
    expect(contentX.compareDocumentPosition(viewportToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(viewportToggle)
    expect(onPatch).toHaveBeenCalledWith({ viewport: { enabled: true } })

    rerender(<ShowClipEntityDetail
      {...props}
      value={{ ...props.value, viewport: { enabled: true, x: 0, y: 0, width: 1, height: 1 } }}
    />)
    const disclosedViewport = screen.getByRole('group', { name: 'Viewport geometry' })
    expect(viewportToggle.compareDocumentPosition(disclosedViewport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const viewportX = screen.getByRole('spinbutton', { name: 'Viewport X' })
    fireEvent.change(viewportX, { target: { value: '0.25' } })
    fireEvent.blur(viewportX)
    expect(onPatch).toHaveBeenCalledWith({ viewport: { x: 0.25 } })
  })

  it('opens Placement by default and lets it collapse temporarily (#63)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} />)

    const placement = screen.getByRole('group', { name: 'Clip Transform' })
    const disclosure = within(placement).getByText('Placement')
    expect(placement).toHaveAttribute('open')
    expect(screen.getByRole('spinbutton', { name: 'Content X' })).toBeVisible()

    fireEvent.click(disclosure)
    expect(placement).not.toHaveAttribute('open')
    expect(screen.getByRole('spinbutton', { name: 'Content X' })).not.toBeVisible()
  })

  it('does not offer the 2D Transform group for an incompatible Stage (#529)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} transformEnabled={false} />)

    expect(screen.queryByRole('group', { name: 'Clip Transform' })).not.toBeInTheDocument()
  })

  it('shows an authored Mirror in the active Effect stack and removes it through the Effect UI (#543)', () => {
    const onPatch = vi.fn()
    const props = commonProps('scene-main', onPatch)
    render(<ShowClipEntityDetail {...props} value={{ ...props.value, view: { ...props.value.view, mirror: true } }} />)

    expect(screen.getByText('Mirror')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mirror Effect' }))
    expect(onPatch).toHaveBeenCalledWith({ view: { mirror: false } })
  })

  it('presents Pattern and advanced controls as flat readable tables', () => {
    render(<ShowClipEntityDetail {...commonProps('global')} />)

    const patternTable = screen.getByRole('table', { name: 'Pattern controls' })
    expect(patternTable).toHaveTextContent('Speed')
    expect(patternTable).toHaveTextContent('sliderSpeed')
    expect(patternTable).toHaveTextContent('0–1')
    expect(screen.getByRole('table', { name: 'Advanced clip controls' })).toBeInTheDocument()
    const advancedRows = screen.getByRole('table', { name: 'Advanced clip controls' }).querySelectorAll('tbody tr')
    expect(advancedRows[0].children[1]).toHaveTextContent('Mirror clip')
    expect(advancedRows[0].children[0]).toContainElement(screen.getByRole('checkbox', { name: 'Mirror clip' }))
    expect(advancedRows[1].children[1]).toHaveTextContent('Phase')
    expect(advancedRows[1].children[2]).toContainElement(screen.getByRole('spinbutton', { name: 'Phase' }))
    expect(screen.getByRole('combobox', { name: 'Source pattern' })).toHaveClass(
      'h-5',
      'pl-[5px]',
      'pr-[23px]',
    )
    expect(screen.getByRole('spinbutton', { name: 'Animation speed' })).toHaveClass('h-5', 'px-[5px]')
    expect(screen.getByRole('spinbutton', { name: 'Speed target' })).toHaveClass('h-5', 'border-0', 'border-b')
    expect(screen.getByRole('spinbutton', { name: 'Phase' })).toHaveClass('h-5', 'border-0', 'border-b', 'text-left')
  })

  it('keeps Pattern controls on one unruled line with a compact Value column (#63)', () => {
    render(<ShowClipEntityDetail {...commonProps('global')} />)

    expect(screen.getByText('Pattern controls')).toBeInTheDocument()
    expect(screen.queryByText('Add or edit pattern controls')).not.toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Pattern controls' })
    const columns = table.querySelectorAll('col')
    expect(columns[1]).toHaveStyle({ width: '24%' })
    expect(columns[3]).toHaveClass('w-8')
    expect(table.querySelector('tbody')).not.toHaveClass('divide-y')

    const row = screen.getByRole('row', { name: /Set Speed target/ })
    expect(row).toHaveClass('h-6')
    expect(within(row).getByRole('rowheader', { name: 'Speed' })).toHaveClass('truncate', 'whitespace-nowrap')
    expect(row.querySelector<HTMLElement>('[title^="sliderSpeed"]')).toHaveClass('truncate', 'whitespace-nowrap')
    expect(screen.getByRole('spinbutton', { name: 'Speed target' }).closest('td')).toHaveClass(
      'whitespace-nowrap',
      '[&_input]:!border-0',
    )
  })

  it('matches Advanced Clip control rows to the compact three-column rhythm (#63)', () => {
    render(<ShowClipEntityDetail {...commonProps('scene-main')} advancedDefaultOpen />)

    const table = screen.getByRole('table', { name: 'Advanced clip controls' })
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

    const mirror = screen.getByRole('checkbox', { name: 'Mirror clip' })
    const mirrorRow = mirror.closest('tr')
    expect(mirrorRow?.children[0]).toContainElement(mirror)
    expect(mirrorRow?.children[1]).toHaveTextContent('Mirror clip')
  })

  it.each(['global', 'scene-main', 'scene-overlay'] as const)(
    'commits the same shared view and Effect actions for %s',
    (scope) => {
      const onPatch = vi.fn()
      const onOpenEffects = vi.fn()
      render(<ShowClipEntityDetail {...commonProps(scope, onPatch)} onOpenEffects={onOpenEffects} />)

      const brightness = screen.getByRole('spinbutton', { name: 'Brightness' })
      fireEvent.change(brightness, { target: { value: '0.45' } })
      fireEvent.blur(brightness)
      fireEvent.click(screen.getByRole('checkbox', { name: 'Mirror clip' }))
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(onPatch).toHaveBeenCalledWith({ view: { brightness: 0.45 } })
      expect(onPatch).toHaveBeenCalledWith({ view: { mirror: true } })
      expect(onOpenEffects).toHaveBeenCalledOnce()
    },
  )

  it('commits local timing, opacity, and layer assignment only for an overlay', () => {
    const onPatch = vi.fn()
    const onMoveLayer = vi.fn()
    render(<ShowClipEntityDetail {...commonProps('scene-overlay', onPatch)} onMoveLayer={onMoveLayer} />)

    const duration = screen.getByRole('spinbutton', { name: 'Duration seconds' })
    fireEvent.change(duration, { target: { value: '3.5' } })
    fireEvent.blur(duration)
    expect(onPatch).toHaveBeenCalledWith({ local: { durationMs: 3_500 } })

    const opacity = screen.getByRole('spinbutton', { name: 'Opacity' })
    fireEvent.change(opacity, { target: { value: '0.4' } })
    fireEvent.blur(opacity)
    expect(onPatch).toHaveBeenCalledWith({ local: { opacity: 0.4 } })

    fireEvent.change(screen.getByRole('combobox', { name: 'Overlay target layer' }), { target: { value: 'layer-2' } })
    expect(onMoveLayer).toHaveBeenCalledWith('layer-2')
  })
})
