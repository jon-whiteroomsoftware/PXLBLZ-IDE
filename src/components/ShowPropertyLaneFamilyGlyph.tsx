import { Clock3, Italic, Move, RotateCw, Scaling, SlidersHorizontal, Sun, WandSparkles } from 'lucide-react'
import type { ShowPropertyLaneFamily, ShowPropertyLaneGlyph } from '@/engine/showPropertyLaneFamilies'

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

// A transform kind replaces the family glyph with its own (#63); the lane's
// colour still carries the family.
const TRANSFORM_GLYPHS: Record<ShowPropertyLaneGlyph, typeof Clock3> = {
  move: Move,
  rotate: RotateCw,
  scale: Scaling,
  shear: Italic,
}

export function ShowPropertyLaneFamilyGlyph({
  family,
  glyph = null,
  size = 10,
  className = '',
}: {
  family: ShowPropertyLaneFamily
  glyph?: ShowPropertyLaneGlyph | null
  size?: number
  className?: string
}) {
  const Glyph = glyph ? TRANSFORM_GLYPHS[glyph] : FAMILY_GLYPHS[family]
  return (
    <Glyph
      size={size}
      aria-hidden
      className={className}
      data-property-lane-family={family}
      {...(glyph ? { 'data-property-lane-glyph': glyph } : {})}
    />
  )
}
