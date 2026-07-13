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
import { STOCK_MIXIN_ITEMS, useMixinStore } from '@/store/mixinStore'
import { useRouterStore } from '@/store/routerStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { InlineEntityTitle } from '@/components/InlineEntityTitle'

export function MixinModeHeader() {
  const editingMixin = useMixinStore((s) => s.editingMixin)
  const userMixins = useMixinStore((s) => s.userMixins)
  const cloneStockMixin = useMixinStore((s) => s.cloneStockMixin)
  const renameMixin = useMixinStore((s) => s.renameMixin)
  const removeMixin = useMixinStore((s) => s.removeMixin)
  const navigate = useRouterStore((s) => s.navigate)
  const personalWorkspaceAuthenticated = useWorkspaceStore((s) => s.personalWorkspaceAuthenticated)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const openRecord =
    editingMixin?.kind === 'existing' ? userMixins.find((m) => m.id === editingMixin.id) : undefined
  const stockRecord =
    editingMixin?.kind === 'stock' ? STOCK_MIXIN_ITEMS.find((m) => m.id === editingMixin.id) : undefined

  const name = openRecord?.name ?? stockRecord?.name ?? 'Mixin'
  const kind = openRecord?.kind ?? stockRecord?.kind

  async function confirmDelete() {
    if (!openRecord) return
    await removeMixin(openRecord.id)
    navigate({ kind: 'studio', entity: { kind: 'mixins', id: null } })
    setDeleteOpen(false)
  }

  async function handleCloneStockMixin(id: string) {
    const recordId = await cloneStockMixin(id)
    if (recordId) navigate({ kind: 'studio', entity: { kind: 'mixins', id: recordId } })
  }

  return (
    <>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        <InlineEntityTitle name={name} noun="mixin" onRename={openRecord ? (nextName) => renameMixin(openRecord.id, nextName) : undefined} takenNames={userMixins.filter((mixin) => mixin.id !== openRecord?.id).map((mixin) => mixin.name)} />
        <CompileStatusBadge />
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-400 border border-zinc-700 leading-none">
          mixin
        </span>
        {kind && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-structural border border-zinc-700 leading-none">
            {kind}
          </span>
        )}
        {editingMixin?.kind === 'stock' && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-500 border border-zinc-700 leading-none">
            read-only
          </span>
        )}
      </span>
      {editingMixin?.kind === 'stock' && personalWorkspaceAuthenticated && (
        <button
          type="button"
          onClick={() => void handleCloneStockMixin(editingMixin.id)}
          title="Clone into Mixins"
          className="shrink-0 h-6 px-2 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-amber-400/80 transition-colors"
        >
          Clone
        </button>
      )}
      {openRecord && (
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="shrink-0 h-6 px-2 rounded border border-zinc-800 text-[11px] text-zinc-500 hover:border-red-900/80 hover:text-red-300 transition-colors flex items-center gap-1"
          title="Delete mixin"
        >
          <Trash2 size={12} aria-hidden />
          Delete
        </button>
      )}

      <AlertDialogRoot open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete mixin?</AlertDialogTitle>
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
