import type { ShowClipEffect } from './personalContentRecords'
import { showEffectParameterNames } from './showEffects'

export interface ShowGeneratedEffectKernelMember {
  id: string
  effects: ShowClipEffect[]
  animatedParameterPaths: string[]
  adaptationShape: {
    mirror: boolean
    lightShutter: boolean
    steppedClock: boolean
    brightnessScale: boolean
  }
  compositionEnvironment: {
    outputDimension: 1 | 2
    contentKey: boolean
    coordinateField: boolean
    staticPlanEffects: boolean
  }
}

export interface ShowGeneratedEffectKernelGroup {
  id: string
  family: 'affine-scale'
  memberIds: string[]
  parameterNames: string[]
  privateStatePolicy: 'member-owned'
  controlPolicy: 'member-owned'
  clockPolicy: 'member-owned'
  perPixelBranchesAdded: 0
}

export interface ShowGeneratedEffectKernelPlan {
  groups: ShowGeneratedEffectKernelGroup[]
  members: Array<{
    id: string
    status: 'selected' | 'unrolled'
    reason: 'selected' | 'no-repeat' | 'unsupported-family'
  }>
}

export interface ShowGeneratedKernelRepresentationInput {
  exactFast: boolean
  exactPrecise: boolean
  baselineControllerBytecode: number
  sharedControllerBytecode: number
}

export interface ShowGeneratedKernelRepresentationSelection {
  selected: boolean
  reason: 'selected' | 'parity' | 'controller-bytecode'
  controllerBytecodeDelta: number
}

export const SHOW_GENERATED_EFFECT_KERNEL_QUALIFICATION = {
  family: 'animated affine Scale Effect',
  controller: {
    boardType: 'pb32',
    firmwareVersion: '3.67',
    pixelCount: 2_000,
  },
  minimumMembers: 2,
  cases: [
    {
      memberCount: 2,
      baselineSourceBytes: 7_665,
      sharedSourceBytes: 5_954,
      baselineExpandedSourceBytes: 12_591,
      sharedExpandedSourceBytes: 8_930,
      baselineControllerBytecodeBytes: 4_586,
      sharedControllerBytecodeBytes: 3_962,
      persistentGlobalsAvoided: 6,
    },
    {
      memberCount: 5,
      baselineSourceBytes: 18_334,
      sharedSourceBytes: 12_584,
      baselineExpandedSourceBytes: 29_735,
      sharedExpandedSourceBytes: 18_880,
      baselineControllerBytecodeBytes: 10_718,
      sharedControllerBytecodeBytes: 7_898,
      persistentGlobalsAvoided: 24,
    },
    {
      memberCount: 10,
      baselineSourceBytes: 36_409,
      sharedSourceBytes: 23_857,
      baselineExpandedSourceBytes: 58_494,
      sharedExpandedSourceBytes: 35_649,
      baselineControllerBytecodeBytes: 20_938,
      sharedControllerBytecodeBytes: 14_458,
      persistentGlobalsAvoided: 54,
    },
  ],
} as const

interface Candidate {
  member: ShowGeneratedEffectKernelMember
  key: string
}

export function planShowGeneratedEffectKernels(
  members: ShowGeneratedEffectKernelMember[],
): ShowGeneratedEffectKernelPlan {
  const candidates: Candidate[] = []
  const unsupported = new Set<string>()
  for (const member of members) {
    if (!isNarrowScaleFamily(member)) {
      unsupported.add(member.id)
      continue
    }
    candidates.push({ member, key: structuralKey(member) })
  }

  const byKey = new Map<string, Candidate[]>()
  for (const candidate of candidates) {
    const group = byKey.get(candidate.key) ?? []
    group.push(candidate)
    byKey.set(candidate.key, group)
  }

  const repeated = [...byKey.values()].filter((group) => group.length >= 2)
  const selectedIds = new Set(repeated.flatMap((group) => group.map((candidate) => candidate.member.id)))
  const groups = repeated.map((group, index): ShowGeneratedEffectKernelGroup => ({
    id: `affine-scale-${index}`,
    family: 'affine-scale',
    memberIds: group.map((candidate) => candidate.member.id),
    parameterNames: ['x', 'y'],
    privateStatePolicy: 'member-owned',
    controlPolicy: 'member-owned',
    clockPolicy: 'member-owned',
    perPixelBranchesAdded: 0,
  }))

  return {
    groups,
    members: members.map((member) => selectedIds.has(member.id)
      ? { id: member.id, status: 'selected', reason: 'selected' }
      : unsupported.has(member.id)
        ? { id: member.id, status: 'unrolled', reason: 'unsupported-family' }
        : { id: member.id, status: 'unrolled', reason: 'no-repeat' }),
  }
}

export function selectShowGeneratedKernelRepresentation(
  input: ShowGeneratedKernelRepresentationInput,
): ShowGeneratedKernelRepresentationSelection {
  const controllerBytecodeDelta = input.sharedControllerBytecode - input.baselineControllerBytecode
  if (!input.exactFast || !input.exactPrecise) {
    return { selected: false, reason: 'parity', controllerBytecodeDelta }
  }
  if (controllerBytecodeDelta >= 0) {
    return { selected: false, reason: 'controller-bytecode', controllerBytecodeDelta }
  }
  return { selected: true, reason: 'selected', controllerBytecodeDelta }
}

function isNarrowScaleFamily(member: ShowGeneratedEffectKernelMember): boolean {
  return !member.compositionEnvironment.staticPlanEffects
    && member.effects.length === 1
    && member.effects[0].kind === 'scale'
}

function structuralKey(member: ShowGeneratedEffectKernelMember): string {
  return JSON.stringify({
    effects: member.effects.map((effect) => ({
      kind: effect.kind,
      parameters: showEffectParameterNames(effect),
    })),
    animatedParameterPaths: member.animatedParameterPaths,
    adaptationShape: member.adaptationShape,
    compositionEnvironment: member.compositionEnvironment,
  })
}
