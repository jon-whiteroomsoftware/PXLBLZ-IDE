import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { controlIcon } from '@/components/iconScale'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
import { SaveStatusBadge } from './SaveStatusBadge'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useMapStore, STOCK_MAP_ITEMS } from '@/store/mapStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { SendMapToController } from '@/components/SendMapToController'
import { useRouterStore } from '@/store/routerStore'
import { InlineEntityTitle } from '@/components/InlineEntityTitle'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { useStudioOperationStore } from '@/store/studioOperationStore'

// The editor header strip in map mode (#151/#268): source identity, parse-only
// compile badge, and document actions. Stock maps are read-only but cloneable and
// directly pushable; custom maps are editable, pushable, and deletable.
export function MapModeHeader() {
  const editingMap = useMapStore((s) => s.editingMap)
  const userMaps = useMapStore((s) => s.userMaps)
  const cloneStockMap = useMapStore((s) => s.cloneStockMap)
  const renameMap = useMapStore((s) => s.renameMap)
  const removeMap = useMapStore((s) => s.removeMap)
  const mapEvalError = useMapStore((s) => s.mapEvalError)
  const navigate = useRouterStore((s) => s.navigate)
  const personalWorkspaceAuthenticated = useWorkspaceStore((s) => s.personalWorkspaceAuthenticated)
  const executeStudioOperation = useStudioOperationStore((s) => s.execute)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const openRecord =
    editingMap?.kind === 'existing' ? userMaps.find((m) => m.id === editingMap.id) : undefined
  const stockRecord =
    editingMap?.kind === 'stock' ? STOCK_MAP_ITEMS.find((m) => m.id === editingMap.id) : undefined

  const name = openRecord?.name ?? stockRecord?.name ?? 'Map'
  const dim = openRecord?.dim ?? stockRecord?.dim

  async function confirmDelete() {
    if (!openRecord) return
    setDeleteOpen(false)
    const { id, name: recordName } = openRecord
    await executeStudioOperation({
      surface: 'editor',
      action: 'delete',
      entityKind: 'map',
      entityName: recordName,
      run: async () => {
        await removeMap(id)
        navigate({ kind: 'studio', entity: { kind: 'maps', id: null } })
      },
    })
  }

  async function handleCloneStockMap(id: string) {
    const recordId = newPersonalContentId()
    await executeStudioOperation({
      surface: 'editor',
      action: 'clone',
      entityKind: 'map',
      entityName: name,
      run: async () => {
        const clonedId = await cloneStockMap(id, recordId)
        if (clonedId) navigate({ kind: 'studio', entity: { kind: 'maps', id: clonedId } })
      },
    })
  }

  return (
    <>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        <InlineEntityTitle name={name} noun="map" onRename={openRecord ? (nextName) => renameMap(openRecord.id, nextName) : undefined} takenNames={userMaps.filter((map) => map.id !== openRecord?.id).map((map) => map.name)} />
        <CompileStatusBadge />
        <SaveStatusBadge />
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-400 border border-zinc-700 leading-none">
          map
        </span>
        {editingMap?.kind === 'stock' && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-500 border border-zinc-700 leading-none">
            read-only
          </span>
        )}
        {dim && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-500 border border-zinc-700 leading-none">
            {dim}D
          </span>
        )}
        {mapEvalError && (
          <span
            title={mapEvalError}
            className="min-w-0 truncate text-[10px] text-red-400/90"
          >
            {mapEvalError}
          </span>
        )}
      </span>
      {editingMap?.kind === 'stock' && personalWorkspaceAuthenticated && (
        <button
          type="button"
          onClick={() => void handleCloneStockMap(editingMap.id)}
          title="Clone into Maps"
          className="shrink-0 h-6 px-2 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-amber-400/80 transition-colors"
        >
          Clone
        </button>
      )}
      <SendMapToController />
      {openRecord && (
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="shrink-0 h-6 px-2 rounded border border-zinc-800 text-[11px] text-zinc-500 hover:border-red-900/80 hover:text-red-300 transition-colors flex items-center gap-1"
          title="Delete map"
        >
          <Trash2 {...controlIcon} aria-hidden />
          Delete
        </button>
      )}

      <AlertDialogRoot open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete map?</AlertDialogTitle>
          <AlertDialogDescription>
            "{name}" will be permanently deleted and cannot be recovered.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogRoot>
    </>
  )
}
