import { Clock3, Move, SlidersHorizontal, Sun, WandSparkles } from 'lucide-react'
import type { ShowPropertyLaneFamily } from '@/engine/showPropertyLaneFamilies'

// One glyph per property family (#631), shared by the timeline gutter mark and
// the on-lane label so a Pattern control named 'speed' never reads identically
// to a Clip's animation speed.
const FAMILY_GLYPHS: Record<ShowPropertyLaneFamily, typeof Clock3> = {
  time: Clock3,
  appearance: Sun,
  transform: Move,
  control: SlidersHorizontal,
  effect: WandSparkles,
}

export function ShowPropertyLaneFamilyGlyph({
  family,
  size = 10,
  className = '',
}: {
  family: ShowPropertyLaneFamily
  size?: number
  className?: string
}) {
  const Glyph = FAMILY_GLYPHS[family]
  return <Glyph size={size} aria-hidden className={className} data-property-lane-family={family} />
}
