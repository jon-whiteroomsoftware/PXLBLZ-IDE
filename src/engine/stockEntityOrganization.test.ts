import { describe, expect, it } from 'vitest'
import { DEMO_SECTIONS, STOCK_PATTERNS, ZRANGER1_DEMOS } from './galleryCatalog'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { stockPatternOrganization, stockShowOrganization } from './stockEntityOrganization'

describe('built-in entity organization', () => {
  it('gives every built-in Pattern exactly one curated folder location', () => {
    const organization = stockPatternOrganization(STOCK_PATTERNS)
    const ids = collectEntityIds(organization.nodes)

    expect(ids).toHaveLength(STOCK_PATTERNS.length)
    expect(new Set(ids).size).toBe(STOCK_PATTERNS.length)
    expect(organization.nodes.map((node) => node.kind === 'folder' ? node.name : '')).toContain('FPS Friendly')
  })

  it('orders built-in Pattern folders by the declared section order, not first encounter', () => {
    const organization = stockPatternOrganization(STOCK_PATTERNS)
    const folderNames = organization.nodes.flatMap((node) => node.kind === 'folder' ? [node.name] : [])

    expect(folderNames).toEqual(DEMO_SECTIONS.map((section) => section.label).filter((label) => folderNames.includes(label)))
  })

  it('starts every built-in Pattern folder collapsed', () => {
    const organization = stockPatternOrganization(STOCK_PATTERNS)
    const folderIds = organization.nodes.flatMap((node) => node.kind === 'folder' ? [node.id] : [])

    expect(organization.collapsedFolderIds).toEqual(folderIds)
  })

  it('keeps the popularity-ranked ZRanger1 collection together', () => {
    const organization = stockPatternOrganization(STOCK_PATTERNS)
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

  it('organizes built-in Shows into learning, showcase, portable, and installation collections', () => {
    const organization = stockShowOrganization(STOCK_SHOWS)

    expect(organization.nodes).toMatchObject([
      { kind: 'folder', name: 'Learn', children: [{ kind: 'folder', name: '100' }, { kind: 'folder', name: '200' }, { kind: 'folder', name: '300' }] },
      { kind: 'folder', name: 'Showcases', children: [
        { kind: 'folder', name: 'Effects' },
        { kind: 'folder', name: 'Transitions & animation' },
        { kind: 'folder', name: 'Placement' },
        { kind: 'folder', name: 'Zones' },
      ] },
      { kind: 'folder', name: 'Portable Shows', children: [
        { kind: 'entity', entityId: 'stock-show-remix-coronal-mass-ejection' },
        { kind: 'entity', entityId: 'stock-show-remix-quadrille' },
      ] },
      { kind: 'folder', name: 'Installations', children: [
        { kind: 'entity', entityId: 'stock-show-showcase-redline-installation' },
        { kind: 'entity', entityId: 'stock-show-remix-overture' },
      ] },
    ])
    expect(new Set(collectEntityIds(organization.nodes)).size).toBe(STOCK_SHOWS.length)
  })

  it('starts every top-level built-in Show folder open and only nested grouping folders collapsed', () => {
    const organization = stockShowOrganization(STOCK_SHOWS)

    expect(organization.collapsedFolderIds).toEqual([
      'stock-show-learn-100',
      'stock-show-learn-200',
      'stock-show-learn-300',
      'stock-show-showcases-effects',
      'stock-show-showcases-transitions',
      'stock-show-showcases-placement',
      'stock-show-showcases-zones',
    ])
    const topLevelFolderIds = organization.nodes.flatMap((node) => node.kind === 'folder' ? [node.id] : [])
    expect(topLevelFolderIds).toEqual([
      'stock-show-learn',
      'stock-show-showcases',
      'stock-show-portable-shows',
      'stock-show-installations',
    ])
    expect(organization.collapsedFolderIds.filter((folderId) => topLevelFolderIds.includes(folderId))).toEqual([])
  })

  it('omits a Learn level folder that has no lessons', () => {
    // The rail is derived from the catalogue, so retiring a level removes its
    // folder instead of leaving an empty node behind (#363).
    const only100 = STOCK_SHOWS.filter((show) => show.collection !== 'learn' || show.level === 100)
    const learn = stockShowOrganization(only100).nodes
      .find((node) => node.kind === 'folder' && node.name === 'Learn')

    expect(learn).toMatchObject({ children: [{ name: '100' }] })
    expect(stockShowOrganization(STOCK_SHOWS.filter((show) => show.collection !== 'learn')).nodes)
      .toMatchObject([
        { kind: 'folder', name: 'Learn', children: [] },
        { kind: 'folder', name: 'Showcases' },
        { kind: 'folder', name: 'Portable Shows' },
        { kind: 'folder', name: 'Installations' },
      ])
  })
})

function collectEntityIds(nodes: readonly import('./entityOrganization').EntityOrganizationNode[]): string[] {
  return nodes.flatMap((node) => node.kind === 'entity' ? [node.entityId] : collectEntityIds(node.children))
}
