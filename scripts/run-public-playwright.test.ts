import { describe, expect, it } from 'vitest'
import type { RuntimeAssignment } from './dev-runtime-core'
import {
  publicPlaywrightEnvironment,
  verifyServedIdentity,
} from './run-public-playwright'

const assignment: RuntimeAssignment = {
  issue: 'playwright-public-123',
  description: 'public Playwright',
  worktree: '/tmp/worktree',
  branch: 'issue-746-public-e2e-candidate',
  profile: 'shared',
  uiPort: 5183,
  apiPort: 8788,
  apiTarget: 'http://localhost:8788',
  userId: 'github:local-agent-01',
  createdAt: '2026-08-07T18:00:00.000Z',
  updatedAt: '2026-08-07T18:00:00.000Z',
}

describe('public Playwright runtime', () => {
  it('binds the suite and its candidate-owned server to the reserved assignment', () => {
    expect(publicPlaywrightEnvironment(assignment, '/PXLBLZ-IDE/')).toEqual({
      PLAYWRIGHT_PUBLIC_VITE_PORT: '5183',
      PLAYWRIGHT_PUBLIC_API_PROXY_TARGET: 'http://localhost:8788',
      PLAYWRIGHT_STUDIO_URL: 'http://localhost:5183/PXLBLZ-IDE/',
      VITE_BASE_PATH: '/PXLBLZ-IDE/',
    })
  })

  it('derives the Studio URL and served base from the manifest base path', () => {
    expect(publicPlaywrightEnvironment(assignment, '/other-base/')).toMatchObject({
      PLAYWRIGHT_STUDIO_URL: 'http://localhost:5183/other-base/',
      VITE_BASE_PATH: '/other-base/',
    })
  })
})

describe('served identity verification', () => {
  const identity = (path: string) => ({
    project: 'pxlblz-ide',
    worktree: path,
    commit: 'abc1234',
  })

  it('accepts the candidate worktree and returns the served identity', () => {
    expect(verifyServedIdentity(identity('/real/candidate'), '/real/candidate', (p) => p))
      .toEqual({ worktree: '/real/candidate', commit: 'abc1234' })
  })

  it('compares canonical paths so symlinked invocations still match', () => {
    const canonicalize = (path: string) => path.replace('/link/', '/real/')
    expect(verifyServedIdentity(identity('/real/candidate'), '/link/candidate', canonicalize))
      .toEqual({ worktree: '/real/candidate', commit: 'abc1234' })
  })

  it('rejects a served worktree that is not the candidate, naming both paths', () => {
    expect(() => verifyServedIdentity(identity('/real/main'), '/real/candidate', (p) => p))
      .toThrow(/serves \/real\/main[\s\S]*\/real\/candidate/)
  })

  it('rejects a malformed identity payload instead of assuming a match', () => {
    for (const payload of [null, 'ok', {}, { worktree: 42 }, { worktree: '' }]) {
      expect(() => verifyServedIdentity(payload, '/real/candidate', (p) => p))
        .toThrow(/identity/i)
    }
  })

  it('normalizes a missing commit to null', () => {
    expect(verifyServedIdentity({ worktree: '/real/candidate' }, '/real/candidate', (p) => p))
      .toEqual({ worktree: '/real/candidate', commit: null })
  })

  it('propagates canonicalization failures so an unresolvable path fails closed', () => {
    const canonicalize = () => { throw new Error('ENOENT: no such file or directory') }
    expect(() => verifyServedIdentity(identity('/gone'), '/real/candidate', canonicalize))
      .toThrow(/ENOENT/)
  })
})
