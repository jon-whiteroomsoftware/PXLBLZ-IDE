export interface RestartGlobalLifetime {
  startMs: number
  endMs: number
}

export interface RestartGlobalSlot {
  name: string
  kind?: 'scalar' | 'array'
  reinitializable: boolean
  initializerSource: string
  liveOwnership?: boolean
}

export interface RestartGlobalOwner {
  id: string
  intervals: RestartGlobalLifetime[]
  occurrenceCount: number
  hasLiveControls: boolean
  slots: RestartGlobalSlot[]
}

export type RestartGlobalExclusionReason =
  | 'continue'
  | 'live-controls'
  | 'unproved-lifetime'
  | 'array-state'
  | 'unproved-initializer'
  | 'live-public-state'

export interface RestartGlobalAssignment {
  ownerId: string
  slotName: string
  color: number
}

export interface RestartGlobalOwnerReport {
  id: string
  globalsBefore: number
  eligibleGlobals: number
  excludedGlobals: number
  exclusionReasons: RestartGlobalExclusionReason[]
  overlaps: string[]
}

export interface RestartGlobalLivenessReport {
  globalsBefore: number
  globalsAfter: number
  reclaimedGlobals: number
  reclaimPercent: number
  eligibleGlobals: number
  excludedGlobals: number
  assignments: RestartGlobalAssignment[]
  owners: RestartGlobalOwnerReport[]
  entryInitialization: {
    ownerCount: number
    assignmentCount: number
    addedSymbols: number
    estimatedSourceBytes: number
  }
  steadyStateRenderOperationsAdded: 0
}

interface EligibleSlot {
  ownerId: string
  slot: RestartGlobalSlot
  intervals: RestartGlobalLifetime[]
}

export interface RestartMemberLifetime {
  id: string
  occurrenceCount: number
  intervals: RestartGlobalLifetime[]
}

export interface CompiledMemberGlobalSlots {
  id: string
  slots: RestartGlobalSlot[]
}

export interface RestartCompiledMemberOwnership {
  id: string
  renamedBindings: string[]
  renamedPatternVars: string[]
}

export interface RestartCompiledAnalysisOptions {
  members?: RestartCompiledMemberOwnership[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

const exclusionOrder: RestartGlobalExclusionReason[] = [
  'continue',
  'live-controls',
  'unproved-lifetime',
  'array-state',
  'unproved-initializer',
  'live-public-state',
]

export function colorRestartGlobalLifetimes(owners: RestartGlobalOwner[]): RestartGlobalLivenessReport {
  const eligibleSlots: EligibleSlot[] = []
  const ownerReports = new Map<string, RestartGlobalOwnerReport>()

  for (const owner of owners) {
    const ownerReasons = new Set<RestartGlobalExclusionReason>()
    if (owner.occurrenceCount !== 1) ownerReasons.add('continue')
    if (owner.hasLiveControls) ownerReasons.add('live-controls')
    if (!hasProvedLifetime(owner.intervals)) ownerReasons.add('unproved-lifetime')
    const wholeOwnerExcluded = ownerReasons.size > 0
    let eligibleGlobals = 0

    for (const slot of owner.slots) {
      if ((slot.kind ?? 'scalar') === 'array') ownerReasons.add('array-state')
      if (!slot.reinitializable) ownerReasons.add('unproved-initializer')
      if (slot.liveOwnership) ownerReasons.add('live-public-state')
      if (
        !wholeOwnerExcluded
        && (slot.kind ?? 'scalar') === 'scalar'
        && slot.reinitializable
        && !slot.liveOwnership
      ) {
        eligibleSlots.push({ ownerId: owner.id, slot, intervals: owner.intervals })
        eligibleGlobals += 1
      }
    }

    ownerReports.set(owner.id, {
      id: owner.id,
      globalsBefore: owner.slots.length,
      eligibleGlobals,
      excludedGlobals: owner.slots.length - eligibleGlobals,
      exclusionReasons: orderedReasons(ownerReasons),
      overlaps: [],
    })
  }

  for (let left = 0; left < owners.length; left += 1) {
    for (let right = left + 1; right < owners.length; right += 1) {
      if (!ownersOverlap(owners[left], owners[right])) continue
      ownerReports.get(owners[left].id)?.overlaps.push(owners[right].id)
      ownerReports.get(owners[right].id)?.overlaps.push(owners[left].id)
    }
  }

  const colors: EligibleSlot[][] = []
  const assignments: RestartGlobalAssignment[] = []
  for (const candidate of eligibleSlots) {
    let color = colors.findIndex((assigned) => assigned.every((entry) => !intervalSetsOverlap(
      entry.intervals,
      candidate.intervals,
    )))
    if (color < 0) {
      color = colors.length
      colors.push([])
    }
    colors[color].push(candidate)
    assignments.push({ ownerId: candidate.ownerId, slotName: candidate.slot.name, color })
  }

  const globalsBefore = owners.reduce((sum, owner) => sum + owner.slots.length, 0)
  const eligibleGlobals = eligibleSlots.length
  const excludedGlobals = globalsBefore - eligibleGlobals
  const globalsAfter = excludedGlobals + colors.length
  const reclaimedGlobals = globalsBefore - globalsAfter
  const entryOwners = new Set(eligibleSlots.map((entry) => entry.ownerId))
  const estimatedSourceBytes = eligibleSlots.reduce((sum, entry) => (
    sum + entry.slot.name.length + entry.slot.initializerSource.length + 2
  ), entryOwners.size * 18)

  return {
    globalsBefore,
    globalsAfter,
    reclaimedGlobals,
    reclaimPercent: globalsBefore > 0 ? reclaimedGlobals / globalsBefore : 0,
    eligibleGlobals,
    excludedGlobals,
    assignments,
    owners: [...ownerReports.values()].map((owner) => ({
      ...owner,
      overlaps: [...owner.overlaps].sort(),
    })),
    entryInitialization: {
      ownerCount: entryOwners.size,
      assignmentCount: eligibleSlots.length,
      addedSymbols: entryOwners.size,
      estimatedSourceBytes,
    },
    steadyStateRenderOperationsAdded: 0,
  }
}

export function deriveRestartMemberLifetimes(recipe: ShowRecipe): RestartMemberLifetime[] {
  const byId = new Map(recipe.clips.map((clip) => [clip.id, {
    id: clip.id,
    occurrenceCount: 0,
    intervals: [] as RestartGlobalLifetime[],
  }]))
  const scenes = recipe.routedSceneSequence?.scenes.map((scene) => ({
    holdMs: scene.holdMs,
    transitionDurationMs: Math.max(0, scene.transitionOut?.durationMs ?? 0),
    clipIds: [...new Set(scene.placements.map((placement) => placement.clipId))],
  })) ?? recipe.sceneSequence?.scenes.map((scene) => ({
    holdMs: scene.holdMs,
    transitionDurationMs: Math.max(0, scene.transitionOut?.durationMs ?? 0),
    clipIds: [scene.clipId],
  }))

  if (!scenes) {
    const horizon = Math.max(1, recipe.loopDurationMs ?? 1)
    for (const clip of recipe.clips) {
      const entry = byId.get(clip.id)!
      entry.occurrenceCount = 1
      entry.intervals.push({ startMs: 0, endMs: horizon })
    }
    return [...byId.values()]
  }

  let cursorMs = 0
  let precedingTransitionMs = 0
  for (const scene of scenes) {
    const startMs = Math.max(0, cursorMs - precedingTransitionMs)
    const endMs = cursorMs + Math.max(0, scene.holdMs) + scene.transitionDurationMs
    for (const clipId of scene.clipIds) {
      const entry = byId.get(clipId)
      if (!entry) continue
      entry.occurrenceCount += 1
      entry.intervals.push({ startMs, endMs })
    }
    cursorMs = endMs
    precedingTransitionMs = scene.transitionDurationMs
  }

  return [...byId.values()]
}

export function inspectCompiledMemberGlobalSlots(
  source: string,
  clipIds: string[],
  options: RestartCompiledAnalysisOptions = {},
): CompiledMemberGlobalSlots[] {
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as Node
  const slotsByIndex = new Map<number, RestartGlobalSlot[]>()
  for (const statement of ast.body as Node[]) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const item of declaration.declarations as Node[]) {
      if (item.id?.type !== 'Identifier') continue
      const match = /^__pxlblz_show_c(\d+)_/.exec(item.id.name)
      if (!match) continue
      const memberIndex = Number(match[1])
      if (!Number.isInteger(memberIndex) || memberIndex < 0 || memberIndex >= clipIds.length) continue
      const init = item.init as Node | null
      const kind = isArrayInitializer(init) ? 'array' as const : 'scalar' as const
      const initializerSource = init ? source.slice(init.start, init.end) : '0'
      const ownership = options.members?.[memberIndex]
      const privateBindings = ownership
        ? new Set(ownership.renamedBindings.filter((name) => !ownership.renamedPatternVars.includes(name)))
        : null
      const liveOwnership = privateBindings
        ? !privateBindings.has(item.id.name) && !isSafeGeneratedMemberSlot(item.id.name, memberIndex)
        : false
      const slots = slotsByIndex.get(memberIndex) ?? []
      slots.push({
        name: item.id.name,
        kind,
        reinitializable: kind === 'scalar' && isProvedInitializer(init),
        initializerSource,
        ...(liveOwnership ? { liveOwnership: true } : {}),
      })
      slotsByIndex.set(memberIndex, slots)
    }
  }

  return clipIds.map((id, index) => ({ id, slots: slotsByIndex.get(index) ?? [] }))
}

export function analyzeCompiledRestartGlobalLiveness(
  recipe: ShowRecipe,
  compiledSource: string,
  options: RestartCompiledAnalysisOptions = {},
): RestartGlobalLivenessReport {
  const lifetimes = new Map(deriveRestartMemberLifetimes(recipe).map((entry) => [entry.id, entry]))
  const slots = inspectCompiledMemberGlobalSlots(compiledSource, recipe.clips.map((clip) => clip.id), options)
  return colorRestartGlobalLifetimes(slots.map((member, index) => {
    const clip = recipe.clips[index]
    const lifetime = lifetimes.get(member.id)
    return {
      id: member.id,
      intervals: lifetime?.intervals ?? [],
      occurrenceCount: lifetime?.occurrenceCount ?? 0,
      hasLiveControls: Object.keys(clip.controlTargets ?? {}).length > 0,
      slots: member.slots,
    }
  }))
}

function orderedReasons(reasons: Set<RestartGlobalExclusionReason>): RestartGlobalExclusionReason[] {
  return exclusionOrder.filter((reason) => reasons.has(reason))
}

function hasProvedLifetime(intervals: RestartGlobalLifetime[]): boolean {
  return intervals.length > 0 && intervals.every((interval) => (
    Number.isFinite(interval.startMs)
    && Number.isFinite(interval.endMs)
    && interval.startMs >= 0
    && interval.endMs > interval.startMs
  ))
}

function ownersOverlap(left: RestartGlobalOwner, right: RestartGlobalOwner): boolean {
  return intervalSetsOverlap(left.intervals, right.intervals)
}

function intervalSetsOverlap(left: RestartGlobalLifetime[], right: RestartGlobalLifetime[]): boolean {
  return left.some((leftInterval) => right.some((rightInterval) => (
    leftInterval.startMs < rightInterval.endMs
    && rightInterval.startMs < leftInterval.endMs
  )))
}

function isArrayInitializer(node: Node | null): boolean {
  if (!node) return false
  if (node.type === 'ArrayExpression') return true
  return node.type === 'CallExpression'
    && node.callee?.type === 'Identifier'
    && /(^|_)array$/.test(node.callee.name)
}

function isProvedInitializer(node: Node | null): boolean {
  if (!node) return true
  if (node.type === 'Literal' || node.type === 'Identifier') return true
  if (node.type === 'UnaryExpression') return isProvedInitializer(node.argument)
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    return isProvedInitializer(node.left) && isProvedInitializer(node.right)
  }
  if (node.type === 'ConditionalExpression') {
    return isProvedInitializer(node.test)
      && isProvedInitializer(node.consequent)
      && isProvedInitializer(node.alternate)
  }
  if (node.type === 'SequenceExpression') return node.expressions.every((entry: Node) => isProvedInitializer(entry))
  return false
}

function isSafeGeneratedMemberSlot(name: string, memberIndex: number): boolean {
  const prefix = `__pxlblz_show_c${memberIndex}_`
  if (!name.startsWith(prefix)) return false
  const suffix = name.slice(prefix.length)
  return suffix === 'elapsed_ms'
    || suffix === 'elapsed_s'
    || suffix === 'pixelCount'
    || suffix === 'r'
    || suffix === 'g'
    || suffix === 'b'
    || suffix === 'alpha'
}
import * as acorn from 'acorn'
import type { ShowRecipe } from '../../src/engine/showCompiler'
