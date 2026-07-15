import {
  SHOW_VISUAL_TOOLKIT_REGISTRY,
  type ShowToolkitCostPolicy,
  type ShowToolkitKind,
  type ShowToolkitVariantDescriptor,
} from './showVisualToolkit'

export type ShowEffectPipelineStage = 'transform' | 'distort' | 'address' | 'color-output'

export interface ShowToolkitPresentationItem {
  key: string
  kind: ShowToolkitKind
  familyId: string
  familyLabel: string
  variantId: string
  label: string
  summary: string
  searchText: string
  compatible: boolean
  compatibilityReason: string | null
  costPolicies: ShowToolkitCostPolicy[]
  effectStage: ShowEffectPipelineStage | null
  presetLabels: string[]
}

const FAMILY_SUMMARIES: Record<string, string> = {
  'property-animation:property': 'Animate a scene value as the incoming boundary completes.',
  'effect:affine': 'Move or reshape the source coordinates before the Pattern renders.',
  'effect:distortion': 'Bend the source coordinates before the Pattern renders.',
  'effect:output': 'Adjust the rendered color and output level.',
  'transition:blend': 'Mix the outgoing and incoming scenes over the boundary.',
  'transition:fade': 'Pass through a chosen color between scenes.',
  'transition:wipe': 'Move a geometric edge across the Stage.',
  'transition:dissolve': 'Choose pixels over time using a repeatable spatial pattern.',
  'transition:shape-reveal': 'Reveal the incoming scene through a scalable shape.',
  'transition:motion': 'Move or scale scene content through the boundary.',
}

export function validateShowToolkitPresentationSummaries(
  summaries: Record<string, string> = FAMILY_SUMMARIES,
): string[] {
  const errors: string[] = []
  const runtimeKeys = new Set(SHOW_VISUAL_TOOLKIT_REGISTRY.map((family) => `${family.kind}:${family.id}`))
  for (const key of runtimeKeys) {
    if (!summaries[key]?.trim()) errors.push(`Missing presentation family ${key}.`)
  }
  for (const key of Object.keys(summaries)) {
    if (!runtimeKeys.has(key)) errors.push(`Unknown presentation family ${key}.`)
  }
  return errors
}

function effectStage(familyId: string, variantId: string): ShowEffectPipelineStage | null {
  if (familyId === 'distortion') return 'distort'
  if (familyId === 'output') return 'color-output'
  if (familyId === 'affine') return variantId === 'wrap' ? 'address' : 'transform'
  return null
}

function variantCompatibility(
  variant: ShowToolkitVariantDescriptor,
  stageDimensions: 1 | 2 | 3,
): { compatible: boolean; compatibilityReason: string | null } {
  const dimensions = variant.compatibility?.stageDimensions
  if (!dimensions || dimensions.includes(stageDimensions)) {
    return { compatible: true, compatibilityReason: null }
  }
  return {
    compatible: false,
    compatibilityReason: `${variant.label} requires a ${dimensions.join('D or ')}D Stage.`,
  }
}

export function buildShowToolkitPresentationCatalogue(input: {
  stageDimensions: 1 | 2 | 3
}): ShowToolkitPresentationItem[] {
  return SHOW_VISUAL_TOOLKIT_REGISTRY.flatMap((family) => family.variants.map((variant) => {
    const key = `${family.kind}:${family.id}:${variant.id}`
    const compatibility = variantCompatibility(variant, input.stageDimensions)
    const presetLabels = variant.presets?.map((preset) => preset.label) ?? []
    const summary = FAMILY_SUMMARIES[`${family.kind}:${family.id}`]
      ?? `Use ${variant.label} in the ${family.label} family.`
    return {
      key,
      kind: family.kind,
      familyId: family.id,
      familyLabel: family.label,
      variantId: variant.id,
      label: variant.label,
      summary,
      searchText: [variant.label, family.label, summary, ...presetLabels].join(' ').toLocaleLowerCase(),
      ...compatibility,
      costPolicies: [...variant.costPolicies],
      effectStage: family.kind === 'effect' ? effectStage(family.id, variant.id) : null,
      presetLabels,
    }
  }))
}

export function filterShowToolkitPresentationCatalogue(
  catalogue: ShowToolkitPresentationItem[],
  input: {
    kind: ShowToolkitKind
    query: string
    compatibleOnly: boolean
  },
): ShowToolkitPresentationItem[] {
  const query = input.query.trim().toLocaleLowerCase()
  return catalogue.filter((item) => (
    item.kind === input.kind
    && (!input.compatibleOnly || item.compatible)
    && (!query || item.searchText.includes(query))
  ))
}
