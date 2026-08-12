import { useLayoutEffect } from 'react'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogRoot,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  cancelNavigationPreflight,
  continueNavigationPreflight,
  installNavigationPreflight,
  useNavigationPreflightStore,
} from '@/store/navigationPreflightStore'

export function NavigationPreflightDialog() {
  const pending = useNavigationPreflightStore((state) => state.pending)

  useLayoutEffect(() => installNavigationPreflight(), [])

  return (
    <AlertDialogRoot
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) cancelNavigationPreflight()
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle>Discard broken source?</AlertDialogTitle>
        <AlertDialogDescription>
          &quot;{pending?.draft.name}&quot; has source errors and cannot be saved.
          Discard the broken source and continue?
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="border-red-800 text-red-300 hover:bg-red-950/40"
            onClick={continueNavigationPreflight}
          >
            Discard and continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  )
}
