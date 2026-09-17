import { useMemo } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '@/engine/personalContentProvider'
import { projectShowTimelineV2 } from '@/engine/showTimelineViewModelV2'
import { showV2LayoutEditorFixture } from '@/test/showV2LayoutEditorFixture'
import { showV2TransitionEditorFixture } from '@/test/showV2TransitionEditorFixture'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useMapStore } from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import { showInitialState, useShowStore } from '@/store/showStore'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowPreparedStageDependenciesV2 } from '@/engine/showPreparedStageV2'
import { ShowEditorV2TransitionLayoutPanel } from './ShowEditorV2TransitionLayoutPanel'
import { useShowV2EditCapture } from './useShowV2EditCapture'

/**
 * The editor route's Transition authoring and Zone Layout lane, driven through
 * the real store, the route's own capture hook and the real closed admission
 * with only the provider write faked (#1056 slice 4). Undo and Redo are slice
 * 2's timeline controls and are covered there.
 */
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

let harnessIndex = 0

function harness(source: { record: ShowRecordV2; dependencies: ShowPreparedStageDependenciesV2 }) {
  const { record, dependencies } = source
  record.id = `v2-authoring-${++harnessIndex}`
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'v2-authoring-provider', replaceShowV2: write })
  usePatternStore.setState({ userPatterns: [...dependencies.patterns] })
  useMapStore.setState({ userMaps: [...dependencies.maps] })
  useLibraryStore.setState({ userLibraries: [...dependencies.libraries] })
  useControllerProfileStore.setState({ profiles: [...dependencies.profiles] })
  useShowStore.setState({
    showV2Pilots: { [record.id]: record },
    showV2Histories: { [record.id]: { past: [], future: [] } },
  })

  function Harness() {
    const current = useShowStore((state) => state.showV2Pilots[record.id])
    const binding = useShowV2EditCapture(record.id)
    const view = useMemo(() => projectShowTimelineV2(current), [current])
    return <ShowEditorV2TransitionLayoutPanel showId={record.id} view={view} binding={binding} />
  }

  render(<Harness />)
  return { record, write, live: () => useShowStore.getState().showV2Pilots[record.id] }
}

const status = () => screen.getByTestId('show-editor-v2-authoring-status').textContent
const clip = (record: ShowRecordV2, id: string) => record.composition.clips.find((value) => value.id === id)!

function selectBoundary(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

async function choosePaletteKind(label: string, durationSeconds?: number) {
  const palette = await screen.findByRole('dialog', { name: 'Choose Layer Transition' })
  if (durationSeconds !== undefined) {
    const duration = within(palette).getByLabelText('Transition duration in seconds exact time')
    fireEvent.change(duration, { target: { value: String(durationSeconds) } })
    fireEvent.keyDown(duration, { key: 'Enter' })
  }
  fireEvent.click(within(palette).getByRole('button', { name: `Use ${label} Transition` }))
}

describe('the v2 editor route Transition authoring', () => {
  it('inserts at a derived Cut junction, rippling the incoming Clip once', async () => {
    const { record, write, live } = harness(showV2TransitionEditorFixture())
    expect(clip(record, 'verse-b').startMs).toBe(3_000)

    selectBoundary(/^Cut on Layer/)
    fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))
    await choosePaletteKind('Crossfade', 1.5)

    await waitFor(() => expect(status()).toBe('Transition inserted.'))
    expect(write).toHaveBeenCalledTimes(1)
    const saved = live()
    expect(saved.composition.transitions).toHaveLength(1)
    expect(saved.composition.transitions[0]).toMatchObject({ kind: 'crossfade', durationMs: 1_500 })
    expect(clip(saved, 'verse-b').startMs).toBe(4_500)
    // Only the incoming connected content moves; the outgoing and unrelated Clips stay.
    expect(clip(saved, 'verse-a')).toEqual(clip(record, 'verse-a'))
    expect(clip(saved, record.composition.clips[0].id).startMs).toBe(0)
  })

  it('surfaces the bounded RL08 compiler refusal in its own words and writes nothing', async () => {
    const { write, live } = harness(showV2TransitionEditorFixture())

    selectBoundary(/^Cut on Layer/)
    fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))
    await choosePaletteKind('Through color')

    await waitFor(() => expect(status()).toMatch(/^RL08: /))
    expect(write).not.toHaveBeenCalled()
    expect(live().composition.transitions).toEqual([])
  })

  it('resizes once, changes a parameter by identity and resets to a Cut', async () => {
    const { record, write, live } = harness(showV2TransitionEditorFixture())
    selectBoundary(/^Cut on Layer/)
    fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))
    await choosePaletteKind('Linear', 1)
    await waitFor(() => expect(status()).toBe('Transition inserted.'))
    const transitionId = live().composition.transitions[0].id

    // The duration delta reaches the downstream affected set exactly once.
    const duration = screen.getByLabelText('Transition duration exact time')
    fireEvent.change(duration, { target: { value: '2' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await waitFor(() => expect(status()).toBe('Transition duration saved.'))
    expect(write).toHaveBeenCalledTimes(2)
    expect(clip(live(), 'verse-b').startMs).toBe(5_000)
    expect(live().composition.transitions[0]).toMatchObject({ id: transitionId, durationMs: 2_000 })

    // A parameter edit keeps identity, endpoints, window and every Clip time.
    const feather = screen.getByLabelText('Feather exact percentage')
    fireEvent.change(feather, { target: { value: '40%' } })
    fireEvent.keyDown(feather, { key: 'Enter' })
    await waitFor(() => expect(status()).toBe('Transition parameter saved.'))
    expect(write).toHaveBeenCalledTimes(3)
    expect(live().composition.transitions[0]).toMatchObject({ id: transitionId, kind: 'wipe', feather: 0.4, durationMs: 2_000 })
    expect(clip(live(), 'verse-b').startMs).toBe(5_000)

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Cut' }))
    await waitFor(() => expect(status()).toBe('Reset to Cut.'))
    expect(write).toHaveBeenCalledTimes(4)
    expect(live().composition.transitions).toEqual([])
    expect(live().composition.clips).toEqual(record.composition.clips)
  })

  it('records the admitted insert on the history slice 2 Undo and Redo run', async () => {
    const { record, write, live } = harness(showV2TransitionEditorFixture())
    expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })

    selectBoundary(/^Cut on Layer/)
    fireEvent.click(screen.getByRole('button', { name: 'Insert Transition' }))
    await choosePaletteKind('Crossfade', 1)
    await waitFor(() => expect(status()).toBe('Transition inserted.'))
    expect(write).toHaveBeenCalledTimes(1)

    // This panel renders no history control: the timeline above owns Undo and
    // Redo, and one admitted edit leaves it exactly one entry to undo.
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull()
    const history = useShowStore.getState().showV2Histories[record.id]
    expect(history.past).toHaveLength(1)
    expect(history.future).toEqual([])
    expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true)
    await waitFor(() => expect(live().composition.transitions).toEqual([]))
  })
})

describe('the v2 editor route Zone Layout lane', () => {
  it('makes a shared Layout unique, moves the switch and assigns another definition', async () => {
    const { record, write, live } = harness(showV2LayoutEditorFixture())
    fireEvent.click(screen.getByRole('button', { name: /^Full Zone Layout occurrence, 5\.00s/ }))

    // Both occurrences share one definition, so Make Unique clones exactly this one.
    fireEvent.change(screen.getByLabelText('Unique Layout name'), { target: { value: 'Second voice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make Layout Unique' }))
    await waitFor(() => expect(status()).toBe('Layout is unique.'))
    expect(write).toHaveBeenCalledTimes(1)
    const unique = live().composition.layoutOccurrences[1].layoutId
    expect(unique).not.toBe(record.composition.layoutOccurrences[0].layoutId)
    expect(live().zoneLayouts.find((layout) => layout.id === unique))
      .toEqual({ ...record.zoneLayouts[0], id: unique, name: 'Second voice' })

    const shift = screen.getByLabelText('Layout switch exact time')
    fireEvent.change(shift, { target: { value: '6' } })
    fireEvent.keyDown(shift, { key: 'Enter' })
    await waitFor(() => expect(status()).toBe('Layout switch saved.'))
    expect(write).toHaveBeenCalledTimes(2)
    expect(live().composition.layoutOccurrences.map((value) => [value.startMs, value.durationMs]))
      .toEqual([[0, 6_000], [6_000, 25_000]])

    fireEvent.change(screen.getByLabelText('Layout definition'), { target: { value: 'alternate-layout' } })
    await waitFor(() => expect(status()).toBe('Layout saved.'))
    expect(write).toHaveBeenCalledTimes(3)
    expect(live().composition.layoutOccurrences[1].layoutId).toBe('alternate-layout')
    // Nothing else moved.
    expect(live().composition.clips).toEqual(record.composition.clips)
    expect(live().composition.markers).toEqual(record.composition.markers)
  })

  it('sets and clears the incoming transfer', async () => {
    const { write, live } = harness(showV2LayoutEditorFixture())
    fireEvent.click(screen.getByRole('button', { name: /^Full Zone Layout occurrence, 5\.00s/ }))

    const transfer = screen.getByLabelText('Layout transfer exact time')
    fireEvent.change(transfer, { target: { value: '0.4' } })
    fireEvent.keyDown(transfer, { key: 'Enter' })
    await waitFor(() => expect(status()).toBe('Transfer saved.'))
    expect(write).toHaveBeenCalledTimes(1)
    expect(live().composition.layoutOccurrences[1].incomingTransfer).toMatchObject({
      durationMs: 400, direction: 'forward', fromOccurrenceId: live().composition.layoutOccurrences[0].id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear transfer' }))
    await waitFor(() => expect(status()).toBe('Transfer cleared.'))
    expect(write).toHaveBeenCalledTimes(2)
    expect(live().composition.layoutOccurrences[1].incomingTransfer).toBeUndefined()
  })

  it('duplicates an occurrence and removes one so its predecessor extends', async () => {
    const { write, live } = harness(showV2LayoutEditorFixture())
    fireEvent.click(screen.getByRole('button', { name: /^Full Zone Layout occurrence, 5\.00s/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    await waitFor(() => expect(status()).toBe('Layout occurrence duplicated.'))
    expect(write).toHaveBeenCalledTimes(1)
    expect(live().composition.layoutOccurrences).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(status()).toContain('predecessor extends'))
    expect(write).toHaveBeenCalledTimes(2)
    expect(live().composition.layoutOccurrences).toHaveLength(2)
    // The removed occurrence leaves the selection rather than lingering.
    expect(screen.queryByLabelText('Layout definition')).toBeNull()
  })

  it('surfaces the owner refusal when a moved switch would crop an owned track', async () => {
    const fixture = showV2LayoutEditorFixture()
    const later = fixture.record.composition.layoutOccurrences[1]
    fixture.record.composition.propertyTracks.push({
      id: 'split-owned',
      target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: later.id },
      activeStartMs: 5_500,
      activeDurationMs: 1_000,
      keyframes: [
        { id: 'split-start', timeMs: 5_500, value: 0.5, easing: { curve: 'linear' } },
        { id: 'split-end', timeMs: 6_500, value: 0.5, easing: { curve: 'linear' } },
      ],
    })
    const { record, write, live } = harness(fixture)
    fireEvent.click(screen.getByRole('button', { name: /^Full Zone Layout occurrence, 5\.00s/ }))

    const shift = screen.getByLabelText('Layout switch exact time')
    fireEvent.change(shift, { target: { value: '6' } })
    fireEvent.keyDown(shift, { key: 'Enter' })

    await waitFor(() => expect(status()).toContain('split-owned'))
    expect(write).not.toHaveBeenCalled()
    expect(live()).toBe(record)
  })
})
