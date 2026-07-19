import { describe, expect, it } from 'vitest'
import { GALLERY_PATTERNS } from './galleryCatalog'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { stockPatternOrganization, stockShowOrganization } from './stockEntityOrganization'

describe('built-in entity organization', () => {
  it('gives every built-in Pattern exactly one curated folder location', () => {
    const organization = stockPatternOrganization(GALLERY_PATTERNS)
    const ids = collectEntityIds(organization.nodes)

    expect(ids).toHaveLength(GALLERY_PATTERNS.length)
    expect(new Set(ids).size).toBe(GALLERY_PATTERNS.length)
    expect(organization.nodes.map((node) => node.kind === 'folder' ? node.name : '')).toContain('FPS Friendly')
  })

  it('organizes built-in Shows into Learn and Showcases subtrees', () => {
    const organization = stockShowOrganization(STOCK_SHOWS)

    expect(organization.nodes).toMatchObject([
      { kind: 'folder', name: 'Learn', children: [{ kind: 'folder', name: '100' }, { kind: 'folder', name: '200' }] },
      { kind: 'folder', name: 'Showcases', children: [
        { kind: 'folder', name: 'Effects' },
        { kind: 'folder', name: 'Transitions & animation' },
        { kind: 'folder', name: 'Installations' },
      ] },
    ])
    expect(new Set(collectEntityIds(organization.nodes)).size).toBe(STOCK_SHOWS.length)
  })
})

function collectEntityIds(nodes: readonly import('./entityOrganization').EntityOrganizationNode[]): string[] {
  return nodes.flatMap((node) => node.kind === 'entity' ? [node.entityId] : collectEntityIds(node.children))
}
