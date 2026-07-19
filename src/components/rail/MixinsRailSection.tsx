import { useRef, type RefObject } from 'react'
import type { EntityOrganizationV1 } from '@/engine/entityOrganization'
import { STOCK_MIXIN_ITEMS, type EditingMixin, type MixinRecord } from '@/store/mixinStore'
import {
  HeaderMenu,
  RailEmptyState,
  RailEntityHeader,
  RailSectionScroller,
  StockListItem,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'
import { EntityOrganizationTree, type EntityOrganizationTreeHandle } from '@/components/rail/EntityOrganizationTree'

export function MixinsRailSection({
  personalWorkspaceAuthenticated,
  userMixins,
  editingMixin,
  showStockMixins,
  scrollRef,
  scrollMetrics,
  onScroll,
  onCreateMixin,
  onToggleStockMixins,
  onOpenUserMixin,
  onOpenStockMixin,
  onRenameMixin,
  personalOrganization,
  onPersonalOrganizationChange,
  onEmptyTrash,
  onCollapse,
}: {
  personalWorkspaceAuthenticated: boolean
  userMixins: MixinRecord[]
  editingMixin: EditingMixin
  showStockMixins: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  scrollMetrics: ScrollMetrics
  onScroll: () => void
  onCreateMixin: () => void
  onToggleStockMixins: () => void
  onOpenUserMixin: (mixin: MixinRecord) => void
  onOpenStockMixin: (id: string) => void
  onRenameMixin: (id: string, name: string) => void
  personalOrganization: EntityOrganizationV1
  onPersonalOrganizationChange: (organization: EntityOrganizationV1) => void
  onEmptyTrash: (entityIds: string[]) => void | Promise<void>
  onCollapse?: () => void
}) {
  const personalTreeRef = useRef<EntityOrganizationTreeHandle>(null)
  return (
    <>
      <RailEntityHeader
        title="Mixins"
        onCollapse={onCollapse}
        action={personalWorkspaceAuthenticated ? (
          <HeaderMenu
            title="Mixin actions"
            items={[
              { label: 'New mixin', onSelect: onCreateMixin },
              { label: 'New folder', onSelect: () => personalTreeRef.current?.createFolder() },
            ]}
          />
        ) : null}
      />
      <RailSectionScroller
        testId="mixin-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
      >
        {!personalWorkspaceAuthenticated ? (
          <RailEmptyState roomy>
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save mixins
          </RailEmptyState>
        ) : (
          <EntityOrganizationTree
            ref={personalTreeRef}
            organization={personalOrganization}
            items={userMixins.map((mixin) => ({ id: mixin.id, name: mixin.name, meta: mixin.kind }))}
            activeEntityId={editingMixin?.kind === 'existing' ? editingMixin.id : null}
            query=""
            noun="mixin"
            sectionLabel="Mixins"
            emptyMessage="No mixins yet"
            onSelect={(id) => {
              const mixin = userMixins.find((candidate) => candidate.id === id)
              if (mixin) onOpenUserMixin(mixin)
            }}
            onRenameEntity={onRenameMixin}
            onEmptyTrash={onEmptyTrash}
            onOrganizationChange={onPersonalOrganizationChange}
          />
        )}
        <StockSectionHeader
          label="Built-in Mixins"
          open={showStockMixins}
          onToggle={onToggleStockMixins}
        />
        {showStockMixins && (
          <ul className="pt-2">
            {STOCK_MIXIN_ITEMS.map((mixin) => (
              <StockListItem
                key={mixin.id}
                name={mixin.name}
                noun="mixin"
                active={editingMixin?.kind === 'stock' && editingMixin.id === mixin.id}
                meta={mixin.kind}
                onSelect={() => onOpenStockMixin(mixin.id)}
              />
            ))}
          </ul>
        )}
      </RailSectionScroller>
    </>
  )
}
