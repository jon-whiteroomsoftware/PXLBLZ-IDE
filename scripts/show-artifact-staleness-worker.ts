import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { STOCK_SHOWS_V2 } from '../src/pixelblaze/stock/showsV2'
import { compileStockShowV2 } from '../test/perf-harness/showV2Fixture'
import { exportShowV2ForDelivery } from '../src/engine/showV2ControllerDelivery'
import { parseEpe } from '../src/engine/epeImport'
import { reportShowArtifactSourceStaleness, type ShowArtifactEvidenceSource } from '../src/engine/showArtifactEvidence'

export function buildShowArtifactStalenessReport() {
  const evidencePath = 'docs/reference/evidence/issue-1215-bytecode-measurement.json'
  const evidence = JSON.parse(readFileSync(
    new URL('../docs/reference/evidence/issue-1215-bytecode-measurement.json', import.meta.url),
    'utf8',
  )) as {
    gate1: { firmware: string; compiler: { sha256: string } }
    refresh: { compilerSha256: string }
    rows: ShowArtifactEvidenceSource[]
  }
  const current = STOCK_SHOWS_V2.map((record) => {
    const artifact = compileStockShowV2(record.id, {})
    const exported = exportShowV2ForDelivery(record, { artifact }, [])
    if (!exported) throw new Error(`Show artifact staleness export refused: ${record.id}`)
    const source = parseEpe(exported.text).src
    return {
      id: record.id,
      name: record.name,
      sourceSha256: createHash('sha256').update(source, 'utf8').digest('hex'),
    }
  })
  return {
    evidencePath,
    gate1: { firmware: evidence.gate1.firmware, compiler: { sha256: evidence.gate1.compiler.sha256 } },
    refresh: { compilerSha256: evidence.refresh.compilerSha256 },
    ...reportShowArtifactSourceStaleness(evidence.rows, current),
  }
}
