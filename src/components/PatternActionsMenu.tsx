import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  CopyPlus,
  Download,
  EllipsisVertical,
  ExternalLink,
  Eye,
  Trash2,
} from 'lucide-react'
import { controlIcon } from '@/components/iconScale'

type PatternActionsMenuProps = {
  copied: boolean
  compileBroken: boolean
  stageView?: 'preview' | 'code'
  density?: 'compact' | 'regular'
  side?: 'above' | 'below'
  onToggleStage?: () => void
  onCopy?: () => void
  onDownload?: () => void
  onDelete?: () => void
  onViewInGallery?: () => void
  onClone?: () => void
}

export function PatternActionsMenu({
  copied,
  compileBroken,
  stageView,
  density = 'compact',
  side = 'below',
  onToggleStage,
  onCopy,
  onDownload,
  onDelete,
  onViewInGallery,
  onClone,
}: PatternActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const triggerHeight = density === 'regular' ? 'h-8 w-9' : 'h-6 w-7'
  const menuOffset = side === 'above'
    ? density === 'regular' ? 'bottom-9' : 'bottom-7'
    : density === 'regular' ? 'top-9' : 'top-7'

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = (action: () => void) => {
    setOpen(false)
    action()
  }

  const itemClass =
    'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus:bg-zinc-800/70 focus:text-zinc-100 focus:outline-none disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent'

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Pattern actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Pattern actions"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/70 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 ${triggerHeight}`}
      >
        <EllipsisVertical size={15} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute left-0 ${menuOffset} z-50 w-52 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl`}
        >
          {onToggleStage && stageView && (
            <button
              type="button"
              role="menuitem"
              onClick={() => select(onToggleStage)}
              className={itemClass}
            >
              <Eye {...controlIcon} className="text-zinc-500" aria-hidden />
              {stageView === 'code' ? 'View preview' : 'View code'}
            </button>
          )}
          {onViewInGallery && (
            <button
              type="button"
              role="menuitem"
              onClick={() => select(onViewInGallery)}
              className={itemClass}
            >
              <ExternalLink {...controlIcon} className="text-zinc-500" aria-hidden />
              View in Gallery
            </button>
          )}
          {onClone && (
            <button
              type="button"
              role="menuitem"
              onClick={() => select(onClone)}
              className={itemClass}
            >
              <CopyPlus {...controlIcon} className="text-zinc-500" aria-hidden />
              Clone into Patterns
            </button>
          )}
          {onCopy && (
            <button
              type="button"
              role="menuitem"
              disabled={compileBroken}
              onClick={() => select(onCopy)}
              className={itemClass}
            >
              <Copy {...controlIcon} className="text-zinc-500" aria-hidden />
              {copied ? 'Copied' : 'Copy code'}
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              role="menuitem"
              disabled={compileBroken}
              onClick={() => select(onDownload)}
              className={itemClass}
            >
              <Download {...controlIcon} className="text-zinc-500" aria-hidden />
              Download .epe
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => select(onDelete)}
              className={`${itemClass} mt-1 border-t border-zinc-800 text-red-300 hover:bg-red-950/45 hover:text-red-200`}
            >
              <Trash2 {...controlIcon} className="text-red-400/70" aria-hidden />
              Delete pattern
            </button>
          )}
        </div>
      )}
    </div>
  )
}
