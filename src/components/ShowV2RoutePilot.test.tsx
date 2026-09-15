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

vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: () => <div aria-label="show stage" /> }))

beforeEach(() => {
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useLibraryStore.setState(libraryInitialState)
})

it('mounts the converted v2 record and sends a Transition edit through store adoption', async () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const update = vi.fn(async (_id: string, record: ShowRecordV2) => {
    useShowStore.setState(state => ({ showV2Pilots: { ...state.showV2Pilots, [record.id]: record } }))
  })
  useShowStore.setState({
    showV2Pilots: { [converted.record.id]: converted.record },
    showV2Histories: { [converted.record.id]: { past: [], future: [] } },
    openShowV2Pilot: async () => ({ status: 'ready', record: converted.record }),
    updateShowV2Pilot: update,
  })

  render(<ShowV2RoutePilot showId={converted.record.id} />)
  expect(screen.getByRole('heading', { name: 'V2 route qualification' })).toBeInTheDocument()
  expect(screen.getByLabelText('show stage')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Transition duration'), { target: { value: '100' } })
  fireEvent.keyDown(screen.getByLabelText('Transition duration'), { key: 'Enter' })

  await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  expect(update.mock.calls[0][1].composition.transitions[0].durationMs).toBe(100)
  expect(await screen.findByText('Saved v2 Transition at 100 ms.')).toBeInTheDocument()
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
