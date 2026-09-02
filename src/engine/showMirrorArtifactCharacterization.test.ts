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
    [false, 'caae3b4980ad109fdff9050f037bdf6eb9561dc2df868cb03a2e915b9b904fd8'],
    [true, '3e47db158ad09af5cec901a4969778693cc33df9f1911afb0ae71b5c8d711bd1'],
  ])('keeps Mirror %s byte-identical across the UI-only change', (mirror, expected) => {
    expect(artifactDigest(mirrorRecipe(mirror))).toBe(expected)
  })
})
