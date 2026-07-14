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
    effects: {
      affineOperationsPerFrame: number
      animatedParametersPerFrame: number
      affineScalarOpsPerEvaluatedPixel: number
      opacityMultipliesPerEvaluatedPixel: number
      addressPolicy: 'none' | 'clip' | 'wrap'
    }
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
  kind: 'number' | 'boolean' | 'enum' | 'easing' | 'color'
  defaultValue: ShowToolkitParameterValue
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: Array<{ value: string; label: string }>
  optionsByVariant?: Record<string, Array<{ value: string; label: string }>>
  compatibility?: { stageDimensions: Array<1 | 2 | 3> }
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
    kind: 'effect',
    id: 'output',
    label: 'Output',
    variants: [{
      id: 'opacity',
      label: 'Opacity',
      costPolicies: ['single-source', 'parameter'],
      compatibility: { stageDimensions: [1, 2, 3] },
      presets: [{ id: 'half', label: 'Half', values: { opacity: 0.5 } }],
    }],
    parameters: [{
      id: 'opacity', label: 'Opacity', kind: 'number', defaultValue: 1, min: 0, max: 1, step: 0.01,
    }, EASING],
  },
  {
    kind: 'effect',
    id: 'affine',
    label: 'Transform',
    variants: [
      { id: 'translate', label: 'Translate', costPolicies: ['single-source', 'parameter'], compatibility: { stageDimensions: [2] } },
      { id: 'rotate', label: 'Rotate', costPolicies: ['single-source', 'parameter'], compatibility: { stageDimensions: [2] } },
      { id: 'scale', label: 'Scale', costPolicies: ['single-source', 'parameter'], compatibility: { stageDimensions: [2] } },
      { id: 'shear', label: 'Shear', costPolicies: ['single-source', 'parameter'], compatibility: { stageDimensions: [2] } },
      { id: 'wrap', label: 'Wrap', costPolicies: ['single-source'], compatibility: { stageDimensions: [2] } },
    ],
    parameters: [
      { id: 'translateX', label: 'X', kind: 'number', defaultValue: 0, min: -2, max: 2, step: 0.01, variantIds: ['translate'] },
      { id: 'translateY', label: 'Y', kind: 'number', defaultValue: 0, min: -2, max: 2, step: 0.01, variantIds: ['translate'] },
      { id: 'turns', label: 'Turns', kind: 'number', defaultValue: 0, min: -8, max: 8, step: 0.01, unit: 'turn', variantIds: ['rotate'] },
      { id: 'scaleX', label: 'X scale', kind: 'number', defaultValue: 1, min: 0.01, max: 8, step: 0.01, variantIds: ['scale'] },
      { id: 'scaleY', label: 'Y scale', kind: 'number', defaultValue: 1, min: 0.01, max: 8, step: 0.01, variantIds: ['scale'] },
      { id: 'shearX', label: 'X shear', kind: 'number', defaultValue: 0, min: -4, max: 4, step: 0.01, variantIds: ['shear'] },
      { id: 'shearY', label: 'Y shear', kind: 'number', defaultValue: 0, min: -4, max: 4, step: 0.01, variantIds: ['shear'] },
      { ...EASING, variantIds: ['translate', 'rotate', 'scale', 'shear'] },
    ],
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
    id: 'fade',
    label: 'Fade',
    variants: [{
      id: 'through-color',
      label: 'Through color',
      costPolicies: ['single-source'],
      presets: [
        { id: 'black', label: 'Black', values: { color: '#000000' } },
        { id: 'white', label: 'White', values: { color: '#ffffff' } },
        { id: 'custom', label: 'Custom', values: { color: '#7c3aed' } },
      ],
    }],
    parameters: [
      DURATION,
      EASING,
      { id: 'color', label: 'Color', kind: 'color', defaultValue: '#000000' },
    ],
  },
  {
    kind: 'transition',
    id: 'wipe',
    label: 'Wipe',
    variants: [
      {
        id: 'linear',
        label: 'Linear',
        costPolicies: ['selector', 'bounded-blend'],
        compatibility: { stageDimensions: [1, 2] },
        presets: [
          { id: 'east', label: 'East', values: { direction: 0 } },
          { id: 'south-east', label: 'South-east', values: { direction: 0.125 } },
          { id: 'south', label: 'South', values: { direction: 0.25 } },
          { id: 'south-west', label: 'South-west', values: { direction: 0.375 } },
          { id: 'west', label: 'West', values: { direction: 0.5 } },
          { id: 'north-west', label: 'North-west', values: { direction: 0.625 } },
          { id: 'north', label: 'North', values: { direction: 0.75 } },
          { id: 'north-east', label: 'North-east', values: { direction: 0.875 } },
        ],
      },
      { id: 'split', label: 'Split', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'barn-doors', label: 'Barn doors', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'blinds', label: 'Blinds', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'clock', label: 'Clock', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'checker', label: 'Checker', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'grid', label: 'Grid', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
    ],
    parameters: [
      DURATION,
      EASING,
      { id: 'direction', label: 'Direction', kind: 'number', defaultValue: 0, min: 0, max: 1, step: 0.001, unit: 'turn', compatibility: { stageDimensions: [2] }, variantIds: ['linear'] },
      {
        id: 'wipeMode', label: 'Mode', kind: 'enum', defaultValue: 'center-out', variantIds: ['split', 'barn-doors'],
        options: [{ value: 'center-out', label: 'Center out' }, { value: 'center-in', label: 'Center in' }],
      },
      {
        id: 'orientation', label: 'Orientation', kind: 'enum', defaultValue: 'vertical', variantIds: ['split', 'blinds'],
        options: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }],
      },
      { ...CENTER_X, variantIds: ['barn-doors', 'clock'] },
      { ...CENTER_Y, variantIds: ['barn-doors', 'clock'] },
      { id: 'count', label: 'Count', kind: 'number', defaultValue: 8, min: 1, max: 32, step: 1, variantIds: ['blinds', 'checker', 'grid'] },
      { id: 'phase', label: 'Phase', kind: 'number', defaultValue: 0, min: 0, max: 1, step: 0.001, unit: 'turn', variantIds: ['blinds', 'clock'] },
      { id: 'clockwise', label: 'Clockwise', kind: 'boolean', defaultValue: true, variantIds: ['clock'] },
      {
        id: 'edgePolicy',
        label: 'Edge',
        kind: 'enum',
        defaultValue: 'hard',
        options: [
          { value: 'hard', label: 'Hard' },
          { value: 'dither', label: 'Stable dither' },
          { value: 'blend', label: 'Blend' },
        ],
      },
      FEATHER,
    ],
  },
  {
    kind: 'transition',
    id: 'dissolve',
    label: 'Dissolve',
    variants: [
      { id: 'pixel', label: 'Pixel', costPolicies: ['selector'] },
      { id: 'block', label: 'Block', costPolicies: ['selector'] },
      { id: 'coherent-noise', label: 'Coherent noise', costPolicies: ['selector'], compatibility: { stageDimensions: [2] } },
      { id: 'soft-threshold', label: 'Soft threshold', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
    ],
    parameters: [
      DURATION,
      EASING,
      { id: 'seed', label: 'Seed', kind: 'number', defaultValue: 0, min: 0, max: 65_535, step: 1 },
      {
        id: 'edgePolicy', label: 'Edge', kind: 'enum', defaultValue: 'dither',
        options: [
          { value: 'hard', label: 'Hard' },
          { value: 'dither', label: 'Stable dither' },
          { value: 'blend', label: 'Blend' },
        ],
        optionsByVariant: {
          pixel: [{ value: 'dither', label: 'Stable dither' }],
          block: [{ value: 'dither', label: 'Stable dither' }],
          'coherent-noise': [{ value: 'hard', label: 'Hard' }],
          'soft-threshold': [
            { value: 'hard', label: 'Hard' },
            { value: 'dither', label: 'Stable dither' },
            { value: 'blend', label: 'Blend' },
          ],
        },
      },
      { id: 'blockSize', label: 'Block size', kind: 'number', defaultValue: 8, min: 1, max: 1024, step: 1, unit: 'pixels', variantIds: ['block'] },
      { id: 'scale', label: 'Spatial scale', kind: 'number', defaultValue: 6, min: 1, max: 32, step: 0.1, variantIds: ['coherent-noise', 'soft-threshold'] },
      { id: 'softness', label: 'Softness', kind: 'number', defaultValue: 0.15, min: 0, max: 1, step: 0.01, variantIds: ['soft-threshold'] },
    ],
  },
  {
    kind: 'transition',
    id: 'shape-reveal',
    label: 'Shape reveal',
    variants: [
      { id: 'circle', label: 'Circle', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'ellipse', label: 'Ellipse', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'box', label: 'Box', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'rounded-box', label: 'Rounded box', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'diamond', label: 'Diamond', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'cross', label: 'Cross', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'ring', label: 'Ring', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'heart', label: 'Heart', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'star', label: 'Star', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'crescent', label: 'Crescent', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'polygon', label: 'Regular polygon', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'cat-head', label: 'Cat head', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'cat-side-profile', label: 'Side-profile cat', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'bastet', label: 'Bastet', costPolicies: ['selector', 'bounded-blend'], compatibility: { stageDimensions: [2] } },
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
      { id: 'aspect', label: 'Aspect', kind: 'number', defaultValue: 1, min: 0.25, max: 4, step: 0.01, variantIds: ['ellipse', 'box', 'rounded-box', 'cross', 'heart', 'star', 'crescent', 'polygon', 'cat-head', 'cat-side-profile', 'bastet'] },
      { id: 'rotation', label: 'Rotation', kind: 'number', defaultValue: 0, min: -1, max: 1, step: 0.01, variantIds: ['ellipse', 'box', 'rounded-box', 'diamond', 'cross', 'heart', 'star', 'crescent', 'polygon', 'cat-head', 'cat-side-profile', 'bastet'] },
      { id: 'spin', label: 'Spin', kind: 'number', defaultValue: 0, min: -4, max: 4, step: 0.01, variantIds: ['diamond'] },
      { id: 'ringWidth', label: 'Ring width', kind: 'number', defaultValue: 0.12, min: 0.02, max: 1, step: 0.01, variantIds: ['ring'] },
      { id: 'cornerRadius', label: 'Corner roundness', kind: 'number', defaultValue: 0.3, min: 0, max: 1, step: 0.01, variantIds: ['rounded-box'] },
      { id: 'crossWidth', label: 'Arm width', kind: 'number', defaultValue: 0.32, min: 0.1, max: 0.9, step: 0.01, variantIds: ['cross'] },
      { id: 'starPoints', label: 'Points', kind: 'number', defaultValue: 5, min: 3, max: 12, step: 1, variantIds: ['star'] },
      { id: 'starInner', label: 'Inner radius', kind: 'number', defaultValue: 0.45, min: 0.2, max: 0.8, step: 0.01, variantIds: ['star'] },
      { id: 'crescentOffset', label: 'Cutout offset', kind: 'number', defaultValue: 0.45, min: 0.15, max: 0.8, step: 0.01, variantIds: ['crescent'] },
      { id: 'polygonSides', label: 'Sides', kind: 'number', defaultValue: 6, min: 3, max: 8, step: 1, variantIds: ['polygon'] },
    ],
  },
  {
    kind: 'transition',
    id: 'motion',
    label: 'Motion',
    variants: [
      { id: 'cover', label: 'Cover', costPolicies: ['selector', 'full-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'reveal', label: 'Reveal', costPolicies: ['selector', 'full-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'push', label: 'Push', costPolicies: ['selector', 'full-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'content-grow', label: 'Content grow', costPolicies: ['selector', 'full-blend'], compatibility: { stageDimensions: [2] } },
      { id: 'content-shrink', label: 'Content shrink', costPolicies: ['selector', 'full-blend'], compatibility: { stageDimensions: [2] } },
    ],
    parameters: [
      DURATION,
      EASING,
      { id: 'direction', label: 'Direction', kind: 'number', defaultValue: 0, min: 0, max: 1, step: 0.001, unit: 'turn', variantIds: ['cover', 'reveal', 'push'] },
      { id: 'anchorX', label: 'Anchor X', kind: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.01, variantIds: ['content-grow', 'content-shrink'] },
      { id: 'anchorY', label: 'Anchor Y', kind: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.01, variantIds: ['content-grow', 'content-shrink'] },
      { id: 'contentScale', label: 'Minimum scale', kind: 'number', defaultValue: 0.01, min: 0.01, max: 1, step: 0.01, variantIds: ['content-grow', 'content-shrink'] },
      {
        id: 'addressPolicy', label: 'Addressing', kind: 'enum', defaultValue: 'clip',
        options: [{ value: 'clip', label: 'Clip' }, { value: 'wrap', label: 'Wrap' }],
      },
      {
        id: 'edgePolicy', label: 'Composition', kind: 'enum', defaultValue: 'hard',
        options: [{ value: 'hard', label: 'Hard selector' }, { value: 'blend', label: 'Full blend' }],
      },
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
  )).map((parameter) => {
    const options = parameter.optionsByVariant?.[variantId]
    if (!options) return parameter
    return {
      ...parameter,
      options,
      defaultValue: options.some((option) => option.value === parameter.defaultValue)
        ? parameter.defaultValue
        : options[0]?.value ?? parameter.defaultValue,
    }
  })
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
      for (const variantId of Object.keys(parameter.optionsByVariant ?? {})) {
        if (!variantIds.has(variantId)) errors.push(`Unknown option variant ${familyKey}:${variantId} for ${parameter.id}.`)
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
  effects?: Partial<ShowCompiledCostMetadata['cpu']['effects']>
}): ShowCompiledCostMetadata {
  const patternEvaluations: ShowCompiledCostMetadata['cpu']['patternEvaluations'] = input.transitionCost === 'renderer-window'
    ? { formula: '2N', basePerPixel: 2 }
    : input.transitionCost === 'bounded-renderer-window'
      ? { formula: 'N + E', basePerPixel: 1, additionalPerEdgePixel: 1 }
      : { formula: 'N', basePerPixel: 1 }
  return {
    cpu: {
      patternEvaluations,
      effects: {
        affineOperationsPerFrame: input.effects?.affineOperationsPerFrame ?? 0,
        animatedParametersPerFrame: input.effects?.animatedParametersPerFrame ?? 0,
        affineScalarOpsPerEvaluatedPixel: input.effects?.affineScalarOpsPerEvaluatedPixel ?? 0,
        opacityMultipliesPerEvaluatedPixel: input.effects?.opacityMultipliesPerEvaluatedPixel ?? 0,
        addressPolicy: input.effects?.addressPolicy ?? 'none',
      },
    },
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
