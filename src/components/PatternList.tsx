import { useEffect, useRef, useState } from 'react'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { uniquePatternName } from '@/engine/patternName'
import { NEW_PATTERN_SRC } from '@/pixelblaze/newPattern'
import { MAP_SKELETON } from '@/engine/maps'
import { MIXIN_SKELETON } from '@/engine/mixins'
import {
  LIBRARY_SKELETON,
  builtinNamespaceNames,
  nextLibraryName,
} from '@/engine/libraries'
import { parseEpe } from '@/engine/epeImport'
import { extractPatternAuthors } from '@/engine/patternAttribution'
import { resolveArtifactPreferredMap } from '@/engine/artifactMapCompatibility'
import { nativeDim, matchesLens, matchesQuery, type DimLens } from '@/engine/dimLens'
import { STOCK_PATTERNS } from '@/engine/galleryCatalog'
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
import { ensureWorkspaceStarters } from '@/engine/workspaceStarters'
import {
  emptyEntityOrganizationTrash,
  type EntityOrganizationKind,
} from '@/engine/entityOrganization'
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
import { useEntityOrganizationStore } from '@/store/entityOrganizationStore'
import { useDocsStore } from '@/store/docsStore'
import { useRouterStore } from '@/store/routerStore'
import { requestBufferReplacement } from '@/store/navigationPreflightStore'
import { openDemoPattern, openPatternRecord } from '@/store/openPattern'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { seedActiveSettings } from '@/store/settingsCascade'
import { useLibraryStore, type LibraryRecord } from '@/store/libraryStore'
import {
  studioOperationDismissLabel,
  studioOperationRetryLabel,
  useStudioOperationStore,
  type StudioOperationEntityKind,
} from '@/store/studioOperationStore'
import { SaveFailureNotice } from '@/components/SaveFailureNotice'
import { ActivityStrip, type RailMode } from '@/components/rail/ActivityStrip'
import {
  railScrollMetrics,
  railScrollResizeTargets,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'
import { PatternsRailSection } from '@/components/rail/PatternsRailSection'
import { MapsRailSection } from '@/components/rail/MapsRailSection'
import { MixinsRailSection } from '@/components/rail/MixinsRailSection'
import { LibrariesRailSection } from '@/components/rail/LibrariesRailSection'
import { ControllersRailSection } from '@/components/rail/ControllersRailSection'
import { ShowsRailSection } from '@/components/rail/ShowsRailSection'
import { ShowImportPlanDialog, type ShowImportDialogState } from '@/components/ShowImportPlanDialog'
import { STOCK_SHOWS, type StockShow } from '@/pixelblaze/stock/shows'
import { parseShowFileBundle } from '@/engine/showFileBundle'
import { applyShowImportPlan, planShowImport, ShowImportPlanError } from '@/engine/showImportPlan'

const DEFAULT_DEMO_NAME = 'IridescentFibers'

export function PatternList({
  collapsed = false,
  onCollapsedChange,
}: {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}) {
  const closeDocs = useDocsStore((s) => s.closeDocs)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const loadPatterns = usePatternStore((s) => s.loadPatterns)
  const renamePattern = usePatternStore((s) => s.renamePattern)
  const removePattern = usePatternStore((s) => s.removePattern)
  const addPattern = usePatternStore((s) => s.addPattern)

  const userMaps = useMapStore((s) => s.userMaps)
  const renameMap = useMapStore((s) => s.renameMap)
  const removeMap = useMapStore((s) => s.removeMap)
  const editingMap = useMapStore((s) => s.editingMap)
  const addMap = useMapStore((s) => s.addMap)
  const openExistingMap = useMapStore((s) => s.openExistingMap)
  const openStockMap = useMapStore((s) => s.openStockMap)
  const closeMapEditor = useMapStore((s) => s.closeMapEditor)
  const userMixins = useMixinStore((s) => s.userMixins)
  const editingMixin = useMixinStore((s) => s.editingMixin)
  const addMixin = useMixinStore((s) => s.addMixin)
  const openExistingMixin = useMixinStore((s) => s.openExistingMixin)
  const openStockMixin = useMixinStore((s) => s.openStockMixin)
  const closeMixinEditor = useMixinStore((s) => s.closeMixinEditor)
  const renameMixin = useMixinStore((s) => s.renameMixin)
  const removeMixin = useMixinStore((s) => s.removeMixin)
  const userLibraries = useLibraryStore((s) => s.userLibraries)
  const editingLibrary = useLibraryStore((s) => s.editingLibrary)
  const loadLibraries = useLibraryStore((s) => s.loadLibraries)
  const addLibrary = useLibraryStore((s) => s.addLibrary)
  const openExistingLibrary = useLibraryStore((s) => s.openExistingLibrary)
  const openStockLibrary = useLibraryStore((s) => s.openStockLibrary)
  const closeLibraryEditor = useLibraryStore((s) => s.closeLibraryEditor)
  const renameLibrary = useLibraryStore((s) => s.renameLibrary)
  const removeLibrary = useLibraryStore((s) => s.removeLibrary)
  const validateLibraryNamespace = useLibraryStore((s) => s.validateLibraryNamespace)
  const controllerProfiles = useControllerProfileStore((s) => s.profiles)
  const loadControllerProfiles = useControllerProfileStore((s) => s.loadProfiles)
  const removeControllerProfile = useControllerProfileStore((s) => s.removeProfile)
  const renameControllerProfile = useControllerStore((s) => s.renameControllerProfile)
  const userShows = useShowStore((s) => s.shows)
  const activeShowId = useShowStore((s) => s.activeShowId)
  const loadShows = useShowStore((s) => s.loadShows)
  const beginShowCreation = useShowStore((s) => s.beginShowCreation)
  const openShow = useShowStore((s) => s.openShow)
  const renameShow = useShowStore((s) => s.renameShow)
  const removeShow = useShowStore((s) => s.removeShow)
  const duplicateShow = useShowStore((s) => s.duplicateShow)
  const addImportedShow = useShowStore((s) => s.addImportedShow)
  const patternOrganization = useEntityOrganizationStore((s) => s.organizations.patterns)
  const showOrganization = useEntityOrganizationStore((s) => s.organizations.shows)
  const mapOrganization = useEntityOrganizationStore((s) => s.organizations.maps)
  const controllerOrganization = useEntityOrganizationStore((s) => s.organizations.controllers)
  const mixinOrganization = useEntityOrganizationStore((s) => s.organizations.mixins)
  const libraryOrganization = useEntityOrganizationStore((s) => s.organizations.libraries)
  const patternOrganizationLoaded = useEntityOrganizationStore((s) => s.loaded.patterns)
  const showOrganizationLoaded = useEntityOrganizationStore((s) => s.loaded.shows)
  const mapOrganizationLoaded = useEntityOrganizationStore((s) => s.loaded.maps)
  const controllerOrganizationLoaded = useEntityOrganizationStore((s) => s.loaded.controllers)
  const mixinOrganizationLoaded = useEntityOrganizationStore((s) => s.loaded.mixins)
  const libraryOrganizationLoaded = useEntityOrganizationStore((s) => s.loaded.libraries)
  const loadOrganization = useEntityOrganizationStore((s) => s.loadOrganization)
  const mutateOrganization = useEntityOrganizationStore((s) => s.mutateOrganization)
  const liveControllers = useControllerStore((s) => s.controllers)
  const navigate = useRouterStore((s) => s.navigate)
  const route = useRouterStore((s) => s.route)
  const showsEnabled = useRouterStore((s) => s.featureAccess.shows)
  const activeStockShowId = route.kind === 'studio' && route.entity?.kind === 'shows'
    && STOCK_SHOWS.some((item) => item.id === route.entity?.id)
    ? route.entity.id
    : null
  const createShowFromController = useShowStore((s) => s.createShowFromController)
  // Any profile can seed a new Show: since #775 the action wires target
  // identity, Stage map, and pixel count — zones are carved inside the Show.
  const showSeedProfile = controllerProfiles.find((profile) => (
    profileMatchesLive(profile, liveControllers)
  )) ?? controllerProfiles[0]
  const railOperationFailure = useStudioOperationStore((s) => s.failures.rail)
  const executeStudioOperation = useStudioOperationStore((s) => s.execute)
  const retryStudioOperation = useStudioOperationStore((s) => s.retry)
  const dismissStudioOperation = useStudioOperationStore((s) => s.dismiss)

  // Open-from-disk (.epe import) lives next to "New pattern" (#141): both create
  // a pattern, so they sit together on the Patterns header.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const showFileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [showImportDialog, setShowImportDialog] = useState<ShowImportDialogState | null>(null)
  const [showImportBusy, setShowImportBusy] = useState(false)
  const [showStockShows, setShowStockShows] = useState(true)
  const importErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const importNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current)
    if (importNoticeTimerRef.current) clearTimeout(importNoticeTimerRef.current)
  }, [])

  const patternIdsKey = userPatterns.map((pattern) => pattern.id).join('\0')
  const showIdsKey = userShows.map((show) => show.id).join('\0')
  const mapIdsKey = userMaps.map((map) => map.id).join('\0')
  const controllerIdsKey = controllerProfiles.map((profile) => profile.id).join('\0')
  const mixinIdsKey = userMixins.map((mixin) => mixin.id).join('\0')
  const libraryIdsKey = userLibraries.map((library) => library.id).join('\0')

  useEffect(() => {
    if (!patternOrganizationLoaded) return
    void mutateOrganization('patterns', userPatterns.map((pattern) => pattern.id), (organization) => organization)
  }, [mutateOrganization, patternIdsKey, patternOrganizationLoaded, userPatterns])

  useEffect(() => {
    if (!showOrganizationLoaded) return
    void mutateOrganization('shows', userShows.map((show) => show.id), (organization) => organization)
  }, [mutateOrganization, showIdsKey, showOrganizationLoaded, userShows])

  useEffect(() => {
    if (!mapOrganizationLoaded) return
    void mutateOrganization('maps', userMaps.map((map) => map.id), (organization) => organization)
  }, [mapIdsKey, mapOrganizationLoaded, mutateOrganization, userMaps])

  useEffect(() => {
    if (!controllerOrganizationLoaded) return
    void mutateOrganization('controllers', controllerProfiles.map((profile) => profile.id), (organization) => organization)
  }, [controllerIdsKey, controllerOrganizationLoaded, controllerProfiles, mutateOrganization])

  useEffect(() => {
    if (!mixinOrganizationLoaded) return
    void mutateOrganization('mixins', userMixins.map((mixin) => mixin.id), (organization) => organization)
  }, [mixinIdsKey, mixinOrganizationLoaded, mutateOrganization, userMixins])

  useEffect(() => {
    if (!libraryOrganizationLoaded) return
    void mutateOrganization('libraries', userLibraries.map((library) => library.id), (organization) => organization)
  }, [libraryIdsKey, libraryOrganizationLoaded, mutateOrganization, userLibraries])

  function showImportError(msg: string) {
    setImportError(msg)
    if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current)
    importErrorTimerRef.current = setTimeout(() => setImportError(null), 4000)
  }

  function showImportNotice(msg: string) {
    setImportNotice(msg)
    if (importNoticeTimerRef.current) clearTimeout(importNoticeTimerRef.current)
    importNoticeTimerRef.current = setTimeout(() => setImportNotice(null), 8000)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportNotice(null)
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
      const mapResolution = resolveArtifactPreferredMap(parsed.stamp, userMaps)
      const authors = extractPatternAuthors(parsed.src)
      const record: PatternRecord = {
        id,
        name,
        src: parsed.src,
        controls: {},
        ...(authors.length ? { authors } : {}),
        ...(mapResolution.status === 'resolved' ? { settings: { mapId: mapResolution.mapId } } : {}),
        updatedAt: Date.now(),
      }
      requestBufferReplacement(async () => {
        await addPattern(record)
        requestBufferReplacement(() => {
          if (mapResolution.status === 'resolved') useMapStore.getState().setActiveMap(mapResolution.mapId)
          else if (mapResolution.message) showImportNotice(mapResolution.message)
          openPatternRecord(record)
        })
      })
    }
    reader.readAsText(file)
  }

  function handleShowFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    void file.arrayBuffer().then(async (buffer) => {
      const bundle = await parseShowFileBundle(new Uint8Array(buffer))
      const plan = planShowImport(bundle, {
        patterns: usePatternStore.getState().userPatterns,
        maps: useMapStore.getState().userMaps,
        showNames: useShowStore.getState().shows.map((show) => show.name),
      })
      setShowImportDialog({ kind: 'plan', plan })
    }).catch((cause) => {
      setShowImportDialog({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'This is not a valid Show file.',
        ...(cause instanceof ShowImportPlanError && cause.entityId ? { entityId: cause.entityId } : {}),
      })
    })
  }

  async function confirmShowImport() {
    if (showImportDialog?.kind !== 'plan' || showImportBusy) return
    setShowImportBusy(true)
    const createdPatterns: string[] = []
    const createdMaps: string[] = []
    let createdShow = false
    try {
      const applied = applyShowImportPlan(showImportDialog.plan)
      for (const pattern of applied.newPatterns) {
        await addPattern(pattern)
        createdPatterns.push(pattern.id)
      }
      for (const map of applied.newMaps) {
        await addMap(map)
        createdMaps.push(map.id)
      }
      await addImportedShow(applied.show)
      createdShow = true
      setShowImportDialog(null)
      openUserShow(applied.show)
    } catch (cause) {
      const plannedShowId = showImportDialog.plan.show.id
      if (createdShow) await useShowStore.getState().removeShow(plannedShowId).catch(() => {})
      for (const id of createdMaps.reverse()) await useMapStore.getState().removeMap(id).catch(() => {})
      for (const id of createdPatterns.reverse()) await usePatternStore.getState().removePattern(id).catch(() => {})
      setShowImportDialog({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'The Show could not be imported.',
      })
    } finally {
      setShowImportBusy(false)
    }
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
  const lastEntityByModeRef = useRef<Record<RailMode, string | null>>({
    patterns: null,
    maps: null,
    mixins: null,
    libraries: null,
    controllers: null,
    shows: null,
  })
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({
    top: 0,
    height: 0,
    visible: false,
    left: 0,
    width: 0,
    horizontalVisible: false,
  })
  const [personalWorkspaceAuthenticated, setPersonalWorkspaceAuthenticated] = useState(false)
  const setGlobalWorkspaceAuthenticated = useWorkspaceStore((s) => s.setPersonalWorkspaceAuthenticated)
  const query = queries[railMode]
  const setQuery = (next: string) => setQueries((q) => ({ ...q, [railMode]: next }))

  function handleRailModeChange(next: RailMode) {
    requestBufferReplacement(() => {
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
        const id = userShows.some((show) => show.id === last) || STOCK_SHOWS.some((show) => show.id === last)
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
        ? (userPatterns.some((p) => p.id === last) || STOCK_PATTERNS.some((p) => p.name === last) ? last : null)
        : next === 'maps'
          ? (userMaps.some((m) => m.id === last) || STOCK_MAP_ITEMS.some((m) => m.id === last) ? last : null)
        : next === 'mixins'
          ? (userMixins.some((m) => m.id === last) || STOCK_MIXIN_ITEMS.some((m) => m.id === last) ? last : null)
        : null
      navigate({ kind: 'studio', entity: { kind: next, id } })
    })
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
    for (const target of railScrollResizeTargets(el)) resizeObserver.observe(target)
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
      // A deep-linked demo can already be active before its persisted override bag
      // arrives. Its identity therefore does not change to retrigger Preview's
      // open-time seed; apply the newly hydrated cascade explicitly (#805).
      if (usePatternStore.getState().activeDemoName !== null) seedActiveSettings()
      await loadPatterns()
      if (cancelled) return
      if (session.authenticated) {
        const startersChanged = await ensureWorkspaceStarters(getPersonalContentProvider(), {
          patternIds: usePatternStore.getState().userPatterns.map((pattern) => pattern.id),
          mapIds: useMapStore.getState().userMaps.map((map) => map.id),
          mixinIds: useMixinStore.getState().userMixins.map((mixin) => mixin.id),
          libraryIds: useLibraryStore.getState().userLibraries.map((library) => library.id),
          showIds: useShowStore.getState().shows.map((show) => show.id),
          controllerIds: useControllerProfileStore.getState().profiles.map((profile) => profile.id),
        }).catch((error) => {
          console.warn('Could not finish new-workspace starter creation', error)
          return false
        })
        if (cancelled) return
        if (startersChanged) {
          await useMapStore.getState().loadMaps()
          if (cancelled) return
          await useMixinStore.getState().loadMixins()
          if (cancelled) return
          await useLibraryStore.getState().loadLibraries()
          if (cancelled) return
          await loadPatterns()
          if (cancelled) return
        }
      }
      await loadOrganization('patterns', usePatternStore.getState().userPatterns.map((pattern) => pattern.id))
      if (cancelled) return
      await loadOrganization('shows', useShowStore.getState().shows.map((show) => show.id))
      if (cancelled) return
      await loadOrganization('maps', useMapStore.getState().userMaps.map((map) => map.id))
      if (cancelled) return
      await loadOrganization('controllers', useControllerProfileStore.getState().profiles.map((profile) => profile.id))
      if (cancelled) return
      await loadOrganization('mixins', useMixinStore.getState().userMixins.map((mixin) => mixin.id))
      if (cancelled) return
      await loadOrganization('libraries', useLibraryStore.getState().userLibraries.map((library) => library.id))
      if (cancelled) return
      // A deep link to a concrete studio entity outranks the last-active restore
      // (#308): App's route effect opens the addressed pattern once loadPatterns
      // lands. Kind-only shell routes (/studio/maps, /studio/mixins, ...) still
      // show the restored/default editor content beside the active rail list.
      const route = useRouterStore.getState().route
      if (route.kind === 'studio' && route.entity !== null && route.entity.id !== null) return
      const last = await getPersonalContentProvider().getLastActive().catch(() => undefined)
      const { userPatterns, setActiveLibrary } = usePatternStore.getState()
      const { userLibraries, openExistingLibrary } = useLibraryStore.getState()
      const { shows, openShow } = useShowStore.getState()
      const { setSource, setIsReadOnly } = useEditorStore.getState()
      const lastShowIsGated = last?.type === 'show'
        && !useRouterStore.getState().featureAccess.shows
      if (!last || lastShowIsGated) {
        openDemoPattern(DEFAULT_DEMO_NAME, { rememberLastActive: !lastShowIsGated })
        return
      }
      if (last.type === 'pattern') {
        const p = userPatterns.find((p) => p.id === last.id)
        if (p) openPatternRecord(p)
      } else if (last.type === 'demo') {
        if (DEMOS[last.name]) openDemoPattern(last.name)
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
  }, [loadControllerProfiles, loadLibraries, loadOrganization, loadPatterns, loadShows, setGlobalWorkspaceAuthenticated])

  function openUserPattern(pattern: PatternRecord) {
    requestBufferReplacement(() => {
      openPatternRecord(pattern)
    })
  }

  function openStockPatternRoute(name: string) {
    requestBufferReplacement(() => {
      openDemoPattern(name)
      navigate({ kind: 'studio', entity: { kind: 'patterns', id: name } })
    })
  }

  // Create a fresh "Untitled Pattern" and open it. Lives next to Patterns
  // (#141) so a new pattern is created right by its list.
  function handleCreatePattern() {
    if (!personalWorkspaceAuthenticated) return
    const id = newPersonalContentId()
    const name = uniquePatternName('Untitled Pattern', userPatterns.map((p) => p.name))
    const record: PatternRecord = { id, name, src: NEW_PATTERN_SRC, controls: {}, updatedAt: Date.now() }
    requestBufferReplacement(() => executeStudioOperation({
      surface: 'rail',
      action: 'create',
      entityKind: 'pattern',
      entityName: name,
      run: async () => {
        await addPattern(record)
        requestBufferReplacement(() => {
          openPatternRecord(record)
        })
      },
    }))
  }

  // Open a custom map in editor map mode (#151): loads its source, flips the
  // editor to the JS map flavor, and drives the bare-geometry preview.
  function openUserMap(map: MapRecord) {
    requestBufferReplacement(() => {
      closeDocs()
      closeMixinEditor()
      closeLibraryEditor()
      openExistingMap(map)
      navigate({ kind: 'studio', entity: { kind: 'maps', id: map.id } })
    })
  }

  function openStockMapRoute(id: string) {
    requestBufferReplacement(() => {
      closeDocs()
      closeMixinEditor()
      closeLibraryEditor()
      openStockMap(id)
      navigate({ kind: 'studio', entity: { kind: 'maps', id } })
    })
  }

  function handleCreateMap() {
    const record: MapRecord = {
      id: newPersonalContentId(),
      name: uniquePatternName('Untitled Map', userMaps.map((map) => map.name)),
      dim: 2,
      generator: 'custom',
      params: {},
      source: MAP_SKELETON,
      updatedAt: Date.now(),
    }
    requestBufferReplacement(() => executeStudioOperation({
      surface: 'rail',
      action: 'create',
      entityKind: 'map',
      entityName: record.name,
      run: async () => {
        await addMap(record)
        requestBufferReplacement(() => {
          closeMixinEditor()
          closeLibraryEditor()
          openExistingMap(record)
          navigate({ kind: 'studio', entity: { kind: 'maps', id: record.id } })
        })
      },
    }))
  }

  function handleCreateMixin() {
    const record: MixinRecord = {
      id: newPersonalContentId(),
      name: uniquePatternName('Untitled Mixin', userMixins.map((mixin) => mixin.name)),
      kind: 'bind',
      src: MIXIN_SKELETON,
      updatedAt: Date.now(),
    }
    requestBufferReplacement(() => executeStudioOperation({
      surface: 'rail',
      action: 'create',
      entityKind: 'mixin',
      entityName: record.name,
      run: async () => {
        await addMixin(record)
        requestBufferReplacement(() => {
          closeMapEditor()
          closeLibraryEditor()
          openExistingMixin(record)
          navigate({ kind: 'studio', entity: { kind: 'mixins', id: record.id } })
        })
      },
    }))
  }

  function openUserMixin(mixin: MixinRecord) {
    requestBufferReplacement(() => {
      closeDocs()
      closeLibraryEditor()
      openExistingMixin(mixin)
      navigate({ kind: 'studio', entity: { kind: 'mixins', id: mixin.id } })
    })
  }

  function openStockMixinRoute(id: string) {
    requestBufferReplacement(() => {
      closeDocs()
      closeLibraryEditor()
      openStockMixin(id)
      navigate({ kind: 'studio', entity: { kind: 'mixins', id } })
    })
  }

  function openStockLibraryRoute(name: string) {
    requestBufferReplacement(() => {
      openStockLibrary(name)
      navigate({ kind: 'studio', entity: { kind: 'libraries', id: name } })
    })
  }

  function openUserLibrary(library: LibraryRecord) {
    requestBufferReplacement(() => {
      closeDocs()
      openExistingLibrary(library)
      navigate({ kind: 'studio', entity: { kind: 'libraries', id: library.id } })
    })
  }

  function handleCreateLibrary() {
    const name = nextLibraryName({
      stockNames: Object.keys(LIBRARIES),
      userNames: userLibraries.map((library) => library.name),
      builtinNames: builtinNamespaceNames(),
    })
    const library: LibraryRecord = {
      id: newPersonalContentId(),
      name,
      src: LIBRARY_SKELETON.replace(/Lib1/g, name),
      updatedAt: Date.now(),
    }
    requestBufferReplacement(() => executeStudioOperation({
      surface: 'rail',
      action: 'create',
      entityKind: 'library',
      entityName: library.name,
      run: async () => {
        await addLibrary(library)
        requestBufferReplacement(() => {
          closeMapEditor()
          closeMixinEditor()
          openExistingLibrary(library)
          navigate({ kind: 'studio', entity: { kind: 'libraries', id: library.id } })
        })
      },
    }))
  }

  function handleRenamePattern(patternId: string, name: string) {
    const currentName = userPatterns.find((pattern) => pattern.id === patternId)?.name ?? name
    void executeStudioOperation({
      surface: 'rail',
      action: 'rename',
      entityKind: 'pattern',
      entityName: currentName,
      run: () => renamePattern(patternId, name),
    })
  }

  function handleRenameMap(mapId: string, name: string) {
    const currentName = userMaps.find((map) => map.id === mapId)?.name ?? name
    void executeStudioOperation({
      surface: 'rail',
      action: 'rename',
      entityKind: 'map',
      entityName: currentName,
      run: () => renameMap(mapId, name),
    })
  }

  function handleRenameMixin(mixinId: string, name: string) {
    const currentName = userMixins.find((mixin) => mixin.id === mixinId)?.name ?? name
    void executeStudioOperation({
      surface: 'rail',
      action: 'rename',
      entityKind: 'mixin',
      entityName: currentName,
      run: () => renameMixin(mixinId, name),
    })
  }

  function handleRenameLibrary(libraryId: string, name: string) {
    const currentName = userLibraries.find((library) => library.id === libraryId)?.name ?? name
    void executeStudioOperation({
      surface: 'rail',
      action: 'rename',
      entityKind: 'library',
      entityName: currentName,
      run: () => renameLibrary(libraryId, name),
    })
  }

  function handleRenameControllerProfile(profileId: string, name: string) {
    const currentName = controllerProfiles.find((profile) => profile.id === profileId)?.name ?? name
    void executeStudioOperation({
      surface: 'rail',
      action: 'rename',
      entityKind: 'controller',
      entityName: currentName,
      run: () => renameControllerProfile(profileId, name),
    })
  }

  function openControllerProfile(profileId: string) {
    requestBufferReplacement(() => {
      closeMapEditor()
      closeMixinEditor()
      closeLibraryEditor()
      closeDocs()
      navigate({ kind: 'studio', entity: { kind: 'controllers', id: profileId } })
    })
  }

  function handleCreateShow() {
    requestBufferReplacement(() => {
      closeMapEditor()
      closeMixinEditor()
      closeLibraryEditor()
      closeDocs()
      beginShowCreation()
    })
  }

  function handleCreateShowFromController() {
    if (!showSeedProfile) return
    requestBufferReplacement(async () => {
      closeMapEditor()
      closeMixinEditor()
      closeLibraryEditor()
      closeDocs()
      const show = await createShowFromController(showSeedProfile)
      navigate({ kind: 'studio', entity: { kind: 'shows', id: show.id } })
    })
  }

  async function handleDuplicateShow(id: string) {
    const copy = await duplicateShow(id)
    if (copy) openUserShow(copy)
  }

  function openUserShow(show: ShowRecord) {
    requestBufferReplacement(() => {
      closeMapEditor()
      closeMixinEditor()
      closeLibraryEditor()
      closeDocs()
      openShow(show.id)
      navigate({ kind: 'studio', entity: { kind: 'shows', id: show.id } })
    })
  }

  function openStockShowRoute(item: StockShow) {
    requestBufferReplacement(() => {
      closeMapEditor()
      closeMixinEditor()
      closeLibraryEditor()
      closeDocs()
      void openShow(null)
      navigate({ kind: 'studio', entity: { kind: 'shows', id: item.id } })
    })
  }

  async function handleRemoveControllerProfile(profileId: string) {
    await removeControllerProfile(profileId)
    if (route.kind === 'studio' && route.entity?.kind === 'controllers' && route.entity.id === profileId) {
      navigate({ kind: 'studio', entity: { kind: 'controllers', id: null } })
    }
  }

  function emptyTrashFailureMessage(
    label: string,
    entityIds: readonly string[],
    currentIds: () => readonly string[],
  ): string {
    const current = new Set(currentIds())
    const remaining = entityIds.filter((id) => current.has(id)).length
    const completed = entityIds.length - remaining
    if (remaining === 0) {
      const deleted = completed === 1 ? '1 item was deleted' : `${completed} items were deleted`
      return `Could not empty ${label} Trash. ${deleted}, but Trash could not be cleared.`
    }
    const retained = remaining === 1 ? '1 item remains' : `${remaining} items remain`
    if (completed === 0) return `Could not empty ${label} Trash. ${retained}.`
    const deleted = completed === 1 ? '1 item was deleted' : `${completed} items were deleted`
    return `Could not empty ${label} Trash. ${deleted}; ${retained}.`
  }

  function runEmptyTrash(input: {
    organizationKind: EntityOrganizationKind
    entityKind: StudioOperationEntityKind
    label: string
    entityIds: string[]
    currentIds: () => string[]
    remove: (id: string) => Promise<void>
  }): Promise<boolean> {
    const requestedIds = [...input.entityIds]
    const remainingIds = () => {
      const current = new Set(input.currentIds())
      return requestedIds.filter((id) => current.has(id))
    }
    return executeStudioOperation({
      surface: 'rail',
      action: 'empty-trash',
      entityKind: input.entityKind,
      entityName: `${input.label} Trash`,
      failureMessage: () => emptyTrashFailureMessage(input.label, requestedIds, input.currentIds),
      run: async () => {
        try {
          for (const id of remainingIds()) await input.remove(id)
        } catch (cause) {
          await mutateOrganization(input.organizationKind, input.currentIds(), (organization) => organization)
          throw cause
        }
        await mutateOrganization(input.organizationKind, input.currentIds(), emptyEntityOrganizationTrash)
      },
    })
  }

  function handleRemovePatterns(patternIds: string[]) {
    return runEmptyTrash({
      organizationKind: 'patterns',
      entityKind: 'pattern',
      label: 'Pattern',
      entityIds: patternIds,
      currentIds: () => usePatternStore.getState().userPatterns.map((pattern) => pattern.id),
      remove: removePattern,
    })
  }

  async function handleRemoveShows(showIds: string[]) {
    for (const showId of showIds) await removeShow(showId)
    await mutateOrganization(
      'shows',
      useShowStore.getState().shows.map((show) => show.id),
      emptyEntityOrganizationTrash,
    )
    if (route.kind === 'studio' && route.entity?.kind === 'shows' && showIds.includes(route.entity.id ?? '')) {
      navigate({ kind: 'studio', entity: { kind: 'shows', id: null } })
    }
  }

  async function handleRemoveControllerProfiles(profileIds: string[]) {
    for (const profileId of profileIds) await handleRemoveControllerProfile(profileId)
    await mutateOrganization(
      'controllers',
      useControllerProfileStore.getState().profiles.map((profile) => profile.id),
      emptyEntityOrganizationTrash,
    )
  }

  function handleRemoveMaps(mapIds: string[]) {
    return runEmptyTrash({
      organizationKind: 'maps',
      entityKind: 'map',
      label: 'Map',
      entityIds: mapIds,
      currentIds: () => useMapStore.getState().userMaps.map((map) => map.id),
      remove: handleRemoveMap,
    })
  }

  function handleRemoveMixins(mixinIds: string[]) {
    return runEmptyTrash({
      organizationKind: 'mixins',
      entityKind: 'mixin',
      label: 'Mixin',
      entityIds: mixinIds,
      currentIds: () => useMixinStore.getState().userMixins.map((mixin) => mixin.id),
      remove: handleRemoveMixin,
    })
  }

  function handleRemoveLibraries(libraryIds: string[]) {
    return runEmptyTrash({
      organizationKind: 'libraries',
      entityKind: 'library',
      label: 'Library',
      entityIds: libraryIds,
      currentIds: () => useLibraryStore.getState().userLibraries.map((library) => library.id),
      remove: handleRemoveLibrary,
    })
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
    (pattern) => matchesLens(nativeDim(pattern.src), dimLens),
  )
  const visibleStockPatterns = STOCK_PATTERNS.filter(
    (pattern) => matchesLens(pattern.dim, dimLens),
  )

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
      <input
        ref={showFileInputRef}
        type="file"
        accept=".pxlshow,application/gzip,application/json"
        className="hidden"
        data-testid="show-file-input"
        onChange={handleShowFileChange}
      />
      <ActivityStrip
        mode={railMode}
        onModeChange={handleRailModeChange}
        showsEnabled={showsEnabled}
        collapsed={collapsed}
        onToggleCollapsed={onCollapsedChange ? () => onCollapsedChange(!collapsed) : undefined}
      />
      <div className={collapsed ? 'hidden' : 'flex min-w-0 flex-1 flex-col'}>
        {railMode === 'patterns' && (
          <PatternsRailSection
            onCollapse={onCollapsedChange ? () => onCollapsedChange(true) : undefined}
            fileInputRef={fileInputRef}
            importError={importError}
            importNotice={importNotice}
            personalWorkspaceAuthenticated={personalWorkspaceAuthenticated}
            dimLens={dimLens}
            query={query}
            activePatternId={activePatternId}
            activeDemoName={activeDemoName}
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
            onRenamePattern={handleRenamePattern}
            onEmptyTrash={handleRemovePatterns}
            personalOrganization={patternOrganization}
            onPersonalOrganizationChange={(organization) => void mutateOrganization(
              'patterns',
              userPatterns.map((pattern) => pattern.id),
              () => organization,
            )}
          />
        )}
        {railMode === 'maps' && (
          <MapsRailSection
            onCollapse={onCollapsedChange ? () => onCollapsedChange(true) : undefined}
            personalWorkspaceAuthenticated={personalWorkspaceAuthenticated}
            dimLens={dimLens}
            query={query}
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
            onRenameMap={handleRenameMap}
            personalOrganization={mapOrganization}
            onPersonalOrganizationChange={(organization) => void mutateOrganization(
              'maps',
              userMaps.map((map) => map.id),
              () => organization,
            )}
            onEmptyTrash={handleRemoveMaps}
          />
        )}
        {railMode === 'libraries' && (
          <LibrariesRailSection
            onCollapse={onCollapsedChange ? () => onCollapsedChange(true) : undefined}
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
            onRenameLibrary={handleRenameLibrary}
            personalOrganization={libraryOrganization}
            onPersonalOrganizationChange={(organization) => void mutateOrganization(
              'libraries',
              userLibraries.map((library) => library.id),
              () => organization,
            )}
            onEmptyTrash={handleRemoveLibraries}
            validateLibraryName={validateLibraryNamespace}
          />
        )}
        {railMode === 'controllers' && (
          <ControllersRailSection
            onCollapse={onCollapsedChange ? () => onCollapsedChange(true) : undefined}
            personalWorkspaceAuthenticated={personalWorkspaceAuthenticated}
            controllerProfiles={controllerProfiles}
            activeControllerProfileId={activeControllerProfileId}
            scrollRef={scrollRef}
            scrollMetrics={scrollMetrics}
            onScroll={updateScrollMetrics}
            profileIsLive={(profile) => profileMatchesLive(profile, liveControllers)}
            onOpenControllerProfile={openControllerProfile}
            onRenameControllerProfile={handleRenameControllerProfile}
            personalOrganization={controllerOrganization}
            onPersonalOrganizationChange={(organization) => void mutateOrganization(
              'controllers',
              controllerProfiles.map((profile) => profile.id),
              () => organization,
            )}
            onEmptyTrash={handleRemoveControllerProfiles}
          />
        )}
        {railMode === 'mixins' && (
          <MixinsRailSection
            onCollapse={onCollapsedChange ? () => onCollapsedChange(true) : undefined}
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
            onRenameMixin={handleRenameMixin}
            personalOrganization={mixinOrganization}
            onPersonalOrganizationChange={(organization) => void mutateOrganization(
              'mixins',
              userMixins.map((mixin) => mixin.id),
              () => organization,
            )}
            onEmptyTrash={handleRemoveMixins}
          />
        )}
        {railMode === 'shows' && (
          <ShowsRailSection
            onCollapse={onCollapsedChange ? () => onCollapsedChange(true) : undefined}
            personalWorkspaceAuthenticated={personalWorkspaceAuthenticated}
            userShows={userShows}
            activeShowId={activeShowId}
            stockShows={STOCK_SHOWS}
            activeStockShowId={activeStockShowId}
            showStockShows={showStockShows}
            showSeedProfileName={showSeedProfile ? controllerProfileDisplayName(showSeedProfile) : null}
            query={query}
            scrollRef={scrollRef}
            scrollMetrics={scrollMetrics}
            onScroll={updateScrollMetrics}
            onCreateShow={handleCreateShow}
            onImportShow={() => showFileInputRef.current?.click()}
            onCreateShowFromController={() => void handleCreateShowFromController()}
            onOpenShow={openUserShow}
            onOpenStockShow={openStockShowRoute}
            onToggleStockShows={() => setShowStockShows((visible) => !visible)}
            onRenameShow={renameShow}
            onDuplicateShow={(id) => void handleDuplicateShow(id)}
            onEmptyTrash={handleRemoveShows}
            onQueryChange={setQuery}
            personalOrganization={showOrganization}
            onPersonalOrganizationChange={(organization) => void mutateOrganization(
              'shows',
              userShows.map((show) => show.id),
              () => organization,
            )}
          />
        )}
        {railOperationFailure && (
          <SaveFailureNotice
            message={railOperationFailure.message}
            onRetry={() => void retryStudioOperation('rail')}
            onDismiss={() => dismissStudioOperation('rail')}
            retryLabel={studioOperationRetryLabel(railOperationFailure)}
            dismissLabel={studioOperationDismissLabel(railOperationFailure)}
            compact
            testId="studio-rail-operation-failure"
          />
        )}
        {showImportDialog && (
          <ShowImportPlanDialog
            state={showImportDialog}
            busy={showImportBusy}
            onCancel={() => setShowImportDialog(null)}
            onConfirm={() => void confirmShowImport()}
          />
        )}
      </div>
    </div>
  )
}
