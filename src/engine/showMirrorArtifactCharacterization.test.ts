// #1202: compiler-output identities and resources re-measured after bounded stepped callbacks.
// #1204: re-measured for the exact Show clock (only clock emission changed).
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
    [false, '202b832da4a0c775476e0ee0332a0247816ec5068c21384ccd6a1ca056860383'],
    [true, 'e735690f04626d4ed807e980e5636fc1182876ee4321449aefd69638693d712d'],
  ])('keeps Mirror %s byte-identical across the UI-only change', (mirror, expected) => {
    expect(artifactDigest(mirrorRecipe(mirror))).toBe(expected)
  })
})
