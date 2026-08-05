import type { MapDiagnosticViewport } from './mapDiagnosticViewport'

export type MapDiagnosticColor = readonly [number, number, number]

function channel(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
}

export function paintMapDiagnosticCanvas(
  canvas: HTMLCanvasElement,
  viewport: MapDiagnosticViewport,
  colors: readonly MapDiagnosticColor[],
  dimmed = false,
): void {
  if (canvas.width !== viewport.width) canvas.width = viewport.width
  if (canvas.height !== viewport.height) canvas.height = viewport.height
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, viewport.width, viewport.height)
  context.globalCompositeOperation = 'lighter'
  const alpha = dimmed ? 0.22 : 0.9
  const radius = viewport.pointDiameterPx / 2
  for (const point of viewport.points) {
    const color = colors[point.index] ?? [1, 1, 1]
    context.fillStyle = `rgba(${channel(color[0])}, ${channel(color[1])}, ${channel(color[2])}, ${alpha})`
    context.beginPath()
    context.arc(point.x, point.y, radius, 0, Math.PI * 2)
    context.fill()
  }
}
