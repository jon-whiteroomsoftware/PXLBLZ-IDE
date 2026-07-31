/**
 * Pure reduction of the claude CLI stream-json event feed for the review gate
 * (#637). The runner feeds stdout lines one at a time; the state carries the
 * final result envelope plus the partial StructuredOutput JSON so a stall or
 * timeout can surface findings the reviewer already emitted instead of
 * discarding the whole run. Stream events are display and diagnostics only;
 * approval still requires the complete validated result envelope.
 */

export interface ReviewStreamState {
  readonly eventCount: number
  readonly lastActivity: string | null
  readonly resultLine: string | null
  readonly structuredOutputPartial: string
  readonly structuredOutputIndexes: ReadonlySet<number>
}

export const INITIAL_REVIEW_STREAM_STATE: ReviewStreamState = {
  eventCount: 0,
  lastActivity: null,
  resultLine: null,
  structuredOutputPartial: '',
  structuredOutputIndexes: new Set(),
}

export interface ReviewStreamReduction {
  state: ReviewStreamState
  progress: string[]
}

const STRUCTURED_OUTPUT_TOOL = 'StructuredOutput'
const STRUCTURED_OUTPUT_ACTIVITY = 'emitting structured review output'

interface StreamToolUseBlock {
  type: 'tool_use'
  name: string
  input?: Record<string, unknown>
}

function toolCallDescription(name: string, input: unknown): string {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const detail = [record.file_path, record.pattern, record.path, record.command]
    .find((value) => typeof value === 'string' && value.length > 0)
  return detail ? `${name} ${detail}` : name
}

function isToolUseBlock(block: unknown): block is StreamToolUseBlock {
  return Boolean(block)
    && typeof block === 'object'
    && (block as StreamToolUseBlock).type === 'tool_use'
    && typeof (block as StreamToolUseBlock).name === 'string'
}

export function reduceReviewStreamLine(
  state: ReviewStreamState,
  line: string,
): ReviewStreamReduction {
  const trimmed = line.trim()
  if (trimmed.length === 0) return { state, progress: [] }
  let event: unknown
  try {
    event = JSON.parse(trimmed)
  } catch {
    return { state, progress: [] }
  }
  if (!event || typeof event !== 'object') return { state, progress: [] }
  const typed = event as {
    type?: string
    message?: { content?: unknown[] }
    event?: {
      type?: string
      index?: number
      content_block?: unknown
      delta?: { type?: string; partial_json?: string }
    }
  }
  const counted: ReviewStreamState = { ...state, eventCount: state.eventCount + 1 }

  if (typed.type === 'assistant' && Array.isArray(typed.message?.content)) {
    const progress: string[] = []
    let lastActivity = counted.lastActivity
    for (const block of typed.message.content) {
      if (!isToolUseBlock(block)) continue
      const description = block.name === STRUCTURED_OUTPUT_TOOL
        ? STRUCTURED_OUTPUT_ACTIVITY
        : toolCallDescription(block.name, block.input)
      progress.push(`  ⋯ ${description}`)
      lastActivity = description
    }
    return { state: { ...counted, lastActivity }, progress }
  }

  if (typed.type === 'result') {
    return {
      state: { ...counted, resultLine: trimmed, lastActivity: 'result received' },
      progress: [],
    }
  }

  if (typed.type === 'stream_event' && typed.event) {
    const inner = typed.event
    if (inner.type === 'message_start') {
      return {
        state: { ...counted, structuredOutputIndexes: new Set() },
        progress: [],
      }
    }
    if (inner.type === 'content_block_start'
      && isToolUseBlock(inner.content_block)
      && inner.content_block.name === STRUCTURED_OUTPUT_TOOL
      && typeof inner.index === 'number') {
      const indexes = new Set(counted.structuredOutputIndexes)
      indexes.add(inner.index)
      return {
        state: {
          ...counted,
          structuredOutputIndexes: indexes,
          structuredOutputPartial: '',
          lastActivity: STRUCTURED_OUTPUT_ACTIVITY,
        },
        progress: [],
      }
    }
    if (inner.type === 'content_block_delta'
      && inner.delta?.type === 'input_json_delta'
      && typeof inner.delta.partial_json === 'string'
      && typeof inner.index === 'number'
      && counted.structuredOutputIndexes.has(inner.index)) {
      return {
        state: {
          ...counted,
          structuredOutputPartial:
            counted.structuredOutputPartial + inner.delta.partial_json,
        },
        progress: [],
      }
    }
    return { state: counted, progress: [] }
  }

  return { state: counted, progress: [] }
}

export interface SalvagedReviewFinding {
  severity?: string
  title: string
  file?: string
  line?: number
  explanation?: string
}

export interface SalvagedReview {
  decision: string | null
  summary: string | null
  findings: SalvagedReviewFinding[]
}

/**
 * Closes open braces/brackets so a truncated JSON prefix has a chance of
 * parsing. Returns null when the text is not a JSON-object prefix, or when it
 * ends inside a string: closing a truncated string would invent content
 * (half a finding title), so dirty tails shrink to a delimiter instead.
 */
function closeOpenJson(text: string): string | null {
  const closers: string[] = []
  let inString = false
  let escaped = false
  for (const character of text) {
    if (escaped) {
      escaped = false
      continue
    }
    if (inString) {
      if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') closers.push('}')
    else if (character === '[') closers.push(']')
    else if (character === '}' || character === ']') {
      if (closers.pop() !== character) return null
    }
  }
  if (inString || escaped) return null
  return text + closers.reverse().join('')
}

function parseJsonPrefix(partial: string): unknown | null {
  let candidate = partial.trim()
  for (let attempt = 0; attempt < 64 && candidate.length > 0; attempt += 1) {
    const repaired = closeOpenJson(candidate)
    if (repaired !== null) {
      try {
        return JSON.parse(repaired)
      } catch {
        // Dangling key or comma; shrink to the previous delimiter and retry.
      }
    }
    const cut = Math.max(
      candidate.lastIndexOf(','),
      candidate.lastIndexOf('{'),
      candidate.lastIndexOf('['),
    )
    if (cut <= 0) return null
    candidate = candidate.slice(0, cut)
  }
  return null
}

export function salvageReviewPartial(partial: string): SalvagedReview | null {
  const parsed = parseJsonPrefix(partial)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const review = parsed as {
    decision?: unknown
    summary?: unknown
    findings?: unknown
  }
  const findings = (Array.isArray(review.findings) ? review.findings : [])
    .filter((finding): finding is SalvagedReviewFinding => (
      Boolean(finding)
      && typeof finding === 'object'
      && typeof (finding as SalvagedReviewFinding).title === 'string'
    ))
  const decision = typeof review.decision === 'string' ? review.decision : null
  const summary = typeof review.summary === 'string' ? review.summary : null
  if (decision === null && summary === null && findings.length === 0) return null
  return { decision, summary, findings }
}

export function formatSalvagedReview(salvage: SalvagedReview): string[] {
  const lines = [
    'Partial review already emitted before failure (diagnostic only, NOT an approval):',
  ]
  if (salvage.decision) lines.push(`  decision: ${salvage.decision}`)
  if (salvage.summary) lines.push(`  summary: ${salvage.summary}`)
  for (const finding of salvage.findings) {
    const location = finding.file
      ? (finding.line ? `${finding.file}:${finding.line}` : finding.file)
      : 'unknown location'
    lines.push(`  [${finding.severity ?? 'P?'}] ${finding.title} - ${location}`)
  }
  return lines
}

export interface ReviewStreamFailure {
  reason: 'stalled' | 'timed out'
  elapsedMs: number
  sinceLastEventMs: number
}

function minutes(ms: number): string {
  return `${(ms / 60_000).toFixed(1)} min`
}

export function formatReviewStreamDiagnostic(
  state: ReviewStreamState,
  failure: ReviewStreamFailure,
): string[] {
  const lines = [
    `Opus 5 High review ${failure.reason} after ${minutes(failure.elapsedMs)}: `
    + `no stream activity for ${minutes(failure.sinceLastEventMs)} `
    + `(${state.eventCount} event${state.eventCount === 1 ? '' : 's'}, `
    + `last: ${state.lastActivity ?? 'no output yet'}).`,
  ]
  const salvage = salvageReviewPartial(state.structuredOutputPartial)
  if (salvage) lines.push(...formatSalvagedReview(salvage))
  return lines
}
