import { Eye, EyeOff } from 'lucide-react'
import { controlIcon } from '@/components/iconScale'
import { usePreviewStore } from '@/store/previewStore'
import type { PixelColor } from '@/engine/zonePreview'

function channelToByte(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function pixelStyle(pixel: PixelColor) {
  const [r, g, b] = pixel.map(channelToByte)
  return { backgroundColor: `rgb(${r}, ${g}, ${b})` }
}

export function ZonePreviewStrips() {
  const strips = usePreviewStore((s) => s.zonePreviewStrips)
  const soloId = usePreviewStore((s) => s.zoneSoloId)
  const setSoloId = usePreviewStore((s) => s.setZoneSoloId)

  if (strips.length === 0) return null

  return (
    <div className="font-mono pl-3 pr-3 py-2 border-t border-zinc-900/80 bg-zinc-950/95">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <h4 className="text-[11px] font-semibold text-structural uppercase tracking-wider">
          Zones
        </h4>
        {soloId && (
          <button
            type="button"
            aria-label="Show all zones"
            title="Show all zones"
            onClick={() => setSoloId(null)}
            className="h-6 px-2 rounded text-[10px] uppercase tracking-wider text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800 transition-colors"
          >
            All
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {strips.map((strip) => {
          const active = strip.id === soloId
          return (
            <div key={strip.id} className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                aria-label={active ? `Unsolo zone ${strip.name}` : `Solo zone ${strip.name}`}
                title={active ? `Unsolo ${strip.name}` : `Solo ${strip.name}`}
                onClick={() => setSoloId(active ? null : strip.id)}
                className={`h-7 w-7 shrink-0 rounded flex items-center justify-center transition-colors ${
                  active
                    ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/50'
                    : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
              >
                {active ? <EyeOff {...controlIcon} /> : <Eye {...controlIcon} />}
              </button>
              <div className="w-24 shrink-0 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: strip.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-[11px] text-zinc-200" title={strip.name}>
                    {strip.name}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500 leading-tight">{strip.pixelCount} px</div>
              </div>
              <div
                className={`grid flex-1 min-w-0 h-5 rounded-sm overflow-hidden border ${
                  active ? 'border-sky-400/60' : 'border-zinc-800'
                }`}
                style={{ gridTemplateColumns: `repeat(${strip.samples.length}, minmax(2px, 1fr))` }}
                aria-hidden="true"
              >
                {strip.samples.map((pixel, index) => (
                  <span
                    key={`${strip.id}-${index}`}
                    data-testid="zone-preview-sample"
                    className="min-w-0"
                    style={pixelStyle(pixel)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
