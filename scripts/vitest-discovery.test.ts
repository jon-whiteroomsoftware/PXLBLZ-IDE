import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createVitestTestProjects } from '../vite.config.js'
import { assertVitestProjectIdentity } from './vitest-project-identity.js'

describe('Vitest project identity', () => {
  it.each(['browser', 'browsers', 'chromium-ui'])(
    'rejects browser-oriented name %s when Browser Mode is disabled',
    (name) => {
      expect(() => assertVitestProjectIdentity([{
        test: {
          name,
          environment: 'jsdom',
        },
      }])).toThrow(/browser.*Browser Mode/i)
    },
  )

  it('accepts jsdom identity and a later real Chromium project', () => {
    expect(() => assertVitestProjectIdentity([
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'chromium',
          browser: { enabled: true },
        },
      },
    ])).not.toThrow()
  })
})

describe('Vitest discovery boundaries', () => {
  it('routes opt-in layout tests only through the Chromium Browser Mode project', () => {
    const projects = createVitestTestProjects()
    const layout = projects.find((project) => project.test.name === 'chromium-layout')
    const emulated = projects.filter((project) => project.test.name !== 'chromium-layout')

    expect(layout?.test).toMatchObject({
      include: ['**/*.layout.test.ts', '**/*.layout.test.tsx'],
      setupFiles: ['./src/test/layout.setup.ts'],
      browser: {
        enabled: true,
        headless: true,
        instances: [{ browser: 'chromium' }],
      },
    })
    expect(emulated).toHaveLength(2)
    expect(emulated.every((project) => (
      project.test.exclude.includes('**/*.layout.test.ts')
      && project.test.exclude.includes('**/*.layout.test.tsx')
    ))).toBe(true)
  })

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
