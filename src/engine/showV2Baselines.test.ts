// #1042 Phase 0: the v2-only baselines stay byte-identical across every v1
// removal slice, and the check that proves it imports no v1 authoring module.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { posix, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { checkBaselines, firstDifferentRuntimeFrame, runtimeComparability } from '../../scripts/show-v2-baselines'

/**
 * The v1-only authoring modules #1042 removes (inventory §1), plus the whole v1
 * command catalogue. `src/engine/showCommandsV2/` stays allowed. Only direct
 * imports are banned: the retained compiler path (`showModel.ts`) still reaches
 * some of these transitively, and that is exactly what #1042 refactors while
 * these pins guard its output.
 */
const FORBIDDEN_MODULES = [
  'src/engine/showBoundaryTransitionTimeRepair.ts',
  'src/engine/showClipDeletionBoundaryEligibility.ts',
  'src/engine/showLayoutIntervals.ts',
  'src/engine/showCompositionProjection.ts',
  'src/engine/showOverlayLayerAuthoring.ts',
  'src/engine/showClipDeletion.ts',
  'src/engine/showExactClipMove.ts',
  'src/engine/showExactClipResize.ts',
  'src/engine/showManualClipResize.ts',
]
const FORBIDDEN_DIRECTORIES = ['src/engine/showCommands/']

/** The files this check owns: the baseline script and this test. */
const GUARDED_FILES = ['scripts/show-v2-baselines.ts', 'src/engine/showV2Baselines.test.ts']

const repoRoot = resolve(__dirname, '../..')

/**
 * SHA-256 of the committed baseline set, byte for byte. `--write` would
 * re-baseline silently and the check would still pass, so the files are pinned
 * here too. The set may also change for #1128's schema change (Jon,
 * 2026-09-24); otherwise it is deleted only when #1042 closes, with Jon's say.
 */
const BASELINE_DIR = 'docs/reference/evidence/issue-1042-v2-baselines'
const committedBaselines = JSON.parse(readFileSync(resolve(repoRoot, BASELINE_DIR, 'baselines.json'), 'utf8')) as { generator: { nodeMajor: number } }
const comparable = runtimeComparability(committedBaselines.generator.nodeMajor, process.versions.node).comparable
const PINNED_DIGESTS: Record<string, string> = {
  'baselines.json': '442750047c5a68cbc1de6e477b7318fdd218100c3bd427b943ea851aeb6e74fa',
  'runtime-frames.json': 'e3023892912eb421b4b887cdcb85bd4edb28069e90dd5007eb17e3eb8afe0e72',
  'fixtures/animation.json': '5fe5e38c50a73ca5ff25305a93063a3f50f673d676c5f78bd38de1b51eb2c5e7',
  'fixtures/groups.json': 'be4db1bb8ba11efba0f1864642c32ffcfee22aabc8de2415a7c839ff6a15e505',
  'fixtures/long-timeline.json': '31ae99370a863d0c9d0afb341ca94c74a6352c49c0b1ea42ee4831a91dbb262d',
  'fixtures/personal-base.json': 'ff551c3e7554c628e564a30dd1751de69bd31551339df297c88b9daccdda5016',
  'fixtures/personal-library-pattern.json': '1ce5f7afa69cc17183ec9442db68007ab5646a9992c0ff64f8a413e6c41ef8fd',
  'fixtures/routing.json': '9a24ba1e7a872518358c930ac93c68549e7518795bf12802d664ce90c6c5523e',
  'fixtures/stock-draft.json': '748fe7d6dbf8b33e50339a2e772721c6e25ceb1c9bd84509281a5dfd088a4503',
}

/**
 * Repo-relative module paths that `text`, read as `file`, imports directly,
 * with the extension, a trailing slash and a trailing `/index` stripped. The
 * TypeScript scanner reports static, type-only, side-effect, re-export and
 * literal dynamic imports, and skips strings and comments.
 */
function importedPaths(text: string, file: string): string[] {
  const specifiers = ts.preProcessFile(text, true, true).importedFiles.map(reference => reference.fileName)
  return specifiers.flatMap(specifier => {
    if (specifier.startsWith('@/')) return [`src/${specifier.slice(2)}`]
    if (specifier.startsWith('src/')) return [specifier]
    if (specifier.startsWith('.')) return [relative(repoRoot, resolve(repoRoot, file, '..', specifier)).split('\\').join('/')]
    return []
  }).map(path => posix.normalize(path).replace(/\/+$/, '').replace(/\.(?:[cm]?[jt]sx?)$/, '').replace(/\/index$/, ''))
}

function directImports(file: string): string[] {
  return importedPaths(readFileSync(resolve(repoRoot, file), 'utf8'), file)
}

function forbidden(path: string): boolean {
  return FORBIDDEN_MODULES.some(module => module.replace(/\.ts$/, '') === path)
    || FORBIDDEN_DIRECTORIES.some(directory => path === directory.replace(/\/$/, '') || path.startsWith(directory))
}

/** The forbidden paths a synthetic source, read as a file in `src/engine/`, imports. */
function flagged(source: string): string[] {
  return importedPaths(source, 'src/engine/synthetic.ts').filter(forbidden)
}

describe('#1042 v2 baselines', () => {
  it('imports no v1 authoring module directly', () => {
    const imports = GUARDED_FILES.flatMap(file => directImports(file).map(path => `${file} -> ${path}`))
    // A walk that finds nothing would pass vacuously; the script's compile path must be seen.
    expect(imports).toContain('scripts/show-v2-baselines.ts -> src/engine/showCompositionLoweringV2')
    expect(imports.filter(line => forbidden(line.split(' -> ')[1]))).toEqual([])
  })

  it('the guard recognizes a forbidden import', () => {
    expect(forbidden('src/engine/showCommands')).toBe(true)
    expect(forbidden('src/engine/showCommands/catalog')).toBe(true)
    expect(forbidden('src/engine/showCommandsV2')).toBe(false)
  })

  it.each([
    ['an alias directory import', "import { c } from '@/engine/showCommands'", 'src/engine/showCommands'],
    ['an alias directory index import', "import { c } from '@/engine/showCommands/index'", 'src/engine/showCommands'],
    ['a root-relative directory import', "import { c } from 'src/engine/showCommands'", 'src/engine/showCommands'],
    ['a relative directory import', "import { c } from './showCommands'", 'src/engine/showCommands'],
    ['a relative directory import with a slash', "import { c } from './showCommands/'", 'src/engine/showCommands'],
    ['a relative directory index import', "import { c } from '../engine/showCommands/index.ts'", 'src/engine/showCommands'],
    ['a directory submodule import', "import { c } from './showCommands/catalog'", 'src/engine/showCommands/catalog'],
    ['a dynamic directory import', "void import('@/engine/showCommands')", 'src/engine/showCommands'],
    ['a dynamic import with attributes', "void import('./showCommands', { with: { type: 'json' } })", 'src/engine/showCommands'],
    ['a type-only directory import', "import type { X } from '@/engine/showCommands'", 'src/engine/showCommands'],
  ])('the guard flags %s', (_form, source, path) => {
    expect(flagged(source)).toEqual([path])
  })

  it.each([
    ['the v2 catalogue', "import { c } from '@/engine/showCommandsV2'"],
    ['the v2 catalogue index', "import { c } from './showCommandsV2/index'"],
    ['a v2 dynamic import', "void import('./showCommandsV2')"],
    ['a package', "import { describe } from 'vitest'"],
  ])('the guard allows %s', (_form, source) => {
    expect(flagged(source)).toEqual([])
  })

  it('the committed baselines still hash to their pinned digests', () => {
    const fixtures = readdirSync(resolve(repoRoot, BASELINE_DIR, 'fixtures')).filter(name => name.endsWith('.json')).sort()
    const files = ['baselines.json', 'runtime-frames.json', ...fixtures.map(name => `fixtures/${name}`)]
    const digests = Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(resolve(repoRoot, BASELINE_DIR, file))).digest('hex')]))
    expect(digests).toEqual(PINNED_DIGESTS)
  })

  it('every pinned record still matches the committed baselines, runtime aside', async () => {
    const { differences } = await checkBaselines({ nodeVersion: `${committedBaselines.generator.nodeMajor + 1}.0.0` })
    expect(differences, differences.join('\n')).toEqual([])
  }, 120_000)

  it.skipIf(!comparable)("the runtime frames match on the generator's Node major (#1128)", async () => {
    const { differences, runtime } = await checkBaselines()
    expect(runtime).toEqual({ comparable: true })
    expect(differences, differences.join('\n')).toEqual([])
  }, 120_000)

  it('compares runtime only on the generator Node major', () => {
    expect(runtimeComparability(24, '24.14.0')).toEqual({ comparable: true })
    expect(runtimeComparability(24, '22.23.3')).toEqual({
      comparable: false,
      reason: 'runtime frames not compared: generated on Node 24, running Node 22',
    })
  })

  it('names the first changed sample and pixel value', () => {
    expect(firstDifferentRuntimeFrame(
      'stock:sample',
      { sampledMs: [0, 250], frames: [[0, 2], [3, 4]] },
      { sampledMs: [0, 250], frames: [[-0, 2], [3, 4.25]] },
    )).toBe('stock:sample runtime frame at 250 ms, value 1: committed 4, now 4.25 (|Δ| 0.25)')
    expect(firstDifferentRuntimeFrame(
      'stock:sample',
      { sampledMs: [0], frames: [[null as unknown as number]] },
      { sampledMs: [0], frames: [[NaN]] },
    )).toBeUndefined()
    expect(firstDifferentRuntimeFrame(
      'stock:sample',
      { sampledMs: [0, 250], frames: [[1, 2], [3, 4]] },
      { sampledMs: [0, 250], frames: [[1, 2], [3, 4.25]] },
    )).toBe('stock:sample runtime frame at 250 ms, value 1: committed 4, now 4.25 (|Δ| 0.25)')
  })
})
