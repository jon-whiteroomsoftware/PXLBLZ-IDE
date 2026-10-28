import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ControllerPatternImportNotice } from './ControllerPatternImportNotice'
import { demoControllerMetadataStorage, resetControllerMetadataStorage, setControllerMetadataStorage } from '@/engine/controllerMetadataStorage'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import { readControllerPatternImportLedger, assessControllerPatternImport, createControllerPatternImportPlan } from '@/engine/controllerPatternImport'
import { encodePbp } from '@/engine/pbpEncode'
import { makeProgramId } from '@/engine/bytecodePush'
import { stampArtifact } from '@/engine/artifactStamp'
import { useEditorStore } from '@/store/editorStore'

const notice = 'Imported wrapped source. Its old Controller profile behavior remains; this Controller profile is not applied.'
async function wrappedLedger(patternId: string) {
  const programId = makeProgramId(() => 0)
  const pbp = encodePbp({ id: programId, name: 'Wrapped', byteCode: new Uint8Array(8),
    sourceCode: stampArtifact('export function render(i) { rgb(1,0,0) }', { kind: 'pattern', id: 'origin', transforms: ['stored-artifact'] }) })
  const assessment = await assessControllerPatternImport({ programId, pbp })
  if (!assessment.ok) throw new Error(assessment.message)
  const { receipt } = await createControllerPatternImportPlan({ assessment, patternId,
    controllerDeviceId: 'physical', programId, now: 1, existingNames: [] })
  return { version: 1 as const, byPatternId: { [patternId]: receipt } }
}

afterEach(() => {
  cleanup()
  resetControllerMetadataStorage()
  useWorkspaceStore.setState(workspaceInitialState)
})

it('reports policy read failure instead of inventing ordinary policy', async () => {
  useWorkspaceStore.setState({ personalWorkspaceAuthenticated: true })
  setControllerMetadataStorage({ ...demoControllerMetadataStorage, id: 'account',
    getPatternImports: vi.fn(async () => { throw new Error('offline') }) })
  render(<ControllerPatternImportNotice patternId="personal" />)
  expect(await screen.findByText('Controller import policy could not be read.')).toBeInTheDocument()
})

it('retires a late previous Pattern response', async () => {
  useWorkspaceStore.setState({ personalWorkspaceAuthenticated: true })
  let resolve!: (value: unknown) => void
  const first = new Promise<unknown>((done) => { resolve = done })
  const getPatternImports = vi.fn().mockReturnValueOnce(first).mockResolvedValue(readControllerPatternImportLedger(undefined))
  setControllerMetadataStorage({ ...demoControllerMetadataStorage, id: 'account', getPatternImports })
  const { rerender } = render(<ControllerPatternImportNotice patternId="A" />)
  rerender(<ControllerPatternImportNotice patternId="B" />)
  const ledger = await wrappedLedger('A')
  await act(async () => { resolve(ledger) })
  expect(screen.queryByText(notice)).not.toBeInTheDocument()
  expect(screen.queryByText('Controller import policy could not be read.')).not.toBeInTheDocument()
})

it('reopens durable wrapped policy after editing and remounting', async () => {
  useWorkspaceStore.setState({ personalWorkspaceAuthenticated: true })
  const ledger = await wrappedLedger('personal')
  const read = vi.fn(async () => structuredClone(ledger))
  setControllerMetadataStorage({ ...demoControllerMetadataStorage, id: 'account', getPatternImports: read })
  const first = render(<ControllerPatternImportNotice patternId="personal" />)
  expect(await screen.findByText(notice)).toBeInTheDocument()
  act(() => { useEditorStore.setState({ source: 'export function render(i) { rgb(0,1,0) }' }) })
  first.unmount()
  // Source edits do not rewrite the durable import ledger.
  render(<ControllerPatternImportNotice patternId="personal" />)
  expect(await screen.findByText(notice)).toBeInTheDocument()
  expect(read).toHaveBeenCalledTimes(2)
})

it.each(['ordinary', 'authored'] as const)('hides the notice for %s policy', async (mode) => {
  useWorkspaceStore.setState({ personalWorkspaceAuthenticated: true })
  const ledger = mode === 'ordinary' ? readControllerPatternImportLedger(undefined) : await wrappedLedger('personal')
  if (mode === 'authored') {
    ledger.byPatternId.personal.sourceMode = 'authored-verified'
    ledger.byPatternId.personal.origin.banner!.transforms = []
  }
  const read = vi.fn(async () => ledger)
  setControllerMetadataStorage({ ...demoControllerMetadataStorage, id: 'account', getPatternImports: read })
  await act(async () => { render(<ControllerPatternImportNotice patternId="personal" />) })
  expect(read).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('does not read for no personal Pattern or a signed-out workspace', () => {
  const read = vi.fn(async () => readControllerPatternImportLedger(undefined))
  setControllerMetadataStorage({ ...demoControllerMetadataStorage, id: 'account', getPatternImports: read })
  const { rerender } = render(<ControllerPatternImportNotice patternId={null} />)
  rerender(<ControllerPatternImportNotice patternId="personal" />)
  expect(read).not.toHaveBeenCalled()
})
