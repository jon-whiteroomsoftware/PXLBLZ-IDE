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

type TransitionChanges = Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>

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
): ShowRecord {
  if (item.kind !== 'transition') throw new Error(`${item.key} is not a Transition.`)
  const family = getShowToolkitFamily('transition', item.familyId)
  const variant = family?.variants.find((candidate) => candidate.id === item.variantId)
  if (!family || !variant) throw new Error(`Unsupported Show Transition ${item.key}.`)
  const preset = variant.presets?.find((candidate) => candidate.id === presetId)
  const parameters = resolveShowToolkitParameters('transition', item.familyId, item.variantId, {})
  const values = {
    ...Object.fromEntries(parameters.map((parameter) => [parameter.id, parameter.defaultValue])),
    ...(preset?.values ?? {}),
  }
  const changes: TransitionChanges = {
    ...transitionIdentity(item.familyId, item.variantId),
    ...Object.fromEntries(Object.entries(values).map(([parameterId, value]) => (
      [parameterId, persistedParameterValue(parameterId, value)]
    ))),
  } as TransitionChanges
  return updateShowBoundaryTransition(show, transitionId, changes)
}

export function showBoundaryTransitionParameters(
  item: ShowToolkitPresentationItem,
  transition: ShowBoundaryTransition,
): ShowToolkitParameterDescriptor[] {
  const family = getShowToolkitFamily('transition', item.familyId)
  if (!family) return []
  const values = Object.fromEntries(family.parameters.map((parameter) => (
    [parameter.id, showBoundaryTransitionParameterValue(transition, parameter.id)]
  )))
  return resolveShowToolkitParameters('transition', item.familyId, item.variantId, values)
}

export function showBoundaryTransitionParameterValue(
  transition: ShowBoundaryTransition,
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
): ShowRecord {
  const transition = show.transitions?.find((candidate) => candidate.id === transitionId)
  if (!transition || item.kind !== 'transition') return show
  const changes = showBoundaryTransitionParameterChanges(transition, item, parameterId, value)
  return changes ? updateShowBoundaryTransition(show, transitionId, changes) : show
}

export function showBoundaryTransitionParameterChanges(
  transition: ShowBoundaryTransition,
  item: ShowToolkitPresentationItem,
  parameterId: string,
  value: ShowToolkitParameterValue,
): TransitionChanges | null {
  if (item.kind !== 'transition') return null
  const parameter = showBoundaryTransitionParameters(item, transition)
    .find((candidate) => candidate.id === parameterId)
  if (!parameter) return null
  return {
    [parameterId]: persistedParameterValue(parameterId, value),
  } as TransitionChanges
}

function transitionIdentity(familyId: string, variantId: string): TransitionChanges {
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
