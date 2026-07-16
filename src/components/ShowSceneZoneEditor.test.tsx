import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectFlatShowComposition } from '@/engine/showCompositionProjection'
import { createDefaultShow } from '@/engine/showModel'
import { addShowOverlayClip, addShowOverlayLayer, projectFlatShowToCompositionV1, splitShowMainPlacement } from '@/engine/showCompositionModel'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
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

function compositionFixture() {
  const { show, projection: initialProjection } = fixture()
  const initial = projectFlatShowToCompositionV1(show, {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
    stageDimension: 1,
  })
  const placement = initial.scenes[0].zones[0].main[0]
  show.composition = splitShowMainPlacement(show, initial, {
    sceneId: 'scene-1',
    zoneId: 'zone-1',
    placementId: placement.id,
    atMs: 12_000,
    newPlacementId: 'right-placement',
  })
  return {
    show,
    placement,
    projection: projectFlatShowComposition(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
      stageDimension: 1,
    }),
    initialProjection,
  }
}

const editingProps = {
  patternOptions: [{ label: 'TestPattern1D', ref: { kind: 'stock' as const, id: 'TestPattern1D' } }],
  onEnableComposition: vi.fn(),
  onAddMain: vi.fn(),
  onUpdateMain: vi.fn(),
  onSplitMain: vi.fn(),
  onRestartMain: vi.fn(),
  onReplaceMainPattern: vi.fn(),
  onDeleteMain: vi.fn(),
  onAddOverlayLayer: vi.fn(),
  onRenameOverlayLayer: vi.fn(),
  onReorderOverlayLayer: vi.fn(),
  onDeleteOverlayLayer: vi.fn(),
  onAddOverlay: vi.fn(),
  onUpdateOverlay: vi.fn(),
  onSplitOverlay: vi.fn(),
  onDeleteOverlay: vi.fn(),
  onAddPropertyTrack: vi.fn(),
  onDeletePropertyTrack: vi.fn(),
  onAddPropertyKeyframe: vi.fn(),
  onUpdatePropertyKeyframe: vi.fn(),
  onDeletePropertyKeyframe: vi.fn(),
}

describe('ShowSceneZoneEditor (#487)', () => {
  beforeEach(() => {
    useShowTransportStore.setState(showTransportInitialState)
    useShowEditorSessionStore.setState(showEditorSessionInitialState)
  })

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
        {...editingProps}
      />,
    )

    expect(screen.getByRole('region', { name: 'Scene 2 main Scene editor' })).toHaveTextContent('Scene 2')
    expect(screen.getByRole('region', { name: 'Scene 2 main Scene editor' })).toHaveTextContent('Default')
    expect(screen.getByText('CometLoom')).toBeInTheDocument()
    expect(screen.getByText('Transitions')).toBeInTheDocument()
    expect(screen.getByTestId('scene-transition-playhead-line')).toBeInTheDocument()

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
        {...editingProps}
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
        {...editingProps}
      />,
    )

    expect(screen.getByLabelText('Scene local time')).toHaveTextContent('00:15.0/00:30.0')
    const playhead = screen.getByRole('slider', { name: 'Scene playhead' })
    expect(playhead).toHaveValue('15000')
    fireEvent.change(playhead, { target: { value: '5000' } })
    expect(useShowTransportStore.getState().positionMs).toBe(37_000)
    expect(onSeek).not.toHaveBeenCalled()
    fireEvent.pointerUp(playhead)
    expect(onSeek).toHaveBeenLastCalledWith(37_000)
    fireEvent.click(screen.getByTestId('scene-local-time-track'), { clientX: 50 })
    expect(onSeek).toHaveBeenCalled()
    expect(onSeek.mock.calls[0][0]).toBeGreaterThanOrEqual(32_000)
  })

  it('owns independent session-only diagnostic switches and selected-clip focus (#491)', () => {
    const { show, projection } = compositionFixture()
    render(
      <ShowSceneZoneEditor
        show={show}
        compositionProjection={projection}
        scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
        readOnly={false}
        selectedClipId={null}
        transport={null}
        onBack={vi.fn()}
        onZoneChange={vi.fn()}
        onSelectClip={vi.fn()}
        onSeek={vi.fn()}
        {...editingProps}
      />,
    )

    useShowEditorSessionStore.getState().setDiagnostic('zoneOutlines', true)
    useShowEditorSessionStore.getState().setDiagnostic('clipOutlines', true)
    fireEvent.click(screen.getByRole('button', { name: 'Show other-Zone timing guides' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Select TestPattern1D Main clip' })[0])

    expect(useShowEditorSessionStore.getState()).toMatchObject({
      diagnostics: { zoneOutlines: true, clipOutlines: true, otherZoneGuides: true },
      diagnosticFocus: { showId: show.id, sceneId: 'scene-1', zoneId: 'zone-1', placementId: expect.any(String) },
    })
  })

  it('makes conversion to an editable local Main schedule explicit', () => {
    const { show, projection } = fixture()
    const onEnableComposition = vi.fn()
    render(
      <ShowSceneZoneEditor
        show={show}
        compositionProjection={projection}
        scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
        readOnly={false}
        selectedClipId={null}
        transport={null}
        onBack={vi.fn()}
        onZoneChange={vi.fn()}
        onSelectClip={vi.fn()}
        onSeek={vi.fn()}
        {...editingProps}
        onEnableComposition={onEnableComposition}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Enable local cuts' }))
    expect(onEnableComposition).toHaveBeenCalledOnce()
  })

  it('edits exact local bounds and exposes Continue/Restart and Pattern-instance actions', () => {
    const { show, projection, placement } = compositionFixture()
    const onUpdateMain = vi.fn()
    const onSplitMain = vi.fn()
    const onRestartMain = vi.fn()
    const onDeleteMain = vi.fn()
    useShowTransportStore.getState().openShow(show.id, 62_000)
    useShowTransportStore.getState().setPosition(show.id, 6_000)
    render(
      <ShowSceneZoneEditor
        show={show}
        compositionProjection={projection}
        scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
        readOnly={false}
        selectedClipId={null}
        transport={null}
        onBack={vi.fn()}
        onZoneChange={vi.fn()}
        onSelectClip={vi.fn()}
        onSeek={vi.fn()}
        {...editingProps}
        patternOptions={[
          { label: 'TestPattern1D', ref: { kind: 'stock', id: 'TestPattern1D' } },
          { label: 'CometLoom', ref: { kind: 'stock', id: 'CometLoom' } },
        ]}
        onUpdateMain={onUpdateMain}
        onSplitMain={onSplitMain}
        onRestartMain={onRestartMain}
        onDeleteMain={onDeleteMain}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Select TestPattern1D Main clip' })[0])
    expect(screen.getByRole('spinbutton', { name: 'Duration seconds' })).toHaveValue(12)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Start seconds' }), { target: { value: '0.25' } })
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Start seconds' }))
    expect(onUpdateMain).toHaveBeenCalledWith(placement.id, { startMs: 250, durationMs: 12_000 })

    fireEvent.click(screen.getByRole('button', { name: 'Split Main clip at playhead' }))
    expect(onSplitMain).toHaveBeenCalledWith(placement.id, 6_000)
    fireEvent.click(screen.getByRole('button', { name: 'Restart Main clip instance' }))
    expect(onRestartMain).toHaveBeenCalledWith(placement.id)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Main clip' }))
    expect(onDeleteMain).toHaveBeenCalledWith(placement.id)
  })

  it('commits magnetic horizontal movement from the clip body', () => {
    const { show, placement } = compositionFixture()
    const zone = show.composition!.scenes[0].zones[0]
    zone.main[0].durationMs = 5_000
    zone.main[1].startMs = 10_000
    zone.main[1].durationMs = 5_000
    const authoredProjection = projectFlatShowComposition(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
      stageDimension: 1,
    })
    const onUpdateMain = vi.fn()
    render(
      <ShowSceneZoneEditor
        show={show}
        compositionProjection={authoredProjection}
        scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
        readOnly={false}
        selectedClipId={null}
        transport={null}
        onBack={vi.fn()}
        onZoneChange={vi.fn()}
        onSelectClip={vi.fn()}
        onSeek={vi.fn()}
        {...editingProps}
        onUpdateMain={onUpdateMain}
      />,
    )
    const clip = screen.getAllByRole('button', { name: 'Select TestPattern1D Main clip' })[0]
    Object.defineProperties(clip, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: vi.fn() },
    })
    vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 32, width: 100, height: 32, toJSON: () => ({}),
    })
    vi.spyOn(clip.parentElement!, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON: () => ({}),
    })

    fireEvent.pointerDown(clip, { pointerId: 1, button: 0, clientX: 0 })
    fireEvent.pointerMove(clip, { pointerId: 1, buttons: 1, clientX: 10 })
    fireEvent.pointerUp(clip, { pointerId: 1, button: 0, clientX: 10 })

    expect(onUpdateMain).toHaveBeenCalledWith(placement.id, { startMs: 5_000, durationMs: 5_000 })
  })

  it('authors compact overlay layers and clamps normalized opacity on commit', () => {
    const { show } = compositionFixture()
    const withLayer = addShowOverlayLayer(show, show.composition!, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'overlay-front', name: 'Front texture', placements: [] },
    })
    show.composition = addShowOverlayClip(show, withLayer, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-front',
      instance: {
        id: 'overlay-instance',
        pattern: { kind: 'stock', id: 'CometLoom' },
        patternName: 'CometLoom',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
      placement: {
        id: 'overlay-placement',
        instanceId: 'overlay-instance',
        startMs: 1_000,
        durationMs: 5_000,
        opacity: 0.6,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
    })
    const projection = projectFlatShowComposition(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
      stageDimension: 1,
    })
    const onRenameOverlayLayer = vi.fn()
    const onUpdateOverlay = vi.fn()
    const onDeleteOverlay = vi.fn()

    render(<ShowSceneZoneEditor
      show={show}
      compositionProjection={projection}
      scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
      readOnly={false}
      selectedClipId={null}
      transport={null}
      onBack={vi.fn()}
      onZoneChange={vi.fn()}
      onSelectClip={vi.fn()}
      onSeek={vi.fn()}
      {...editingProps}
      onRenameOverlayLayer={onRenameOverlayLayer}
      onUpdateOverlay={onUpdateOverlay}
      onDeleteOverlay={onDeleteOverlay}
    />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Front texture layer name' }), { target: { value: 'Atmosphere' } })
    fireEvent.blur(screen.getByRole('textbox', { name: 'Front texture layer name' }))
    expect(onRenameOverlayLayer).toHaveBeenCalledWith('overlay-front', 'Atmosphere')

    fireEvent.click(screen.getByRole('button', { name: 'Select CometLoom clip in Front texture' }))
    const opacity = screen.getByRole('spinbutton', { name: 'Opacity' })
    fireEvent.change(opacity, { target: { value: '9' } })
    fireEvent.blur(opacity)
    expect(opacity).toHaveValue(1)
    expect(onUpdateOverlay).toHaveBeenCalledWith('overlay-front', 'overlay-placement', {
      startMs: 1_000, durationMs: 5_000, opacity: 1,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete overlay clip' }))
    expect(onDeleteOverlay).toHaveBeenCalledWith('overlay-front', 'overlay-placement')
  })

  it('keeps horizontal overlay drags stable and moves to another layer only after vertical hysteresis (#491)', () => {
    const { show } = compositionFixture()
    let composition = addShowOverlayLayer(show, show.composition!, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'overlay-front', name: 'Front texture', placements: [] },
    })
    composition = addShowOverlayLayer(show, composition, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'overlay-back', name: 'Back texture', placements: [] },
    })
    show.composition = addShowOverlayClip(show, composition, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-front',
      instance: {
        id: 'overlay-instance', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
      placement: {
        id: 'overlay-placement', instanceId: 'overlay-instance', startMs: 1_000, durationMs: 5_000,
        opacity: 0.6, view: { mirror: false, phase: 0, brightness: 1 },
      },
    })
    const projection = projectFlatShowComposition(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
      stageDimension: 1,
    })
    const onUpdateOverlay = vi.fn()
    const onSeek = vi.fn()
    render(<ShowSceneZoneEditor
      show={show}
      compositionProjection={projection}
      scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
      readOnly={false}
      selectedClipId={null}
      transport={null}
      onBack={vi.fn()}
      onZoneChange={vi.fn()}
      onSelectClip={vi.fn()}
      onSeek={onSeek}
      {...editingProps}
      onUpdateOverlay={onUpdateOverlay}
    />)

    const clip = screen.getByRole('button', { name: 'Select CometLoom clip in Front texture' })
    const frontLayer = document.querySelector<HTMLElement>('[data-overlay-layer-id="overlay-front"]')!
    const backLayer = document.querySelector<HTMLElement>('[data-overlay-layer-id="overlay-back"]')!
    vi.spyOn(frontLayer, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({}),
    })
    vi.spyOn(backLayer, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 40, left: 0, top: 40, right: 100, bottom: 80, width: 100, height: 40, toJSON: () => ({}),
    })
    Object.defineProperties(clip, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: vi.fn() },
    })
    vi.spyOn(clip.parentElement!, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({}),
    })

    fireEvent.pointerDown(clip, { pointerId: 1, button: 0, clientX: 4, clientY: 28 })
    expect(screen.getByTestId('scene-overlay-drag-ghost')).toHaveTextContent('CometLoom')
    expect(screen.getByTestId('scene-overlay-drag-ghost')).toHaveStyle({ top: '0px' })
    expect(screen.queryByRole('spinbutton', { name: 'Overlay start seconds' })).not.toBeInTheDocument()
    fireEvent.pointerMove(clip, { pointerId: 1, buttons: 1, clientX: 8, clientY: 20 })
    fireEvent.pointerUp(clip, { pointerId: 1, button: 0, clientX: 8, clientY: 20 })
    expect(screen.queryByTestId('scene-overlay-drag-ghost')).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Overlay start seconds' })).toHaveValue(1)
    expect(screen.getByRole('spinbutton', { name: 'Overlay duration seconds' })).toHaveValue(5)
    expect(onUpdateOverlay).toHaveBeenLastCalledWith('overlay-front', 'overlay-placement', expect.objectContaining({
      targetLayerId: 'overlay-front',
    }))

    fireEvent.pointerDown(clip, { pointerId: 2, button: 0, clientX: 4, clientY: 28 })
    fireEvent.pointerMove(clip, { pointerId: 2, buttons: 1, clientX: 8, clientY: 50 })
    expect(screen.getByTestId('scene-overlay-drag-ghost')).toHaveTextContent('CometLoom')
    expect(screen.getByTestId('scene-overlay-lane-overlay-back')).toHaveAttribute('data-drop-target', 'true')
    fireEvent.pointerUp(clip, { pointerId: 2, button: 0, clientX: 8, clientY: 50 })
    expect(onUpdateOverlay).toHaveBeenLastCalledWith('overlay-front', 'overlay-placement', expect.objectContaining({
      targetLayerId: 'overlay-back',
    }))
    expect(screen.getByRole('button', { name: 'Select CometLoom clip in Front texture' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('scene-overlay-lane-overlay-back'), { clientX: 50 })
    expect(onSeek).not.toHaveBeenCalled()
  })

  it('owns narrow horizontal overflow and maps Shift+wheel to the Scene-local rail (#491)', () => {
    const { show, projection } = compositionFixture()
    render(<ShowSceneZoneEditor
      show={show}
      compositionProjection={projection}
      scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
      readOnly={false}
      selectedClipId={null}
      transport={null}
      onBack={vi.fn()}
      onZoneChange={vi.fn()}
      onSelectClip={vi.fn()}
      onSeek={vi.fn()}
      {...editingProps}
    />)

    const scroller = screen.getByTestId('scene-local-scroll')
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 620 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    fireEvent.wheel(scroller, { deltaY: 80 })
    expect(scroller.scrollLeft).toBe(0)
    fireEvent.wheel(scroller, { deltaY: 80, shiftKey: true })
    expect(scroller.scrollLeft).toBe(80)
  })

  it('offers Split for a selected overlay clip at the local playhead (#491)', () => {
    const { show } = compositionFixture()
    const composition = addShowOverlayLayer(show, show.composition!, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'overlay-front', name: 'Front texture', placements: [] },
    })
    show.composition = addShowOverlayClip(show, composition, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-front',
      instance: {
        id: 'overlay-instance', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
      placement: {
        id: 'overlay-placement', instanceId: 'overlay-instance', startMs: 1_000, durationMs: 5_000,
        opacity: 0.6, view: { mirror: false, phase: 0, brightness: 1 },
      },
    })
    const projection = projectFlatShowComposition(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
      stageDimension: 1,
    })
    useShowTransportStore.setState({ showId: show.id, positionMs: 3_000 })
    const onSplitOverlay = vi.fn()
    render(<ShowSceneZoneEditor
      show={show}
      compositionProjection={projection}
      scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
      readOnly={false}
      selectedClipId={null}
      transport={null}
      onBack={vi.fn()}
      onZoneChange={vi.fn()}
      onSelectClip={vi.fn()}
      onSeek={vi.fn()}
      {...editingProps}
      onSplitOverlay={onSplitOverlay}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Select CometLoom clip in Front texture' }))
    fireEvent.click(screen.getByRole('button', { name: 'Split overlay clip at playhead' }))
    expect(onSplitOverlay).toHaveBeenCalledWith('overlay-front', 'overlay-placement', 3_000)
  })

  it('offers keyboard-equivalent layer reordering from one compact handle (#491)', () => {
    const { show } = compositionFixture()
    let composition = addShowOverlayLayer(show, show.composition!, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'overlay-front', name: 'Front texture', placements: [] },
    })
    composition = addShowOverlayLayer(show, composition, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'overlay-back', name: 'Back texture', placements: [] },
    })
    show.composition = composition
    const projection = projectFlatShowComposition(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
      stageDimension: 1,
    })
    const onReorderOverlayLayer = vi.fn()
    render(<ShowSceneZoneEditor
      show={show}
      compositionProjection={projection}
      scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
      readOnly={false}
      selectedClipId={null}
      transport={null}
      onBack={vi.fn()}
      onZoneChange={vi.fn()}
      onSelectClip={vi.fn()}
      onSeek={vi.fn()}
      {...editingProps}
      onReorderOverlayLayer={onReorderOverlayLayer}
    />)

    const handle = screen.getByRole('button', { name: 'Reorder Front texture layer' })
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: vi.fn() },
    })
    fireEvent.pointerDown(handle, { pointerId: 3, button: 0, clientX: 20, clientY: 20 })
    expect(screen.getByTestId('scene-layer-drag-ghost')).toHaveTextContent('Front texture')
    fireEvent.pointerUp(handle, { pointerId: 3, button: 0, clientX: 20, clientY: 20 })
    expect(screen.queryByTestId('scene-layer-drag-ghost')).not.toBeInTheDocument()
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(onReorderOverlayLayer).toHaveBeenCalledWith('overlay-front', 1)
  })

  it('reveals only authored property lanes and supports exact keyframe editing (#490)', () => {
    const { show, placement } = compositionFixture()
    show.composition!.scenes[0].propertyTracks = [{
      id: 'brightness-track',
      target: { kind: 'placement-view', placementId: placement.id, property: 'brightness' },
      keyframes: [
        { id: 'brightness-a', timeMs: 0, value: 1, easing: { curve: 'linear' } },
        { id: 'brightness-b', timeMs: 10_000, value: 0.4, easing: { curve: 'linear' } },
      ],
    }]
    const authoredProjection = projectFlatShowComposition(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
      stageDimension: 1,
    })
    const onAddPropertyTrack = vi.fn()
    const onUpdatePropertyKeyframe = vi.fn()

    render(<ShowSceneZoneEditor
      show={show}
      compositionProjection={authoredProjection}
      scope={{ sceneId: 'scene-1', zoneId: 'zone-1' }}
      readOnly={false}
      selectedClipId={null}
      transport={null}
      onBack={vi.fn()}
      onZoneChange={vi.fn()}
      onSelectClip={vi.fn()}
      onSeek={vi.fn()}
      {...editingProps}
      onAddPropertyTrack={onAddPropertyTrack}
      onUpdatePropertyKeyframe={onUpdatePropertyKeyframe}
    />)

    expect(screen.queryByLabelText('Property animation')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Select TestPattern1D Main clip' })[0])
    expect(screen.getByLabelText('Property animation')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Property sparkline')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Keyframe at 0 ms, value 1' }))
    const value = screen.getByRole('spinbutton', { name: 'Keyframe value' })
    fireEvent.change(value, { target: { value: '0.25' } })
    fireEvent.blur(value)
    expect(onUpdatePropertyKeyframe).toHaveBeenCalledWith('brightness-track', 'brightness-a', { value: 0.25 })

    fireEvent.change(screen.getByRole('combobox', { name: 'Property to animate' }), {
      target: { value: `placement-view:${placement.id}:phase` },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Animate selected property' }))
    expect(onAddPropertyTrack).toHaveBeenCalledWith({
      target: { kind: 'placement-view', placementId: placement.id, property: 'phase' },
      initialValue: 0,
      atMs: 0,
    })
  })
})
