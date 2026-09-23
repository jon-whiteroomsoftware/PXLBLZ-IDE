import { showEasingFromOptionId, showEasingOptionId } from './showEasing'
import { updateShowBoundaryTransition } from './showModel'
import type { ShowBoundaryTransition, ShowRecord } from './personalContentRecords'
import {
  getShowToolkitFamily,
  resolveShowToolkitParameters,
  type ShowToolkitParameterDescriptor,
  type ShowToolkitParameterValue,
} from './showVisualToolkit'
import type { ShowToolkitPresentationItem } from './showVisualToolkitPresentation'

export type ShowTransitionChanges = Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>

/**
 * Anything that carries Transition presentation settings. A v1
 * `ShowBoundaryTransition` and a v2 `ShowTransitionV2` both satisfy it, so one
 * parameter surface reads and patches either without a version branch.
 */
export type ShowTransitionSettingsCarrier = Omit<ShowBoundaryTransition, 'afterSceneId'>

export function showBoundaryTransitionPresentationKey(
  transition: Pick<ShowBoundaryTransition, 'kind' | 'wipeVariant' | 'dissolveVariant' | 'shape' | 'motionVariant'>,
): string {
  if (transition.kind === 'fade-color') return 'transition:fade:through-color'
  if (transition.kind === 'wipe') return `transition:wipe:${transition.wipeVariant ?? 'linear'}`
  if (transition.kind === 'dither') return `transition:dissolve:${transition.dissolveVariant ?? 'pixel'}`
  if (transition.kind === 'portal') return `transition:shape-reveal:${transition.shape ?? 'circle'}`
  if (transition.kind === 'motion') return `transition:motion:${transition.motionVariant ?? 'cover'}`
  if (transition.kind === 'routing') return 'transition:routing:routing'
  return `transition:blend:${transition.kind}`
}

export function replaceShowBoundaryTransition(
  show: ShowRecord,
  transitionId: string,
  item: ShowToolkitPresentationItem,
  presetId?: string,
  stageDimensions?: 1 | 2 | 3,
): ShowRecord {
  if (item.kind !== 'transition') throw new Error(`${item.key} is not a Transition.`)
  const changes = showTransitionChangesForPresentation(item, presetId, stageDimensions)
  return updateShowBoundaryTransition(show, transitionId, changes)
}

/** Resolve catalogue defaults and an optional preset without assuming an owner. */
export function showTransitionChangesForPresentation(
  item: ShowToolkitPresentationItem,
  presetId?: string,
  stageDimensions?: 1 | 2 | 3,
): ShowTransitionChanges {
  if (item.kind !== 'transition') throw new Error(`${item.key} is not a Transition.`)
  const family = getShowToolkitFamily('transition', item.familyId)
  const variant = family?.variants.find((candidate) => candidate.id === item.variantId)
  if (!family || !variant) throw new Error(`Unsupported Show Transition ${item.key}.`)
  const preset = variant.presets?.find((candidate) => candidate.id === presetId)
  const parameters = resolveShowToolkitParameters('transition', item.familyId, item.variantId, {}, stageDimensions)
  const compatibleIds = new Set(parameters.map((parameter) => parameter.id))
  const values = {
    ...Object.fromEntries(parameters.map((parameter) => [parameter.id, parameter.defaultValue])),
    ...Object.fromEntries(
      Object.entries(preset?.values ?? {}).filter(([parameterId]) => compatibleIds.has(parameterId)),
    ),
  }
  // A parameter excluded for the Stage dimension (direction on a 1D Stage)
  // must clear a stored value: both palette mergers spread these changes
  // over the current Transition, and the boundary normalizer treats an
  // explicit undefined as absent (#1077 corrective).
  const cleared: Record<string, undefined> = stageDimensions === undefined ? {} : Object.fromEntries(
    resolveShowToolkitParameters('transition', item.familyId, item.variantId, {})
      .filter((parameter) => !compatibleIds.has(parameter.id))
      .map((parameter) => [parameter.id, undefined]),
  )
  return {
    ...transitionIdentity(item.familyId, item.variantId),
    ...Object.fromEntries(Object.entries(values).map(([parameterId, value]) => (
      [parameterId, persistedParameterValue(parameterId, value)]
    ))),
    ...cleared,
  } as ShowTransitionChanges
}

export function showBoundaryTransitionParameters(
  item: ShowToolkitPresentationItem,
  transition: ShowTransitionSettingsCarrier,
  stageDimensions?: 1 | 2 | 3,
): ShowToolkitParameterDescriptor[] {
  const family = getShowToolkitFamily('transition', item.familyId)
  if (!family) return []
  const values = Object.fromEntries(family.parameters.map((parameter) => (
    [parameter.id, showBoundaryTransitionParameterValue(transition, parameter.id)]
  )))
  return resolveShowToolkitParameters('transition', item.familyId, item.variantId, values, stageDimensions)
}

export function showBoundaryTransitionParameterValue(
  transition: ShowTransitionSettingsCarrier,
  parameterId: string,
): ShowToolkitParameterValue {
  if (parameterId === 'easing') return showEasingOptionId(transition.easing)
  const value = (transition as unknown as Record<string, ShowToolkitParameterValue>)[parameterId]
  if (value !== undefined) return value
  return parameterId === 'clockwise' ? true : 0
}

export function updateShowBoundaryTransitionParameter(
  show: ShowRecord,
  transitionId: string,
  item: ShowToolkitPresentationItem,
  parameterId: string,
  value: ShowToolkitParameterValue,
  stageDimensions?: 1 | 2 | 3,
): ShowRecord {
  const transition = show.transitions?.find((candidate) => candidate.id === transitionId)
  if (!transition || item.kind !== 'transition') return show
  const changes = showBoundaryTransitionParameterChanges(transition, item, parameterId, value, stageDimensions)
  return changes ? updateShowBoundaryTransition(show, transitionId, changes) : show
}

export function showBoundaryTransitionParameterChanges(
  transition: ShowTransitionSettingsCarrier,
  item: ShowToolkitPresentationItem,
  parameterId: string,
  value: ShowToolkitParameterValue,
  stageDimensions?: 1 | 2 | 3,
): ShowTransitionChanges | null {
  if (item.kind !== 'transition') return null
  const parameter = showBoundaryTransitionParameters(item, transition, stageDimensions)
    .find((candidate) => candidate.id === parameterId)
  if (!parameter) return null
  return {
    [parameterId]: persistedParameterValue(parameterId, value),
  } as ShowTransitionChanges
}

function transitionIdentity(familyId: string, variantId: string): ShowTransitionChanges {
  if (familyId === 'blend') {
    return variantId === 'crossfade'
      ? { kind: 'crossfade', crossfadePolicy: 'snapshot-live' }
      : { kind: 'cut' }
  }
  if (familyId === 'fade') return { kind: 'fade-color' }
  if (familyId === 'wipe') return { kind: 'wipe', wipeVariant: variantId as ShowBoundaryTransition['wipeVariant'] }
  if (familyId === 'dissolve') return { kind: 'dither', dissolveVariant: variantId as ShowBoundaryTransition['dissolveVariant'] }
  if (familyId === 'shape-reveal') return { kind: 'portal', shape: variantId as ShowBoundaryTransition['shape'] }
  if (familyId === 'motion') return { kind: 'motion', motionVariant: variantId as ShowBoundaryTransition['motionVariant'] }
  throw new Error(`Unsupported Show Transition family ${familyId}.`)
}

function persistedParameterValue(
  parameterId: string,
  value: ShowToolkitParameterValue,
): ShowToolkitParameterValue | ReturnType<typeof showEasingFromOptionId> {
  return parameterId === 'easing' ? showEasingFromOptionId(String(value)) : value
}

/** kind (+ optional variant) to visual-toolkit family/variant. */
const KIND_TO_FAMILY: Record<string, { familyId: string; defaultVariant: string }> = {
  cut: { familyId: 'blend', defaultVariant: 'cut' },
  crossfade: { familyId: 'blend', defaultVariant: 'crossfade' },
  'fade-color': { familyId: 'fade', defaultVariant: 'through-color' },
  wipe: { familyId: 'wipe', defaultVariant: 'linear' },
  dither: { familyId: 'dissolve', defaultVariant: 'pixel' },
  portal: { familyId: 'shape-reveal', defaultVariant: 'circle' },
  motion: { familyId: 'motion', defaultVariant: 'cover' },
}

export function toolkitTransitionItem(
  kind: string,
  variant: string | undefined,
): { ok: true; item: ShowToolkitPresentationItem } | { ok: false; issue: { code: 'invalid-argument'; message: string } } {
  const mapping = KIND_TO_FAMILY[kind]
  if (!mapping) {
    return {
      ok: false,
      issue: {
        code: 'invalid-argument',
        message: `Unknown Transition kind "${kind}". Kinds: ${Object.keys(KIND_TO_FAMILY).join(', ')}.`,
      },
    }
  }
  const family = getShowToolkitFamily('transition', mapping.familyId)
  const variantId = variant ?? mapping.defaultVariant
  if (!family?.variants.some((candidate) => candidate.id === variantId)) {
    return {
      ok: false,
      issue: {
        code: 'invalid-argument',
        message:
          `"${variantId}" is not a variant of the ${kind} Transition. Variants: ${
            family?.variants.map((candidate) => candidate.id).join(', ') ?? 'none'}.`,
      },
    }
  }
  return {
    ok: true,
    item: {
      kind: 'transition',
      familyId: mapping.familyId,
      variantId,
      key: `transition:${mapping.familyId}:${variantId}`,
    } as unknown as ShowToolkitPresentationItem,
  }
}
