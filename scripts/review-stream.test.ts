import { describe, expect, it } from 'vitest'
import {
  INITIAL_REVIEW_STREAM_STATE,
  formatReviewStreamDiagnostic,
  formatSalvagedReview,
  reduceReviewStreamLine,
  salvageReviewPartial,
  type ReviewStreamState,
} from './review-stream'

function feed(lines: unknown[], initial: ReviewStreamState = INITIAL_REVIEW_STREAM_STATE): {
  state: ReviewStreamState
  progress: string[]
} {
  let state = initial
  const progress: string[] = []
  for (const line of lines) {
    const raw = typeof line === 'string' ? line : JSON.stringify(line)
    const reduction = reduceReviewStreamLine(state, raw)
    state = reduction.state
    progress.push(...reduction.progress)
  }
  return { state, progress }
}

function assistantToolUse(name: string, input: Record<string, unknown>): unknown {
  return {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 'toolu_x', name, input }] },
  }
}

function structuredOutputStart(index: number): unknown {
  return {
    type: 'stream_event',
    event: {
      type: 'content_block_start',
      index,
      content_block: { type: 'tool_use', id: 'toolu_so', name: 'StructuredOutput', input: {} },
    },
  }
}

function inputJsonDelta(index: number, partialJson: string): unknown {
  return {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: partialJson },
    },
  }
}

describe('review stream reduction (#637)', () => {
  it('emits one progress line per completed repository tool call', () => {
    const { state, progress } = feed([
      { type: 'system', subtype: 'init' },
      assistantToolUse('Read', { file_path: 'scripts/push-review.ts' }),
      assistantToolUse('Grep', { pattern: 'runReviewForRanges', path: 'scripts' }),
      assistantToolUse('Glob', { pattern: 'scripts/*.test.ts' }),
      assistantToolUse('Bash', { command: 'git log --oneline' }),
    ])

    expect(progress).toEqual([
      '  ⋯ Read scripts/push-review.ts',
      '  ⋯ Grep runReviewForRanges',
      '  ⋯ Glob scripts/*.test.ts',
      '  ⋯ Bash git log --oneline',
    ])
    expect(state.eventCount).toBe(5)
    expect(state.lastActivity).toBe('Bash git log --oneline')
  })

  it('announces structured output emission without duplicating raw deltas as progress', () => {
    const { state, progress } = feed([
      structuredOutputStart(0),
      inputJsonDelta(0, '{"decision": "pass"'),
      inputJsonDelta(0, ', "summary": "ok", "findings": []}'),
      assistantToolUse('StructuredOutput', { decision: 'pass', summary: 'ok', findings: [] }),
    ])

    expect(progress).toEqual(['  ⋯ emitting structured review output'])
    expect(state.structuredOutputPartial).toBe(
      '{"decision": "pass", "summary": "ok", "findings": []}',
    )
  })

  it('only accumulates deltas for the StructuredOutput block, keyed by index', () => {
    const { state } = feed([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_r', name: 'Read', input: {} },
        },
      },
      inputJsonDelta(0, '{"file_path": "scripts/push-review.ts"}'),
      structuredOutputStart(1),
      inputJsonDelta(1, '{"decision": "fail"'),
    ])

    expect(state.structuredOutputPartial).toBe('{"decision": "fail"')
  })

  it('forgets block indexes at message_start and restarts salvage on a retried StructuredOutput block', () => {
    const { state } = feed([
      structuredOutputStart(0),
      inputJsonDelta(0, '{"decision": "invalid attempt"'),
      { type: 'stream_event', event: { type: 'message_start', message: {} } },
      inputJsonDelta(0, 'IGNORED: index no longer tracked'),
      structuredOutputStart(0),
      inputJsonDelta(0, '{"decision": "pass"'),
    ])

    expect(state.structuredOutputPartial).toBe('{"decision": "pass"')
  })

  it('captures the final result line verbatim and tolerates unparseable lines', () => {
    const resultLine = JSON.stringify({
      type: 'result',
      subtype: 'success',
      structured_output: { decision: 'pass', summary: 'ok', findings: [] },
    })
    const { state, progress } = feed(['not json at all', '', resultLine])

    expect(progress).toEqual([])
    expect(state.resultLine).toBe(resultLine)
    expect(state.lastActivity).toBe('result received')
  })

  it('salvages complete findings from a partial structured output cut mid-entry', () => {
    const partial = '{"decision": "fail", "summary": "Two bugs.", "findings": ['
      + '{"severity": "P1", "title": "Lost state", "file": "src/a.ts", "line": 3, "explanation": "State is dropped."},'
      + ' {"severity": "P2", "title": "Off-by-'

    const salvage = salvageReviewPartial(partial)

    expect(salvage).not.toBeNull()
    expect(salvage?.decision).toBe('fail')
    expect(salvage?.summary).toBe('Two bugs.')
    expect(salvage?.findings).toEqual([{
      severity: 'P1',
      title: 'Lost state',
      file: 'src/a.ts',
      line: 3,
      explanation: 'State is dropped.',
    }])
  })

  it('returns null salvage for garbage and empty partials', () => {
    expect(salvageReviewPartial('')).toBeNull()
    expect(salvageReviewPartial('exit status 1')).toBeNull()
  })

  it('formats a timeout diagnostic with elapsed time, activity, and non-approval salvage', () => {
    const { state } = feed([
      assistantToolUse('Read', { file_path: 'scripts/a.ts' }),
      structuredOutputStart(0),
      inputJsonDelta(0, '{"decision": "fail", "summary": "One bug.", "findings": ['
        + '{"severity": "P1", "title": "Broken seek", "file": "src/engine/fastReplay.ts", "line": 10, "explanation": "Seek drifts."},'),
    ])

    const lines = formatReviewStreamDiagnostic(state, {
      reason: 'stalled',
      elapsedMs: 9 * 60 * 1_000,
      sinceLastEventMs: 5 * 60 * 1_000,
    })

    expect(lines[0]).toBe(
      'Opus 5 High review stalled after 9.0 min: no stream activity for 5.0 min (3 events, last: emitting structured review output).',
    )
    expect(lines).toContain('Partial review already emitted before failure (diagnostic only, NOT an approval):')
    expect(lines.join('\n')).toContain('[P1] Broken seek - src/engine/fastReplay.ts:10')
    expect(lines.join('\n')).toContain('summary: One bug.')
  })

  it('reports a bare diagnostic when nothing was salvageable', () => {
    const lines = formatReviewStreamDiagnostic(INITIAL_REVIEW_STREAM_STATE, {
      reason: 'timed out',
      elapsedMs: 30 * 60 * 1_000,
      sinceLastEventMs: 30 * 1_000,
    })

    expect(lines).toEqual([
      'Opus 5 High review timed out after 30.0 min: no stream activity for 0.5 min (0 events, last: no output yet).',
    ])
  })

  it('formats salvaged reviews with partial findings dropped rather than invented', () => {
    const salvage = salvageReviewPartial(
      '{"decision": "fail", "summary": "S.", "findings": [{"title": "Named", "file": "a.ts"}, {"severity": "P3"}]}',
    )

    expect(salvage?.findings).toEqual([{ title: 'Named', file: 'a.ts' }])
    expect(formatSalvagedReview(salvage!)).toEqual([
      'Partial review already emitted before failure (diagnostic only, NOT an approval):',
      '  decision: fail',
      '  summary: S.',
      '  [P?] Named - a.ts',
    ])
  })
})
