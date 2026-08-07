import { useEffect, useSyncExternalStore } from 'react'
import { ExternalLink } from 'lucide-react'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { useEditorStore } from '@/store/editorStore'
import {
  describeControllerPanel,
  shapeControllerControls,
  controllerSliderValue,
  describeControllerVars,
  describeControllerPowerTelemetry,
  formatDutyCapPercent,
} from '@/engine/controllerPanelView'
import {
  DeckSection,
  DeckSectionHint,
  DeckGrid,
  DeckCell,
  DeckTelemetry,
} from '@/components/Deck'
import { DeckSlider } from '@/components/DeckSlider'
import { PixelCountPopover } from '@/components/PixelCountPopover'
import { findProfileForLiveController } from '@/engine/controllerProfilePassRecipe'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useMapStore } from '@/store/mapStore'
import { describeInstalledMap } from '@/engine/installedMapObservation'
import {
  InstalledMapPresentation,
  useInstalledMapCandidates,
} from '@/components/InstalledMapPresentation'

// The live Controller panel (H6, issue #198). A dashboard built from the *same*
// shared deck template as the preview control deck — read-only telemetry (active
// pattern, reported FPS) plus the panel-owned brightness slider. The Controller
// instance has fewer affordances than the preview deck: none of the preview-only
// settings (light size, grid, camera). H7 (#199) fills the same template with the
// device's user controls and a variable readout.
//
// Renders only while a Controller is connected — the polling store drives the
// live values; this is a thin presentational shell over it and the provider seam.

const PANEL_HINT = (
  <DeckSectionHint
    items={[
      ['pattern', 'the pattern the Controller is currently running'],
      ['brightness', 'master output level on the device — applied live'],
      ['map', 'the installed map’s exact-byte identity, dimension, and point count'],
      ['pixel count', 'number of pixels configured on the device — editable; saved to the device so it survives a reboot'],
      ['IP', 'the device’s address on the local network'],
      ['fps', 'frame rate the device reports'],
    ]}
  />
)

// The pattern-controls help hint, built from whatever descriptions we have for the
// running pattern's controls (matched by name to the loaded pattern's metadata, #190).
// Mirrors the preview deck's pattern-controls hover: a label-keyed list of what each
// control does. Returns null when no control carries a description, so the caller can
// omit the help affordance entirely rather than show an empty "?".
function buildControlsHint(controls: { name: string; label: string; description?: string }[]) {
  if (!controls.some((c) => c.description)) return null
  return (
    <div className="flex flex-col gap-1.5 normal-case tracking-normal">
      {controls.map((c) => (
        <div key={c.name} className="leading-snug">
          <span className="text-zinc-200">{c.label}</span>
          {c.description && <span className="text-zinc-400"> — {c.description}</span>}
        </div>
      ))}
    </div>
  )
}

const VARS_HINT = (
  <DeckSectionHint
    intro="The running pattern's exported variables, read live from the device. Read-only — a watch window, not an editor."
    items={[['value', 'the variable’s current value on the device']]}
  />
)

const POWER_HINT = (
  <DeckSectionHint
    intro="Output duty is estimated from emitted hsv values. The left value is a roughly two-second block average; the right is the average since start. The cap responds from a faster internal signal than either display. The live cap is volatile: re-pushing restores the Controller Profile default, and patterns pushed before live control was added need a re-push. Draw is contextual, not measured, and follows the live Controller brightness above."
    items={[
      ['duty recent / start', 'calm recent-window duty followed by the cumulative run average, both before native Controller brightness'],
      ['duty cap', 'configured normalized output budget, when a limiter is active'],
      ['est. draw', 'calculated from duty, live pixel count, full-white current, and current Controller brightness — not an ammeter reading'],
      ['scale', 'output scale applied by a limiter; 100% means measurement only'],
      ['limiting', 'whether the limiter is currently intervening'],
    ]}
  />
)

function ControllerPixelCountInput() {
  const pixelCount = useControllerPanelStore((s) => s.pixelCount)
  const setPixelCount = useControllerPanelStore((s) => s.setPixelCount)
  // While a saved count write is in flight the input is dimmed and disabled so the
  // slow write reads as deliberate, and it keeps showing the entered value (#213).
  const pending = useControllerPanelStore((s) => s.pixelCountPending) != null

  function commit(n: number) {
    if (n !== pixelCount) setPixelCount(n)
  }

  return (
    <PixelCountPopover
      value={pixelCount}
      triggerLabel="Edit controller pixel count"
      inputLabel="Controller pixel count"
      disabled={pending}
      pending={pending}
      onApply={commit}
    />
  )
}

export function ControllerPanel() {
  // Re-render (and so re-subscribe to the active provider below) when the active
  // Controller changes — the panel is bound to the active Controller (#210).
  const activeIp = useControllerStore((s) => s.activeIp)
  const controllerEntry = useControllerStore((s) =>
    s.activeIp ? s.controllers[s.activeIp] : undefined,
  )
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )
  const connected = status.kind === 'connected'

  const start = useControllerPanelStore((s) => s.start)
  const stop = useControllerPanelStore((s) => s.stop)
  const refreshInstalledMap = useControllerStore((s) => s.refreshInstalledMap)
  // Poll only while connected; tear the polling down on disconnect/unmount. Keyed
  // on the active Controller so switching pills restarts polling against the new
  // device (a fresh seed of brightness/controls) rather than fighting stale state.
  useEffect(() => {
    if (!connected) return
    start(activeIp ?? undefined)
    if (activeIp) void refreshInstalledMap(activeIp)
    return () => stop()
  }, [connected, activeIp, refreshInstalledMap, start, stop])

  const brightness = useControllerPanelStore((s) => s.brightness)
  const activeProgramId = useControllerPanelStore((s) => s.activeProgramId)
  const programs = useControllerPanelStore((s) => s.programs)
  const programLabels = useControllerPanelStore((s) => s.programLabels)
  const fps = useControllerPanelStore((s) => s.fps)
  const pixelCount = useControllerPanelStore((s) => s.pixelCount)
  const activeControls = useControllerPanelStore((s) => s.activeControls)
  const vars = useControllerPanelStore((s) => s.vars)
  const setBrightness = useControllerPanelStore((s) => s.setBrightness)
  const setControl = useControllerPanelStore((s) => s.setControl)
  const setPowerLimit = useControllerPanelStore((s) => s.setPowerLimit)
  const controllerProfiles = useControllerProfileStore((s) => s.profiles)
  const userMaps = useMapStore((s) => s.userMaps)
  // Control help text isn't reported by the device; borrow it from the loaded
  // pattern's metadata, matched by control name (#190). When the editor holds a
  // different pattern (or a user/imported one with no descriptions) nothing matches
  // and the controls section shows no help affordance at all.
  const editorControls = useEditorStore((s) => s.controls)
  const installedMapPointCount = controllerEntry?.installedMap?.status === 'present'
    ? controllerEntry.installedMap.pointCount
    : null
  const installedMapCandidates = useInstalledMapCandidates(userMaps, installedMapPointCount)

  if (!connected) return null

  const controlDescriptions: Record<string, string> = {}
  for (const c of editorControls) {
    if (c.description) controlDescriptions[c.exportName] = c.description
  }

  const activeProfile = findProfileForLiveController(controllerProfiles, {
    ip: status.controller.address,
    deviceId: status.controller.deviceId,
  })
  const installedMap = controllerEntry?.installedMap ?? { status: 'loading' as const }
  const mapPointCount = installedMap.status === 'present' ? installedMap.pointCount : null
  const installedMapPresentation = describeInstalledMap({
    observation: installedMap,
    profile: activeProfile,
    candidates: installedMapCandidates,
  })
  const { fpsLabel, pixelsLabel, mapPointsLabel, mapCountMismatch } =
    describeControllerPanel({
      activeProgramId,
      programs,
      programLabels,
      fps,
      pixelCount,
      mapPointCount,
    })
  const controls = shapeControllerControls(activeControls, controlDescriptions)
  const controlsHint = buildControlsHint(controls)
  const powerCapSettings = activeProfile?.globalTransforms.find(
    (transform) => transform.type === 'power-cap',
  )
  const powerTelemetry = describeControllerPowerTelemetry(
    vars,
    powerCapSettings && pixelCount != null && brightness != null
      ? {
          settings: powerCapSettings,
          pixelCount,
          brightness,
          electricalProfile: activeProfile?.electricalProfile,
        }
      : undefined,
  )
  const watchedVars = describeControllerVars(vars)
  const installedFirmware = controllerEntry?.firmwareVersion
    ? controllerEntry.firmwareVersion.startsWith('v')
      ? controllerEntry.firmwareVersion
      : `v${controllerEntry.firmwareVersion}`
    : null

  return (
    <div className="font-mono pl-3 text-xs" data-testid="controller-panel">
      {controllerEntry?.firmwareUpdateState === 'available' && (
        <div
          role="status"
          className="mb-2 flex items-center justify-between gap-3 border-y border-amber-400/25 bg-amber-400/[0.04] px-2 py-1.5"
        >
          <div className="min-w-0 leading-tight">
            <div className="font-semibold text-amber-300">Firmware update available</div>
            <div className="mt-0.5 truncate text-[10px] text-zinc-500">
              {installedFirmware ? `${installedFirmware} installed · ` : ''}Settings → Updates
            </div>
          </div>
          <a
            href={`http://${status.controller.address}/`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 focus:outline-none focus:underline"
          >
            Open Pixelblaze
            <ExternalLink size={12} aria-hidden />
          </a>
        </div>
      )}
      <DeckSection label="Pixelblaze" hint={PANEL_HINT}>
        {/* Two columns of unequal height (#consistency): the title moved up, so the
            old row-paired grid no longer lined up. Right column emulates the preview
            deck — the stacked brightness slider over the editable pixel count. Left
            column collects the three read-only one-liners (fps, map points, IP). The
            columns top-align; their differing heights are accepted. */}
        <div className="flex gap-x-4 items-start">
          <div className="flex-1 min-w-0 flex flex-col gap-y-2">
            <DeckTelemetry label="fps" value={fpsLabel} />
            <DeckCell label="map">
              <span
                className={`min-w-0 ${mapCountMismatch ? 'text-amber-400' : 'text-live'}`}
                title={
                  mapCountMismatch
                    ? `Map has ${mapPointsLabel} points but the Controller has ${pixelsLabel} pixels — the firmware silently drops a mismatched map (#204).`
                    : undefined
                }
                data-testid="controller-installed-map"
              >
                <InstalledMapPresentation
                  presentation={installedMapPresentation}
                  className="w-full"
                />
              </span>
            </DeckCell>
            <DeckTelemetry label="IP" value={status.controller.address} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-y-2">
            {/* Stretch the stacked slider to exactly two single-line rows tall
                (h-10 = 16px line + 8px gap + 16px line), label pinned top and track
                pinned bottom, so brightness + pixel count == the left column's three
                one-liners and the two columns bottom-align cleanly (#consistency). */}
            <DeckSlider
              label="brightness"
              ariaLabel="Controller brightness"
              value={brightness}
              min={0}
              max={1}
              step={0.01}
              presentation="percentage"
              curve={2}
              onChange={setBrightness}
              className="h-10 justify-between"
            />
            <DeckCell label="pixel count">
              <ControllerPixelCountInput />
            </DeckCell>
          </div>
        </div>
      </DeckSection>

      {controls.length > 0 && (
        <DeckSection label="pattern controls" hint={controlsHint ?? undefined}>
          <DeckGrid>
            {controls.map((c) =>
              c.kind === 'toggle' ? (
                <DeckCell key={c.name} label={c.label.toLowerCase()}>
                  <input
                    type="checkbox"
                    aria-label={c.name}
                    checked={c.value === 1}
                    onChange={(e) => setControl(c.name, e.target.checked ? 1 : 0)}
                    className="accent-live shrink-0"
                  />
                </DeckCell>
              ) : (
                <DeckSlider
                  key={c.name}
                  label={c.label.toLowerCase()}
                  ariaLabel={c.name}
                  // The device reports a control's drifted bound variable, not its
                  // 0..1 position; an out-of-range value shows as unset (#speed-slider).
                  value={controllerSliderValue(c.value)}
                  min={0}
                  max={1}
                  step={0.01}
                  presentation="percentage"
                  onChange={(v) => setControl(c.name, v)}
                />
              ),
            )}
          </DeckGrid>
        </DeckSection>
      )}

      {powerTelemetry && (
        <DeckSection label="power" hint={POWER_HINT}>
          <DeckGrid gapY="gap-y-1">
            <div className="col-span-2">
              <DeckTelemetry label="duty recent / start" value={powerTelemetry.dutyLabel} />
            </div>
            {powerCapSettings && powerTelemetry.limitValue != null ? (
              <div className="col-span-2">
                <DeckSlider
                  label="duty cap"
                  ariaLabel="Live duty cap"
                  value={powerTelemetry.limitValue}
                  min={0}
                  max={1}
                  step={0.01}
                  presentation="percentage"
                  format={formatDutyCapPercent}
                  onChange={setPowerLimit}
                />
              </div>
            ) : (
              <DeckTelemetry label="duty cap" value={powerTelemetry.limitLabel} />
            )}
            <div className="col-span-2">
              <DeckCell label="limiting">
                <span className="text-live tabular-nums truncate">
                  <span>{powerTelemetry.clippingLabel}</span>
                  <span className="text-zinc-500"> · scaled to </span>
                  <span>{powerTelemetry.scaleLabel}</span>
                </span>
              </DeckCell>
            </div>
            <div className="col-span-2">
              <DeckTelemetry label="est. draw" value={powerTelemetry.estimatedDrawLabel} />
              {powerTelemetry.estimatedDrawAssumptions && (
                <div className="mt-0.5 text-right text-[10px] leading-tight text-zinc-500">
                  {powerTelemetry.estimatedDrawAssumptions}
                </div>
              )}
            </div>
          </DeckGrid>
        </DeckSection>
      )}

      {watchedVars.length > 0 && (
        <DeckSection label="variables" hint={VARS_HINT}>
          <DeckGrid gapY="gap-y-1">
            {watchedVars.map((v) => (
              <DeckTelemetry key={v.name} label={v.name} value={v.value} />
            ))}
          </DeckGrid>
        </DeckSection>
      )}
    </div>
  )
}
