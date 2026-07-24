import { Fragment, useEffect, useState } from 'react'
import type React from 'react'
import { useNumberFieldDraft } from '@/components/ui/number-field'
import { PercentageField as UiPercentageField } from '@/components/ui/percentage-field'
import {
  Download,
  Map as MapIcon,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IDE_MICROTYPE } from '@/components/ui/ideMicrotype'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  analogPinsForBoard,
  CONTROLLER_OUTPUT_PROFILE_LABELS,
  CONTROLLER_OUTPUT_PROFILES,
  controllerZonePixelCount,
  formatControllerZoneRanges,
  parseControllerZoneRanges,
  patternBindingOverridesHardwareBrightness,
  validateControllerProfile,
  type ControllerBindingTarget,
  type ControllerInput,
  type ControllerInputRole,
  type ControllerInputSignal,
  type ControllerOutputProfile,
  type ControllerProfile,
  type PowerCapTransform,
  type ControllerZone,
  type ControllerZoneRange,
  type GlobalTransform,
  type PatternBinding,
} from '@/engine/controllerProfile'
import { describeControllerPill } from '@/engine/controllerPillView'
import type { ControllerStatusTone } from '@/engine/controllerStatusView'
import {
  createImportedControllerMapRecord,
  summarizeControllerMapImport,
  type ControllerMapImportSummary,
} from '@/engine/importedMap'
import {
  buildStudioMapFingerprintCandidates,
  mapDataHash,
  matchInstalledMapFingerprint,
  type MapFingerprintMatch,
} from '@/engine/mapFingerprint'
import { decodeMapData } from '@/engine/mapPush'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import type { BindingStore } from '@/engine/controllerBinding'
import { getControllerBindings } from '@/engine/controllerMetadataStorage'
import { installedControllerPatternChoices } from '@/engine/controllerSavedPrograms'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { uniquePatternName } from '@/engine/patternName'
import {
  derivedPowerCapSettings,
  directPowerCapSettings,
  estimatePowerCapAmps,
  powerCapElectricalInputs,
  withPowerCapMilliamps,
  type PowerCapSettings,
} from '@/engine/powerCap'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { controllerForProfile } from '@/engine/controllerProfileConnection'
import { selectTransformArtifactInspection } from '@/engine/transformInspection'
import { useControllerStore, type ControllerEntry } from '@/store/controllerStore'
import {
  CONTROLLER_INPUT_ROLES,
  CONTROLLER_INPUT_SIGNALS,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { useMapStore } from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { useRouterStore } from '@/store/routerStore'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { StatusDot, type StatusTone } from './StatusDot'
import { TransformInspectionPanel } from './TransformInspectionPanel'

const fieldClass =
  'h-7 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'
const tableHeadClass = 'px-2 py-1 text-left text-[10px] font-semibold uppercase text-zinc-500'
const tableCellClass = 'border-t border-zinc-800/85 px-2 py-1.5 align-middle'
const EMPTY_CONTROLLER_PROGRAMS: ProgramListEntry[] = []

type SelectOption<T extends string | number> = {
  value: T
  label: string
}

function formatMaybe(value: string | number | undefined | null, fallback = 'Unknown') {
  return value === undefined || value === null || value === '' ? fallback : String(value)
}

function formatMapDim(dim: 1 | 2 | 3 | undefined) {
  return dim ? `${dim}D` : 'Unknown'
}

function formatGridDims(dims: ControllerMapImportSummary['gridDims']) {
  if (!dims) return 'irregular'
  return dims.depth === undefined
    ? `${dims.cols} x ${dims.rows}`
    : `${dims.cols} x ${dims.rows} x ${dims.depth}`
}

const PROFILE_STATUS_TONE: Record<ControllerStatusTone, StatusTone> = {
  absent: 'absent',
  idle: 'idle',
  pending: 'connecting',
  live: 'ok',
  error: 'error',
}

function profileStatusLabel(entry: ControllerEntry | null) {
  if (!entry) return 'Offline'
  if (entry.phase === 'pending') return 'Trying to connect'
  if (entry.phase === 'error') return 'Connect failed'
  return 'Connected'
}

function targetForKind(kind: ControllerBindingTarget['kind'], current?: ControllerBindingTarget): ControllerBindingTarget {
  if (kind === 'assign-variable') {
    return {
      kind,
      name: current?.name || 'speed',
      min: current?.kind === 'assign-variable' ? current.min : 0,
      max: current?.kind === 'assign-variable' ? current.max : 1,
      ...(current?.kind === 'assign-variable' && current.quantize ? { quantize: current.quantize } : {}),
    }
  }
  return {
    kind,
    name: current?.name || (kind === 'call-function' ? 'beforeRender' : 'sliderSpeed'),
  }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] uppercase tracking-wide text-zinc-500">{children}</span>
}

function stopFieldPropagation(event: React.SyntheticEvent) {
  event.stopPropagation()
}

function TextField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}) {
  return (
    <input
      aria-label={ariaLabel}
      value={value}
      onClick={stopFieldPropagation}
      onPointerDown={stopFieldPropagation}
      onKeyDown={stopFieldPropagation}
      onChange={(event) => onChange(event.target.value)}
      className={fieldClass}
    />
  )
}

function NumberField({
  value,
  onChange,
  ariaLabel,
  min,
  max,
  step = 1,
}: {
  value: number
  onChange: (value: number) => void
  ariaLabel: string
  min?: number
  max?: number
  step?: number
}) {
  const { inputProps } = useNumberFieldDraft({ value, min, max, onChange })

  return (
    <input
      aria-label={ariaLabel}
      type="number"
      min={min}
      max={max}
      step={step}
      onClick={stopFieldPropagation}
      onPointerDown={stopFieldPropagation}
      {...inputProps}
      onKeyDown={(event) => {
        stopFieldPropagation(event)
        inputProps.onKeyDown(event)
      }}
      className={`${fieldClass} tabular-nums`}
    />
  )
}

function PercentageField({
  value,
  onChange,
  ariaLabel,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  value: number
  onChange: (value: number) => void
  ariaLabel: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <div onClick={stopFieldPropagation} onPointerDown={stopFieldPropagation} onKeyDown={stopFieldPropagation}>
      <UiPercentageField
        label={ariaLabel}
        ariaLabel={ariaLabel}
        hideLabel
        variant="editor"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
      />
    </div>
  )
}

function SelectField<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  disabled?: boolean
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onClick={stopFieldPropagation}
      onPointerDown={stopFieldPropagation}
      onKeyDown={stopFieldPropagation}
      onChange={(event) => {
        const raw = event.target.value
        const sample = options[0]?.value
        onChange((typeof sample === 'number' ? Number(raw) : raw) as T)
      }}
      className={`${fieldClass} disabled:opacity-40`}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-seam px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wide text-zinc-300">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-zinc-700/80 bg-zinc-950/30 px-3 py-3 text-xs text-zinc-500">
      {children}
    </div>
  )
}

function ProfileStatus({
  profile,
  controller,
  onRefresh,
  onImportMap,
  importingMap,
  onDeclareOutputProfile,
}: {
  profile: ControllerProfile
  controller: ControllerEntry | null
  onRefresh: () => void
  onImportMap: () => void
  importingMap: boolean
  onDeclareOutputProfile: (outputProfile: ControllerOutputProfile) => void
}) {
  const status = controller ? describeControllerPill(controller) : null
  const statusTone = status?.tone ? PROFILE_STATUS_TONE[status.tone] : 'absent'
  const refreshable = controller?.phase === 'live'
  return (
    <div className="border-b border-seam bg-zinc-950/35 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="flex items-center gap-2 font-mono text-zinc-200">
          <StatusDot tone={statusTone} testId="controller-profile-status-dot" />
          {profileStatusLabel(controller)}
        </span>
        <span>
          <FieldLabel>Device</FieldLabel>{' '}
          <span className="text-zinc-300">{formatMaybe(profile.lastKnownDeviceName, 'Unclaimed')}</span>
        </span>
        <span>
          <FieldLabel>IP</FieldLabel>{' '}
          <span className="font-mono text-zinc-300">{controller?.ip ?? formatMaybe(profile.lastSeenIp)}</span>
        </span>
        <span>
          <FieldLabel>Pixels</FieldLabel>{' '}
          <span className="font-mono text-zinc-300">{formatMaybe(profile.lastKnownPixelCount)}</span>
        </span>
        <span>
          <FieldLabel>Map</FieldLabel>{' '}
          <span className="font-mono text-zinc-300">{formatMapDim(profile.lastKnownMapDim)}</span>
        </span>
        <span>
          <FieldLabel>Firmware</FieldLabel>{' '}
          <span className="font-mono text-zinc-300">{formatMaybe(profile.board.firmwareVersion)}</span>
        </span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="ml-auto bg-zinc-900/70 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-35"
          disabled={!refreshable}
          onClick={onRefresh}
          title="Refresh controller metadata"
        >
          <RefreshCw size={13} aria-hidden />
          Refresh
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="bg-zinc-900/70 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-35"
          disabled={!refreshable || importingMap}
          onClick={onImportMap}
          title="Import installed pixel map"
        >
          <Download size={13} aria-hidden />
          {importingMap ? 'Reading' : 'Import map'}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <label className="flex items-center gap-2">
          <FieldLabel>Output</FieldLabel>
          <SelectField
            ariaLabel="Declared output profile"
            value={profile.outputProfile ?? 'native-serial'}
            options={CONTROLLER_OUTPUT_PROFILES.map((value) => ({
              value,
              label: CONTROLLER_OUTPUT_PROFILE_LABELS[value],
            }))}
            onChange={(value) => onDeclareOutputProfile(value)}
          />
        </label>
        <span className="text-[11px] text-zinc-500">
          Your declaration - the device cannot report or verify output wiring.
        </span>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Live controller controls stay in the top bar dropdown.
      </p>
    </div>
  )
}

interface PendingMapImport {
  points: number[][]
  summary: ControllerMapImportSummary
  defaultName: string
  controllerName: string
  deviceId?: string | null
  ip?: string | null
  mapHash?: string
  match?: MapFingerprintMatch
}

function ImportMapDialog({
  pending,
  name,
  onNameChange,
  onCancel,
  onConfirm,
}: {
  pending: PendingMapImport | null
  name: string
  onNameChange: (name: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!pending) return null
  const trimmed = name.trim()
  const match = pending.match
  return (
    <AlertDialogRoot open onOpenChange={(open) => { if (!open) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogTitle>{match ? 'Open matching Studio map?' : 'Import controller map?'}</AlertDialogTitle>
        <AlertDialogDescription>
          {match
            ? `The installed pixel map from ${pending.controllerName} matches "${match.name}".`
            : `Save the installed pixel map from ${pending.controllerName} as a frozen user map.`}
        </AlertDialogDescription>
        <div className="mt-4 space-y-3">
          {!match && (
            <label className="block text-xs text-zinc-400">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">Map name</span>
              <input
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                className={`${fieldClass} w-full`}
                aria-label="Imported map name"
              />
            </label>
          )}
          <div className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2 font-mono text-[11px] text-zinc-400">
            <div className="flex items-center gap-2 text-zinc-300">
              <MapIcon size={13} aria-hidden />
              {pending.summary.pixelCount} px / {pending.summary.dim}D / {formatGridDims(pending.summary.gridDims)}
            </div>
            <div className="mt-1 text-zinc-500">Source device: {pending.controllerName}</div>
            {pending.deviceId && <div className="text-zinc-500">Device ID: {pending.deviceId}</div>}
            {match && (
              <div className="mt-1 text-live">
                Match: {match.name} ({match.kind === 'stock' ? 'stock' : 'user'} map)
              </div>
            )}
          </div>
          {!match && (
            <p className="text-[11px] leading-5 text-zinc-500">
              Pixelblaze UI maps are fill-normalized per axis when read from the device; aspect may differ from maps pushed by this IDE.
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!match && trimmed.length === 0} onClick={onConfirm}>
            {match ? 'Open map' : 'Import map'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogRoot>
  )
}

function InputsTable({
  profile,
  onUpdateInput,
  onRemoveInput,
}: {
  profile: ControllerProfile
  onUpdateInput: (inputId: string, changes: Partial<ControllerInput>) => void
  onRemoveInput: (inputId: string) => void
}) {
  const analogPins = analogPinsForBoard(profile.board)
  const pinOptions: SelectOption<number>[] = [0, 25, 26, 33, 34, 35, 36, 39].map((pin) => ({
    value: pin,
    label: `IO${pin}`,
  }))
  const signalOptions: SelectOption<ControllerInputSignal>[] = CONTROLLER_INPUT_SIGNALS.map((signal) => ({
    value: signal,
    label: signal,
  }))
  const roleOptions: SelectOption<ControllerInputRole>[] = CONTROLLER_INPUT_ROLES.map((role) => ({
    value: role,
    label: role,
  }))

  if (profile.inputs.length === 0) {
    return <EmptyState>No hardware inputs have been assigned to this controller profile.</EmptyState>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-xs">
        <thead>
          <tr>
            <th className={tableHeadClass}>Name</th>
            <th className={tableHeadClass}>Pin</th>
            <th className={tableHeadClass}>Signal</th>
            <th className={tableHeadClass}>Role</th>
            <th className={tableHeadClass}>Smoothing</th>
            <th className={tableHeadClass}>Fallback</th>
            <th className={tableHeadClass}>Direction</th>
            <th className={tableHeadClass}>Live</th>
            <th className={tableHeadClass} />
          </tr>
        </thead>
        <tbody>
          {profile.inputs.map((input) => {
            const pinWarn = input.signal === 'analog' && !analogPins.includes(input.pin)
            return (
              <tr key={input.id}>
                <td className={tableCellClass}>
                  <TextField
                    ariaLabel={`${input.name} input name`}
                    value={input.name}
                    onChange={(name) => onUpdateInput(input.id, { name })}
                  />
                </td>
                <td className={tableCellClass}>
                  <div className="flex items-center gap-2">
                    <SelectField
                      ariaLabel={`${input.name} pin`}
                      value={input.pin}
                      options={pinOptions}
                      onChange={(pin) => onUpdateInput(input.id, { pin })}
                    />
                    {pinWarn && (
                      <span className="whitespace-nowrap text-[10px] text-amber-300">
                        analog unavailable
                      </span>
                    )}
                  </div>
                </td>
                <td className={tableCellClass}>
                  <SelectField
                    ariaLabel={`${input.name} signal`}
                    value={input.signal}
                    options={signalOptions}
                    onChange={(signal) => onUpdateInput(input.id, { signal })}
                  />
                </td>
                <td className={tableCellClass}>
                  <SelectField
                    ariaLabel={`${input.name} role`}
                    value={input.role}
                    options={roleOptions}
                    onChange={(role) => onUpdateInput(input.id, { role })}
                  />
                </td>
                <td className={tableCellClass}>
                  <PercentageField
                    ariaLabel={`${input.name} smoothing`}
                    min={0}
                    max={1}
                    step={0.01}
                    value={input.smoothing}
                    onChange={(smoothing) => onUpdateInput(input.id, { smoothing })}
                  />
                </td>
                <td className={tableCellClass}>
                  <PercentageField
                    ariaLabel={`${input.name} fallback`}
                    min={0}
                    max={1}
                    step={0.01}
                    value={input.fallback}
                    onChange={(fallback) => onUpdateInput(input.id, { fallback })}
                  />
                </td>
                <td className={tableCellClass}>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="font-mono text-zinc-300">
                      {input.invert ? '1 → 0' : '0 → 1'}
                    </span>
                    <label
                      className="flex cursor-pointer items-center gap-1.5 text-zinc-400"
                      title="Invert the normalized hardware input direction"
                    >
                      <input
                        type="checkbox"
                        aria-label={`${input.name} invert`}
                        checked={input.invert}
                        onChange={(event) => onUpdateInput(input.id, { invert: event.target.checked })}
                        className="accent-live"
                      />
                      <span>Invert</span>
                    </label>
                  </div>
                </td>
                <td className={`${tableCellClass} font-mono text-zinc-600`}>-</td>
                <td className={tableCellClass}>
                  <button
                    type="button"
                    aria-label={`Remove ${input.name}`}
                    title="Remove input"
                    onClick={() => onRemoveInput(input.id)}
                    className="text-zinc-500 hover:text-red-300"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GlobalTransformsTable({
  profile,
  onUpdateTransforms,
  liveBrightness,
}: {
  profile: ControllerProfile
  onUpdateTransforms: (transforms: GlobalTransform[]) => void
  liveBrightness?: number | null
}) {
  function updateTransform(transformId: string, changes: Partial<GlobalTransform>) {
    onUpdateTransforms(profile.globalTransforms.map((transform) =>
      transform.id === transformId ? { ...transform, ...changes } as GlobalTransform : transform,
    ))
  }

  return (
    <div className="grid gap-2">
      <p className="border-l-2 border-live/35 bg-zinc-900/45 px-2.5 py-2 text-[11px] leading-4 text-zinc-400">
        Transforms take effect when a pattern is pushed. Push saved programs again after changing them.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-16" />
            <col className="w-24" />
            <col className="w-36" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th className={tableHeadClass}>Enabled</th>
              <th className={tableHeadClass}>Transform</th>
              <th className={tableHeadClass}>Mixin</th>
              <th className={tableHeadClass}>Input / settings</th>
            </tr>
          </thead>
          <tbody>
            {profile.globalTransforms.map((transform) => (
              <Fragment key={transform.id}>
                <tr>
                  <td className={tableCellClass}>
                    <input
                      type="checkbox"
                      aria-label={`${transform.type} enabled`}
                      checked={transform.enabled}
                      disabled={transform.type === 'hardware-brightness' && profile.inputs.length === 0}
                      onChange={(event) => updateTransform(transform.id, { enabled: event.target.checked })}
                      className="accent-live disabled:opacity-40"
                    />
                  </td>
                  <td className={`${tableCellClass} break-all font-mono text-zinc-300`}>{transform.type}</td>
                  <td className={`${tableCellClass} break-all font-mono text-zinc-500`}>{transform.mixinId}</td>
                  <td className={tableCellClass}>
                    {transform.type === 'hardware-brightness' ? (
                      <div className="grid gap-1.5">
                        <SelectField
                          ariaLabel="Hardware brightness input"
                          value={transform.inputId}
                          disabled={profile.inputs.length === 0}
                          options={[
                            { value: '', label: 'Choose input' },
                            ...profile.inputs.map((input) => ({ value: input.id, label: input.name })),
                          ]}
                          onChange={(inputId) => updateTransform(transform.id, { inputId })}
                        />
                        <p className="text-[10px] leading-4 text-zinc-500">
                          Samples this input once per frame and multiplies brightness for hsv() output.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-zinc-500">Configured below</span>
                        <p className="text-[10px] leading-4 text-zinc-500">
                          Limits estimated output duty for hsv() and rgb(). paint() output is not covered.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
                {transform.type === 'power-cap' && (
                  <tr>
                    <td colSpan={4} className="px-2 pb-2 pt-0">
                      <PowerCapEditor
                        transform={transform}
                        pixelCount={profile.lastKnownPixelCount ?? 256}
                        liveBrightness={liveBrightness}
                        onChange={(settings) => updateTransform(transform.id, settings)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PowerCapEditor({
  transform,
  pixelCount,
  liveBrightness,
  onChange,
}: {
  transform: PowerCapTransform
  pixelCount: number
  liveBrightness?: number | null
  onChange: (settings: PowerCapSettings) => void
}) {
  const electrical = powerCapElectricalInputs(transform, pixelCount, liveBrightness)
  const estimatedAmps = estimatePowerCapAmps(transform, pixelCount)

  function applyDerived(changes: Partial<Omit<typeof electrical, 'pixelCount'>> = {}) {
    onChange(derivedPowerCapSettings({ ...electrical, ...changes, pixelCount }))
  }

  function applyMilliampsPerPixel(milliampsPerPixel: number) {
    if (transform.mode === 'derived') {
      applyDerived({ milliampsPerPixel })
    } else {
      onChange(withPowerCapMilliamps(transform, milliampsPerPixel))
    }
  }

  const modeClass = (active: boolean) => [
    'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
    active
      ? 'border-amber-400/45 text-amber-300'
      : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
  ].join(' ')

  return (
    <div className="w-full min-w-0 max-w-[32rem] rounded border border-zinc-800 bg-zinc-950/70">
      <div className="flex flex-wrap gap-1.5 border-b border-zinc-800/80 px-3 py-2">
        <button
          type="button"
          aria-pressed={transform.mode === 'derived'}
          className={modeClass(transform.mode === 'derived')}
          onClick={() => applyDerived()}
        >
          From power budget
        </button>
        <button
          type="button"
          aria-pressed={transform.mode === 'direct'}
          className={modeClass(transform.mode === 'direct')}
          onClick={() => onChange(directPowerCapSettings(transform, transform.maxDuty))}
        >
          Set duty directly
        </button>
      </div>

      <div className="grid gap-2 px-3 py-2.5">
        <PowerCapField label="LED full-white current" unit="mA/px">
          <NumberField
            ariaLabel="LED full-white current"
            min={1}
            step={1}
            value={electrical.milliampsPerPixel}
            onChange={applyMilliampsPerPixel}
          />
        </PowerCapField>
      </div>

      {transform.mode === 'derived' ? (
        <div className="grid gap-2 border-t border-zinc-800/80 px-3 py-2.5">
          <PowerCapField
            label="controller brightness"
            hint={!transform.provenance && liveBrightness != null ? 'read from device' : undefined}
          >
            <PercentageField
              ariaLabel="Controller brightness percent"
              min={0}
              max={1}
              step={0.01}
              value={electrical.brightness}
              onChange={(brightness) => applyDerived({ brightness })}
            />
          </PowerCapField>
          <PowerCapField label="power budget" unit="A">
            <NumberField
              ariaLabel="Power budget amps"
              min={0}
              step={0.1}
              value={electrical.targetAmps}
              onChange={(targetAmps) => applyDerived({ targetAmps })}
            />
          </PowerCapField>
        </div>
      ) : (
        <div className="border-t border-zinc-800/80 px-3 py-2.5">
          <PowerCapField label="duty cap">
            <PercentageField
              ariaLabel="Power cap duty percent"
              min={0}
              max={1}
              step={0.01}
              value={transform.maxDuty}
              onChange={(maxDuty) => onChange(directPowerCapSettings(transform, maxDuty))}
            />
          </PowerCapField>
        </div>
      )}

      <div className="border-t border-zinc-800/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-500">
        <span className="block font-semibold text-amber-300">{Math.round(transform.maxDuty * 100)}% duty cap</span>
        {estimatedAmps != null && (
          <span className="block">≈ {estimatedAmps.toFixed(1)} A at the current {pixelCount} px</span>
        )}
      </div>
    </div>
  )
}

function PowerCapField({
  label,
  unit,
  hint,
  children,
}: {
  label: string
  unit?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_minmax(4rem,5.5rem)_auto] items-center gap-1.5">
      <span className="min-w-0 text-[10px] leading-tight text-zinc-500">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        {children}
        {unit && <span className="shrink-0 text-[10px] text-zinc-500">{unit}</span>}
      </span>
      {hint && <span className="col-span-full text-[10px] text-amber-300/80">⚡ {hint}</span>}
    </label>
  )
}

function PatternBindingsTable({
  profile,
  patternOptions,
  online,
  draftOpen,
  onAddBinding,
  onCancelDraft,
  onUpdateBinding,
  onRemoveBinding,
}: {
  profile: ControllerProfile
  patternOptions: SelectOption<string>[]
  online: boolean
  draftOpen: boolean
  onAddBinding: (patternId: string) => void
  onCancelDraft: () => void
  onUpdateBinding: (bindingId: string, changes: Partial<PatternBinding>) => void
  onRemoveBinding: (bindingId: string) => void
}) {
  if (profile.patternBindings.length === 0 && !draftOpen) {
    return <EmptyState>No pattern bindings are configured for this controller.</EmptyState>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-xs">
        <thead>
          <tr>
            <th className={tableHeadClass}>Pattern</th>
            <th className={tableHeadClass}>Input</th>
            <th className={tableHeadClass}>Target</th>
            <th className={tableHeadClass}>Name</th>
            <th className={tableHeadClass}>Range</th>
            <th className={tableHeadClass} />
          </tr>
        </thead>
        <tbody>
          {draftOpen && (
            <tr>
              <td className={tableCellClass}>
                <select
                  aria-label="New binding Pattern"
                  defaultValue=""
                  disabled={!online || patternOptions.length === 0}
                  onClick={stopFieldPropagation}
                  onPointerDown={stopFieldPropagation}
                  onKeyDown={stopFieldPropagation}
                  onChange={(event) => {
                    if (event.target.value) onAddBinding(event.target.value)
                  }}
                  className={`${fieldClass} w-full max-w-64 disabled:opacity-40`}
                >
                  <option value="">
                    {!online
                      ? 'Connect this controller to add a binding'
                      : patternOptions.length > 0
                      ? 'Choose an installed managed Pattern'
                      : 'No managed saved Patterns are installed'}
                  </option>
                  {patternOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </td>
              <td className={`${tableCellClass} text-zinc-500`}>
                {profile.inputs[0]?.name ?? '-'}
              </td>
              <td className={`${tableCellClass} text-zinc-500`}>exported slider</td>
              <td className={`${tableCellClass} font-mono text-zinc-500`}>sliderSpeed</td>
              <td className={`${tableCellClass} font-mono text-zinc-600`}>-</td>
              <td className={tableCellClass}>
                <button
                  type="button"
                  aria-label="Cancel new binding"
                  title="Cancel new binding"
                  onClick={onCancelDraft}
                  className="text-zinc-500 hover:text-red-300"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </td>
            </tr>
          )}
          {profile.patternBindings.map((binding) => (
            <tr key={binding.id}>
              <td className={tableCellClass}>
                <SelectField
                  ariaLabel="Binding Pattern"
                  value={binding.patternId}
                  options={patternOptions.some((option) => option.value === binding.patternId)
                    ? patternOptions
                    : [
                        { value: binding.patternId, label: `${binding.patternId} (not installed)` },
                        ...patternOptions,
                      ]}
                  onChange={(patternId) => onUpdateBinding(binding.id, { patternId })}
                  disabled={!online}
                />
              </td>
              <td className={tableCellClass}>
                <div className="flex items-center gap-2">
                  <SelectField
                    ariaLabel="Binding input"
                    value={binding.inputId}
                    options={profile.inputs.map((input) => ({ value: input.id, label: input.name }))}
                    onChange={(inputId) => onUpdateBinding(binding.id, { inputId })}
                  />
                  {patternBindingOverridesHardwareBrightness(profile, binding) && (
                    <span
                      title="This input controls the Pattern binding instead of hardware brightness while this Pattern runs."
                      className={`inline-flex whitespace-nowrap border border-zinc-700/80 bg-zinc-900/70 px-1.5 py-0.5 font-mono font-semibold uppercase tracking-wide text-zinc-400 ${IDE_MICROTYPE.required.sizeClassName}`}
                    >
                      Brightness override
                    </span>
                  )}
                </div>
              </td>
              <td className={tableCellClass}>
                <SelectField
                  ariaLabel="Binding target kind"
                  value={binding.target.kind}
                  options={[
                    { value: 'call-exported-slider', label: 'exported slider' },
                    { value: 'call-function', label: 'function' },
                    { value: 'assign-variable', label: 'variable' },
                  ]}
                  onChange={(kind) => onUpdateBinding(binding.id, { target: targetForKind(kind, binding.target) })}
                />
              </td>
              <td className={tableCellClass}>
                <TextField
                  ariaLabel="Binding target name"
                  value={binding.target.name}
                  onChange={(name) => onUpdateBinding(binding.id, { target: { ...binding.target, name } })}
                />
              </td>
              <td className={tableCellClass}>
                {binding.target.kind === 'assign-variable' ? (
                  <div className="grid grid-cols-3 gap-1">
                    <NumberField
                      ariaLabel="Binding minimum"
                      value={binding.target.min}
                      step={0.01}
                      onChange={(min) => {
                        if (binding.target.kind === 'assign-variable') {
                          onUpdateBinding(binding.id, { target: { ...binding.target, min } })
                        }
                      }}
                    />
                    <NumberField
                      ariaLabel="Binding maximum"
                      value={binding.target.max}
                      step={0.01}
                      onChange={(max) => {
                        if (binding.target.kind === 'assign-variable') {
                          onUpdateBinding(binding.id, { target: { ...binding.target, max } })
                        }
                      }}
                    />
                    <NumberField
                      ariaLabel="Binding quantize"
                      value={binding.target.quantize ?? 0}
                      step={0.01}
                      onChange={(quantize) => {
                        if (binding.target.kind === 'assign-variable') {
                          onUpdateBinding(binding.id, {
                            target: {
                              ...binding.target,
                              ...(quantize > 0 ? { quantize } : { quantize: undefined }),
                            },
                          })
                        }
                      }}
                    />
                  </div>
                ) : (
                  <span className="font-mono text-zinc-600">-</span>
                )}
              </td>
              <td className={tableCellClass}>
                <button
                  type="button"
                  aria-label="Remove binding"
                  title="Remove binding"
                  onClick={() => onRemoveBinding(binding.id)}
                  className="text-zinc-500 hover:text-red-300"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ZonesTable({
  profile,
  onUpdateZone,
  onRemoveZone,
}: {
  profile: ControllerProfile
  onUpdateZone: (zoneId: string, changes: Partial<ControllerZone>) => void
  onRemoveZone: (zoneId: string) => void
}) {
  if (profile.zones.length === 0) return <EmptyState>No zones have been defined for this controller.</EmptyState>

  return (
    <div className="space-y-3">
      <ZoneRibbon profile={profile} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr>
              <th className={tableHeadClass}>Zone</th>
              <th className={tableHeadClass}>Ranges</th>
              <th className={tableHeadClass}>Pixels</th>
              <th className={tableHeadClass} />
            </tr>
          </thead>
          <tbody>
            {profile.zones.map((zone) => (
              <tr key={zone.id}>
                <td className={tableCellClass}>
                  <TextField
                    ariaLabel={`${zone.name} zone name`}
                    value={zone.name}
                    onChange={(name) => onUpdateZone(zone.id, { name })}
                  />
                </td>
                <td className={tableCellClass}>
                  <RangesField
                    zone={zone}
                    onChange={(ranges) => onUpdateZone(zone.id, { ranges })}
                  />
                </td>
                <td className={`${tableCellClass} font-mono text-zinc-300`}>
                  {controllerZonePixelCount(zone)}
                </td>
                <td className={tableCellClass}>
                  <button
                    type="button"
                    aria-label={`Remove ${zone.name}`}
                    title="Remove zone"
                    onClick={() => onRemoveZone(zone.id)}
                    className="text-zinc-500 hover:text-red-300"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RangesField({
  zone,
  onChange,
}: {
  zone: ControllerZone
  onChange: (ranges: ControllerZoneRange[]) => void
}) {
  const formatted = formatControllerZoneRanges(zone)
  const [draftState, setDraftState] = useState<{
    source: string
    draft: string
    error: string | null
  }>({ source: formatted, draft: formatted, error: null })
  const draft = draftState.source === formatted ? draftState.draft : formatted
  const error = draftState.source === formatted ? draftState.error : null

  return (
    <div className="space-y-1">
      <input
        aria-label={`${zone.name} zone ranges`}
        value={draft}
        placeholder="0-63, 96-127"
        onChange={(event) => {
          const next = event.target.value
          const parsed = parseControllerZoneRanges(next)
          if (parsed.ok) {
            setDraftState({ source: formatted, draft: next, error: null })
            onChange(parsed.ranges)
          } else {
            setDraftState({ source: formatted, draft: next, error: parsed.message })
          }
        }}
        className={`${fieldClass} w-full font-mono tabular-nums ${error ? 'border-amber-400/70' : ''}`}
      />
      {error && <div className="text-[10px] text-amber-300">{error}</div>}
    </div>
  )
}

function ZoneRibbon({ profile }: { profile: ControllerProfile }) {
  const maxEnd = Math.max(
    0,
    ...profile.zones.flatMap((zone) => zone.ranges.map((range) => range.end)),
  )
  const totalPixels = profile.lastKnownPixelCount ?? maxEnd + 1
  if (totalPixels <= 0) return null

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900">
        {profile.zones.map((zone, index) => {
          const width = Math.max(1, (controllerZonePixelCount(zone) / totalPixels) * 100)
          return (
            <span
              key={zone.id}
              title={`${zone.name}: ${formatControllerZoneRanges(zone)}`}
              className={index % 3 === 0 ? 'bg-live/70' : index % 3 === 1 ? 'bg-ok/70' : 'bg-amber-400/70'}
              style={{ width: `${width}%` }}
            />
          )
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
        {profile.zones.map((zone) => (
          <span key={zone.id}>
            <span className="font-mono text-zinc-400">{zone.name}</span> {controllerZonePixelCount(zone)} px
          </span>
        ))}
      </div>
    </div>
  )
}

export function ControllerProfilePage({ profileId }: { profileId: string }) {
  const profiles = useControllerProfileStore((state) => state.profiles)
  const profilesLoaded = useControllerProfileStore((state) => state.profilesLoaded)
  const updateProfile = useControllerProfileStore((state) => state.updateProfile)
  const addInput = useControllerProfileStore((state) => state.addInput)
  const updateInput = useControllerProfileStore((state) => state.updateInput)
  const removeInput = useControllerProfileStore((state) => state.removeInput)
  const addZone = useControllerProfileStore((state) => state.addZone)
  const updateZone = useControllerProfileStore((state) => state.updateZone)
  const removeZone = useControllerProfileStore((state) => state.removeZone)
  const addPatternBinding = useControllerProfileStore((state) => state.addPatternBinding)
  const updatePatternBinding = useControllerProfileStore((state) => state.updatePatternBinding)
  const removePatternBinding = useControllerProfileStore((state) => state.removePatternBinding)
  const refreshLiveMetadata = useControllerProfileStore((state) => state.refreshLiveMetadata)
  const controllers = useControllerStore((state) => state.controllers)
  const activeIp = useControllerStore((state) => state.activeIp)
  const setActiveController = useControllerStore((state) => state.setActive)
  const transformArtifacts = useControllerStore((state) => state.lastTransformArtifacts)
  const userMaps = useMapStore((state) => state.userMaps)
  const addMap = useMapStore((state) => state.addMap)
  const openExistingMap = useMapStore((state) => state.openExistingMap)
  const openStockMap = useMapStore((state) => state.openStockMap)
  const navigate = useRouterStore((state) => state.navigate)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const profile = profiles.find((item) => item.id === profileId)
  const profileController = profile ? controllerForProfile(profile, controllers) : null
  const liveIp = profileController?.phase === 'live' ? profileController.ip : undefined
  const controllerPrograms = useControllerPanelStore((state) => (
    liveIp ? state.programsByController[liveIp] ?? EMPTY_CONTROLLER_PROGRAMS : EMPTY_CONTROLLER_PROGRAMS
  ))
  const profileRefreshId = profile?.id
  const [importingMap, setImportingMap] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingMapImport | null>(null)
  const [importName, setImportName] = useState('')
  const [liveBrightnessRead, setLiveBrightnessRead] = useState<{ ip: string; value: number } | null>(null)
  const [controllerBindingsRead, setControllerBindingsRead] = useState<{
    controllerId: string
    bindings: BindingStore
  } | null>(null)
  const [bindingDraftOpen, setBindingDraftOpen] = useState(false)
  const liveBrightness = liveBrightnessRead && liveBrightnessRead.ip === liveIp
    ? liveBrightnessRead.value
    : null

  useEffect(() => {
    if (profileRefreshId && liveIp) void refreshLiveMetadata(profileRefreshId)
  }, [liveIp, profileRefreshId, refreshLiveMetadata])

  useEffect(() => {
    let cancelled = false
    if (!liveIp || activeIp !== liveIp) return
    void getControllerProvider().getConfig()
      .then((config) => {
        if (!cancelled && typeof config.brightness === 'number') {
          setLiveBrightnessRead({ ip: liveIp, value: config.brightness })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeIp, liveIp])

  useEffect(() => {
    let cancelled = false
    if (!liveIp) return
    void getControllerBindings()
      .then((bindings) => {
        if (!cancelled) setControllerBindingsRead({ controllerId: liveIp, bindings })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [controllerPrograms, liveIp])

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-zinc-500">
        {profilesLoaded ? 'Controller profile not found.' : 'Loading controller profile...'}
      </div>
    )
  }

  const validation = validateControllerProfile(profile)
  const transformArtifact = selectTransformArtifactInspection(
    transformArtifacts,
    profileController?.ip ?? profile.lastSeenIp ?? null,
    null,
  )
  const installedBindingPatternOptions = liveIp
    ? installedControllerPatternChoices({
        controllerId: liveIp,
        programs: controllerPrograms,
        bindings: controllerBindingsRead?.controllerId === liveIp
          ? controllerBindingsRead.bindings
          : {},
      }).map((choice) => ({ value: choice.patternId, label: choice.name }))
    : []
  const localPatternNameById = new Map<string, string>([
    ...userPatterns.map((pattern) => [pattern.id, pattern.name] as const),
    ...Object.keys(DEMOS).map((name) => [`demo:${name}`, name] as const),
  ])
  const offlineBindingPatternOptions = [...new Set(profile.patternBindings.map((binding) => binding.patternId))]
    .map((patternId) => ({
      value: patternId,
      label: localPatternNameById.get(patternId) ?? `${patternId} (not installed)`,
    }))
  const bindingPatternOptions = liveIp
    ? installedBindingPatternOptions
    : offlineBindingPatternOptions

  async function beginMapImport() {
    if (!profile || profileController?.phase !== 'live') return
    setImportError(null)
    setImportingMap(true)
    try {
      if (activeIp !== profileController.ip) setActiveController(profileController.ip)
      const bytes = await getControllerProvider().getPixelMapData()
      const points = decodeMapData(bytes)
      if (!points || points.length === 0) {
        throw new Error('No installed pixel map was returned by this controller.')
      }
      const hash = bytes ? mapDataHash(bytes) : undefined
      const match = hash
        ? matchInstalledMapFingerprint({
            hash,
            profile,
            candidates: buildStudioMapFingerprintCandidates({
              userMaps,
              pixelCount: points.length,
            }),
          }) ?? undefined
        : undefined
      const controllerName =
        profile.lastKnownDeviceName ??
        profileController.nickname ??
        profile.name ??
        profileController.ip
      const defaultName = uniquePatternName(
        `${controllerName} map`,
        userMaps.map((map) => map.name),
      )
      setPendingImport({
        points,
        summary: summarizeControllerMapImport(points),
        defaultName,
        controllerName,
        deviceId: profile.deviceId ?? profileController.deviceId ?? null,
        ip: profileController.ip,
        mapHash: hash,
        match,
      })
      setImportName(defaultName)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import controller map.')
    } finally {
      setImportingMap(false)
    }
  }

  async function confirmMapImport() {
    if (!pendingImport) return
    if (pendingImport.match) {
      if (pendingImport.match.kind === 'stock') {
        openStockMap(pendingImport.match.id)
      } else {
        const record = userMaps.find((map) => map.id === pendingImport.match?.id)
        if (record) openExistingMap(record)
      }
      navigate({ kind: 'studio', entity: { kind: 'maps', id: pendingImport.match.id } })
      setPendingImport(null)
      setImportName('')
      return
    }
    const name = importName.trim() || pendingImport.defaultName
    const record = createImportedControllerMapRecord({
      id: newPersonalContentId(),
      name,
      points: pendingImport.points,
      controllerName: pendingImport.controllerName,
      deviceId: pendingImport.deviceId,
      ip: pendingImport.ip,
      mapHash: pendingImport.mapHash,
      importedAt: Date.now(),
    })
    await addMap(record)
    openExistingMap(record)
    navigate({ kind: 'studio', entity: { kind: 'maps', id: record.id } })
    setPendingImport(null)
    setImportName('')
  }

  return (
    <div data-testid="controller-profile-page" className="h-full overflow-y-auto bg-zinc-950 text-zinc-200">
      <ProfileStatus
        profile={profile}
        controller={profileController}
        onRefresh={() => void refreshLiveMetadata(profile.id)}
        onImportMap={() => void beginMapImport()}
        importingMap={importingMap}
        onDeclareOutputProfile={(outputProfile) => void updateProfile(profile.id, { outputProfile })}
      />
      {importError && (
        <div className="border-b border-red-500/30 bg-red-950/20 px-4 py-2 text-xs text-red-200">
          {importError}
        </div>
      )}
      <ImportMapDialog
        pending={pendingImport}
        name={importName}
        onNameChange={setImportName}
        onCancel={() => {
          setPendingImport(null)
          setImportName('')
        }}
        onConfirm={() => void confirmMapImport()}
      />
      {!validation.ok && (
        <div className="border-b border-amber-500/30 bg-amber-950/20 px-4 py-2 text-xs text-amber-200">
          {validation.errors.map((error) => error.message).join(' ')}
        </div>
      )}
      <Section
        title="Hardware inputs"
        action={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="bg-zinc-900/70 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={() => void addInput(profile.id)}
            title="Add hardware input"
          >
            <Plus size={13} aria-hidden />
            Input
          </Button>
        }
      >
        <InputsTable
          profile={profile}
          onUpdateInput={(inputId, changes) => void updateInput(profile.id, inputId, changes)}
          onRemoveInput={(inputId) => void removeInput(profile.id, inputId)}
        />
      </Section>
      <Section title="Global transforms">
        <GlobalTransformsTable
          profile={profile}
          liveBrightness={liveBrightness}
          onUpdateTransforms={(globalTransforms) => void updateProfile(profile.id, { globalTransforms })}
        />
      </Section>
      <Section
        title="Pattern bindings"
        action={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={profile.inputs.length === 0}
            className="bg-zinc-900/70 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-35"
            onClick={() => setBindingDraftOpen(true)}
            title="Add pattern binding"
          >
            <Plus size={13} aria-hidden />
            Binding
          </Button>
        }
      >
        <PatternBindingsTable
          profile={profile}
          patternOptions={bindingPatternOptions}
          online={Boolean(liveIp)}
          draftOpen={bindingDraftOpen}
          onAddBinding={(patternId) => {
            setBindingDraftOpen(false)
            void addPatternBinding(profile.id, patternId)
          }}
          onCancelDraft={() => setBindingDraftOpen(false)}
          onUpdateBinding={(bindingId, changes) => void updatePatternBinding(profile.id, bindingId, changes)}
          onRemoveBinding={(bindingId) => void removePatternBinding(profile.id, bindingId)}
        />
      </Section>
      <Section title="Last generated artifact">
        <TransformInspectionPanel
          artifact={transformArtifact}
          empty="No profile-enabled push has generated an inspectable artifact for this controller yet."
        />
      </Section>
      <Section
        title="Zones"
        action={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="bg-zinc-900/70 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={() => void addZone(profile.id)}
            title="Add zone"
          >
            <Plus size={13} aria-hidden />
            Zone
          </Button>
        }
      >
        <ZonesTable
          profile={profile}
          onUpdateZone={(zoneId, changes) => void updateZone(profile.id, zoneId, changes)}
          onRemoveZone={(zoneId) => void removeZone(profile.id, zoneId)}
        />
      </Section>
    </div>
  )
}
