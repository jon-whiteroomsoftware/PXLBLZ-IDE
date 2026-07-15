import process from 'node:process'
import readline from 'node:readline'
import {
  createPrototypeState,
  duplicateSelectedScene,
  extendSelectedScene,
  selectAdjacentScene,
  splitSelectedScene,
  trimSelectedScene,
  validateState,
  type SceneCompositionPrototypeState,
} from './show-scene-composition-model.ts'

const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

function render(state: SceneCompositionPrototypeState): void {
  console.clear()
  const selected = state.scenes.find((scene) => scene.id === state.selectedSceneId)!
  const errors = validateState(state)
  console.log(`${BOLD}Scene composition ownership prototype${RESET}`)
  console.log(`${DIM}Show owns ${state.instances.length} Pattern instances; each Scene owns local placements and tracks.${RESET}\n`)
  console.log(`${BOLD}Scenes${RESET}`)
  for (const scene of state.scenes) {
    const selectedMarker = scene.id === selected.id ? '>' : ' '
    const instanceCount = new Set(scene.placements.map((placement) => placement.instanceId)).size
    console.log(`${selectedMarker} ${scene.name.padEnd(24)} ${String(scene.durationMs).padStart(5)} ms  ${scene.placements.length} placements  ${instanceCount} instances  -> ${scene.outgoingTransition}`)
  }
  console.log(`\n${BOLD}Selected: ${selected.name}${RESET}`)
  for (const placement of selected.placements) {
    console.log(`  ${placement.role.padEnd(7)} ${placement.id.padEnd(18)} ${String(placement.startMs).padStart(4)}-${String(placement.startMs + placement.durationMs).padEnd(4)}  ${placement.instanceId}`)
  }
  for (const track of selected.animations) {
    console.log(`  track   ${track.property} -> ${track.placementId}: ${track.keyframes.map((keyframe) => `${keyframe.timeMs}:${keyframe.value.toFixed(2)}`).join('  ')}`)
  }
  console.log(`\n${BOLD}Validation${RESET}: ${errors.length === 0 ? 'valid' : errors.join('; ')}`)
  console.log(`\n${BOLD}[←/→]${RESET} select  ${BOLD}[s]${RESET} split at 500 ms  ${BOLD}[r]${RESET} duplicate + restart  ${BOLD}[c]${RESET} duplicate + continue`)
  console.log(`${BOLD}[h]${RESET} extend 500 ms + hold  ${BOLD}[e]${RESET} extend 500 ms + empty  ${BOLD}[t]${RESET} trim 500 ms  ${BOLD}[q]${RESET} quit`)
}

function runDemo(): void {
  let state = createPrototypeState()
  const log = (label: string): void => {
    const scene = state.scenes.find((candidate) => candidate.id === state.selectedSceneId)!
    const errors = validateState(state)
    console.log(`${label}: ${scene.name}; ${scene.durationMs} ms; ${scene.placements.length} placements; ${scene.animations.length} tracks; ${errors.length} errors`)
  }
  log('initial')
  state = splitSelectedScene(state, 500)
  log('split')
  state = duplicateSelectedScene(state, 'restart')
  log('duplicate restart')
  state = extendSelectedScene(state, 500, 'hold')
  log('extend hold')
  state = trimSelectedScene(state, Math.max(1, state.scenes.find((scene) => scene.id === state.selectedSceneId)!.durationMs - 500))
  log('trim')
}

if (process.argv.includes('--demo')) {
  runDemo()
  process.exit(0)
}

if (!process.stdin.isTTY) {
  console.error('This prototype needs an interactive terminal. Run: npm run prototype:scene-composition')
  process.exit(1)
}

let state = createPrototypeState()
readline.emitKeypressEvents(process.stdin)
process.stdin.setRawMode(true)
render(state)
process.stdin.on('keypress', (_value, key) => {
  if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
    process.stdin.setRawMode(false)
    process.stdout.write('\n')
    process.exit(0)
  }
  if (key.name === 'left') state = selectAdjacentScene(state, -1)
  if (key.name === 'right') state = selectAdjacentScene(state, 1)
  if (key.name === 's') state = splitSelectedScene(state, 500)
  if (key.name === 'r') state = duplicateSelectedScene(state, 'restart')
  if (key.name === 'c') state = duplicateSelectedScene(state, 'continue')
  if (key.name === 'h') state = extendSelectedScene(state, 500, 'hold')
  if (key.name === 'e') state = extendSelectedScene(state, 500, 'empty')
  if (key.name === 't') {
    const selected = state.scenes.find((scene) => scene.id === state.selectedSceneId)!
    state = trimSelectedScene(state, Math.max(1, selected.durationMs - 500))
  }
  render(state)
})
