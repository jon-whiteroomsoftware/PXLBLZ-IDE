import { useState } from 'react'
import { Download, Map as MapIcon, RefreshCw } from 'lucide-react'
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
import type { ControllerProfile } from '@/engine/controllerProfile'
import {
  createImportedControllerMapRecord,
  summarizeControllerMapImport,
  type ControllerMapImportSummary,
} from '@/engine/importedMap'
import {
  buildStudioMapFingerprintCandidates,
  mapDataHash,
  matchInstalledMapFingerprint,
  type MapFingerprintMatch,
} from '@/engine/mapFingerprint'
import { decodeMapData } from '@/engine/mapPush'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { uniquePatternName } from '@/engine/patternName'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { controllerForProfile } from '@/engine/controllerProfileConnection'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useMapStore } from '@/store/mapStore'
import { useRouterStore } from '@/store/routerStore'

// Shared by the pane-header actions and the section add-buttons on the profile
// page: a visible border keeps these reading as buttons on the dark panel (#685).
export const sectionActionButtonClass =
  'border border-zinc-700 bg-zinc-900/70 text-xs text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-35'

const importFieldClass =
  'h-7 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'

interface PendingMapImport {
  points: number[][]
  summary: ControllerMapImportSummary
  defaultName: string
  controllerName: string
  deviceId?: string | null
  ip?: string | null
  mapHash?: string
  match?: MapFingerprintMatch
}

function formatGridDims(dims: ControllerMapImportSummary['gridDims']) {
  if (!dims) return 'irregular'
  return dims.depth === undefined
    ? `${dims.cols} x ${dims.rows}`
    : `${dims.cols} x ${dims.rows} x ${dims.depth}`
}

function ImportMapDialog({
  pending,
  name,
  onNameChange,
  onCancel,
  onConfirm,
}: {
  pending: PendingMapImport | null
  name: string
  onNameChange: (name: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!pending) return null
  const trimmed = name.trim()
  const match = pending.match
  return (
    <AlertDialogRoot open onOpenChange={(open) => { if (!open) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogTitle>{match ? 'Open matching Studio map?' : 'Import controller map?'}</AlertDialogTitle>
        <AlertDialogDescription>
          {match
            ? `The installed pixel map from ${pending.controllerName} matches "${match.name}".`
            : `Save the installed pixel map from ${pending.controllerName} as a frozen user map.`}
        </AlertDialogDescription>
        <div className="mt-4 space-y-3">
          {!match && (
            <label className="block text-xs text-zinc-400">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">Map name</span>
              <input
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                className={`${importFieldClass} w-full`}
                aria-label="Imported map name"
              />
            </label>
          )}
          <div className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2 font-mono text-[11px] text-zinc-400">
            <div className="flex items-center gap-2 text-zinc-300">
              <MapIcon size={13} aria-hidden />
              {pending.summary.pixelCount} px / {pending.summary.dim}D / {formatGridDims(pending.summary.gridDims)}
            </div>
            <div className="mt-1 text-zinc-500">Source device: {pending.controllerName}</div>
            {pending.deviceId && <div className="text-zinc-500">Device ID: {pending.deviceId}</div>}
            {match && (
              <div className="mt-1 text-live">
                Match: {match.name} ({match.kind === 'stock' ? 'stock' : 'user'} map)
              </div>
            )}
          </div>
          {!match && (
            <p className="text-[11px] leading-5 text-zinc-500">
              Pixelblaze UI maps are fill-normalized per axis when read from the device; aspect may differ from maps pushed by this IDE.
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!match && trimmed.length === 0} onClick={onConfirm}>
            {match ? 'Open map' : 'Import map'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  )
}

// Pane-header actions for the Controller profile route (#685): the actions that
// apply to the whole controller live next to its title instead of inside the
// page body. The map-import flow (dialog, fingerprint match, errors) moved here
// with the button that starts it.
export function ControllerProfileHeaderActions({ profile }: { profile: ControllerProfile }) {
  const controllers = useControllerStore((state) => state.controllers)
  const activeIp = useControllerStore((state) => state.activeIp)
  const setActiveController = useControllerStore((state) => state.setActive)
  const refreshLiveMetadata = useControllerProfileStore((state) => state.refreshLiveMetadata)
  const userMaps = useMapStore((state) => state.userMaps)
  const addMap = useMapStore((state) => state.addMap)
  const openExistingMap = useMapStore((state) => state.openExistingMap)
  const openStockMap = useMapStore((state) => state.openStockMap)
  const navigate = useRouterStore((state) => state.navigate)
  const [importingMap, setImportingMap] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingMapImport | null>(null)
  const [importName, setImportName] = useState('')

  const profileController = controllerForProfile(profile, controllers)
  const refreshable = profileController?.phase === 'live'

  async function beginMapImport() {
    if (profileController?.phase !== 'live') return
    setImportError(null)
    setImportingMap(true)
    try {
      if (activeIp !== profileController.ip) setActiveController(profileController.ip)
      const bytes = await getControllerProvider().getPixelMapData()
      const points = decodeMapData(bytes)
      if (!points || points.length === 0) {
        throw new Error('No installed pixel map was returned by this controller.')
      }
      const hash = bytes ? mapDataHash(bytes) : undefined
      const match = hash
        ? matchInstalledMapFingerprint({
            hash,
            profile,
            candidates: buildStudioMapFingerprintCandidates({
              userMaps,
              pixelCount: points.length,
            }),
          }) ?? undefined
        : undefined
      const controllerName =
        profile.lastKnownDeviceName ??
        profileController.nickname ??
        profile.name ??
        profileController.ip
      const defaultName = uniquePatternName(
        `${controllerName} map`,
        userMaps.map((map) => map.name),
      )
      setPendingImport({
        points,
        summary: summarizeControllerMapImport(points),
        defaultName,
        controllerName,
        deviceId: profile.deviceId ?? profileController.deviceId ?? null,
        ip: profileController.ip,
        mapHash: hash,
        match,
      })
      setImportName(defaultName)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import controller map.')
    } finally {
      setImportingMap(false)
    }
  }

  async function confirmMapImport() {
    if (!pendingImport) return
    if (pendingImport.match) {
      if (pendingImport.match.kind === 'stock') {
        openStockMap(pendingImport.match.id)
      } else {
        const record = userMaps.find((map) => map.id === pendingImport.match?.id)
        if (record) openExistingMap(record)
      }
      navigate({ kind: 'studio', entity: { kind: 'maps', id: pendingImport.match.id } })
      setPendingImport(null)
      setImportName('')
      return
    }
    const name = importName.trim() || pendingImport.defaultName
    const record = createImportedControllerMapRecord({
      id: newPersonalContentId(),
      name,
      points: pendingImport.points,
      controllerName: pendingImport.controllerName,
      deviceId: pendingImport.deviceId,
      ip: pendingImport.ip,
      mapHash: pendingImport.mapHash,
      importedAt: Date.now(),
    })
    await addMap(record)
    openExistingMap(record)
    navigate({ kind: 'studio', entity: { kind: 'maps', id: record.id } })
    setPendingImport(null)
    setImportName('')
  }

  return (
    <span className="ml-auto flex items-center gap-1.5">
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className={sectionActionButtonClass}
        disabled={!refreshable}
        onClick={() => void refreshLiveMetadata(profile.id)}
        title={refreshable
          ? 'Refresh controller metadata'
          : 'Connect this controller to refresh its metadata'}
      >
        <RefreshCw size={13} aria-hidden />
        Refresh
      </Button>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className={sectionActionButtonClass}
        disabled={!refreshable || importingMap}
        onClick={() => void beginMapImport()}
        title={refreshable
          ? 'Import installed pixel map'
          : 'Connect this controller to import its installed pixel map'}
      >
        <Download size={13} aria-hidden />
        {importingMap ? 'Reading' : 'Import map'}
      </Button>
      <ImportMapDialog
        pending={pendingImport}
        name={importName}
        onNameChange={setImportName}
        onCancel={() => {
          setPendingImport(null)
          setImportName('')
        }}
        onConfirm={() => void confirmMapImport()}
      />
      {importError !== null && (
        <AlertDialogRoot open onOpenChange={(open) => { if (!open) setImportError(null) }}>
          <AlertDialogContent>
            <AlertDialogTitle>Map import failed</AlertDialogTitle>
            <AlertDialogDescription>{importError}</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setImportError(null)}>Close</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogRoot>
      )}
    </span>
  )
}
