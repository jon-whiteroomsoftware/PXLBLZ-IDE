import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { SpeedSelector } from './SpeedSelector'

describe('SpeedSelector', () => {
  beforeEach(() => {
    usePreviewStore.setState(previewInitialState)
  })

  it('presents preview speed as a multiplier through the shared domain notation', () => {
    render(<SpeedSelector />)

    expect(screen.getByRole('button', { name: 'Speed' })).toHaveTextContent('1x')
  })
})
