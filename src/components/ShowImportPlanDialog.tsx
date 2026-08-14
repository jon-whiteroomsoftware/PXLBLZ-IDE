import { useRef, type ReactNode } from 'react'
import { Check, CircleX, Copy, FileCode2, Map, PanelsTopLeft, Plus, type LucideIcon } from 'lucide-react'
import type { ShowImportCopyPlanItem, ShowImportPlan, ShowImportPlanItem } from '@/engine/showImportPlan'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogRoot,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export type ShowImportDialogState =
  | { kind: 'plan'; plan: ShowImportPlan }
  | { kind: 'error'; message: string; entityId?: string }

export function ShowImportPlanDialog({
  state,
  busy = false,
  onCancel,
  onConfirm,
}: {
  state: ShowImportDialogState
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const confirmPendingRef = useRef(false)
  const handleOpenChange = (open: boolean) => {
    if (open) return
    if (confirmPendingRef.current) {
      confirmPendingRef.current = false
      return
    }
    if (!busy) onCancel()
  }
  if (state.kind === 'error') {
    return (
      <AlertDialogRoot open onOpenChange={handleOpenChange}>
        <AlertDialogContent className="max-w-[31.5rem]">
          <AlertDialogTitle>Can’t import this file</AlertDialogTitle>
          <AlertDialogDescription className="flex items-start gap-2 leading-relaxed text-zinc-300">
            <CircleX size={16} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
            <span><ErrorMessage message={state.message} entityId={state.entityId} /></span>
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogRoot>
    )
  }

  const { plan } = state
  const mapCount = plan.maps.reused.length + plan.maps.added.length + plan.maps.copied.length
  return (
    <AlertDialogRoot open onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-[31.5rem]">
        <AlertDialogTitle>{`Import “${plan.bundle.show.name}”`}</AlertDialogTitle>
        <AlertDialogDescription className="sr-only">
          Review the Show, Pattern, and Map changes before importing this file.
        </AlertDialogDescription>
        <div className="grid gap-3.5 pt-4">
          <PlanSection icon={PanelsTopLeft} label="Shows">
            <PlanRow state="add" label="Will be added">
              {plan.show.name}
            </PlanRow>
          </PlanSection>
          <PlanSection icon={FileCode2} label="Patterns">
            <GroupedExistingRows items={[...plan.patterns.builtIn, ...plan.patterns.reused]} />
            {plan.patterns.added.map((item) => (
              <PlanRow key={item.id} state="add" label="Will be added">{item.name}</PlanRow>
            ))}
            {plan.patterns.copied.map((item) => <CopyRow key={item.id} item={item} />)}
          </PlanSection>
          {mapCount > 0 && (
            <PlanSection icon={Map} label="Maps">
              <GroupedExistingRows items={plan.maps.reused} />
              {plan.maps.added.map((item) => (
                <PlanRow key={item.id} state="add" label="Will be added">{item.name}</PlanRow>
              ))}
              {plan.maps.copied.map((item) => <CopyRow key={item.id} item={item} />)}
            </PlanSection>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={() => {
            confirmPendingRef.current = true
            onConfirm()
          }}>
            {busy ? 'Importing' : 'Import Show'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  )
}

function ErrorMessage({ message, entityId }: { message: string; entityId?: string }) {
  if (!entityId) return message
  const index = message.indexOf(entityId)
  if (index < 0) return message
  return (
    <>
      {message.slice(0, index)}
      <code className="font-mono text-[0.8125rem]">{entityId}</code>
      {message.slice(index + entityId.length)}
    </>
  )
}

function PlanSection({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-zinc-400">
        <Icon size={14} aria-hidden />
        {label}
      </h3>
      {children}
    </section>
  )
}

function GroupedExistingRows({ items }: { items: ShowImportPlanItem[] }) {
  if (items.length === 0) return null
  return (
    <PlanRow state="existing" label="Already in your library">
      {items.map((item) => item.name).join(' · ')}
    </PlanRow>
  )
}

function CopyRow({ item }: { item: ShowImportCopyPlanItem }) {
  return (
    <PlanRow state="copy" label="Differs from your copy; will be added under a new name">
      {item.name}{' '}
      <span className="text-zinc-400">
        differs from yours → <strong className="font-semibold text-live">{item.targetName}</strong>
      </span>
    </PlanRow>
  )
}

function PlanRow({
  state,
  label,
  children,
}: {
  state: 'add' | 'existing' | 'copy'
  label: string
  children: ReactNode
}) {
  const Icon = state === 'add' ? Plus : state === 'existing' ? Check : Copy
  const color = state === 'add' ? 'text-emerald-400' : state === 'copy' ? 'text-live' : 'text-zinc-400'
  return (
    <div className="flex items-start gap-2.5 py-1 pl-[1.35rem] text-sm text-zinc-100">
      <Icon
        size={16}
        strokeWidth={2.4}
        className={`mt-0.5 shrink-0 ${color}`}
        role="img"
        aria-label={label}
      />
      <span className="min-w-0">{children}</span>
    </div>
  )
}
