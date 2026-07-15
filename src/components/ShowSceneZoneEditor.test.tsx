import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectFlatShowComposition } from '@/engine/showCompositionProjection'
import { createDefaultShow } from '@/engine/showModel'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { ShowSceneZoneEditor } from './ShowSceneZoneEditor'

const source = 'export function render(index) { rgb(index / pixelCount, 0, 0) }'

function fixture() {
  const show = createDefaultShow('show-local-ui', 'Local UI')
  const projection = projectFlatShowComposition(show, {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
    stageDimension: 1,
  })
  return { show, projection }
}

describe('ShowSceneZoneEditor (#487)', () => {
  beforeEach(() => useShowTransportStore.setState(showTransportInitialState))

  it('renders the production Scene x Zone scope and selects the real Main clip', () => {
    const { show, projection } = fixture()
    const onBack = vi.fn()
    const onSelectClip = vi.fn()
    render(
      <ShowSceneZoneEditor
        show={show}
        compositionProjection={projection}
        scope={{ sceneId: 'scene-2', zoneId: 'zone-1' }}
        readOnly={false}
        selectedClipId={null}
        transport={<span>transport</span>}
        onBack={onBack}
        onZoneChange={vi.fn()}
        onSelectClip={onSelectClip}
        onSeek={vi.fn()}
      />,
    )

    expect(screen.getByRole('region', { name: 'Scene 2 main Scene editor' })).toHaveTextContent('Scene 2')
    expect(screen.getByRole('region', { name: 'Scene 2 main Scene editor' })).toHaveTextContent('Default')
    expect(screen.getByText('CometLoom')).toBeInTheDocument()
    expect(screen.getByText('Transitions')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Select CometLoom Main clip' }))
    expect(onSelectClip).toHaveBeenCalledWith('cell-2', expect.any(HTMLElement))

    fireEvent.click(screen.getByRole('button', { name: 'Back to Show timeline' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('changes only the Zone part of the local scope', () => {
    const { show, projection } = fixture()
    const onZoneChange = vi.fn()
    render(
      <ShowSceneZoneEditor
        show={show}
        compositionProjection={projection}
        scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
        readOnly={false}
        selectedClipId={null}
        transport={null}
        onBack={vi.fn()}
        onZoneChange={onZoneChange}
        onSelectClip={vi.fn()}
        onSeek={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Scene Zone' }), { target: { value: 'zone-1' } })
    expect(onZoneChange).toHaveBeenCalledWith('zone-1')
  })

  it('maps Show transport time into local Scene time and seeks in global time', () => {
    const { show, projection } = fixture()
    useShowTransportStore.getState().openShow(show.id, 62_000)
    useShowTransportStore.getState().setPosition(show.id, 47_000)
    const onSeek = vi.fn()
    render(
      <ShowSceneZoneEditor
        show={show}
        compositionProjection={projection}
        scope={{ sceneId: 'scene-2', zoneId: 'zone-1' }}
        readOnly={false}
        selectedClipId={null}
        transport={null}
        onBack={vi.fn()}
        onZoneChange={vi.fn()}
        onSelectClip={vi.fn()}
        onSeek={onSeek}
      />,
    )

    expect(screen.getByLabelText('Scene local time')).toHaveTextContent('00:15.0/00:30.0')
    fireEvent.click(screen.getByTestId('scene-local-time-track'), { clientX: 50 })
    expect(onSeek).toHaveBeenCalled()
    expect(onSeek.mock.calls[0][0]).toBeGreaterThanOrEqual(32_000)
  })
})
