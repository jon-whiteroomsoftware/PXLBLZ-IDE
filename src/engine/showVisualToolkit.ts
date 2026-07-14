export type ShowToolkitKind = 'property-animation' | 'effect' | 'transition'
export type ShowToolkitCostPolicy = 'none' | 'parameter' | 'single-source' | 'selector' | 'bounded-blend' | 'full-blend'
export type ShowToolkitParameterValue = number | boolean | string
export type ShowPatternEvaluationFormula = 'N' | 'N + E' | '2N' | 'S * N'

export interface ShowCompiledCostMetadata {
  cpu: {
    patternEvaluations:
      | { formula: 'N'; basePerPixel: 1 }
      | { formula: 'N + E'; basePerPixel: 1; additionalPerEdgePixel: 1 }
      | { formula: '2N'; basePerPixel: 2 }
      | { formula: 'S * N'; samplesPerPixel: number }
  }
  memory: {
    generatedScalarGlobals: number
    generatedArrayElements: number
  }
  code: {
    artifactBytes: number
    budgetBytes: number
    budgetRatio: number
  }
  coverage: {
    kind: 'full' | 'bounded-edge' | 'active-fraction'
    expectedActiveFraction: number | null
  }
  compatibility: {
    warnings: string[]
  }
}

export interface ShowCostAtPixelCount {
  patternEvaluations: number | null
  expression: string
  variables: { pixelCount: number; edgePixels?: number; samplesPerPixel?: number }
}

export interface ShowToolkitParameterCondition {
  parameterId: string
  equals: ShowToolkitParameterValue
}

export interface ShowToolkitParameterDescriptor {
  id: string
  label: string
  kind: 'number' | 'boolean' | 'enum' | 'easing'
  defaultValue: ShowToolkitParameterValue
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: Array<{ value: string; label: string }>
  variantIds?: string[]
  when?: ShowToolkitParameterCondition
}

export interface ShowToolkitPresetDescriptor {
  id: string
  label: string
  values: Record<string, ShowToolkitParameterValue>
}

export interface ShowToolkitVariantDescriptor {
  id: string
  label: string
  costPolicies: ShowToolkitCostPolicy[]
  compatibility?: { stageDimensions: Array<1 | 2 | 3> }
  presets?: ShowToolkitPresetDescriptor[]
}

export interface ShowToolkitFamilyDescriptor {
  kind: ShowToolkitKind
  id: string
  label: string
  variants: ShowToolkitVariantDescriptor[]
  parameters: ShowToolkitParameterDescriptor[]
}

const DURATION: ShowToolkitParameterDescriptor = {
  id: 'durationMs', label: 'Duration', kind: 'number', defaultValue: 2000, min: 0, max: 30_000, step: 100, unit: 'ms',
}
const EASING: ShowToolkitParameterDescriptor = {
  id: 'easing', label: 'Easing', kind: 'easing', defaultValue: 'linear',
}
const FEATHER: ShowToolkitParameterDescriptor = {
  id: 'feather', label: 'Feather', kind: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01,
}
const CENTER_X: ShowToolkitParameterDescriptor = {
  id: 'centerX', label: 'Center X', kind: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.01,
}
const CENTER_Y: ShowToolkitParameterDescriptor = {
  id: 'centerY', label: 'Center Y', kind: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.01,
}

export const SHOW_VISUAL_TOOLKIT_REGISTRY: ShowToolkitFamilyDescriptor[] = [
  {
    kind: 'property-animation',
    id: 'property',
    label: 'Property animation',
    variants: [
      { id: 'animation-speed', label: 'Animation speed', costPolicies: ['parameter'] },
      { id: 'brightness', label: 'Brightness', costPolicies: ['parameter'] },
      { id: 'pattern-control', label: 'Pattern control', costPolicies: ['parameter'] },
      { id: 'split-position', label: 'Split position', costPolicies: ['parameter'] },
      { id: 'repeat-scale', label: 'Repeat scale', costPolicies: ['parameter'] },
    ],
    parameters: [DURATION, EASING],
  },
  {
    kind: 'transition',
    id: 'blend',
    label: 'Blend',
    variants: [
      { id: 'cut', label: 'Cut', costPolicies: ['none'] },
      {
        id: 'crossfade',
        label: 'Crossfade',
        costPolicies: ['full-blend'],
        presets: [
          { id: 'quick', label: 'Quick', values: { durationMs: 500, easing: 'linear' } },
          { id: 'smooth', label: 'Smooth', values: { durationMs: 2000, easing: 'sine-in-out' } },
        ],
      },
    ],
    parameters: [DURATION, EASING],
  },
  {
    kind: 'transition',
    id: 'wipe',
    label: 'Wipe',
    variants: [{ id: 'linear', label: 'Linear', costPolicies: ['selector', 'bounded-blend'] }],
    parameters: [DURATION, EASING, FEATHER],
  },
  {
    kind: 'transition',
    id: 'dissolve',
    label: 'Dissolve',
    variants: [{ id: 'pixel', label: 'Pixel', costPolicies: ['selector'] }],
    parameters: [DURATION, EASING],
  },
  {
    kind: 'transition',
    id: 'shape-reveal',
    label: 'Shape reveal',
    variants: [
      { id: 'circle', label: 'Circle', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'diamond', label: 'Diamond', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'ring', label: 'Ring', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
    ],
    parameters: [
      DURATION,
      EASING,
      CENTER_X,
      CENTER_Y,
      FEATHER,
      { id: 'scale', label: 'Scale', kind: 'number', defaultValue: 1, min: 0.25, max: 2, step: 0.01 },
      {
        id: 'edgePolicy',
        label: 'Edge',
        kind: 'enum',
        defaultValue: 'dither',
        options: [
          { value: 'dither', label: 'Dither' },
          { value: 'blend', label: 'Blend' },
        ],
      },
      {
        id: 'revealMode',
        label: 'Reveal mode',
        kind: 'enum',
        defaultValue: 'grow-incoming',
        options: [
          { value: 'grow-incoming', label: 'Grow incoming' },
          { value: 'shrink-outgoing', label: 'Shrink outgoing' },
        ],
      },
      { id: 'rotation', label: 'Rotation', kind: 'number', defaultValue: 0, min: -1, max: 1, step: 0.01, variantIds: ['diamond'] },
      { id: 'spin', label: 'Spin', kind: 'number', defaultValue: 0, min: -4, max: 4, step: 0.01, variantIds: ['diamond'] },
      { id: 'ringWidth', label: 'Ring width', kind: 'number', defaultValue: 0.12, min: 0.02, max: 1, step: 0.01, variantIds: ['ring'] },
    ],
  },
]

export function getShowToolkitFamily(
  kind: ShowToolkitKind,
  familyId: string,
): ShowToolkitFamilyDescriptor | undefined {
  return SHOW_VISUAL_TOOLKIT_REGISTRY.find((family) => family.kind === kind && family.id === familyId)
}

export function resolveShowToolkitParameters(
  kind: ShowToolkitKind,
  familyId: string,
  variantId: string,
  values: Record<string, ShowToolkitParameterValue>,
): ShowToolkitParameterDescriptor[] {
  const family = getShowToolkitFamily(kind, familyId)
  if (!family?.variants.some((variant) => variant.id === variantId)) return []
  return family.parameters.filter((parameter) => (
    (!parameter.variantIds || parameter.variantIds.includes(variantId))
    && (!parameter.when || values[parameter.when.parameterId] === parameter.when.equals)
  ))
}

export function validateShowToolkitRegistry(
  registry: ShowToolkitFamilyDescriptor[] = SHOW_VISUAL_TOOLKIT_REGISTRY,
): string[] {
  const errors: string[] = []
  const familyKeys = new Set<string>()
  for (const family of registry) {
    const familyKey = `${family.kind}:${family.id}`
    if (familyKeys.has(familyKey)) errors.push(`Duplicate family ${familyKey}.`)
    familyKeys.add(familyKey)

    const variantIds = new Set<string>()
    for (const variant of family.variants) {
      if (variantIds.has(variant.id)) errors.push(`Duplicate variant ${familyKey}:${variant.id}.`)
      variantIds.add(variant.id)
    }

    const parameterIds = new Set(family.parameters.map((parameter) => parameter.id))
    const duplicateParameterIds = new Set<string>()
    for (const parameter of family.parameters) {
      if (duplicateParameterIds.has(parameter.id)) errors.push(`Duplicate parameter ${familyKey}:${parameter.id}.`)
      duplicateParameterIds.add(parameter.id)
      for (const variantId of parameter.variantIds ?? []) {
        if (!variantIds.has(variantId)) errors.push(`Unknown variant ${familyKey}:${variantId} for ${parameter.id}.`)
      }
      if (parameter.when && !parameterIds.has(parameter.when.parameterId)) {
        errors.push(`Unknown condition parameter ${familyKey}:${parameter.when.parameterId} for ${parameter.id}.`)
      }
    }

    for (const variant of family.variants) {
      const presetIds = new Set<string>()
      for (const preset of variant.presets ?? []) {
        if (presetIds.has(preset.id)) errors.push(`Duplicate preset ${familyKey}:${variant.id}:${preset.id}.`)
        presetIds.add(preset.id)
        for (const parameterId of Object.keys(preset.values)) {
          const parameter = family.parameters.find((candidate) => candidate.id === parameterId)
          if (!parameter || (parameter.variantIds && !parameter.variantIds.includes(variant.id))) {
            errors.push(`Unknown preset parameter ${familyKey}:${variant.id}:${preset.id}:${parameterId}.`)
          }
        }
      }
    }
  }
  return errors
}

export function buildShowCompiledCostMetadata(input: {
  transitionCost: 'none' | 'renderer-window' | 'bounded-renderer-window' | 'route' | 'parameter'
  artifactBytes: number
  budgetBytes: number
  expectedActiveFraction: number | null
  generatedScalarGlobals?: number
  generatedArrayElements?: number
  warnings?: string[]
}): ShowCompiledCostMetadata {
  const patternEvaluations: ShowCompiledCostMetadata['cpu']['patternEvaluations'] = input.transitionCost === 'renderer-window'
    ? { formula: '2N', basePerPixel: 2 }
    : input.transitionCost === 'bounded-renderer-window'
      ? { formula: 'N + E', basePerPixel: 1, additionalPerEdgePixel: 1 }
      : { formula: 'N', basePerPixel: 1 }
  return {
    cpu: { patternEvaluations },
    memory: {
      generatedScalarGlobals: input.generatedScalarGlobals ?? 0,
      generatedArrayElements: input.generatedArrayElements ?? 0,
    },
    code: {
      artifactBytes: input.artifactBytes,
      budgetBytes: input.budgetBytes,
      budgetRatio: input.budgetBytes > 0 ? input.artifactBytes / input.budgetBytes : 0,
    },
    coverage: {
      kind: input.transitionCost === 'bounded-renderer-window'
        ? 'bounded-edge'
        : input.expectedActiveFraction == null || input.expectedActiveFraction === 1
          ? 'full'
          : 'active-fraction',
      expectedActiveFraction: input.expectedActiveFraction,
    },
    compatibility: { warnings: [...(input.warnings ?? [])] },
  }
}

export function evaluateShowCostAtPixelCount(
  cost: ShowCompiledCostMetadata,
  input: { pixelCount: number; edgePixels?: number },
): ShowCostAtPixelCount {
  const pixelCount = Math.max(0, Math.round(input.pixelCount))
  const formula = cost.cpu.patternEvaluations
  if (formula.formula === '2N') {
    return {
      patternEvaluations: 2 * pixelCount,
      expression: `2 × ${pixelCount}`,
      variables: { pixelCount },
    }
  }
  if (formula.formula === 'N + E') {
    const edgePixels = input.edgePixels == null ? undefined : Math.max(0, Math.round(input.edgePixels))
    return {
      patternEvaluations: edgePixels == null ? null : pixelCount + edgePixels,
      expression: edgePixels == null ? `${pixelCount} + E` : `${pixelCount} + ${edgePixels}`,
      variables: { pixelCount, ...(edgePixels == null ? {} : { edgePixels }) },
    }
  }
  if (formula.formula === 'S * N') {
    return {
      patternEvaluations: formula.samplesPerPixel * pixelCount,
      expression: `${formula.samplesPerPixel} × ${pixelCount}`,
      variables: { pixelCount, samplesPerPixel: formula.samplesPerPixel },
    }
  }
  return {
    patternEvaluations: pixelCount,
    expression: `${pixelCount}`,
    variables: { pixelCount },
  }
}
