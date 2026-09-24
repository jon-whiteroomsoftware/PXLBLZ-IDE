// #1042 Phase 0: the v2-only baselines stay byte-identical across every v1
// removal slice, and the check that proves it imports no v1 authoring module.
import { readFileSync } from 'node:fs'
import { posix, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkBaselines } from '../../scripts/show-v2-baselines'

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
  'src/engine/showCompositionSplit.ts',
  'src/engine/showClipInvariant.ts',
  'src/engine/showLayerTransitionAuthoring.ts',
  'src/engine/showTimelineAuthoring.ts',
  'src/engine/showTimelineClipAuthoring.ts',
  'src/engine/showLayoutIntervals.ts',
  'src/engine/showCompositionProjection.ts',
  'src/engine/showOverlayLayerAuthoring.ts',
  'src/engine/showClipDeletion.ts',
  'src/engine/showExactClipMove.ts',
  'src/engine/showExactClipResize.ts',
  'src/engine/showExactTimelineMarker.ts',
  'src/engine/showManualClipResize.ts',
]
const FORBIDDEN_DIRECTORIES = ['src/engine/showCommands/']

/** The files this check owns: the baseline script and this test. */
const GUARDED_FILES = ['scripts/show-v2-baselines.ts', 'src/engine/showV2Baselines.test.ts']

const repoRoot = resolve(__dirname, '../..')

/** Repo-relative module paths (extension stripped) a file imports directly. */
function directImports(file: string): string[] {
  const text = readFileSync(resolve(repoRoot, file), 'utf8')
  const specifiers = [...text.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map(match => match[1])
  return specifiers.flatMap(specifier => {
    if (specifier.startsWith('@/')) return [`src/${specifier.slice(2)}`]
    if (specifier.startsWith('.')) return [posix.normalize(relative(repoRoot, resolve(repoRoot, file, '..', specifier)).split('\\').join('/'))]
    return []
  }).map(path => path.replace(/\.(?:[cm]?[jt]sx?)$/, ''))
}

function forbidden(path: string): boolean {
  return FORBIDDEN_MODULES.some(module => module.replace(/\.ts$/, '') === path)
    || FORBIDDEN_DIRECTORIES.some(directory => path.startsWith(directory))
}

describe('#1042 v2 baselines', () => {
  it('imports no v1 authoring module directly', () => {
    const imports = GUARDED_FILES.flatMap(file => directImports(file).map(path => `${file} -> ${path}`))
    // A walk that finds nothing would pass vacuously; the script's compile path must be seen.
    expect(imports).toContain('scripts/show-v2-baselines.ts -> src/engine/showCompositionLoweringV2')
    expect(imports.filter(line => forbidden(line.split(' -> ')[1]))).toEqual([])
  })

  it('the guard recognizes a forbidden import', () => {
    expect(forbidden('src/engine/showClipInvariant')).toBe(true)
    expect(forbidden('src/engine/showCommands/index')).toBe(true)
    expect(forbidden('src/engine/showCommandsV2/index')).toBe(false)
  })

  it('every pinned record still matches the committed baselines', async () => {
    const differences = await checkBaselines()
    expect(differences, differences.join('\n')).toEqual([])
  }, 120_000)
})
