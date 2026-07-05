import { useState, useCallback, useRef, useEffect } from 'react'
import { Code2, ExternalLink, FileText, Lock, Trash2 } from 'lucide-react'
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
import { GalleryPage } from '@/components/GalleryPage'
import { PatternDetailPage } from '@/components/PatternDetailPage'
import { useControllerStore } from '@/store/controllerStore'
import { MapModeHeader } from '@/components/MapModeHeader'
import { usePatternStore, PatternRecord } from '@/store/patternStore'
import { useEditorStore } from '@/store/editorStore'
import { useDocsStore } from '@/store/docsStore'
import { useRouterStore } from '@/store/routerStore'
import { openDemoPattern, openPatternRecord } from '@/store/openPattern'
import { routesEqual, type Route } from '@/engine/routes'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { forkSettingsSnapshot } from '@/store/settingsCascade'
import { useControlStore } from '@/store/controlStore'
import { bundle } from '@/engine/bundle'
import { LIBRARIES } from '@/pixelblaze/libs'
import { uniquePatternName } from '@/engine/patternName'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { exportedDims } from '@/engine/exportedDims'
import { galleryPatternBySlug } from '@/engine/galleryCatalog'
import { docExternalHref, getUserDoc, isDocId } from '@/docs/catalog'

function Splitter({ onDrag }: { onDrag: (dx: number) => void }) {
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
      className="w-1 shrink-0 bg-seam hover:bg-zinc-600 cursor-col-resize transition-colors select-none"
      onMouseDown={handleMouseDown}
    />
  )
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

export default function App() {
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const addPattern = usePatternStore((s) => s.addPattern)
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
  const personalWorkspaceResolved = useWorkspaceStore((s) => s.personalWorkspaceResolved)

  // History wiring (#308): parse the URL on mount and on back/forward. The
  // hashchange listener keeps legacy #/docs/<id> links (still emitted for
  // in-doc cross-links) redirecting onto the path route.
  useEffect(() => {
    const sync = () => useRouterStore.getState().syncFromLocation()
    sync()
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  // Route → state. Re-runs when patterns finish loading so a deep link to
  // /studio/patterns/<id> resolves once the record exists.
  useEffect(() => {
    if (route.kind === 'docs') {
      if (isDocId(route.docId)) syncDocsFromRoute(route.docId)
      return
    }
    syncDocsFromRoute(null)
    if (route.kind === 'studio' && route.entity !== null && route.entity.kind === 'patterns') {
      const entityId = route.entity.id
      const { userPatterns, activePatternId } = usePatternStore.getState()
      if (activePatternId !== entityId) {
        const record = userPatterns.find((p) => p.id === entityId)
        if (record) openPatternRecord(record)
      }
    }
  }, [route, patternsLoaded, syncDocsFromRoute])

  // State → URL: the active studio entity is addressable. Push when moving
  // between entities so back/forward walk them; replace when a plain /studio
  // URL first resolves to an entity (startup restore shouldn't add an entry).
  useEffect(() => {
    const current = useRouterStore.getState().route
    if (current.kind !== 'studio') return
    if (activePatternId !== null) {
      const target: Route = { kind: 'studio', entity: { kind: 'patterns', id: activePatternId } }
      if (!routesEqual(current, target)) navigate(target, { replace: current.entity === null })
    } else if ((activeDemoName !== null || activeLibraryName !== null) && current.entity !== null) {
      // Demos and libraries have no addressable URL yet; fall back to /studio
      // so a stale entity URL doesn't sit over unrelated content.
      navigate({ kind: 'studio', entity: null })
    }
  }, [activePatternId, activeDemoName, activeLibraryName, navigate])

  // Signed-out cold Studio redirects to the Gallery (#308) once the auth probe has
  // settled. A pattern-detail handoff may carry an active built-in demo into Studio
  // (#310), so that read-only demo view is allowed through.
  useEffect(() => {
    if (!personalWorkspaceResolved || personalWorkspaceAuthenticated) return
    if (route.kind === 'studio' && activeDemoName === null) navigate({ kind: 'gallery' }, { replace: true })
  }, [route, personalWorkspaceResolved, personalWorkspaceAuthenticated, activeDemoName, navigate])

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
  }, [activeDemoName, personalWorkspaceAuthenticated, source, userPatterns, addPattern, setActivePattern, setSource, setIsReadOnly, setPreviewSource, setPreviewPatternName])

  const [copied, setCopied] = useState(false)
  const [deletePatternOpen, setDeletePatternOpen] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current) }, [])

  const handleCopy = useCallback(() => {
    const { code } = bundle(source, LIBRARIES)
    navigator.clipboard.writeText(code)
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500)
  }, [source])

  const [leftWidth, setLeftWidth] = useState(224)
  const [rightWidth, setRightWidth] = useState(460)
  const MIN_PREVIEW_WIDTH = 300

  const activeFileName =
    activeLibraryName ?? activeDemoName ?? userPatterns.find((p) => p.id === activePatternId)?.name ?? '—'
  const activePattern = activePatternId ? userPatterns.find((p) => p.id === activePatternId) : undefined

  const handleDeletePattern = useCallback(async () => {
    if (!activePatternId) return
    await removePattern(activePatternId)
    setDeletePatternOpen(false)
  }, [activePatternId, removePattern])

  const handleLeftDrag = useCallback((dx: number) => {
    setLeftWidth((w) => Math.max(120, w + dx))
  }, [])

  // Floor wide enough that the preview's primary nav row (layout map picker + play/pause,
  // both non-truncating) stays comfortable; only the pattern name gives up space (#63).
  const handleRightDrag = useCallback((dx: number) => {
    setRightWidth((w) => Math.max(MIN_PREVIEW_WIDTH, w - dx))
  }, [])

  // A deep link to a studio entity that can't resolve (#308): unknown pattern id
  // once patterns have loaded, or an entity kind that has no studio view yet.
  const routeEntity = route.kind === 'studio' ? route.entity : null
  const studioEntityMissing =
    routeEntity !== null &&
    (routeEntity.kind !== 'patterns'
      ? true
      : patternsLoaded &&
        activePatternId !== routeEntity.id &&
        !userPatterns.some((p) => p.id === routeEntity.id))
  const invalidDocRoute = route.kind === 'docs' && !isDocId(route.docId)
  const browseRoute = route.kind === 'gallery' || route.kind === 'pattern-detail'
  const detailPattern = route.kind === 'pattern-detail' ? galleryPatternBySlug(route.slug) : undefined
  const openBrowseRouteStudio = () => {
    if (detailPattern) {
      useControlStore.getState().preserveForNextReset(useControlStore.getState().controlValues)
      openDemoPattern(detailPattern.name)
    }
    navigate({ kind: 'studio', entity: null })
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <header data-testid="top-bar" className="flex min-h-10 shrink-0 flex-wrap items-center gap-y-1 border-b border-seam bg-panel px-3 py-1 sm:h-10 sm:flex-nowrap sm:px-4 sm:py-0">
        <span className="flex items-center gap-2 select-none">
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
        </span>
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
          <AuthStatus />
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
        </span>
      </header>
      {route.kind === 'gallery' ? (
        <GalleryPage />
      ) : route.kind === 'pattern-detail' ? (
        detailPattern ? (
          <PatternDetailPage pattern={detailPattern} />
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
      ) : studioEntityMissing ? (
        <RouteMessage
          title={routeEntity!.kind === 'patterns' ? 'Pattern not found' : 'Not available yet'}
          detail={
            routeEntity!.kind === 'patterns'
              ? `There's no pattern with id "${routeEntity!.id}" in this workspace. It may have been deleted, or the link may belong to a different account.`
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
            ) : editorFlavor === 'map' ? (
              <MapModeHeader />
            ) : (
              <>
            <span className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className="truncate text-zinc-200">{activeFileName}</span>
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
            {activeDemoName !== null && personalWorkspaceAuthenticated && (
              <Button
                size="xs"
                variant="ghost"
                className="text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300"
                onClick={handleForkDemo}
                title="Clone into Cloud Patterns"
              >
                Clone
              </Button>
            )}
            {activePatternId !== null && (
              <Button
                size="xs"
                variant="ghost"
                className="text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-30"
                disabled={compileStatus === 'broken'}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy Code'}
              </Button>
            )}
            {activePattern !== undefined && (
              <AlertDialogRoot open={deletePatternOpen} onOpenChange={setDeletePatternOpen}>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-xs text-zinc-500 bg-zinc-900/50 hover:bg-red-950/50 hover:text-red-300"
                  onClick={() => setDeletePatternOpen(true)}
                  title="Delete pattern"
                >
                  <Trash2 size={13} aria-hidden />
                  Delete
                </Button>
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
            {activeDoc ? <DocsReader doc={activeDoc} /> : <Editor />}
          </div>
        </main>
        <Splitter onDrag={handleRightDrag} />
        {/* The preview is an output/instrument surface (#150): no header strip — the
            canvas sits flush at the top and all controls live in the deck below it. */}
        <aside data-testid="preview-pane" className="shrink-0 flex flex-col min-h-0" style={{ width: rightWidth, minWidth: MIN_PREVIEW_WIDTH }}>
          <Preview />
        </aside>
      </div>
      )}
    </div>
  )
}
