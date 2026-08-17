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
  artifactBytes: 360,
  provenanceBytes: 40,
  budgetBytes: 1_000,
  rows: [
    {
      id: 'pattern:stock:test',
      category: 'pattern',
      label: 'Test Pattern',
      bytes: 300,
      percentage: 0.3,
      creatorEditable: true,
      logicalInstanceCount: 2,
      physicalMachineCount: 2,
      authoredReferenceCount: 7,
      patternBreakdown: {
        baseCopies: [{ ownerId: 'primary', bytes: 40 }, { ownerId: 'specialized', bytes: 50 }],
        baseBytes: 90,
        generatedBytes: 210,
      },
    },
    {
      id: 'category:runtime-scheduler',
      category: 'runtime-scheduler',
      label: 'PXLBLZ Show infrastructure',
      bytes: 100,
      percentage: 0.1,
      creatorEditable: false,
    },
  ],
}

function renderPopover(
  delivery?: { totalBytes: number; transformBytes: number },
  modelOverride: ShowArtifactInventoryModel = model,
) {
  render(
    <ShowArtifactInventoryPopover
      inventory={inventory}
      model={modelOverride}
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
    expect(focusedInventory).toHaveTextContent('Pattern copies running')
    expect(focusedInventory).toHaveTextContent('Up to 4 at once')
    expect(focusedInventory).toHaveTextContent('Busiest LED: 1 Pattern color calculation normally, up to 2 when visuals overlap')
    expect(focusedInventory).toHaveTextContent(
      'Busiest LED counts how many Pattern colors are calculated for one LED at the same moment. Effects modify those colors; they do not add another Pattern calculation.',
    )
    expect(focusedInventory).toHaveTextContent('2 configured uses · 2 copies in delivered code · 7 timeline placements')
    expect(focusedInventory).toHaveTextContent('one compiled copy 40 B + 50 B across 1 additional compiled copy + 210 B generated for Show settings and placements = 300 B')
    expect(focusedInventory).not.toHaveTextContent('2 x 40 B')
    expect(focusedInventory).not.toHaveTextContent('Ways to slim this Show')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(focusedInventory, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Show source inventory' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    trigger.blur()
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    fireEvent.pointerEnter(trigger)
    const hoveredInventory = screen.getByRole('dialog', { name: 'Show source inventory' })
    fireEvent.pointerLeave(trigger)
    expect(screen.getByRole('dialog', { name: 'Show source inventory' })).toBeInTheDocument()
    fireEvent.pointerEnter(hoveredInventory)
    await new Promise((resolve) => window.setTimeout(resolve, 200))
    expect(screen.getByRole('dialog', { name: 'Show source inventory' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close Show source inventory' })).not.toBeInTheDocument()
    fireEvent.pointerLeave(hoveredInventory)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Show source inventory' })).not.toBeInTheDocument())

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Show source inventory' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close Show source inventory' })).toBeInTheDocument()
    fireEvent.pointerLeave(trigger)
    expect(screen.getByRole('dialog', { name: 'Show source inventory' })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Show source inventory' })).not.toBeInTheDocument())
  })

  it('uses repeated-cost notation only for equal measured compiled copies (#878)', () => {
    const equalModel = structuredClone(model)
    const pattern = equalModel.rows[0]
    pattern.physicalMachineCount = 3
    pattern.patternBreakdown = {
      baseCopies: [
        { ownerId: 'first', bytes: 40 },
        { ownerId: 'second', bytes: 40 },
        { ownerId: 'third', bytes: 40 },
      ],
      baseBytes: 120,
      generatedBytes: 180,
    }
    renderPopover(undefined, equalModel)

    const trigger = screen.getByRole('button', { name: /show source inventory/i })
    fireEvent.focus(trigger)
    expect(screen.getByRole('dialog', { name: 'Show source inventory' })).toHaveTextContent(
      'one compiled copy 40 B + 2 x 40 B for 2 additional compiled copies + 180 B generated for Show settings and placements = 300 B',
    )
  })
})
