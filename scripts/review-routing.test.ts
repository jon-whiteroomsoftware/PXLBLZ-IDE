import { describe, expect, it } from 'vitest'
import {
  classifyModelFamily,
  crossFamilyCoverage,
  parseAuthorshipLog,
  parseCommitAuthorship,
  REVIEWER_FAMILY,
  routeReview,
  type CommitAuthorship,
} from './review-routing'

function commit(family: 'anthropic' | 'openai' | null, model: string | null = null): CommitAuthorship {
  return { sha: 'a'.repeat(40), model, family }
}

describe('cross-family review routing (#637)', () => {
  it('classifies model families from identifiers used by both harnesses', () => {
    expect(classifyModelFamily('claude-fable-5')).toBe('anthropic')
    expect(classifyModelFamily('Claude Opus 5')).toBe('anthropic')
    expect(classifyModelFamily('claude-sonnet-5')).toBe('anthropic')
    expect(classifyModelFamily('gpt-5.6-sol')).toBe('openai')
    expect(classifyModelFamily('codex-mini')).toBe('openai')
    expect(classifyModelFamily('o3-pro')).toBe('openai')
    expect(classifyModelFamily('Jon Chester')).toBeNull()
    expect(classifyModelFamily('')).toBeNull()
  })

  it('prefers the explicit X-Authored-Model trailer over Co-Authored-By', () => {
    expect(parseCommitAuthorship('b'.repeat(40), [
      'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
      'X-Authored-Model: gpt-5.6-sol',
    ].join('\n'))).toEqual({
      sha: 'b'.repeat(40),
      model: 'gpt-5.6-sol',
      family: 'openai',
    })
  })

  it('falls back to a model-classifiable Co-Authored-By and ignores human co-authors', () => {
    expect(parseCommitAuthorship('c'.repeat(40), [
      'Co-Authored-By: Jane Doe <jane@example.com>',
      'Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>',
    ].join('\n'))).toEqual({
      sha: 'c'.repeat(40),
      model: 'Claude Fable 5',
      family: 'anthropic',
    })
    expect(parseCommitAuthorship('d'.repeat(40), 'Co-Authored-By: Jane Doe <jane@example.com>')).toEqual({
      sha: 'd'.repeat(40),
      model: null,
      family: null,
    })
    expect(parseCommitAuthorship('e'.repeat(40), '')).toEqual({
      sha: 'e'.repeat(40),
      model: null,
      family: null,
    })
  })

  it('parses the unit-separated authorship log emitted by git', () => {
    const raw = [
      `${'a'.repeat(40)}\x1fX-Authored-Model: claude-fable-5\n\x1e`,
      `${'b'.repeat(40)}\x1f\x1e`,
      '\n',
    ].join('')

    expect(parseAuthorshipLog(raw)).toEqual([
      { sha: 'a'.repeat(40), model: 'claude-fable-5', family: 'anthropic' },
      { sha: 'b'.repeat(40), model: null, family: null },
    ])
  })

  it('routes each single-family range to the counterpart family first', () => {
    expect(routeReview([commit('anthropic', 'claude-fable-5')])).toMatchObject({
      primary: 'GPT-5.6 High',
      fallback: 'Opus 5 High',
      authoredModels: ['claude-fable-5'],
    })
    expect(routeReview([commit('openai', 'gpt-5.6-sol')])).toMatchObject({
      primary: 'Opus 5 High',
      fallback: 'GPT-5.6 High',
      authoredModels: ['gpt-5.6-sol'],
    })
  })

  it('defaults unsignalled and mixed ranges to Opus with GPT fallback', () => {
    expect(routeReview([commit(null)])).toMatchObject({
      primary: 'Opus 5 High',
      fallback: 'GPT-5.6 High',
      authoredModels: [],
    })
    const mixed = routeReview([
      commit('anthropic', 'claude-fable-5'),
      commit('openai', 'gpt-5.6-sol'),
    ])
    expect(mixed).toMatchObject({ primary: 'Opus 5 High', fallback: 'GPT-5.6 High' })
    expect(mixed.reason).toMatch(/mixed/i)
    expect(mixed.authoredModels).toEqual(['claude-fable-5', 'gpt-5.6-sol'])
  })

  it('deduplicates authored models and treats unknown-plus-known as the known family', () => {
    const routing = routeReview([
      commit('anthropic', 'claude-fable-5'),
      commit('anthropic', 'claude-fable-5'),
      commit(null),
    ])
    expect(routing.primary).toBe('GPT-5.6 High')
    expect(routing.authoredModels).toEqual(['claude-fable-5'])
  })

  it('reports cross-family coverage only when every commit is signalled', () => {
    const anthropic = [commit('anthropic', 'claude-fable-5')]
    expect(crossFamilyCoverage(anthropic, 'GPT-5.6 High')).toBe(true)
    expect(crossFamilyCoverage(anthropic, 'Opus 5 High')).toBe(false)
    expect(crossFamilyCoverage([commit(null)], 'Opus 5 High')).toBeUndefined()
    expect(crossFamilyCoverage([
      commit('anthropic', 'claude-fable-5'),
      commit('openai', 'gpt-5.6-sol'),
    ], 'Opus 5 High')).toBe(false)
  })

  it('never claims cross-family coverage for a partially unsignalled range (#637 P2)', () => {
    const partial = [commit('anthropic', 'claude-fable-5'), commit(null)]
    expect(crossFamilyCoverage(partial, 'GPT-5.6 High')).toBeUndefined()
    expect(crossFamilyCoverage(partial, 'Opus 5 High')).toBe(false)
  })

  it('always routes primary and fallback to different reviewers', () => {
    const cases: CommitAuthorship[][] = [
      [commit('anthropic')],
      [commit('openai')],
      [commit(null)],
      [commit('anthropic'), commit('openai')],
    ]
    for (const commits of cases) {
      const routing = routeReview(commits)
      expect(routing.primary).not.toBe(routing.fallback)
      expect(REVIEWER_FAMILY[routing.primary]).toBeDefined()
      expect(REVIEWER_FAMILY[routing.fallback]).toBeDefined()
    }
  })
})
