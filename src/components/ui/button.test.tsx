import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

const variants = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const

describe('Button interaction styling (#636)', () => {
  it('does not add a focus state to enabled, untoggled buttons', () => {
    render(
      <>
        {variants.map((variant) => (
          <Button key={variant} variant={variant}>{variant}</Button>
        ))}
      </>,
    )

    for (const variant of variants) {
      const button = screen.getByRole('button', { name: variant })
      expect(button.className.split(/\s+/).filter((token) => token.startsWith('focus-visible:'))).toEqual([])
    }
  })

  it('keeps disabled and toggle styling independent from focus', () => {
    render(
      <>
        <Button disabled>Disabled action</Button>
        <Button variant="ghost" aria-expanded="true">Expanded toggle</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Disabled action' })).toHaveClass(
      'disabled:pointer-events-none',
      'disabled:opacity-50',
    )
    expect(screen.getByRole('button', { name: 'Expanded toggle' })).toHaveClass(
      'aria-expanded:bg-muted',
      'aria-expanded:text-foreground',
    )
  })
})
