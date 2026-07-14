import { DocsReader } from '@/components/DocsReader'
import { DocsCatalog } from '@/components/DocsCatalog'
import type { UserDoc } from '@/docs/catalog'

export function DocsWorkspace({ doc }: { doc: UserDoc }) {
  return (
    <main data-testid="docs-workspace" className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
      <DocsCatalog activeDocId={doc.id} />
      <div className="min-w-0 flex-1">
        <DocsReader doc={doc} />
      </div>
    </main>
  )
}
