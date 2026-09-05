import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type JsonRecord = Record<string, unknown>

interface HeldOutInput extends JsonRecord {
  id: string
  category: string
}

interface HeldOutOutcome extends JsonRecord {
  id: string
}

interface HeldOutManifest extends JsonRecord {
  version: string
  caseCount: number
  categoryCounts: Record<string, number>
  releaseGate: string
  artifacts: Array<{ path: string; sha256: string }>
}

export interface HeldOutCorpusSummary {
  version: string
  caseCount: number
  categories: Record<string, number>
  releaseGate: string
  manifestSha256: string
}

const VERSION_DIRECTORY = fileURLToPath(new URL('./v1/', import.meta.url))
const SHA256 = /^[a-f0-9]{64}$/
const CASE_ID = /^heldout-v1-[a-z0-9-]+$/
const OUTCOMES = new Set(['edit', 'ask', 'refuse', 'no-edit'])

function fail(message: string): never {
  throw new Error(`held-out corpus seal invalid: ${message}`)
}

function object(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`)
  }
  return value as JsonRecord
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`)
  return value
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`)
  return value
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(`${label} must be a non-negative integer`)
  return value as number
}

function parseJson(path: string): JsonRecord {
  try {
    return object(JSON.parse(readFileSync(path, 'utf8')), path)
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${path} is not valid JSON`)
    throw error
  }
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function sameRecord(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b))
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries)
}

function readManifest(directory: string): { manifest: HeldOutManifest; manifestSha256: string } {
  const manifestPath = join(directory, 'manifest.json')
  const manifestSha256 = sha256(manifestPath)
  const seal = readFileSync(join(directory, 'manifest.sha256'), 'utf8')
  const match = /^([a-f0-9]{64})[ ]{2}manifest\.json\n?$/.exec(seal)
  if (!match) fail('manifest.sha256 must contain one sha256sum-compatible manifest entry')
  if (match[1] !== manifestSha256) fail('manifest.json does not match manifest.sha256')

  const raw = parseJson(manifestPath)
  if (raw.schemaVersion !== 'pxlblz-held-out-manifest-v1') fail('unsupported manifest schema')
  const version = string(raw.version, 'manifest.version')
  if (version !== 'v1') fail(`unsupported held-out corpus version ${version}`)
  const releaseGate = string(raw.releaseGate, 'manifest.releaseGate')
  if (releaseGate !== '#958') fail('v1 may first be scored only under issue #958')
  const usage = object(raw.usageBoundary, 'manifest.usageBoundary')
  if (JSON.stringify(usage.allowedBeforeReleaseGate) !== JSON.stringify(['integrity-verification'])) {
    fail('pre-release use must be limited to integrity verification')
  }
  const forbidden = array(usage.forbiddenBeforeReleaseGate, 'manifest.usageBoundary.forbiddenBeforeReleaseGate')
  for (const required of ['execution', 'scoring', 'baseline', 'tuning', 'prompt-construction', 'case-selection', 'content-reporting']) {
    if (!forbidden.includes(required)) fail(`usage boundary does not forbid ${required}`)
  }
  if (usage.firstScoringAuthority !== 'Issue #958 release qualification') {
    fail('first scoring authority must remain issue #958 release qualification')
  }

  const categoryCounts = Object.fromEntries(
    Object.entries(object(raw.categoryCounts, 'manifest.categoryCounts')).map(([category, count]) => [
      category,
      integer(count, `manifest.categoryCounts.${category}`),
    ]),
  )
  const artifacts = array(raw.artifacts, 'manifest.artifacts').map((candidate, index) => {
    const artifact = object(candidate, `manifest.artifacts[${index}]`)
    const path = string(artifact.path, `manifest.artifacts[${index}].path`)
    const expectedHash = string(artifact.sha256, `manifest.artifacts[${index}].sha256`)
    if (!SHA256.test(expectedHash)) fail(`${path} has an invalid sha256`)
    return { path, sha256: expectedHash }
  })
  const expectedPaths = ['expected-outcomes.sealed.json', 'inputs.sealed.json']
  if (JSON.stringify(artifacts.map(({ path }) => path).sort()) !== JSON.stringify(expectedPaths)) {
    fail('manifest must seal exactly the input and expected-outcome artifacts')
  }
  for (const artifact of artifacts) {
    if (sha256(join(directory, artifact.path)) !== artifact.sha256) {
      fail(`${artifact.path} does not match its manifest sha256`)
    }
  }

  return {
    manifest: {
      ...raw,
      version,
      caseCount: integer(raw.caseCount, 'manifest.caseCount'),
      categoryCounts,
      releaseGate,
      artifacts,
    },
    manifestSha256,
  }
}

function readInputs(directory: string): HeldOutInput[] {
  const raw = parseJson(join(directory, 'inputs.sealed.json'))
  if (raw.schemaVersion !== 'pxlblz-held-out-inputs-v1') fail('unsupported input schema')
  const ids = new Set<string>()
  return array(raw.cases, 'inputs.cases').map((candidate, index) => {
    const input = object(candidate, `inputs.cases[${index}]`)
    const id = string(input.id, `inputs.cases[${index}].id`)
    if (!CASE_ID.test(id)) fail(`${id} does not use the v1 held-out id namespace`)
    if (ids.has(id)) fail(`${id} is duplicated in inputs`)
    ids.add(id)
    const category = string(input.category, `${id}.category`)
    string(input.referent, `${id}.referent`)
    string(input.fixture, `${id}.fixture`)
    string(input.utterance, `${id}.utterance`)
    for (const forbidden of ['assertions', 'expect', 'expected', 'outcome', 'script']) {
      if (forbidden in input) fail(`${id} input contains expected-output field ${forbidden}`)
    }
    if (input.setup !== undefined) {
      array(input.setup, `${id}.setup`).forEach((candidate, setupIndex) => {
        const setup = object(candidate, `${id}.setup[${setupIndex}]`)
        string(setup.operation, `${id}.setup[${setupIndex}].operation`)
        object(setup.args, `${id}.setup[${setupIndex}].args`)
      })
    }
    if (input.context !== undefined) object(input.context, `${id}.context`)
    return { ...input, id, category }
  })
}

function readOutcomes(directory: string): HeldOutOutcome[] {
  const raw = parseJson(join(directory, 'expected-outcomes.sealed.json'))
  if (raw.schemaVersion !== 'pxlblz-held-out-outcomes-v1') fail('unsupported expected-outcome schema')
  const ids = new Set<string>()
  return array(raw.outcomes, 'expectedOutcomes.outcomes').map((candidate, index) => {
    const expected = object(candidate, `expectedOutcomes.outcomes[${index}]`)
    const id = string(expected.id, `expectedOutcomes.outcomes[${index}].id`)
    if (!CASE_ID.test(id)) fail(`${id} does not use the v1 held-out id namespace`)
    if (ids.has(id)) fail(`${id} is duplicated in expected outcomes`)
    ids.add(id)
    const outcome = string(expected.outcome, `${id}.outcome`)
    if (!OUTCOMES.has(outcome)) fail(`${id} has unsupported outcome ${outcome}`)
    array(expected.assertions, `${id}.assertions`).forEach((candidate, assertionIndex) => {
      const assertion = object(candidate, `${id}.assertions[${assertionIndex}]`)
      string(assertion.kind, `${id}.assertions[${assertionIndex}].kind`)
    })
    if (expected.maxTransactions !== undefined) {
      const maximum = integer(expected.maxTransactions, `${id}.maxTransactions`)
      if (maximum < 1) fail(`${id}.maxTransactions must be at least one`)
    }
    for (const forbidden of ['context', 'fixture', 'referent', 'script', 'setup', 'utterance']) {
      if (forbidden in expected) fail(`${id} expected outcome contains input field ${forbidden}`)
    }
    return { ...expected, id }
  })
}

function readVerified(directory = VERSION_DIRECTORY): {
  summary: HeldOutCorpusSummary
  ids: string[]
} {
  const { manifest, manifestSha256 } = readManifest(directory)
  const inputs = readInputs(directory)
  const outcomes = readOutcomes(directory)
  const inputIds = inputs.map(({ id }) => id)
  const outcomeIds = outcomes.map(({ id }) => id)
  if (JSON.stringify(inputIds) !== JSON.stringify(outcomeIds)) {
    fail('inputs and expected outcomes must have the same ids in the same order')
  }
  if (inputs.length !== manifest.caseCount) {
    fail(`manifest declares ${manifest.caseCount} cases but artifacts contain ${inputs.length}`)
  }
  const categories: Record<string, number> = {}
  for (const input of inputs) categories[input.category] = (categories[input.category] ?? 0) + 1
  if (!sameRecord(categories, manifest.categoryCounts)) fail('manifest category counts do not match inputs')

  return {
    summary: {
      version: manifest.version,
      caseCount: manifest.caseCount,
      categories: manifest.categoryCounts,
      releaseGate: manifest.releaseGate,
      manifestSha256,
    },
    ids: inputIds,
  }
}

/** Verify the sealed bytes and return only non-content metadata. */
export function verifyHeldOutCorpus(directory = VERSION_DIRECTORY): HeldOutCorpusSummary {
  return readVerified(directory).summary
}

/** Prove the ordinary corpus does not contain any sealed case id. */
export function assertHeldOutCorpusExclusion(
  ordinaryCaseIds: readonly string[],
  directory = VERSION_DIRECTORY,
): { ordinaryCaseCount: number; heldOutCaseCount: number; collisions: string[] } {
  const verified = readVerified(directory)
  const ordinary = new Set(ordinaryCaseIds)
  return {
    ordinaryCaseCount: ordinaryCaseIds.length,
    heldOutCaseCount: verified.summary.caseCount,
    collisions: verified.ids.filter((id) => ordinary.has(id)),
  }
}

export function main(): void {
  const summary = verifyHeldOutCorpus()
  console.log(JSON.stringify({
    ...summary,
    path: dirname(join(VERSION_DIRECTORY, 'manifest.json')),
    permittedAction: 'integrity-verification',
  }, null, 2))
}
