import { describe, expect, it } from 'vitest'
import { DEMO_SECTIONS, GALLERY_PATTERNS, ZRANGER1_DEMOS } from './galleryCatalog'
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

  it('orders built-in Pattern folders by the declared section order, not first encounter', () => {
    const organization = stockPatternOrganization(GALLERY_PATTERNS)
    const folderNames = organization.nodes.flatMap((node) => node.kind === 'folder' ? [node.name] : [])

    expect(folderNames).toEqual(DEMO_SECTIONS.map((section) => section.label).filter((label) => folderNames.includes(label)))
  })

  it('keeps the popularity-ranked ZRanger1 collection together', () => {
    const organization = stockPatternOrganization(GALLERY_PATTERNS)
    const folder = organization.nodes.find((node) => node.kind === 'folder' && node.name === 'ZRanger1')

    expect(folder).toMatchObject({
      kind: 'folder',
      children: ZRANGER1_DEMOS.map((entityId) => ({ kind: 'entity', entityId })),
    })
    expect(ZRANGER1_DEMOS).toEqual([
      'Oasis',
      'LineDancer2D',
      'CoronalMassEjection',
      'PerlinKaleidoscope2D',
      'VoronoiMix2D',
      'DoomFireV20_2D',
      'Bouncer3D',
      'RealWorldLights',
      'WavyBands',
      'PerlinFireWindTunnel',
      'IceFloes2D',
      'Stacker',
      'FastPaletteBlending',
      'MultisegmentDemo',
      'Mandelbrot2D',
      'Newfire',
      'BlueHolidayCandle2D',
      'Stairmaster2D',
      'AllLasersFire',
      'DoomFire',
      'CrawlingSpider2D',
      'BubbleColumn',
      'Raindrops2D',
      'TunnelOfSquares2D',
      'InfinityFlower2D',
      'GeometryMorphingDemo2D',
      'BlueHolidayStar2D',
      'CyclicCellularAutomata2D',
      'CellularAutomata1D',
      'MetaballsOfFire2D',
      'Butterfly2D',
      'TimeFlies2D',
      'CarriesHolidayStar2D',
    ])
  })

  it('organizes built-in Shows into Learn and Showcases subtrees', () => {
    const organization = stockShowOrganization(STOCK_SHOWS)

    expect(organization.nodes).toMatchObject([
      { kind: 'folder', name: 'Learn', children: [{ kind: 'folder', name: '100' }, { kind: 'folder', name: '200' }, { kind: 'folder', name: '300' }] },
      { kind: 'folder', name: 'Showcases', children: [
        { kind: 'folder', name: 'Effects' },
        { kind: 'folder', name: 'Transitions & animation' },
        { kind: 'folder', name: 'Placement' },
        { kind: 'folder', name: 'Zones' },
        { kind: 'folder', name: 'Installations' },
      ] },
      { kind: 'folder', name: 'Remixes', children: [
        { kind: 'entity', entityId: 'stock-show-remix-coronal-mass-ejection' },
      ] },
    ])
    expect(new Set(collectEntityIds(organization.nodes)).size).toBe(STOCK_SHOWS.length)
  })

  it('omits a Learn level folder that has no lessons', () => {
    // The rail is derived from the catalogue, so retiring a level removes its
    // folder instead of leaving an empty node behind (#363).
    const only100 = STOCK_SHOWS.filter((show) => show.collection !== 'learn' || show.level === 100)
    const learn = stockShowOrganization(only100).nodes
      .find((node) => node.kind === 'folder' && node.name === 'Learn')

    expect(learn).toMatchObject({ children: [{ name: '100' }] })
    expect(stockShowOrganization(STOCK_SHOWS.filter((show) => show.collection !== 'learn')).nodes)
      .toMatchObject([{ kind: 'folder', name: 'Learn', children: [] }, { kind: 'folder', name: 'Showcases' }, { kind: 'folder', name: 'Remixes' }])
  })
})

function collectEntityIds(nodes: readonly import('./entityOrganization').EntityOrganizationNode[]): string[] {
  return nodes.flatMap((node) => node.kind === 'entity' ? [node.entityId] : collectEntityIds(node.children))
}
