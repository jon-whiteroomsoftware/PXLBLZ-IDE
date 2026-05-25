import { type ReactNode } from 'react'

export function PaneHeader({ children }: { children: ReactNode }) {
  return (
    <div className="h-9 flex items-center px-3 border-b border-zinc-800 shrink-0 gap-2 text-sm font-mono text-amber-500/60 bg-zinc-900">
      {children}
    </div>
  )
}
