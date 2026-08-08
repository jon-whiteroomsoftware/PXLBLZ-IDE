import { useEffect, useState } from 'react'
import type React from 'react'
import { NumberField as UiNumberField } from '@/components/ui/number-field'
import { DraftTextField } from '@/components/ui/draft-text-field'
import { PercentageField as UiPercentageField } from '@/components/ui/percentage-field'
import { CircleArrowUp, Plus } from 'lucide-react'
import { controlIcon, inlineIcon } from '@/components/iconScale'
import { Button } from '@/components/ui/button'
import {
  type ControllerBindingTarget,
  type ControllerInput,
  type ControllerInputSignal,
  type ControllerProfile,
  type PowerCapTransform,
  type GlobalTransform,
  type PatternBinding,
} from '@/engine/controllerProfile'
import {
  controllerPatternPushStates,
  describeControllerInputUses,
  type ControllerInputPresentation,
  type ControllerInputUse,
  type ControllerPatternPushState,
  type ControllerUseDetail,
} from '@/engine/controllerInputUses'
import { describeControllerPill } from '@/engine/controllerPillView'
import type { ControllerStatusTone } from '@/engine/controllerStatusView'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import type { BindingStore } from '@/engine/controllerBinding'
import type { ControllerPushRecord } from '@/engine/controllerPushRecord'
import { getControllerBindings, getPushRecords } from '@/engine/controllerMetadataStorage'
import { installedControllerPatternChoices } from '@/engine/controllerSavedPrograms'
import type { PowerCapSettings } from '@/engine/powerCap'
import {
  LED_CONSTRUCTION_PRESETS,
  convertElectricalQuantity,
  findLedConstructionPreset,
  resolveControllerElectricalProfile,
  type ControllerElectricalProfile,
  type ElectricalLoadSource,
  type ElectricalUnit,
  type LedConstructionPresetId,
} from '@/engine/controllerElectricalProfile'
import { controllerForProfile } from '@/engine/controllerProfileConnection'
import { selectTransformArtifactInspection } from '@/engine/transformInspection'
import { useControllerStore, type ControllerEntry } from '@/store/controllerStore'
import {
  CONTROLLER_INPUT_SIGNALS,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { usePatternStore } from '@/store/patternStore'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { useMapStore } from '@/store/mapStore'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import {
  describeInstalledMap,
  type InstalledMapPresentation as InstalledMapPresentationView,
} from '@/engine/installedMapObservation'
import {
  InstalledMapPresentation,
  useInstalledMapCandidates,
} from './InstalledMapPresentation'
import { StatusDot, type StatusTone } from './StatusDot'
import { TransformInspectionPanel } from './TransformInspectionPanel'
import { sectionActionButtonClass } from './ControllerProfileHeaderActions'

// Hierarchy on this page comes from whitespace, typography, and a section seam,
// never from a box drawn around a row (#772). Fields are rule-under: transparent
// background, hairline bottom border, amber on focus.
const microLabelClass = 'font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500'
const ruleSelectClass =
  'h-6 w-full min-w-0 appearance-none rounded-none border-0 border-b border-zinc-800 bg-transparent pr-3 font-mono text-xs text-zinc-200 outline-none hover:border-zinc-600 focus:border-live'
// The shared draft fields own their own chrome; scope the rule-under treatment
// to this page instead of changing every editor field in the app.
const ruleFieldWrapClass =
  'min-w-0 [&_input]:h-6 [&_input]:min-w-0 [&_input]:rounded-none [&_input]:border-0 [&_input]:border-b [&_input]:border-zinc-800 [&_input]:bg-transparent [&_input]:px-0 [&_input]:font-mono [&_input]:text-xs [&_input:hover]:border-zinc-600 [&_input:focus]:border-live'
// The bounded percentage field draws its border on the wrapper around the input
// and its slider grip, so the rule-under treatment has to move there instead.
// Size is deliberately absent here: callers set it, and two competing
// arbitrary-variant font sizes would be decided by stylesheet order.
const rulePercentWrapClass =
  'min-w-0 [&_input]:bg-transparent [&_input]:px-0 [&_input]:font-mono '
  + '[&_span>span]:rounded-none [&_span>span]:border-0 [&_span>span]:border-b [&_span>span]:border-zinc-800 [&_span>span]:bg-transparent [&_span>span]:hover:border-zinc-600 [&_span>span]:focus-within:border-live '
  + '[&_span>span>button]:border-l-0 [&_span>span>button]:w-3'
const rulePercentSizeClass = '[&_input]:h-6 [&_input]:text-xs [&_span>span]:h-6'
const traceGutter = '1.75rem'
const EMPTY_CONTROLLER_PROGRAMS: ProgramListEntry[] = []

type SelectOption<T extends string | number> = {
  value: T
  label: string
  disabled?: boolean
}

function formatMaybe(value: string | number | undefined | null, fallback = 'Unknown') {
  return value === undefined || value === null || value === '' ? fallback : String(value)
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
  return <span className={microLabelClass}>{children}</span>
}

function RuleField({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`grid min-w-0 content-start gap-0.5 ${className}`}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  )
}

function stopFieldPropagation(event: React.SyntheticEvent) {
  event.stopPropagation()
}

function TextField({
  value,
  onChange,
  ariaLabel,
  inputClassName,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  inputClassName?: string
}) {
  return (
    <DraftTextField
      ariaLabel={ariaLabel}
      value={value}
      onApply={onChange}
      rootProps={{ onClick: stopFieldPropagation, onPointerDown: stopFieldPropagation }}
      inputProps={{ onKeyDown: stopFieldPropagation }}
      className="w-full"
      inputClassName={inputClassName
        ?? 'h-6 w-full min-w-0 rounded-none border-0 border-b border-zinc-800 bg-transparent px-0 font-mono text-xs text-zinc-200 outline-none hover:border-zinc-600 focus:border-live'}
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
  placeholder,
}: {
  value?: number
  onChange: (value: number) => void
  ariaLabel: string
  min?: number
  max?: number
  step?: number
  placeholder?: string
}) {
  return (
    <div
      className={ruleFieldWrapClass}
      onClick={stopFieldPropagation}
      onPointerDown={stopFieldPropagation}
      onKeyDown={stopFieldPropagation}
    >
      <UiNumberField
        label={ariaLabel}
        ariaLabel={ariaLabel}
        hideLabel
        variant="editor"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={onChange}
      />
    </div>
  )
}

function PercentageField({
  value,
  onChange,
  ariaLabel,
  min = 0,
  max = 1,
  step = 0.01,
  sizeClassName = rulePercentSizeClass,
}: {
  value: number
  onChange: (value: number) => void
  ariaLabel: string
  min?: number
  max?: number
  step?: number
  sizeClassName?: string
}) {
  return (
    // [&_input]:w-0 zeroes the draft input's intrinsic width so its flex-1 fill
    // decides the rendered width; without it the field's min-content (~13rem)
    // blows out the narrow stacked-row columns (#685).
    <div
      className={`grow ${rulePercentWrapClass} [&_input]:w-0 ${sizeClassName}`}
      onClick={stopFieldPropagation}
      onPointerDown={stopFieldPropagation}
      onKeyDown={stopFieldPropagation}
    >
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
      className={`${ruleSelectClass} disabled:opacity-40`}
    >
      {options.map((option) => (
        <option
          key={String(option.value)}
          value={option.value}
          disabled={option.disabled}
          data-layout-ignore=""
        >
          {option.label}
        </option>
      ))}
    </select>
  )
}

function Section({
  title,
  lede,
  action,
  children,
}: {
  title: string
  lede?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-seam px-4 pb-6 pt-7">
      <div className="flex items-baseline gap-3">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">{title}</h2>
        <span className="flex-1" />
        {action}
      </div>
      {lede && <p className="mb-6 mt-2.5 max-w-[62ch] text-xs leading-5 text-zinc-500">{lede}</p>}
      {!lede && <div className="mt-4" />}
      {children}
    </section>
  )
}

function SmallButton({
  label,
  onClick,
  disabled,
  title,
  ariaLabel,
  icon,
  danger = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  ariaLabel?: string
  icon?: React.ReactNode
  danger?: boolean
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      aria-label={ariaLabel}
      className={danger
        ? 'border border-zinc-700 bg-zinc-900/70 text-xs text-zinc-300 hover:border-red-400/55 hover:bg-red-950/25 hover:text-red-300 disabled:opacity-35'
        : sectionActionButtonClass}
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
    >
      {icon}
      {label}
    </Button>
  )
}

function Switch({
  checked,
  onChange,
  ariaLabel,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  label: string
}) {
  return (
    <label className="relative inline-flex cursor-pointer select-none items-center gap-2">
      {/* The real checkbox covers the whole switch, so the click, focus, and
          keyboard all land on the control itself rather than on decoration. */}
      <input
        type="checkbox"
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none opacity-0"
        aria-label={ariaLabel}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden
        className="relative h-3.5 w-[26px] shrink-0 rounded-full bg-zinc-800 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-2.5 after:w-2.5 after:rounded-full after:bg-zinc-500 after:transition-transform after:content-[''] peer-checked:bg-live/25 peer-checked:after:translate-x-3 peer-checked:after:bg-live peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-live"
      />
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.1em] ${checked ? 'text-live' : 'text-zinc-500'}`}
      >
        {label}
      </span>
    </label>
  )
}

function ProfileStatus({
  profile,
  controller,
  installedMapPresentation,
}: {
  profile: ControllerProfile
  controller: ControllerEntry | null
  installedMapPresentation: InstalledMapPresentationView
}) {
  const status = controller ? describeControllerPill(controller) : null
  const statusTone = status?.tone ? PROFILE_STATUS_TONE[status.tone] : 'absent'
  const firmwareUpdateAvailable = profile.board.firmwareUpdate?.state === 'available'
    && (
      !profile.board.firmwareUpdate.firmwareVersion
      || profile.board.firmwareUpdate.firmwareVersion === profile.board.firmwareVersion
    )
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
        <span className="flex min-w-0 max-w-full items-center gap-1">
          <FieldLabel>Map</FieldLabel>
          <InstalledMapPresentation
            presentation={installedMapPresentation}
            className="min-w-0 flex-1 font-mono text-zinc-300"
          />
        </span>
        <span>
          <FieldLabel>Firmware</FieldLabel>{' '}
          <span className="inline-flex items-center gap-1.5 font-mono text-zinc-300">
            {formatMaybe(profile.board.firmwareVersion)}
            {firmwareUpdateAvailable && (
              <span
                role="status"
                title="Last checked while this Controller was connected"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300"
              >
                <CircleArrowUp {...inlineIcon} aria-hidden />
                Update available
              </span>
            )}
          </span>
        </span>
      </div>
    </div>
  )
}

function defaultElectricalProfile(): ControllerElectricalProfile {
  return {
    ledPresetId: 'ws2812-5v-individual',
    supplyBudget: { value: 3, unit: 'amps' },
  }
}

function synchronizeDerivedPowerCaps(
  transforms: GlobalTransform[],
  electricalProfile: ControllerElectricalProfile,
  pixelCount?: number,
): GlobalTransform[] {
  const maxDuty = resolveControllerElectricalProfile(electricalProfile, { pixelCount }).maxDuty
  if (maxDuty == null) return transforms
  return transforms.map((transform) => transform.type === 'power-cap' && transform.mode === 'derived'
    ? { ...transform, maxDuty }
    : transform)
}

function formatQuantity(value: number | null, unit: string): string | null {
  return value == null ? null : `${value.toFixed(1)} ${unit}`
}

function milliampsPerAddress(presetId: LedConstructionPresetId): string | null {
  const preset = findLedConstructionPreset(presetId)
  if (!preset) return null
  const milliamps = Math.round((preset.wattsPerAddress / preset.voltageVolts) * 1000)
  return `${milliamps} mA/addr @ ${preset.voltageVolts}V`
}

const LOAD_SOURCE_LABELS: Record<ElectricalLoadSource, string> = {
  measured: 'measured',
  'manufacturer-rated': 'manufacturer-rated',
  custom: 'custom estimate',
}

/** The Power section carries the whole installation power policy: the model,
 * its one-line derivation chain, and the duty cap that enforces it. `power-cap`
 * lives here rather than in a separate transform list — it never touches an
 * input (#772).
 *
 * The cap and the power model are independent: a direct cap changes every
 * generated Pattern whether or not an installation load has ever been modelled,
 * so the enforcement switch and the duty value always render. Only the estimate
 * and the derived mode need a model. */
function PowerSection({
  profile,
  onChangeElectrical,
  onChangePowerCap,
}: {
  profile: ControllerProfile
  onChangeElectrical: (electricalProfile: ControllerElectricalProfile) => void
  onChangePowerCap: (settings: Partial<PowerCapTransform>) => void
}) {
  const electricalProfile = profile.electricalProfile
  const pixelCount = profile.lastKnownPixelCount
  const powerCap = profile.globalTransforms.find(
    (transform): transform is PowerCapTransform => transform.type === 'power-cap',
  )
  const derivedDuty = electricalProfile
    ? resolveControllerElectricalProfile(electricalProfile, { pixelCount }).maxDuty
    : null
  const capMode = powerCap?.mode ?? 'direct'
  const displayedDuty = capMode === 'derived' && derivedDuty != null ? derivedDuty : powerCap?.maxDuty ?? 0
  const capEnabled = powerCap?.enabled ?? false

  return (
    <div>
      {electricalProfile && (
        <PowerModelFields
          electricalProfile={electricalProfile}
          pixelCount={pixelCount}
          onChangeElectrical={onChangeElectrical}
        />
      )}

      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 border-t border-zinc-800/80 pt-4">
        <div className={`min-w-[9.5rem] shrink-0 ${capEnabled ? '' : 'opacity-45'}`}>
          <span className={`${microLabelClass} block`}>Duty cap</span>
          {capMode === 'direct' && powerCap ? (
            /* A typed cap keeps the same visual weight as a derived one. */
            <div className="mt-0.5 max-w-[7rem]">
              <PercentageField
                ariaLabel="Power cap duty percent"
                min={0}
                max={1}
                step={0.01}
                value={powerCap.maxDuty}
                onChange={(maxDuty) => onChangePowerCap({ mode: 'direct', maxDuty })}
                sizeClassName="[&_input]:h-9 [&_input]:text-2xl [&_input]:font-medium [&_input]:tracking-tight [&_input]:text-live [&_span>span]:h-9"
              />
            </div>
          ) : (
            <span className="mt-0.5 block font-mono text-2xl font-medium leading-tight tracking-tight text-live">
              {`${Math.round(displayedDuty * 100)}%`}
            </span>
          )}
          <span className="mt-1.5 block text-xs text-zinc-500">
            {capMode === 'derived' ? 'calculated from the load and budget' : 'a fixed cap you set'}
          </span>
        </div>

        <div className="min-w-0 flex-[1_1_22rem] pt-0.5">
          {electricalProfile ? (
            /* The derivation feeds the cap, so it dims with the cap it feeds. */
            <div className={capEnabled ? '' : 'opacity-45'}>
              <PowerModelDerivation
                electricalProfile={electricalProfile}
                pixelCount={pixelCount}
                onChangeElectrical={onChangeElectrical}
              />
            </div>
          ) : (
            /* Missing only the estimate; the cap beside it is unaffected. */
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
              <span>No power model yet, so PXLBLZ cannot estimate the installation load.</span>
              <SmallButton
                label="Configure power model"
                onClick={() => onChangeElectrical(defaultElectricalProfile())}
              />
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3 pt-0.5">
          <SmallButton
            label={capMode === 'derived' ? 'Set a fixed cap' : 'Calculate from load and budget'}
            disabled={capMode === 'direct' && derivedDuty == null}
            onClick={() => (capMode === 'derived'
              ? onChangePowerCap({ mode: 'direct' })
              : derivedDuty != null && onChangePowerCap({ mode: 'derived', maxDuty: derivedDuty }))}
          />
          <Switch
            ariaLabel="Enforce the duty cap"
            checked={capEnabled}
            label={capEnabled ? 'on' : 'off'}
            onChange={(enabled) => onChangePowerCap({ enabled })}
          />
        </div>
      </div>
    </div>
  )
}

/** The installation power model itself: what is wired up and what feeds it. */
function PowerModelFields({
  electricalProfile,
  pixelCount,
  onChangeElectrical,
}: {
  electricalProfile: ControllerElectricalProfile
  pixelCount: number | undefined
  onChangeElectrical: (electricalProfile: ControllerElectricalProfile) => void
}) {
  const resolved = resolveControllerElectricalProfile(electricalProfile, { pixelCount })
  const override = electricalProfile.loadOverride
  const presetOptions: SelectOption<LedConstructionPresetId>[] = [
    ...LED_CONSTRUCTION_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
    {
      value: 'custom',
      label: pixelCount ? 'Custom / measured installation' : 'Custom / measured (needs address count)',
      disabled: !pixelCount && electricalProfile.ledPresetId !== 'custom',
    },
  ]

  function update(changes: Partial<ControllerElectricalProfile>) {
    onChangeElectrical({ ...electricalProfile, ...changes })
  }

  function changePreset(ledPresetId: LedConstructionPresetId) {
    const profileValue = electricalProfile
    if (ledPresetId !== 'custom') {
      onChangeElectrical({ ledPresetId, supplyBudget: profileValue.supplyBudget })
      return
    }
    if (!pixelCount) return
    if (override) {
      onChangeElectrical({
        ...profileValue,
        ledPresetId,
        ...(resolved.voltageVolts ? { voltageOverride: resolved.voltageVolts } : {}),
      })
      return
    }
    const fullWhiteWatts = resolved.fullWhiteWatts
    if (fullWhiteWatts == null) return
    onChangeElectrical({
      ledPresetId,
      supplyBudget: profileValue.supplyBudget,
      ...(resolved.voltageVolts ? { voltageOverride: resolved.voltageVolts } : {}),
      loadOverride: {
        fullWhite: { value: fullWhiteWatts, unit: 'watts' },
        source: 'custom',
        atPixelCount: pixelCount,
      },
    })
  }

  return (
    <div className="mb-7 flex flex-wrap items-end gap-x-8 gap-y-4">
      <RuleField label="LED construction" className="max-w-[22rem] flex-[1_1_16rem]">
        <SelectField
          ariaLabel="LED construction preset"
          value={electricalProfile.ledPresetId}
          options={presetOptions}
          onChange={changePreset}
        />
      </RuleField>
      <RuleField label="Supply budget" className="flex-[0_1_8rem]">
        <NumberField
          ariaLabel="Continuous LED supply budget"
          min={0.01}
          step={0.1}
          value={electricalProfile.supplyBudget.value}
          onChange={(value) => update({
            supplyBudget: { ...electricalProfile.supplyBudget, value },
          })}
        />
      </RuleField>
      <RuleField label="Unit" className="flex-[0_1_7rem]">
        <SelectField
          ariaLabel="Continuous LED supply budget unit"
          value={electricalProfile.supplyBudget.unit}
          options={[
            {
              value: 'amps',
              label: 'amps',
              disabled: electricalProfile.supplyBudget.unit !== 'amps' && resolved.voltageVolts == null,
            },
            {
              value: 'watts',
              label: 'watts',
              disabled: electricalProfile.supplyBudget.unit !== 'watts' && resolved.voltageVolts == null,
            },
          ]}
          onChange={(unit: ElectricalUnit) => {
            const converted = convertElectricalQuantity(
              electricalProfile.supplyBudget,
              unit,
              resolved.voltageVolts,
            )
            if (converted) update({ supplyBudget: converted })
          }}
        />
      </RuleField>
      <RuleField label="Supply voltage" className="flex-[0_1_8rem]">
        <NumberField
          ariaLabel="Power supply voltage"
          min={0.1}
          step={0.1}
          value={electricalProfile.voltageOverride ?? resolved.voltageVolts ?? undefined}
          placeholder="Enter voltage"
          onChange={(voltageOverride) => update({ voltageOverride })}
        />
      </RuleField>
    </div>
  )
}

/** The one-line chain from addresses to budget, and the measured total that can
 * replace the preset estimate inside it. */
function PowerModelDerivation({
  electricalProfile,
  pixelCount,
  onChangeElectrical,
}: {
  electricalProfile: ControllerElectricalProfile
  pixelCount: number | undefined
  onChangeElectrical: (electricalProfile: ControllerElectricalProfile) => void
}) {
  const resolved = resolveControllerElectricalProfile(electricalProfile, { pixelCount })
  const override = electricalProfile.loadOverride

  function update(changes: Partial<ControllerElectricalProfile>) {
    onChangeElectrical({ ...electricalProfile, ...changes })
  }

  function enableOverride() {
    if (!pixelCount) return
    update({
      loadOverride: {
        fullWhite: {
          value: resolved.fullWhiteWatts ?? resolved.budgetWatts ?? 1,
          unit: 'watts',
        },
        source: 'measured',
        atPixelCount: pixelCount,
      },
    })
  }

  const chain: React.ReactNode[] = []
  chain.push(pixelCount ? `${pixelCount} addr` : 'addresses unknown')
  if (resolved.physicalLedCount != null && resolved.physicalLedCount !== resolved.pixelCount) {
    chain.push(`${resolved.physicalLedCount} LEDs`)
  }
  if (!override) {
    const perAddress = milliampsPerAddress(electricalProfile.ledPresetId)
    if (perAddress) chain.push(perAddress)
  }
  const fullWhite = formatQuantity(resolved.fullWhiteWatts, 'W') ?? formatQuantity(resolved.fullWhiteAmps, 'A')
  chain.push(
    <>
      <b className="font-medium text-zinc-200">{fullWhite ?? 'unknown'}</b> full white
    </>,
  )
  if (override) chain.push(LOAD_SOURCE_LABELS[override.source])
  const budget = formatQuantity(resolved.budgetWatts, 'W') ?? formatQuantity(resolved.budgetAmps, 'A')
  chain.push(
    <>
      <b className="font-medium text-zinc-200">{budget ?? 'unknown'}</b> budget
    </>,
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs text-zinc-400">
        {chain.map((item, index) => (
          <span key={index} className="flex items-center gap-2.5">
            {index > 0 && <span className="text-zinc-700">·</span>}
            <span>{item}</span>
          </span>
        ))}
        <span className="ml-1.5">
          {override ? (
            <SmallButton
              label="Use estimate"
              title="Return to the preset full-white estimate"
              onClick={() => onChangeElectrical({
                ledPresetId: electricalProfile.ledPresetId,
                supplyBudget: electricalProfile.supplyBudget,
              })}
              disabled={electricalProfile.ledPresetId === 'custom'}
            />
          ) : (
            <SmallButton
              label="Override load"
              title="Replace the estimate with a measured or rated installation total"
              onClick={enableOverride}
              disabled={!pixelCount}
            />
          )}
        </span>
      </div>

      {override && (
        <div className="mt-3.5 flex flex-wrap items-end gap-x-7 gap-y-3">
          <RuleField label="Full-white total" className="flex-[0_1_8rem]">
            <NumberField
              ariaLabel="Full-white installation total"
              min={0.01}
              step={0.1}
              value={override.fullWhite.value}
              onChange={(value) => update({
                loadOverride: { ...override, fullWhite: { ...override.fullWhite, value } },
              })}
            />
          </RuleField>
          <RuleField label="Unit" className="flex-[0_1_7rem]">
            <SelectField
              ariaLabel="Full-white installation total unit"
              value={override.fullWhite.unit}
              options={[
                {
                  value: 'amps',
                  label: 'amps',
                  disabled: override.fullWhite.unit !== 'amps' && resolved.voltageVolts == null,
                },
                {
                  value: 'watts',
                  label: 'watts',
                  disabled: override.fullWhite.unit !== 'watts' && resolved.voltageVolts == null,
                },
              ]}
              onChange={(unit: ElectricalUnit) => {
                const converted = convertElectricalQuantity(
                  override.fullWhite,
                  unit,
                  resolved.voltageVolts,
                )
                if (converted) update({ loadOverride: { ...override, fullWhite: converted } })
              }}
            />
          </RuleField>
          <RuleField label="Source" className="flex-[0_1_10rem]">
            <SelectField<ElectricalLoadSource>
              ariaLabel="Full-white load source"
              value={override.source}
              options={[
                { value: 'measured', label: 'measured' },
                { value: 'manufacturer-rated', label: 'manufacturer-rated' },
                { value: 'custom', label: 'custom estimate' },
              ]}
              onChange={(source) => update({ loadOverride: { ...override, source } })}
            />
          </RuleField>
        </div>
      )}

      {resolved.overrideStale && pixelCount && override && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-amber-300">
          <span>
            This total was recorded at {override.atPixelCount} addresses; the controller now reports {pixelCount}.
          </span>
          <SmallButton
            label={`Confirm for ${pixelCount}`}
            onClick={() => update({ loadOverride: { ...override, atPixelCount: pixelCount } })}
          />
        </div>
      )}

      {!pixelCount && (
        <p className="mt-3 text-xs text-amber-200/85">
          Connect this Controller to supply its address count. PXLBLZ will not invent one.
        </p>
      )}
    </>
  )
}

function UseDetail({ detail }: { detail: ControllerUseDetail }) {
  return (
    <span>
      {detail.lead} <code className="font-mono text-zinc-400">{detail.code}</code>
      {detail.trail ? ` ${detail.trail}` : ''}
    </span>
  )
}

// `current` and `unknown` both render nothing: one has nothing to report, the
// other has nothing to report it from (#772).
const PUSH_TAG_LABELS: Record<ControllerPatternPushState, string | null> = {
  current: null,
  unknown: null,
  stale: 'push again',
  'not-pushed': 'not pushed',
}

const PUSH_TAG_TITLES: Record<ControllerPatternPushState, string> = {
  current: '',
  unknown: '',
  stale: 'This Pattern was pushed before the current Controller settings.',
  'not-pushed': 'No artifact from this Controller profile has been pushed for this Pattern.',
}

function traceColorFor(inputState: ControllerInputPresentation['state'], live: boolean): string {
  if (inputState === 'error') return 'rgba(248,113,113,0.85)'
  return live ? 'rgba(251,191,36,0.8)' : '#52525b'
}

/** One continuous trace down the gutter with a stub into each row: the uses of
 * an input fan out from its pin. Rows are placed explicitly rather than with
 * :first-child/:last-child because the add-use row follows the real uses. */
function UseRow({
  index,
  count,
  traceColor,
  children,
  right,
}: {
  index: number
  count: number
  traceColor: string
  children: React.ReactNode
  right?: React.ReactNode
}) {
  const first = index === 0
  const last = index === count - 1
  return (
    <div
      style={{ '--trace': traceColor } as React.CSSProperties}
      className="relative grid items-baseline gap-x-4 py-[5px] [grid-template-columns:var(--gut)_minmax(0,1fr)_auto]"
    >
      {/* The first row's line fades up out of the pin instead of butting into it. */}
      <span
        aria-hidden
        className={`absolute left-1.5 w-px ${
          first
            ? '-top-8 [background-image:linear-gradient(to_bottom,transparent_0,var(--trace)_26px)]'
            : 'top-0 bg-[var(--trace)]'
        } ${last ? 'bottom-[calc(100%-15px)]' : 'bottom-0'}`}
      />
      <span aria-hidden className="absolute left-1.5 top-[15px] h-px w-[13px] bg-[var(--trace)]" />
      <span />
      <div className="min-w-0">{children}</div>
      <div className="flex items-center gap-3 whitespace-nowrap">{right}</div>
    </div>
  )
}

function PatternUseEditor({
  binding,
  patternOptions,
  online,
  onUpdate,
}: {
  binding: PatternBinding
  patternOptions: SelectOption<string>[]
  online: boolean
  onUpdate: (changes: Partial<PatternBinding>) => void
}) {
  return (
    <div className="mt-1 flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-zinc-800/70 pt-3">
      <RuleField label="Pattern" className="flex-[1_1_11rem]">
        <SelectField
          ariaLabel="Binding Pattern"
          value={binding.patternId}
          options={patternOptions.some((option) => option.value === binding.patternId)
            ? patternOptions
            : [
                { value: binding.patternId, label: `${binding.patternId} (not installed)` },
                ...patternOptions,
              ]}
          onChange={(patternId) => onUpdate({ patternId })}
          disabled={!online}
        />
      </RuleField>
      <RuleField label="Target" className="flex-[0_1_9rem]">
        <SelectField
          ariaLabel="Binding target kind"
          value={binding.target.kind}
          options={[
            { value: 'call-exported-slider', label: 'exported slider' },
            { value: 'call-function', label: 'function' },
            { value: 'assign-variable', label: 'variable' },
          ]}
          onChange={(kind) => onUpdate({ target: targetForKind(kind, binding.target) })}
        />
      </RuleField>
      <RuleField label="Name" className="flex-[0_1_9rem]">
        <TextField
          ariaLabel="Binding target name"
          value={binding.target.name}
          onChange={(name) => onUpdate({ target: { ...binding.target, name } })}
        />
      </RuleField>
      {binding.target.kind === 'assign-variable' && (
        <>
          <RuleField label="Min" className="flex-[0_1_5rem]">
            <NumberField
              ariaLabel="Binding minimum"
              value={binding.target.min}
              step={0.01}
              onChange={(min) => {
                if (binding.target.kind === 'assign-variable') {
                  onUpdate({ target: { ...binding.target, min } })
                }
              }}
            />
          </RuleField>
          <RuleField label="Max" className="flex-[0_1_5rem]">
            <NumberField
              ariaLabel="Binding maximum"
              value={binding.target.max}
              step={0.01}
              onChange={(max) => {
                if (binding.target.kind === 'assign-variable') {
                  onUpdate({ target: { ...binding.target, max } })
                }
              }}
            />
          </RuleField>
          <RuleField label="Quantize" className="flex-[0_1_5rem]">
            <NumberField
              ariaLabel="Binding quantize"
              value={binding.target.quantize ?? 0}
              step={0.01}
              onChange={(quantize) => {
                if (binding.target.kind === 'assign-variable') {
                  onUpdate({
                    target: {
                      ...binding.target,
                      ...(quantize > 0 ? { quantize } : { quantize: undefined }),
                    },
                  })
                }
              }}
            />
          </RuleField>
        </>
      )}
    </div>
  )
}

function InputCard({
  profile,
  input,
  presentation,
  patternOptions,
  online,
  onUpdateInput,
  onRemoveInput,
  onAssignBrightness,
  onAddPatternUse,
  onUpdateBinding,
  onRemoveBinding,
}: {
  profile: ControllerProfile
  input: ControllerInput
  presentation: ControllerInputPresentation
  patternOptions: SelectOption<string>[]
  online: boolean
  onUpdateInput: (changes: Partial<ControllerInput>) => void
  onRemoveInput: () => void
  onAssignBrightness: (inputId: string | null) => void
  onAddPatternUse: (patternId: string) => void
  onUpdateBinding: (bindingId: string, changes: Partial<PatternBinding>) => void
  onRemoveBinding: (bindingId: string) => void
}) {
  const [adjusting, setAdjusting] = useState(false)
  const [draftOpen, setDraftOpen] = useState(false)
  const [editingBindingId, setEditingBindingId] = useState<string | null>(null)
  const pinOptions: SelectOption<number>[] = [0, 25, 26, 33, 34, 35, 36, 39].map((pin) => ({
    value: pin,
    label: `IO${pin}`,
  }))
  const signalOptions: SelectOption<ControllerInputSignal>[] = CONTROLLER_INPUT_SIGNALS.map((signal) => ({
    value: signal,
    label: signal,
  }))
  const pinTone = presentation.state === 'error'
    ? 'text-red-400'
    : presentation.state === 'live'
      ? 'text-live'
      : 'text-zinc-500'
  const rowCount = presentation.uses.length
  const showBrightnessAddAction = !presentation.brightnessAssigned
    && presentation.uses[0]?.kind !== 'none'

  return (
    <article
      className="break-inside-avoid border-t border-zinc-800/70 py-4 first:border-t-0"
      style={{ '--gut': traceGutter } as React.CSSProperties}
    >
      <div className="grid items-start gap-x-4 [grid-template-columns:var(--gut)_minmax(0,1fr)_auto]">
        <div className={`whitespace-nowrap pt-2 font-mono text-[13px] font-medium tracking-tight ${pinTone}`}>
          {presentation.pin}
        </div>
        <div className="min-w-0">
          <div className="max-w-[22ch]">
            <TextField
              ariaLabel={`${input.name} input name`}
              value={input.name}
              onChange={(name) => onUpdateInput({ name })}
              inputClassName="w-full min-w-0 rounded-none border-0 border-b border-transparent bg-transparent px-0 py-0.5 text-base font-medium tracking-tight text-zinc-100 outline-none hover:border-zinc-800 focus:border-live"
            />
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 font-mono text-[11.5px] text-zinc-500">
            {presentation.physical.map((fact, index) => (
              <span key={fact} className="flex items-baseline gap-2.5">
                {index > 0 && <span className="text-zinc-700">·</span>}
                <span>{fact}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <SmallButton
            label={adjusting ? 'Done' : 'Adjust'}
            ariaLabel={adjusting ? `Done adjusting ${input.name}` : `Adjust ${input.name}`}
            onClick={() => setAdjusting((open) => !open)}
          />
          <SmallButton label="Remove" ariaLabel={`Remove ${input.name}`} danger onClick={onRemoveInput} />
        </div>
      </div>

      {adjusting && (
        <div className="grid gap-x-4 [grid-template-columns:var(--gut)_minmax(0,1fr)]">
          <span />
          <div className="mt-4 flex flex-wrap items-end gap-x-7 gap-y-4 border-t border-zinc-800/70 pt-3.5">
            <RuleField label="Pin" className="flex-[0_1_5.5rem]">
              <SelectField
                ariaLabel={`${input.name} pin`}
                value={input.pin}
                options={pinOptions}
                onChange={(pin) => onUpdateInput({ pin })}
              />
            </RuleField>
            <RuleField label="Signal" className="flex-[0_1_6.5rem]">
              <SelectField
                ariaLabel={`${input.name} signal`}
                value={input.signal}
                options={signalOptions}
                onChange={(signal) => onUpdateInput({ signal })}
              />
            </RuleField>
            <RuleField label="Smoothing" className="flex-[0_1_6.5rem]">
              <PercentageField
                ariaLabel={`${input.name} smoothing`}
                min={0}
                max={1}
                step={0.01}
                value={input.smoothing}
                onChange={(smoothing) => onUpdateInput({ smoothing })}
              />
            </RuleField>
            <RuleField label="Fallback" className="flex-[0_1_6.5rem]">
              <PercentageField
                ariaLabel={`${input.name} fallback`}
                min={0}
                max={1}
                step={0.01}
                value={input.fallback}
                onChange={(fallback) => onUpdateInput({ fallback })}
              />
            </RuleField>
            <div className="flex items-baseline gap-3 font-mono text-xs text-zinc-400">
              <span>{input.invert ? '1 -> 0' : '0 -> 1'}</span>
              <label
                className="flex cursor-pointer items-center gap-1.5 font-sans text-xs text-zinc-400"
                title="Invert the normalized hardware input direction"
              >
                <input
                  type="checkbox"
                  aria-label={`${input.name} invert`}
                  checked={input.invert}
                  onChange={(event) => onUpdateInput({ invert: event.target.checked })}
                  className="accent-live"
                />
                <span>Invert</span>
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="mt-2 grid">
        {presentation.uses.map((use, index) => (
          <UseBlock
            key={rowKeyForUse(use, index)}
            use={use}
            index={index}
            count={rowCount}
            inputName={input.name}
            inputState={presentation.state}
            profile={profile}
            patternOptions={patternOptions}
            online={online}
            editing={use.kind === 'pattern' && editingBindingId === use.bindingId}
            onToggleEditing={(bindingId) => setEditingBindingId((current) => (
              current === bindingId ? null : bindingId
            ))}
            onAssignBrightness={onAssignBrightness}
            onUpdateBinding={onUpdateBinding}
            onRemoveBinding={onRemoveBinding}
            inputId={presentation.inputId}
          />
        ))}

        {presentation.issues.map((issue) => (
          <div
            key={issue.path}
            className="mt-2 grid gap-x-4 [grid-template-columns:var(--gut)_minmax(0,1fr)]"
          >
            <span />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-red-300">
              <span>{issue.message}</span>
              {issue.correction && (
                <button
                  type="button"
                  onClick={() => onUpdateInput(issue.correction!.change)}
                  className="border-b border-live/40 font-mono text-[11.5px] text-live outline-none hover:border-live focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                >
                  {issue.correction.label}
                </button>
              )}
            </div>
          </div>
        ))}

        {draftOpen ? (
          <div className="mt-2 grid gap-x-4 [grid-template-columns:var(--gut)_minmax(0,1fr)]">
            <span />
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <RuleField label="Pattern" className="flex-[1_1_14rem]">
                <select
                  aria-label={`Pattern for ${input.name}`}
                  defaultValue=""
                  disabled={!online || patternOptions.length === 0}
                  onClick={stopFieldPropagation}
                  onPointerDown={stopFieldPropagation}
                  onKeyDown={stopFieldPropagation}
                  onChange={(event) => {
                    if (event.target.value) {
                      setDraftOpen(false)
                      onAddPatternUse(event.target.value)
                    }
                  }}
                  className={`${ruleSelectClass} disabled:opacity-40`}
                >
                  <option value="">
                    {!online
                      ? 'Connect this Controller to add a use'
                      : patternOptions.length > 0
                      ? 'Choose an installed managed Pattern'
                      : 'No managed saved Patterns are installed'}
                  </option>
                  {patternOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </RuleField>
              <SmallButton
                label="Cancel"
                ariaLabel={`Cancel new use for ${input.name}`}
                onClick={() => setDraftOpen(false)}
              />
            </div>
          </div>
        ) : (
          <div className="mt-2 grid gap-x-4 [grid-template-columns:var(--gut)_minmax(0,1fr)]">
            <span />
            <div className="flex flex-wrap items-center gap-2">
              {showBrightnessAddAction && (
                <SmallButton
                  label="Use for brightness"
                  ariaLabel={`Use ${input.name} for brightness`}
                  icon={<Plus {...controlIcon} aria-hidden />}
                  onClick={() => onAssignBrightness(presentation.inputId)}
                />
              )}
              <SmallButton
                label="Use for one Pattern"
                ariaLabel={`Use ${input.name} for one Pattern`}
                icon={<Plus {...controlIcon} aria-hidden />}
                onClick={() => setDraftOpen(true)}
              />
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function rowKeyForUse(use: ControllerInputUse, index: number): string {
  if (use.kind === 'pattern') return use.bindingId
  return `${use.kind}-${index}`
}

function UseBlock({
  use,
  index,
  count,
  inputId,
  inputName,
  inputState,
  profile,
  patternOptions,
  online,
  editing,
  onToggleEditing,
  onAssignBrightness,
  onUpdateBinding,
  onRemoveBinding,
}: {
  use: ControllerInputUse
  index: number
  count: number
  inputId: string
  inputName: string
  inputState: ControllerInputPresentation['state']
  profile: ControllerProfile
  patternOptions: SelectOption<string>[]
  online: boolean
  editing: boolean
  onToggleEditing: (bindingId: string) => void
  onAssignBrightness: (inputId: string | null) => void
  onUpdateBinding: (bindingId: string, changes: Partial<PatternBinding>) => void
  onRemoveBinding: (bindingId: string) => void
}) {
  if (use.kind === 'none') {
    return (
      <UseRow
        index={index}
        count={count}
        traceColor={traceColorFor(inputState, false)}
        right={(
          <Switch
            ariaLabel={`${inputName} controls brightness`}
            checked={false}
            label="brightness"
            onChange={() => onAssignBrightness(inputId)}
          />
        )}
      >
        <div className="text-[13.5px] text-zinc-400">{use.label}</div>
        <div className="mt-px font-mono text-[11.5px] text-zinc-500">{use.detail}</div>
      </UseRow>
    )
  }

  if (use.kind === 'brightness') {
    return (
      <UseRow
        index={index}
        count={count}
        traceColor={traceColorFor(inputState, use.state === 'live')}
        right={(
          <Switch
            ariaLabel={`${inputName} controls brightness`}
            checked
            label="on"
            onChange={() => onAssignBrightness(null)}
          />
        )}
      >
        <div className="text-[13.5px] font-medium tracking-[-0.005em] text-zinc-100">{use.label}</div>
        <div className="mt-px font-mono text-[11.5px] text-zinc-500">{use.scope}</div>
      </UseRow>
    )
  }

  const binding = profile.patternBindings.find((candidate) => candidate.id === use.bindingId)
  const pushLabel = use.push ? PUSH_TAG_LABELS[use.push] : null

  return (
    <>
      <UseRow
        index={index}
        count={count}
        traceColor={traceColorFor(inputState, use.state === 'live')}
        right={(
          <>
            {pushLabel && (
              <span
                title={use.push ? PUSH_TAG_TITLES[use.push] : undefined}
                className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-live"
              >
                {pushLabel}
              </span>
            )}
            <SmallButton
              label={editing ? 'Done' : 'Edit'}
              ariaLabel={editing
                ? `Done editing ${use.label} use of ${inputName}`
                : `Edit ${use.label} use of ${inputName}`}
              onClick={() => onToggleEditing(use.bindingId)}
            />
            <SmallButton
              label="Remove"
              ariaLabel={`Remove ${use.label} use of ${inputName}`}
              danger
              onClick={() => onRemoveBinding(use.bindingId)}
            />
          </>
        )}
      >
        <div className="text-[13.5px] font-medium tracking-[-0.005em] text-zinc-100">{use.label}</div>
        <div className="mt-px font-mono text-[11.5px] text-zinc-500">
          <UseDetail detail={use.detail} />
        </div>
      </UseRow>
      {editing && binding && (
        <div className="grid gap-x-4 [grid-template-columns:var(--gut)_minmax(0,1fr)]">
          <span />
          <PatternUseEditor
            binding={binding}
            patternOptions={patternOptions}
            online={online}
            onUpdate={(changes) => onUpdateBinding(binding.id, changes)}
          />
        </div>
      )}
    </>
  )
}

export function ControllerProfilePage({ profileId }: { profileId: string }) {
  const profiles = useControllerProfileStore((state) => state.profiles)
  const profilesLoaded = useControllerProfileStore((state) => state.profilesLoaded)
  const updateProfile = useControllerProfileStore((state) => state.updateProfile)
  const addInput = useControllerProfileStore((state) => state.addInput)
  const updateInput = useControllerProfileStore((state) => state.updateInput)
  const removeInput = useControllerProfileStore((state) => state.removeInput)
  const assignHardwareBrightness = useControllerProfileStore((state) => state.assignHardwareBrightness)
  const addPatternBinding = useControllerProfileStore((state) => state.addPatternBinding)
  const updatePatternBinding = useControllerProfileStore((state) => state.updatePatternBinding)
  const removePatternBinding = useControllerProfileStore((state) => state.removePatternBinding)
  const refreshLiveMetadata = useControllerProfileStore((state) => state.refreshLiveMetadata)
  const controllers = useControllerStore((state) => state.controllers)
  const transformArtifacts = useControllerStore((state) => state.lastTransformArtifacts)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const userMaps = useMapStore((state) => state.userMaps)
  const profile = profiles.find((item) => item.id === profileId)
  const profileController = profile ? controllerForProfile(profile, controllers) : null
  const liveIp = profileController?.phase === 'live' ? profileController.ip : undefined
  const liveMapDim = profileController?.phase === 'live' ? profileController.mapDim ?? null : null
  const controllerPrograms = useControllerPanelStore((state) => (
    liveIp ? state.programsByController[liveIp] ?? EMPTY_CONTROLLER_PROGRAMS : EMPTY_CONTROLLER_PROGRAMS
  ))
  const profileRefreshId = profile?.id
  const [controllerBindingsRead, setControllerBindingsRead] = useState<{
    controllerId: string
    bindings: BindingStore
  } | null>(null)
  const [pushRecordsRead, setPushRecordsRead] = useState<{
    controllerId: string
    records: Record<string, ControllerPushRecord>
  } | null>(null)

  useEffect(() => {
    if (profileRefreshId && liveIp) void refreshLiveMetadata(profileRefreshId)
  }, [liveIp, profileRefreshId, refreshLiveMetadata])

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

  // Level 2 re-push staleness needs the saved artifact records for this
  // Controller. They are keyed by IP, so this mirrors the bindings read.
  useEffect(() => {
    let cancelled = false
    if (!liveIp) return
    void getPushRecords()
      .then((records) => {
        if (!cancelled) setPushRecordsRead({ controllerId: liveIp, records: records[liveIp] ?? {} })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [controllerPrograms, liveIp])

  const installedMapObservation = profile
    ? profileController?.phase === 'live'
      ? profileController.installedMap ?? { status: 'loading' as const }
      : profile.lastKnownInstalledMap
    : undefined
  const installedMapPointCount = installedMapObservation?.status === 'present'
    ? installedMapObservation.pointCount
    : null
  const installedMapCandidates = useInstalledMapCandidates(userMaps, installedMapPointCount)

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-zinc-500">
        {profilesLoaded ? 'Controller profile not found.' : 'Loading controller profile...'}
      </div>
    )
  }

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
  const patternNames: Record<string, string> = {}
  for (const [patternId, name] of localPatternNameById) patternNames[patternId] = name
  for (const option of installedBindingPatternOptions) patternNames[option.value] = option.label
  const installedMapPresentation = describeInstalledMap({
    observation: installedMapObservation,
    profile,
    candidates: installedMapCandidates,
  })

  const patternPushStates = controllerPatternPushStates({
    profile,
    patternIds: profile.patternBindings.map((binding) => binding.patternId),
    // No read for this Controller yet — still in flight, or it failed — is not
    // evidence that nothing was pushed, so it must claim nothing (#772).
    pushRecords: pushRecordsRead && pushRecordsRead.controllerId === liveIp
      ? { status: 'read', records: pushRecordsRead.records }
      : { status: 'unknown' },
    mapDim: liveMapDim,
    live: Boolean(liveIp),
  })
  const usesView = describeControllerInputUses(profile, { patternNames, patternPushStates })
  const presentationById = new Map(usesView.inputs.map((entry) => [entry.inputId, entry]))

  return (
    <div data-testid="controller-profile-page" className="h-full overflow-y-auto bg-zinc-950 text-zinc-200">
      <ProfileStatus
        profile={profile}
        controller={profileController}
        installedMapPresentation={installedMapPresentation}
      />
      {usesView.profileIssues.length > 0 && (
        <div className="border-b border-amber-500/30 bg-amber-950/20 px-4 py-2 text-xs text-amber-200">
          {usesView.profileIssues.map((error) => error.message).join(' ')}
        </div>
      )}
      <Section
        title="Power"
        lede="The Controller estimates draw live from the duty cycle of the running Pattern."
      >
        <PowerSection
          profile={profile}
          onChangeElectrical={(electricalProfile) => void updateProfile(profile.id, {
            electricalProfile,
            globalTransforms: synchronizeDerivedPowerCaps(
              profile.globalTransforms,
              electricalProfile,
              profile.lastKnownPixelCount,
            ),
          })}
          onChangePowerCap={(settings: Partial<PowerCapSettings & { enabled: boolean }>) => void updateProfile(
            profile.id,
            {
              globalTransforms: profile.globalTransforms.map((transform) => (
                transform.type === 'power-cap' ? { ...transform, ...settings } : transform
              )),
            },
          )}
        />
      </Section>
      <Section
        title="Inputs"
        lede={(
          <>
            One entry per physical control wired to the board, with everything it drives.{' '}
            <span className="text-zinc-400">Changes reach the hardware when a Pattern is pushed.</span>
          </>
        )}
        action={
          <SmallButton
            label="Add input"
            title="Add hardware input"
            icon={<Plus {...controlIcon} aria-hidden />}
            onClick={() => void addInput(profile.id)}
          />
        }
      >
        {profile.inputs.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No hardware inputs are wired to this Controller profile yet.
          </p>
        ) : (
          // Ragged two-up columns, not a grid: inputs have different heights and
          // must not be forced to share a row height (#772). The shorthand is
          // container-relative — two columns only while each still gets 24rem —
          // because this pane narrows independently of the viewport.
          <div className="gap-x-13 [column-rule:1px_solid_rgb(39_39_42)] [columns:24rem_2]">
            {profile.inputs.map((input) => {
              const presentation = presentationById.get(input.id)
              if (!presentation) return null
              return (
                <InputCard
                  key={input.id}
                  profile={profile}
                  input={input}
                  presentation={presentation}
                  patternOptions={bindingPatternOptions}
                  online={Boolean(liveIp)}
                  onUpdateInput={(changes) => void updateInput(profile.id, input.id, changes)}
                  onRemoveInput={() => void removeInput(profile.id, input.id)}
                  onAssignBrightness={(inputId) => void assignHardwareBrightness(profile.id, inputId)}
                  onAddPatternUse={(patternId) => void addPatternBinding(profile.id, patternId, input.id)}
                  onUpdateBinding={(bindingId, changes) => void updatePatternBinding(profile.id, bindingId, changes)}
                  onRemoveBinding={(bindingId) => void removePatternBinding(profile.id, bindingId)}
                />
              )
            })}
          </div>
        )}
      </Section>
      <Section title="Last generated artifact">
        <TransformInspectionPanel
          artifact={transformArtifact}
          empty="No profile-enabled push has generated an inspectable artifact for this controller yet."
        />
      </Section>
      {/* Zones are Installation Show setup, not Controller hardware setup, so
          they are no longer edited here. `ControllerProfile.zones` stays
          persisted and stays live in Show compilation; the replacement editing
          surface is tracked as #775. */}
    </div>
  )
}
