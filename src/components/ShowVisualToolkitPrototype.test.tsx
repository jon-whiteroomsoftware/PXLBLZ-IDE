import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowVisualToolkitPrototype } from './ShowVisualToolkitPrototype'

describe('Show visual-toolkit review candidate', () => {
  it('keeps scene animation, staged Effects, and boundary Transitions distinct', async () => {
    const user = userEvent.setup()
    render(<ShowVisualToolkitPrototype showName="Stress test" />)

    expect(screen.getByPlaceholderText('Search 59 tools and presets')).toBeInTheDocument()
    expect(screen.getAllByText('Transform').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Color & output').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Test 3 value changes inside this scene' }))
    expect(screen.getByText(/Current model has no in-scene keyframes/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Select boundary before Neon orchard' }))
    expect(screen.getByText('One boundary object · not an Effect stack')).toBeInTheDocument()
  })
})
