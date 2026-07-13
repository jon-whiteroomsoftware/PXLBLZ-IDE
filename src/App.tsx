import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { Braces, Code2, Cpu, ExternalLink, FileText, Images, Lock, LogIn, Map as MapIcon, PanelsTopLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Editor } from '@/components/Editor'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
import { DimPills } from '@/components/DimPills'
import { PatternList } from '@/components/PatternList'
import { Preview } from '@/components/Preview'
import { PaneHeader } from '@/components/PaneHeader'
import { ControllerBar } from '@/components/ControllerBar'
import { AuthStatus } from '@/components/AuthStatus'
import { LibrariesMenu } from '@/components/LibrariesMenu'
import { DocsMenu } from '@/components/DocsMenu'
import { DocsReader } from '@/components/DocsReader'
import { SendToController } from '@/components/SendToController'
import { PatternActionsMenu } from '@/components/PatternActionsMenu'
import { GalleryPage } from '@/components/GalleryPage'
import { PatternDetailPage } from '@/components/PatternDetailPage'
import { ControllerProfilePage } from '@/components/ControllerProfilePage'
import { ControllerSavedProgramsPane } from '@/components/ControllerSavedProgramsPane'
import { ShowEditor } from '@/components/ShowEditor'
import { ShowStagePreview } from '@/components/ShowStagePreview'
import { ShowCreationFlow, type ShowCreationMapOption } from '@/components/ShowCreationFlow'
import { ShowClassificationFlow } from '@/components/ShowClassificationFlow'
import { useControllerStore } from '@/store/controllerStore'
import { MapModeHeader } from '@/components/MapModeHeader'
import { LibraryModeHeader } from '@/components/LibraryModeHeader'
import { LibraryContextPane } from '@/components/LibraryContextPane'
import { useMapStore, STOCK_MAP_ITEMS } from '@/store/mapStore'
import { MixinModeHeader } from '@/components/MixinModeHeader'
import { MixinProvenancePane } from '@/components/MixinProvenancePane'
import { MapContextPane } from '@/components/MapContextPane'
import { useMixinStore, STOCK_MIXIN_ITEMS } from '@/store/mixinStore'
import { usePatternStore, PatternRecord } from '@/store/patternStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useShowStore } from '@/store/showStore'
import { useEditorStore } from '@/store/editorStore'
import { useDocsStore } from '@/store/docsStore'
import { useRouterStore } from '@/store/routerStore'
import { openDemoPattern, openPatternRecord } from '@/store/openPattern'
import { openStockLibrary } from '@/store/openLibrary'
import { routePath, routesEqual, type Route } from '@/engine/routes'
import { trackEvent, trackPageView } from '@/analytics'
import { controllerProfileDisplayName } from '@/engine/controllerProfile'
import { decideStudioAccess, studioWelcomeAcknowledgedKey } from '@/engine/studioAccess'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { forkSettingsSnapshot } from '@/store/settingsCascade'
import { bundle } from '@/engine/bundle'
import { compileLibraries } from '@/engine/libraries'
import { stampArtifact } from '@/engine/artifactStamp'
import { LIBRARIES } from '@/pixelblaze/libs'
import { uniquePatternName } from '@/engine/patternName'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { exportedDims } from '@/engine/exportedDims'
import { galleryPatternBySlug, patternSlug, type GalleryPattern } from '@/engine/galleryCatalog'
import { docExternalHref, getUserDoc, isDocId } from '@/docs/catalog'
import type { AuthProvider } from '@/engine/authSession'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { InlineEntityTitle } from '@/components/InlineEntityTitle'

function Splitter({ onDrag, className = '' }: { onDrag: (dx: number) => void; className?: string }) {
  const lastX = useRef(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    lastX.current = e.clientX

    const onMove = (ev: MouseEvent) => {
      onDrag(ev.clientX - lastX.current)
      lastX.current = ev.clientX
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  return (
    <div
      className={`w-1 shrink-0 bg-seam hover:bg-zinc-600 cursor-col-resize transition-colors select-none ${className}`}
      onMouseDown={handleMouseDown}
    />
  )
}

function stampedPatternArtifact(source: string, id: string, name: string, libraries: Record<string, string>): string {
  const { code } = bundle(source, libraries)
  return stampArtifact(code, { kind: 'pattern', id, name })
}

function patternDownloadName(name: string): string {
  const safe = name.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${safe || 'pattern'}.js`
}

function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/javascript;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Full-body message surface for routes that don't render the three-pane studio
// yet (#308): the Gallery/pattern-detail placeholders and graceful dead ends.
function RouteMessage({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string
  detail: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div data-testid="route-message" className="flex flex-1 min-h-0 items-center justify-center">
      <div className="max-w-md px-6 text-center">
        <h1 className="font-mono text-lg text-zinc-200">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">{detail}</p>
        {actionLabel && onAction && (
          <Button
            size="xs"
            variant="ghost"
            className="mt-4 text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

function StudioPaneMessage({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode
  title: string
  detail: string
}) {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-950/40 px-6 font-mono">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-md border border-zinc-800 bg-panel text-zinc-500">
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-zinc-300">{title}</h2>
        <p className="mt-2 text-xs leading-5 text-zinc-600">{detail}</p>
      </div>
    </div>
  )
}

function EmptyContextPane({ label }: { label: string }) {
  return (
    <StudioPaneMessage
      icon={<PanelsTopLeft size={18} aria-hidden />}
      title={`${label} context`}
      detail="No right-side context pane is available for this view yet."
    />
  )
}

function analyticsRouteTitle(route: Route): string {
  if (route.kind === 'studio') return `studio:${route.entity?.kind ?? 'home'}`
  if (route.kind === 'pattern-detail') return 'pattern-detail'
  if (route.kind === 'docs') return 'docs'
  return route.kind
}

function StudioWelcomePage({
  onSignIn,
  onBack,
}: {
  onSignIn: (provider: AuthProvider) => void
  onBack: () => void
}) {
  return (
    <div data-testid="studio-welcome-page" className="flex flex-1 min-h-0 items-center justify-center px-5">
      <section className="w-full max-w-xl border border-seam bg-panel/90 px-6 py-6 shadow-2xl shadow-black/30 sm:px-8 sm:py-7">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border border-live/40 bg-live/10 text-live">
            <Code2 size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-live/80">Studio workspace</p>
            <h1 className="mt-2 text-xl font-semibold text-zinc-100">Sign in to Studio</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Studio is where your saved patterns, maps, and shows live. Sign in seamlessly with GitHub or Google; your workspace is created automatically the first time you arrive.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                className="border border-live/50 bg-live/15 px-3 font-mono text-xs text-live hover:bg-live/25 hover:text-amber-100"
                onClick={() => onSignIn('github')}
              >
                <LogIn data-icon="inline-start" />
                Continue with GitHub
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 bg-zinc-900 px-3 font-mono text-xs text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-100"
                onClick={() => onSignIn('google')}
              >
                <LogIn data-icon="inline-start" />
                Continue with Google
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="px-3 font-mono text-xs text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200"
                onClick={onBack}
              >
                Back to Gallery
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function App() {
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const addPattern = usePatternStore((s) => s.addPattern)
  const renamePattern = usePatternStore((s) => s.renamePattern)
  const setActivePattern = usePatternStore((s) => s.setActivePattern)
  const removePattern = usePatternStore((s) => s.removePattern)
  const personalWorkspaceAuthenticated = useWorkspaceStore((s) => s.personalWorkspaceAuthenticated)
  const source = useEditorStore((s) => s.source)
  const compileStatus = useEditorStore((s) => s.compileStatus)
  const editorFlavor = useEditorStore((s) => s.editorFlavor)
  const setSource = useEditorStore((s) => s.setSource)
  const setIsReadOnly = useEditorStore((s) => s.setIsReadOnly)
  const setPreviewSource = useEditorStore((s) => s.setPreviewSource)
  const setPreviewPatternName = useEditorStore((s) => s.setPreviewPatternName)
  const activeDocId = useDocsStore((s) => s.activeDocId)
  const syncDocsFromRoute = useDocsStore((s) => s.syncFromRoute)
  const activeDoc = getUserDoc(activeDocId)
  const route = useRouterStore((s) => s.route)
  const navigate = useRouterStore((s) => s.navigate)
  const patternsLoaded = usePatternStore((s) => s.patternsLoaded)
  const userMaps = useMapStore((s) => s.userMaps)
  const mapsLoaded = useMapStore((s) => s.mapsLoaded)
  const userMixins = useMixinStore((s) => s.userMixins)
  const mixinsLoaded = useMixinStore((s) => s.mixinsLoaded)
  const userLibraries = useLibraryStore((s) => s.userLibraries)
  const compileLibrarySet = useMemo(() => compileLibraries(LIBRARIES, userLibraries), [userLibraries])
  const librariesLoaded = useLibraryStore((s) => s.librariesLoaded)
  const editingLibrary = useLibraryStore((s) => s.editingLibrary)
  const controllerProfiles = useControllerProfileStore((s) => s.profiles)
  const controllerProfilesLoaded = useControllerProfileStore((s) => s.profilesLoaded)
  const activeShowId = useShowStore((s) => s.activeShowId)
  const shows = useShowStore((s) => s.shows)
  const showsLoaded = useShowStore((s) => s.showsLoaded)
  const openShow = useShowStore((s) => s.openShow)
  const renameShow = useShowStore((s) => s.renameShow)
  const showCreation = useShowStore((s) => s.showCreation)
  const showClassification = useShowStore((s) => s.showClassification)
  const createNewShow = useShowStore((s) => s.createNewShow)
  const cancelShowCreation = useShowStore((s) => s.cancelShowCreation)
  const confirmShowClassification = useShowStore((s) => s.confirmShowClassification)
  const cancelShowClassification = useShowStore((s) => s.cancelShowClassification)
  const personalWorkspaceResolved = useWorkspaceStore((s) => s.personalWorkspaceResolved)
  const routeSyncedRef = useRef(false)
  const lastTrackedPathRef = useRef<string | null>(null)
  const [studioWelcomeAcknowledged, setStudioWelcomeAcknowledged] = useState(() => {
    try {
      return window.localStorage.getItem(studioWelcomeAcknowledgedKey) === '1'
    } catch {
      return false
    }
  })
  const [showHeaderActionsTarget, setShowHeaderActionsTarget] = useState<HTMLSpanElement | null>(null)
  const showCreationMaps = useMemo((): ShowCreationMapOption[] => [
    ...STOCK_MAP_ITEMS.map((map) => ({
      id: map.id,
      name: map.name,
      dim: map.dim,
      source: 'stock' as const,
      ...(map.fixedPixelCount !== undefined ? { fixedPixelCount: map.fixedPixelCount } : {}),
    })),
    ...userMaps
      .filter((map) => map.generator !== 'custom' || (map.points?.length ?? 0) > 0)
      .map((map) => ({
        id: map.id,
        name: map.name,
        dim: map.dim,
        source: 'user' as const,
        ...(map.generator === 'custom' && map.points?.length
          ? { fixedPixelCount: map.points.length }
          : {}),
      })),
  ], [userMaps])
  const showBeingClassified = showClassification
    ? shows.find((show) => show.id === showClassification.showId) ?? null
    : null
  const classificationTargetControllerName = showBeingClassified?.targetControllerProfileId
    ? controllerProfiles.find((profile) => profile.id === showBeingClassified.targetControllerProfileId)?.name ?? null
    : null

  // History wiring (#308): parse the URL on mount and on back/forward. The
  // hashchange listener keeps legacy #/docs/<id> links (still emitted for
  // in-doc cross-links) redirecting onto the path route.
  useLayoutEffect(() => {
    const sync = () => useRouterStore.getState().syncFromLocation()
    sync()
    routeSyncedRef.current = true
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  // Route → state. Re-runs when personal collections finish loading so a deep
  // link to /studio/patterns/<id> or /studio/maps/<id> resolves once the record
  // exists.
  useEffect(() => {
    if (route.kind === 'docs') {
      if (isDocId(route.docId)) syncDocsFromRoute(route.docId)
      return
    }
    syncDocsFromRoute(null)
    if (route.kind === 'studio' && route.entity !== null && route.entity.kind === 'patterns' && route.entity.id !== null) {
      const entityId = route.entity.id
      const { userPatterns, activePatternId, activeDemoName } = usePatternStore.getState()
      const record = userPatterns.find((p) => p.id === entityId)
      if (record && activePatternId !== entityId) openPatternRecord(record)
      else if (!record && DEMOS[entityId] && activeDemoName !== entityId) openDemoPattern(entityId)
    } else if (route.kind === 'studio' && route.entity !== null && route.entity.kind === 'maps' && route.entity.id !== null) {
      const entityId = route.entity.id
      const { userMaps, editingMap, openExistingMap, openStockMap } = useMapStore.getState()
      if (editingMap?.id === entityId) return
      const record = userMaps.find((m) => m.id === entityId)
      if (record) openExistingMap(record)
      else if (STOCK_MAP_ITEMS.some((m) => m.id === entityId)) openStockMap(entityId)
    } else if (route.kind === 'studio' && route.entity !== null && route.entity.kind === 'mixins' && route.entity.id !== null) {
      const entityId = route.entity.id
      const { userMixins, editingMixin, openExistingMixin, openStockMixin } = useMixinStore.getState()
      if (editingMixin?.id === entityId) return
      const record = userMixins.find((m) => m.id === entityId)
      if (record) openExistingMixin(record)
      else if (STOCK_MIXIN_ITEMS.some((m) => m.id === entityId)) openStockMixin(entityId)
    } else if (route.kind === 'studio' && route.entity !== null && route.entity.kind === 'libraries' && route.entity.id !== null) {
      const entityId = route.entity.id
      const { userLibraries, editingLibrary, openExistingLibrary } = useLibraryStore.getState()
      if (editingLibrary?.id === entityId) return
      const record = userLibraries.find((library) => library.id === entityId)
      if (record) openExistingLibrary(record)
      else if (LIBRARIES[entityId] && !(editingLibrary?.kind === 'stock' && editingLibrary.id === entityId)) {
        openStockLibrary(entityId)
      }
    } else if (route.kind === 'studio' && route.entity !== null && route.entity.kind === 'shows' && route.entity.id !== null) {
      const entityId = route.entity.id
      if (shows.some((show) => show.id === entityId) && activeShowId !== entityId) openShow(entityId)
    }
  }, [route, patternsLoaded, mapsLoaded, mixinsLoaded, librariesLoaded, showsLoaded, syncDocsFromRoute, shows, activeShowId, activeLibraryName, openShow])

  // State → URL: the active studio entity is addressable. Push when moving
  // between entities so back/forward walk them; replace when a plain /studio
  // URL first resolves to an entity (startup restore shouldn't add an entry).
  useEffect(() => {
    const current = useRouterStore.getState().route
    if (current.kind !== 'studio') return
    if (activePatternId !== null && (current.entity === null || current.entity.kind === 'patterns')) {
      const target: Route = { kind: 'studio', entity: { kind: 'patterns', id: activePatternId } }
      if (!routesEqual(current, target)) navigate(target, { replace: current.entity === null || current.entity.id === null })
    } else if (activeDemoName !== null && (current.entity === null || current.entity.kind === 'patterns')) {
      const target: Route = { kind: 'studio', entity: { kind: 'patterns', id: activeDemoName } }
      if (!routesEqual(current, target)) navigate(target, { replace: current.entity === null || current.entity.id === null })
    } else if (
      activeShowId !== null &&
      (current.entity === null || current.entity.kind === 'shows')
    ) {
      const target: Route = { kind: 'studio', entity: { kind: 'shows', id: activeShowId } }
      if (!routesEqual(current, target)) navigate(target, { replace: current.entity === null || current.entity.id === null })
    } else if (
      activeLibraryName !== null &&
      (current.entity === null || current.entity.kind === 'libraries')
    ) {
      const liveEditingLibrary = useLibraryStore.getState().editingLibrary
      const targetId = liveEditingLibrary?.kind === 'existing' ? liveEditingLibrary.id : activeLibraryName
      const target: Route = { kind: 'studio', entity: { kind: 'libraries', id: targetId } }
      if (!routesEqual(current, target)) navigate(target, { replace: current.entity === null || current.entity.id === null })
    }
  }, [activePatternId, activeDemoName, activeLibraryName, activeShowId, editingLibrary, navigate])

  // Signed-out cold Studio goes through a one-time welcome/sign-in gate. A
  // pattern-detail handoff may carry an active built-in demo into Studio (#310),
  // so that read-only demo view is allowed through.
  useEffect(() => {
    const decision = decideStudioAccess({
      route,
      personalWorkspaceResolved,
      personalWorkspaceAuthenticated,
      activeDemoName,
      studioWelcomeAcknowledged,
    })
    if (!routeSyncedRef.current) return
    if (!routesEqual(route, useRouterStore.getState().route)) return
    if (decision === 'show-welcome') navigate({ kind: 'studio-welcome' }, { replace: true })
    if (decision === 'sign-in') {
      trackEvent('sign_in', { surface: 'studio_gate', provider: 'default' })
      window.location.assign('/api/auth/login')
    }
  }, [route, personalWorkspaceResolved, personalWorkspaceAuthenticated, activeDemoName, studioWelcomeAcknowledged, navigate])

  useEffect(() => {
    if (!routeSyncedRef.current) return
    const path = routePath(route, import.meta.env.BASE_URL)
    if (lastTrackedPathRef.current === path) return
    lastTrackedPathRef.current = path
    trackPageView(path, analyticsRouteTitle(route))
  }, [route])

  useEffect(() => {
    if (route.kind === 'studio-welcome' && personalWorkspaceResolved && personalWorkspaceAuthenticated) {
      navigate({ kind: 'studio', entity: null }, { replace: true })
    }
  }, [route, personalWorkspaceResolved, personalWorkspaceAuthenticated, navigate])

  // On startup, probe extension presence (global) and, if a Controller IP was
  // remembered from a previous session, reconnect only that one (#210). Silent on
  // failure: a missing extension or unreachable Controller just stays disconnected.
  const autoConnectController = useControllerStore((s) => s.autoConnect)
  const detectExtension = useControllerStore((s) => s.detectExtension)
  useEffect(() => {
    void detectExtension()
    void autoConnectController()
  }, [autoConnectController, detectExtension])

  // If source becomes empty while a pattern is active (e.g. after a store hot-reload),
  // restore it from the pattern record so the editor doesn't go blank.
  useEffect(() => {
    if (source !== '' || !activePatternId) return
    const p = userPatterns.find((p) => p.id === activePatternId)
    if (!p) return
    setSource(p.src)
    setPreviewSource(p.src)
    setIsReadOnly(false)
  }, [source, activePatternId, userPatterns, setSource, setPreviewSource, setIsReadOnly])

  const handleForkDemo = useCallback(async () => {
    if (!activeDemoName || !personalWorkspaceAuthenticated) return
    const id = newPersonalContentId()
    const existingNames = userPatterns.map((p) => p.name)
    const name = uniquePatternName(activeDemoName, existingNames)
    // Snapshot the demo's effective settings as frozen layer-1 overrides
    // BEFORE setActivePattern flips state, so the fork keeps the demo's curated look.
    const settings = forkSettingsSnapshot()
    const record: PatternRecord = {
      id,
      name,
      src: source,
      controls: {},
      settings,
      updatedAt: Date.now(),
    }
    await addPattern(record)
    setActivePattern(id)
    setSource(record.src)
    setIsReadOnly(false)
    setPreviewSource(record.src)
    setPreviewPatternName(record.name)
    trackEvent('catalog_clone', { source: 'stock_pattern', pattern: activeDemoName })
  }, [activeDemoName, personalWorkspaceAuthenticated, source, userPatterns, addPattern, setActivePattern, setSource, setIsReadOnly, setPreviewSource, setPreviewPatternName])

  const [copied, setCopied] = useState(false)
  const [deletePatternOpen, setDeletePatternOpen] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current) }, [])

  const handleCopy = useCallback(() => {
    if (!activePatternId) return
    const pattern = userPatterns.find((p) => p.id === activePatternId)
    const code = stampedPatternArtifact(source, activePatternId, pattern?.name ?? 'Pattern', compileLibrarySet)
    navigator.clipboard.writeText(code)
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500)
  }, [activePatternId, source, userPatterns, compileLibrarySet])

  const handleDownload = useCallback(() => {
    if (!activePatternId) return
    const pattern = userPatterns.find((p) => p.id === activePatternId)
    const name = pattern?.name ?? 'Pattern'
    downloadTextFile(patternDownloadName(name), stampedPatternArtifact(source, activePatternId, name, compileLibrarySet))
  }, [activePatternId, source, userPatterns, compileLibrarySet])

  const [leftWidth, setLeftWidth] = useState(224)
  const [rightWidth, setRightWidth] = useState(460)
  const MIN_PREVIEW_WIDTH = 300

  const activeFileName =
    activeLibraryName ?? activeDemoName ?? userPatterns.find((p) => p.id === activePatternId)?.name ?? '—'
  const activePattern = activePatternId ? userPatterns.find((p) => p.id === activePatternId) : undefined
  const studioEntityKind = route.kind === 'studio' ? (route.entity?.kind ?? null) : null
  const activeControllerProfileId =
    route.kind === 'studio' && route.entity?.kind === 'controllers' ? route.entity.id : null
  const activeControllerProfile =
    activeControllerProfileId ? controllerProfiles.find((profile) => profile.id === activeControllerProfileId) : undefined
  const activeShow = activeShowId ? shows.find((show) => show.id === activeShowId) : undefined

  const handleDeletePattern = useCallback(async () => {
    if (!activePatternId) return
    const deletedId = activePatternId
    await removePattern(deletedId)
    if (route.kind === 'studio' && route.entity?.kind === 'patterns' && route.entity.id === deletedId) {
      navigate({ kind: 'studio', entity: { kind: 'patterns', id: null } })
    }
    setDeletePatternOpen(false)
  }, [activePatternId, navigate, removePattern, route])

  const handleLeftDrag = useCallback((dx: number) => {
    setLeftWidth((w) => Math.max(120, w + dx))
  }, [])

  // Floor wide enough that the preview's primary nav row (layout map picker + play/pause,
  // both non-truncating) stays comfortable; only the pattern name gives up space (#63).
  const handleRightDrag = useCallback((dx: number) => {
    setRightWidth((w) => Math.max(MIN_PREVIEW_WIDTH, w - dx))
  }, [])

  // A deep link to a studio entity that can't resolve (#308): unknown entity id
  // once that personal collection has loaded.
  const routeEntity = route.kind === 'studio' ? route.entity : null
  const studioEntityMissing =
    routeEntity !== null &&
    routeEntity.id !== null &&
    (routeEntity.kind === 'patterns'
      ? patternsLoaded &&
        activePatternId !== routeEntity.id &&
        !userPatterns.some((p) => p.id === routeEntity.id) &&
        !DEMOS[routeEntity.id]
      : routeEntity.kind === 'maps'
        ? mapsLoaded &&
          !userMaps.some((m) => m.id === routeEntity.id) &&
          !STOCK_MAP_ITEMS.some((m) => m.id === routeEntity.id)
      : routeEntity.kind === 'mixins'
        ? mixinsLoaded &&
          !userMixins.some((m) => m.id === routeEntity.id) &&
          !STOCK_MIXIN_ITEMS.some((m) => m.id === routeEntity.id)
      : routeEntity.kind === 'libraries'
        ? librariesLoaded &&
          !userLibraries.some((library) => library.id === routeEntity.id) &&
          !LIBRARIES[routeEntity.id]
      : routeEntity.kind === 'controllers'
        ? controllerProfilesLoaded && !controllerProfiles.some((profile) => profile.id === routeEntity.id)
      : routeEntity.kind === 'shows'
        ? showsLoaded && !shows.some((show) => show.id === routeEntity.id)
        : true)
  const invalidDocRoute = route.kind === 'docs' && !isDocId(route.docId)
  const browseRoute = route.kind === 'gallery' || route.kind === 'pattern-detail'
  const studioRoute = route.kind === 'studio'
  const studioAccessPending = studioRoute && !personalWorkspaceResolved
  const detailPattern = route.kind === 'pattern-detail' ? galleryPatternBySlug(route.slug) : undefined

  const openDetailPatternInStudio = useCallback((pattern: GalleryPattern) => {
    openDemoPattern(pattern.name)
    navigate({ kind: 'studio', entity: { kind: 'patterns', id: pattern.name } })
  }, [navigate])

  const openBrowseRouteStudio = () => {
    if (personalWorkspaceResolved && !personalWorkspaceAuthenticated) {
      if (studioWelcomeAcknowledged) {
        trackEvent('sign_in', { surface: 'open_studio', provider: 'default' })
        window.location.assign('/api/auth/login')
        return
      }
      navigate({ kind: 'studio-welcome' })
      return
    }
    navigate({ kind: 'studio', entity: null })
  }

  const continueFromStudioWelcome = useCallback((provider: AuthProvider) => {
    try {
      window.localStorage.setItem(studioWelcomeAcknowledgedKey, '1')
    } catch {
      // If storage is unavailable, still let sign-in proceed.
    }
    setStudioWelcomeAcknowledged(true)
    trackEvent('sign_in', { surface: 'studio_welcome', provider })
    window.location.assign(`/api/auth/login?provider=${provider}`)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <header data-testid="top-bar" className="flex min-h-10 shrink-0 flex-wrap items-center gap-y-1 border-b border-seam bg-panel px-3 py-1 sm:h-10 sm:flex-nowrap sm:px-4 sm:py-0">
        <a
          href={import.meta.env.BASE_URL}
          aria-label="PXLBLZ home"
          title="Go to home"
          className="flex items-center gap-2 rounded-sm select-none transition-[filter] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/70"
        >
          <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden className="shrink-0">
            <path d="M1 10 Q5 1 9 10 T17 10 T25 10" fill="none" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="25" cy="10" r="2.6" fill="#fbbf24" />
          </svg>
          <span
            aria-label="PXLBLZ"
            className="font-mono font-semibold text-zinc-100"
            style={{ fontSize: '17px', letterSpacing: '0.22em', textShadow: '0 0 14px rgba(245,158,11,.45)' }}
          >
            {'PXLBLZ'.split('').map((ch, i) => (
              // Each letter's keyframe (assigned by nth-child in index.css) places
              // its pulse so the lit dot ping-pongs P->Z->P across the wordmark.
              <span key={i} aria-hidden className="pxlblz-letter">
                {ch}
              </span>
            ))}
          </span>
        </a>
        {/* Left zone = identity + authoring reference (#254): Docs and Code sit beside
            the wordmark, mirroring the Controller pill family on the right. */}
        <span className="ml-2 flex items-center sm:ml-5">
          <DocsMenu />
          {!browseRoute && (
            <span className="ml-2">
              <LibrariesMenu />
            </span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <ControllerBar />
          {browseRoute && (
            <Button
              size="sm"
              className="border border-live/50 bg-live/15 px-2 font-mono text-xs text-live hover:bg-live/25 hover:text-amber-100 sm:px-2.5"
              onClick={openBrowseRouteStudio}
              title="Open Studio"
            >
              <Code2 data-icon="inline-start" />
              <span className="hidden min-[430px]:inline">Studio</span>
            </Button>
          )}
          {studioRoute && (
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-100 sm:px-2.5"
              onClick={() => navigate({ kind: 'gallery' })}
              title="Open Gallery"
            >
              <Images data-icon="inline-start" />
              <span className="hidden min-[430px]:inline">Gallery</span>
            </Button>
          )}
          <AuthStatus />
        </span>
      </header>
      {route.kind === 'gallery' ? (
        <GalleryPage />
      ) : route.kind === 'studio-welcome' ? (
        <StudioWelcomePage
          onSignIn={continueFromStudioWelcome}
          onBack={() => navigate({ kind: 'gallery' }, { replace: true })}
        />
      ) : route.kind === 'pattern-detail' ? (
        detailPattern ? (
          <PatternDetailPage pattern={detailPattern} onOpenInStudio={openDetailPatternInStudio} />
        ) : (
          <RouteMessage
            title="Pattern not found"
            detail={`There's no built-in pattern with slug "${route.slug}".`}
            actionLabel="Browse the Gallery"
            onAction={() => navigate({ kind: 'gallery' })}
          />
        )
      ) : route.kind === 'not-found' || invalidDocRoute ? (
        <RouteMessage
          title="Nothing at this address"
          detail={`There's no page at ${route.kind === 'docs' ? `/docs/${route.docId}` : route.path}.`}
          actionLabel="Back to Studio"
          onAction={() => navigate({ kind: 'studio', entity: null }, { replace: true })}
        />
      ) : studioAccessPending ? (
        <RouteMessage
          title="Checking Studio access"
          detail="Loading your sign-in state before opening Studio."
        />
      ) : studioEntityMissing ? (
        <RouteMessage
          title={
            routeEntity!.kind === 'patterns'
              ? 'Pattern not found'
              : routeEntity!.kind === 'maps'
                ? 'Map not found'
              : routeEntity!.kind === 'mixins'
                ? 'Mixin not found'
              : routeEntity!.kind === 'libraries'
                ? 'Library not found'
              : routeEntity!.kind === 'controllers'
                ? 'Controller not found'
              : routeEntity!.kind === 'shows'
                ? 'Show not found'
                : 'Not available yet'
          }
          detail={
            routeEntity!.kind === 'patterns'
              ? `There's no pattern with id "${routeEntity!.id}" in this workspace. It may have been deleted, or the link may belong to a different account.`
              : routeEntity!.kind === 'maps'
                ? `There's no map with id "${routeEntity!.id}" in this workspace. It may have been deleted, or the link may belong to a different account.`
              : routeEntity!.kind === 'mixins'
                ? `There's no mixin with id "${routeEntity!.id}" in this workspace. It may have been deleted, or the link may belong to a different account.`
              : routeEntity!.kind === 'libraries'
                ? `There's no library with id "${routeEntity!.id}" in this workspace. It may have been deleted, or the link may belong to a different account.`
              : routeEntity!.kind === 'controllers'
                ? `There's no controller profile with id "${routeEntity!.id}" in this workspace. It may have been deleted, or the link may belong to a different account.`
              : routeEntity!.kind === 'shows'
                ? `There's no show with id "${routeEntity!.id}" in this workspace. It may have been deleted, or the link may belong to a different account.`
              : `Studio views for ${routeEntity!.kind} aren't built yet.`
          }
          actionLabel="Back to Studio"
          onAction={() => navigate({ kind: 'studio', entity: null }, { replace: true })}
        />
      ) : (
      <div className="flex flex-1 min-h-0">
        <aside data-testid="left-pane" className="shrink-0 flex flex-col" style={{ width: leftWidth }}>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PatternList />
          </div>
          {/* The live Controller dashboard moved out of this slot (#211): it now
              opens as a pinned popover anchored under its pill in the header. */}
        </aside>
        <Splitter onDrag={handleLeftDrag} />
        <main data-testid="editor-pane" className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <PaneHeader>
            {activeDoc ? (
              <>
                <span className="flex-1 min-w-0 flex items-center gap-1.5">
                  <FileText size={14} aria-hidden className="shrink-0 text-zinc-500" />
                  <span className="truncate text-zinc-200">{activeDoc.title}</span>
                  <span className="hidden rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-structural sm:inline">
                    Docs
                  </span>
                </span>
                <a
                  href={docExternalHref(activeDoc.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-6 items-center gap-1 rounded px-2 font-mono text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300"
                  title="Open document in a new tab"
                >
                  <ExternalLink size={13} aria-hidden />
                  <span className="hidden sm:inline">Open in tab</span>
                </a>
              </>
            ) : activeControllerProfileId !== null ? (
              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                <Cpu size={14} aria-hidden className="shrink-0 text-zinc-500" />
                <InlineEntityTitle
                  name={activeControllerProfile ? controllerProfileDisplayName(activeControllerProfile) : 'Controller profile'}
                  noun="controller"
                />
                <span className="hidden rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-structural sm:inline">
                  Controller
                </span>
              </span>
            ) : studioEntityKind === 'controllers' ? (
              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                <Cpu size={14} aria-hidden className="shrink-0 text-zinc-500" />
                <span className="truncate text-zinc-200">Controllers</span>
                <span className="hidden rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-structural sm:inline">
                  Profiles
                </span>
              </span>
            ) : studioEntityKind === 'shows' ? (
              <>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <PanelsTopLeft size={14} aria-hidden className="shrink-0 text-zinc-500" />
                  <InlineEntityTitle
                    name={activeShow?.name ?? 'Shows'}
                    noun="show"
                    onRename={activeShow ? (nextName) => renameShow(activeShow.id, nextName) : undefined}
                    takenNames={shows.filter((show) => show.id !== activeShow?.id).map((show) => show.name)}
                  />
                  {activeShow && (
                    <>
                      <span
                        title="Show output contract"
                        className="hidden rounded border border-zinc-800 bg-zinc-900/45 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500 sm:inline"
                      >
                        {activeShow.outputContract?.kind === 'installation'
                          ? 'Installation'
                          : activeShow.outputContract?.kind === 'portable-2d'
                            ? 'Portable 2D'
                            : 'Legacy output'}
                      </span>
                      <span className="hidden rounded border border-zinc-800 bg-zinc-900/45 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500 sm:inline">
                        {activeShow.scenes.length} scenes
                      </span>
                    </>
                  )}
                </span>
                {activeShow && (
                  <span
                    ref={setShowHeaderActionsTarget}
                    className="scrollbar-hidden ml-auto flex min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto"
                  />
                )}
              </>
            ) : studioEntityKind === 'maps' && editorFlavor !== 'map' ? (
              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                <MapIcon size={14} aria-hidden className="shrink-0 text-zinc-500" />
                <span className="truncate text-zinc-200">Maps</span>
              </span>
            ) : studioEntityKind === 'mixins' && editorFlavor !== 'mixin' ? (
              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                <Braces size={14} aria-hidden className="shrink-0 text-zinc-500" />
                <span className="truncate text-zinc-200">Mixins</span>
              </span>
            ) : studioEntityKind === 'libraries' && editorFlavor !== 'library' ? (
              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                <Code2 size={14} aria-hidden className="shrink-0 text-zinc-500" />
                <span className="truncate text-zinc-200">Libraries</span>
              </span>
            ) : editorFlavor === 'map' ? (
              <MapModeHeader />
            ) : editorFlavor === 'mixin' ? (
              <MixinModeHeader />
            ) : editorFlavor === 'library' ? (
              <LibraryModeHeader />
            ) : (
              <>
            <span className="flex-1 min-w-0 flex items-center gap-1.5">
              <InlineEntityTitle
                name={activeFileName}
                noun="pattern"
                onRename={activePattern ? (nextName) => renamePattern(activePattern.id, nextName) : undefined}
                takenNames={userPatterns.filter((pattern) => pattern.id !== activePattern?.id).map((pattern) => pattern.name)}
              />
              {(activeLibraryName !== null || activeDemoName !== null) && (
                <Lock
                  size={13}
                  strokeWidth={2.25}
                  className="shrink-0 text-zinc-400"
                  aria-label="read-only"
                />
              )}
              <DimPills dims={exportedDims(source)} />
              {activePatternId !== null && <CompileStatusBadge />}
            </span>
            {(activePatternId !== null || activeDemoName !== null) && (
              <PatternActionsMenu
                copied={copied}
                compileBroken={compileStatus === 'broken'}
                onViewInGallery={activeDemoName !== null
                  ? () => navigate({ kind: 'pattern-detail', slug: patternSlug(activeDemoName) })
                  : undefined}
                onClone={activeDemoName !== null && personalWorkspaceAuthenticated
                  ? handleForkDemo
                  : undefined}
                onCopy={activePatternId !== null ? handleCopy : undefined}
                onDownload={activePatternId !== null ? handleDownload : undefined}
                onDelete={activePattern !== undefined ? () => setDeletePatternOpen(true) : undefined}
              />
            )}
            {activePattern !== undefined && (
              <AlertDialogRoot open={deletePatternOpen} onOpenChange={setDeletePatternOpen}>
                <AlertDialogContent>
                  <AlertDialogTitle>Delete pattern?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{activePattern.name}" will be permanently deleted and cannot be recovered.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleDeletePattern()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialogRoot>
            )}
            {/* Send to Controller works for any open pattern — user patterns and
                read-only demos alike (a demo pushes without first forking). */}
            {(activePatternId !== null || activeDemoName !== null) && <SendToController />}
              </>
            )}
          </PaneHeader>
          <div className="flex-1 overflow-hidden">
            {activeDoc ? (
              <DocsReader doc={activeDoc} />
            ) : activeControllerProfileId !== null ? (
              <ControllerProfilePage profileId={activeControllerProfileId} />
            ) : studioEntityKind === 'controllers' ? (
              <StudioPaneMessage
                icon={<Cpu size={18} aria-hidden />}
                title="No controller selected"
                detail="Create or select a controller profile from the rail."
              />
            ) : studioEntityKind === 'shows' ? (
              showCreation ? (
                <ShowCreationFlow
                  maps={showCreationMaps}
                  onCancel={cancelShowCreation}
                  onCreate={async (input) => {
                    const created = await createNewShow(input)
                    openShow(created.id)
                  }}
                />
              ) : showClassification && showBeingClassified ? (
                <ShowClassificationFlow
                  show={showBeingClassified}
                  maps={showCreationMaps}
                  modeledPixelCount={showClassification.modeledPixelCount}
                  targetControllerName={classificationTargetControllerName}
                  reasons={showClassification.reasons}
                  onCancel={() => {
                    const previousShowId = showClassification.previousShowId
                    cancelShowClassification()
                    navigate({ kind: 'studio', entity: { kind: 'shows', id: previousShowId } })
                  }}
                  onConfirm={async (outputContract) => {
                    await confirmShowClassification(outputContract)
                    navigate({ kind: 'studio', entity: { kind: 'shows', id: showBeingClassified.id } }, { replace: true })
                  }}
                />
              ) : activeShowId !== null ? (
                <ShowEditor
                  showId={activeShowId}
                  headerActionsTarget={showHeaderActionsTarget}
                />
              ) : (
                <StudioPaneMessage
                  icon={<PanelsTopLeft size={18} aria-hidden />}
                  title="No show selected"
                  detail="Create or select a show from the rail."
                />
              )
            ) : studioEntityKind === 'maps' && editorFlavor !== 'map' ? (
              <StudioPaneMessage
                icon={<MapIcon size={18} aria-hidden />}
                title="No map selected"
                detail="Create or select a map from the rail."
              />
            ) : studioEntityKind === 'mixins' && editorFlavor !== 'mixin' ? (
              <StudioPaneMessage
                icon={<Braces size={18} aria-hidden />}
                title="No mixin selected"
                detail="Create or select a mixin from the rail."
              />
            ) : studioEntityKind === 'libraries' && editorFlavor !== 'library' ? (
              <StudioPaneMessage
                icon={<Code2 size={18} aria-hidden />}
                title="No library selected"
                detail="Select a stock library from the rail."
              />
            ) : (
              <Editor />
            )}
          </div>
        </main>
        <Splitter onDrag={handleRightDrag} className={studioEntityKind === 'shows' ? 'max-[980px]:hidden' : ''} />
        {/* The preview is an output/instrument surface (#150): no header strip — the
            canvas sits flush at the top and all controls live in the deck below it. */}
        <aside
          data-testid="preview-pane"
          className={`shrink-0 flex flex-col min-h-0 ${studioEntityKind === 'shows' ? 'max-[980px]:hidden' : ''}`}
          style={{ width: rightWidth, minWidth: MIN_PREVIEW_WIDTH }}
        >
          {editorFlavor === 'mixin' ? (
            <MixinProvenancePane />
          ) : editorFlavor === 'map' || studioEntityKind === 'maps' ? (
            <MapContextPane />
          ) : editorFlavor === 'library' || studioEntityKind === 'libraries' ? (
            <LibraryContextPane />
          ) : studioEntityKind === 'controllers' ? (
            activeControllerProfile
              ? <ControllerSavedProgramsPane profile={activeControllerProfile} />
              : <EmptyContextPane label="Controller" />
          ) : studioEntityKind === 'shows' ? (
            showCreation
              ? <EmptyContextPane label="Output contract setup" />
              : showClassification
                ? <EmptyContextPane label="Legacy Show classification" />
              : activeShowId !== null ? <ShowStagePreview showId={activeShowId} /> : <EmptyContextPane label="Shows" />
          ) : (
            <Preview />
          )}
        </aside>
      </div>
      )}
    </div>
  )
}
