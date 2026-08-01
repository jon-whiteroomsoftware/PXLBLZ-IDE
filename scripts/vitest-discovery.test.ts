import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Vitest discovery boundaries', () => {
  it('ignores tests below nested worktrees and node_modules directories', () => {
    const workspaceRoot = process.cwd()
    const nestedRoot = mkdtempSync(path.join(tmpdir(), 'pxlblz-vitest-discovery-'))
    const ordinaryTest = path.join(nestedRoot, 'src', 'ordinary.test.ts')
    const worktreeTest = path.join(nestedRoot, 'tool', 'worktrees', 'candidate', 'src', 'leak.test.ts')
    const dependencyTest = path.join(nestedRoot, 'vendor', 'node_modules', 'package', 'leak.test.ts')
    const candidates = [ordinaryTest, worktreeTest, dependencyTest]

    try {
      for (const candidate of candidates) {
        mkdirSync(path.dirname(candidate), { recursive: true })
        writeFileSync(candidate, "import { it } from 'vitest'\nit('sentinel test', () => {})\n")
      }

      const output = execFileSync(
        process.execPath,
        [
          path.join(workspaceRoot, 'node_modules', 'vitest', 'vitest.mjs'),
          'list',
          '--root',
          nestedRoot,
          '--config',
          path.join(workspaceRoot, 'vite.config.ts'),
          ...candidates.map((candidate) => path.relative(nestedRoot, candidate)),
        ],
        { cwd: nestedRoot, encoding: 'utf8' },
      )

      expect(output).toContain('src/ordinary.test.ts > sentinel test')
      expect(output).not.toContain('tool/worktrees/candidate/src/leak.test.ts')
      expect(output).not.toContain('vendor/node_modules/package/leak.test.ts')
    } finally {
      rmSync(nestedRoot, { recursive: true, force: true })
    }
  })
})
