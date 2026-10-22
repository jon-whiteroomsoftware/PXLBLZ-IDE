import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundle } from '@/engine/bundle'
import { stampArtifact } from '@/engine/artifactStamp'
import { buildPatternEpeExport } from '@/engine/patternEpeExport'
import { parseEpe } from '@/engine/epeImport'
import { createFastReplayRuntime, prepareFastReplay } from '@/engine/fastReplay'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '../patterns'
import { SOURCE_STOCK_MAPS } from '../maps/stockCatalogue'

describe('Cloudburst exported Pattern artifacts (#1200)', () => {
  it.each(['LumaPlane3D', 'TubeRain3D', 'Koi3D'])('%s reopens from its .epe and renders the chandelier', (name) => {
    const artifact = bundle(DEMOS[name], LIBRARIES)
    const source = stampArtifact(artifact.code, { kind: 'pattern', id: name, name, stampedAt: '2026-10-22T00:00:00Z' })
    const exported = buildPatternEpeExport(name, source, { idSeed: name })
    const path = join(mkdtempSync(join(tmpdir(), 'cloudburst-epe-')), exported.filename)
    writeFileSync(path, exported.text)
    const reopened = parseEpe(readFileSync(path, 'utf8'))
    expect(reopened.name).toBe(name)
    expect(reopened.src).toBe(source)
    const runtime = createFastReplayRuntime(prepareFastReplay(reopened.src, LIBRARIES), {
      mapPoints: SOURCE_STOCK_MAPS.find((map) => map.id === 'cloudburst-chandelier')!.resolve(960),
      randomSeed: 823,
      fidelity: 'fast',
    })
    const pixels = runtime.advanceTo(5000, { stepMs: 1000 / 30 }).pixels
    expect(pixels).toHaveLength(960)
    expect(pixels.flat().every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true)
    expect(Math.max(...pixels.flat())).toBeGreaterThan(0.3)
  })
})
