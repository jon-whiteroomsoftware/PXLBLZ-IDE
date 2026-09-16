import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { ShowV2RoutePilot } from './ShowV2RoutePilot'
import { ShowStagePreview } from './ShowStagePreview'
import * as qualification from '@/engine/showV2Pilot'
import * as stagePreparation from '@/engine/showPreparedStageV2'
import * as showCompiler from '@/engine/showCompiler'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'

vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: vi.fn(() => <div aria-label="prepared stage" />) }))

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useLibraryStore.setState(libraryInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
})
function open() {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Fixture refused')
  const record = converted.record
  const update = vi.fn(async () => {})
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, updateShowV2Pilot: update })
  return { record, update }
}

it('qualifies the same ready bundle displayed by Stage without history/save or a second capture', async () => {
  const { record, update } = open()
  const prepare = vi.spyOn(stagePreparation, 'captureShowStageEditV2')
  const compile = vi.spyOn(showCompiler, 'compileShow')
  const qualify = vi.spyOn(qualification, 'qualifyShowV2PilotArtifacts').mockResolvedValue({ importedShow: record, pxlshowBytes: new Uint8Array(3), epeText: '', epeSource: '' })
  try {
    render(<ShowV2RoutePilot showId={record.id} />)
    expect(prepare).toHaveBeenCalledOnce()
    const capture = prepare.mock.results[0].value
    expect(capture.inputCapture.status).toBe('qualified')
    const captured = capture.prepared
    if (captured.status !== 'ready') throw new Error('Stage fixture refused')
    const stageCalls = vi.mocked(ShowStagePreview).mock.calls
    const displayed = stageCalls[stageCalls.length - 1]?.[0]
    expect(displayed?.kind).toBe('prepared-v2')
    if (displayed?.kind !== 'prepared-v2') throw new Error('Stage bundle missing')
    expect(displayed.bundle).toBe(captured.bundle)
    expect(compile).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen artifacts' }))
    expect(await screen.findByText('Reopened .pxlshow v2 and .epe (3 bytes).')).toBeInTheDocument()
    expect(qualify).toHaveBeenCalledWith(captured.bundle, { appVersion: 'v2-route-pilot' })
    expect(qualify.mock.calls[0][0]).toBe(captured.bundle)
    expect(compile).toHaveBeenCalledOnce()
    expect(prepare).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Histories[record.id]).toBeUndefined()
  } finally { prepare.mockRestore(); compile.mockRestore(); qualify.mockRestore() }
})

it('does not publish an obsolete qualification after record replacement and a newer completion', async () => {
  const { record, update } = open()
  let releaseOld!: (value: Awaited<ReturnType<typeof qualification.qualifyShowV2PilotArtifacts>>) => void
  let releaseNew!: (value: Awaited<ReturnType<typeof qualification.qualifyShowV2PilotArtifacts>>) => void
  const old = new Promise<Awaited<ReturnType<typeof qualification.qualifyShowV2PilotArtifacts>>>(resolve => { releaseOld = resolve })
  const current = new Promise<Awaited<ReturnType<typeof qualification.qualifyShowV2PilotArtifacts>>>(resolve => { releaseNew = resolve })
  const qualify = vi.spyOn(qualification, 'qualifyShowV2PilotArtifacts').mockImplementationOnce(() => old).mockImplementationOnce(() => current)
  try {
    render(<ShowV2RoutePilot showId={record.id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen artifacts' }))
    const next = { ...record, name: 'New Capture', updatedAt: 2 }
    act(() => { useShowStore.setState({ showV2Pilots: { [record.id]: next } }) })
    await waitFor(() => expect(screen.getByText('New Capture')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Reopen artifacts' }))
    await act(async () => { releaseNew({ importedShow: next, pxlshowBytes: new Uint8Array(7), epeText: '', epeSource: '' }); await current })
    expect(screen.getByText('Reopened .pxlshow v2 and .epe (7 bytes).')).toBeInTheDocument()
    await act(async () => { releaseOld({ importedShow: record, pxlshowBytes: new Uint8Array(3), epeText: '', epeSource: '' }); await old })
    expect(screen.getByText('Reopened .pxlshow v2 and .epe (7 bytes).')).toBeInTheDocument()
    expect(screen.queryByText('Reopened .pxlshow v2 and .epe (3 bytes).')).not.toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  } finally { qualify.mockRestore() }
})

it.each(['Pattern', 'Library', 'Map/dimension', 'profile', 'provider', 'navigation', 'unmount', 'new operation'] as const)(
  'retires pending native qualification after %s replacement', async partition => {
    const { record, update } = open()
    record.stageMapId = 'captured-map'
    useMapStore.setState({ userMaps: [{ id: 'captured-map', name: 'Captured', dim: 2, generator: 'custom', params: {}, points: [[0, 0], [1, 1]], updatedAt: 1 }] })
    let release!: (value: Awaited<ReturnType<typeof qualification.qualifyShowV2PilotArtifacts>>) => void
    const pending = new Promise<Awaited<ReturnType<typeof qualification.qualifyShowV2PilotArtifacts>>>(resolve => { release = resolve })
    const qualify = vi.spyOn(qualification, 'qualifyShowV2PilotArtifacts').mockImplementationOnce(() => pending).mockResolvedValue({ importedShow: record, pxlshowBytes: new Uint8Array(7), epeText: '', epeSource: '' })
    try {
      const view = render(<ShowV2RoutePilot showId={record.id} />)
      fireEvent.click(screen.getByRole('button', { name: 'Reopen artifacts' }))
      await waitFor(() => expect(qualify).toHaveBeenCalledOnce())
      act(() => {
        switch (partition) {
          case 'Pattern': usePatternStore.setState({ userPatterns: [] }); break
          case 'Library': useLibraryStore.setState({ userLibraries: [] }); break
          case 'Map/dimension': useMapStore.setState({ userMaps: [{ id: 'captured-map', name: 'Depth', dim: 3, generator: 'custom', params: {}, points: [[0, 0, 0], [1, 1, 1]], updatedAt: 2 }] }); break
          case 'profile': useControllerProfileStore.setState({ profiles: [] }); break
          case 'provider': setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'qualification-other' }); break
          case 'navigation': {
            const next = { ...record, id: 'other-show', name: 'Other Show' }
            useShowStore.setState({ showV2Pilots: { [record.id]: record, [next.id]: next } })
            view.rerender(<ShowV2RoutePilot showId={next.id} />)
            break
          }
          case 'unmount': view.unmount(); break
          case 'new operation': fireEvent.click(screen.getByRole('button', { name: 'Reopen artifacts' })); break
        }
      })
      if (partition === 'new operation') expect(await screen.findByText('Reopened .pxlshow v2 and .epe (7 bytes).')).toBeInTheDocument()
      await act(async () => { release({ importedShow: record, pxlshowBytes: new Uint8Array(3), epeText: '', epeSource: '' }); await pending })
      expect(screen.queryByText('Reopened .pxlshow v2 and .epe (3 bytes).')).not.toBeInTheDocument()
      if (partition === 'new operation') expect(screen.getByText('Reopened .pxlshow v2 and .epe (7 bytes).')).toBeInTheDocument()
      expect(update).not.toHaveBeenCalled()
    } finally { qualify.mockRestore() }
  },
)

it('does not publish an obsolete qualification error after record replacement', async () => {
  const { record, update } = open()
  let reject!: (reason: Error) => void
  const pending = new Promise<Awaited<ReturnType<typeof qualification.qualifyShowV2PilotArtifacts>>>((_resolve, fail) => { reject = fail })
  const qualify = vi.spyOn(qualification, 'qualifyShowV2PilotArtifacts').mockImplementation(() => pending)
  try {
    render(<ShowV2RoutePilot showId={record.id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen artifacts' }))
    act(() => { useShowStore.setState({ showV2Pilots: { [record.id]: { ...record, name: 'Current' } } }) })
    await act(async () => { reject(new Error('Obsolete failure')); await pending.catch(() => {}) })
    expect(screen.queryByText('Obsolete failure')).not.toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  } finally { qualify.mockRestore() }
})
