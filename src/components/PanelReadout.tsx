import { CircleDot, Clock, Cpu, Droplet, Eye, Gauge, Grid2X2, Hash, Maximize, Rabbit } from 'lucide-react'
import type { PanelReadout as Readout } from '@/engine/previewPanel'
const glyphs = { light: Droplet, diffusion: CircleDot, renderer: Cpu, speed: Rabbit, fps: Gauge, elapsed: Clock, layout: Grid2X2, view: Eye, fit: Maximize, pixels: Hash }
export function PanelReadout({ items }: { items: Readout[] }) {
  return <>{items.map((item, index) => {
    const Glyph = item.glyph && glyphs[item.glyph]
    return <span className="panel-readout-item" key={index}>
      {index > 0 && <span className="panel-readout-dot" aria-hidden>·</span>}
      {Glyph && <Glyph size={10} aria-hidden className="text-zinc-500" />}
      {item.label && <span className="text-zinc-400">{item.label}</span>}
      <span className={item.live ? 'text-live' : ''}>{item.value}</span>
    </span>
  })}</>
}
