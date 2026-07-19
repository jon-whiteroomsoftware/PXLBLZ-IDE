import type {
  PersonalContentProvider,
  WorkspaceStarterKind,
} from './personalContentProvider'
import type {
  LibraryRecord,
  MapRecord,
  MixinRecord,
  PatternRecord,
} from './personalContentRecords'

const PXLBLZ_URL = 'https://pxlblz-ide.whiteroomsoftware.com/'

export const STARTER_PATTERN: Omit<PatternRecord, 'updatedAt'> = {
  id: 'pxlblz-starter-pattern-v1',
  name: 'Start Here',
  controls: {},
  src: `// Pattern: Start Here
// Built with PXLBLZ-IDE ${PXLBLZ_URL}
//
// This is your first personal Pattern: edit it, preview it, and send it to a Pixelblaze.
// The active Map supplies x and y, so the same Pattern can follow many physical layouts.
// Runs on: 2D maps.
// Controls: None.

export var t

export function beforeRender(delta) {
  t = time(0.06)
}

export function render2D(index, x, y) {
  hsv(x + t, 1, 1)
}
`,
}

export const STARTER_MAP: Omit<MapRecord, 'updatedAt'> = {
  id: 'pxlblz-starter-map-v1',
  name: 'Start Here',
  dim: 2,
  generator: 'custom',
  params: {},
  source: `// Map: Start Here
// Built with PXLBLZ-IDE ${PXLBLZ_URL}
//
// Maps are reusable coordinate layouts stored separately from Patterns. A Map tells a
// Pattern where each physical pixel lives; select one in Preview or attach one to a Show.
// This example arranges any pixel count into a near-square 2D grid.

function(pixelCount) {
  var coords = []
  var width = Math.ceil(Math.sqrt(pixelCount))
  for (var i = 0; i < pixelCount; i++) {
    coords.push([i % width, Math.floor(i / width)])
  }
  return coords
}`,
}

export const STARTER_MIXIN: Omit<MixinRecord, 'updatedAt'> = {
  id: 'pxlblz-starter-mixin-v1',
  name: 'Start Here',
  kind: 'bind',
  src: `// Mixin: Start Here
// Built with PXLBLZ-IDE ${PXLBLZ_URL}
//
// Mixins are small reusable code files you can include with a Pattern to add behavior
// without changing the Pattern itself. A common use is binding an analog hardware input
// to a Pattern control; Mixins can also add new functionality such as power management.
// This example sends a configured VALUE to a configured CONTROL once per frame.
// @param VALUE binding-supplied value
// @target CONTROL
// @wraps beforeRender

export var mixinValue = 0

export function beforeRender(delta) {
  mixinValue = VALUE
  CONTROL(mixinValue)
}
`,
}

export const STARTER_LIBRARY: Omit<LibraryRecord, 'updatedAt'> = {
  id: 'pxlblz-starter-library-v1',
  name: 'StartHere',
  src: `// Library: StartHere
// Built with PXLBLZ-IDE ${PXLBLZ_URL}
//
// Libraries hold reusable Pixelblaze helpers. A Pattern can call this helper as
// StartHere.identity(v), and only reachable helpers are bundled. The @inline opt-in also
// permits StartHere.inline.identity(v), replacing the call expression at compile time.

// @inline
function identity(v) {
  return v
}
`,
}

export interface WorkspaceStarterInventory {
  patternIds: readonly string[]
  mapIds: readonly string[]
  mixinIds: readonly string[]
  libraryIds: readonly string[]
  showIds: readonly string[]
  controllerIds: readonly string[]
}

function inventoryHasPersonalContent(inventory: WorkspaceStarterInventory): boolean {
  return Object.values(inventory).some((ids) => ids.length > 0)
}

async function createOrConfirm<T extends { id: string }>(
  id: string,
  knownIds: readonly string[],
  create: () => Promise<void>,
  list: () => Promise<T[]>,
): Promise<boolean> {
  if (knownIds.includes(id)) return false
  try {
    await create()
  } catch (error) {
    const records = await list()
    if (!records.some((record) => record.id === id)) throw error
  }
  return true
}

export async function ensureWorkspaceStarters(
  provider: PersonalContentProvider,
  inventory: WorkspaceStarterInventory,
  now = Date.now(),
): Promise<boolean> {
  const getStarterState = provider.getWorkspaceStarterState
  const setStarterState = provider.setWorkspaceStarterState
  if (!getStarterState || !setStarterState) {
    throw new Error('Workspace starter creation requires starter-state persistence')
  }
  const currentState = await getStarterState()
  const initialized = new Set<WorkspaceStarterKind>(currentState?.initialized ?? [])
  if (initialized.size === 4) return false
  const entirelyNewWorkspace = !inventoryHasPersonalContent(inventory)

  const pattern = { ...STARTER_PATTERN, updatedAt: now }
  const map = { ...STARTER_MAP, updatedAt: now }
  const mixin = { ...STARTER_MIXIN, updatedAt: now }
  const library = { ...STARTER_LIBRARY, updatedAt: now }
  const listLibraries = provider.listLibraries
  const createLibrary = provider.createLibrary
  if (!listLibraries || !createLibrary) throw new Error('Workspace starter creation requires Library persistence')

  let changed = false
  const initialize = async (kind: WorkspaceStarterKind, createIfEmpty: () => Promise<boolean>) => {
    if (initialized.has(kind)) return
    changed = await createIfEmpty() || changed
    initialized.add(kind)
    await setStarterState({ version: 1, initialized: [...initialized] })
  }

  await initialize('patterns', () => inventory.patternIds.length === 0
    ? createOrConfirm(pattern.id, inventory.patternIds, () => provider.createPattern(pattern), () => provider.listPatterns())
    : Promise.resolve(false))
  await initialize('maps', () => inventory.mapIds.length === 0
    ? createOrConfirm(map.id, inventory.mapIds, () => provider.createMap(map), () => provider.listMaps())
    : Promise.resolve(false))
  await initialize('mixins', () => inventory.mixinIds.length === 0
    ? createOrConfirm(mixin.id, inventory.mixinIds, () => provider.createMixin(mixin), () => provider.listMixins())
    : Promise.resolve(false))
  await initialize('libraries', () => inventory.libraryIds.length === 0
    ? createOrConfirm(library.id, inventory.libraryIds, () => createLibrary(library), () => listLibraries())
    : Promise.resolve(false))

  if (entirelyNewWorkspace) await provider.setLastActive({ type: 'pattern', id: pattern.id })
  return changed
}
