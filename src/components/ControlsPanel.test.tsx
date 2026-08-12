import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ControlsPanel } from './ControlsPanel'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { useControlStore } from '@/store/controlStore'

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
  useControlStore.setState({ controlValues: {} })
})

describe('ControlsPanel help hint', () => {
  it('shows a help affordance and lists control descriptions when present', async () => {
    const user = userEvent.setup()
    useEditorStore.getState().setControls([
      { exportName: 'sliderSpeed', kind: 'slider', label: 'Speed', description: 'How fast it goes.' },
    ])
    render(<ControlsPanel />)

    const help = screen.getByRole('button', { name: /about these controls/i })
    await user.click(help)
    expect(screen.getByText(/how fast it goes/i)).toBeInTheDocument()
  })

  it('omits the help affordance when no control has a description', () => {
    useEditorStore.getState().setControls([
      { exportName: 'sliderSpeed', kind: 'slider', label: 'Speed' },
    ])
    render(<ControlsPanel />)
    expect(screen.queryByRole('button', { name: /about these controls/i })).not.toBeInTheDocument()
  })

  it('collapses Pattern controls while keeping its help button independent', async () => {
    const user = userEvent.setup()
    useEditorStore.getState().setControls([
      { exportName: 'sliderSpeed', kind: 'slider', label: 'Speed', description: 'How fast it goes.' },
    ])
    render(<ControlsPanel />)

    const toggle = screen.getByRole('button', { name: 'Pattern controls' })
    const section = toggle.closest('[data-expanded]')
    const header = toggle.closest('h4')?.parentElement
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(section).toHaveClass('pb-3')
    expect(header).toHaveClass('mb-2')

    await user.click(screen.getByRole('button', { name: /about these controls/i }))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('slider', { name: /speed/i })).toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(section).toHaveAttribute('data-expanded', 'false')
    expect(section).toHaveClass('pb-0')
    expect(header).toHaveClass('mb-0')
    expect(screen.queryByRole('slider', { name: /speed/i })).not.toBeInTheDocument()

    toggle.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('slider', { name: /speed/i })).toBeInTheDocument()
  })
})

describe('ControlsPanel curated seconds sliders (#819)', () => {
  it('renders an exact seconds field and stores typed values as raw / scale', async () => {
    const user = userEvent.setup()
    useEditorStore.getState().setControls([
      {
        exportName: 'sliderLoopInterval',
        kind: 'slider',
        label: 'Loop Interval',
        secondsPresentation: { scale: 10, minSeconds: 0.1 },
      },
    ])
    useControlStore.setState({ controlValues: { sliderLoopInterval: 0.2 } })
    render(<ControlsPanel />)

    // The raw 0.2 presents as 2 s, and typing an exact value writes back the
    // scaled raw slider value (2.37 s -> 0.237).
    const field = screen.getByRole('textbox', { name: /loop interval/i })
    expect(field).toHaveValue('2')
    await user.clear(field)
    await user.type(field, '2.37{Enter}')
    expect(useControlStore.getState().controlValues.sliderLoopInterval).toBeCloseTo(0.237, 6)
  })
})
