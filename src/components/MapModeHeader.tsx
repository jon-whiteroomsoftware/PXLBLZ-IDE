import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
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
import { SendMapToController } from '@/components/SendMapToController'

// The editor header strip in map mode (#151/#268): source identity, parse-only
// compile badge, and document actions. Stock maps are read-only but cloneable and
// directly pushable; custom maps are editable, pushable, and deletable.
export function MapModeHeader() {
  const editingMap = useMapStore((s) => s.editingMap)
  const userMaps = useMapStore((s) => s.userMaps)
  const cloneStockMap = useMapStore((s) => s.cloneStockMap)
  const removeMap = useMapStore((s) => s.removeMap)
  const mapEvalError = useMapStore((s) => s.mapEvalError)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const openRecord =
    editingMap?.kind === 'existing' ? userMaps.find((m) => m.id === editingMap.id) : undefined
  const stockRecord =
    editingMap?.kind === 'stock' ? STOCK_MAP_ITEMS.find((m) => m.id === editingMap.id) : undefined

  const name = openRecord?.name ?? stockRecord?.name ?? 'Map'
  const dim = openRecord?.dim ?? stockRecord?.dim

  async function confirmDelete() {
    if (!openRecord) return
    await removeMap(openRecord.id)
    setDeleteOpen(false)
  }

  return (
    <>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="truncate text-zinc-200">{name}</span>
        <CompileStatusBadge />
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
      {editingMap?.kind === 'stock' && (
        <button
          type="button"
          onClick={() => void cloneStockMap(editingMap.id)}
          title="Clone into Your Maps"
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
          <Trash2 size={12} aria-hidden />
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
