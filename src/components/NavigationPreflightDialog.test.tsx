import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NavigationPreflightDialog } from './NavigationPreflightDialog'
import { editorInitialState, useEditorStore } from '@/store/editorStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { routerInitialState, useRouterStore } from '@/store/routerStore'
import {
  __resetNavigationPreflightForTests,
  requestBufferReplacement,
} from '@/store/navigationPreflightStore'

const PATTERN = {
  id: 'pattern-1',
  name: 'Broken aurora',
  src: 'export function render(index) {}',
  controls: {},
  updatedAt: 100,
}

function openBrokenPattern(): void {
  usePatternStore.setState({ userPatterns: [PATTERN], activePatternId: PATTERN.id })
  useRouterStore.setState({
    route: { kind: 'studio', entity: { kind: 'patterns', id: PATTERN.id } },
  })
  useEditorStore.setState({
    editorFlavor: 'pattern',
    source: 'broken(',
    compileStatus: 'broken',
    isReadOnly: false,
    bufferEdited: true,
  })
}

beforeEach(() => {
  __resetNavigationPreflightForTests()
  useRouterStore.setState(routerInitialState)
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  openBrokenPattern()
})

describe('NavigationPreflightDialog (#831)', () => {
  it('names the record and makes the discard consequence explicit', () => {
    requestBufferReplacement(vi.fn())
    render(<NavigationPreflightDialog />)

    expect(screen.getByRole('alertdialog', { name: 'Discard broken source?' })).toBeInTheDocument()
    expect(screen.getByText(/"Broken aurora" has source errors and cannot be saved/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard and continue' })).toBeInTheDocument()
  })

  it('supports keyboard Cancel and Continue while running only the approved transition', async () => {
    const user = userEvent.setup()
    const transition = vi.fn()
    requestBufferReplacement(transition)
    render(<NavigationPreflightDialog />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(transition).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    requestBufferReplacement(transition)
    const action = await screen.findByRole('button', { name: 'Discard and continue' })
    action.focus()
    await user.keyboard('{Enter}')

    expect(transition).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
