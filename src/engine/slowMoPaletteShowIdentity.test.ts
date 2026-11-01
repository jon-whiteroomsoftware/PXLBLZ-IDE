import { createHash } from 'node:crypto'
import { V1_STOCK_SHOWS } from '@/test/v1StockShowsFixture'
import { compileShowForArtifact } from './showPreviewArtifact'
import { createInstallationCompositionFixture } from './showInstallationTestFixture'

// Recorded before extraction at 288d0b28b74ad7c4e4239988f70c3577fa959e5f.
// Covers compact, expanded and fixed-point source of every census Show plus
// installation fixtures containing each of the three palette Patterns.
const expected: Record<string, string> = {
  "stock-show-100-getting-around": "281b1d9cb8a7e5131cf63b76b9e6f27701934a7185105839787e6c2daa739453",
  "stock-show-101-clips-cuts-blank-time": "dc541012a82f9b270e56719d09b4fcb7f7da9010a4aa9c279fe1390ef8abd2db",
  "stock-show-102-transitions-values": "0db99eecf726d43f864a41ebecda64301a74903a9d569ec67994b9bb55484606",
  "stock-show-103-clip-transform": "c6322e9895a7bf824063e1a50a2ea3e52dab8614601b957c4e3b05476bac3edb",
  "stock-show-104-effects-and-ordering": "3684c835d5244fb1aabfc8c8de536749c7d881e29e350d87242450b7f73e3c2a",
  "stock-show-105-portable-zones": "bd69fc81bc89831279a2b1c2370ff605e64ed197e812880f83045a9352dd3de4",
  "stock-show-106-built-from-basics": "a652578dc4639e1d5cb7536d83036d22aaa2cd75616dd4f2267f7d3933ac7dc9",
  "stock-show-201-layers-property-animation": "b423e49c9e98e319156a217f9a0b266233bc48fd7ede3905b59bc64304361827",
  "stock-show-202-content-clip-viewport": "e16f9f226cfef6fb46084f26f874f3670dcda020c1fdfa2a96b5f23323dca328",
  "stock-show-203-pattern-instance-lifecycle": "739b6a7884f1adbbad81a0bfe9020345159e1253522231105874b680286dc6a9",
  "stock-show-204-presentation-modes": "07f49429f2f9d3f4ccb2711be021a7bbf2528c44c57753252f316621abcbdd35",
  "stock-show-205-groups-linked-reuse": "b0bb7989e24991128e575d10193b5d8659d41231a6f4dec6140d36907843f0c8",
  "stock-show-206-changing-zone-layouts": "c6a703293145d38dc1821cea07a9166d55ebc02cc7f1ecd5169f97a2fd2440ba",
  "stock-show-207-aperture-shapes-edges": "4ae1357952cb62ecd00a141cd7b5da623741dcfae68c720ccf0af47b9dec93ca",
  "stock-show-301-installation-mapping": "13bad690c331e70707c92baee2b65108de727ef68f91b39143773f3381b7126c",
  "stock-show-302-installation-composition": "d26f9494b8ecc46b170b3be1b23a6dae966364251c71bdd2ecb333643d22ada0",
  "stock-show-303-compile-simplify-deliver": "8517a5774d5ff893d63ef38797cddd88994a1104fdf46c866ca93c8eef25d83e",
  "stock-show-showcase-transform-effects": "266d2af929158882c0f6e63de699c8d5fc82b87ca6108865b6e91d4c9094c072",
  "stock-show-showcase-distortion-effects": "94c44853585536b9f9ea27c16c2fc7cfe5c095328223751fa561e65163fa925b",
  "stock-show-showcase-color-adjustment-effects": "3d8cb271c1956c336e94d6661963c8bee1587da0ff4f040764fc68e64e6d729d",
  "stock-show-showcase-compositing-key-effects": "3a015167b318a321a11942c50f9d1c06439dfbe28d0e408fb84b1e0f210b83a7",
  "stock-show-showcase-luma-sources": "a8dfa4428c906f804354cb2ed73fb13d55cd83c347cf5ac819bb4dc3b5e4c38c",
  "stock-show-reference-blend-fade-transitions": "16e6968d81cf1406f75302a9b5058d0c7951c0a7f934e7f0acc0e3538cb46531",
  "stock-show-reference-wipe-transitions": "31699382bd05ddb77e3057eeb6508285f45270682c7659544cbde25336b51030",
  "stock-show-reference-dissolve-transitions": "e70a3cef7d7dc6321420cbfd97032d1edfe727df6cc8ea4d33b841a381a8db86",
  "stock-show-reference-shape-reveal-transitions": "fb3f070aa6b9e19fbd2965a885d704ae9d14fd22cb7ce3263065a440ac7a3785",
  "stock-show-reference-shape-reveal-figures": "81c25a87e0db2771d7e41c572cf0915862cf9e2feab918b289d32e29a3f25916",
  "stock-show-reference-slide-transitions": "cc7ff2d03d8ec709742481d850a8476e6d15fbb290240b865bebaf3aab69ca30",
  "stock-show-reference-zoom-spin-transitions": "a7bce060d2592e71f16ae7e88fd8cf68005d29d60ecd0d962039308b4fe531f9",
  "stock-show-reference-property-animation": "91053aa7a78735ec82ad4d4334ace80faec0fb9ae818029c85484416296e0c1d",
  "stock-show-reference-easing": "7177c379fdc0c25562aa5e88de7a51577bbc6f8fc1dde35cdb4ecf5aa83e54dd",
  "stock-show-reference-aperture-shapes": "b56b3f606b8955d29e62bf80020b1f490c01d75a73b085cd7df30e15c27a8c12",
  "stock-show-reference-aperture-icons": "abb10be76b083c30505f202d59fbf278321bb596babbedaad1b98325dcbc288a",
  "stock-show-showcase-zone-layouts-splits": "b73e77b7858e87469073f3bc17dfadf86b7972652df09c07110bd8ed741cef94",
  "stock-show-showcase-zone-layouts-stripes-grid": "4bfa0e656a2ee260fb7a29951d41c3f8ca9d19d84e28c1051d5d180c1c87c6ab",
  "stock-show-showcase-zone-layouts-radial": "486baa78379042b405c7de3df28b17be6ffb145a476d1b0eb7e817d0226f50df",
  "stock-show-showcase-redline-installation": "0f5aa8b1137cd55baac2f55dbd2911b23d0bf088011fe62958689d813645200f",
  "stock-show-remix-coronal-mass-ejection": "9e1c4268f7bd31c5be553f5752c96c3334d6caa5d666450dd42018229bf46b4f",
  "stock-show-remix-quadrille": "010bebdd2810347564b4d23f5e2b43d98c59f871993e8c3d1b127911c68fd4a7",
  "stock-show-remix-overture": "3ef1bbd781004aaf3a32435a5883f5a44ac298a38bc22b653bb2ef00bdda3405",
  "palette-FastPaletteBlending": "28a4fb5ba9862c80d0e44cae7aa7fab7189397c397306a45800626ad24a55a60",
  "palette-NebulaSphere": "75b5cbdd96f2b2f643ebe1e3a101e5992c5649562893e7bc0e193e91994bdb19",
  "palette-PlasmaNebula": "a1be2e52f17b2e11b2186004dbe4ac0f1bf929f4da78a4692a0850ca76573afa"
}

const shows = V1_STOCK_SHOWS.map(item => ({ id: item.id, show: item.show }))
for (const id of ['FastPaletteBlending', 'NebulaSphere', 'PlasmaNebula']) {
  const show = createInstallationCompositionFixture()
  for (const cell of show.cells) {
    if (cell.sceneId === 'wake' && cell.zoneId === 'zone-1') cell.pattern = { kind: 'stock', id }
  }
  shows.push({ id: `palette-${id}`, show })
}

it('covers the complete Show census and three palette installations', () => {
  expect(shows.map(({ id }) => id).sort()).toEqual(Object.keys(expected).sort())
})

it.each(shows)('preserves Show bytes: $id', ({ id, show }) => {
  const result = compileShowForArtifact(show, [], undefined, {}, { stageDimension: 2 })
  expect(result.error, id).toBeNull()
  const artifact = result.artifact!
  const hash = createHash('sha256').update(artifact.code).update('\n--expanded--\n')
    .update(artifact.expandedCode).update('\n--fx--\n').update(artifact.fxCode).digest('hex')
  expect(hash, id).toBe(expected[id])
})
