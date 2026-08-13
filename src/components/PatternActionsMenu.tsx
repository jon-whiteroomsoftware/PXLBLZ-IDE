import {
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  Eye,
  Trash2,
} from 'lucide-react'
import { ActionsMenu, type ActionsMenuItem } from '@/components/ActionsMenu'
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
  const items: ActionsMenuItem[] = []
  if (onToggleStage && stageView) items.push({
    label: stageView === 'code' ? 'View preview' : 'View code',
    icon: <Eye {...controlIcon} className="text-zinc-500" aria-hidden />,
    onSelect: onToggleStage,
  })
  if (onViewInGallery) items.push({
    label: 'View in Gallery',
    icon: <ExternalLink {...controlIcon} className="text-zinc-500" aria-hidden />,
    onSelect: onViewInGallery,
  })
  if (onClone) items.push({
    label: 'Clone into Patterns',
    icon: <CopyPlus {...controlIcon} className="text-zinc-500" aria-hidden />,
    onSelect: onClone,
  })
  if (onCopy) items.push({
    label: copied ? 'Copied' : 'Copy code',
    icon: <Copy {...controlIcon} className="text-zinc-500" aria-hidden />,
    disabled: compileBroken,
    onSelect: onCopy,
  })
  if (onDownload) items.push({
    label: 'Download .epe',
    icon: <Download {...controlIcon} className="text-zinc-500" aria-hidden />,
    disabled: compileBroken,
    onSelect: onDownload,
  })
  if (onDelete) items.push({
    label: 'Delete pattern',
    icon: <Trash2 {...controlIcon} className="text-red-400/70" aria-hidden />,
    onSelect: onDelete,
    danger: true,
    separatorBefore: true,
  })

  return <ActionsMenu label="Pattern actions" items={items} density={density} side={side} />
}
