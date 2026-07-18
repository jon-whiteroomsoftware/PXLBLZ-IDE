// Controlled Show frame-time attribution fixtures for issue #531.

import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import { showRecordToCompileRecipe } from '../../src/engine/showModel'
import {
  sourceForShowCell,
  sourceForShowPatternRef,
} from '../../src/engine/showPreviewArtifact'
import type { GeneratedShowArtifact, ShowRecipe } from '../../src/engine/showCompiler'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'
import {
  counterfactualArtifact as issue518Counterfactual,
  issue518Recipe,
  selectedArtifact as issue518Selected,
} from './issue518'
import {
  counterfactualArtifact as issue519Counterfactual,
  issue519Recipe,
  selectedArtifact as issue519Selected,
} from './issue519'
import { acceptanceArtifacts, acceptanceRecipe } from './issue520'
import {
  counterfactualArtifact as issue527Counterfactual,
  issue527Recipe,
  selectedArtifact as issue527Selected,
} from './issue527'
import {
  counterfactualArtifact as issue528Counterfactual,
  selectedArtifact as issue528Selected,
} from './issue528'
import {
  buildShowAttributionArtifacts,
  type ShowAttributionArtifacts,
} from './showAttribution'

export interface Issue531OptimizationReference {
  issue: 518 | 519 | 527 | 528
  component:
    | 'pattern-evaluation'
    | 'scalar-field-production'
    | 'coverage-directed-composition'
    | 'coordinate-capture-replay'
  selected: GeneratedShowArtifact
  counterfactual: GeneratedShowArtifact
}

export interface Issue531Fixture {
  id:
    | 'redline-production'
    | 'five-pattern-acceptance'
    | 'pattern-output-reuse'
    | 'scalar-field-cache'
    | 'content-key-composition'
  pixelCount: number
  artifacts: ShowAttributionArtifacts
  optimization?: Issue531OptimizationReference
}

const REDLINE_PIXEL_COUNT = 2_000
const redline = STOCK_SHOWS.find((candidate) => (
  candidate.id === 'stock-show-showcase-redline-installation'
))
if (!redline) throw new Error('Redline Installation fixture is missing.')

const redlineRecipe = showRecordToCompileRecipe(redline.show, {
  byCellId: Object.fromEntries(redline.show.cells.map((cell) => [
    cell.id,
    sourceForShowCell(cell, []),
  ])),
  byPatternInstanceId: Object.fromEntries(
    (redline.show.composition?.patternInstances ?? []).map((instance) => [
      instance.id,
      sourceForShowPatternRef(instance.pattern, []),
    ]),
  ),
  controllerZones: installationPhysicalZones(redline.show),
  stageDimension: 2,
})

function fixture(
  id: Issue531Fixture['id'],
  recipe: ShowRecipe,
  compileOptions: Parameters<typeof buildShowAttributionArtifacts>[0]['compileOptions'],
  captureElision: Parameters<typeof buildShowAttributionArtifacts>[0]['captureElision'],
  optimization?: Issue531OptimizationReference,
): Issue531Fixture {
  return {
    id,
    pixelCount: recipe.masterPixelCount ?? REDLINE_PIXEL_COUNT,
    artifacts: buildShowAttributionArtifacts({
      recipe,
      libraries: LIBRARIES,
      compileOptions,
      captureElision,
    }),
    optimization,
  }
}

export const issue531Fixtures: Issue531Fixture[] = [
  fixture(
    'redline-production',
    redlineRecipe,
    { coordinateFieldCaching: false },
    {
      eligible: false,
      reason: 'Redline uses capture-dependent Effects, transitions, and multi-member composition.',
    },
    {
      issue: 528,
      component: 'coordinate-capture-replay',
      selected: issue528Selected,
      counterfactual: issue528Counterfactual,
    },
  ),
  fixture(
    'five-pattern-acceptance',
    acceptanceRecipe('snapshot-live'),
    {},
    {
      eligible: false,
      reason: 'The acceptance Show uses capture-dependent Effects, scalar fields, and authored snapshot/live transitions.',
    },
  ),
  fixture(
    'pattern-output-reuse',
    issue518Recipe,
    { patternOutputReuse: false },
    {
      eligible: true,
      reason: 'Each routed pixel has one render-pure member with no output Effects; only capture and emit wrappers are exchanged.',
    },
    {
      issue: 518,
      component: 'pattern-evaluation',
      selected: issue518Selected,
      counterfactual: issue518Counterfactual,
    },
  ),
  fixture(
    'scalar-field-cache',
    issue519Recipe,
    { scalarFieldCaching: false },
    {
      eligible: false,
      reason: 'The dissolve compositor consumes captured members and a scalar field; direct emission is not equivalent.',
    },
    {
      issue: 519,
      component: 'scalar-field-production',
      selected: issue519Selected,
      counterfactual: issue519Counterfactual,
    },
  ),
  fixture(
    'content-key-composition',
    issue527Recipe,
    { contentKeyConditionalEvaluation: false },
    {
      eligible: false,
      reason: 'The luma-key compositor must inspect captured RGB and alpha before deciding whether to evaluate the lower member.',
    },
    {
      issue: 527,
      component: 'coverage-directed-composition',
      selected: issue527Selected,
      counterfactual: issue527Counterfactual,
    },
  ),
]

export const issue531ReferenceArtifacts = {
  acceptanceSelected: acceptanceArtifacts.selected,
  redlineCounterfactual: issue528Counterfactual,
}
