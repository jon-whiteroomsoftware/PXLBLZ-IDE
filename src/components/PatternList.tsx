import { useEffect, useRef, useState } from 'react'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { uniquePatternName } from '@/engine/patternName'
import { NEW_PATTERN_SRC } from '@/pixelblaze/newPattern'
import { parseEpe } from '@/engine/epeImport'
import { nativeDim, matchesLens, matchesQuery, type DimLens } from '@/engine/dimLens'
import { GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import {
  demoPersonalContentProvider,
  getPersonalContentProvider,
  initializePersonalContentProvider,
} from '@/engine/personalContentProvider'
import {
  demoControllerMetadataStorage,
  initializeControllerMetadataStorage,
} from '@/engine/controllerMetadataStorage'
import { getAuthSession } from '@/engine/authSession'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore, type PatternRecord } from '@/store/patternStore'
import { useMapStore, STOCK_MAP_ITEMS, type MapRecord } from '@/store/mapStore'
import {
  useMixinStore,
  STOCK_MIXIN_ITEMS,
  type MixinRecord,
} from '@/store/mixinStore'
import { useControllerStore } from '@/store/controllerStore'
import { controllerProfileDisplayName } from '@/engine/controllerProfile'
import {
  profileMatchesLive,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { useShowStore, type ShowRecord } from '@/store/showStore'
import { useDocsStore } from '@/store/docsStore'
import { useRouterStore } from '@/store/routerStore'
import { openDemoPattern } from '@/store/openPattern'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useLibraryStore, type LibraryRecord } from '@/store/libraryStore'
import { ActivityStrip, type RailMode } from '@/components/rail/ActivityStrip'
import { railScrollMetrics, type ScrollMetrics } from '@/components/rail/RailPrimitives'
import { PatternsRailSection } from '@/components/rail/PatternsRailSection'
import { MapsRailSection } from '@/components/rail/MapsRailSection'
import { MixinsRailSection } from '@/components/rail/MixinsRailSection'
import { LibrariesRailSection } from '@/components/rail/LibrariesRailSection'
import { ControllersRailSection } from '@/components/rail/ControllersRailSection'
import { ShowsRailSection } from '@/components/rail/ShowsRailSection'

const DEFAULT_DEMO_NAME = 'IridescentFibers'

export function PatternList() {
  const setSource = useEditorStore((s) => s.setSource)
  const setEditorFlavor = useEditorStore((s) => s.setEditorFlavor)
  const setIsReadOnly = useEditorStore((s) => s.setIsReadOnly)
  const setPreviewSource = useEditorStore((s) => s.setPreviewSource)
  const setPreviewPatternName = useEditorStore((s) => s.setPreviewPatternName)
  const closeDocs = useDocsStore((s) => s.closeDocs)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const setActivePattern = usePatternStore((s) => s.setActivePattern)
  const loadPatterns = usePatternStore((s) => s.loadPatterns)
  const renamePattern = usePatternStore((s) => s.renamePattern)
  const removePattern = usePatternStore((s) => s.removePattern)
  const addPattern = usePatternStore((s) => s.addPattern)

  const userMaps = useMapStore((s) => s.userMaps)
  const renameMap = useMapStore((s) => s.renameMap)
  const removeMap = useMapStore((s) => s.removeMap)
  const editingMap = useMapStore((s) => s.editingMap)
  const createNewMap = useMapStore((s) => s.createNewMap)
  const openExistingMap = useMapStore((s) => s.openExistingMap)
  const openStockMap = useMapStore((s) => s.openStockMap)
  const closeMapEditor = useMapStore((s) => s.closeMapEditor)
  const userMixins = useMixinStore((s) => s.userMixins)
  const editingMixin = useMixinStore((s) => s.editingMixin)
  const createNewMixin = useMixinStore((s) => s.createNewMixin)
  const openExistingMixin = useMixinStore((s) => s.openExistingMixin)
  const openStockMixin = useMixinStore((s) => s.openStockMixin)
  const closeMixinEditor = useMixinStore((s) => s.closeMixinEditor)
  const renameMixin = useMixinStore((s) => s.renameMixin)
  const removeMixin = useMixinStore((s) => s.removeMixin)
  const userLibraries = useLibraryStore((s) => s.userLibraries)
  const editingLibrary = useLibraryStore((s) => s.editingLibrary)
  const loadLibraries = useLibraryStore((s) => s.loadLibraries)
  const createNewLibrary = useLibraryStore((s) => s.createNewLibrary)
  const openExistingLibrary = useLibraryStore((s) => s.openExistingLibrary)
  const openStockLibrary = useLibraryStore((s) => s.openStockLibrary)
  const closeLibraryEditor = useLibraryStore((s) => s.closeLibraryEditor)
  const renameLibrary = useLibraryStore((s) => s.renameLibrary)
  const removeLibrary = useLibraryStore((s) => s.removeLibrary)
  const validateLibraryNamespace = useLibraryStore((s) => s.validateLibraryNamespace)
  const controllerProfiles = useControllerProfileStore((s) => s.profiles)
  const loadControllerProfiles = useControllerProfileStore((s) => s.loadProfiles)
  const removeControllerProfile = useControllerProfileStore((s) => s.removeProfile)
  const userShows = useShowStore((s) => s.shows)
  const activeShowId = useShowStore((s) => s.activeShowId)
  const loadShows = useShowStore((s) => s.loadShows)
  const createNewShow = useShowStore((s) => s.createNewShow)
  const openShow = useShowStore((s) => s.openShow)
  const renameShow = useShowStore((s) => s.renameShow)
  const removeShow = useShowStore((s) => s.removeShow)
  const liveControllers = useControllerStore((s) => s.controllers)
  const navigate = useRouterStore((s) => s.navigate)
  const route = useRouterStore((s) => s.route)
  const createShowFromController = useShowStore((s) => s.createShowFromController)
  const showSeedProfile = controllerProfiles.find((profile) => (
    profile.zones.length > 0 && profileMatchesLive(profile, liveControllers)
  )) ?? controllerProfiles.find((profile) => profile.zones.length > 0)

  // Open-from-disk (.epe import) lives next to "New pattern" (#141): both create
  // a pattern, so they sit together on the Patterns header.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current) }, [])

  function showImportError(msg: string) {
    setImportError(msg)
    if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current)
    importErrorTimerRef.current = setTimeout(() => setImportError(null), 4000)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result
      if (typeof text !== 'string') return
      let parsed
      try {
        parsed = parseEpe(text)
      } catch (err) {
        showImportError(err instanceof Error ? err.message : 'Failed to import EPE file')
        return
      }
      const id = newPersonalContentId()
      const name = uniquePatternName(parsed.name, userPatterns.map((p) => p.name))
      const record: PatternRecord = { id, name, src: parsed.src, controls: {}, updatedAt: Date.now() }
      await addPattern(record)
      useMapStore.getState().closeMapEditor()
      useMixinStore.getState().closeMixinEditor()
      useDocsStore.getState().closeDocs()
      setActivePattern(id)
      setEditorFlavor('pattern')
      setSource(record.src)
      setPreviewSource(record.src)
      setPreviewPatternName(record.name)
      setIsReadOnly(false)
    }
    reader.readAsText(file)
  }

  const railMode: RailMode =
    route.kind === 'studio' && route.entity !== null
      ? route.entity.kind
      : 'patterns'
  // The dimension lens (#251). Ephemeral: component state, resets to All on reload.
  const [dimLens, setDimLens] = useState<DimLens>('all')
  // The type-down name search (#252). Ephemeral too: resets to '' on reload, and
  // separate per rail mode so a map search doesn't leak into pattern browsing.
  const [queries, setQueries] = useState<Record<RailMode, string>>({
    patterns: '',
    maps: '',
    mixins: '',
    libraries: '',
    controllers: '',
    shows: '',
  })

  const [showStockPatterns, setShowStockPatterns] = useState(() => {
    try {
      return window.sessionStorage.getItem('pxlblz.showStockPatterns') !== '0'
    } catch {
      return true
    }
  })
  const [showStockMaps, setShowStockMaps] = useState(() => {
    try {
      return window.sessionStorage.getItem('pxlblz.showStockMaps') !== '0'
    } catch {
      return true
    }
  })
  const [showStockMixins, setShowStockMixins] = useState(() => {
    try {
      return window.sessionStorage.getItem('pxlblz.showStockMixins') !== '0'
    } catch {
      return true
    }
  })
  const [showStockLibraries, setShowStockLibraries] = useState(() => {
    try {
      return window.sessionStorage.getItem('pxlblz.showStockLibraries') !== '0'
    } catch {
      return true
    }
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const patternRowRefs = useRef(new Map<string, HTMLLIElement>())
  const lastEntityByModeRef = useRef<Record<RailMode, string | null>>({
    patterns: null,
    maps: null,
    mixins: null,
    libraries: null,
    controllers: null,
    shows: null,
  })
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({ top: 0, height: 0, visible: false })
  const [personalWorkspaceAuthenticated, setPersonalWorkspaceAuthenticated] = useState(false)
  const setGlobalWorkspaceAuthenticated = useWorkspaceStore((s) => s.setPersonalWorkspaceAuthenticated)
  const query = queries[railMode]
  const setQuery = (next: string) => setQueries((q) => ({ ...q, [railMode]: next }))

  function handleRailModeChange(next: RailMode) {
    closeDocs()
    if (next !== 'maps') closeMapEditor()
    if (next !== 'mixins') closeMixinEditor()
    if (next !== 'libraries') closeLibraryEditor()
    if (next === 'libraries') {
      const last = lastEntityByModeRef.current.libraries
      const id = last && (LIBRARIES[last] || userLibraries.some((library) => library.id === last)) ? last : null
      navigate({ kind: 'studio', entity: { kind: next, id } })
      return
    }
    if (next === 'shows') {
      const last = lastEntityByModeRef.current.shows
      const id = userShows.some((show) => show.id === last)
        ? last
        : (userShows[0]?.id ?? null)
      navigate({ kind: 'studio', entity: { kind: next, id } })
      return
    }
    if (next === 'controllers') {
      const last = lastEntityByModeRef.current.controllers
      const id = controllerProfiles.some((profile) => profile.id === last)
        ? last
        : (controllerProfiles[0]?.id ?? null)
      navigate({ kind: 'studio', entity: { kind: next, id } })
      return
    }
    const last = lastEntityByModeRef.current[next]
    const id = next === 'patterns'
      ? (userPatterns.some((p) => p.id === last) || GALLERY_PATTERNS.some((p) => p.name === last) ? last : null)
      : next === 'maps'
        ? (userMaps.some((m) => m.id === last) || STOCK_MAP_ITEMS.some((m) => m.id === last) ? last : null)
      : next === 'mixins'
        ? (userMixins.some((m) => m.id === last) || STOCK_MIXIN_ITEMS.some((m) => m.id === last) ? last : null)
      : null
    navigate({ kind: 'studio', entity: { kind: next, id } })
  }

  function openCatalog() {
    navigate({ kind: 'gallery' })
  }

  function updateScrollMetrics() {
    const el = scrollRef.current
    if (!el) return
    setScrollMetrics(railScrollMetrics(el))
  }

  useEffect(() => {
    updateScrollMetrics()
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const resizeObserver = new ResizeObserver(updateScrollMetrics)
    resizeObserver.observe(el)
    return () => resizeObserver.disconnect()
  }, [
    railMode,
    dimLens,
    query,
    userPatterns.length,
    userMaps.length,
    userMixins.length,
    userLibraries.length,
    controllerProfiles.length,
    userShows.length,
    showStockPatterns,
    showStockMaps,
    showStockMixins,
    showStockLibraries,
  ])

  useEffect(() => {
    try {
      window.sessionStorage.setItem('pxlblz.showStockPatterns', showStockPatterns ? '1' : '0')
    } catch {
      // Session persistence is a convenience only.
    }
  }, [showStockPatterns])

  useEffect(() => {
    try {
      window.sessionStorage.setItem('pxlblz.showStockMaps', showStockMaps ? '1' : '0')
    } catch {
      // Session persistence is a convenience only.
    }
  }, [showStockMaps])

  useEffect(() => {
    try {
      window.sessionStorage.setItem('pxlblz.showStockMixins', showStockMixins ? '1' : '0')
    } catch {
      // Session persistence is a convenience only.
    }
  }, [showStockMixins])

  useEffect(() => {
    try {
      window.sessionStorage.setItem('pxlblz.showStockLibraries', showStockLibraries ? '1' : '0')
    } catch {
      // Session persistence is a convenience only.
    }
  }, [showStockLibraries])

  useEffect(() => {
    if (route.kind !== 'studio' || route.entity === null || route.entity.id === null) return
    lastEntityByModeRef.current[route.entity.kind] = route.entity.id
  }, [route])

  useEffect(() => {
    if (route.kind !== 'studio' || route.entity?.kind !== 'controllers' || route.entity.id !== null) return
    const last = lastEntityByModeRef.current.controllers
    const id = controllerProfiles.some((profile) => profile.id === last)
      ? last
      : (controllerProfiles[0]?.id ?? null)
    if (id) navigate({ kind: 'studio', entity: { kind: 'controllers', id } }, { replace: true })
  }, [controllerProfiles, navigate, route])

  useEffect(() => {
    let cancelled = false
    async function hydratePersonalContent() {
      const session = await getAuthSession().catch(() => ({ authenticated: false as const }))
      if (session.authenticated) {
        await initializePersonalContentProvider({ mode: 'remote-api' })
      } else {
        await initializePersonalContentProvider({ provider: demoPersonalContentProvider })
      }
      await initializeControllerMetadataStorage(
        session.authenticated
          ? { mode: 'remote-api' }
          : { storage: demoControllerMetadataStorage },
      )
      if (cancelled) return
      setPersonalWorkspaceAuthenticated(session.authenticated)
      setGlobalWorkspaceAuthenticated(session.authenticated)
      // Hydrate user maps before the first pattern opens so the layout selector is
      // populated from whichever personal provider won startup selection.
      await useMapStore.getState().loadMaps()
      if (cancelled) return
      await useMixinStore.getState().loadMixins()
      if (cancelled) return
      await useLibraryStore.getState().loadLibraries()
      if (cancelled) return
      await loadControllerProfiles()
      if (cancelled) return
      await loadShows()
      if (cancelled) return
      await usePatternStore.getState().loadDemoOverrides()
      if (cancelled) return
      await loadPatterns()
      if (cancelled) return
      // A deep link to a concrete studio entity outranks the last-active restore
      // (#308): App's route effect opens the addressed pattern once loadPatterns
      // lands. Kind-only shell routes (/studio/maps, /studio/mixins, ...) still
      // show the restored/default editor content beside the active rail list.
      const route = useRouterStore.getState().route
      if (route.kind === 'studio' && route.entity !== null && route.entity.id !== null) return
      const last = await getPersonalContentProvider().getLastActive().catch(() => undefined)
      const { userPatterns, setActivePattern, setActiveLibrary, setActiveDemo } = usePatternStore.getState()
      const { userLibraries, openExistingLibrary } = useLibraryStore.getState()
      const { shows, openShow } = useShowStore.getState()
      const { setSource, setEditorFlavor, setIsReadOnly, setPreviewSource, setPreviewPatternName } = useEditorStore.getState()
      if (!last) {
        setActiveDemo(DEFAULT_DEMO_NAME)
        setEditorFlavor('pattern')
        setSource(DEMOS[DEFAULT_DEMO_NAME])
        setPreviewSource(DEMOS[DEFAULT_DEMO_NAME])
        setPreviewPatternName(DEFAULT_DEMO_NAME)
        setIsReadOnly(true)
        return
      }
      if (last.type === 'pattern') {
        const p = userPatterns.find((p) => p.id === last.id)
        if (p) {
          setActivePattern(p.id)
          setEditorFlavor('pattern')
          setSource(p.src)
          setPreviewSource(p.src)
          setPreviewPatternName(p.name)
          setIsReadOnly(false)
        }
      } else if (last.type === 'demo') {
        if (DEMOS[last.name]) {
          setActiveDemo(last.name)
          setEditorFlavor('pattern')
          setSource(DEMOS[last.name])
          setPreviewSource(DEMOS[last.name])
          setPreviewPatternName(last.name)
          setIsReadOnly(true)
        }
      } else if (last.type === 'library') {
        const record = userLibraries.find((library) => library.name === last.name)
        if (record) openExistingLibrary(record)
        else if (LIBRARIES[last.name]) {
          setActiveLibrary(last.name)
          setSource(LIBRARIES[last.name])
          setIsReadOnly(true)
          useEditorStore.getState().setEditorFlavor('library')
        }
      } else if (last.type === 'show') {
        if (shows.some((show) => show.id === last.id)) openShow(last.id)
      }
    }
    void hydratePersonalContent()
    return () => {
      cancelled = true
    }
  }, [loadControllerProfiles, loadLibraries, loadPatterns, loadShows, setGlobalWorkspaceAuthenticated])

  function openUserPattern(pattern: PatternRecord) {
    closeMapEditor()
    closeMixinEditor()
    closeLibraryEditor()
    closeDocs()
    setActivePattern(pattern.id)
    setEditorFlavor('pattern')
    setSource(pattern.src)
    setPreviewSource(pattern.src)
    setPreviewPatternName(pattern.name)
    setIsReadOnly(false)
  }

  function openStockPatternRoute(name: string) {
    openDemoPattern(name)
    navigate({ kind: 'studio', entity: { kind: 'patterns', id: name } })
  }

  // Create a fresh "Untitled Pattern" and open it. Lives next to Patterns
  // (#141) so a new pattern is created right by its list.
  async function handleCreatePattern() {
    if (!personalWorkspaceAuthenticated) return
    closeMapEditor()
    closeMixinEditor()
    closeDocs()
    const id = newPersonalContentId()
    const name = uniquePatternName('Untitled Pattern', userPatterns.map((p) => p.name))
    const record: PatternRecord = { id, name, src: NEW_PATTERN_SRC, controls: {}, updatedAt: Date.now() }
    await addPattern(record)
    setActivePattern(id)
    setEditorFlavor('pattern')
    setSource(record.src)
    setPreviewSource(record.src)
    setPreviewPatternName(record.name)
    setIsReadOnly(false)
  }

  // Open a custom map in editor map mode (#151): loads its source, flips the
  // editor to the JS map flavor, and drives the bare-geometry preview.
  function openUserMap(map: MapRecord) {
    closeDocs()
    closeMixinEditor()
    closeLibraryEditor()
    openExistingMap(map)
    navigate({ kind: 'studio', entity: { kind: 'maps', id: map.id } })
  }

  function openStockMapRoute(id: string) {
    closeDocs()
    closeMixinEditor()
    closeLibraryEditor()
    openStockMap(id)
    navigate({ kind: 'studio', entity: { kind: 'maps', id } })
  }

  async function handleCreateMap() {
    closeMixinEditor()
    closeLibraryEditor()
    await createNewMap()
    const editing = useMapStore.getState().editingMap
    if (editing?.kind === 'existing') navigate({ kind: 'studio', entity: { kind: 'maps', id: editing.id } })
  }

  async function handleCreateMixin() {
    closeMapEditor()
    closeLibraryEditor()
    await createNewMixin()
    const editing = useMixinStore.getState().editingMixin
    if (editing?.kind === 'existing') navigate({ kind: 'studio', entity: { kind: 'mixins', id: editing.id } })
  }

  function openUserMixin(mixin: MixinRecord) {
    closeDocs()
    closeLibraryEditor()
    openExistingMixin(mixin)
    navigate({ kind: 'studio', entity: { kind: 'mixins', id: mixin.id } })
  }

  function openStockMixinRoute(id: string) {
    closeDocs()
    closeLibraryEditor()
    openStockMixin(id)
    navigate({ kind: 'studio', entity: { kind: 'mixins', id } })
  }

  function openStockLibraryRoute(name: string) {
    openStockLibrary(name)
    navigate({ kind: 'studio', entity: { kind: 'libraries', id: name } })
  }

  function openUserLibrary(library: LibraryRecord) {
    closeDocs()
    openExistingLibrary(library)
    navigate({ kind: 'studio', entity: { kind: 'libraries', id: library.id } })
  }

  async function handleCreateLibrary() {
    closeMapEditor()
    closeMixinEditor()
    const library = await createNewLibrary()
    navigate({ kind: 'studio', entity: { kind: 'libraries', id: library.id } })
  }

  async function handleRenameLibrary(libraryId: string, name: string) {
    const library = userLibraries.find((candidate) => candidate.id === libraryId)
    const prior = library?.name ?? 'this library'
    const confirmed = window.confirm(
      `Rename library namespace "${prior}" to "${name}"? Patterns that reference "${prior}.*" will fail compile with an unknown-namespace error until you update them.`,
    )
    if (!confirmed) return
    await renameLibrary(libraryId, name)
  }

  function openControllerProfile(profileId: string) {
    closeMapEditor()
    closeMixinEditor()
    closeLibraryEditor()
    closeDocs()
    navigate({ kind: 'studio', entity: { kind: 'controllers', id: profileId } })
  }

  async function handleCreateShow() {
    closeMapEditor()
    closeMixinEditor()
    closeLibraryEditor()
    closeDocs()
    const show = await createNewShow()
    navigate({ kind: 'studio', entity: { kind: 'shows', id: show.id } })
  }

  async function handleCreateShowFromController() {
    if (!showSeedProfile) return
    closeMapEditor()
    closeMixinEditor()
    closeLibraryEditor()
    closeDocs()
    const show = await createShowFromController(showSeedProfile)
    navigate({ kind: 'studio', entity: { kind: 'shows', id: show.id } })
  }

  function openUserShow(show: ShowRecord) {
    closeMapEditor()
    closeMixinEditor()
    closeLibraryEditor()
    closeDocs()
    openShow(show.id)
    navigate({ kind: 'studio', entity: { kind: 'shows', id: show.id } })
  }

  async function handleRemoveControllerProfile(profileId: string) {
    await removeControllerProfile(profileId)
    if (route.kind === 'studio' && route.entity?.kind === 'controllers' && route.entity.id === profileId) {
      navigate({ kind: 'studio', entity: { kind: 'controllers', id: null } })
    }
  }

  async function handleRemoveShow(showId: string) {
    await removeShow(showId)
    if (route.kind === 'studio' && route.entity?.kind === 'shows' && route.entity.id === showId) {
      navigate({ kind: 'studio', entity: { kind: 'shows', id: null } })
    }
  }

  async function handleRemovePattern(patternId: string) {
    await removePattern(patternId)
    if (route.kind === 'studio' && route.entity?.kind === 'patterns' && route.entity.id === patternId) {
      navigate({ kind: 'studio', entity: { kind: 'patterns', id: null } })
    }
  }

  async function handleRemoveMap(mapId: string) {
    await removeMap(mapId)
    if (route.kind === 'studio' && route.entity?.kind === 'maps' && route.entity.id === mapId) {
      navigate({ kind: 'studio', entity: { kind: 'maps', id: null } })
    }
  }

  async function handleRemoveMixin(mixinId: string) {
    await removeMixin(mixinId)
    if (route.kind === 'studio' && route.entity?.kind === 'mixins' && route.entity.id === mixinId) {
      navigate({ kind: 'studio', entity: { kind: 'mixins', id: null } })
    }
  }

  async function handleRemoveLibrary(libraryId: string) {
    await removeLibrary(libraryId)
    if (route.kind === 'studio' && route.entity?.kind === 'libraries' && route.entity.id === libraryId) {
      navigate({ kind: 'studio', entity: { kind: 'libraries', id: null } })
    }
  }

  const visibleUserPatterns = userPatterns.filter(
    (pattern) =>
      matchesLens(nativeDim(pattern.src), dimLens) && matchesQuery(pattern.name, query),
  )
  const visibleStockPatterns = GALLERY_PATTERNS.filter(
    (pattern) => matchesLens(pattern.dim, dimLens) && matchesQuery(pattern.name, query),
  )

  const patternNavItems = visibleUserPatterns.map((pattern) => ({
    key: `pattern:${pattern.id}`,
    activate: () => openUserPattern(pattern),
  }))

  function handlePatternRowRef(key: string, el: HTMLLIElement | null) {
    if (el) patternRowRefs.current.set(key, el)
    else patternRowRefs.current.delete(key)
  }

  function focusPatternRow(key: string) {
    window.setTimeout(() => {
      const row = patternRowRefs.current.get(key)
      row?.focus()
      if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
    }, 0)
  }

  function handlePatternRowKeyDown(e: React.KeyboardEvent<HTMLLIElement>, key: string) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const index = patternNavItems.findIndex((item) => item.key === key)
    if (index === -1) return
    const nextIndex = e.key === 'ArrowDown'
      ? Math.min(patternNavItems.length - 1, index + 1)
      : Math.max(0, index - 1)
    if (nextIndex === index) return
    e.preventDefault()
    const next = patternNavItems[nextIndex]
    if (!next) return
    next.activate()
    focusPatternRow(next.key)
  }

  const visibleMaps = userMaps.filter(
    (map) => matchesLens(map.dim, dimLens) && matchesQuery(map.name, query),
  )
  const visibleStockMaps = STOCK_MAP_ITEMS.filter(
    (map) => matchesLens(map.dim, dimLens) && matchesQuery(map.name, query),
  )
  const activeControllerProfileId = route.kind === 'studio' && route.entity?.kind === 'controllers'
    ? route.entity.id
    : null
  const libraryNames = Object.keys(LIBRARIES).sort()

  return (
    <div data-testid="studio-rail" className="flex h-full text-xs font-mono">
      <input
        ref={fileInputRef}
        type="file"
        accept=".epe"
        className="hidden"
        onChange={handleFileChange}
      />
      <ActivityStrip
        mode={railMode}
        onModeChange={handleRailModeChange}
        onCatalog={openCatalog}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {railMode === 'patterns' && (
          <PatternsRailSection
            fileInputRef={fileInputRef}
            importError={importError}
            personalWorkspaceAuthenticated={personalWorkspaceAuthenticated}
            dimLens={dimLens}
            query={query}
            activePatternId={activePatternId}
            activeDemoName={activeDemoName}
            userPatterns={userPatterns}
            visibleUserPatterns={visibleUserPatterns}
            visibleStockPatterns={visibleStockPatterns}
            showStockPatterns={showStockPatterns}
            scrollRef={scrollRef}
            scrollMetrics={scrollMetrics}
            onScroll={updateScrollMetrics}
            onLensChange={setDimLens}
            onQueryChange={setQuery}
            onCreatePattern={handleCreatePattern}
            onToggleStockPatterns={() => setShowStockPatterns((visible) => !visible)}
            onOpenUserPattern={openUserPattern}
            onOpenStockPattern={openStockPatternRoute}
            onRenamePattern={renamePattern}
            onDeletePattern={(patternId) => void handleRemovePattern(patternId)}
            onRowRef={handlePatternRowRef}
            onRowKeyDown={handlePatternRowKeyDown}
          />
        )}
        {railMode === 'maps' && (
          <MapsRailSection
            personalWorkspaceAuthenticated={personalWorkspaceAuthenticated}
            dimLens={dimLens}
            query={query}
            userMaps={userMaps}
            visibleMaps={visibleMaps}
            visibleStockMaps={visibleStockMaps}
            editingMap={editingMap}
            showStockMaps={showStockMaps}
            scrollRef={scrollRef}
            scrollMetrics={scrollMetrics}
            onScroll={updateScrollMetrics}
            onLensChange={setDimLens}
            onQueryChange={setQuery}
            onCreateMap={() => void handleCreateMap()}
            onToggleStockMaps={() => setShowStockMaps((visible) => !visible)}
            onOpenUserMap={openUserMap}
            onOpenStockMap={openStockMapRoute}
            onRenameMap={renameMap}
            onDeleteMap={(mapId) => void handleRemoveMap(mapId)}
          />
        )}
        {railMode === 'libraries' && (
          <LibrariesRailSection
            personalWorkspaceAuthenticated={personalWorkspaceAuthenticated}
            userLibraries={userLibraries}
            editingLibrary={editingLibrary}
            activeLibraryName={activeLibraryName}
            libraryNames={libraryNames}
            showStockLibraries={showStockLibraries}
            scrollRef={scrollRef}
            scrollMetrics={scrollMetrics}
            onScroll={updateScrollMetrics}
            onCreateLibrary={() => void handleCreateLibrary()}
            onToggleStockLibraries={() => setShowStockLibraries((visible) => !visible)}
            onOpenUserLibrary={openUserLibrary}
            onOpenStockLibrary={openStockLibraryRoute}
            onRenameLibrary={(libraryId, name) => void handleRenameLibrary(libraryId, name)}
            onDeleteLibrary={(libraryId) => void handleRemoveLibrary(libraryId)}
            validateLibraryName={validateLibraryNamespace}
          />
        )}
        {railMode === 'controllers' && (
          <ControllersRailSection
            personalWorkspaceAuthenticated={personalWorkspaceAuthenticated}
            controllerProfiles={controllerProfiles}
            activeControllerProfileId={activeControllerProfileId}
            scrollRef={scrollRef}
            scrollMetrics={scrollMetrics}
            onScroll={updateScrollMetrics}
            profileIsLive={(profile) => profileMatchesLive(profile, liveControllers)}
            onOpenControllerProfile={openControllerProfile}
            onDeleteControllerProfile={(profileId) => void handleRemoveControllerProfile(profileId)}
          />
        )}
        {railMode === 'mixins' && (
          <MixinsRailSection
            personalWorkspaceAuthenticated={personalWorkspaceAuthenticated}
            userMixins={userMixins}
            editingMixin={editingMixin}
            showStockMixins={showStockMixins}
            scrollRef={scrollRef}
            scrollMetrics={scrollMetrics}
            onScroll={updateScrollMetrics}
            onCreateMixin={() => void handleCreateMixin()}
            onToggleStockMixins={() => setShowStockMixins((visible) => !visible)}
            onOpenUserMixin={openUserMixin}
            onOpenStockMixin={openStockMixinRoute}
            onRenameMixin={renameMixin}
            onDeleteMixin={(mixinId) => void handleRemoveMixin(mixinId)}
          />
        )}
        {railMode === 'shows' && (
          <ShowsRailSection
            personalWorkspaceAuthenticated={personalWorkspaceAuthenticated}
            userShows={userShows}
            activeShowId={activeShowId}
            showSeedProfileName={showSeedProfile ? controllerProfileDisplayName(showSeedProfile) : null}
            scrollRef={scrollRef}
            scrollMetrics={scrollMetrics}
            onScroll={updateScrollMetrics}
            onCreateShow={() => void handleCreateShow()}
            onCreateShowFromController={() => void handleCreateShowFromController()}
            onOpenShow={openUserShow}
            onRenameShow={renameShow}
            onDeleteShow={(showId) => void handleRemoveShow(showId)}
          />
        )}
      </div>
    </div>
  )
}
