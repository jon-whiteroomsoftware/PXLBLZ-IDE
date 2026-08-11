import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { controlIcon, inlineIcon } from '@/components/iconScale'
import {
  collectTrashedEntityOrganizationIds,
  createEntityOrganizationFolder,
  emptyEntityOrganizationTrash,
  entityOrganizationNodeKey,
  moveEntityOrganizationNode,
  moveEntityOrganizationNodeToContainer,
  renameEntityOrganizationFolder,
  restoreEntityOrganizationNode,
  searchEntityOrganization,
  setEntityOrganizationFolderCollapsed,
  trashEntityOrganizationNode,
  type EntityOrganizationDropPlacement,
  type EntityOrganizationFolder,
  type EntityOrganizationNode,
  type EntityOrganizationNodeKey,
  type EntityOrganizationV1,
} from '@/engine/entityOrganization'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { sanitizeLibraryNameInput } from '@/engine/libraries'
import { IDE_MICROTYPE } from '@/components/ui/ideMicrotype'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { DraftTextField } from '@/components/ui/draft-text-field'
import { EntityIcon, RailEmptyRow, type EntityNoun } from '@/components/rail/RailPrimitives'

// Shallow VS Code-style step (#787): chevrons and entity icons already carry
// the hierarchy signal, so deep rows keep their width for names.
const INDENT_PER_LEVEL = 8

export interface EntityOrganizationTreeItem {
  id: string
  name: string
  meta?: string
}

interface DropTarget {
  key: EntityOrganizationNodeKey
  placement: EntityOrganizationDropPlacement
}

export interface EntityOrganizationTreeHandle {
  createFolder: () => void
}

interface EntityOrganizationTreeProps {
  organization: EntityOrganizationV1
  items: readonly EntityOrganizationTreeItem[]
  activeEntityId: string | null
  query: string
  noun: EntityNoun
  editable?: boolean
  canRenameEntity?: boolean
  allowHorizontalOverflow?: boolean
  sectionLabel?: string
  emptyMessage?: string
  onSelect: (entityId: string) => void
  onRenameEntity: (entityId: string, name: string) => void
  onEmptyTrash?: (entityIds: string[]) => void | Promise<void>
  onOrganizationChange: (organization: EntityOrganizationV1) => void
}

export const EntityOrganizationTree = forwardRef<EntityOrganizationTreeHandle, EntityOrganizationTreeProps>(function EntityOrganizationTree({
  organization,
  items,
  activeEntityId,
  query,
  noun,
  editable = true,
  canRenameEntity = true,
  allowHorizontalOverflow = false,
  sectionLabel,
  emptyMessage,
  onSelect,
  onRenameEntity,
  onEmptyTrash,
  onOrganizationChange,
}, ref) {
  const [editingKey, setEditingKey] = useState<EntityOrganizationNodeKey | null>(null)
  const [menuKey, setMenuKey] = useState<EntityOrganizationNodeKey | null>(null)
  const [draggedKey, setDraggedKey] = useState<EntityOrganizationNodeKey | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [emptyingTrash, setEmptyingTrash] = useState(false)
  const [confirmEmptyTrashOpen, setConfirmEmptyTrashOpen] = useState(false)
  const [moveKey, setMoveKey] = useState<EntityOrganizationNodeKey | null>(null)
  const treeRef = useRef<HTMLUListElement>(null)
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const trimmedQuery = query.trim()
  const treeLabel = sectionLabel ?? `${editable ? '' : 'Built-in '}${noun[0].toUpperCase()}${noun.slice(1)}s`
  const overflowWidthClass = allowHorizontalOverflow ? 'min-w-full' : ''

  useEffect(() => {
    if (!menuKey) return
    const close = () => setMenuKey(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuKey])

  function change(next: EntityOrganizationV1) {
    if (next !== organization) onOrganizationChange(next)
  }

  function clearDrag() {
    setDraggedKey(null)
    setDropTarget(null)
  }

  function createFolder() {
    const id = newPersonalContentId()
    change(createEntityOrganizationFolder(organization, { id, name: 'New Folder', index: 0 }))
    setEditingKey(`folder:${id}`)
  }

  useImperativeHandle(ref, () => ({ createFolder }))

  function rename(key: EntityOrganizationNodeKey, name: string) {
    if (key.startsWith('folder:')) change(renameEntityOrganizationFolder(organization, key.slice(7), name))
    else onRenameEntity(key.slice(7), name)
    setEditingKey(null)
  }

  function reorder(key: EntityOrganizationNodeKey, direction: -1 | 1) {
    const siblings = siblingKeys(organization.nodes, key)
    const index = siblings.indexOf(key)
    const target = siblings[index + direction]
    if (!target) return
    change(moveEntityOrganizationNode(organization, key, target, direction < 0 ? 'before' : 'after'))
    setMenuKey(null)
  }

  function handleDrop(target: DropTarget) {
    if (!draggedKey) return
    change(moveEntityOrganizationNode(organization, draggedKey, target.key, target.placement))
    clearDrag()
  }

  async function handleEmptyTrash() {
    if (emptyingTrash) return
    setEmptyingTrash(true)
    try {
      if (onEmptyTrash) await onEmptyTrash(collectTrashedEntityOrganizationIds(organization))
      else change(emptyEntityOrganizationTrash(organization))
      setTrashOpen(false)
    } finally {
      setEmptyingTrash(false)
    }
  }

  // Emptying the Trash is the only permanent-loss action in the rail (#793),
  // so both entry points route through the same confirmation dialog.
  const trashCount = organization.trash.length
  const emptyTrashConfirmDialog = (
    <AlertDialogRoot open={confirmEmptyTrashOpen} onOpenChange={setConfirmEmptyTrashOpen}>
      <AlertDialogContent>
        <AlertDialogTitle>Empty Trash?</AlertDialogTitle>
        <AlertDialogDescription>
          {trashCount === 1
            ? '1 item will be permanently deleted and cannot be recovered.'
            : `${trashCount} items will be permanently deleted and cannot be recovered.`}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleEmptyTrash()}>Empty Trash</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  )

  if (trimmedQuery) {
    const namesByEntityId = Object.fromEntries(items.map((item) => [item.id, item.name]))
    const results = searchEntityOrganization(organization, namesByEntityId, trimmedQuery)
    return (
      <>
        <ul role="tree" aria-label={treeLabel} className={`py-1 ${overflowWidthClass}`}>
          {results.map((result) => (
            <SearchResultRow
              key={result.entityId}
              name={result.name}
              path={result.path}
              active={activeEntityId === result.entityId}
              noun={noun}
              allowHorizontalOverflow={allowHorizontalOverflow}
              onSelect={() => onSelect(result.entityId)}
            />
          ))}
        </ul>
      </>
    )
  }

  if (trashOpen) {
    return (
      <>
        <div className="border-b border-zinc-800 px-2 py-1.5">
          <button type="button" onClick={() => setTrashOpen(false)} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200">
            <ChevronRight size={11} className="rotate-180" /> Back to {treeLabel}
          </button>
        </div>
        <div className="py-1">
          {organization.trash.map((entry) => {
            const key = entityOrganizationNodeKey(entry.node)
            const name = nodeName(entry.node, itemsById)
            return (
              <div key={key} className="group flex min-h-[28px] items-center gap-1.5 px-2 text-[11px] text-zinc-400 hover:bg-zinc-800/50">
                <Trash2 size={12} className="shrink-0 text-zinc-600" />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <button
                  type="button"
                  onClick={() => change(restoreEntityOrganizationNode(organization, key))}
                  className="grid size-5 place-items-center text-zinc-600 hover:text-live"
                  aria-label={`Restore ${name}`}
                  title="Restore"
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            )
          })}
          {organization.trash.length === 0 && <p className="px-3 py-3 text-[10px] text-zinc-600">Trash is empty</p>}
          {organization.trash.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmEmptyTrashOpen(true)}
              disabled={emptyingTrash}
              className="mt-1 flex min-h-[24px] w-full items-center gap-1.5 px-2 text-left text-[11px] text-zinc-500 hover:bg-zinc-900/60 hover:text-red-300 disabled:opacity-30"
            >
              <Trash2 size={12} className="shrink-0" />
              Empty Trash
            </button>
          )}
        </div>
        {emptyTrashConfirmDialog}
      </>
    )
  }

  return (
    <>
      {organization.nodes.length === 0 && emptyMessage && (
        <RailEmptyRow label={emptyMessage} noun={noun} />
      )}
      <ul
        ref={treeRef}
        role="tree"
        aria-label={treeLabel}
        className={`py-1 ${overflowWidthClass}`}
        onDragLeave={(event) => {
          const related = event.relatedTarget
          if (!(related instanceof Node) || !event.currentTarget.contains(related)) clearDrag()
        }}
      >
        {organization.nodes.map((node) => (
          <OrganizationTreeNode
            key={entityOrganizationNodeKey(node)}
            node={node}
            depth={0}
            organization={organization}
            itemsById={itemsById}
            activeEntityId={activeEntityId}
            editable={editable}
            canRenameEntity={canRenameEntity}
            noun={noun}
            allowHorizontalOverflow={allowHorizontalOverflow}
            draggedKey={draggedKey}
            editingKey={editingKey}
            menuKey={menuKey}
            dropTarget={dropTarget}
            treeRef={treeRef}
            onSelect={onSelect}
            onChange={change}
            onRename={rename}
            onEdit={setEditingKey}
            onMenu={setMenuKey}
            onReorder={reorder}
            onMove={setMoveKey}
            onTrash={(key) => change(trashEntityOrganizationNode(organization, key))}
            onDragStart={setDraggedKey}
            onDragOver={(target) => setDropTarget(target)}
            onDrop={handleDrop}
            onDragEnd={clearDrag}
          />
        ))}
      </ul>
      {editable && organization.trash.length > 0 && (
        <div className="group relative my-1 flex min-h-[20px] items-center">
          <button
            type="button"
            onClick={() => setTrashOpen(true)}
            aria-label={`Open Trash (${organization.trash.length} ${organization.trash.length === 1 ? 'item' : 'items'})`}
            className={`flex min-h-[20px] w-full items-center gap-1 px-[6px] py-px text-left text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300 ${IDE_MICROTYPE.entity.sizeClassName}`}
          >
            <Trash2 size={12} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">Trash</span>
            <span className="pr-0.5 text-[9px] text-zinc-600 group-hover:opacity-0 group-focus-within:opacity-0">{organization.trash.length}</span>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setConfirmEmptyTrashOpen(true)
            }}
            disabled={emptyingTrash}
            aria-label="Empty Trash"
            title="Empty Trash"
            className="absolute right-1 grid size-5 place-items-center text-zinc-600 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-30"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
      {emptyTrashConfirmDialog}
      {moveKey && (
        <MoveDialog
          organization={organization}
          nodeKey={moveKey}
          nodeName={nodeNameByKey(organization.nodes, moveKey, itemsById)}
          rootLabel={treeLabel}
          onClose={() => setMoveKey(null)}
          onMove={(folderId) => {
            change(moveEntityOrganizationNodeToContainer(organization, moveKey, folderId))
            setMoveKey(null)
          }}
        />
      )}
    </>
  )
})

function OrganizationTreeNode(props: {
  node: EntityOrganizationNode
  depth: number
  organization: EntityOrganizationV1
  itemsById: ReadonlyMap<string, EntityOrganizationTreeItem>
  activeEntityId: string | null
  editable: boolean
  canRenameEntity: boolean
  noun: EntityNoun
  allowHorizontalOverflow: boolean
  draggedKey: EntityOrganizationNodeKey | null
  editingKey: EntityOrganizationNodeKey | null
  menuKey: EntityOrganizationNodeKey | null
  dropTarget: DropTarget | null
  treeRef: React.RefObject<HTMLUListElement | null>
  onSelect: (entityId: string) => void
  onChange: (organization: EntityOrganizationV1) => void
  onRename: (key: EntityOrganizationNodeKey, name: string) => void
  onEdit: (key: EntityOrganizationNodeKey | null) => void
  onMenu: (key: EntityOrganizationNodeKey | null) => void
  onReorder: (key: EntityOrganizationNodeKey, direction: -1 | 1) => void
  onMove: (key: EntityOrganizationNodeKey) => void
  onTrash: (key: EntityOrganizationNodeKey) => void
  onDragStart: (key: EntityOrganizationNodeKey) => void
  onDragOver: (target: DropTarget) => void
  onDrop: (target: DropTarget) => void
  onDragEnd: () => void
}) {
  const key = entityOrganizationNodeKey(props.node)
  const folder = props.node.kind === 'folder' ? props.node : null
  const item = props.node.kind === 'entity' ? props.itemsById.get(props.node.entityId) : null
  if (!folder && !item) return null
  if (folder && !props.editable && visibleEntityCount(folder.children, props.itemsById) === 0) return null
  const name = folder?.name ?? item!.name
  const active = Boolean(item && props.activeEntityId === item.id)
  const dragging = props.draggedKey === key
  const collapsed = Boolean(folder && props.organization.collapsedFolderIds.includes(folder.id))
  const activeDrop = props.dropTarget?.key === key ? props.dropTarget.placement : null

  function placement(event: DragEvent<HTMLLIElement>): EntityOrganizationDropPlacement {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5
    if (folder && ratio >= 0.28 && ratio <= 0.72) return 'inside'
    return ratio < 0.5 ? 'before' : 'after'
  }

  function toggleFolder(collapsedValue = !collapsed) {
    if (!folder) return
    props.onChange(setEntityOrganizationFolderCollapsed(props.organization, folder.id, collapsedValue))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusAdjacentTreeItem(props.treeRef.current, event.currentTarget, event.key === 'ArrowDown' ? 1 : -1)
    } else if (folder && event.key === 'ArrowRight' && collapsed) {
      event.preventDefault()
      toggleFolder(false)
    } else if (folder && event.key === 'ArrowLeft' && !collapsed) {
      event.preventDefault()
      toggleFolder(true)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (folder) toggleFolder()
      else props.onSelect(item!.id)
    }
  }

  return (
    <>
      <li
        role="treeitem"
        aria-expanded={folder ? !collapsed : undefined}
        aria-selected={item ? active : undefined}
        data-node-key={key}
        data-drag-origin={dragging ? 'true' : undefined}
        data-studio-space-preview="true"
        tabIndex={0}
        draggable={props.editable}
        onKeyDown={handleKeyDown}
        onClick={() => folder ? toggleFolder() : props.onSelect(item!.id)}
        onDragStart={(event) => {
          if (!props.editable) return
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', key)
          props.onDragStart(key)
        }}
        onDragEnd={props.onDragEnd}
        onDragOver={(event) => {
          if (!props.editable || !props.draggedKey) return
          event.preventDefault()
          props.onDragOver({ key, placement: placement(event) })
        }}
        onDrop={(event) => {
          if (!props.editable || !props.draggedKey) return
          event.preventDefault()
          event.stopPropagation()
          props.onDrop({ key, placement: placement(event) })
        }}
        style={{ paddingLeft: 6 + props.depth * INDENT_PER_LEVEL }}
        className={`group relative flex min-h-[20px] cursor-pointer items-center gap-1 py-px pr-1.5 outline-none transition-opacity focus-visible:ring-1 focus-visible:ring-live/70 focus-visible:ring-inset ${IDE_MICROTYPE.entity.sizeClassName} ${dragging ? 'bg-zinc-900/40 text-zinc-600 opacity-40' : active ? 'bg-live/5 text-live' : 'bg-[#0b0c0f] text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'}`}
      >
        {active && !dragging && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-live" />}
        {activeDrop === 'before' && <span data-drop-cue="before" className="absolute inset-x-1 -top-px h-0.5 bg-live" />}
        {activeDrop === 'inside' && <span data-drop-cue="inside" className="absolute inset-0 border border-live/60 bg-live/10" />}
        {activeDrop === 'after' && <span data-drop-cue="after" className="absolute inset-x-1 -bottom-px h-0.5 bg-live" />}
        {folder ? (
          <span className="shrink-0 text-zinc-500">{collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</span>
        ) : (
          <EntityIcon noun={props.noun} />
        )}
        {props.editingKey === key ? (
          <InlineName
            name={name}
            sanitizeAsIdentifier={Boolean(item && props.noun === 'library')}
            onCommit={(next) => props.onRename(key, next)}
            onCancel={() => props.onEdit(null)}
          />
        ) : (
          <span className={`min-w-0 flex-1 ${props.allowHorizontalOverflow ? 'whitespace-nowrap' : 'truncate'}`} title={name}>{name}</span>
        )}
        {folder && <span className="relative z-10 shrink-0 bg-inherit pl-1 text-[9px] text-zinc-600 group-hover:opacity-0">{props.editable ? countEntities(folder.children) : visibleEntityCount(folder.children, props.itemsById)}</span>}
        {item?.meta && active && <span className="relative z-10 shrink-0 bg-inherit pl-1 text-[8px] uppercase text-zinc-500 group-hover:opacity-0">{item.meta}</span>}
        {props.editable && !dragging && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              props.onMenu(props.menuKey === key ? null : key)
            }}
            className="absolute right-1 top-1/2 hidden size-5 -translate-y-1/2 place-items-center border border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-200 group-hover:grid group-focus-within:grid"
            aria-label={`More actions for ${name}`}
          >
            <MoreHorizontal size={12} />
          </button>
        )}
        {props.menuKey === key && (
          <RowActionMenu
            onRename={folder || props.canRenameEntity ? () => {
              props.onMenu(null)
              props.onEdit(key)
            } : undefined}
            onMoveUp={() => props.onReorder(key, -1)}
            onMoveDown={() => props.onReorder(key, 1)}
            onMoveTo={() => props.onMove(key)}
            onTrash={() => props.onTrash(key)}
          />
        )}
      </li>
      {folder && !collapsed && folder.children.map((child) => (
        <OrganizationTreeNode key={entityOrganizationNodeKey(child)} {...props} node={child} depth={props.depth + 1} />
      ))}
    </>
  )
}

function SearchResultRow({ name, path, active, noun, allowHorizontalOverflow, onSelect }: { name: string; path: string[]; active: boolean; noun: EntityNoun; allowHorizontalOverflow: boolean; onSelect: () => void }) {
  return (
    <li
      role="treeitem"
      tabIndex={0}
      aria-selected={active}
      // Select on pointerdown, not click: pressing a result blurs the rail
      // search input, whose blur clears the query and unmounts this row
      // before mouseup, so a click handler would never fire.
      onPointerDown={(event) => {
        if (event.button !== 0) return
        onSelect()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect()
      }}
      className={`relative min-h-[30px] cursor-pointer py-1 pl-2 pr-2 outline-none focus-visible:ring-1 focus-visible:ring-live/70 ${active ? 'bg-live/5 text-live' : 'text-zinc-400 hover:bg-zinc-800/60'}`}
    >
      {active && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-live" />}
      <span className={`flex items-center gap-1 ${IDE_MICROTYPE.entity.sizeClassName}`}>
        <EntityIcon noun={noun} />
        <span className={`min-w-0 flex-1 ${allowHorizontalOverflow ? 'whitespace-nowrap' : 'truncate'}`}>{name}</span>
      </span>
      {path.length > 0 && <span className="block truncate pl-4 text-[9px] leading-3 text-zinc-600">{path.join(' / ')}</span>}
    </li>
  )
}

function InlineName({ name, sanitizeAsIdentifier, onCommit, onCancel }: { name: string; sanitizeAsIdentifier: boolean; onCommit: (name: string) => void; onCancel: () => void }) {
  return (
    <DraftTextField
      ariaLabel="Rename item"
      value={name}
      sanitize={sanitizeAsIdentifier ? sanitizeLibraryNameInput : undefined}
      formatApplied={(_, draft) => draft.trim() || name}
      onApply={(draft) => onCommit(draft.trim() || name)}
      onCancel={onCancel}
      rootProps={{ onClick: (event) => event.stopPropagation() }}
      inputProps={{
        autoFocus: true,
        onKeyDown: (event) => event.stopPropagation(),
      }}
      className="min-w-0 flex-1"
      inputClassName="h-[18px] min-w-0 flex-1 border border-live/60 bg-zinc-950 px-1 text-[11px] text-zinc-100 outline-none"
    />
  )
}

function RowActionMenu(props: { onRename?: () => void; onMoveUp: () => void; onMoveDown: () => void; onMoveTo: () => void; onTrash: () => void }) {
  const actions = [
    ...(props.onRename ? [['Rename', props.onRename] as const] : []),
    ['Move up', props.onMoveUp],
    ['Move down', props.onMoveDown],
    ['Move to...', props.onMoveTo],
    ['Move to Trash', props.onTrash],
  ] as const
  return (
    <div className="absolute right-1 top-full z-30 min-w-28 border border-zinc-700 bg-zinc-950 py-1 shadow-xl shadow-black/70" onClick={(event) => event.stopPropagation()}>
      {actions.map(([label, action]) => (
        <button key={label} type="button" onClick={action} className="block h-6 w-full px-2 text-left text-[10px] text-zinc-300 hover:bg-zinc-800">
          {label}
        </button>
      ))}
    </div>
  )
}

function MoveDialog({ organization, nodeKey, nodeName: name, rootLabel, onClose, onMove }: { organization: EntityOrganizationV1; nodeKey: EntityOrganizationNodeKey; nodeName: string; rootLabel: string; onClose: () => void; onMove: (folderId: string | null) => void }) {
  const folders = collectFolderOptions(organization.nodes, nodeKey)
  const [folderId, setFolderId] = useState<string | null>(null)
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-label={`Move ${name}`} className="w-full max-w-sm border border-zinc-700 bg-[#101115] shadow-2xl shadow-black/70">
        <header className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <Folder {...inlineIcon} className="text-live" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-100">Move {name}</span>
          <button type="button" onClick={onClose} className="grid size-6 place-items-center text-zinc-500 hover:text-zinc-200" aria-label="Close"><X {...controlIcon} /></button>
        </header>
        <div className="max-h-72 overflow-auto p-2">
          <MoveDestination label={rootLabel} depth={0} selected={folderId === null} onSelect={() => setFolderId(null)} />
          {folders.map((folder) => <MoveDestination key={folder.id} label={folder.name} depth={folder.depth + 1} selected={folderId === folder.id} onSelect={() => setFolderId(folder.id)} />)}
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-800 px-3 py-2">
          <button type="button" onClick={onClose} className="h-7 border border-zinc-800 px-2 text-[10px] text-zinc-500 hover:text-zinc-200">Cancel</button>
          <button type="button" onClick={() => onMove(folderId)} className="h-7 border border-live/50 bg-live/15 px-3 text-[10px] text-live hover:bg-live/25">Move</button>
        </footer>
      </section>
    </div>
  )
}

function MoveDestination({ label, depth, selected, onSelect }: { label: string; depth: number; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} style={{ paddingLeft: 8 + depth * INDENT_PER_LEVEL }} className={`flex min-h-[26px] w-full items-center gap-1.5 pr-2 text-left text-[11px] hover:bg-zinc-800/60 ${selected ? 'bg-live/5 text-live' : 'text-zinc-400'}`}><Folder size={12} /><span className="truncate">{label}</span></button>
}

function focusAdjacentTreeItem(tree: HTMLUListElement | null, current: HTMLElement, direction: -1 | 1) {
  if (!tree) return
  const rows = [...tree.querySelectorAll<HTMLElement>(':scope > [role="treeitem"], :scope [role="treeitem"]')].filter((row) => row.offsetParent !== null || typeof row.offsetParent === 'undefined')
  const index = rows.indexOf(current)
  rows[Math.max(0, Math.min(rows.length - 1, index + direction))]?.focus()
}

function countEntities(nodes: readonly EntityOrganizationNode[]): number {
  return nodes.reduce((total, node) => total + (node.kind === 'entity' ? 1 : countEntities(node.children)), 0)
}

function visibleEntityCount(nodes: readonly EntityOrganizationNode[], items: ReadonlyMap<string, EntityOrganizationTreeItem>): number {
  return nodes.reduce((total, node) => total + (node.kind === 'entity' ? Number(items.has(node.entityId)) : visibleEntityCount(node.children, items)), 0)
}

function nodeName(node: EntityOrganizationNode, items: ReadonlyMap<string, EntityOrganizationTreeItem>): string {
  return node.kind === 'folder' ? node.name : (items.get(node.entityId)?.name ?? 'Missing item')
}

function nodeNameByKey(nodes: readonly EntityOrganizationNode[], key: EntityOrganizationNodeKey, items: ReadonlyMap<string, EntityOrganizationTreeItem>): string {
  for (const node of nodes) {
    if (entityOrganizationNodeKey(node) === key) return nodeName(node, items)
    if (node.kind === 'folder') {
      const nested = nodeNameByKey(node.children, key, items)
      if (nested) return nested
    }
  }
  return ''
}

function siblingKeys(nodes: readonly EntityOrganizationNode[], key: EntityOrganizationNodeKey): EntityOrganizationNodeKey[] {
  if (nodes.some((node) => entityOrganizationNodeKey(node) === key)) return nodes.map(entityOrganizationNodeKey)
  for (const node of nodes) {
    if (node.kind !== 'folder') continue
    const nested = siblingKeys(node.children, key)
    if (nested.length) return nested
  }
  return []
}

function collectFolderOptions(nodes: readonly EntityOrganizationNode[], excludedKey: EntityOrganizationNodeKey, depth = 0): Array<{ id: string; name: string; depth: number }> {
  const options: Array<{ id: string; name: string; depth: number }> = []
  for (const node of nodes) {
    if (node.kind !== 'folder') continue
    if (entityOrganizationNodeKey(node) === excludedKey || containsKey(node, excludedKey)) continue
    options.push({ id: node.id, name: node.name, depth })
    options.push(...collectFolderOptions(node.children, excludedKey, depth + 1))
  }
  return options
}

function containsKey(folder: EntityOrganizationFolder, key: EntityOrganizationNodeKey): boolean {
  return folder.children.some((node) => entityOrganizationNodeKey(node) === key || (node.kind === 'folder' && containsKey(node, key)))
}
