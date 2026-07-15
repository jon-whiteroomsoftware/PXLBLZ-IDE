import { Plus } from 'lucide-react'
import type { RefObject } from 'react'
import { STOCK_MIXIN_ITEMS, type EditingMixin, type MixinRecord } from '@/store/mixinStore'
import {
  EditableListItem,
  HeaderAction,
  RailEntityHeader,
  RailSectionScroller,
  StockListItem,
  StockSectionHeader,
  type ScrollMetrics,
} from '@/components/rail/RailPrimitives'

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
  onDeleteMixin,
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
  onDeleteMixin: (id: string) => void
  onCollapse?: () => void
}) {
  return (
    <>
      <RailEntityHeader
        title="Mixins"
        onCollapse={onCollapse}
        action={personalWorkspaceAuthenticated
          ? <HeaderAction icon={<Plus size={14} />} title="New mixin" onClick={onCreateMixin} />
          : null}
      />
      <RailSectionScroller
        testId="mixin-list-scroll"
        scrollRef={scrollRef}
        metrics={scrollMetrics}
        onScroll={onScroll}
      >
        {!personalWorkspaceAuthenticated ? (
          <p className="pl-3 pr-3 py-2 text-zinc-500 italic select-none">
            <a href="/api/auth/login" className="text-live hover:underline">Sign in</a>
            {' '}to save mixins
          </p>
        ) : userMixins.length === 0 ? (
          <p className="pl-3 pr-3 py-1 text-zinc-500 italic select-none">
            No cloud mixins yet
          </p>
        ) : (
          <ul className="pt-2">
            {userMixins.map((mixin) => (
              <EditableListItem
                key={mixin.id}
                name={mixin.name}
                noun="mixin"
                active={editingMixin?.kind === 'existing' && editingMixin.id === mixin.id}
                dim={mixin.kind}
                takenNames={userMixins.filter((m) => m.id !== mixin.id).map((m) => m.name)}
                onSelect={() => onOpenUserMixin(mixin)}
                onRename={(name) => onRenameMixin(mixin.id, name)}
                onDelete={() => onDeleteMixin(mixin.id)}
              />
            ))}
          </ul>
        )}
        <StockSectionHeader
          label="Stock Mixins"
          open={showStockMixins}
          onToggle={onToggleStockMixins}
        />
        {showStockMixins && (
          <ul className="pt-2 opacity-85">
            {STOCK_MIXIN_ITEMS.map((mixin) => (
              <StockListItem
                key={mixin.id}
                name={mixin.name}
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
