import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { ShowV2RoutePilot } from './ShowV2RoutePilot'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { transitionV1Show } from '@/test/showV2TracerFixture'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'

vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: () => <div aria-label="show stage" /> }))

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useLibraryStore.setState(libraryInitialState)
})

it('mounts the converted v2 record and sends a Transition edit through store adoption', async () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  for (const instance of converted.record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'route-voice' }
  usePatternStore.setState({ userPatterns: [{ id: 'route-voice', name: 'Route voice', src: 'export function render2D(i,x,y){rgb(x,y,0)}', controls: {}, updatedAt: 1 }] })
  const update = vi.fn(async (_id: string, _record: ShowRecordV2) => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'route-transition', replaceShowV2: update })
  useShowStore.setState({
    showV2Pilots: { [converted.record.id]: converted.record },
    showV2Histories: { [converted.record.id]: { past: [], future: [] } },
  })

  render(<ShowV2RoutePilot showId={converted.record.id} />)
  expect(screen.getByRole('heading', { name: 'V2 route qualification' })).toBeInTheDocument()
  expect(screen.getByLabelText('show stage')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Transition duration'), { target: { value: '100' } })
  fireEvent.keyDown(screen.getByLabelText('Transition duration'), { key: 'Enter' })

  await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  expect(update.mock.calls[0][1].composition.transitions[0].durationMs).toBe(100)
  expect(await screen.findByText('Saved v2 Transition at 100 ms.')).toBeInTheDocument()
  expect(useShowStore.getState().showV2Histories[converted.record.id].past).toHaveLength(1)
})

it('reports a cold provider record as opened after the store publishes it', async () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  useShowStore.setState({
    openShowV2Pilot: async () => {
      useShowStore.setState({
        showV2Pilots: { [converted.record.id]: converted.record },
        showV2Histories: { [converted.record.id]: { past: [], future: [] } },
      })
      return { status: 'ready', record: converted.record }
    },
  })

  render(<ShowV2RoutePilot showId={converted.record.id} />)

  expect(await screen.findByText('V2 record opened in memory.')).toBeInTheDocument()
})
