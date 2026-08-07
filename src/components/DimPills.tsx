// The dimensionality cue shown next to a pattern title — one small pill listing
// every render dimension the pattern defines (e.g. "1, 2, 3D"). Shared so the editor
// title, the preview header, and the controller panel title render it
// identically (#consistency). Pass the dims a pattern source exports via
// `exportedDims`.
export function DimPills({ dims }: { dims: (1 | 2 | 3)[] }) {
  if (dims.length === 0) return null

  const label = `${dims.join(', ')}D`

  return (
    <span
      title={`Supported render dimensions: ${dims.map((dimension) => `${dimension}D`).join(', ')}`}
      className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-400 border border-zinc-700 leading-none"
    >
      {label}
    </span>
  )
}
