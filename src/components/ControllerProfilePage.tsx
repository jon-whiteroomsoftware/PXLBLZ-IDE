import { useEffect, useState } from 'react'
import type React from 'react'
import { useNumberFieldDraft } from '@/components/ui/number-field'
import { PercentageField as UiPercentageField } from '@/components/ui/percentage-field'
import { CircleArrowUp, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IDE_MICROTYPE } from '@/components/ui/ideMicrotype'
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
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import type { BindingStore } from '@/engine/controllerBinding'
import { getControllerBindings } from '@/engine/controllerMetadataStorage'
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
  CONTROLLER_INPUT_ROLES,
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
import { HelpHint } from './HelpHint'
import { TransformInspectionPanel } from './TransformInspectionPanel'
import { sectionActionButtonClass } from './ControllerProfileHeaderActions'

const fieldClass =
  'h-7 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'
const tableHeadClass = 'px-2 py-1 text-left text-[10px] font-semibold uppercase text-zinc-400'
const tableCellClass = 'border-t border-zinc-800/85 px-2 py-1.5 align-middle'
const rowCardClass = 'relative border border-zinc-800/80 bg-zinc-950/25 px-3 py-2.5'
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
  return <span className="text-[10px] uppercase tracking-wide text-zinc-400">{children}</span>
}

// Stacked-row field: microlabel above its control, so wide column headers are
// never needed and rows can wrap instead of scrolling sideways (#685).
function LabeledField({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`grid min-w-0 content-start gap-1 ${className}`}>
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
      className={`${fieldClass} w-full`}
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
      className={`${fieldClass} w-full tabular-nums`}
    />
  )
}

function OptionalNumberField({
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
  const { inputProps } = useNumberFieldDraft({ value, min, max, onChange })

  return (
    <input
      aria-label={ariaLabel}
      type="number"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onClick={stopFieldPropagation}
      onPointerDown={stopFieldPropagation}
      {...inputProps}
      onKeyDown={(event) => {
        stopFieldPropagation(event)
        inputProps.onKeyDown(event)
      }}
      className={`${fieldClass} w-full tabular-nums`}
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
    // [&_input]:w-0 zeroes the draft input's intrinsic width so its flex-1 fill
    // decides the rendered width; without it the field's min-content (~13rem)
    // blows out the narrow stacked-row columns (#685).
    <div
      className="min-w-0 grow [&_input]:w-0"
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
      className={`${fieldClass} disabled:opacity-40`}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={option.value} disabled={option.disabled}>
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

function SectionAddButton({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  title: string
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      className={sectionActionButtonClass}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      <Plus size={13} aria-hidden />
      {label}
    </Button>
  )
}

function RemoveRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="absolute right-2 top-2 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-red-300"
    >
      <Trash2 size={14} aria-hidden />
    </button>
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
  installedMapPresentation,
  onDeclareOutputProfile,
}: {
  profile: ControllerProfile
  controller: ControllerEntry | null
  installedMapPresentation: InstalledMapPresentationView
  onDeclareOutputProfile: (outputProfile: ControllerOutputProfile) => void
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
                <CircleArrowUp size={12} aria-hidden />
                Update available
              </span>
            )}
          </span>
        </span>
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
        <HelpHint label="About the declared output profile">
          <div className="space-y-1.5 text-zinc-300">
            <p>Your declaration - the device cannot report or verify output wiring.</p>
            <p className="text-zinc-400">
              It changes nothing in pushed code. It labels performance measurements:
              serial, expander, and clocked outputs have different frame-rate ceilings,
              so results are only comparable within one declared profile.
            </p>
          </div>
        </HelpHint>
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

function formatElectricalPair(amps: number | null, watts: number | null): string {
  if (amps != null && watts != null) return `${amps.toFixed(1)} A · ${watts.toFixed(1)} W`
  if (amps != null) return `${amps.toFixed(1)} A`
  if (watts != null) return `${watts.toFixed(1)} W`
  return 'Needs more information'
}

function ElectricalProfileEditor({
  electricalProfile,
  pixelCount,
  onChange,
}: {
  electricalProfile?: ControllerElectricalProfile
  pixelCount?: number
  onChange: (profile: ControllerElectricalProfile) => void
}) {
  if (!electricalProfile) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-zinc-700/80 bg-zinc-950/30 px-3 py-3">
        <div>
          <div className="text-xs text-zinc-300">Describe the installed LEDs once.</div>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            PXLBLZ can then express the same supply budget in amps, watts, and duty.
          </p>
        </div>
        <Button type="button" size="xs" variant="outline" onClick={() => onChange(defaultElectricalProfile())}>
          Configure electrical model
        </Button>
      </div>
    )
  }

  const profile = electricalProfile
  const resolved = resolveControllerElectricalProfile(electricalProfile, { pixelCount })
  const selectedPreset = findLedConstructionPreset(electricalProfile.ledPresetId)
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
    onChange({ ...profile, ...changes })
  }

  function changePreset(ledPresetId: LedConstructionPresetId) {
    if (ledPresetId !== 'custom') {
      onChange({ ledPresetId, supplyBudget: profile.supplyBudget })
      return
    }
    if (!pixelCount) return
    if (override) {
      onChange({
        ...profile,
        ledPresetId,
        ...(resolved.voltageVolts ? { voltageOverride: resolved.voltageVolts } : {}),
      })
      return
    }
    const fullWhiteWatts = resolved.fullWhiteWatts
    if (fullWhiteWatts == null) return
    onChange({
      ledPresetId,
      supplyBudget: profile.supplyBudget,
      ...(resolved.voltageVolts ? { voltageOverride: resolved.voltageVolts } : {}),
      loadOverride: {
        fullWhite: { value: fullWhiteWatts, unit: 'watts' },
        source: 'custom',
        atPixelCount: pixelCount,
      },
    })
  }

  function changeBudgetUnit(unit: ElectricalUnit) {
    const converted = convertElectricalQuantity(
      profile.supplyBudget,
      unit,
      resolved.voltageVolts,
    )
    if (converted) update({ supplyBudget: converted })
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

  return (
    <div className="overflow-hidden border border-zinc-800 bg-zinc-950/40">
      <div className="grid gap-3 px-3 py-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
        <LabeledField label="LED construction">
          <SelectField
            ariaLabel="LED construction preset"
            value={electricalProfile.ledPresetId}
            options={presetOptions}
            onChange={changePreset}
          />
          {selectedPreset ? (
            <span className="text-[10px] leading-4 text-zinc-500">
              {selectedPreset.description}. Preset estimate: {selectedPreset.assumption}.{' '}
              <a
                href={selectedPreset.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200"
              >
                Worldsemi reference
              </a>
            </span>
          ) : (
            <span className="text-[10px] leading-4 text-zinc-500">
              A measured or manufacturer-rated installation total.
            </span>
          )}
        </LabeledField>
        <LabeledField label="Continuous LED supply budget">
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-1.5">
            <NumberField
              ariaLabel="Continuous LED supply budget"
              min={0.01}
              step={0.1}
              value={electricalProfile.supplyBudget.value}
              onChange={(value) => update({
                supplyBudget: { ...electricalProfile.supplyBudget, value },
              })}
            />
            <SelectField
              ariaLabel="Continuous LED supply budget unit"
              value={electricalProfile.supplyBudget.unit}
              options={[
                {
                  value: 'amps',
                  label: 'Amps',
                  disabled: profile.supplyBudget.unit !== 'amps' && resolved.voltageVolts == null,
                },
                {
                  value: 'watts',
                  label: 'Watts',
                  disabled: profile.supplyBudget.unit !== 'watts' && resolved.voltageVolts == null,
                },
              ]}
              onChange={changeBudgetUnit}
            />
          </div>
          <span className="text-[10px] leading-4 text-zinc-500">
            Use the continuous rating available to the LEDs, after other loads.
          </span>
        </LabeledField>
      </div>

      <div className="grid gap-px border-y border-zinc-800 bg-zinc-800 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
        <ElectricalMetric label="Addresses" value={pixelCount ? String(pixelCount) : 'Waiting for controller'} />
        <ElectricalMetric
          label={override ? 'Full-white load (override)' : 'Full-white load (estimate)'}
          value={formatElectricalPair(resolved.fullWhiteAmps, resolved.fullWhiteWatts)}
        />
        <ElectricalMetric
          label="Derived duty cap"
          value={resolved.maxDuty == null ? 'Unavailable' : `${Math.round(resolved.maxDuty * 100)}%`}
          accent={resolved.maxDuty != null}
        />
      </div>

      {resolved.overrideStale && pixelCount && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/25 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200">
          <span>This total was recorded at {override?.atPixelCount} addresses; the controller now reports {pixelCount}.</span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => override && update({ loadOverride: { ...override, atPixelCount: pixelCount } })}
          >
            Confirm for {pixelCount}
          </Button>
        </div>
      )}

      {!pixelCount && (
        <div className="border-b border-amber-500/20 bg-amber-950/10 px-3 py-2 text-[11px] text-amber-200/90">
          Connect or configure this controller to supply its address count. PXLBLZ will not invent one for power calculations.
        </div>
      )}

      <details className="group px-3 py-2.5">
        <summary className="cursor-pointer select-none text-[11px] font-medium text-zinc-400 hover:text-zinc-200">
          Advanced: measured or manufacturer-rated total
        </summary>
        <div className="mt-3 grid gap-3 border-l border-zinc-800 pl-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))]">
          <label className="flex items-center gap-2 text-[11px] text-zinc-300 [grid-column:1/-1]">
            <input
              type="checkbox"
              aria-label="Override estimated full-white load"
              checked={Boolean(override)}
              disabled={!pixelCount || electricalProfile.ledPresetId === 'custom'}
              onChange={(event) => event.target.checked
                ? enableOverride()
                : onChange({
                    ledPresetId: electricalProfile.ledPresetId,
                    supplyBudget: electricalProfile.supplyBudget,
                  })}
              className="accent-live disabled:opacity-40"
            />
            Override the estimated full-white installation load
          </label>
          {override && (
            <>
              <LabeledField label="Full-white total">
                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-1.5">
                  <NumberField
                    ariaLabel="Full-white installation total"
                    min={0.01}
                    step={0.1}
                    value={override.fullWhite.value}
                    onChange={(value) => update({
                      loadOverride: {
                        ...override,
                        fullWhite: { ...override.fullWhite, value },
                      },
                    })}
                  />
                  <SelectField
                    ariaLabel="Full-white installation total unit"
                    value={override.fullWhite.unit}
                    options={[
                      {
                        value: 'amps',
                        label: 'Amps',
                        disabled: override.fullWhite.unit !== 'amps' && resolved.voltageVolts == null,
                      },
                      {
                        value: 'watts',
                        label: 'Watts',
                        disabled: override.fullWhite.unit !== 'watts' && resolved.voltageVolts == null,
                      },
                    ]}
                    onChange={(unit) => {
                      const converted = convertElectricalQuantity(
                        override.fullWhite,
                        unit,
                        resolved.voltageVolts,
                      )
                      if (converted) update({
                        loadOverride: { ...override, fullWhite: converted },
                      })
                    }}
                  />
                </div>
              </LabeledField>
              <LabeledField label="Source">
                <SelectField<ElectricalLoadSource>
                  ariaLabel="Full-white load source"
                  value={override.source}
                  options={[
                    { value: 'measured', label: 'Measured' },
                    { value: 'manufacturer-rated', label: 'Manufacturer-rated' },
                    { value: 'custom', label: 'Custom estimate' },
                  ]}
                  onChange={(source) => update({ loadOverride: { ...override, source } })}
                />
              </LabeledField>
              <LabeledField label="Supply voltage (for A/W conversion)">
                <OptionalNumberField
                  ariaLabel="Electrical supply voltage"
                  min={0.1}
                  step={0.1}
                  value={electricalProfile.voltageOverride ?? resolved.voltageVolts ?? undefined}
                  placeholder="Enter voltage"
                  onChange={(voltageOverride) => update({ voltageOverride })}
                />
              </LabeledField>
            </>
          )}
        </div>
      </details>

      <div className="border-t border-zinc-800 px-3 py-2 text-[10px] leading-4 text-zinc-500">
        Estimates are planning aids, not measurements. Size wire, fusing, injection, and supply headroom for the actual installation.
      </div>
    </div>
  )
}

function ElectricalMetric({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="bg-zinc-950/90 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-0.5 font-mono text-xs ${accent ? 'text-amber-300' : 'text-zinc-300'}`}>{value}</div>
    </div>
  )
}

function InputsList({
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
    <ul className="grid gap-2">
      {profile.inputs.map((input) => {
        const pinWarn = input.signal === 'analog' && !analogPins.includes(input.pin)
        return (
          <li key={input.id} className={`${rowCardClass} pr-9`}>
            <RemoveRowButton label={`Remove ${input.name}`} onClick={() => onRemoveInput(input.id)} />
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <LabeledField label="Name" className="w-36 grow">
                <TextField
                  ariaLabel={`${input.name} input name`}
                  value={input.name}
                  onChange={(name) => onUpdateInput(input.id, { name })}
                />
              </LabeledField>
              <LabeledField label="Pin" className="w-20">
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
              </LabeledField>
              <LabeledField label="Signal" className="w-24">
                <SelectField
                  ariaLabel={`${input.name} signal`}
                  value={input.signal}
                  options={signalOptions}
                  onChange={(signal) => onUpdateInput(input.id, { signal })}
                />
              </LabeledField>
              <LabeledField label="Role" className="w-28">
                <SelectField
                  ariaLabel={`${input.name} role`}
                  value={input.role}
                  options={roleOptions}
                  onChange={(role) => onUpdateInput(input.id, { role })}
                />
              </LabeledField>
              <LabeledField label="Smoothing" className="w-24">
                <PercentageField
                  ariaLabel={`${input.name} smoothing`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={input.smoothing}
                  onChange={(smoothing) => onUpdateInput(input.id, { smoothing })}
                />
              </LabeledField>
              <LabeledField label="Fallback" className="w-24">
                <PercentageField
                  ariaLabel={`${input.name} fallback`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={input.fallback}
                  onChange={(fallback) => onUpdateInput(input.id, { fallback })}
                />
              </LabeledField>
              <LabeledField label="Direction">
                <div className="flex h-7 items-center gap-2 whitespace-nowrap">
                  <span className="font-mono text-xs text-zinc-300">
                    {input.invert ? '1 → 0' : '0 → 1'}
                  </span>
                  <label
                    className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-400"
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
              </LabeledField>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const transformHelp: Record<GlobalTransform['type'], string> = {
  'hardware-brightness': 'Samples this input once per frame and multiplies brightness for hsv() output.',
  'power-cap': 'Limits estimated output duty for hsv() and rgb(). paint() output is not covered.',
}

function GlobalTransformsList({
  profile,
  onUpdateTransforms,
}: {
  profile: ControllerProfile
  onUpdateTransforms: (transforms: GlobalTransform[]) => void
}) {
  function updateTransform(transformId: string, changes: Partial<GlobalTransform>) {
    onUpdateTransforms(profile.globalTransforms.map((transform) =>
      transform.id === transformId ? { ...transform, ...changes } as GlobalTransform : transform,
    ))
  }

  return (
    <div className="grid gap-2">
      <p className="border-l-2 border-live/35 bg-zinc-900/45 px-2.5 py-2 text-[11px] leading-4 text-zinc-400">
        Transforms take effect when a Pattern is pushed. Push saved Patterns again after changing them.
      </p>
      {profile.globalTransforms.map((transform) => (
        <div key={transform.id} className={rowCardClass}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
              <input
                type="checkbox"
                aria-label={`${transform.type} enabled`}
                checked={transform.enabled}
                disabled={transform.type === 'hardware-brightness' && profile.inputs.length === 0}
                onChange={(event) => updateTransform(transform.id, { enabled: event.target.checked })}
                className="accent-live disabled:opacity-40"
              />
              {transform.type}
            </label>
            <HelpHint label={`About ${transform.type}`}>
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wide text-zinc-400">{transform.mixinId}</div>
                <p className="text-zinc-300">{transformHelp[transform.type]}</p>
              </div>
            </HelpHint>
            {transform.type === 'hardware-brightness' && (
              <div className="ml-auto w-56 max-w-full">
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
              </div>
            )}
          </div>
          {transform.type === 'power-cap' && (
            <div className="mt-2">
              <PowerCapEditor
                transform={transform}
                electricalProfile={profile.electricalProfile}
                pixelCount={profile.lastKnownPixelCount}
                onChange={(settings) => updateTransform(transform.id, settings)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PowerCapEditor({
  transform,
  electricalProfile,
  pixelCount,
  onChange,
}: {
  transform: PowerCapTransform
  electricalProfile?: ControllerElectricalProfile
  pixelCount?: number
  onChange: (settings: PowerCapSettings) => void
}) {
  const resolved = electricalProfile
    ? resolveControllerElectricalProfile(electricalProfile, { pixelCount })
    : null
  const derivedDuty = resolved?.maxDuty ?? null
  const displayedDuty = transform.mode === 'derived' && derivedDuty != null
    ? derivedDuty
    : transform.maxDuty

  return (
    <div className="w-full min-w-0 max-w-[32rem] rounded border border-zinc-800 bg-zinc-950/70">
      <div className="border-b border-zinc-800/80 px-3 py-2">
        <div className="inline-flex items-center rounded border border-zinc-800 bg-zinc-950/60 p-0.5" aria-label="Power cap mode">
          {([
            ['derived', 'From electrical profile'],
            ['direct', 'Set duty directly'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={transform.mode === mode}
              disabled={mode === 'derived' && derivedDuty == null}
              onClick={() => mode === 'derived' && derivedDuty != null
                ? onChange({ ...transform, mode: 'derived', maxDuty: derivedDuty })
                : onChange({ ...transform, mode: 'direct' })}
              className={`rounded-sm px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                transform.mode === mode ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {transform.mode === 'derived' ? (
        <div className="border-t border-zinc-800/80 px-3 py-2.5 text-[11px] leading-4 text-zinc-400">
          {derivedDuty != null ? (
            <>Uses the installation load and supply budget above. Editing either keeps this cap synchronized.</>
          ) : (
            <>Add a complete electrical profile above to derive this cap. The stored legacy duty remains unchanged.</>
          )}
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
              onChange={(maxDuty) => onChange({ ...transform, mode: 'direct', maxDuty })}
            />
          </PowerCapField>
        </div>
      )}

      <div className="border-t border-zinc-800/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-400">
        <span className="block font-semibold text-amber-300">{Math.round(displayedDuty * 100)}% duty cap</span>
        {resolved?.budgetAmps != null && resolved.budgetWatts != null && (
          <span className="block">budget {resolved.budgetAmps.toFixed(1)} A · {resolved.budgetWatts.toFixed(1)} W</span>
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
    <label className="grid grid-cols-[minmax(0,1fr)_minmax(6.5rem,8rem)_auto] items-center gap-1.5">
      <span className="min-w-0 text-[10px] leading-tight text-zinc-400">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        {children}
        {unit && <span className="shrink-0 text-[10px] text-zinc-400">{unit}</span>}
      </span>
      {hint && <span className="col-span-full text-[10px] text-amber-300/80">⚡ {hint}</span>}
    </label>
  )
}

function BindingDraftRow({
  profile,
  patternOptions,
  online,
  onAddBinding,
  onCancelDraft,
}: {
  profile: ControllerProfile
  patternOptions: SelectOption<string>[]
  online: boolean
  onAddBinding: (patternId: string) => void
  onCancelDraft: () => void
}) {
  return (
    <li className={`${rowCardClass} pr-9`}>
      <button
        type="button"
        aria-label="Cancel new binding"
        title="Cancel new binding"
        onClick={onCancelDraft}
        className="absolute right-2 top-2 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-red-300"
      >
        <X size={14} aria-hidden />
      </button>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <LabeledField label="Pattern" className="w-56 grow">
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
            className={`${fieldClass} w-full disabled:opacity-40`}
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
        </LabeledField>
        <LabeledField label="Input">
          <span className="flex h-7 items-center text-xs text-zinc-500">
            {profile.inputs[0]?.name ?? '-'}
          </span>
        </LabeledField>
        <LabeledField label="Target">
          <span className="flex h-7 items-center text-xs text-zinc-500">exported slider</span>
        </LabeledField>
        <LabeledField label="Name">
          <span className="flex h-7 items-center font-mono text-xs text-zinc-500">sliderSpeed</span>
        </LabeledField>
      </div>
    </li>
  )
}

function PatternBindingsList({
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
    <ul className="grid gap-2">
      {draftOpen && (
        <BindingDraftRow
          profile={profile}
          patternOptions={patternOptions}
          online={online}
          onAddBinding={onAddBinding}
          onCancelDraft={onCancelDraft}
        />
      )}
      {profile.patternBindings.map((binding) => (
        <li key={binding.id} className={`${rowCardClass} pr-9`}>
          <RemoveRowButton label="Remove binding" onClick={() => onRemoveBinding(binding.id)} />
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <LabeledField label="Pattern" className="w-48 grow">
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
            </LabeledField>
            <LabeledField label="Input" className="w-32">
              <SelectField
                ariaLabel="Binding input"
                value={binding.inputId}
                options={profile.inputs.map((input) => ({ value: input.id, label: input.name }))}
                onChange={(inputId) => onUpdateBinding(binding.id, { inputId })}
              />
            </LabeledField>
            <LabeledField label="Target" className="w-32">
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
            </LabeledField>
            <LabeledField label="Name" className="w-32">
              <TextField
                ariaLabel="Binding target name"
                value={binding.target.name}
                onChange={(name) => onUpdateBinding(binding.id, { target: { ...binding.target, name } })}
              />
            </LabeledField>
            {binding.target.kind === 'assign-variable' && (
              <LabeledField label="Min / max / quantize" className="w-44">
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
              </LabeledField>
            )}
            {patternBindingOverridesHardwareBrightness(profile, binding) && (
              <span className="flex h-7 items-center self-end">
                <span
                  title="This input controls the Pattern binding instead of hardware brightness while this Pattern runs."
                  className={`inline-flex whitespace-nowrap border border-zinc-700/80 bg-zinc-900/70 px-1.5 py-0.5 font-mono font-semibold uppercase tracking-wide text-zinc-400 ${IDE_MICROTYPE.required.sizeClassName}`}
                >
                  Brightness override
                </span>
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
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
      <table className="w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col className="w-[30%]" />
          <col />
          <col className="w-16" />
          <col className="w-10" />
        </colgroup>
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
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-400">
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
  const transformArtifacts = useControllerStore((state) => state.lastTransformArtifacts)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const userMaps = useMapStore((state) => state.userMaps)
  const profile = profiles.find((item) => item.id === profileId)
  const profileController = profile ? controllerForProfile(profile, controllers) : null
  const liveIp = profileController?.phase === 'live' ? profileController.ip : undefined
  const controllerPrograms = useControllerPanelStore((state) => (
    liveIp ? state.programsByController[liveIp] ?? EMPTY_CONTROLLER_PROGRAMS : EMPTY_CONTROLLER_PROGRAMS
  ))
  const profileRefreshId = profile?.id
  const [controllerBindingsRead, setControllerBindingsRead] = useState<{
    controllerId: string
    bindings: BindingStore
  } | null>(null)
  const [bindingDraftOpen, setBindingDraftOpen] = useState(false)

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
  const installedMapPresentation = describeInstalledMap({
    observation: installedMapObservation,
    profile,
    candidates: installedMapCandidates,
  })

  return (
    <div data-testid="controller-profile-page" className="h-full overflow-y-auto bg-zinc-950 text-zinc-200">
      <ProfileStatus
        profile={profile}
        controller={profileController}
        installedMapPresentation={installedMapPresentation}
        onDeclareOutputProfile={(outputProfile) => void updateProfile(profile.id, { outputProfile })}
      />
      {!validation.ok && (
        <div className="border-b border-amber-500/30 bg-amber-950/20 px-4 py-2 text-xs text-amber-200">
          {validation.errors.map((error) => error.message).join(' ')}
        </div>
      )}
      <Section title="Electrical">
        <ElectricalProfileEditor
          electricalProfile={profile.electricalProfile}
          pixelCount={profile.lastKnownPixelCount}
          onChange={(electricalProfile) => void updateProfile(profile.id, {
            electricalProfile,
            globalTransforms: synchronizeDerivedPowerCaps(
              profile.globalTransforms,
              electricalProfile,
              profile.lastKnownPixelCount,
            ),
          })}
        />
      </Section>
      <Section
        title="Hardware inputs"
        action={
          <SectionAddButton
            label="Add input"
            title="Add hardware input"
            onClick={() => void addInput(profile.id)}
          />
        }
      >
        <InputsList
          profile={profile}
          onUpdateInput={(inputId, changes) => void updateInput(profile.id, inputId, changes)}
          onRemoveInput={(inputId) => void removeInput(profile.id, inputId)}
        />
      </Section>
      <Section title="Global transforms">
        <GlobalTransformsList
          profile={profile}
          onUpdateTransforms={(globalTransforms) => void updateProfile(profile.id, { globalTransforms })}
        />
      </Section>
      <Section
        title="Pattern bindings"
        action={
          <SectionAddButton
            label="Add binding"
            title="Add pattern binding"
            disabled={profile.inputs.length === 0}
            onClick={() => setBindingDraftOpen(true)}
          />
        }
      >
        <PatternBindingsList
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
          <SectionAddButton
            label="Add zone"
            title="Add zone"
            onClick={() => void addZone(profile.id)}
          />
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
