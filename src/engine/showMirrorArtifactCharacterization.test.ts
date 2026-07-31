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
    [false, '01ce3fa69eab03a6d0179833b0bdc1f5e858eeebe36008225c6900615c44392f'],
    [true, '4b03aa44cd09c3afdeaa435703ee1857f9321f90971eb0d0f02c90bb106aafe1'],
  ])('keeps Mirror %s byte-identical across the UI-only change', (mirror, expected) => {
    expect(artifactDigest(mirrorRecipe(mirror))).toBe(expected)
  })
})
