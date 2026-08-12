// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SaveFailureNotice } from './SaveFailureNotice'

describe('SaveFailureNotice', () => {
  it('announces one-shot operation failures with action-specific Retry and Dismiss controls', () => {
    const onRetry = vi.fn()
    const onDismiss = vi.fn()
    render(
      <SaveFailureNotice
        message={'Could not create pattern "Untitled Pattern".'}
        onRetry={onRetry}
        onDismiss={onDismiss}
        retryLabel="Retry create pattern"
        dismissLabel="Dismiss create pattern notice"
        testId="studio-operation-failure"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Could not create pattern')
    fireEvent.click(screen.getByRole('button', { name: 'Retry create pattern' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss create pattern notice' }))

    expect(onRetry).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
