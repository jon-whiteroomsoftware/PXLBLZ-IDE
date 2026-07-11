import { useState } from 'react'
import { AlertTriangle, Code2, FileCode2 } from 'lucide-react'
import type { TransformArtifactInspection } from '@/engine/transformInspection'
import { Button } from '@/components/ui/button'

export function TransformInspectionPanel({
  artifact,
  empty = 'No generated artifact has been recorded yet.',
}: {
  artifact: TransformArtifactInspection | null
  empty?: string
}) {
  const [artifactOpen, setArtifactOpen] = useState(false)
  if (!artifact) {
    return (
      <div className="border border-dashed border-zinc-700/80 bg-zinc-950/25 px-3 py-3 text-[11px] leading-relaxed text-zinc-500">
        {empty}
      </div>
    )
  }

  const summary = artifact.summary

  return (
    <div className="space-y-3">
      <div className="rounded border border-zinc-800 bg-zinc-950/35 px-3 py-3">
        <div className="flex items-start gap-2">
          <FileCode2 size={14} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-zinc-200">
              {artifact.patternName ?? 'Generated artifact'}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase text-zinc-600">
              {summary.passes.length} passes - beforeRender {summary.beforeRender} - cost +{summary.estimatedPixelCost}
            </div>
          </div>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="shrink-0 bg-zinc-900/80 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={() => setArtifactOpen(true)}
          >
            <Code2 size={13} aria-hidden />
            View generated artifact
          </Button>
        </div>

        {artifact.warnings.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {artifact.warnings.map((warning) => (
              <div
                key={`${warning.passId}:${warning.code}:${warning.message}`}
                className="flex gap-2 rounded border border-amber-500/35 bg-amber-950/25 px-2 py-1.5 text-[11px] text-amber-100"
              >
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
                <span>
                  <span className="font-mono text-amber-200">{warning.passId}</span>: {warning.message}
                </span>
              </div>
            ))}
          </div>
        )}

        <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
          <SummaryItem label="Call sites" value={formatRecord(summary.callSitesWrapped)} />
          <SummaryItem label="Bindings" value={summary.bindingsApplied.map((b) => `${b.target} (${b.mode})`).join(', ') || '-'} />
          <SummaryItem
            label="Render adapters"
            value={summary.rendererAdaptations.map(formatRendererAdaptation).join(', ') || '-'}
          />
          <SummaryItem label="Globals" value={summary.globalsAdded.join(', ') || '-'} />
          <SummaryItem label="Exports" value={summary.exportsAdded.join(', ') || '-'} />
        </dl>

        <div className="mt-3 border-t border-zinc-800/80 pt-2">
          <div className="font-mono text-[10px] uppercase text-zinc-600">Pass tree</div>
          <ol className="mt-1.5 space-y-1.5">
            {summary.passes.map((pass) => (
              <li key={pass.id} className="rounded bg-zinc-900/45 px-2 py-1.5 text-[11px] text-zinc-400">
                <span className="font-mono text-zinc-200">{pass.id}</span>
                <span className="ml-2 text-zinc-500">{pass.kind}</span>
                {pass.beforeRender && <span className="ml-2 text-zinc-500">beforeRender {pass.beforeRender}</span>}
                {pass.callSitesWrapped && (
                  <span className="ml-2 text-zinc-500">wraps {formatRecord(pass.callSitesWrapped)}</span>
                )}
                {pass.bindingsApplied?.map((binding) => (
                  <span key={`${pass.id}:${binding.target}`} className="ml-2 text-zinc-500">
                    binds {binding.target}
                  </span>
                ))}
                {pass.rendererAdaptation && (
                  <span className="ml-2 text-zinc-500">
                    adapts {formatRendererAdaptation(pass.rendererAdaptation)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {artifactOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Generated read-only artifact"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800 px-3">
              <Code2 size={15} className="text-zinc-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-zinc-200">Generated read-only artifact</div>
                <div className="text-[10px] uppercase text-zinc-600">Not editable source</div>
              </div>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="bg-zinc-900 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                onClick={() => setArtifactOpen(false)}
              >
                Close
              </Button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
              <code>{artifact.generatedSource}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase text-zinc-600">{label}</dt>
      <dd className="mt-0.5 truncate text-zinc-300" title={value}>{value}</dd>
    </div>
  )
}

function formatRecord(record: Record<string, number>): string {
  const entries = Object.entries(record)
  return entries.length ? entries.map(([key, value]) => `${key} x${value}`).join(', ') : '-'
}

function formatRendererAdaptation(
  adaptation: TransformArtifactInspection['summary']['rendererAdaptations'][number],
): string {
  const centered = adaptation.missingCoordinates
    .map((coordinate) => `${coordinate}=0.5`)
    .join(', ')
  return `${adaptation.adapterRenderer} -> ${adaptation.sourceRenderer}${centered ? ` (${centered})` : ''}`
}
