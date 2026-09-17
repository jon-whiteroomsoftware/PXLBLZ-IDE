import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ShowEditorV2ReadOnly } from './ShowEditorV2ReadOnly'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { transitionV1Show } from '@/test/showV2TracerFixture'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { resetControllerProvider } from '@/engine/controllerProviderRegistry'
import { resetPersonalContentProvider } from '@/engine/personalContentProvider'

function seededRecord(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

function seed(record: ShowRecordV2): void {
  useShowStore.setState({
    showV2Pilots: { [record.id]: record },
    showV2Histories: { [record.id]: { past: [], future: [] } },
    showsLoaded: true,
  })
}

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState({ ...patternInitialState, patternsLoaded: true })
  useLibraryStore.setState(libraryInitialState)
  useMapStore.setState(mapInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  usePreviewStore.setState(previewInitialState)
  useShowTransportStore.setState(showTransportInitialState)
  useControllerStore.setState(controllerInitialState)
  resetControllerProvider()
})

afterEach(() => {
  cleanup()
  resetControllerProvider()
})

describe('ShowEditorV2ReadOnly (#1056 slice 1)', () => {
  it('renders the Zone rows, Layers, Clips and Show End from the v2 record', () => {
    const record = seededRecord()
    seed(record)
    render(<ShowEditorV2ReadOnly showId={record.id} />)

    const surface = screen.getByTestId('show-timeline-read-only')
    expect(surface).toHaveAttribute('data-show-record-version', '2')
    const zone = within(surface).getByRole('group', { name: 'Zone Main' })
    expect(within(zone).getByRole('group', { name: 'Layer Main in Zone Main' })).toBeInTheDocument()
    expect(within(surface).getByRole('button', { name: /Clip Outgoing, 0\.00s to 0\.40s/ })).toBeInTheDocument()
    expect(within(surface).getByRole('button', { name: /Clip Incoming, 0\.60s to 1\.00s/ })).toBeInTheDocument()
    expect(screen.getByTestId('show-timeline-read-only-end')).toHaveAccessibleName('Show End at 1.00s')
  })

  it('draws the Layout lane, the Markers lane and the Transition window', () => {
    const record = seededRecord()
    seed(record)
    render(<ShowEditorV2ReadOnly showId={record.id} />)

    const layouts = screen.getByRole('group', { name: 'Zone Layouts lane' })
    expect(within(layouts).getByRole('button', { name: /Full Zone Layout, 0\.00s to 1\.00s/ })).toBeInTheDocument()
    const markers = screen.getByRole('group', { name: 'Show Markers' })
    expect(within(markers).getByRole('button', { name: /Chapter Marker Opening at 0\.00s/ })).toBeInTheDocument()
    const junction = document.querySelector('[data-show-layer-junction="layer"]')
    expect(junction).toHaveAttribute('data-show-transition-kind', 'crossfade')
  })

  it('offers no mutating control and keeps every item keyboard reachable', async () => {
    const user = userEvent.setup()
    const record = seededRecord()
    seed(record)
    render(<ShowEditorV2ReadOnly showId={record.id} />)

    const surface = screen.getByTestId('show-timeline-read-only')
    for (const control of within(surface).getAllByRole('button')) {
      expect(control).toHaveAttribute('aria-disabled', 'true')
      expect(control.tagName).toBe('SPAN')
    }
    expect(within(surface).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(surface).queryAllByRole('slider')).toHaveLength(0)
    expect(within(surface).queryAllByRole('menuitem')).toHaveLength(0)

    const focusable = within(surface).getAllByRole('button')
    await user.tab()
    expect(focusable).toContain(document.activeElement)
    await user.tab()
    expect(focusable).toContain(document.activeElement)
  })

  it('states the read-only condition in one status line', () => {
    const record = seededRecord()
    seed(record)
    render(<ShowEditorV2ReadOnly showId={record.id} />)
    expect(screen.getByTestId('show-timeline-read-only-status'))
      .toHaveTextContent('Read only - this Show is stored in the v2 format; timeline editing arrives with the next slice.')
  })

  it('leaves the seeded v2 record untouched while rendering', () => {
    const record = seededRecord()
    const before = JSON.stringify(record)
    seed(record)
    render(<ShowEditorV2ReadOnly showId={record.id} />)
    expect(JSON.stringify(useShowStore.getState().showV2Pilots[record.id])).toBe(before)
    expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
  })

  it('renders a Group Clip use with its occurrence identity', () => {
    const record = seededRecord()
    const layerId = record.composition.layers.find((layer) => layer.rank === 1)!.id
    const clip = record.composition.clips.find((candidate) => candidate.id === 'out')!
    record.composition.groupDefinitions = [{
      id: 'definition-1',
      name: 'Pulse',
      patternInstances: [record.composition.patternInstances[0]],
      layers: [{ id: 'definition-1:layer', name: 'Layer 0', rank: 0 }],
      clips: [{
        ...structuredClone(clip),
        id: 'child',
        layerId: 'definition-1:layer',
        startMs: 0,
        durationMs: 200,
        appearance: { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: 'child:appearance:1', timeMs: 0 }] },
      }],
      transitions: [],
      propertyTracks: [],
    }]
    record.composition.groupOccurrences = [{
      id: 'occurrence-1',
      definitionId: 'definition-1',
      layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
      zoneId: clip.zoneId,
      startMs: 0,
      translationX: 0,
      translationY: 0,
      layerBindings: [{ definitionLayerId: 'definition-1:layer', layerId }],
      holds: [],
      instanceBindings: { [record.composition.patternInstances[0].id]: record.composition.patternInstances[0].id },
    }]
    seed(record)
    render(<ShowEditorV2ReadOnly showId={record.id} />)

    const item = screen.getByRole('button', { name: /Group Clip Outgoing, 0\.00s to 0\.20s/ })
    expect(item).toHaveAttribute('data-show-group-occurrence', 'occurrence-1')
    expect(item).toHaveAttribute('data-show-selection-key', 'group:occurrence-1')
  })
})
