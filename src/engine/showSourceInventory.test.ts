import { compileShow, type ShowSourceInventoryCategory } from './showCompiler'
import { compileShowForPreview } from './showPreviewArtifact'
import {
  buildDeliveredShowSourceInventory,
  buildShowArtifactInventoryModel,
  type DeliveredShowSourceInventory,
} from './showSourceInventory'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'

describe('Show source inventory', () => {
  it('adds exact delivery provenance without changing generated chunk attribution (#545)', () => {
    const artifact = compileShow({
      clips: [{ id: 'shared', source: 'export function render(index) { rgb(1, 0, 0) }' }],
    }, {})
    const prefix = '// pxlblz:artifact version=1 kind=show\n/* Compiled Show */\n'
    const deliveredSource = `${prefix}${artifact.code}`
    const inventory = buildDeliveredShowSourceInventory(
      artifact.summary.sourceInventory,
      artifact.code,
      deliveredSource,
    )

    expect(inventory.totalBytes).toBe(new TextEncoder().encode(deliveredSource).length)
    expect(inventory.chunks[0]).toMatchObject({
      category: 'provenance',
      label: 'Show provenance and delivery header',
      startByte: 0,
      endByte: new TextEncoder().encode(prefix).length,
    })
    expect(inventory.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)).toBe(inventory.totalBytes)
    expect(inventory.chunks[inventory.chunks.length - 1]?.endByte).toBe(inventory.totalBytes)
  })

  it('groups physical Pattern machines by authored Pattern and ranks actionable contributors (#545)', () => {
    const inventory: DeliveredShowSourceInventory = {
      totalBytes: 305,
      generatedSourceBytes: 295,
      provenanceBytes: 10,
      chunks: [
        { id: 'provenance', category: 'provenance', label: 'Provenance', bytes: 10, startByte: 0, endByte: 10 },
        { id: 'pattern-a', category: 'pattern', label: 'Pattern a', ownerId: 'a', bytes: 100, startByte: 10, endByte: 110 },
        { id: 'pattern-b', category: 'pattern', label: 'Pattern b', ownerId: 'b', bytes: 80, startByte: 110, endByte: 190 },
        { id: 'runtime', category: 'runtime-scheduler', label: 'Runtime', bytes: 50, startByte: 190, endByte: 240 },
        { id: 'effects', category: 'effects-transitions', label: 'Effects', bytes: 40, startByte: 240, endByte: 280 },
        { id: 'score', category: 'score-data', label: 'Score', bytes: 20, startByte: 280, endByte: 300 },
        { id: 'exports', category: 'exports', label: 'Exports', bytes: 5, startByte: 300, endByte: 305 },
      ],
    }
    const model = buildShowArtifactInventoryModel(inventory, {
      patterns: [{
        key: 'stock:red',
        name: 'Red pattern',
        ownerIds: ['a', 'b'],
        logicalInstanceCount: 5,
        authoredReferenceCount: 8,
      }],
    })

    expect(model.rows.find((row) => row.id === 'pattern:stock:red')).toMatchObject({
      label: 'Red pattern',
      bytes: 180,
      percentage: 180 / 305,
      physicalMachineCount: 2,
      logicalInstanceCount: 5,
      authoredReferenceCount: 8,
    })
    expect(model.rows.reduce((sum, row) => sum + row.bytes, 0)).toBe(305)
    expect(model.slimmingTips[0]).toMatchObject({ contributorId: 'pattern:stock:red', currentBytes: 180 })
    expect(model.slimmingTips[0].message).toContain('2 physical machines')
  })

  it('keeps table-driven score and Transition source in stable named categories (#545)', () => {
    const easing = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-easing')!
    const compiled = compileShowForPreview(easing.show, [], undefined, {})
    const inventory = compiled.artifact!.summary.sourceInventory
    const bytesByCategory = inventory.chunks.reduce<Partial<Record<ShowSourceInventoryCategory, number>>>(
      (totals, chunk) => ({
        ...totals,
        [chunk.category]: (totals[chunk.category] ?? 0) + chunk.bytes,
      }),
      {},
    )

    expect(bytesByCategory['score-data']).toBeGreaterThan(0)
    expect(bytesByCategory['effects-transitions']).toBeGreaterThan(0)
    expect(inventory.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)).toBe(inventory.totalBytes)
  })
})
