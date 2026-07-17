import type { ApiReferenceDocument } from '@/engine/apiReferenceCatalog'
import { ApiReferenceCatalog } from './ApiReferenceCatalog'
import { ApiReferenceReader } from './ApiReferenceReader'

export function ApiReferenceWorkspace({
  documents,
  activeDocument,
}: {
  documents: ApiReferenceDocument[]
  activeDocument: ApiReferenceDocument
}) {
  return (
    <main
      data-testid="api-reference-workspace"
      className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row"
    >
      <ApiReferenceCatalog documents={documents} activeId={activeDocument.id} />
      <div className="min-w-0 flex-1">
        <ApiReferenceReader document={activeDocument} />
      </div>
    </main>
  )
}
