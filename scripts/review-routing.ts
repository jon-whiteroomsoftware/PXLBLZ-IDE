/**
 * Cross-model-family review routing (#637). The review gate prefers a
 * reviewer from the opposite model family to the range's authors, derived
 * from commit trailers: an explicit `X-Authored-Model:` trailer wins, with
 * model-classifiable `Co-Authored-By:` trailers as the legacy fallback.
 * Commits without either are unsignalled (human or pre-trailer agent) and
 * can never claim cross-family coverage.
 */

export type ModelFamily = 'anthropic' | 'openai'
export type ReviewerName = 'Opus 5 High' | 'GPT-5.6 High'

export const REVIEWER_FAMILY: Record<ReviewerName, ModelFamily> = {
  'Opus 5 High': 'anthropic',
  'GPT-5.6 High': 'openai',
}

export interface CommitAuthorship {
  sha: string
  model: string | null
  family: ModelFamily | null
}

export function classifyModelFamily(model: string): ModelFamily | null {
  const normalized = model.trim().toLowerCase()
  if (normalized.length === 0) return null
  if (/(^|[^a-z])(claude|opus|sonnet|haiku|fable)([^a-z]|$)/.test(normalized)) {
    return 'anthropic'
  }
  if (/(^|[^a-z])(gpt|codex|o[0-9])/.test(normalized)) return 'openai'
  return null
}

const AUTHORED_MODEL_TRAILER = /^x-authored-model:\s*(.+)$/i
const CO_AUTHORED_TRAILER = /^co-authored-by:\s*([^<]+?)\s*(?:<[^>]*>)?$/i

export function parseCommitAuthorship(
  sha: string,
  trailerBlock: string,
): CommitAuthorship {
  const lines = trailerBlock.split(/\r?\n/).map((line) => line.trim())
  for (const line of lines) {
    const explicit = AUTHORED_MODEL_TRAILER.exec(line)
    if (explicit) {
      const model = explicit[1].trim()
      return { sha, model, family: classifyModelFamily(model) }
    }
  }
  for (const line of lines) {
    const coAuthor = CO_AUTHORED_TRAILER.exec(line)
    if (!coAuthor) continue
    const model = coAuthor[1].trim()
    const family = classifyModelFamily(model)
    if (family) return { sha, model, family }
  }
  return { sha, model: null, family: null }
}

/**
 * Parses `git log --format=%H%x1f%(trailers)%x1e` output: one record per
 * commit, unit-separator between sha and trailer block, record-separator
 * terminating each commit.
 */
export function parseAuthorshipLog(raw: string): CommitAuthorship[] {
  return raw
    .split('\x1e')
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const [sha, trailers = ''] = record.split('\x1f')
      return parseCommitAuthorship(sha.trim(), trailers)
    })
}

export interface ReviewRouting {
  primary: ReviewerName
  fallback: ReviewerName
  authoredModels: string[]
  reason: string
}

function knownFamilies(commits: readonly CommitAuthorship[]): Set<ModelFamily> {
  return new Set(
    commits.flatMap((commit) => (commit.family ? [commit.family] : [])),
  )
}

export function routeReview(commits: readonly CommitAuthorship[]): ReviewRouting {
  const families = knownFamilies(commits)
  const authoredModels = [...new Set(
    commits.flatMap((commit) => (commit.model ? [commit.model] : [])),
  )]
  if (families.size === 1 && families.has('anthropic')) {
    return {
      primary: 'GPT-5.6 High',
      fallback: 'Opus 5 High',
      authoredModels,
      reason: 'cross-family: range authored by Anthropic models',
    }
  }
  if (families.size === 1 && families.has('openai')) {
    return {
      primary: 'Opus 5 High',
      fallback: 'GPT-5.6 High',
      authoredModels,
      reason: 'cross-family: range authored by OpenAI models',
    }
  }
  if (families.size === 0) {
    return {
      primary: 'Opus 5 High',
      fallback: 'GPT-5.6 High',
      authoredModels,
      reason: 'authorship unsignalled; using the default reviewer order',
    }
  }
  return {
    primary: 'Opus 5 High',
    fallback: 'GPT-5.6 High',
    authoredModels,
    reason: 'mixed-family range; full cross-family coverage is impossible',
  }
}

/**
 * False when any commit is known to share the reviewer's family; true only
 * when every commit is signalled and none shares it. Any unsignalled commit
 * otherwise degrades the claim to undefined (unverified): it could itself be
 * authored by the reviewer's family, so it can never support a positive
 * cross-family claim.
 */
export function crossFamilyCoverage(
  commits: readonly CommitAuthorship[],
  reviewer: ReviewerName,
): boolean | undefined {
  const families = knownFamilies(commits)
  if (families.has(REVIEWER_FAMILY[reviewer])) return false
  if (families.size === 0 || commits.some((commit) => commit.family === null)) {
    return undefined
  }
  return true
}
