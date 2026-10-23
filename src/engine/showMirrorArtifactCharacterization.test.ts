// #1202: compiler-output identities and resources re-measured after bounded stepped callbacks.
// #645 characterization: moving Mirror's only UI home must not change emitted
// artifacts. These hashes include compact source, expanded source, and fixed-
// point source and were recorded before the React implementation changed.
import { createHash } from 'node:crypto'
import { compileShow, type ShowRecipe } from './showCompiler'

const SOURCE = 'export function render2D(index, x, y) { rgb(x, y, index / pixelCount) }'

function mirrorRecipe(mirror: boolean): ShowRecipe {
  return {
    clips: [{
      id: 'clip',
      zone: 'canvas',
      source: SOURCE,
      adaptation: { mirror },
      effects: [{ id: 'shift', kind: 'translate', x: 0.125, y: -0.25 }],
    }],
    zones: [{ id: 'canvas', name: 'Canvas', ranges: [{ start: 0, end: 63 }] }],
  }
}

function artifactDigest(recipe: ShowRecipe): string {
  const artifact = compileShow(recipe, {})
  return createHash('sha256')
    .update(artifact.code)
    .update('\n--expanded--\n')
    .update(artifact.expandedCode)
    .update('\n--fx--\n')
    .update(artifact.fxCode)
    .digest('hex')
}

describe('Mirror artifact characterization (#645)', () => {
  it.each([
    [false, '698cfa4fd3b2e7b66b80b2ec2620cf4c177cb629050f6e7d0173772d82f42ac3'],
    [true, 'ebfe0b60195370b1dafdb03bc88529f90c32155755bcd46035b9f9aa8b11fec6'],
  ])('keeps Mirror %s byte-identical across the UI-only change', (mirror, expected) => {
    expect(artifactDigest(mirrorRecipe(mirror))).toBe(expected)
  })
})
