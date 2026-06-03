import { useEffect, useSyncExternalStore } from 'react'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { describeControllerPanel } from '@/engine/controllerPanelView'
import { DeckSection, DeckSectionHint, DeckGrid, DeckTelemetry } from '@/components/Deck'
import { DeckSlider } from '@/components/DeckSlider'

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
    intro="Live state read from the connected Pixelblaze. Brightness is sent to the device immediately and is not persisted to flash."
    items={[
      ['pattern', 'the pattern the Controller is currently running'],
      ['fps', 'frame rate the device reports'],
      ['brightness', 'master output level on the device — applied live'],
    ]}
  />
)

export function ControllerPanel() {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )
  const connected = status.kind === 'connected'

  const start = useControllerPanelStore((s) => s.start)
  const stop = useControllerPanelStore((s) => s.stop)
  // Poll only while connected; tear the polling down on disconnect/unmount.
  useEffect(() => {
    if (!connected) return
    start()
    return () => stop()
  }, [connected, start, stop])

  const brightness = useControllerPanelStore((s) => s.brightness)
  const activeProgramId = useControllerPanelStore((s) => s.activeProgramId)
  const programs = useControllerPanelStore((s) => s.programs)
  const fps = useControllerPanelStore((s) => s.fps)
  const setBrightness = useControllerPanelStore((s) => s.setBrightness)

  if (!connected) return null

  const { patternName, fpsLabel } = describeControllerPanel({ activeProgramId, programs, fps })
  // The section header carries the Controller's identity (device name, else its address).
  const label = status.controller.name ?? status.controller.address

  return (
    <div className="font-mono pl-3 text-xs" data-testid="controller-panel">
      <DeckSection label={label} hint={PANEL_HINT}>
        <DeckGrid gapY="gap-y-1" className="mb-2">
          <DeckTelemetry label="pattern" value={patternName} />
          <DeckTelemetry label="fps" value={fpsLabel} />
        </DeckGrid>
        <DeckGrid>
          <DeckSlider
            label="brightness"
            ariaLabel="Controller brightness"
            value={brightness ?? 0}
            min={0}
            max={1}
            step={0.01}
            onChange={setBrightness}
          />
        </DeckGrid>
      </DeckSection>
    </div>
  )
}
