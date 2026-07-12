// Issue #405 moving-split resource comparison.
//
//   npm run issue405

import { compileShow, type ShowRecipe } from '../../src/engine/showCompiler'
import { benchOne } from './benchCore'

const SIDE = 16
const PIXELS = SIDE * SIDE
const POSITIONS = [2, 4, 6, 8, 10, 12, 14, 15].map((column) => column / SIDE)
const MEMBER_SOURCE = `
var t = 0
export function beforeRender(delta) { t = t + delta * 0.001 }
export function render2D(index, x, y) { rgb(triangle(x * 3 + t * 0.1), triangle(y * 4 - t * 0.08), 0.2) }
`

const clips = [
  { id: 'first', zone: 'first', source: MEMBER_SOURCE },
  { id: 'second', zone: 'second', source: MEMBER_SOURCE },
]
const baseZones = [
  { id: 'first', name: 'first', ranges: [{ start: 0, end: PIXELS / 2 - 1 }] },
  { id: 'second', name: 'second', ranges: [{ start: PIXELS / 2, end: PIXELS - 1 }] },
]

function parametricRecipe(): ShowRecipe {
  return {
    clips,
    zones: baseZones,
    routingLayouts: [{
      id: 'moving-split',
      name: 'Moving split',
      zones: baseZones,
      logical: { kind: 'split', zoneNames: ['first', 'second'], axis: 'x' },
    }],
    routingPropertyRamps: {
      splitPosition: {
        initial: POSITIONS[0],
        ramps: POSITIONS.slice(1).map((to, index) => ({
          atMs: (index + 1) * 1000,
          from: POSITIONS[index],
          to,
          durationMs: 1000,
          easing: 'linear',
        })),
      },
    },
    loopDurationMs: POSITIONS.length * 1000,
  }
}

function enumeratedRecipe(): ShowRecipe {
  const routingLayouts = POSITIONS.map((position, layoutIndex) => {
    const column = Math.round(position * SIDE)
    const left = Array.from({ length: SIDE }, (_, row) => ({
      start: row * SIDE,
      end: row * SIDE + column - 1,
    }))
    const right = Array.from({ length: SIDE }, (_, row) => ({
      start: row * SIDE + column,
      end: row * SIDE + SIDE - 1,
    }))
    return {
      id: `split-${layoutIndex}`,
      name: `Split ${layoutIndex + 1}`,
      zones: [
        { id: `first-${layoutIndex}`, name: 'first', ranges: left },
        { id: `second-${layoutIndex}`, name: 'second', ranges: right },
      ],
    }
  })
  return {
    clips,
    zones: baseZones,
    routingLayouts,
    routingSwitches: routingLayouts.slice(1).map((layout, index) => ({
      atMs: (index + 1) * 1000,
      layoutId: layout.id,
    })),
    loopDurationMs: routingLayouts.length * 1000,
  }
}

function measure(name: string, recipe: ShowRecipe) {
  const artifact = compileShow(recipe, {})
  const options = { frames: 16, warmup: 4, frameDeltaMs: 250, grid: { rows: SIDE, cols: SIDE } }
  return {
    name,
    representation: artifact.summary.routingRepresentation,
    sourceBytes: artifact.summary.artifactBytes,
    arrayElements: artifact.summary.routingEstimate?.arrayElements
      ?? artifact.summary.routingParameterEstimate?.arrayElements
      ?? 0,
    scalarGlobals: artifact.summary.routingParameterEstimate?.scalarGlobals ?? 0,
    routeComparisonsPerPixel: artifact.summary.routingParameterEstimate?.routeComparisonsPerPixel ?? null,
    fastMs: benchOne(artifact.code, {}, 'fast', options).meanFrameMs,
    preciseMs: benchOne(artifact.code, {}, 'precise', options).meanFrameMs,
  }
}

console.log(JSON.stringify([
  measure('parametric moving split', parametricRecipe()),
  measure('eight enumerated splits', enumeratedRecipe()),
], null, 2))
