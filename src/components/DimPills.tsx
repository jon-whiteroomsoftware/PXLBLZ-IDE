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
      className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-structural"
    >
      {label}
    </span>
  )
}
