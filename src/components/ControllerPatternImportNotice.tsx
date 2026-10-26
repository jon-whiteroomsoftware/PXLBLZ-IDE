import { useEffect, useState, type JSX } from 'react'
import { getControllerMetadataStorage } from '@/engine/controllerMetadataStorage'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { controllerPatternImportPolicy, readControllerPatternImportLedger } from '@/engine/controllerPatternImport'
import { useWorkspaceStore } from '@/store/workspaceStore'

export function ControllerPatternImportNotice({ patternId }: { patternId: string | null }): JSX.Element | null {
  const workspace = useWorkspaceStore()
  const storage = getControllerMetadataStorage()
  const personal = getPersonalContentProvider()
  const [result, setResult] = useState<{ patternId: string; storage: typeof storage; personal: typeof personal; workspace: typeof workspace; notice: string | null } | null>(null)
  useEffect(() => {
    let current = true
    if (!patternId || !workspace.personalWorkspaceAuthenticated) return
    const accept = (notice: string | null) => {
      if (current && getControllerMetadataStorage() === storage && getPersonalContentProvider() === personal
        && useWorkspaceStore.getState() === workspace) setResult({ patternId, storage, personal, workspace, notice })
    }
    void (async () => {
      try {
        if (storage.id === 'demo' || !storage.getPatternImports) throw new Error('No import metadata')
        const ledger = readControllerPatternImportLedger(await storage.getPatternImports())
        accept(controllerPatternImportPolicy(ledger, patternId).notice)
      } catch { accept('Controller import policy could not be read.') }
    })()
    return () => { current = false }
  }, [patternId, storage, personal, workspace])
  const notice = patternId && workspace.personalWorkspaceAuthenticated && result?.patternId === patternId
    && result.storage === storage && result.personal === personal && result.workspace === workspace ? result.notice : null
  return notice ? <p role="status" className="shrink-0 px-3 py-2 text-xs text-amber-300">{notice}</p> : null
}
