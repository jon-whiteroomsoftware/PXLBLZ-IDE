import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DimPills } from './DimPills'

describe('DimPills', () => {
  it('renders Pattern dimensionality as a quiet machine fact', () => {
    render(<DimPills dims={[1, 2, 3]} />)

    const fact = screen.getByText('1, 2, 3D')
    expect(fact).toHaveAttribute('title', 'Supported render dimensions: 1D, 2D, 3D')
    expect(fact).toHaveClass('font-mono', 'text-[10px]', 'tracking-[0.08em]', 'text-structural')
    expect(fact).not.toHaveClass('rounded', 'border', 'border-zinc-700')
  })
})
