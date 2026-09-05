/**
 * Exported-artifact oracle for the `.pxlshow` deliverable (#940).
 *
 * The exporter is the same pair of entrypoints ShowEditor's "Export Show file"
 * action calls; the importer is the same pair PatternList's `.pxlshow` file
 * input calls. Every assertion runs against the file reopened from disk, never
 * against the bundle object the exporter produced. `runArtifactOracle` prints
 * the one `WRSP-ARTIFACT-ORACLE` report line `wrsp-check-artifact-oracle`
 * validates (name, byte count, sha256) for the deliverable configured in
 * `wrsp.config.mjs`.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runArtifactOracle } from '@whiteroom/software-process/artifact-oracle'
import type { MapRecord, PatternRecord } from './personalContentRecords'
import { createDefaultShow } from './showModel'
import { createInstallationShowOutputContract } from './showOutputContract'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import { applyShowImportPlan, planShowImport } from './showImportPlan'

const authoredPattern: PatternRecord = {
  id: 'pattern-voltage-squiggles',
  name: 'Voltage Squiggles',
  src: '// Author: Pattern Author\nexport function render(index) { hsv(index / pixelCount, 0.85, 0.6) }',
  controls: { speed: 0.5 },
  authors: ['Pattern Author'],
  updatedAt: 50,
}

const authoredMap: MapRecord = {
  id: 'map-warehouse-grid',
  name: 'Warehouse Grid',
  dim: 2,
  generator: 'custom',
  params: {},
  points: [[0, 0], [1, 0], [0, 1], [1, 1]],
  source: 'function (pixelCount) { return [[0, 0], [1, 0], [0, 1], [1, 1]] }',
  updatedAt: 60,
}

const exportedAt = '2026-09-04T00:00:00.000Z'

function authoredShow() {
  const show = createDefaultShow('show-voltage-bloom', 'Voltage Bloom', 100)
  show.cells[0] = {
    ...show.cells[0],
    pattern: { kind: 'user', id: authoredPattern.id },
    patternName: authoredPattern.name,
  }
  show.stageMapId = authoredMap.id
  show.outputContract = createInstallationShowOutputContract({
    outputMapId: authoredMap.id,
    pixelCount: show.zones[0].nominalPixelCount,
  })
  return show
}

describe('exported .pxlshow reopened by the Show importer (#940)', () => {
  it('preserves the authored Show, its embedded user Pattern, and its custom Map', async () => {
    const show = authoredShow()
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-show-export-'))

    const report = await runArtifactOracle({
      name: 'show-pxlshow',
      exportArtifact: async () => {
        const { filename, bundle } = buildShowFileBundle(
          show,
          { patterns: [authoredPattern], maps: [authoredMap] },
          { appVersion: '1.9.0-oracle', exportedAt },
        )
        const path = join(directory, filename)
        writeFileSync(path, await serializeShowFileBundle(bundle))
        return path
      },
      assert: async (bytes, path) => {
        expect(path.endsWith('/voltage-bloom.pxlshow')).toBe(true)
        expect([...bytes.subarray(0, 2)]).toEqual([0x1f, 0x8b])

        const reopened = await parseShowFileBundle(new Uint8Array(readFileSync(path)))
        expect(reopened.version).toBe(1)
        expect(reopened.show.name).toBe('Voltage Bloom')
        expect(reopened.provenance).toEqual({
          appVersion: '1.9.0-oracle',
          exportedAt,
          originalShowId: 'show-voltage-bloom',
        })
        // Dependency content travels inside the file, byte for byte.
        expect(reopened.patterns).toEqual([authoredPattern])
        expect(reopened.maps).toEqual([authoredMap])

        const plan = planShowImport(
          reopened,
          { patterns: [], maps: [], showNames: [] },
          { createId: () => 'show-imported', now: 200 },
        )
        expect(plan.show).toEqual({ id: 'show-imported', name: 'Voltage Bloom' })
        expect(plan.patterns).toEqual({
          builtIn: [{ id: 'CometLoom', name: 'CometLoom' }],
          reused: [],
          added: [{ id: authoredPattern.id, name: authoredPattern.name }],
          copied: [],
        })
        expect(plan.maps).toEqual({
          reused: [],
          added: [{ id: authoredMap.id, name: authoredMap.name }],
          copied: [],
        })

        const applied = applyShowImportPlan(plan)
        expect(applied.newPatterns).toEqual([{ ...authoredPattern, updatedAt: 200 }])
        expect(applied.newMaps).toEqual([{ ...authoredMap, updatedAt: 200 }])
        expect(applied.show.cells.map((cell) => [cell.pattern, cell.patternName])).toEqual([
          [{ kind: 'user', id: authoredPattern.id }, authoredPattern.name],
          [{ kind: 'stock', id: 'CometLoom' }, 'CometLoom'],
        ])
        expect(applied.show.stageMapId).toBe(authoredMap.id)
        expect(applied.show.outputContract).toEqual(show.outputContract)
        expect(applied.show.scenes).toEqual(show.scenes)
        expect(applied.show.transitions).toEqual(show.transitions)
        expect(applied.show.importMetadata).toEqual({
          kind: 'show-file',
          originalShowId: 'show-voltage-bloom',
          appVersion: '1.9.0-oracle',
          exportedAt,
          importedAt: 200,
        })
      },
    })

    expect(report.name).toBe('show-pxlshow')
    expect(report.bytes).toBeGreaterThan(0)
    expect(report.sha256).toMatch(/^[a-f0-9]{64}$/)
  })
})
