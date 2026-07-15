import { FileCode2 } from 'lucide-react'
import { readMixinHeader, STOCK_MIXIN_ITEMS } from '@/engine/mixins'
import { selectTransformArtifactInspection } from '@/engine/transformInspection'
import { activePushKey, usePatternStore } from '@/store/patternStore'
import { useControllerStore } from '@/store/controllerStore'
import { useEditorStore } from '@/store/editorStore'
import { useMixinStore } from '@/store/mixinStore'
import { TransformInspectionPanel } from './TransformInspectionPanel'

export function MixinProvenancePane() {
  const source = useEditorStore((s) => s.source)
  const editingMixin = useMixinStore((s) => s.editingMixin)
  const userMixins = useMixinStore((s) => s.userMixins)
  const activeIp = useControllerStore((s) => s.activeIp)
  const patternId = usePatternStore(activePushKey)
  const artifact = useControllerStore((s) =>
    selectTransformArtifactInspection(s.lastTransformArtifacts, activeIp, patternId),
  )
  const openRecord =
    editingMixin?.kind === 'existing' ? userMixins.find((m) => m.id === editingMixin.id) : undefined
  const stockRecord =
    editingMixin?.kind === 'stock' ? STOCK_MIXIN_ITEMS.find((m) => m.id === editingMixin.id) : undefined
  const name = openRecord?.name ?? stockRecord?.name ?? 'Mixin'
  const kind = openRecord?.kind ?? stockRecord?.kind
  const header = readMixinHeader(source)

  return (
    <div className="flex h-full flex-col border-l border-seam bg-panel/70">
      <div className="border-b border-seam px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <FileCode2 size={14} className="text-zinc-500" aria-hidden />
          <span className="truncate">{name}</span>
        </div>
        {kind && <div className="mt-1 text-[10px] uppercase tracking-wide text-structural">{kind} mixin</div>}
      </div>

      <div className="rail-list-scroll flex-1 overflow-y-auto px-3 py-3 text-xs">
        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-zinc-500">Header</h3>
          <div className="mt-2 space-y-1.5 text-[11px] text-zinc-400">
            <div className="flex gap-2">
              <span className="w-12 shrink-0 text-zinc-500">target</span>
              <span className="min-w-0 truncate text-zinc-300">{header.target || '-'}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-12 shrink-0 text-zinc-500">wraps</span>
              <span className="min-w-0 truncate text-zinc-300">{header.wraps || '-'}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-12 shrink-0 text-zinc-500">params</span>
              <span className="min-w-0 truncate text-zinc-300">
                {header.params.length ? header.params.map((param) => param.name).join(', ') : '-'}
              </span>
            </div>
          </div>
        </section>

        <section className="mt-5">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-zinc-500">Used by</h3>
          <div className="mt-2 border border-dashed border-zinc-700/80 bg-zinc-950/25 px-3 py-3 text-[11px] leading-relaxed text-zinc-500">
            No Controller or Show bindings use this mixin yet.
          </div>
        </section>

        <section className="mt-5">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-zinc-500">Last transform summary</h3>
          <div className="mt-2">
            <TransformInspectionPanel
              artifact={artifact}
              empty="No generated artifact has been recorded for this mixin yet."
            />
          </div>
        </section>

        <p className="mt-5 text-[11px] leading-relaxed text-structural">
          Parameters are bound on the Controller or Show that uses this mixin; the source stays generic and portable.
        </p>
      </div>
    </div>
  )
}
