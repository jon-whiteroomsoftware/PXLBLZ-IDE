import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AngleField } from './angle-field'

describe('AngleField', () => {
  it('presents rotation in degrees and preserves signed multi-turn exact entry', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <AngleField
        kind="rotation"
        label="Rotation"
        value={0.5}
        min={-8}
        max={8}
        step={1 / 360}
        onChange={onChange}
      />,
    )
    const exact = screen.getByRole('textbox', { name: 'Rotation exact rotation' })
    expect(exact).toHaveValue('180')
    expect(document.querySelector('[data-unit-suffix="°"]')).toBeInTheDocument()

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '-720')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(-2)
    expect(exact).toHaveValue('-720')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '1.5t')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(1.5)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('wraps direction entry onto one cycle and keeps phase entry unnormalized', async () => {
    const user = userEvent.setup()
    const onDirection = vi.fn()
    const onPhase = vi.fn()
    render(
      <>
        <AngleField kind="direction" label="Direction" value={0} min={0} max={1} step={0.001} onChange={onDirection} />
        <AngleField kind="phase" label="Phase" value={0} min={-8} max={8} step={0.01} onChange={onPhase} />
      </>,
    )
    const direction = screen.getByRole('textbox', { name: 'Direction exact direction' })
    await user.click(direction)
    await user.clear(direction)
    await user.type(direction, '450')
    await user.tab()
    expect(onDirection).toHaveBeenLastCalledWith(0.25)
    expect(direction).toHaveValue('90')

    const phase = screen.getByRole('textbox', { name: 'Phase exact phase' })
    expect(document.querySelector('[data-unit-suffix="t"]')).toBeInTheDocument()
    await user.click(phase)
    await user.clear(phase)
    await user.type(phase, '2.25')
    await user.tab()
    expect(onPhase).toHaveBeenLastCalledWith(2.25)
    expect(phase).toHaveValue('2.25')
  })

  it('re-syncs a pinned slider when the committed value and window settle after opening', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <AngleField kind="rotation" label="Rotation" value={0.125} min={-8} max={8} step={1 / 360} onChange={onChange} />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust with rotation slider' })
    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = await screen.findByRole('slider', { name: 'Rotation slider' })
    expect(slider).toHaveAttribute('aria-valuetext', '45°')

    rerender(
      <AngleField kind="rotation" label="Rotation" value={1.25} min={-8} max={8} step={1 / 360} onChange={onChange} />,
    )
    expect(slider).toHaveAttribute('aria-valuetext', '450°')

    await user.keyboard('{Escape}')
    expect(screen.getByRole('textbox', { name: 'Rotation exact rotation' })).toHaveValue('450')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('wraps the direction slider End key onto canonical zero instead of a phantom full turn', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <AngleField kind="direction" label="Direction" value={0.25} min={0} max={1} step={0.001} onChange={onChange} />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust with direction slider' })
    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = await screen.findByRole('slider', { name: 'Direction slider' })
    await user.keyboard('{End}')
    expect(slider).toHaveAttribute('aria-valuetext', '0°')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(0)
    expect(screen.getByRole('textbox', { name: 'Direction exact direction' })).toHaveValue('0')
  })

  it('reverts an invalid draft on Escape without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <AngleField kind="cycles" label="Hue shift" value={0.5} min={-8} max={8} step={0.01} onChange={onChange} />,
    )
    const exact = screen.getByRole('textbox', { name: 'Hue shift exact turns' })
    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, 'nonsense')
    await user.keyboard('{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    expect(exact).toHaveValue('0.5')
  })
})
