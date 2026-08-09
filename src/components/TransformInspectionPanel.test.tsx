import { fireEvent, render, screen } from '@testing-library/react'
import { TransformInspectionPanel } from './TransformInspectionPanel'
import type { TransformArtifactInspection } from '@/engine/transformInspection'

describe('TransformInspectionPanel', () => {
  it('renders an absent artifact as quiet section copy', () => {
    render(<TransformInspectionPanel artifact={null} />)

    const empty = screen.getByText('No generated artifact has been recorded yet.')
    expect(empty.tagName).toBe('P')
    expect(empty).not.toHaveClass('border', 'border-dashed', 'bg-zinc-950/25')
  })

  it('renders transform summary details and opens the generated artifact read-only', () => {
    render(<TransformInspectionPanel artifact={artifact()} />)

    expect(screen.getByText('Twinkle')).toBeInTheDocument()
    expect(screen.getAllByText(/beforeRender wrapped/i).length).toBeGreaterThan(0)
    expect(screen.getByText('Call sites')).toBeInTheDocument()
    expect(screen.getByText('hsv x2')).toBeInTheDocument()
    expect(screen.getByText('sliderSpeed (function-call)')).toBeInTheDocument()
    expect(screen.getAllByText(/render2D -> render3D \(z=0.5\)/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Bind target sliderMissing was not found/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /view generated artifact/i }))

    expect(screen.getByRole('dialog', { name: /generated read-only artifact/i })).toBeInTheDocument()
    expect(screen.getByText(/Not editable source/i)).toBeInTheDocument()
    expect(screen.getByText(/export function render/)).toBeInTheDocument()
  })
})

function artifact(): TransformArtifactInspection {
  return {
    patternName: 'Twinkle',
    updatedAt: 1,
    generatedSource: 'export function render(index) { hsv(index, 1, 1) }',
    warnings: [
      {
        passId: 'missing-drive',
        code: 'missing-bind-target',
        message: 'Bind target sliderMissing was not found.',
      },
    ],
    summary: {
      passes: [
        {
          id: 'hardware-brightness',
          kind: 'intercept',
          callSitesWrapped: { hsv: 2 },
          estimatedPixelCost: 2,
        },
        {
          id: 'speed-drive',
          kind: 'bind',
          beforeRender: 'wrapped',
          bindingsApplied: [{ target: 'sliderSpeed', mode: 'function-call' }],
          estimatedPixelCost: 0,
        },
        {
          id: 'renderer-adapter',
          kind: 'renderer-adapter',
          rendererAdaptation: {
            mapDimension: 2,
            sourceRenderer: 'render3D',
            adapterRenderer: 'render2D',
            missingCoordinates: ['z'],
          },
          estimatedPixelCost: 1,
        },
      ],
      callSitesWrapped: { hsv: 2 },
      beforeRender: 'wrapped',
      globalsAdded: ['__pxlblz_hardware_brightness_hsv'],
      exportsAdded: [],
      bindingsApplied: [{ target: 'sliderSpeed', mode: 'function-call' }],
      rendererAdaptations: [{
        mapDimension: 2,
        sourceRenderer: 'render3D',
        adapterRenderer: 'render2D',
        missingCoordinates: ['z'],
      }],
      estimatedPixelCost: 3,
    },
  }
}
