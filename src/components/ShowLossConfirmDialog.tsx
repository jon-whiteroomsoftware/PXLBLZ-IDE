import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogRoot,
  AlertDialogTitle,
} from './ui/alert-dialog'

interface Props {
  open: boolean
  title: string
  description: string
  actionLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ShowLossConfirmDialog({ open, title, description, actionLabel, onConfirm, onCancel }: Props) {
  return <AlertDialogRoot open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel() }}>
    <AlertDialogContent>
      <AlertDialogTitle>{title}</AlertDialogTitle>
      <AlertDialogDescription>{description}</AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>{actionLabel}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialogRoot>
}
