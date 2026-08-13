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

function renderPopover(delivery?: { totalBytes: number; transformBytes: number }) {
  render(
    <ShowArtifactInventoryPopover
      inventory={inventory}
      model={model}
      vmWords={{ used: 100, budget: 1_000, remaining: 900 }}
      renderers={{
        controller: { steady: 3, worst: 4 },
        perPixel: { steady: 1, worst: 2 },
      }}
      structure={{ transitionCount: 0 }}
      delivery={delivery}
    />,
  )
}

describe('ShowArtifactInventoryPopover', () => {
  it('includes active Controller transforms in the advisory total (#849)', () => {
    renderPopover({ totalBytes: 1_100, transformBytes: 700 })

    const trigger = screen.getByRole('button', { name: /show source inventory/i })
    expect(trigger).toHaveTextContent('1.07 KB / 1000 B')
    fireEvent.focus(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Show source inventory' })
    expect(dialog).toHaveTextContent('Controller transforms')
    expect(dialog).toHaveTextContent('+700 B')
    expect(dialog).toHaveTextContent('Controller source')
    expect(dialog).toHaveTextContent('110.0% advisory')
  })

  it('opens and closes through focus, hover, pinning, and Escape (#545, #756)', async () => {
    renderPopover()
    const trigger = screen.getByRole('button', { name: /show source inventory/i })

    fireEvent.focus(trigger)
    const focusedInventory = screen.getByRole('dialog', { name: 'Show source inventory' })
    expect(focusedInventory).toHaveTextContent('Controller renderers')
    expect(focusedInventory).toHaveTextContent('4 peak active')
    expect(focusedInventory).toHaveTextContent('Per pixel: 1 steady / 2 peak')
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
