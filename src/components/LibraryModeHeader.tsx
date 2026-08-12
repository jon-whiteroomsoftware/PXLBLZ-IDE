import { useState } from 'react'
import { Code2, Trash2 } from 'lucide-react'
import { controlIcon } from '@/components/iconScale'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
import { SaveStatusBadge } from './SaveStatusBadge'
import { useEditorStore } from '@/store/editorStore'
import { useLibraryStore } from '@/store/libraryStore'
import { usePatternStore } from '@/store/patternStore'
import { useRouterStore } from '@/store/routerStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { sanitizeLibraryNameInput } from '@/engine/libraries'
import { InlineEntityTitle } from '@/components/InlineEntityTitle'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { useStudioOperationStore } from '@/store/studioOperationStore'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

export function LibraryModeHeader() {
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const isReadOnly = useEditorStore((s) => s.isReadOnly)
  const editingLibrary = useLibraryStore((s) => s.editingLibrary)
  const userLibraries = useLibraryStore((s) => s.userLibraries)
  const cloneStockLibrary = useLibraryStore((s) => s.cloneStockLibrary)
  const renameLibrary = useLibraryStore((s) => s.renameLibrary)
  const removeLibrary = useLibraryStore((s) => s.removeLibrary)
  const validateLibraryNamespace = useLibraryStore((s) => s.validateLibraryNamespace)
  const navigate = useRouterStore((s) => s.navigate)
  const personalWorkspaceAuthenticated = useWorkspaceStore((s) => s.personalWorkspaceAuthenticated)
  const executeStudioOperation = useStudioOperationStore((s) => s.execute)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const name = activeLibraryName ?? 'Library'
  const openRecord = editingLibrary?.kind === 'existing'
    ? userLibraries.find((library) => library.id === editingLibrary.id)
    : undefined

  async function handleCloneStockLibrary(id: string) {
    const recordId = newPersonalContentId()
    await executeStudioOperation({
      surface: 'editor',
      action: 'clone',
      entityKind: 'library',
      entityName: name,
      run: async () => {
        const clonedId = await cloneStockLibrary(id, recordId)
        if (clonedId) navigate({ kind: 'studio', entity: { kind: 'libraries', id: clonedId } })
      },
    })
  }

  async function handleRenameLibrary(nextName: string): Promise<boolean> {
    if (!openRecord) return false
    await renameLibrary(openRecord.id, nextName)
    return true
  }

  async function confirmDelete() {
    if (!openRecord) return
    setDeleteOpen(false)
    const { id, name: recordName } = openRecord
    await executeStudioOperation({
      surface: 'editor',
      action: 'delete',
      entityKind: 'library',
      entityName: recordName,
      run: async () => {
        await removeLibrary(id)
        navigate({ kind: 'studio', entity: { kind: 'libraries', id: null } })
      },
    })
  }

  return (
    <>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        <Code2 size={14} aria-hidden className="shrink-0 text-zinc-500" />
        <InlineEntityTitle
          name={name}
          noun="library"
          onRename={openRecord ? handleRenameLibrary : undefined}
          validateName={(nextName) => validateLibraryNamespace(nextName, openRecord?.id)}
          sanitizeInput={sanitizeLibraryNameInput}
        />
        <CompileStatusBadge />
        <SaveStatusBadge />
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-400 border border-zinc-700 leading-none">
          library
        </span>
        {isReadOnly && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-500 border border-zinc-700 leading-none">
            read-only
          </span>
        )}
      </span>
      {editingLibrary?.kind === 'stock' && personalWorkspaceAuthenticated && (
        <button
          type="button"
          onClick={() => void handleCloneStockLibrary(editingLibrary.id)}
          title="Clone into Libraries"
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
          title="Delete library"
        >
          <Trash2 {...controlIcon} aria-hidden />
          Delete
        </button>
      )}

      <AlertDialogRoot open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete library?</AlertDialogTitle>
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
