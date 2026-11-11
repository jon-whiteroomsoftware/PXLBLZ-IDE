import { describe, expect, it } from 'vitest'
import path from 'node:path'
import config, { agentRuntimeExclusions } from '../vite.config'

describe('agent runtime watcher and scan isolation', () => {
  it.each(['/tmp/worktrees/issue-1262', '/tmp/main/.claude/worktrees/issue-1262'])(
    'anchors exclusions inside %s and preserves its app source', (root) => {
      const { watchIgnored, scanEntries } = agentRuntimeExclusions(root)
      for (const directory of ['.claude', '.wrsp', '.agents', '.codex']) {
        expect(watchIgnored.test(path.join(root, directory))).toBe(true)
        expect(watchIgnored.test(path.join(root, directory, 'worktrees/x/tsconfig.json'))).toBe(true)
        expect(scanEntries).toContain(`!${directory}/**`)
      }
      expect(watchIgnored.test(path.join(root, 'src/main.tsx'))).toBe(false)
      expect(watchIgnored.test(path.join(root, 'tsconfig.json'))).toBe(false)
      expect(watchIgnored.test(path.join(root, '.claude-other/source.ts'))).toBe(false)
      expect(scanEntries).toContain('**/*.html')
      expect(scanEntries.some((entry) => entry.includes('src'))).toBe(false)
      expect(scanEntries).toContain('!**/__tests__/**')
      expect(scanEntries).toContain('!**/coverage/**')
    },
  )

  it('installs the exclusions in the effective dev configuration', async () => {
    if (typeof config !== 'function') throw new Error('Expected Vite config function')
    const effective = await config({ command: 'serve', mode: 'test' })
    const exclusions = agentRuntimeExclusions(process.cwd())
    expect(effective.server?.watch).toMatchObject({ ignored: exclusions.watchIgnored })
    expect(effective.optimizeDeps?.entries).toEqual(exclusions.scanEntries)
  })
})
