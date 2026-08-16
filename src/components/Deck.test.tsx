import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DeckSection,
  resetDeckSectionPersistenceForTests,
} from './Deck'

beforeEach(() => resetDeckSectionPersistenceForTests())

describe('DeckSection', () => {
  it('persists disclosure state by key across unmount and remount', () => {
    const first = render(
      <DeckSection label="Power" collapsible persistKey="controller:power" summary="summary">
        telemetry
      </DeckSection>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    expect(screen.queryByText('telemetry')).not.toBeInTheDocument()
    first.unmount()

    render(
      <DeckSection label="Power" collapsible persistKey="controller:power" summary="summary">
        telemetry
      </DeckSection>,
    )
    expect(screen.getByRole('button', { name: 'Power' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('summary')).toBeInTheDocument()
    expect(screen.queryByText('telemetry')).not.toBeInTheDocument()
  })

  it('supports a folded default without truncating the one-line summary', () => {
    render(
      <DeckSection
        label="Power"
        collapsible
        defaultExpanded={false}
        summary="limiting · duty 29% · 0.4 A · 5.1 W"
      >
        telemetry
      </DeckSection>,
    )

    const summary = screen.getByTestId('deck-section-summary')
    expect(summary).toHaveClass('whitespace-nowrap')
    expect(summary).not.toHaveClass('truncate')
    expect(screen.getByRole('button', { name: 'Power' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('uses the compact section and header rhythm without shrinking disclosure hit targets', () => {
    render(
      <DeckSection label="Pixelblaze" collapsible>
        content
      </DeckSection>,
    )

    const toggle = screen.getByRole('button', { name: 'Pixelblaze' })
    const section = toggle.closest('[data-deck="section"]')
    const header = toggle.closest('[data-deck="section-header"]')
    expect(section).toHaveClass('mt-0.5', 'pt-1', 'pb-1.5')
    expect(header).toHaveClass('mb-1', 'h-[18px]')
    expect(toggle).toHaveClass('text-[10.5px]', 'h-full', 'w-full')
  })
})
