import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShowArtifactInventoryPopover } from './ShowArtifactInventoryPopover'
import type { DeliveredShowSourceInventory, ShowArtifactInventoryModel } from '@/engine/showSourceInventory'

const inventory: DeliveredShowSourceInventory = {
  totalBytes: 400,
  generatedSourceBytes: 360,
  provenanceBytes: 40,
  chunks: [],
}

const model: ShowArtifactInventoryModel = {
  totalBytes: 400,
  budgetBytes: 1_000,
  rows: [{
    id: 'category:runtime-scheduler',
    category: 'runtime-scheduler',
    label: 'PXLBLZ Show infrastructure',
    bytes: 400,
    percentage: 0.4,
    creatorEditable: false,
  }],
  slimmingTips: [],
}

function renderPopover() {
  render(
    <ShowArtifactInventoryPopover
      inventory={inventory}
      model={model}
      vmWords={{ used: 100, budget: 1_000, remaining: 900 }}
      renderers={{ steady: 1, worst: 2 }}
      structure={{ transitionCount: 0 }}
    />,
  )
}

describe('ShowArtifactInventoryPopover', () => {
  it('opens and closes through focus, hover, pinning, and Escape (#545, #756)', async () => {
    renderPopover()
    const trigger = screen.getByRole('button', { name: /show source inventory/i })

    fireEvent.focus(trigger)
    const focusedInventory = screen.getByRole('dialog', { name: 'Show source inventory' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(focusedInventory, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Show source inventory' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()

    fireEvent.pointerEnter(trigger)
    expect(screen.getByRole('dialog', { name: 'Show source inventory' })).toBeInTheDocument()
    fireEvent.pointerLeave(trigger)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Show source inventory' })).not.toBeInTheDocument())

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Show source inventory' })).toBeInTheDocument()
    fireEvent.pointerLeave(trigger)
    expect(screen.getByRole('dialog', { name: 'Show source inventory' })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Show source inventory' })).not.toBeInTheDocument())
  })
})
