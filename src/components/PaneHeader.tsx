import { type ReactNode } from 'react'
import { IDE_MICROTYPE } from '@/components/ui/ideMicrotype'

export function PaneHeader({ children }: { children: ReactNode }) {
  return (
    <div className={`h-[calc(1.75rem+1px)] flex items-center px-3 border-b border-seam shrink-0 gap-2 font-mono text-structural bg-panel ${IDE_MICROTYPE.header.sizeClassName}`}>
      {children}
    </div>
  )
}
