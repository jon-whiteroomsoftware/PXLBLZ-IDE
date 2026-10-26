import { artifactHash, parsePxlblzBanner, stripPxlblzBanner, type ParsedPxlblzBanner } from './artifactStamp'
import { bytecodeHeaderReconciles, isPxlblzProgramId } from './bytecodePush'
import { bundleWithPasses } from './passEngine'
import { decodePbp, PBP_VERSION } from './pbpEncode'
import type { PatternRecord } from './personalContentRecords'
import { uniquePatternName } from './patternName'
import { extractPatternAuthors } from './patternAttribution'

export type ControllerImportSourceMode = 'authored-verified' | 'stored-artifact'
export type ControllerImportStage = 'planned' | 'account-saved' | 'write-pending'
  | 'saved-verified' | 'activated' | 'metadata-pending' | 'complete'
export type ControllerImportBannerState = 'valid' | 'missing' | 'malformed' | 'hash-mismatch'
export type KnownControllerImportSource = {
  originId: string; source: string; libraries?: Record<string, string>
  sourceMode?: ControllerImportSourceMode
}
export type ControllerPatternImportReceipt = {
  version: 1; patternId: string; controllerDeviceId: string; programId: string
  createdAt: number; sourceMode: ControllerImportSourceMode
  origin: { pbpDigest: string; bannerState: ControllerImportBannerState; banner: ParsedPxlblzBanner | null }
  accountRecordDigest: string; stage: ControllerImportStage
  writeBaselineDigest?: string; deliveryDigest?: string; profileSignature?: string
}
export type ControllerPatternImportLedger = {
  version: 1; byPatternId: Record<string, ControllerPatternImportReceipt>
}

export async function sha256ControllerProgram(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** API response property order is not part of the account creation witness. */
export function controllerPatternImportAccountRecordDigest(record: PatternRecord): Promise<string> {
  const { id, name, src, controls, authors, params, settings, updatedAt } = record
  return sha256ControllerProgram(new TextEncoder().encode(JSON.stringify({
    id, name, src, controls, authors, params, settings, updatedAt,
  })))
}

const messages = {
  'not-pxlblz': 'This saved program is not an unimported PXLBLZ Pattern.',
  unreadable: 'Saved program could not be read. No Pattern was imported.',
  show: 'This saved artifact is a Show, not a Pattern.',
  'no-source': 'This saved program has no source code to import.',
  'invalid-source': 'Saved Pattern source cannot compile. Nothing was sent.',
  'invalid-bytecode': 'Saved Pattern bytecode is invalid. Nothing was sent.',
} as const
type Assessment =
  | { ok: true; sourceMode: ControllerImportSourceMode; source: string; deviceName: string
      origin: ControllerPatternImportReceipt['origin']; bytecode: Uint8Array }
  | { ok: false; code: keyof typeof messages; message: string }
const refuse = (code: keyof typeof messages): Assessment => ({ ok: false, code, message: messages[code] })

export async function assessControllerPatternImport(input: {
  programId: string; pbp: Uint8Array; knownSource?: KnownControllerImportSource
}): Promise<Assessment> {
  if (!isPxlblzProgramId(input.programId)) return refuse('not-pxlblz')
  let decoded
  try { decoded = decodePbp(input.pbp) } catch { return refuse('unreadable') }
  if (!decoded || decoded.version !== PBP_VERSION) return refuse('unreadable')
  const storedSource = decoded.sourceCode
  const stamp = parsePxlblzBanner(storedSource)
  if (stamp?.kind === 'show') return refuse('show')
  if (!storedSource.trim()) return refuse('no-source')
  try { bundleWithPasses(storedSource, {}, []) } catch { return refuse('invalid-source') }
  if (!bytecodeHeaderReconciles(decoded.byteCode)) return refuse('invalid-bytecode')
  const valid = stamp !== null && stamp.hash === artifactHash(storedSource)
  const bannerState: ControllerImportBannerState = valid ? 'valid' : stamp ? 'hash-mismatch'
    : /^(?:\/\/ Built with PXLBLZ-IDE|\/\/ pxlblz:)/.test(storedSource) ? 'malformed' : 'missing'
  let sourceMode: ControllerImportSourceMode = 'stored-artifact'
  let source = storedSource
  const candidate = input.knownSource
  if (valid && stamp.transforms.length === 0 && candidate?.originId === stamp.id
    && candidate.sourceMode !== 'stored-artifact') {
    try {
      if (bundleWithPasses(candidate.source, candidate.libraries ?? {}, []).code === stripPxlblzBanner(storedSource)) {
        sourceMode = 'authored-verified'
        source = candidate.source
      }
    } catch { /* An unavailable canonical candidate does not invalidate the stored artifact. */ }
  }
  return { ok: true, sourceMode, source, deviceName: decoded.name, bytecode: decoded.byteCode,
    origin: { pbpDigest: await sha256ControllerProgram(input.pbp), bannerState, banner: valid ? stamp : null } }
}

export async function createControllerPatternImportPlan(input: {
  assessment: Extract<Awaited<ReturnType<typeof assessControllerPatternImport>>, { ok: true }>
  controllerDeviceId: string; programId: string; patternId: string; now: number; existingNames: readonly string[]
}): Promise<{ record: PatternRecord; receipt: ControllerPatternImportReceipt }> {
  const { assessment } = input
  const authors = extractPatternAuthors(assessment.source)
  // Property order is the stable initial-record digest contract; absent optionals stay absent.
  const record: PatternRecord = { id: input.patternId,
    name: uniquePatternName(assessment.origin.banner?.name || assessment.deviceName || 'Imported pattern', [...input.existingNames]),
    src: assessment.source, controls: {}, ...(authors.length ? { authors } : {}), updatedAt: input.now }
  const receipt: ControllerPatternImportReceipt = { version: 1, patternId: input.patternId,
    controllerDeviceId: input.controllerDeviceId, programId: input.programId, createdAt: input.now,
    sourceMode: assessment.sourceMode, origin: structuredClone(assessment.origin),
    accountRecordDigest: await controllerPatternImportAccountRecordDigest(record), stage: 'planned' }
  return { record, receipt }
}

const metadataError = () => new Error('Controller import metadata is unreadable. No Pattern was sent.')
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text)
const member = (value: unknown, choices: readonly string[]): boolean => typeof value === 'string' && choices.includes(value)
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)
const keys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key))
function sameJson(a: unknown, b: unknown): boolean {
  const ordered = (value: unknown) => JSON.stringify(value, (_key, item) => object(item)
    ? Object.fromEntries(Object.entries(item).sort(([x], [y]) => x.localeCompare(y))) : item)
  return ordered(a) === ordered(b)
}
const mapClasses = (value: unknown) => strings(value) && value.every((v) => ['path', 'surface', 'shell', 'volume', 'custom'].includes(v))
function aspect(value: unknown): boolean {
  return object(value) && typeof value.min === 'number' && Number.isFinite(value.min)
    && value.min > 0 && typeof value.max === 'number' && Number.isFinite(value.max) && value.max >= value.min
}
function map(value: unknown): boolean {
  return object(value) && text(value.name) && (value.kind === 'custom' || (value.kind === 'stock' && text(value.id)))
    && (value.fingerprint === undefined || text(value.fingerprint))
}
function banner(value: unknown): boolean {
  if (!object(value) || value.version !== 1 || value.kind !== 'pattern' || !text(value.id)
    || typeof value.hash !== 'string' || !/^[0-9a-f]{8}$/.test(value.hash) || !text(value.stamped) || !strings(value.transforms)
    || (value.name !== undefined && !text(value.name))) return false
  if (value.preferredMap !== undefined && !map(value.preferredMap)) return false
  if (value.compatibility !== undefined) {
    const c = value.compatibility
    if (!object(c) || !member(c.portability, ['adaptive', 'installation-bound'])
      || !Array.isArray(c.dimensions) || !c.dimensions.every((d) => [1, 2, 3].includes(d))
      || !mapClasses(c.mapClasses) || !member(c.resolution, ['adaptive', 'fixed'])
      || typeof c.exactMap !== 'boolean' || (c.aspectRatio !== undefined && !aspect(c.aspectRatio))) return false
  }
  if (value.showOutputContract !== undefined) {
    const c = value.showOutputContract
    if (!object(c) || c.version !== 1) return false
    if (c.kind === 'installation') {
      if (!Number.isInteger(c.pixelCount) || Number(c.pixelCount) < 1 || (c.outputMap !== undefined && !map(c.outputMap))) return false
    } else if (c.kind === 'portable-2d') {
      if (!Array.isArray(c.dimensions) || c.dimensions.length !== 1 || c.dimensions[0] !== 2
        || !mapClasses(c.mapClasses) || c.resolution !== 'variable' || (c.aspectRatio !== undefined && !aspect(c.aspectRatio))) return false
    } else return false
  }
  return true
}
function validReceipt(value: unknown): value is ControllerPatternImportReceipt {
  if (!object(value) || !keys(value, ['version', 'patternId', 'controllerDeviceId', 'programId', 'createdAt',
    'sourceMode', 'origin', 'accountRecordDigest', 'stage', 'writeBaselineDigest', 'deliveryDigest', 'profileSignature'])
    || value.version !== 1 || !text(value.patternId) || !text(value.controllerDeviceId)
    || !text(value.programId) || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)
    || !member(value.sourceMode, ['authored-verified', 'stored-artifact'])
    || !digest(value.accountRecordDigest)
    || !member(value.stage, ['planned', 'account-saved', 'write-pending', 'saved-verified', 'activated', 'metadata-pending', 'complete'])) return false
  const origin = value.origin
  if (!object(origin) || !keys(origin, ['pbpDigest', 'bannerState', 'banner']) || !digest(origin.pbpDigest)
    || !member(origin.bannerState, ['valid', 'missing', 'malformed', 'hash-mismatch'])) return false
  if (origin.bannerState === 'valid' ? !banner(origin.banner) : origin.banner !== null) return false
  if (value.sourceMode === 'authored-verified' && (origin.bannerState !== 'valid'
    || (origin.banner as ParsedPxlblzBanner).transforms.length !== 0)) return false
  return (value.writeBaselineDigest === undefined || digest(value.writeBaselineDigest))
    && (value.deliveryDigest === undefined || digest(value.deliveryDigest))
    && (value.profileSignature === undefined || typeof value.profileSignature === 'string')
}

export function readControllerPatternImportLedger(value: unknown): ControllerPatternImportLedger {
  if (value === undefined) return { version: 1, byPatternId: {} }
  if (!object(value) || !keys(value, ['version', 'byPatternId']) || value.version !== 1 || !object(value.byPatternId)) throw metadataError()
  const pairs = new Set<string>()
  for (const [key, receipt] of Object.entries(value.byPatternId)) {
    if (!validReceipt(receipt) || key !== receipt.patternId) throw metadataError()
    const pair = JSON.stringify([receipt.controllerDeviceId, receipt.programId])
    if (pairs.has(pair)) throw metadataError()
    pairs.add(pair)
  }
  return structuredClone(value) as ControllerPatternImportLedger
}

export function findControllerPatternImport(ledger: ControllerPatternImportLedger,
  controllerDeviceId: string, programId: string): ControllerPatternImportReceipt | null {
  return Object.values(readControllerPatternImportLedger(ledger).byPatternId)
    .find((receipt) => receipt.controllerDeviceId === controllerDeviceId && receipt.programId === programId) ?? null
}

export function withControllerPatternImport(ledger: ControllerPatternImportLedger,
  receipt: ControllerPatternImportReceipt): ControllerPatternImportLedger {
  const valid = readControllerPatternImportLedger(ledger)
  if (!validReceipt(receipt)) throw metadataError()
  const old = own(valid.byPatternId, receipt.patternId) ? valid.byPatternId[receipt.patternId] : undefined
  if (old && (old.version !== receipt.version || old.patternId !== receipt.patternId
    || old.controllerDeviceId !== receipt.controllerDeviceId || old.programId !== receipt.programId
    || old.createdAt !== receipt.createdAt || old.sourceMode !== receipt.sourceMode
    || old.accountRecordDigest !== receipt.accountRecordDigest || !sameJson(old.origin, receipt.origin))) throw metadataError()
  return readControllerPatternImportLedger({ version: 1, byPatternId: { ...valid.byPatternId, [receipt.patternId]: receipt } })
}

export function controllerPatternImportPolicy(ledger: ControllerPatternImportLedger, patternId: string): {
  applyProfile: boolean; allowReconciliation: boolean; notice: string | null
} {
  const entries = readControllerPatternImportLedger(ledger).byPatternId
  const receipt = own(entries, patternId) ? entries[patternId] : undefined
  return receipt?.sourceMode === 'stored-artifact'
    ? { applyProfile: false, allowReconciliation: false,
      notice: 'Imported wrapped source. Its old Controller profile behavior remains; this Controller profile is not applied.' }
    : { applyProfile: true, allowReconciliation: true, notice: null }
}

export function controllerPatternImportRetry(input: {
  receipt: ControllerPatternImportReceipt; accountRecordDigest: string | null; observedPbpDigest: string | null
}): 'create-account' | 'write' | 'activate' | 'metadata' | 'complete' | 'conflict' {
  const { receipt: r, accountRecordDigest: account, observedPbpDigest: observed } = input
  if (r.stage === 'complete') return 'complete'
  if (observed === null) return 'conflict'
  if (account === null) return r.stage === 'planned' && observed === r.origin.pbpDigest ? 'create-account' : 'conflict'
  if (account !== r.accountRecordDigest || ![r.origin.pbpDigest, r.writeBaselineDigest, r.deliveryDigest].includes(observed)) return 'conflict'
  if (r.stage === 'activated' || r.stage === 'metadata-pending') return observed === r.deliveryDigest ? 'metadata' : 'conflict'
  if (r.stage === 'saved-verified') return observed === r.deliveryDigest ? 'activate' : 'conflict'
  if (observed === r.deliveryDigest && observed !== r.origin.pbpDigest) return 'activate'
  return observed === r.origin.pbpDigest || observed === r.writeBaselineDigest ? 'write' : 'conflict'
}
