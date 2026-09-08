import { DeckCell, DeckGrid, DeckSection, DeckTelemetry } from './Deck'
import { CompactBrightness } from './CompactBrightness'
import { DeckSlider } from './DeckSlider'
import { DeckSelect } from './DeckSelect'
import { PanelReadout } from './PanelReadout'
import { SHOW_PREVIEW_HINT } from './PreviewDeck'
import { useShowStripSection } from './ShowStripSection'
import { usePreviewStore, MIN_LIGHT_SIZE, MAX_LIGHT_SIZE } from '@/store/previewStore'
import { describeShowPreviewReadout } from '@/engine/showStripPanel'

export function ShowStripPreviewSection() {
  const brightness = usePreviewStore(s => s.brightness)
  const lightSize = usePreviewStore(s => s.lightSize)
  const diffusion = usePreviewStore(s => s.diffusion)
  const fidelity = usePreviewStore(s => s.fidelity)
  const fps = usePreviewStore(s => s.fps)
  const togglePlayback = usePreviewStore(s => s.toggle)
  const [expanded, setExpanded] = useShowStripSection('Preview')
  return <DeckSection previewSpace label="Preview" hint={SHOW_PREVIEW_HINT} summaryRow collapsible expanded={expanded} onExpandedChange={setExpanded}
    actions={<CompactBrightness onSpace={togglePlayback} ariaLabel="Show preview brightness" value={brightness} onChange={value => usePreviewStore.getState().setBrightness(value)} />}
    summary={<PanelReadout items={describeShowPreviewReadout({ lightSize, diffusion, fidelity, fps })} />}
  >
    <DeckGrid>
      <DeckSlider label="light size" ariaLabel="Light size" value={lightSize} min={MIN_LIGHT_SIZE} max={MAX_LIGHT_SIZE} step={0.05} onSpace={togglePlayback} onChange={value => { usePreviewStore.getState().setLightSize(value); usePreviewStore.getState().setLightSizeSticky(value) }} />
      <DeckSlider label="diffusion" ariaLabel="Diffusion" value={diffusion} min={0} max={1} step={0.01} presentation="percentage" onSpace={togglePlayback} onChange={value => { usePreviewStore.getState().setDiffusion(value); usePreviewStore.getState().setDiffusionSticky(value) }} />
      <DeckCell label="renderer"><DeckSelect ariaLabel="Renderer" value={fidelity} options={[{ value: 'fast', label: 'Fast', title: 'Fast (float64, plain JS preview)' }, { value: 'fidelity', label: 'Precise', title: 'Precise (16.16 fixed-point, hardware-accurate)' }]} onChange={value => usePreviewStore.getState().setFidelity(value)} menuWidthClass="w-28" portaled /></DeckCell>
      <DeckTelemetry label="fps" value={fps === null ? '—' : fps.toFixed(1)} />
    </DeckGrid>
  </DeckSection>
}
