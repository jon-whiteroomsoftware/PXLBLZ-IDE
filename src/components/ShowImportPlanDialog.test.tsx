import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ShowImportPlan } from '@/engine/showImportPlan'
import { ShowImportPlanDialog } from './ShowImportPlanDialog'

function plan(): ShowImportPlan {
  return {
    bundle: { show: { name: 'Voltage Bloom' } } as ShowImportPlan['bundle'],
    show: { id: 'show-new', name: 'Voltage Bloom' },
    patterns: {
      builtIn: [{ id: 'stock-1', name: 'Plasma Nebula' }],
      reused: [{ id: 'user-1', name: 'Compass Rose' }],
      added: [{ id: 'user-2', name: 'Squiggles' }],
      copied: [{
        id: 'user-3',
        name: 'Neon Rain',
        targetId: 'user-copy',
        targetName: 'Neon Rain (Voltage Bloom)',
      }],
    },
    maps: {
      reused: [],
      added: [{ id: 'map-1', name: 'Warehouse Grid' }],
      copied: [],
    },
    now: 100,
  }
}

describe('ShowImportPlanDialog', () => {
  it('renders the approved plan states and delegates Confirm or Cancel without applying logic', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ShowImportPlanDialog
        state={{ kind: 'plan', plan: plan() }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    const dialog = screen.getByRole('alertdialog', { name: 'Import “Voltage Bloom”' })
    expect(dialog).toHaveClass('max-w-[31.5rem]')
    expect(screen.getByRole('heading', { name: 'Shows' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Patterns' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Maps' })).toBeInTheDocument()
    expect(screen.getByText('Plasma Nebula · Compass Rose')).toBeInTheDocument()
    expect(screen.getByText('Squiggles')).toBeInTheDocument()
    expect(screen.getByText('Neon Rain (Voltage Bloom)')).toHaveClass('text-live')
    expect(dialog).toHaveTextContent('Neon Rain differs from yours → Neon Rain (Voltage Bloom)')
    expect(screen.getAllByLabelText('Will be added')).toHaveLength(3)
    expect(screen.getByLabelText('Already in your library')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Import Show' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('renders the approved single-action failure state', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ShowImportPlanDialog
        state={{
          kind: 'error',
          message: 'Show “Sunset Drift” needs the built-in Pattern AuroraCascade.',
          entityId: 'AuroraCascade',
        }}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByRole('alertdialog', { name: 'Can’t import this file' })).toHaveTextContent('AuroraCascade')
    expect(screen.getByText('AuroraCascade')).toHaveClass('font-mono')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
