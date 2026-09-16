import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { appearancePatchFromDirtyFields, buildShowV2AppearanceEditorModel, createShowV2AppearanceTarget, showV2AppearanceEffectTargets,
  type ShowV2AppearanceDirtyFields, type ShowV2AppearanceScope, type ShowV2AuthoredValue } from '@/engine/showV2AppearanceEditorModel'
import { buildShowToolkitPresentationCatalogue } from '@/engine/showVisualToolkitPresentation'
import { createShowClipEffect } from '@/engine/showEffectAuthoring'
import type { ShowClipAppearanceEditIntentV2 } from '@/engine/showClipAppearanceEditsV2'
import { admitShowV2PilotAppearanceEdit, type ShowV2PilotAdoptionReceipt, type ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'

const fieldStyle = 'mt-1 block w-full min-w-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200'
const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
function display(value: ShowV2AuthoredValue<unknown> | undefined): string { return value?.kind === 'uniform' ? String(value.value) : '' }
type Operation = ShowClipAppearanceEditIntentV2 extends infer Intent ? Intent extends ShowClipAppearanceEditIntentV2
  ? Omit<Intent, 'clipId' | 'scope' | 'atMs' | 'keyIdentity'> : never : never

export function ShowV2AppearanceEditor({ clipId, capture, isCurrentCapture, isCurrentCompletion, onStatus }: {
  clipId: string; capture: ShowV2PilotPreparedCapture; isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const record = capture.record
  const [scope, setScope] = useState<ShowV2AppearanceScope | ''>(''), [time, setTime] = useState('')
  const [dirty, setDirty] = useState<ShowV2AppearanceDirtyFields>({}), [busy, setBusy] = useState(false)
  const [newEffectKind, setNewEffectKind] = useState(''), [effectId, setEffectId] = useState(''), [parameterId, setParameterId] = useState('')
  const [parameterValue, setParameterValue] = useState<string | null>(null), [targetId, setTargetId] = useState(''), [edge, setEdge] = useState<'before' | 'after' | ''>('')
  const pending = useRef(false), live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const [draftContext, setDraftContext] = useState({ record, clipId, scope, time })
  if (draftContext.record !== record || draftContext.clipId !== clipId || draftContext.scope !== scope || draftContext.time !== time) {
    setDraftContext({ record, clipId, scope, time }); setDirty({}); setParameterValue(null); setTargetId('')
  }
  const atMs = time.trim() ? Number(time) : NaN
  const model = scope ? buildShowV2AppearanceEditorModel(record, clipId, scope, atMs) : null
  const source = model?.effects.find(value => value.effect.id === effectId)
  const parameter = source?.parameters.find(value => value.descriptor.id === parameterId)
  const targets = model ? showV2AppearanceEffectTargets(model.effects, effectId) : []
  const target = targets.find(value => value.effect.id === targetId)
  const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: capture.prepared.status === 'ready' ? capture.prepared.bundle.presentation.stageDimension : 2 })
    .filter(item => item.kind === 'effect' && item.authoringTarget === 'effect-stack')
  const available = !busy && model !== null && capture.prepared.status === 'ready'
  const resetDirty = () => { setDirty({}); setParameterValue(null) }
  const submit = async (operation: Operation) => {
    if (pending.current || !live.current) return
    const plan = createShowV2AppearanceTarget(record, clipId, scope, time, newPersonalContentId)
    if (plan.status === 'refused') { if (isCurrentCapture()) onStatus(plan.message); return }
    pending.current = true; setBusy(true)
    const adoption: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await admitShowV2PilotAppearanceEdit({ showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
        capture, intent: { ...plan.target, ...operation } as ShowClipAppearanceEditIntentV2,
        isCurrent: () => live.current && isCurrentCapture(), onAdopted: receipt => { adoption.current = receipt } })
      const current = outcome.status === 'applied' ? adoption.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adoption.current, 'saved') : isCurrentCapture()
      if (live.current && current) {
        resetDirty()
        onStatus(outcome.status === 'refused' ? outcome.message : outcome.status === 'unchanged' ? 'Appearance is unchanged.' : 'Appearance saved.')
      }
    } catch (error) {
      const current = adoption.current ? isCurrentCompletion(adoption.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) { resetDirty(); onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.') }
    } finally { pending.current = false; if (live.current) setBusy(false) }
  }
  return <section aria-label="Clip appearance" className="mt-7 space-y-3">
    <h2 className="text-sm font-medium text-zinc-200">Appearance</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-zinc-400">Apply to<select aria-label="Appearance scope" className={fieldStyle} value={scope} disabled={busy} onChange={event => setScope(event.target.value as ShowV2AppearanceScope | '')}>
        <option value="">Choose scope</option><option value="whole-clip">Whole Clip</option><option value="selected-time">Selected time</option>
      </select></label>
      {scope === 'selected-time' && <label className="text-xs text-zinc-400">At (ms)<input aria-label="Appearance time" className={fieldStyle} type="text" inputMode="numeric" value={time} disabled={busy} onChange={event => setTime(event.target.value)} /></label>}
    </div>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (available) void submit({ kind: 'appearance', patch: appearancePatchFromDirtyFields(dirty) }) }}>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['opacity', 'brightness', 'phase'] as const).map(field => <label key={field} className="text-xs text-zinc-400">{field === 'opacity' ? 'Opacity' : field === 'brightness' ? 'Brightness' : 'Phase'}
          <input aria-label={field === 'opacity' ? 'Clip opacity' : field === 'brightness' ? 'View brightness' : 'View phase'} className={fieldStyle} type="text" inputMode="decimal" disabled={!available}
            value={dirty[field] ?? display(model?.fields[field])} placeholder={model?.fields[field].kind === 'mixed' ? 'Mixed' : undefined}
            onChange={event => setDirty(value => ({ ...value, [field]: event.target.value }))} />
        </label>)}
        <label className="text-xs text-zinc-400">Mirror<select aria-label="Clip mirror" className={fieldStyle} disabled={!available} value={dirty.mirror ?? display(model?.fields.mirror)} onChange={event => setDirty(value => ({ ...value, mirror: event.target.value }))}>
          <option value="" disabled>{model?.fields.mirror.kind === 'mixed' ? 'Mixed' : 'Choose mirror'}</option><option value="false">Off</option><option value="true">On</option>
        </select></label>
      </div>
      <div className="flex flex-wrap gap-2"><Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available}>Apply appearance</Button>
        <Button type="button" size="xs" variant="outline" className={buttonStyle} disabled={busy || !Object.keys(dirty).length} onClick={resetDirty}>Reset appearance</Button></div>
    </form>
    <h3 className="pt-3 text-sm font-medium text-zinc-200">Effects</h3>
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (!available || pending.current) return
      const item = catalogue.find(item => item.key === newEffectKind)
      if (item?.compatible) void submit({ kind: 'add-effect', effect: createShowClipEffect(item, newPersonalContentId()) })
    }}>
      <label className="min-w-0 flex-1 text-xs text-zinc-400">New Effect<select aria-label="New Effect kind" className={fieldStyle} disabled={!available} value={newEffectKind} onChange={event => setNewEffectKind(event.target.value)}><option value="">Choose kind</option>{catalogue.map(item => <option key={item.key} value={item.key} disabled={!item.compatible}>{item.label}</option>)}</select></label>
      <Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available || !newEffectKind}>Add Effect</Button>
    </form>
    <label className="block text-xs text-zinc-400">Effect<select aria-label="Selected Effect" className={fieldStyle} disabled={!available} value={source?.effect.id ?? ''} onChange={event => { setEffectId(event.target.value); setParameterId(''); setParameterValue(null); setTargetId('') }}><option value="">Choose Effect</option>{model?.effects.map(({ effect }) => <option key={effect.id} value={effect.id}>{effect.kind} · {effect.id}</option>)}</select></label>
    {source && <>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (available && parameter && (parameter.descriptor.kind !== 'color' || parameterValue !== null)) {
        const raw = parameterValue ?? display(parameter.value)
        void submit({ kind: 'update-effect', effectId: source.effect.id, effectKind: source.effect.kind, parameter: parameter.descriptor.id,
          value: parameter.descriptor.kind === 'color' ? raw : raw.trim() ? Number(raw) : NaN })
      } }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">Parameter<select aria-label="Effect parameter" className={fieldStyle} disabled={busy} value={parameter?.descriptor.id ?? ''} onChange={event => { setParameterId(event.target.value); setParameterValue(null) }}><option value="">Choose parameter</option>{source.parameters.map(({ descriptor }) => <option key={descriptor.id} value={descriptor.id}>{descriptor.label}</option>)}</select></label>
          {parameter && <label className="text-xs text-zinc-400">Value<input aria-label="Effect value" className={fieldStyle} disabled={busy} type="text" inputMode={parameter.descriptor.kind === 'color' ? 'text' : 'decimal'}
            value={parameterValue ?? display(parameter.value)} placeholder={parameter.value.kind === 'mixed' ? 'Mixed' : undefined} onChange={event => setParameterValue(event.target.value)} /></label>}
        </div>
        <div className="flex flex-wrap gap-2"><Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available || !parameter || parameterValue === null && (parameter.descriptor.kind === 'color' || parameter.value.kind === 'mixed')}>Apply parameter</Button>
          <Button type="button" size="xs" variant="outline" className={buttonStyle} disabled={!available} onClick={() => { if (!pending.current) void submit({ kind: 'duplicate-effect', effectId: source.effect.id, effectKind: source.effect.kind, newEffectId: newPersonalContentId() }) }}>Duplicate Effect</Button></div>
      </form>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (available && target && edge) void submit({ kind: 'reorder-effect', effectId: source.effect.id, effectKind: source.effect.kind, targetEffectId: target.effect.id, targetEffectKind: target.effect.kind, edge }) }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">Place<select aria-label="Effect order edge" className={fieldStyle} disabled={busy} value={edge} onChange={event => setEdge(event.target.value as 'before' | 'after' | '')}><option value="">Choose position</option><option value="before">Before</option><option value="after">After</option></select></label>
          <label className="text-xs text-zinc-400">Target<select aria-label="Effect order target" className={fieldStyle} disabled={busy} value={target?.effect.id ?? ''} onChange={event => setTargetId(event.target.value)}><option value="">Choose target</option>{targets.map(({ effect }) => <option key={effect.id} value={effect.id}>{effect.kind} · {effect.id}</option>)}</select></label>
        </div>
        <Button type="submit" size="xs" variant="outline" className={buttonStyle} disabled={!available || !target || !edge}>Move Effect</Button>
      </form>
    </>}
  </section>
}
