import { fireEvent, render, screen } from '@testing-library/react'
import { PatternPushFailureNotice } from './PatternPushFailureNotice'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'

beforeEach(() => {
  useControllerStore.setState(controllerInitialState)
  usePatternStore.setState(patternInitialState)
})

describe('PatternPushFailureNotice (#849)', () => {
  it('shows the current Pattern failure until the user dismisses it', () => {
    usePatternStore.setState({ activePatternId: 'pattern-current' })
    useControllerStore.setState({
      artifactPushResult: {
        ok: false,
        message: 'Controller compile failed',
        artifactId: 'pattern-current',
        mode: 'run',
      },
    })

    render(<PatternPushFailureNotice />)

    expect(screen.getByRole('alert')).toHaveTextContent('Run failed: Controller compile failed')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Run failure' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not borrow another artifact failure', () => {
    usePatternStore.setState({ activePatternId: 'pattern-current' })
    useControllerStore.setState({
      artifactPushResult: {
        ok: false,
        message: 'Other Pattern failed',
        artifactId: 'pattern-other',
        mode: 'save',
      },
    })

    render(<PatternPushFailureNotice />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
