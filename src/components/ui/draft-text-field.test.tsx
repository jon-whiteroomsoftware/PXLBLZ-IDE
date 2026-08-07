import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DraftTextField } from './draft-text-field'

describe('DraftTextField', () => {
  it('applies valid text once and cancels a dirty draft on dismissal (#751)', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<DraftTextField ariaLabel="Marker name" value="Verse" onApply={onApply} />)
    const input = screen.getByRole('textbox', { name: 'Marker name' })

    await user.click(input)
    await user.clear(input)
    await user.type(input, 'Chorus')
    await user.click(document.body)
    expect(onApply).not.toHaveBeenCalled()
    expect(input).toHaveValue('Verse')

    await user.click(input)
    await user.clear(input)
    await user.type(input, 'Chorus')
    await user.click(screen.getByRole('button', { name: 'Apply Marker name' }))
    expect(onApply).toHaveBeenCalledOnce()
    expect(onApply).toHaveBeenCalledWith('Chorus')
    expect(input).toHaveValue('Chorus')
  })

  it('keeps an invalid parsed draft local and disables apply until it is valid', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(
      <DraftTextField
        ariaLabel="Pixel ranges"
        value="0-63"
        parse={(draft) => draft.includes('-') ? draft : null}
        onApply={onApply}
      />,
    )
    const input = screen.getByRole('textbox', { name: 'Pixel ranges' })

    await user.click(input)
    await user.clear(input)
    await user.type(input, 'broken')
    expect(screen.getByRole('button', { name: 'Apply Pixel ranges' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(input).toHaveValue('0-63')
    expect(onApply).not.toHaveBeenCalled()
  })

  it('cancels to the latest controlled text when it changes during a draft', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const view = render(<DraftTextField ariaLabel="Marker name" value="Verse" onApply={onApply} />)
    const input = screen.getByRole('textbox', { name: 'Marker name' })

    await user.click(input)
    await user.clear(input)
    await user.type(input, 'Bridge')
    view.rerender(<DraftTextField ariaLabel="Marker name" value="Chorus" onApply={onApply} />)
    expect(input).toHaveValue('Bridge')

    await user.click(document.body)
    expect(input).toHaveValue('Chorus')
    expect(onApply).not.toHaveBeenCalled()
  })
})
