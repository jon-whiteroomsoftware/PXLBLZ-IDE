import { artifactHash, parsePxlblzBanner, stampArtifact } from './artifactStamp'
import { makeProgramId } from './bytecodePush'
import { bundleWithPasses } from './passEngine'
import { encodePbp } from './pbpEncode'
import {
  assessControllerPatternImport, controllerPatternImportPolicy, controllerPatternImportRetry,
  createControllerPatternImportPlan, findControllerPatternImport, readControllerPatternImportLedger,
  sha256ControllerProgram, withControllerPatternImport,
  type ControllerPatternImportReceipt,
} from './controllerPatternImport'

const programId = makeProgramId(() => 0)
const source = '// Author: Ada\nexport function render(i) { hsv(i, 1, 1) }'
const stamped = (body = source, extra = {}) => stampArtifact(body, {
  kind: 'pattern', id: 'demo:origin', name: 'Original', stampedAt: '2026-01-01', ...extra,
})
function blob(sourceCode = stamped(), byteCode = new Uint8Array(8)) {
  return encodePbp({ id: programId, name: 'Device name', sourceCode, byteCode,
    previewImage: Uint8Array.of(255, 216, 255, 217) })
}
async function plan(patternId = 'personal-new', controllerDeviceId = 'A') {
  const assessment = await assessControllerPatternImport({ programId, pbp: blob() })
  if (!assessment.ok) throw new Error(assessment.message)
  return createControllerPatternImportPlan({ assessment, patternId, controllerDeviceId,
    programId, now: 123, existingNames: ['Original'] })
}
const metadataError = 'Controller import metadata is unreadable. No Pattern was sent.'

describe('Controller Pattern import assessment', () => {
  it('hashes exact bytes with SHA-256, including a subarray', async () => {
    expect(await sha256ControllerProgram(Uint8Array.of(0, 97, 98, 99, 0).subarray(1, 4)))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it.each([
    ['valid', stamped(), 'valid'],
    ['missing', source, 'missing'],
    ['malformed', '// Built with PXLBLZ-IDE broken\n// pxlblz:1 kind=pattern\n' + source, 'malformed'],
    ['leading metadata', '// pxlblz:1 kind=pattern\n' + source, 'malformed'],
    ['drift', stamped() + '\n// drift', 'hash-mismatch'],
    ['optional damage', stamped().replace('\n' + source, '\n// pxlblz:map broken\n// pxlblz:show-output broken\n' + source), 'valid'],
  ])('retains exact stored source for %s provenance', async (_name, storedSource, bannerState) => {
    const pbp = blob(storedSource)
    const before = pbp.slice()
    expect(await assessControllerPatternImport({ programId, pbp })).toEqual({
      ok: true, sourceMode: 'stored-artifact', source: storedSource, deviceName: 'Device name',
      bytecode: new Uint8Array(8), origin: { pbpDigest: await sha256ControllerProgram(pbp), bannerState,
        banner: bannerState === 'valid' ? parsePxlblzBanner(storedSource) : null },
    })
    expect(pbp).toEqual(before)
  })

  it.each([
    ['not-pxlblz', 'This saved program is not an unimported PXLBLZ Pattern.', 'foreign', blob()],
    ['unreadable', 'Saved program could not be read. No Pattern was imported.', programId, Uint8Array.of(1)],
    ['show', 'This saved artifact is a Show, not a Pattern.', programId, blob(stamped(source, { kind: 'show' }))],
    ['show', 'This saved artifact is a Show, not a Pattern.', programId, blob(stamped(source, { kind: 'show' }) + '\n// drift')],
    ['no-source', 'This saved program has no source code to import.', programId, blob('')],
    ['invalid-source', 'Saved Pattern source cannot compile. Nothing was sent.', programId, blob('export function {')],
    ['invalid-bytecode', 'Saved Pattern bytecode is invalid. Nothing was sent.', programId, blob(source, Uint8Array.of(1))],
  ])('refuses %s with its exact public message', async (code, message, id, pbp) => {
    const original = pbp.slice()
    expect(await assessControllerPatternImport({ programId: id, pbp })).toEqual({ ok: false, code, message })
    expect(pbp).toEqual(original)
  })

  it('rejects unsupported PBP versions and treats corrupt compressed source as absent', async () => {
    const unsupported = blob()
    new DataView(unsupported.buffer).setUint32(0, 99, true)
    expect(await assessControllerPatternImport({ programId, pbp: unsupported })).toMatchObject({ ok: false, code: 'unreadable' })
    const corrupt = blob()
    const offset = new DataView(corrupt.buffer).getUint32(28, true)
    corrupt.fill(0, offset)
    expect(await assessControllerPatternImport({ programId, pbp: corrupt })).toMatchObject({ ok: false, code: 'no-source' })
  })

  it('independently proves canonical equivalence before recovering authored source', async () => {
    const compiled = bundleWithPasses(source, {}, []).code
    const pbp = blob(stamped(compiled))
    const knownSource = { originId: 'demo:origin', source }
    expect(await assessControllerPatternImport({ programId, pbp, knownSource }))
      .toMatchObject({ ok: true, sourceMode: 'authored-verified', source })
    for (const candidate of [undefined, { ...knownSource, source: source + '\nvar different = 1' },
      { ...knownSource, originId: 'other' }, { ...knownSource, source: 'export function {' },
      { ...knownSource, sourceMode: 'stored-artifact' as const }]) {
      expect(await assessControllerPatternImport({ programId, pbp, knownSource: candidate }))
        .toMatchObject({ ok: true, sourceMode: 'stored-artifact', source: stamped(compiled) })
    }
    expect(await assessControllerPatternImport({ programId, pbp: blob(stamped(compiled, { transforms: ['power-cap'] })), knownSource }))
      .toMatchObject({ ok: true, sourceMode: 'stored-artifact' })
  })

  it('checks a canonical candidate with its actual libraries against the independently stored body', async () => {
    const authored = 'export function render(i) { hsv(Helpers.scale(i), 1, 1) }'
    const libraries = { Helpers: 'function scale(x) { return x / 10 }' }
    const compiled = bundleWithPasses(authored, libraries, []).code
    expect(compiled).not.toBe(authored)
    expect(await assessControllerPatternImport({ programId, pbp: blob(stamped(compiled)),
      knownSource: { originId: 'demo:origin', source: authored, libraries } }))
      .toMatchObject({ ok: true, sourceMode: 'authored-verified', source: authored })
  })
})

describe('Controller import plans, ledger, immutable policy and retries', () => {
  it('creates deterministic fresh personal destinations, names and full initial record witnesses', async () => {
    const first = await plan()
    expect(first).toEqual(await plan())
    expect(first.record).toEqual({ id: 'personal-new', name: 'Original 1', src: stamped(), controls: {}, authors: ['Ada'], updatedAt: 123 })
    expect(first.receipt).toEqual({ version: 1, patternId: 'personal-new', controllerDeviceId: 'A', programId,
      createdAt: 123, sourceMode: 'stored-artifact', origin: { pbpDigest: await sha256ControllerProgram(blob()),
        bannerState: 'valid', banner: parsePxlblzBanner(stamped()) }, stage: 'planned',
      accountRecordDigest: await sha256ControllerProgram(new TextEncoder().encode(JSON.stringify(first.record))) })
    expect((await plan('personal-second', 'B')).record.id).toBe('personal-second')
    expect(first.receipt.origin.banner?.hash).toBe(artifactHash(source))
  })

  it('uses PBP/fallback names without trusting damaged banner names and omits absent authors', async () => {
    for (const [deviceName, expected] of [['Device name', 'Device name'], ['', 'Imported pattern']]) {
      const assessment = await assessControllerPatternImport({ programId,
        pbp: encodePbp({ id: programId, name: deviceName, sourceCode: 'export var x=1', byteCode: new Uint8Array(8) }) })
      if (!assessment.ok) throw new Error(assessment.message)
      const result = await createControllerPatternImportPlan({ assessment, controllerDeviceId: 'A',
        programId, patternId: 'personal', now: 123, existingNames: [] })
      expect(result.record).toEqual({ id: 'personal', name: expected, src: 'export var x=1', controls: {}, updatedAt: 123 })
    }
    const assessment = await assessControllerPatternImport({ programId, pbp: blob(stamped() + '\n// drift') })
    if (!assessment.ok) throw new Error(assessment.message)
    expect((await createControllerPatternImportPlan({ assessment, controllerDeviceId: 'A', programId,
      patternId: 'personal', now: 123, existingNames: [] })).record.name).toBe('Device name')
  })

  it('preserves siblings without mutating frozen inputs and rejects corrupt or rewritten identity', async () => {
    const a = (await plan()).receipt
    const b = (await plan('second', 'B')).receipt
    const empty = Object.freeze({ version: 1 as const, byPatternId: Object.freeze({}) })
    const one = withControllerPatternImport(empty, a)
    const two = withControllerPatternImport(one, b)
    expect(two).toEqual({ version: 1, byPatternId: { [a.patternId]: a, second: b } })
    expect(empty.byPatternId).toEqual({})
    expect(findControllerPatternImport(two, 'B', programId)).toEqual(b)
    expect(findControllerPatternImport(two, 'missing', programId)).toBeNull()
    expect(readControllerPatternImportLedger(undefined)).toEqual(empty)
    for (const value of [{ version: 2, byPatternId: {} }, { version: 1, byPatternId: { wrong: a } },
      { version: 1, byPatternId: { [a.patternId]: { ...a, stage: 'unknown' } } },
      { version: 1, byPatternId: { [a.patternId]: { ...a, stage: ['complete'] } } },
      { version: 1, byPatternId: { [a.patternId]: { ...a, sourceMode: ['stored-artifact'] } } },
      { version: 1, byPatternId: { [a.patternId]: { ...a, origin: { ...a.origin, bannerState: ['valid'] } } } },
      { version: 1, byPatternId: { [a.patternId]: a, duplicate: { ...a, patternId: 'duplicate' } } },
      { version: 1, byPatternId: { [a.patternId]: { ...a, origin: { ...a.origin, banner: {} } } } }]) {
      expect(() => readControllerPatternImportLedger(value)).toThrow(metadataError)
    }
    for (const changes of [{ sourceMode: 'authored-verified' as const }, { createdAt: 999 },
      { accountRecordDigest: 'a'.repeat(64) }, { controllerDeviceId: 'C' }, { programId: 'other' },
      { origin: { ...a.origin, pbpDigest: 'f'.repeat(64) } }]) {
      expect(() => withControllerPatternImport(one, { ...a, ...changes })).toThrow(metadataError)
    }
    expect(one).toEqual({ version: 1, byPatternId: { [a.patternId]: a } })
    const reversedOrigin = Object.fromEntries(Object.entries(a.origin).reverse())
    expect(withControllerPatternImport(one, { ...a, origin: reversedOrigin as typeof a.origin })).toEqual(one)
    const sameControllerOtherSlot = { ...b, controllerDeviceId: a.controllerDeviceId, programId: 'second-slot' }
    expect(withControllerPatternImport(one, sameControllerOtherSlot)).toEqual({ version: 1, byPatternId: { [a.patternId]: a, second: sameControllerOtherSlot } })
  })

  it('keeps completed source policy after ordinary record edits and reload', async () => {
    const { record, receipt } = await plan()
    const complete = { ...receipt, stage: 'complete' as const }
    const reloaded = readControllerPatternImportLedger(JSON.parse(JSON.stringify(withControllerPatternImport(readControllerPatternImportLedger(undefined), complete))))
    const edited = { ...record, src: 'export var edited = 1', name: 'Edited', controls: { sliderX: 1 }, updatedAt: 999 }
    expect(controllerPatternImportPolicy(reloaded, edited.id)).toEqual({ applyProfile: false, allowReconciliation: false,
      notice: 'Imported wrapped source. Its old Controller profile behavior remains; this Controller profile is not applied.' })
    expect(controllerPatternImportPolicy(reloaded, 'ordinary')).toEqual({ applyProfile: true, allowReconciliation: true, notice: null })
    const authored = withControllerPatternImport(readControllerPatternImportLedger(undefined), { ...receipt, sourceMode: 'authored-verified' })
    expect(controllerPatternImportPolicy(authored, receipt.patternId)).toEqual({ applyProfile: true, allowReconciliation: true, notice: null })
    expect(controllerPatternImportRetry({ receipt: complete, accountRecordDigest: 'changed', observedPbpDigest: null })).toBe('complete')
    expect(controllerPatternImportRetry({ receipt, accountRecordDigest: 'changed', observedPbpDigest: receipt.origin.pbpDigest })).toBe('conflict')
  })

  it('resumes incomplete intents only against initial account and recognized slot evidence', async () => {
    const receipt = (await plan()).receipt
    const origin = receipt.origin.pbpDigest
    const delivery = 'd'.repeat(64)
    const baseline = 'b'.repeat(64)
    const retry = (r: ControllerPatternImportReceipt, observed: string | null = origin, account: string | null = receipt.accountRecordDigest) =>
      controllerPatternImportRetry({ receipt: r, observedPbpDigest: observed, accountRecordDigest: account })
    expect(retry(receipt, origin, null)).toBe('create-account')
    expect(retry(receipt)).toBe('write') // lost create response, account already exists
    expect(retry(receipt, null)).toBe('conflict')
    expect(retry(receipt, delivery)).toBe('conflict')
    expect(retry({ ...receipt, stage: 'account-saved' }, origin, null)).toBe('conflict')
    expect(retry(receipt, baseline, null)).toBe('conflict')
    const pending = { ...receipt, stage: 'write-pending' as const, deliveryDigest: delivery, writeBaselineDigest: baseline }
    expect(retry(pending, baseline)).toBe('write')
    expect(retry(pending, delivery)).toBe('activate')
    expect(retry({ ...pending, deliveryDigest: origin })).toBe('write')
    for (const [stage, next] of [['saved-verified', 'activate'], ['activated', 'metadata'], ['metadata-pending', 'metadata']] as const) {
      expect(retry({ ...pending, stage }, delivery)).toBe(next)
      expect(retry({ ...pending, stage }, origin)).toBe('conflict')
    }
    expect(retry({ ...pending, stage: 'complete' }, 'changed', 'changed')).toBe('complete')
  })
})
