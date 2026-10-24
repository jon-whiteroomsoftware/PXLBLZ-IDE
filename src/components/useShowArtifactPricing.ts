import { useEffect, useState } from 'react'
import {
  priceShowArtifact,
  sha256CompleteCompileInput,
  type ShowArtifactCompilationRecord,
  type ShowArtifactCompileContext,
} from '@/engine/showArtifactPricing'

export function useShowArtifactPricing(input: {
  source: string | null
  estimatedBytes: number
  context: ShowArtifactCompileContext | null
  measurement: ShowArtifactCompilationRecord | null
}): ReturnType<typeof priceShowArtifact> {
  const { source } = input
  const [resolved, setResolved] = useState<{ source: string; hash: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    if (source !== null) {
      void sha256CompleteCompileInput(source).then(
        (hash) => { if (!cancelled) setResolved({ source, hash }) },
        () => { if (!cancelled) setResolved(null) },
      )
    }
    return () => { cancelled = true }
  }, [source])
  return priceShowArtifact({
    ...input,
    sourceSha256: source !== null && resolved?.source === source ? resolved.hash : null,
  })
}
