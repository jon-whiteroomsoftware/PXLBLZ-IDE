import { describe, expect, it } from 'vitest'
import { bundle, validateLibraryContent } from './bundle'
import { parseMapSource } from './maps/mapAuthoring'
import { evalMapSource } from './maps/evalMapSource'
import { parseMixinHeader } from './mixins'
import type {
  PersonalContentProvider,
  WorkspaceStarterState,
} from './personalContentProvider'
import type {
  LibraryRecord,
  MapRecord,
  MixinRecord,
  PatternRecord,
} from './personalContentRecords'
import { validateSource } from './validate'
import {
  STARTER_LIBRARY,
  STARTER_MAP,
  STARTER_MIXIN,
  STARTER_PATTERN,
  ensureWorkspaceStarters,
  type WorkspaceStarterInventory,
} from './workspaceStarters'

function emptyInventory(): WorkspaceStarterInventory {
  return {
    patternIds: [],
    mapIds: [],
    mixinIds: [],
    libraryIds: [],
    showIds: [],
    controllerIds: [],
  }
}

function createMemoryProvider(initialState?: WorkspaceStarterState) {
  const patterns: PatternRecord[] = []
  const maps: MapRecord[] = []
  const mixins: MixinRecord[] = []
  const libraries: LibraryRecord[] = []
  const stateWrites: WorkspaceStarterState[] = []
  const lastActiveWrites: Array<{ type: 'pattern'; id: string }> = []
  let starterState = initialState

  const provider: PersonalContentProvider = {
    id: 'memory',
    listPatterns: async () => patterns,
    createPattern: async (record) => { patterns.push(record) },
    updatePattern: async () => {},
    deletePattern: async () => {},
    listMaps: async () => maps,
    createMap: async (record) => { maps.push(record) },
    updateMap: async () => {},
    deleteMap: async () => {},
    listMixins: async () => mixins,
    createMixin: async (record) => { mixins.push(record) },
    updateMixin: async () => {},
    deleteMixin: async () => {},
    listLibraries: async () => libraries,
    createLibrary: async (record) => { libraries.push(record) },
    updateLibrary: async () => {},
    deleteLibrary: async () => {},
    listShows: async () => [],
    createShow: async () => {},
    updateShow: async () => {},
    deleteShow: async () => {},
    listControllerProfiles: async () => [],
    createControllerProfile: async () => {},
    updateControllerProfile: async () => {},
    deleteControllerProfile: async () => {},
    getLastActive: async () => undefined,
    setLastActive: async (value) => {
      if (value.type === 'pattern') lastActiveWrites.push(value)
    },
    getDemoOverrides: async () => undefined,
    setDemoOverrides: async () => {},
    getWorkspaceStarterState: async () => starterState,
    setWorkspaceStarterState: async (value) => {
      starterState = value
      stateWrites.push(value)
    },
  }

  return {
    provider,
    patterns,
    maps,
    mixins,
    libraries,
    stateWrites,
    lastActiveWrites,
    get starterState() { return starterState },
  }
}

describe('workspace starter sources', () => {
  it('keeps every greeter valid for its editor', () => {
    expect(validateSource(STARTER_PATTERN.src)).toEqual([])
    expect(parseMapSource(STARTER_MAP.source ?? '')).toEqual([])
    expect(evalMapSource(STARTER_MAP.source ?? '', 10)).toEqual([
      [0, 0], [1, 0], [2, 0], [3, 0],
      [0, 1], [1, 1], [2, 1], [3, 1],
      [0, 2], [1, 2],
    ])
    expect(parseMixinHeader(STARTER_MIXIN.src)).toEqual([])
    expect(validateLibraryContent(STARTER_LIBRARY.src)).toEqual([])
    expect(bundle(
      'export function render(index) { hsv(0, 0, StartHere.inline.identity(index)) }',
      { StartHere: STARTER_LIBRARY.src },
    ).code).not.toContain('StartHere.inline.identity')
  })
})

describe('ensureWorkspaceStarters', () => {
  it('creates exactly one editable starter per code-oriented collection for a new workspace', async () => {
    const memory = createMemoryProvider()

    await expect(ensureWorkspaceStarters(memory.provider, emptyInventory(), 123)).resolves.toBe(true)

    expect(memory.patterns).toEqual([{ ...STARTER_PATTERN, updatedAt: 123 }])
    expect(memory.maps).toEqual([{ ...STARTER_MAP, updatedAt: 123 }])
    expect(memory.mixins).toEqual([{ ...STARTER_MIXIN, updatedAt: 123 }])
    expect(memory.libraries).toEqual([{ ...STARTER_LIBRARY, updatedAt: 123 }])
    expect(memory.stateWrites).toEqual([
      { version: 1, initialized: ['patterns'] },
      { version: 1, initialized: ['patterns', 'maps'] },
      { version: 1, initialized: ['patterns', 'maps', 'mixins'] },
      { version: 1, initialized: ['patterns', 'maps', 'mixins', 'libraries'] },
    ])
    expect(memory.lastActiveWrites).toEqual([{ type: 'pattern', id: STARTER_PATTERN.id }])
  })

  it('adds greeters only to empty collections in an existing workspace', async () => {
    const memory = createMemoryProvider()
    const inventory = {
      ...emptyInventory(),
      patternIds: ['existing-pattern'],
      mapIds: ['existing-map'],
    }

    await expect(ensureWorkspaceStarters(memory.provider, inventory, 123)).resolves.toBe(true)

    expect(memory.patterns).toHaveLength(0)
    expect(memory.maps).toHaveLength(0)
    expect(memory.mixins).toEqual([{ ...STARTER_MIXIN, updatedAt: 123 }])
    expect(memory.libraries).toEqual([{ ...STARTER_LIBRARY, updatedAt: 123 }])
    expect(memory.lastActiveWrites).toHaveLength(0)
    expect(memory.stateWrites[memory.stateWrites.length - 1]).toEqual({
      version: 1,
      initialized: ['patterns', 'maps', 'mixins', 'libraries'],
    })
  })

  it('finishes only missing records after a partial seed', async () => {
    const memory = createMemoryProvider({ version: 1, initialized: ['patterns'] })
    memory.patterns.push({ ...STARTER_PATTERN, updatedAt: 100 })
    const inventory = { ...emptyInventory(), patternIds: [STARTER_PATTERN.id] }

    await expect(ensureWorkspaceStarters(memory.provider, inventory, 123)).resolves.toBe(true)

    expect(memory.patterns).toHaveLength(1)
    expect(memory.maps).toHaveLength(1)
    expect(memory.mixins).toHaveLength(1)
    expect(memory.libraries).toHaveLength(1)
    expect(memory.stateWrites[memory.stateWrites.length - 1]).toEqual({
      version: 1,
      initialized: ['patterns', 'maps', 'mixins', 'libraries'],
    })
  })

  it('does not resurrect deleted starters after onboarding completes', async () => {
    const memory = createMemoryProvider({
      version: 1,
      initialized: ['patterns', 'maps', 'mixins', 'libraries'],
    })

    await expect(ensureWorkspaceStarters(memory.provider, emptyInventory(), 123)).resolves.toBe(false)

    expect(memory.patterns).toHaveLength(0)
    expect(memory.maps).toHaveLength(0)
    expect(memory.mixins).toHaveLength(0)
    expect(memory.libraries).toHaveLength(0)
    expect(memory.stateWrites).toHaveLength(0)
  })
})
