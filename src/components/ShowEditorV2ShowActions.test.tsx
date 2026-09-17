import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ShowEditorV2Route } from './ShowEditorV2Route'
import { ShowEditorV2ShowActions } from './ShowEditorV2ShowActions'
import * as download from '@/engine/browserDownload'
import * as preview from '@/engine/previewThumbnailJpeg'
import { parseEpe } from '@/engine/epeImport'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { resetPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'

vi.mock('./ShowStagePreview', () => ({ ShowStagePreview: vi.fn(() => <div aria-label="prepared stage" />) }))
vi.mock('./PixelblazeCodeEditor', () => ({
  PixelblazeCodeEditor: ({ value }: { value: string }) => <pre data-testid="generated-source">{value}</pre>,
}))

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useLibraryStore.setState(libraryInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function open() {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Fixture refused')
  const record = converted.record
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, updateShowV2Pilot: vi.fn(async () => {}) })
  return record
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Show actions' }))
}

it('shows the generated pattern from the header and returns to the Show', () => {
  const record = open()
  render(<ShowEditorV2Route showId={record.id} />)
  openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'View code' }))

  const generated = screen.getByTestId('show-editor-v2-generated')
  expect(generated).toHaveTextContent(`Generated pattern - ${record.name}`)
  expect(screen.getByTestId('generated-source').textContent).toContain('Compiled PXLBLZ Show')
  expect(screen.queryByTestId('show-editor-v2-side-panel')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Back to show' }))
  expect(screen.queryByTestId('show-editor-v2-generated')).not.toBeInTheDocument()
  expect(screen.getByTestId('show-editor-v2-side-panel')).toBeInTheDocument()
})

it('downloads the .epe from the header under the filename the v1 exporter produces', async () => {
  const record = open()
  vi.spyOn(preview, 'buildPreviewJpeg').mockResolvedValue(new Uint8Array([1, 2, 3]))
  const write = vi.spyOn(download, 'downloadBrowserFile').mockImplementation(() => {})
  render(<ShowEditorV2Route showId={record.id} />)
  openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Download .epe' }))

  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  const [filename, text, type] = write.mock.calls[0]
  expect(filename).toBe('convertible.epe')
  expect(type).toBe('application/json')
  expect(parseEpe(String(text)).src).toContain('Compiled PXLBLZ Show')
})

it('writes the same bytes from the header and from the delivery panel', async () => {
  const record = open()
  vi.spyOn(preview, 'buildPreviewJpeg').mockResolvedValue(new Uint8Array([1, 2, 3]))
  const write = vi.spyOn(download, 'downloadBrowserFile').mockImplementation(() => {})
  render(<ShowEditorV2Route showId={record.id} />)

  openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Download .epe' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Export .epe' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2))

  const [first, second] = write.mock.calls
  expect(second[0]).toBe(first[0])
  // Only the freshly minted program id differs between two downloads.
  const source = (text: unknown) => parseEpe(String(text)).src
  expect(source(second[1])).toBe(source(first[1]))
})

it('offers neither action while there is nothing to deliver', () => {
  render(<ShowEditorV2ShowActions
    delivery={{ bundle: null, artifacts: null, blockedReason: 'Add content to the Show before sending it.' }}
    onViewCode={() => { throw new Error('View code must not run without an artifact') }}
  />)
  openMenu()
  expect(screen.getByRole('menuitem', { name: 'View code' })).toBeDisabled()
  expect(screen.getByRole('menuitem', { name: 'Download .epe' })).toBeDisabled()
})
