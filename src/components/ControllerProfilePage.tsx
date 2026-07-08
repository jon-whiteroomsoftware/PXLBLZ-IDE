import { useEffect } from 'react'
import {
  Circle,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  analogPinsForBoard,
  validateControllerProfile,
  type ControllerBindingTarget,
  type ControllerInput,
  type ControllerInputRole,
  type ControllerInputSignal,
  type ControllerProfile,
  type GlobalTransform,
  type PatternBinding,
} from '@/engine/controllerProfile'
import { useControllerStore } from '@/store/controllerStore'
import {
  CONTROLLER_INPUT_ROLES,
  CONTROLLER_INPUT_SIGNALS,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'

const fieldClass =
  'h-7 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'
const tableHeadClass = 'px-2 py-1 text-left text-[10px] font-semibold uppercase text-zinc-500'
const tableCellClass = 'border-t border-zinc-800/85 px-2 py-1.5 align-middle'

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

function statusForProfile(
  profile: ControllerProfile,
  controllers: ReturnType<typeof useControllerStore.getState>['controllers'],
) {
  if (!profile.deviceId) return null
  return Object.values(controllers).find(
    (entry) => entry.phase === 'live' && entry.deviceId === profile.deviceId,
  ) ?? null
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
  return (
    <input
      aria-label={ariaLabel}
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (Number.isFinite(next)) onChange(next)
      }}
      className={`${fieldClass} tabular-nums`}
    />
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
  connectedIp,
  onRefresh,
}: {
  profile: ControllerProfile
  connectedIp?: string
  onRefresh: () => void
}) {
  const connected = connectedIp !== undefined
  return (
    <div className="border-b border-seam bg-zinc-950/35 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="flex items-center gap-2 font-mono text-zinc-200">
          <Circle
            size={9}
            fill={connected ? 'currentColor' : 'transparent'}
            className={connected ? 'text-live' : 'text-zinc-600'}
            aria-hidden
          />
          {connected ? 'Connected' : 'Offline'}
        </span>
        <span>
          <FieldLabel>Device</FieldLabel>{' '}
          <span className="text-zinc-300">{formatMaybe(profile.lastKnownDeviceName, 'Unclaimed')}</span>
        </span>
        <span>
          <FieldLabel>IP</FieldLabel>{' '}
          <span className="font-mono text-zinc-300">{connectedIp ?? formatMaybe(profile.lastSeenIp)}</span>
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
          disabled={!connected}
          onClick={onRefresh}
          title="Refresh controller metadata"
        >
          <RefreshCw size={13} aria-hidden />
          Refresh
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Live controller controls stay in the top bar dropdown.
      </p>
    </div>
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
            <th className={tableHeadClass}>Invert</th>
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
                  <NumberField
                    ariaLabel={`${input.name} smoothing`}
                    min={0}
                    max={1}
                    step={0.01}
                    value={input.smoothing}
                    onChange={(smoothing) => onUpdateInput(input.id, { smoothing })}
                  />
                </td>
                <td className={tableCellClass}>
                  <NumberField
                    ariaLabel={`${input.name} fallback`}
                    min={0}
                    max={1}
                    step={0.01}
                    value={input.fallback}
                    onChange={(fallback) => onUpdateInput(input.id, { fallback })}
                  />
                </td>
                <td className={tableCellClass}>
                  <input
                    type="checkbox"
                    aria-label={`${input.name} invert`}
                    checked={input.invert}
                    onChange={(event) => onUpdateInput(input.id, { invert: event.target.checked })}
                    className="accent-live"
                  />
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] border-collapse text-xs">
        <thead>
          <tr>
            <th className={tableHeadClass}>Enabled</th>
            <th className={tableHeadClass}>Transform</th>
            <th className={tableHeadClass}>Mixin</th>
            <th className={tableHeadClass}>Input / Limit</th>
          </tr>
        </thead>
        <tbody>
          {profile.globalTransforms.map((transform) => (
            <tr key={transform.id}>
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
              <td className={`${tableCellClass} font-mono text-zinc-300`}>{transform.type}</td>
              <td className={`${tableCellClass} font-mono text-zinc-500`}>{transform.mixinId}</td>
              <td className={tableCellClass}>
                {transform.type === 'hardware-brightness' ? (
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
                ) : (
                  <NumberField
                    ariaLabel="Power cap milliamps"
                    min={1}
                    value={transform.maxMilliamps}
                    onChange={(maxMilliamps) => updateTransform(transform.id, { maxMilliamps })}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PatternBindingsTable({
  profile,
  onUpdateBinding,
  onRemoveBinding,
}: {
  profile: ControllerProfile
  onUpdateBinding: (bindingId: string, changes: Partial<PatternBinding>) => void
  onRemoveBinding: (bindingId: string) => void
}) {
  if (profile.patternBindings.length === 0) {
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
          {profile.patternBindings.map((binding) => (
            <tr key={binding.id}>
              <td className={tableCellClass}>
                <TextField
                  ariaLabel="Pattern id"
                  value={binding.patternId}
                  onChange={(patternId) => onUpdateBinding(binding.id, { patternId })}
                />
              </td>
              <td className={tableCellClass}>
                <SelectField
                  ariaLabel="Binding input"
                  value={binding.inputId}
                  options={profile.inputs.map((input) => ({ value: input.id, label: input.name }))}
                  onChange={(inputId) => onUpdateBinding(binding.id, { inputId })}
                />
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
  onUpdateZone: (zoneId: string, changes: { name?: string; start?: number; end?: number }) => void
  onRemoveZone: (zoneId: string) => void
}) {
  if (profile.zones.length === 0) return <EmptyState>No zones have been defined for this controller.</EmptyState>

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-xs">
        <thead>
          <tr>
            <th className={tableHeadClass}>Name</th>
            <th className={tableHeadClass}>Start</th>
            <th className={tableHeadClass}>End</th>
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
                <NumberField
                  ariaLabel={`${zone.name} zone start`}
                  min={0}
                  value={zone.start}
                  onChange={(start) => onUpdateZone(zone.id, { start })}
                />
              </td>
              <td className={tableCellClass}>
                <NumberField
                  ariaLabel={`${zone.name} zone end`}
                  min={0}
                  value={zone.end}
                  onChange={(end) => onUpdateZone(zone.id, { end })}
                />
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
  const profile = profiles.find((item) => item.id === profileId)
  const live = profile ? statusForProfile(profile, controllers) : null
  const liveIp = live?.ip
  const profileRefreshId = profile?.id

  useEffect(() => {
    if (profileRefreshId && liveIp) void refreshLiveMetadata(profileRefreshId)
  }, [liveIp, profileRefreshId, refreshLiveMetadata])

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-zinc-500">
        {profilesLoaded ? 'Controller profile not found.' : 'Loading controller profile...'}
      </div>
    )
  }

  const validation = validateControllerProfile(profile)

  return (
    <div data-testid="controller-profile-page" className="h-full overflow-y-auto bg-zinc-950 text-zinc-200">
      <ProfileStatus
        profile={profile}
        connectedIp={live?.ip}
        onRefresh={() => void refreshLiveMetadata(profile.id)}
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
            onClick={() => void addPatternBinding(profile.id)}
            title="Add pattern binding"
          >
            <Plus size={13} aria-hidden />
            Binding
          </Button>
        }
      >
        <PatternBindingsTable
          profile={profile}
          onUpdateBinding={(bindingId, changes) => void updatePatternBinding(profile.id, bindingId, changes)}
          onRemoveBinding={(bindingId) => void removePatternBinding(profile.id, bindingId)}
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
