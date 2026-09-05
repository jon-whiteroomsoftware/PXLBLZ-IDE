/**
 * Exported-artifact oracle for the `.epe` deliverable (#940).
 *
 * The exporter mirrors ShowEditor's download path: compile the Show for its
 * artifact, then stamp it with `buildShowEpeExport` (a fixed preview string
 * stands in for the canvas-rendered JPEG, which is the only browser-bound
 * input). The importer is PatternList's `.epe` file input: `parseEpe`, whose
 * banner parse drives preferred-map resolution. Every assertion runs against
 * the file reopened from disk.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runArtifactOracle } from '@whiteroom/software-process/artifact-oracle'
import { resolveArtifactPreferredMap } from './artifactMapCompatibility'
import { artifactHash } from './artifactStamp'
import { parseEpe } from './epeImport'
import { extractPatternAuthors } from './patternAttribution'
import type { MapRecord, PatternRecord } from './personalContentRecords'
import { buildShowEpeExport } from './showEpeExport'
import { createDefaultShow } from './showModel'
import { createInstallationShowOutputContract } from './showOutputContract'
import { compileShowForArtifact } from './showPreviewArtifact'

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

describe('exported .epe reopened by the Pattern importer (#940)', () => {
  it('carries the compiled Show, its banner metadata, and its Pattern credits', async () => {
    const show = authoredShow()
    const compiled = compileShowForArtifact(show, [authoredPattern], undefined, {})
    expect(compiled.error).toBeNull()
    const artifact = compiled.artifact!
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-show-epe-'))

    const report = await runArtifactOracle({
      name: 'show-epe',
      exportArtifact: () => {
        const exported = buildShowEpeExport(show, artifact.code, {
          id: 'pxb940oracle00000',
          preview: '',
          stampedAt: new Date(show.updatedAt),
          userMaps: [authoredMap],
          attribution: artifact.attribution,
        })
        const path = join(directory, exported.filename)
        writeFileSync(path, exported.text)
        return path
      },
      assert: (bytes, path) => {
        expect(path.endsWith('/voltage-bloom.epe')).toBe(true)

        const reopened = parseEpe(bytes.toString('utf8'))
        expect(reopened.name).toBe('Voltage Bloom')
        expect(reopened.stamp).toMatchObject({
          version: 1,
          kind: 'show',
          id: 'show-voltage-bloom',
          name: 'Voltage Bloom',
          transforms: ['show'],
          preferredMap: { kind: 'custom', name: 'Warehouse Grid' },
          showOutputContract: { kind: 'installation', pixelCount: 60 },
        })
        // The banner hash is a checksum over the reopened body, so a file
        // edited after export no longer verifies.
        expect(reopened.stamp!.hash).toBe(artifactHash(reopened.src))
        expect(readFileSync(path, 'utf8')).toBe(bytes.toString('utf8'))

        // Authored semantics visible in the exported source: the Show name,
        // both Pattern references with the recorded author credit, and the
        // authored colour literal inside the lowered member.
        expect(reopened.src).toContain(' * Compiled PXLBLZ Show: Voltage Bloom')
        expect(reopened.src).toContain(
          ' * - Voltage Squiggles by Pattern Author [user:pattern-voltage-squiggles]',
        )
        expect(reopened.src).toContain('[stock:CometLoom]')
        expect(reopened.src).toContain(' * Preferred map: Warehouse Grid')
        expect(reopened.src).toContain('0.85, 0.6')
        expect(reopened.src).toMatch(/export function render\b/)

        // What PatternList does next with the reopened file: credit
        // extraction for the imported record (the compiled Show's own credit
        // plus the authored Pattern's author carried through the banner) and
        // preferred-map resolution against a library holding the authored
        // custom Map.
        expect(extractPatternAuthors(reopened.src)).toEqual([
          'PXLBLZ <pxlblz@whiteroomsoftware.com>',
          'Pattern Author',
        ])
        expect(resolveArtifactPreferredMap(reopened.stamp, [authoredMap])).toMatchObject({
          status: 'resolved',
          mapId: authoredMap.id,
        })
        expect(resolveArtifactPreferredMap(reopened.stamp, [])).toMatchObject({ status: 'missing' })
      },
    })

    expect(report.name).toBe('show-epe')
    expect(report.bytes).toBeGreaterThan(0)
    expect(report.sha256).toMatch(/^[a-f0-9]{64}$/)
  })
})
