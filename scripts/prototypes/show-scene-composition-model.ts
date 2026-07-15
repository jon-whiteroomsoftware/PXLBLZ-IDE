/**
 * Question: can Show-owned Pattern instances plus Scene-owned placements
 * preserve cross-Scene continuity while making split, duplicate, extend, and
 * trim behavior explicit enough for a one-level Scene composition editor?
 *
 * This is design-prototype logic, not a production schema or migration.
 */

export interface PrototypePatternInstance {
  id: string
  patternName: string
  timeScale: number
  timeOffsetMs: number
  controls: Record<string, number>
}

export interface PrototypePlacement {
  id: string
  instanceId: string
  role: 'base' | 'overlay'
  zoneIds: string[]
  startMs: number
  durationMs: number
  mirror: boolean
  brightness: number
  effects: string[]
}

export interface PrototypeKeyframe {
  id: string
  timeMs: number
  value: number
}

export interface PrototypeAnimationTrack {
  id: string
  placementId: string
  property: string
  keyframes: PrototypeKeyframe[]
}

export interface PrototypeScene {
  id: string
  name: string
  durationMs: number
  placements: PrototypePlacement[]
  animations: PrototypeAnimationTrack[]
  outgoingTransition: string
}

export interface SceneCompositionPrototypeState {
  zones: string[]
  instances: PrototypePatternInstance[]
  scenes: PrototypeScene[]
  selectedSceneId: string
  nextId: number
}

export type DuplicateInstancePolicy = 'restart' | 'continue'
export type ExtendTailPolicy = 'hold' | 'empty'

function nextId(state: SceneCompositionPrototypeState, prefix: string): [string, SceneCompositionPrototypeState] {
  return [`${prefix}-${state.nextId}`, { ...state, nextId: state.nextId + 1 }]
}

function selectedSceneIndex(state: SceneCompositionPrototypeState): number {
  return state.scenes.findIndex((scene) => scene.id === state.selectedSceneId)
}

function replaceSelectedScene(
  state: SceneCompositionPrototypeState,
  scene: PrototypeScene,
): SceneCompositionPrototypeState {
  const index = selectedSceneIndex(state)
  if (index < 0) return state
  return {
    ...state,
    scenes: state.scenes.map((candidate, candidateIndex) => candidateIndex === index ? scene : candidate),
  }
}

function valueAt(track: PrototypeAnimationTrack, timeMs: number): number | undefined {
  const ordered = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs)
  const before = [...ordered].reverse().find((keyframe) => keyframe.timeMs <= timeMs)
  const after = ordered.find((keyframe) => keyframe.timeMs >= timeMs)
  if (!before) return after?.value
  if (!after) return before.value
  if (before.timeMs === after.timeMs) return before.value
  const progress = (timeMs - before.timeMs) / (after.timeMs - before.timeMs)
  return before.value + (after.value - before.value) * progress
}

export function selectAdjacentScene(
  state: SceneCompositionPrototypeState,
  offset: -1 | 1,
): SceneCompositionPrototypeState {
  const index = selectedSceneIndex(state)
  if (index < 0) return state
  const nextIndex = Math.max(0, Math.min(state.scenes.length - 1, index + offset))
  return { ...state, selectedSceneId: state.scenes[nextIndex].id }
}

export function splitSelectedScene(
  initial: SceneCompositionPrototypeState,
  atMs: number,
): SceneCompositionPrototypeState {
  const sceneIndex = selectedSceneIndex(initial)
  const source = initial.scenes[sceneIndex]
  if (!source || atMs <= 0 || atMs >= source.durationMs) return initial

  let state = initial
  let rightSceneId: string
  ;[rightSceneId, state] = nextId(state, 'scene')

  const rightPlacementIdBySource = new Map<string, string>()
  const leftPlacements: PrototypePlacement[] = []
  const rightPlacements: PrototypePlacement[] = []

  for (const placement of source.placements) {
    const endMs = placement.startMs + placement.durationMs
    if (endMs <= atMs) {
      leftPlacements.push(placement)
      continue
    }
    if (placement.startMs >= atMs) {
      rightPlacements.push({ ...placement, startMs: placement.startMs - atMs })
      rightPlacementIdBySource.set(placement.id, placement.id)
      continue
    }

    let rightPlacementId: string
    ;[rightPlacementId, state] = nextId(state, 'placement')
    leftPlacements.push({ ...placement, durationMs: atMs - placement.startMs })
    rightPlacements.push({
      ...placement,
      id: rightPlacementId,
      startMs: 0,
      durationMs: endMs - atMs,
    })
    rightPlacementIdBySource.set(placement.id, rightPlacementId)
  }

  const leftAnimations: PrototypeAnimationTrack[] = []
  const rightAnimations: PrototypeAnimationTrack[] = []
  for (const track of source.animations) {
    const target = source.placements.find((placement) => placement.id === track.placementId)
    if (!target) continue
    const targetEndMs = target.startMs + target.durationMs
    const leftFrames = track.keyframes.filter((keyframe) => keyframe.timeMs <= atMs)
    const rightFrames = track.keyframes
      .filter((keyframe) => keyframe.timeMs >= atMs)
      .map((keyframe) => ({ ...keyframe, timeMs: keyframe.timeMs - atMs }))
    const splitValue = valueAt(track, atMs)

    if (target.startMs < atMs && leftFrames.length > 0) {
      leftAnimations.push({
        ...track,
        keyframes: splitValue === undefined || leftFrames.some((keyframe) => keyframe.timeMs === atMs)
          ? leftFrames
          : [...leftFrames, { id: `${track.id}-split-left`, timeMs: atMs, value: splitValue }],
      })
    }

    const rightPlacementId = rightPlacementIdBySource.get(track.placementId)
    if (targetEndMs > atMs && rightPlacementId && (rightFrames.length > 0 || splitValue !== undefined)) {
      let rightTrackId: string
      ;[rightTrackId, state] = nextId(state, 'track')
      rightAnimations.push({
        ...track,
        id: rightTrackId,
        placementId: rightPlacementId,
        keyframes: splitValue === undefined || rightFrames.some((keyframe) => keyframe.timeMs === 0)
          ? rightFrames
          : [{ id: `${rightTrackId}-split`, timeMs: 0, value: splitValue }, ...rightFrames],
      })
    }
  }

  const left: PrototypeScene = {
    ...source,
    durationMs: atMs,
    placements: leftPlacements,
    animations: leftAnimations,
    outgoingTransition: 'Cut',
  }
  const right: PrototypeScene = {
    ...source,
    id: rightSceneId,
    name: `${source.name} part 2`,
    durationMs: source.durationMs - atMs,
    placements: rightPlacements,
    animations: rightAnimations,
  }

  return {
    ...state,
    scenes: [
      ...state.scenes.slice(0, sceneIndex),
      left,
      right,
      ...state.scenes.slice(sceneIndex + 1),
    ],
    selectedSceneId: right.id,
  }
}

export function duplicateSelectedScene(
  initial: SceneCompositionPrototypeState,
  policy: DuplicateInstancePolicy,
): SceneCompositionPrototypeState {
  const sceneIndex = selectedSceneIndex(initial)
  const source = initial.scenes[sceneIndex]
  if (!source) return initial

  let state = initial
  let sceneId: string
  ;[sceneId, state] = nextId(state, 'scene')
  const instanceIdMap = new Map<string, string>()

  if (policy === 'restart') {
    for (const instanceId of new Set(source.placements.map((placement) => placement.instanceId))) {
      const sourceInstance = state.instances.find((instance) => instance.id === instanceId)
      if (!sourceInstance) continue
      let instanceCopyId: string
      ;[instanceCopyId, state] = nextId(state, 'instance')
      state = {
        ...state,
        instances: [...state.instances, { ...sourceInstance, id: instanceCopyId }],
      }
      instanceIdMap.set(instanceId, instanceCopyId)
    }
  }

  const placementIdMap = new Map<string, string>()
  const placements = source.placements.map((placement) => {
    let placementId: string
    ;[placementId, state] = nextId(state, 'placement')
    placementIdMap.set(placement.id, placementId)
    return {
      ...placement,
      id: placementId,
      instanceId: instanceIdMap.get(placement.instanceId) ?? placement.instanceId,
    }
  })
  const animations = source.animations.map((track) => {
    let trackId: string
    ;[trackId, state] = nextId(state, 'track')
    return {
      ...track,
      id: trackId,
      placementId: placementIdMap.get(track.placementId) ?? track.placementId,
      keyframes: track.keyframes.map((keyframe) => ({ ...keyframe, id: `${trackId}-${keyframe.timeMs}` })),
    }
  })
  const duplicate: PrototypeScene = {
    ...source,
    id: sceneId,
    name: `${source.name} copy`,
    placements,
    animations,
  }

  return {
    ...state,
    scenes: [
      ...state.scenes.slice(0, sceneIndex + 1),
      duplicate,
      ...state.scenes.slice(sceneIndex + 1),
    ],
    selectedSceneId: duplicate.id,
  }
}

export function extendSelectedScene(
  state: SceneCompositionPrototypeState,
  deltaMs: number,
  policy: ExtendTailPolicy,
): SceneCompositionPrototypeState {
  const scene = state.scenes[selectedSceneIndex(state)]
  if (!scene || deltaMs <= 0) return state
  const previousDurationMs = scene.durationMs
  const placements = policy === 'empty'
    ? scene.placements
    : scene.placements.map((placement) => {
        if (placement.role !== 'base') return placement
        const placementEndMs = placement.startMs + placement.durationMs
        const ownsTail = placement.zoneIds.some((zoneId) => (
          placementEndMs === previousDurationMs
          && !scene.placements.some((candidate) => (
            candidate.role === 'base'
            && candidate.id !== placement.id
            && candidate.zoneIds.includes(zoneId)
            && candidate.startMs >= placementEndMs
          ))
        ))
        return ownsTail ? { ...placement, durationMs: placement.durationMs + deltaMs } : placement
      })
  return replaceSelectedScene(state, {
    ...scene,
    durationMs: scene.durationMs + deltaMs,
    placements,
  })
}

export function trimSelectedScene(
  state: SceneCompositionPrototypeState,
  durationMs: number,
): SceneCompositionPrototypeState {
  const scene = state.scenes[selectedSceneIndex(state)]
  if (!scene || durationMs <= 0 || durationMs >= scene.durationMs) return state
  const placements = scene.placements.flatMap((placement) => {
    if (placement.startMs >= durationMs) return []
    return [{
      ...placement,
      durationMs: Math.min(placement.durationMs, durationMs - placement.startMs),
    }]
  })
  const retainedPlacementIds = new Set(placements.map((placement) => placement.id))
  const animations = scene.animations.flatMap((track) => {
    if (!retainedPlacementIds.has(track.placementId)) return []
    const keyframes = track.keyframes.filter((keyframe) => keyframe.timeMs <= durationMs)
    return keyframes.length > 0 ? [{ ...track, keyframes }] : []
  })
  return replaceSelectedScene(state, { ...scene, durationMs, placements, animations })
}

export function validateState(state: SceneCompositionPrototypeState): string[] {
  const errors: string[] = []
  const instanceIds = new Set(state.instances.map((instance) => instance.id))
  for (const scene of state.scenes) {
    const placementIds = new Set(scene.placements.map((placement) => placement.id))
    for (const placement of scene.placements) {
      if (!instanceIds.has(placement.instanceId)) errors.push(`${scene.id}/${placement.id}: missing instance`)
      if (placement.startMs < 0 || placement.durationMs <= 0 || placement.startMs + placement.durationMs > scene.durationMs) {
        errors.push(`${scene.id}/${placement.id}: outside Scene time`)
      }
      for (const zoneId of placement.zoneIds) {
        if (!state.zones.includes(zoneId)) errors.push(`${scene.id}/${placement.id}: unknown zone ${zoneId}`)
      }
    }
    for (const zoneId of state.zones) {
      const base = scene.placements
        .filter((placement) => placement.role === 'base' && placement.zoneIds.includes(zoneId))
        .sort((a, b) => a.startMs - b.startMs)
      for (let index = 1; index < base.length; index += 1) {
        const previous = base[index - 1]
        if (previous.startMs + previous.durationMs > base[index].startMs) {
          errors.push(`${scene.id}/${zoneId}: overlapping base placements`)
        }
      }
    }
    for (const track of scene.animations) {
      if (!placementIds.has(track.placementId)) errors.push(`${scene.id}/${track.id}: missing placement target`)
      if (track.keyframes.some((keyframe) => keyframe.timeMs < 0 || keyframe.timeMs > scene.durationMs)) {
        errors.push(`${scene.id}/${track.id}: keyframe outside Scene time`)
      }
    }
  }
  return errors
}

export function createPrototypeState(): SceneCompositionPrototypeState {
  return {
    zones: ['left', 'center', 'right'],
    instances: [
      { id: 'instance-orchard', patternName: 'Neon orchard', timeScale: 1, timeOffsetMs: 0, controls: { density: 0.7 } },
      { id: 'instance-pulse', patternName: 'Pulse rings', timeScale: 1, timeOffsetMs: 0, controls: {} },
      { id: 'instance-overlay', patternName: 'Prismatic veil', timeScale: 0.7, timeOffsetMs: 120, controls: { spread: 0.4 } },
      { id: 'instance-afterglow', patternName: 'Afterglow', timeScale: 1, timeOffsetMs: 0, controls: {} },
    ],
    scenes: [
      {
        id: 'scene-arrival',
        name: 'Arrival',
        durationMs: 1000,
        outgoingTransition: 'Cut',
        placements: [{
          id: 'placement-arrival',
          instanceId: 'instance-orchard',
          role: 'base',
          zoneIds: ['left', 'center', 'right'],
          startMs: 0,
          durationMs: 1000,
          mirror: false,
          brightness: 1,
          effects: [],
        }],
        animations: [],
      },
      {
        id: 'scene-neon',
        name: 'Neon orchard',
        durationMs: 2000,
        outgoingTransition: 'Motion',
        placements: [
          { id: 'cut-1', instanceId: 'instance-orchard', role: 'base', zoneIds: ['left', 'center', 'right'], startMs: 0, durationMs: 60, mirror: false, brightness: 1, effects: ['Hue'] },
          { id: 'cut-2', instanceId: 'instance-pulse', role: 'base', zoneIds: ['left', 'center', 'right'], startMs: 60, durationMs: 60, mirror: false, brightness: 1, effects: [] },
          { id: 'cut-3', instanceId: 'instance-orchard', role: 'base', zoneIds: ['left', 'center', 'right'], startMs: 120, durationMs: 60, mirror: true, brightness: 0.8, effects: ['Hue'] },
          { id: 'cut-4', instanceId: 'instance-pulse', role: 'base', zoneIds: ['left', 'center', 'right'], startMs: 180, durationMs: 70, mirror: false, brightness: 1, effects: [] },
          { id: 'base-tail', instanceId: 'instance-orchard', role: 'base', zoneIds: ['left', 'center', 'right'], startMs: 250, durationMs: 1750, mirror: false, brightness: 1, effects: ['Hue', 'Contrast'] },
          { id: 'overlay', instanceId: 'instance-overlay', role: 'overlay', zoneIds: ['left', 'center', 'right'], startMs: 180, durationMs: 1220, mirror: false, brightness: 0.7, effects: ['Scale', 'Opacity'] },
        ],
        animations: [{
          id: 'track-opacity',
          placementId: 'overlay',
          property: 'opacity',
          keyframes: [
            { id: 'opacity-1', timeMs: 180, value: 0 },
            { id: 'opacity-2', timeMs: 500, value: 1 },
            { id: 'opacity-3', timeMs: 1400, value: 0 },
          ],
        }],
      },
      {
        id: 'scene-afterglow',
        name: 'Afterglow',
        durationMs: 1500,
        outgoingTransition: 'Cut',
        placements: [{
          id: 'placement-afterglow',
          instanceId: 'instance-afterglow',
          role: 'base',
          zoneIds: ['left', 'center', 'right'],
          startMs: 0,
          durationMs: 1500,
          mirror: false,
          brightness: 1,
          effects: [],
        }],
        animations: [],
      },
    ],
    selectedSceneId: 'scene-neon',
    nextId: 1,
  }
}
