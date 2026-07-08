import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import { createDefaultShow } from '@/engine/showModel'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'

beforeEach(() => {
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
})

describe('ShowEditor (#318)', () => {
  it('renders a scene strip, selectable cell inspector, and compile bar', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByDisplayValue('Scene 1')).toBeInTheDocument()
    expect(screen.getAllByText('main').length).toBeGreaterThan(0)
    expect(screen.getByText(/compiled artifact/i)).toBeInTheDocument()
    expect(screen.getByText(/renderer\/px/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Select TestPattern1D/i }))

    expect(screen.getByText('Cell - TestPattern1D')).toBeInTheDocument()
    expect(screen.getByLabelText('Mirror cell')).toBeInTheDocument()
  })
})
